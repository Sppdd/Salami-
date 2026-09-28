import { format, formatDistanceToNow, isToday, isTomorrow } from 'date-fns';

export function when(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return `Today, ${format(d, 'h:mm a')}`;
  if (isTomorrow(d)) return `Tomorrow, ${format(d, 'h:mm a')}`;
  return format(d, 'EEE, MMM d · h:mm a');
}

export function ago(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

export function duration(seconds: number | null | undefined): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m ? `${m}m ${s}s` : `${s}s`;
}

export function label(value: string | null | undefined): string {
  if (!value) return '—';
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** Short, human model name from a Token Factory model id. */
export function modelName(id: string | null | undefined): string {
  if (!id) return '—';
  return id.split('/').pop() ?? id;
}
