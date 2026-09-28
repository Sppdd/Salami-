import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeOpenSlots, matchSlot } from './slots.js';

const hours = { timezone: 'America/New_York', opening_hour: 9, closing_hour: 17, slot_minutes: 30 };
// Monday 2026-09-28 08:00 New York
const now = new Date('2026-09-28T12:00:00Z');

test('slots are inside business hours, skip Sundays, and respect the cap', () => {
  const slots = computeOpenSlots({ now, hours, busy: [], durationMinutes: 30, max: 12 });
  assert.equal(slots.length, 12);
  for (const s of slots) {
    const local = new Date(s.iso).toLocaleString('en-US', { timeZone: hours.timezone, hour: 'numeric', hour12: false, weekday: 'short' });
    assert.ok(!local.startsWith('Sun'), `no Sunday slots: ${local}`);
    const hour = Number(local.split(' ').pop());
    assert.ok(hour >= 9 && hour < 17, `slot inside hours: ${local}`);
  }
  // Spread across days: at most 3 per day.
  const perDay = new Map<string, number>();
  for (const s of slots) perDay.set(s.iso.slice(0, 10), (perDay.get(s.iso.slice(0, 10)) ?? 0) + 1);
  assert.ok([...perDay.values()].every((n) => n <= 3));
});

test('slots never overlap existing appointments and need 2h notice', () => {
  const busy = [{ starts_at: '2026-09-28T14:00:00Z', duration_minutes: 480 }]; // blocks Monday 10:00–18:00 NY
  const slots = computeOpenSlots({ now, hours, busy, durationMinutes: 30 });
  for (const s of slots) {
    const t = new Date(s.iso).getTime();
    assert.ok(t >= now.getTime() + 2 * 3600_000);
    assert.ok(t + 30 * 60_000 <= Date.parse('2026-09-28T14:00:00Z') || t >= Date.parse('2026-09-28T22:00:00Z'));
  }
});

test('matchSlot only accepts offered times', () => {
  const slots = computeOpenSlots({ now, hours, busy: [], durationMinutes: 30 });
  assert.equal(matchSlot(slots[0].iso, slots)?.iso, slots[0].iso);
  assert.equal(matchSlot('2030-01-01T00:00:00Z', slots), null);
  assert.equal(matchSlot('not a date', slots), null);
  assert.equal(matchSlot(null, slots), null);
});
