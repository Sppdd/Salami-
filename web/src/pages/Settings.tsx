import { Check } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '../components/Layout';
import { useBusiness } from '../lib/business';
import { supabase } from '../lib/supabase';
import type { Business } from '../lib/types';
import { Field } from './Appointments';

const presets: Record<string, Pick<Business, 'agent_persona' | 'policies'>> = {
  clinic: {
    agent_persona: 'Warm, calm and reassuring. Speaks plainly and never gives medical advice.',
    policies: 'Please arrive 10 minutes early with your insurance card. Reschedule at least 24 hours ahead to avoid a $50 late-cancellation fee.',
  },
  salon: {
    agent_persona: 'Upbeat and friendly, like a favorite front-desk stylist. Keeps it short.',
    policies: 'Changes need 12 hours notice. Late arrivals over 15 minutes may need to rebook.',
  },
  auto: {
    agent_persona: 'Straightforward and efficient. Confirms drop-off times precisely.',
    policies: 'Drop-off by the appointment time; loaner cars must be requested 48 hours ahead.',
  },
  legal: {
    agent_persona: 'Polished, discreet and professional. Never discusses case details.',
    policies: 'Consultations cancelled with less than 24 hours notice are billed at 50%.',
  },
};

export function Settings() {
  const { business, reload } = useBusiness();
  const [form, setForm] = useState<Business | null>(business);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setForm(business), [business]);
  if (!form) return <div className="py-20 text-center text-slate-400">Loading…</div>;

  const set = <K extends keyof Business>(k: K) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: typeof form[k] === 'number' ? Number(e.target.value) : e.target.value });

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const { id, owner_id, ...patch } = form;
    const { error: err } = await supabase
      .from('businesses')
      .update({ ...patch, front_desk_phone: patch.front_desk_phone || null })
      .eq('id', id)
      .eq('owner_id', owner_id);
    if (err) return setError(err.message);
    setError(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    await reload();
  }

  return (
    <form onSubmit={save}>
      <PageHeader
        title="Agent & business"
        subtitle="Give your agent its own personality and rules. Changes apply to the next call."
        actions={
          <button className="btn-primary">
            {saved ? <Check className="h-4 w-4" /> : null} {saved ? 'Saved' : 'Save changes'}
          </button>
        }
      />
      {error && <div className="mb-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="card space-y-4 p-5">
          <h2 className="font-semibold">Business</h2>
          <Field label="Business name"><input className="input" required value={form.name} onChange={set('name')} /></Field>
          <Field label="Type">
            <select
              className="input"
              value={form.business_type}
              onChange={(e) => {
                const t = e.target.value;
                setForm({ ...form, business_type: t, ...(presets[t] ?? {}) });
              }}
            >
              <option value="clinic">Clinic / dental</option>
              <option value="salon">Salon / spa</option>
              <option value="auto">Auto service</option>
              <option value="legal">Legal / professional</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Timezone"><input className="input" required value={form.timezone} onChange={set('timezone')} placeholder="America/New_York" /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Opens (hour)"><input className="input" type="number" min={0} max={23} value={form.opening_hour} onChange={set('opening_hour')} /></Field>
            <Field label="Closes (hour)"><input className="input" type="number" min={1} max={24} value={form.closing_hour} onChange={set('closing_hour')} /></Field>
            <Field label="Slot (min)"><input className="input" type="number" min={5} max={240} step={5} value={form.slot_minutes} onChange={set('slot_minutes')} /></Field>
          </div>
          <Field label="Front desk phone (live transfer)">
            <input className="input" type="tel" placeholder="+1 415 555 0199" value={form.front_desk_phone ?? ''} onChange={set('front_desk_phone')} />
          </Field>
        </section>

        <section className="card space-y-4 p-5">
          <h2 className="font-semibold">Agent personality</h2>
          <Field label="Agent name"><input className="input" required value={form.agent_name} onChange={set('agent_name')} /></Field>
          <Field label="Persona"><textarea className="input" rows={3} value={form.agent_persona} onChange={set('agent_persona')} /></Field>
          <Field label="Policies the agent may quote"><textarea className="input" rows={4} value={form.policies} onChange={set('policies')} /></Field>
          <p className="text-xs text-slate-500">
            The agent only offers reschedule times that are actually open inside these hours, and never leaves appointment details on voicemail.
          </p>
        </section>
      </div>
    </form>
  );
}
