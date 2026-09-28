import { addDays } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { db, getCall, getOrCreateBusiness, type Appointment } from '../db.js';
import { env } from '../env.js';
import { startPhoneCall } from './calls.js';

const TERMINAL = new Set(['completed', 'failed', 'no_answer', 'busy', 'transferred']);
const running = new Set<string>();

export type CampaignResult = { date: string; queued: number; appointmentIds: string[] };

/** Scheduled (unconfirmed) appointments on a business-local calendar day. */
export async function dueAppointments(ownerId: string, timezone: string, dateKey: string): Promise<Appointment[]> {
  const from = fromZonedTime(`${dateKey}T00:00:00`, timezone).toISOString();
  const to = fromZonedTime(`${dateKey}T23:59:59`, timezone).toISOString();
  const res = await db
    .from('appointments')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('status', 'scheduled')
    .gte('starts_at', from)
    .lte('starts_at', to)
    .order('starts_at');
  if (res.error) throw new Error(`load due appointments: ${res.error.message}`);
  return (res.data ?? []) as Appointment[];
}

export function tomorrowKey(timezone: string, now = new Date()): string {
  return formatInTimeZone(addDays(now, 1), timezone, 'yyyy-MM-dd');
}

/**
 * Call every unconfirmed client for a day, at most CAMPAIGN_CONCURRENCY live calls at a
 * time. Runs in the background; progress streams to the dashboard via Supabase Realtime.
 */
export async function runCampaign(ownerId: string, dateKey?: string): Promise<CampaignResult & { done: Promise<void> }> {
  if (running.has(ownerId)) throw Object.assign(new Error('A reminder campaign is already running'), { statusCode: 409 });
  const business = await getOrCreateBusiness(ownerId);
  const date = dateKey ?? tomorrowKey(business.timezone);
  const due = await dueAppointments(ownerId, business.timezone, date);

  running.add(ownerId);
  const queue = [...due];
  const worker = async () => {
    for (let appt = queue.shift(); appt; appt = queue.shift()) {
      try {
        const call = await startPhoneCall(ownerId, appt.id);
        await waitForCall(call.id);
      } catch (err) {
        console.error(`[campaign] ${appt.client_name}:`, (err as Error).message);
      }
    }
  };
  const done = Promise.all(Array.from({ length: Math.min(env.CAMPAIGN_CONCURRENCY, queue.length) }, worker))
    .then(() => undefined)
    .finally(() => running.delete(ownerId));

  return { date, queued: due.length, appointmentIds: due.map((a) => a.id), done };
}

async function waitForCall(callId: string, timeoutMs = 10 * 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const call = await getCall(callId);
    if (!call || TERMINAL.has(call.status)) return;
  }
}
