import Papa from 'papaparse';
import type { Appointment } from './types';

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type ImportedAppointment = Pick<
  Appointment,
  'client_name' | 'client_phone' | 'service' | 'provider' | 'starts_at' | 'duration_minutes' | 'notes'
>;

const aliases: Record<keyof ImportedAppointment, string[]> = {
  client_name: ['client_name', 'name', 'client', 'patient', 'customer', 'full_name'],
  client_phone: ['client_phone', 'phone', 'phone_number', 'mobile', 'cell'],
  service: ['service', 'appointment_type', 'type', 'reason'],
  provider: ['provider', 'staff', 'doctor', 'stylist', 'with'],
  starts_at: ['starts_at', 'start', 'datetime', 'appointment_time', 'time'],
  duration_minutes: ['duration_minutes', 'duration', 'length'],
  notes: ['notes', 'note', 'comments'],
};

function pick(row: Record<string, string>, key: keyof ImportedAppointment): string {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k.trim().toLowerCase().replace(/[\s-]+/g, '_'), v]),
  );
  for (const alias of aliases[key]) {
    if (normalized[alias]?.trim()) return normalized[alias].trim();
  }
  return '';
}

/** Parse a CSV of appointments. Accepts common column names; date + time may be split. */
export function parseAppointmentsCsv(file: File): Promise<{ rows: ImportedAppointment[]; errors: string[] }> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => {
        const rows: ImportedAppointment[] = [];
        const errors: string[] = [];
        data.forEach((row, i) => {
          let startRaw = pick(row, 'starts_at');
          const date = row.date ?? row.Date;
          if (date && startRaw && !startRaw.includes('-') && !startRaw.includes('/')) startRaw = `${date} ${startRaw}`;
          else if (date && !startRaw) startRaw = date;
          const start = new Date(startRaw);
          const name = pick(row, 'client_name');
          const phone = pick(row, 'client_phone');
          if (!name || !phone || Number.isNaN(start.getTime())) {
            errors.push(`Row ${i + 2}: needs a name, phone and valid date/time`);
            return;
          }
          rows.push({
            client_name: name,
            client_phone: phone,
            service: pick(row, 'service') || 'Appointment',
            provider: pick(row, 'provider') || null,
            starts_at: start.toISOString(),
            duration_minutes: Number(pick(row, 'duration_minutes')) || 30,
            notes: pick(row, 'notes') || null,
          });
        });
        resolve({ rows, errors });
      },
    });
  });
}

export const sampleCsv = `client_name,client_phone,service,provider,starts_at,duration_minutes,notes
Maria Lopez,+14155550101,Dental cleaning,Dr. Chen,2026-10-01T10:00:00-04:00,45,Prefers mornings
James Carter,+14155550102,Root canal consult,Dr. Chen,2026-10-01T14:30:00-04:00,60,
`;
