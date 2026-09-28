import { addDays, addMinutes } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export type Slot = { iso: string; label: string };

type Hours = { timezone: string; opening_hour: number; closing_hour: number; slot_minutes: number };
type Busy = { starts_at: string; duration_minutes: number };

/**
 * Open reschedule slots in business-local working hours (Mon–Sat), skipping the past
 * and anything overlapping an existing non-cancelled appointment. Pure, so the agent
 * can only ever offer times the calendar actually has.
 */
export function computeOpenSlots(opts: {
  now: Date;
  hours: Hours;
  busy: Busy[];
  durationMinutes: number;
  days?: number;
  max?: number;
  excludeAppointmentStart?: string;
}): Slot[] {
  const { now, hours, busy, durationMinutes } = opts;
  const days = opts.days ?? 7;
  const max = opts.max ?? 12;
  const busyRanges = busy
    .filter((b) => b.starts_at !== opts.excludeAppointmentStart)
    .map((b) => {
      const start = new Date(b.starts_at).getTime();
      return [start, start + b.duration_minutes * 60_000] as const;
    });

  const slots: Slot[] = [];
  const earliest = now.getTime() + 2 * 60 * 60_000; // at least 2h notice
  for (let d = 0; d <= days && slots.length < max; d++) {
    const localDay = formatInTimeZone(addDays(now, d), hours.timezone, 'yyyy-MM-dd');
    const weekday = Number(formatInTimeZone(fromZonedTime(`${localDay}T12:00:00`, hours.timezone), hours.timezone, 'i'));
    if (weekday === 7) continue; // closed Sundays

    const dayStart = fromZonedTime(`${localDay}T${String(hours.opening_hour).padStart(2, '0')}:00:00`, hours.timezone);
    const dayEnd = hours.closing_hour >= 24
      ? fromZonedTime(`${localDay}T23:59:59`, hours.timezone)
      : fromZonedTime(`${localDay}T${String(hours.closing_hour).padStart(2, '0')}:00:00`, hours.timezone);

    const daySlots: Slot[] = [];
    for (let t = dayStart; addMinutes(t, durationMinutes) <= dayEnd; t = addMinutes(t, hours.slot_minutes)) {
      const start = t.getTime();
      const end = start + durationMinutes * 60_000;
      if (start < earliest) continue;
      if (busyRanges.some(([bs, be]) => start < be && end > bs)) continue;
      daySlots.push({ iso: t.toISOString(), label: formatInTimeZone(t, hours.timezone, "EEEE MMMM d 'at' h:mm a") });
    }
    // Offer a morning / midday / afternoon mix per day rather than 12 back-to-back slots.
    for (const s of evenlySpaced(daySlots, perDay)) {
      if (slots.length < max) slots.push(s);
    }
  }
  return slots;
}

const perDay = 3;

function evenlySpaced<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  const step = (items.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => items[Math.round(i * step)]);
}

export function formatLocal(iso: string, timezone: string): string {
  return formatInTimeZone(new Date(iso), timezone, "EEEE, MMMM d 'at' h:mm a");
}

export function localDateKey(iso: string | Date, timezone: string): string {
  return formatInTimeZone(typeof iso === 'string' ? new Date(iso) : iso, timezone, 'yyyy-MM-dd');
}

/** Match a model-proposed time to one of the offered slots (exact or within 1 minute). */
export function matchSlot(proposed: string | null | undefined, slots: Slot[]): Slot | null {
  if (!proposed) return null;
  const t = new Date(proposed).getTime();
  if (Number.isNaN(t)) return null;
  return slots.find((s) => Math.abs(new Date(s.iso).getTime() - t) < 60_000) ?? null;
}
