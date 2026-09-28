import { label } from '../lib/format';

const styles: Record<string, string> = {
  scheduled: 'bg-slate-100 text-slate-700 ring-slate-200',
  confirmed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rescheduled: 'bg-sky-50 text-sky-700 ring-sky-200',
  cancelled: 'bg-rose-50 text-rose-700 ring-rose-200',
  needs_followup: 'bg-amber-50 text-amber-800 ring-amber-200',
  no_answer: 'bg-zinc-100 text-zinc-600 ring-zinc-200',
  voicemail: 'bg-zinc-100 text-zinc-600 ring-zinc-200',
  queued: 'bg-slate-100 text-slate-600 ring-slate-200',
  ringing: 'bg-violet-50 text-violet-700 ring-violet-200',
  in_progress: 'bg-lime-50 text-lime-800 ring-lime-300',
  analyzing: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  failed: 'bg-rose-50 text-rose-700 ring-rose-200',
  busy: 'bg-orange-50 text-orange-700 ring-orange-200',
  transferred: 'bg-sky-50 text-sky-700 ring-sky-200',
  positive: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
  negative: 'bg-rose-50 text-rose-700 ring-rose-200',
  fast: 'bg-lime-50 text-lime-800 ring-lime-300',
  smart: 'bg-sky-50 text-sky-700 ring-sky-200',
  reasoning: 'bg-violet-50 text-violet-700 ring-violet-200',
  template: 'bg-slate-100 text-slate-500 ring-slate-200',
};

const live = new Set(['ringing', 'in_progress', 'analyzing']);

export function StatusBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-slate-400">—</span>;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${styles[value] ?? styles.scheduled}`}
    >
      {live.has(value) && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {label(value)}
    </span>
  );
}
