import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

/** Service-role client. Server-only: bypasses RLS, so every query must filter by owner_id. */
export const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type Business = {
  id: string;
  owner_id: string;
  name: string;
  business_type: string;
  timezone: string;
  agent_name: string;
  agent_persona: string;
  policies: string;
  opening_hour: number;
  closing_hour: number;
  slot_minutes: number;
  front_desk_phone: string | null;
};

export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'rescheduled'
  | 'cancelled'
  | 'needs_followup'
  | 'no_answer';

export type Appointment = {
  id: string;
  owner_id: string;
  client_name: string;
  client_phone: string;
  service: string;
  provider: string | null;
  starts_at: string;
  duration_minutes: number;
  notes: string | null;
  status: AppointmentStatus;
  rescheduled_from: string | null;
  last_call_id: string | null;
};

export type CallStatus =
  | 'queued'
  | 'ringing'
  | 'in_progress'
  | 'analyzing'
  | 'completed'
  | 'failed'
  | 'no_answer'
  | 'busy'
  | 'transferred';

export type Call = {
  id: string;
  owner_id: string;
  appointment_id: string | null;
  channel: 'phone' | 'web';
  twilio_call_sid: string | null;
  status: CallStatus;
  outcome: string | null;
  sentiment: string | null;
  summary: string | null;
  analysis: unknown;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  created_at: string;
};

export type CallTurn = {
  id: number;
  call_id: string;
  role: 'agent' | 'client' | 'system';
  content: string;
  model: string | null;
  tier: string | null;
  latency_ms: number | null;
  created_at: string;
};

function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  if (res.data === null) throw new Error(`${what}: not found`);
  return res.data;
}

export async function getOrCreateBusiness(ownerId: string): Promise<Business> {
  const existing = await db.from('businesses').select('*').eq('owner_id', ownerId).maybeSingle();
  if (existing.error) throw new Error(`load business: ${existing.error.message}`);
  if (existing.data) return existing.data as Business;
  const created = await db
    .from('businesses')
    .upsert({ owner_id: ownerId }, { onConflict: 'owner_id' })
    .select('*')
    .single();
  return must(created, 'create business') as Business;
}

export async function getAppointment(ownerId: string, id: string): Promise<Appointment | null> {
  const res = await db.from('appointments').select('*').eq('owner_id', ownerId).eq('id', id).maybeSingle();
  if (res.error) throw new Error(`load appointment: ${res.error.message}`);
  return res.data as Appointment | null;
}

export async function getCall(id: string): Promise<Call | null> {
  const res = await db.from('calls').select('*').eq('id', id).maybeSingle();
  if (res.error) throw new Error(`load call: ${res.error.message}`);
  return res.data as Call | null;
}

export async function updateCall(id: string, patch: Partial<Call>): Promise<void> {
  const res = await db.from('calls').update(patch).eq('id', id);
  if (res.error) throw new Error(`update call: ${res.error.message}`);
}

export async function updateAppointment(id: string, patch: Partial<Appointment>): Promise<void> {
  const res = await db.from('appointments').update(patch).eq('id', id);
  if (res.error) throw new Error(`update appointment: ${res.error.message}`);
}

export async function listTurns(callId: string): Promise<CallTurn[]> {
  const res = await db.from('call_turns').select('*').eq('call_id', callId).order('id', { ascending: true });
  if (res.error) throw new Error(`load turns: ${res.error.message}`);
  return (res.data ?? []) as CallTurn[];
}

export async function addTurn(
  call: Pick<Call, 'id' | 'owner_id'>,
  turn: Pick<CallTurn, 'role' | 'content'> & Partial<Pick<CallTurn, 'model' | 'tier' | 'latency_ms'>>,
): Promise<void> {
  const res = await db.from('call_turns').insert({ call_id: call.id, owner_id: call.owner_id, ...turn });
  if (res.error) throw new Error(`insert turn: ${res.error.message}`);
}

/** Appointments that block slots when proposing reschedule times. */
export async function listBusyAppointments(ownerId: string, fromIso: string, toIso: string) {
  const res = await db
    .from('appointments')
    .select('id, starts_at, duration_minutes')
    .eq('owner_id', ownerId)
    .neq('status', 'cancelled')
    .gte('starts_at', fromIso)
    .lte('starts_at', toIso);
  if (res.error) throw new Error(`load busy appointments: ${res.error.message}`);
  return (res.data ?? []) as Pick<Appointment, 'id' | 'starts_at' | 'duration_minutes'>[];
}
