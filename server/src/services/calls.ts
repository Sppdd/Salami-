import { addDays } from 'date-fns';
import { analyzeCall, type CallAnalysis } from '../agent/analysis.js';
import { agentTurn, greeting, type AgentTurn } from '../agent/conversation.js';
import { computeOpenSlots, type Slot } from '../agent/slots.js';
import { normalizePhone } from '../agent/text.js';
import {
  addTurn,
  db,
  getAppointment,
  getCall,
  getOrCreateBusiness,
  listBusyAppointments,
  listTurns,
  updateAppointment,
  updateCall,
  type Appointment,
  type AppointmentStatus,
  type Business,
  type Call,
  type CallStatus,
} from '../db.js';
import { placeOutboundCall } from './twilio.js';

export class HttpError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

export async function openSlots(business: Business, appt: Appointment, now = new Date()): Promise<Slot[]> {
  const busy = await listBusyAppointments(business.owner_id, now.toISOString(), addDays(now, 9).toISOString());
  return computeOpenSlots({
    now,
    hours: business,
    busy: busy.filter((b) => b.id !== appt.id),
    durationMinutes: appt.duration_minutes,
  });
}

async function createCall(ownerId: string, appt: Appointment, channel: Call['channel'], status: CallStatus): Promise<Call> {
  const res = await db
    .from('calls')
    .insert({
      owner_id: ownerId,
      appointment_id: appt.id,
      channel,
      status,
      started_at: status === 'in_progress' ? new Date().toISOString() : null,
    })
    .select('*')
    .single();
  if (res.error) throw new Error(`create call: ${res.error.message}`);
  await updateAppointment(appt.id, { last_call_id: res.data.id });
  return res.data as Call;
}

async function loadAppointmentOrThrow(ownerId: string, appointmentId: string) {
  const appt = await getAppointment(ownerId, appointmentId);
  if (!appt) throw new HttpError(404, 'Appointment not found');
  return appt;
}

/** Browser call simulator: same agent, same tiers, microphone instead of a phone line. */
export async function startWebCall(ownerId: string, appointmentId: string) {
  const [business, appt] = await Promise.all([getOrCreateBusiness(ownerId), loadAppointmentOrThrow(ownerId, appointmentId)]);
  const call = await createCall(ownerId, appt, 'web', 'in_progress');
  const opening = greeting(business, appt);
  await addTurn(call, { role: 'agent', content: opening.say, model: opening.model, tier: opening.tier, latency_ms: 0 });
  return { call, greeting: opening };
}

export async function startPhoneCall(ownerId: string, appointmentId: string): Promise<Call> {
  const appt = await loadAppointmentOrThrow(ownerId, appointmentId);
  const to = normalizePhone(appt.client_phone);
  if (!to) throw new HttpError(400, `Invalid phone number for ${appt.client_name}: ${appt.client_phone}`);
  const call = await createCall(ownerId, appt, 'phone', 'queued');
  try {
    const sid = await placeOutboundCall(call.id, to);
    await updateCall(call.id, { twilio_call_sid: sid });
    return { ...call, twilio_call_sid: sid };
  } catch (err) {
    await updateCall(call.id, { status: 'failed', ended_at: new Date().toISOString(), summary: (err as Error).message });
    throw new HttpError(502, `Twilio could not place the call: ${(err as Error).message}`);
  }
}

/** Load everything a turn needs. Stateless: the transcript in Postgres is the conversation state. */
export async function callContext(call: Call) {
  if (!call.appointment_id) throw new HttpError(409, 'Call has no appointment');
  const [business, appt, turns] = await Promise.all([
    getOrCreateBusiness(call.owner_id),
    getAppointment(call.owner_id, call.appointment_id),
    listTurns(call.id),
  ]);
  if (!appt) throw new HttpError(404, 'Appointment not found');
  return { business, appt, turns };
}

export async function recordAgentLine(call: Call, turn: AgentTurn) {
  await addTurn(call, {
    role: 'agent',
    content: turn.say,
    model: turn.model,
    tier: turn.escalated ? 'smart' : turn.tier,
    latency_ms: turn.latencyMs,
  });
}

