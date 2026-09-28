import { AlertTriangle, BrainCircuit, Lightbulb, Loader2, MessageSquareQuote, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '../components/Layout';
import { api } from '../lib/api';
import { ago, modelName } from '../lib/format';
import { useLiveQuery } from '../lib/hooks';
import { supabase } from '../lib/supabase';
import type { InsightReport } from '../lib/types';
import { Empty } from './Dashboard';

const impactStyle = {
  high: 'bg-rose-50 text-rose-700 ring-rose-200',
  medium: 'bg-amber-50 text-amber-800 ring-amber-200',
  low: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export function Insights() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const { data, refresh } = useLiveQuery(
    'insights',
    async () => {
      const res = await supabase.from('insight_reports').select('*').order('created_at', { ascending: false }).limit(10);
      if (res.error) throw new Error(res.error.message);
      return res.data as InsightReport[];
    },
    [],
  );
  const reports = data ?? [];
  const current = reports.find((r) => r.id === selected) ?? reports[0];

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.insights();
      await refresh();
      setSelected(r.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Insights"
        subtitle="Nemotron's reasoning tier reads across your recent calls to explain why clients cancel and what to change."
        actions={
          <button className="btn-accent" onClick={generate} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
            {busy ? 'Reasoning over your calls…' : 'Generate report'}
          </button>
        }
      />
      {error && <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      {current ? (
        <div className="space-y-6">
          <div className="card bg-slate-950 p-6 text-white">
            <div className="text-xs uppercase tracking-wide text-brand-600">
              {current.calls_analyzed} calls · {modelName(current.model)} · {ago(current.created_at)}
            </div>
            <h2 className="mt-2 text-xl font-semibold">{current.report.headline}</h2>
            {current.report.highlights.length > 0 && (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {current.report.highlights.map((h) => (
                  <li key={h} className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200">{h}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Section icon={TrendingUp} title="Patterns">
              {current.report.patterns.map((p) => (
                <div key={p.title}>
                  <div className="text-sm font-medium">{p.title}</div>
                  <p className="text-sm text-slate-600">{p.detail}</p>
                </div>
              ))}
            </Section>
            <Section icon={Lightbulb} title="Recommendations">
              {current.report.recommendations.map((r) => (
                <div key={r.title}>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {r.title}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset ${impactStyle[r.impact] ?? impactStyle.low}`}>{r.impact} impact</span>
                  </div>
                  <p className="text-sm text-slate-600">{r.detail}</p>
                </div>
              ))}
            </Section>
            <Section icon={AlertTriangle} title="At-risk clients">
              {current.report.at_risk.length ? (
                current.report.at_risk.map((a) => (
                  <div key={a.client + a.reason} className="text-sm">
                    <span className="font-medium">{a.client}</span> <span className="text-slate-600">· {a.reason}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">None flagged.</p>
              )}
            </Section>
            <Section icon={MessageSquareQuote} title="Agent script suggestions">
              {current.report.script_suggestions.map((s) => (
                <p key={s} className="rounded-lg bg-slate-50 px-3 py-2 text-sm italic text-slate-700">“{s}”</p>
              ))}
            </Section>
          </div>

          {reports.length > 1 && (
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="text-slate-500">Earlier reports:</span>
              {reports.map((r) => (
                <button key={r.id} onClick={() => setSelected(r.id)} className={`rounded-full px-3 py-1 ${r.id === current.id ? 'bg-slate-900 text-white' : 'bg-white ring-1 ring-slate-200'}`}>
                  {ago(r.created_at)}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <Empty text="No reports yet. Run a few calls, then generate your first report." />
      )}
    </>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Lightbulb; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h3 className="mb-4 flex items-center gap-2 font-semibold">
        <Icon className="h-4 w-4 text-slate-400" /> {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
