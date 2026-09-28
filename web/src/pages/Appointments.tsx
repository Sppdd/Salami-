import { addDays, format, startOfDay } from 'date-fns';
import { Download, Headphones, Pencil, Phone, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/Layout';
import { StatusBadge } from '../components/StatusBadge';
import { api } from '../lib/api';
import { useBusiness } from '../lib/business';
import { downloadCsv, parseAppointmentsCsv, sampleCsv } from '../lib/csv';
import { label, when } from '../lib/format';
import { useHealth, useLiveQuery } from '../lib/hooks';
import { supabase } from '../lib/supabase';
import type { Appointment, AppointmentStatus } from '../lib/types';
import { Empty } from './Dashboard';

type Range = 'upcoming' | 'today' | 'tomorrow' | 'all';
const statuses: AppointmentStatus[] = ['scheduled', 'confirmed', 'rescheduled', 'needs_followup', 'no_answer', 'cancelled'];

export function Appointments() {
  const { business } = useBusiness();
  const health = useHealth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [range, setRange] = useState<Range>('upcoming');
  const [status, setStatus] = useState<AppointmentStatus | ''>('');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Partial<Appointment> | null>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const { data } = useLiveQuery(
    `appointments:${range}`,
    async () => {
      let q = supabase.from('appointments').select('*').order('starts_at');
      const today = startOfDay(new Date());
      if (range === 'upcoming') q = q.gte('starts_at', today.toISOString());
      if (range === 'today') q = q.gte('starts_at', today.toISOString()).lt('starts_at', addDays(today, 1).toISOString());
      if (range === 'tomorrow') q = q.gte('starts_at', addDays(today, 1).toISOString()).lt('starts_at', addDays(today, 2).toISOString());
      const res = await q.limit(500);
      if (res.error) throw new Error(res.error.message);
      return res.data as Appointment[];
    },
    [{ table: 'appointments' }],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter(
      (a) =>
        (!status || a.status === status) &&
        (!q || [a.client_name, a.client_phone, a.service, a.provider ?? ''].some((v) => v.toLowerCase().includes(q))),
    );
  }, [data, status, query]);

  async function startCall(appt: Appointment, channel: 'web' | 'phone') {
    setPending(appt.id + channel);
    setNotice(null);
    try {
      const { call } = await api.startCall(appt.id, channel);
      navigate(`/calls/${call.id}`);
    } catch (e) {
      setNotice({ kind: 'error', text: (e as Error).message });
    } finally {
      setPending(null);
    }
  }

  async function remove(appt: Appointment) {
    if (!confirm(`Delete ${appt.client_name}'s appointment?`)) return;
    const { error } = await supabase.from('appointments').delete().eq('id', appt.id);
    if (error) setNotice({ kind: 'error', text: error.message });
  }

  async function importFile(file: File) {
    if (!business) return;
    const { rows: parsed, errors } = await parseAppointmentsCsv(file);
    if (parsed.length) {
      const { error } = await supabase.from('appointments').insert(parsed.map((r) => ({ ...r, owner_id: business.owner_id })));
      if (error) return setNotice({ kind: 'error', text: error.message });
    }
    setNotice({
      kind: errors.length ? 'error' : 'info',
      text: `Imported ${parsed.length} appointment(s).${errors.length ? ` Skipped ${errors.length}: ${errors.slice(0, 3).join('; ')}` : ''}`,
    });
  }

  function exportCsv() {
    downloadCsv(
      `callvance-appointments-${format(new Date(), 'yyyy-MM-dd')}.csv`,
      rows.map((a) => ({
        client_name: a.client_name,
        client_phone: a.client_phone,
        service: a.service,
        provider: a.provider ?? '',
        starts_at: a.starts_at,
        duration_minutes: a.duration_minutes,
        status: a.status,
        rescheduled_from: a.rescheduled_from ?? '',
        notes: a.notes ?? '',
      })),
    );
  }

  return (
    <>
      <PageHeader
        title="Appointments"
        subtitle="Import your schedule, then let the agent call. Status updates stream in live."
        actions={
          <>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0]).finally(() => (e.target.value = ''))} />
            <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Import CSV
            </button>
            <button className="btn-ghost" onClick={exportCsv} disabled={!rows.length}>
              <Download className="h-4 w-4" /> Export CSV
            </button>
            <button className="btn-primary" onClick={() => setEditing({ duration_minutes: 30, service: 'Appointment' })}>
              <Plus className="h-4 w-4" /> New
            </button>
          </>
        }
      />

      {notice && (
        <div className={`mb-4 flex justify-between gap-4 rounded-lg px-4 py-3 text-sm ${notice.kind === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-sky-50 text-sky-800'}`}>
          {notice.text}
          <button onClick={() => setNotice(null)}><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="card">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            {(['upcoming', 'today', 'tomorrow', 'all'] as Range[]).map((r) => (
              <button key={r} onClick={() => setRange(r)} className={`rounded-md px-3 py-1.5 text-sm capitalize ${range === r ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {r}
              </button>
            ))}
          </div>
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as AppointmentStatus | '')}>
            <option value="">All statuses</option>
            {statuses.map((s) => <option key={s} value={s}>{label(s)}</option>)}
          </select>
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Search name, phone, service…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Client</th>
                  <th className="th">When</th>
                  <th className="th">Service</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/60">
                    <td className="td">
                      <div className="font-medium">{a.client_name}</div>
                      <div className="text-xs text-slate-500">{a.client_phone}</div>
                    </td>
                    <td className="td whitespace-nowrap">
                      {when(a.starts_at)}
                      {a.rescheduled_from && <div className="text-xs text-slate-400">was {when(a.rescheduled_from)}</div>}
                    </td>
                    <td className="td">
                      {a.service}
                      {a.provider && <div className="text-xs text-slate-500">{a.provider}</div>}
                    </td>
                    <td className="td"><StatusBadge value={a.status} /></td>
                    <td className="td">
                      <div className="flex justify-end gap-1.5">
                        <button className="btn-accent px-2.5 py-1.5" onClick={() => startCall(a, 'web')} disabled={!!pending} title="Talk to the agent as this client, in your browser">
                          <Headphones className="h-4 w-4" /> Simulate
                        </button>
                        <button className="btn-ghost px-2.5 py-1.5" onClick={() => startCall(a, 'phone')} disabled={!!pending || !health?.twilio} title={health?.twilio ? 'Place a real phone call via Twilio' : 'Needs Twilio credentials'}>
                          <Phone className="h-4 w-4" /> Call
                        </button>
                        {a.last_call_id && (
                          <button className="btn-ghost px-2.5 py-1.5" onClick={() => navigate(`/calls/${a.last_call_id}`)} title="Last call">
                            Last call
                          </button>
                        )}
                        <button className="btn-ghost px-2" onClick={() => setEditing(a)} aria-label="Edit"><Pencil className="h-4 w-4" /></button>
                        <button className="btn-danger px-2" onClick={() => remove(a)} aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-3 p-6">
            <Empty text="No appointments match. Add one, load the demo day from the dashboard, or import a CSV." />
            <details className="text-sm text-slate-500">
              <summary className="cursor-pointer">CSV format</summary>
              <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{sampleCsv}</pre>
            </details>
          </div>
        )}
      </div>

      {editing && business && (
        <AppointmentForm initial={editing} ownerId={business.owner_id} onClose={() => setEditing(null)} onError={(text) => setNotice({ kind: 'error', text })} />
      )}
    </>
  );
}

function toLocalInput(iso?: string) {
  return iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : '';
}

function AppointmentForm({ initial, ownerId, onClose, onError }: { initial: Partial<Appointment>; ownerId: string; onClose: () => void; onError: (m: string) => void }) {
  const [form, setForm] = useState({
    client_name: initial.client_name ?? '',
    client_phone: initial.client_phone ?? '',
    service: initial.service ?? '',
    provider: initial.provider ?? '',
    starts_at: toLocalInput(initial.starts_at),
    duration_minutes: initial.duration_minutes ?? 30,
    notes: initial.notes ?? '',
    status: initial.status ?? 'scheduled',
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    const row = {
      ...form,
      provider: form.provider || null,
      notes: form.notes || null,
      duration_minutes: Number(form.duration_minutes) || 30,
      starts_at: new Date(form.starts_at).toISOString(),
    };
    const res = initial.id
      ? await supabase.from('appointments').update(row).eq('id', initial.id)
      : await supabase.from('appointments').insert({ ...row, owner_id: ownerId });
    if (res.error) onError(res.error.message);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="card w-full max-w-lg space-y-4 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{initial.id ? 'Edit appointment' : 'New appointment'}</h2>
          <button type="button" onClick={onClose} aria-label="Close"><X className="h-5 w-5 text-slate-400" /></button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Client name"><input className="input" required value={form.client_name} onChange={set('client_name')} /></Field>
          <Field label="Phone"><input className="input" required type="tel" placeholder="+1 415 555 0100" value={form.client_phone} onChange={set('client_phone')} /></Field>
          <Field label="Service"><input className="input" required value={form.service} onChange={set('service')} /></Field>
          <Field label="Provider"><input className="input" value={form.provider} onChange={set('provider')} /></Field>
          <Field label="Starts at"><input className="input" required type="datetime-local" value={form.starts_at} onChange={set('starts_at')} /></Field>
          <Field label="Duration (min)"><input className="input" type="number" min={5} step={5} value={form.duration_minutes} onChange={set('duration_minutes')} /></Field>
          {initial.id && (
            <Field label="Status">
              <select className="input" value={form.status} onChange={set('status')}>
                {statuses.map((s) => <option key={s} value={s}>{label(s)}</option>)}
              </select>
            </Field>
          )}
        </div>
        <Field label="Notes for the agent"><textarea className="input" rows={2} value={form.notes} onChange={set('notes')} /></Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary">Save</button>
        </div>
      </form>
    </div>
  );
}

export function Field({ label: text, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{text}</span>
      {children}
    </label>
  );
}
