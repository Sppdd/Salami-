import { addDays, isSameDay, startOfDay } from 'date-fns';
import { CalendarCheck2, Gauge, PhoneOutgoing, Play, Sparkles, Timer } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';
import { api } from '../lib/api';
import { useBusiness } from '../lib/business';
import { seedDemoData } from '../lib/demo';
import { ago, label, modelName, when } from '../lib/format';
import { useHealth, useLiveQuery } from '../lib/hooks';
import { supabase } from '../lib/supabase';
import type { Appointment, AppointmentStatus, Call, CallTurn } from '../lib/types';

const statusOrder: AppointmentStatus[] = ['confirmed', 'rescheduled', 'scheduled', 'needs_followup', 'no_answer', 'cancelled'];
const barColor: Record<AppointmentStatus, string> = {
  confirmed: 'bg-emerald-500',
  rescheduled: 'bg-sky-500',
  scheduled: 'bg-slate-300',
  needs_followup: 'bg-amber-400',
  no_answer: 'bg-zinc-400',
  cancelled: 'bg-rose-500',
};

export function Dashboard() {
  const { business } = useBusiness();
  const health = useHealth();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data } = useLiveQuery(
    'dashboard',
    async () => {
      const from = startOfDay(new Date());
      const [appts, calls, turns] = await Promise.all([
        supabase
          .from('appointments')
          .select('*')
          .gte('starts_at', from.toISOString())
          .lt('starts_at', addDays(from, 8).toISOString())
          .order('starts_at'),
        supabase
          .from('calls')
          .select('*, appointments(client_name, service, starts_at, client_phone)')
          .order('created_at', { ascending: false })
          .limit(12),
        supabase
          .from('call_turns')
          .select('tier, model, latency_ms, created_at')
          .in('role', ['agent', 'system'])
          .not('tier', 'is', null)
          .order('id', { ascending: false })
          .limit(400),
      ]);
      return {
        appts: (appts.data ?? []) as Appointment[],
        calls: (calls.data ?? []) as Call[],
        turns: (turns.data ?? []) as Pick<CallTurn, 'tier' | 'model' | 'latency_ms' | 'created_at'>[],
      };
    },
    [{ table: 'appointments' }, { table: 'calls' }, { table: 'call_turns' }],
  );

  const appts = data?.appts ?? [];
  const calls = data?.calls ?? [];
  const turns = data?.turns ?? [];
  const tomorrow = appts.filter((a) => isSameDay(new Date(a.starts_at), addDays(new Date(), 1)));
  const awaiting = appts.filter((a) => a.status === 'scheduled').length;
  const resolved = appts.filter((a) => a.status !== 'scheduled');
  const kept = resolved.filter((a) => a.status === 'confirmed' || a.status === 'rescheduled').length;
  const callsToday = calls.filter((c) => isSameDay(new Date(c.created_at), new Date())).length;

  const tiers = (['fast', 'smart', 'reasoning'] as const).map((tier) => {
    const rows = turns.filter((t) => t.tier === tier && t.latency_ms !== null);
    const avg = rows.length ? Math.round(rows.reduce((s, r) => s + (r.latency_ms ?? 0), 0) / rows.length) : null;
    return { tier, count: rows.length, avg, model: health?.models[tier] };
  });
  const fastAvg = tiers[0].avg;

  async function loadDemo() {
    if (!business) return;
    setBusy(true);
    try {
      await seedDemoData(business.owner_id);
      setNotice('Loaded 5 demo appointments for tomorrow. Open Appointments and press “Simulate” to talk to the agent.');
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runReminders() {
    setBusy(true);
    try {
      const res = await api.runCampaign();
      setNotice(res.queued ? `Calling ${res.queued} client(s) for ${res.date}. Watch the live feed.` : `Nothing to call for ${res.date}.`);
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}`}
        subtitle={`${business?.agent_name ?? 'Your agent'} is ready to confirm appointments for ${business?.name ?? 'your business'}.`}
        actions={
          <>
            <button className="btn-ghost" onClick={loadDemo} disabled={busy || !business}>
              <Sparkles className="h-4 w-4" /> Load demo day
            </button>
            <button
              className="btn-accent"
              onClick={runReminders}
              disabled={busy || !health?.twilio}
              title={health?.twilio ? 'Call every unconfirmed client with an appointment tomorrow' : 'Needs Twilio credentials on the server'}
            >
              <Play className="h-4 w-4" /> Call tomorrow's clients
            </button>
          </>
        }
      />

      {notice && (
        <div className="mb-6 flex items-start justify-between gap-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          {notice}
          <button onClick={() => setNotice(null)} className="text-sky-600 hover:text-sky-900">Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={CalendarCheck2} label="Next 7 days" value={appts.length} hint={`${awaiting} awaiting confirmation`} />
        <Kpi
          icon={Gauge}
          label="Kept rate"
          value={resolved.length ? `${Math.round((kept / resolved.length) * 100)}%` : '—'}
          hint={`${kept} of ${resolved.length} resolved kept or rebooked`}
        />
        <Kpi icon={PhoneOutgoing} label="Calls today" value={callsToday} hint={`${calls.filter((c) => c.status === 'in_progress').length} live now`} />
        <Kpi icon={Timer} label="Live reply latency" value={fastAvg !== null ? `${(fastAvg / 1000).toFixed(2)}s` : '—'} hint="Nemotron fast tier, average" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="card p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Tomorrow at a glance</h2>
            <Link to="/appointments" className="text-sm text-slate-500 hover:text-slate-900">View all →</Link>
          </div>
          {tomorrow.length ? (
            <>
              <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
                {statusOrder.map((s) => {
                  const n = tomorrow.filter((a) => a.status === s).length;
                  return n ? <div key={s} className={barColor[s]} style={{ width: `${(n / tomorrow.length) * 100}%` }} title={`${label(s)}: ${n}`} /> : null;
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {statusOrder.map((s) => (
                  <span key={s} className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${barColor[s]}`} />
                    {label(s)} · {tomorrow.filter((a) => a.status === s).length}
                  </span>
                ))}
              </div>
              <ul className="mt-4 divide-y divide-slate-100">
                {tomorrow.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-4 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{a.client_name}</div>
                      <div className="truncate text-xs text-slate-500">
                        {when(a.starts_at)} · {a.service}
                      </div>
                    </div>
                    <StatusBadge value={a.status} />
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Empty text="No appointments tomorrow yet. Import a CSV or load the demo day." />
          )}
        </section>

        <section className="card p-5">
          <h2 className="mb-1 font-semibold">Nemotron model routing</h2>
          <p className="mb-4 text-xs text-slate-500">Recent agent turns by tier on Nebius Token Factory</p>
          <ul className="space-y-3">
            {tiers.map((t) => (
              <li key={t.tier} className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-center justify-between">
                  <StatusBadge value={t.tier} />
                  <span className="text-xs text-slate-500">{t.count} calls to model</span>
                </div>
                <div className="mt-2 truncate text-sm font-medium" title={t.model}>{modelName(t.model)}</div>
                <div className="text-xs text-slate-500">
                  {t.tier === 'fast' && 'Every live conversational turn'}
                  {t.tier === 'smart' && 'Escalations: reschedules, complaints, bad output'}
                  {t.tier === 'reasoning' && 'Post-call audit & business insights'}
                  {t.avg !== null && ` · avg ${(t.avg / 1000).toFixed(2)}s`}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="card mt-6">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold">Live call feed</h2>
          <Link to="/calls" className="text-sm text-slate-500 hover:text-slate-900">History →</Link>
        </div>
        {calls.length ? (
          <ul className="divide-y divide-slate-100">
            {calls.map((c) => (
              <li key={c.id}>
                <Link to={`/calls/${c.id}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {c.appointments?.client_name ?? 'Unknown'}{' '}
                      <span className="font-normal text-slate-400">· {c.channel === 'web' ? 'browser' : 'phone'} · {ago(c.created_at)}</span>
                    </div>
                    <div className="truncate text-xs text-slate-500">{c.summary ?? c.appointments?.service}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {c.outcome && <StatusBadge value={c.outcome} />}
                    <StatusBadge value={c.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-5">
            <Empty text="No calls yet. Start one from Appointments." />
          </div>
        )}
      </section>
    </>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: typeof Gauge; label: string; value: string | number; hint: string }) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">{text}</div>;
}
