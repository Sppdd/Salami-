import { addDays, setHours, setMinutes, startOfDay } from 'date-fns';
import { supabase } from './supabase';

const people: [string, string, string, string | null, string | null][] = [
  ['Maria Lopez', 'Dental cleaning', 'Dr. Chen', 'Prefers morning appointments', '09:30'],
  ['James Carter', 'Root canal consultation', 'Dr. Chen', 'Anxious about procedures; be reassuring', '11:00'],
  ['Aisha Khan', 'Teeth whitening', 'Dr. Patel', null, '13:30'],
  ['Tom Becker', 'Annual check-up', 'Dr. Patel', 'Rescheduled twice last quarter', '15:00'],
  ['Sofia Rossi', 'Orthodontic adjustment', 'Dr. Chen', 'Teenager; parent is the contact', '16:30'],
];

/** Seed a realistic day of appointments for tomorrow (fictional 555 numbers). */
export async function seedDemoData(ownerId: string) {
  const tomorrow = startOfDay(addDays(new Date(), 1));
  const rows = people.map(([client_name, service, provider, notes, time], i) => {
    const [h, m] = (time ?? '10:00').split(':').map(Number);
    return {
      owner_id: ownerId,
      client_name,
      client_phone: `+1415555010${i + 1}`,
      service,
      provider,
      notes,
      starts_at: setMinutes(setHours(tomorrow, h), m).toISOString(),
      duration_minutes: i === 1 ? 60 : 30,
    };
  });
  const { error } = await supabase.from('appointments').insert(rows);
  if (error) throw new Error(error.message);
}