export async function respondToClient(call: Call, text: string): Promise<AgentTurn> {
  const { business, appt, turns } = await callContext(call);
  await addTurn(call, { role: 'client', content: text });
  const slots = await openSlots(business, appt);
  const turn = await agentTurn(business, appt, [...turns, { role: 'client', content: text }], slots);
  await recordAgentLine(call, turn);
  return turn;
}

const outcomeToStatus: Record<CallAnalysis['outcome'], AppointmentStatus> = {
  confirmed: 'confirmed',
  rescheduled: 'rescheduled',
  cancelled: 'cancelled',
  needs_followup: 'needs_followup',
  no_answer: 'no_answer',
  voicemail: 'no_answer',
};

/**
 * End a call exactly once and run the reasoning-tier analysis. The conditional update acts
 * as a lock so Twilio's status callback and a manual hang-up can't both analyze.
 */
export async function finishCall(
  callId: string,
  opts: { finalStatus?: CallStatus; durationSeconds?: number } = {},
): Promise<void> {
  const endedAt = new Date().toISOString();
  const locked = await db
    .from('calls')
    .update({ status: 'analyzing', ended_at: endedAt })
    .eq('id', callId)
    .is('ended_at', null)
    .select('*');
  if (locked.error) throw new Error(`lock call: ${locked.error.message}`);
  const call = locked.data?.[0] as Call | undefined;
  if (!call) return; // already finished elsewhere

  const duration =
    opts.durationSeconds ??
    (call.started_at ? Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(call.started_at)) / 1000)) : 0);

  if (opts.finalStatus && ['no_answer', 'busy', 'failed'].includes(opts.finalStatus)) {
    await updateCall(callId, { status: opts.finalStatus, duration_seconds: duration, outcome: 'no_answer' });
    if (call.appointment_id) await updateAppointment(call.appointment_id, { status: 'no_answer' });
    return;
  }

  try {
    const { business, appt, turns } = await callContext(call);
    const spoke = turns.some((t) => t.role === 'client');
    if (!spoke) {
      await updateCall(callId, { status: 'completed', duration_seconds: duration, outcome: 'no_answer', summary: 'The client did not respond.' });
      await updateAppointment(appt.id, { status: 'no_answer' });
      return;
    }
    const slots = await openSlots(business, appt, call.started_at ? new Date(call.started_at) : new Date());
    const analysis = await analyzeCall(business, appt, turns, slots);
    await updateCall(callId, {
      status: opts.finalStatus === 'transferred' ? 'transferred' : 'completed',
      duration_seconds: duration,
      outcome: analysis.outcome,
      sentiment: analysis.sentiment,
      summary: analysis.summary,
      analysis,
    });
    const patch: Partial<Appointment> = { status: outcomeToStatus[analysis.outcome] };
    if (analysis.outcome === 'rescheduled' && analysis.rescheduled_to) {
      patch.rescheduled_from = appt.starts_at;
      patch.starts_at = analysis.rescheduled_to;
    }
    await updateAppointment(appt.id, patch);
    await addTurn(call, { role: 'system', content: `Outcome: ${analysis.outcome}. ${analysis.summary}`, model: analysis.model, tier: 'reasoning', latency_ms: analysis.latency_ms });
  } catch (err) {
    console.error('[calls] analysis failed:', err);
    await updateCall(callId, {
      status: 'completed',
      duration_seconds: duration,
      outcome: 'needs_followup',
      summary: `Automatic analysis failed; please review the transcript. (${(err as Error).message.slice(0, 160)})`,
    });
    if (call.appointment_id) await updateAppointment(call.appointment_id, { status: 'needs_followup' });
  }
}

export async function getOwnedCall(ownerId: string, callId: string): Promise<Call> {
  const call = await getCall(callId);
  if (!call || call.owner_id !== ownerId) throw new HttpError(404, 'Call not found');
  return call;
}
