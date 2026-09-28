import { format } from 'date-fns';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';
import { downloadCsv } from '../lib/csv';
import { ago, duration, label } from '../lib/format';
import { useLiveQuery } from '../lib/hooks';
import { supabase } from '../lib/supabase';
import type { Call } from '../lib/types';
import { Empty } from './Dashboard';

const outcomes = ['confirmed', 'rescheduled', 'cancelled', 'needs_followup', 'no_answer', 'voicemail'];

export function Calls() {
  const navigate = useNavigate();
  const [outcome, setOutcome] = useState('');
  const { data } = useLiveQuery(
    'calls',
    async () => {
      const res = await supabase
        .from('calls')
        .select('*, appointments(client_name, service, starts_at, client_phone)')
        .order('created_at', { ascending: false })
        .limit(300);
      if (res.error) throw new Error(res.error.message);
      return res.data as Call[];
    },
    [{ table: 'calls' }],
  );
  const rows = (data ?? []).filter((c) => !outcome || c.outcome === outcome);

  function exportCsv() {
    downloadCsv(
      `callvance-calls-${format(new Date(), 'yyyy-MM-dd')}.csv`,
      rows.map((c) => ({
        created_at: c.created_at,
        client_name: c.appointments?.client_name ?? '',
        client_phone: c.appointments?.client_phone ?? '',
        service: c.appointments?.service ?? '',
        appointment_at: c.appointments?.starts_at ?? '',
        channel: c.channel,
        status: c.status,
        outcome: c.outcome ?? '',
        sentiment: c.sentiment ?? '',
        no_show_risk: c.analysis?.no_show_risk ?? '',
        duration_seconds: c.duration_seconds ?? '',
        summary: c.summary ?? '',
        follow_up_actions: c.analysis?.follow_up_actions.join(' | ') ?? '',
        analysis_model: c.analysis?.model ?? '',
      })),
    );
  }

  return (
    <>
      <PageHeader
        title="Calls"
        subtitle="Every call, its transcript and the audited outcome."
        actions={
          <>
            <select className="input w-auto" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option value="">All outcomes</option>
              {outcomes.map((o) => <option key={o} value={o}>{label(o)}</option>)}
            </select>
            <button className="btn-ghost" onClick={exportCsv} disabled={!rows.length}>
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </>
        }
      />
      <div className="card overflow-x-auto">
        {rows.length ? (
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Client</th>
                <th className="th">Started</th>
                <th className="th">Status</th>
                <th className="th">Outcome</th>
                <th className="th">Sentiment</th>
                <th className="th">Length</th>
                <th className="th">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/calls/${c.id}`)}>
                  <td className="td">
                    <div className="font-medium">{c.appointments?.client_name ?? '—'}</div>
                    <div className="text-xs text-slate-500">{c.channel === 'web' ? 'Browser' : 'Phone'}</div>
                  </td>
                  <td className="td whitespace-nowrap text-slate-500">{ago(c.created_at)}</td>
                  <td className="td"><StatusBadge value={c.status} /></td>
                  <td className="td"><StatusBadge value={c.outcome} /></td>
                  <td className="td"><StatusBadge value={c.sentiment} /></td>
                  <td className="td whitespace-nowrap">{duration(c.duration_seconds)}</td>
                  <td className="td max-w-md truncate text-slate-600" title={c.summary ?? ''}>{c.summary ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-6"><Empty text="No calls yet." /></div>
        )}
      </div>
    </>
  );
}
