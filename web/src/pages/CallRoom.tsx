import { ArrowLeft, Mic, MicOff, PhoneOff, Send, User, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Eight, type EightMood } from '../components/Eight';
import { StatusBadge } from '../components/StatusBadge';
import { api } from '../lib/api';
import { duration, label, modelName, when } from '../lib/format';
import { useLiveQuery } from '../lib/hooks';
import { supabase } from '../lib/supabase';
import type { Appointment, Call, CallTurn } from '../lib/types';

// Minimal Web Speech API typings (Chrome/Edge/Safari expose webkitSpeechRecognition).
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
const RecognitionCtor: (new () => Recognition) | undefined =
  (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;

export function CallRoom() {
  const { id = '' } = useParams();
  const { data } = useLiveQuery(
    `call:${id}`,
    async () => {
      const [call, turns] = await Promise.all([
        supabase.from('calls').select('*').eq('id', id).single(),
        supabase.from('call_turns').select('*').eq('call_id', id).order('id'),
      ]);
      if (call.error) throw new Error(call.error.message);
      const appt = call.data.appointment_id
        ? await supabase.from('appointments').select('*').eq('id', call.data.appointment_id).maybeSingle()
        : { data: null };
      return { call: call.data as Call, turns: (turns.data ?? []) as CallTurn[], appt: appt.data as Appointment | null };
    },
    [
      { table: 'calls', filter: `id=eq.${id}` },
      { table: 'call_turns', filter: `call_id=eq.${id}` },
      { table: 'appointments' },
    ],
  );

  const call = data?.call;
  const turns = data?.turns ?? [];
  const appt = data?.appt;
  const interactive = call?.channel === 'web' && call.status === 'in_progress';

  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [handsFree, setHandsFree] = useState(Boolean(RecognitionCtor));
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const spokenUpTo = useRef<number | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), [turns.length, thinking]);

  // Speak each new agent line once. On first load, only speak the greeting of a fresh call.
  useEffect(() => {
    if (!call || !turns.length) return;
    const lastId = turns[turns.length - 1].id;
    if (spokenUpTo.current === null) {
      const fresh = interactive && turns.length === 1 && turns[0].role === 'agent';
      spokenUpTo.current = fresh ? lastId - 1 : lastId;
    }
    const pending = turns.filter((t) => t.id > spokenUpTo.current! && t.role === 'agent');
    spokenUpTo.current = lastId;
    if (!pending.length || call.channel !== 'web') return;
    speak(pending.map((t) => t.content).join(' '), () => {
      if (handsFree && interactive) listen();
    });
  }, [turns]);

  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    recognition.current?.stop();
  }, []);

  function speak(line: string, done: () => void) {
    if (!voiceOn || !window.speechSynthesis) return done();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(line);
    u.rate = 1.03;
    const voice = window.speechSynthesis.getVoices().find((v) => /en-US/.test(v.lang) && /Samantha|Google US English|Aria|Jenny/i.test(v.name));
    if (voice) u.voice = voice;
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.speak(u);
  }

  function listen() {
    if (!RecognitionCtor || listening) return;
    const r = new RecognitionCtor();
    r.lang = 'en-US';
    r.interimResults = false;
    r.continuous = false;
    r.onresult = (e) => {
      const result = e.results[e.results.length - 1];
      if (result.isFinal) void send(result[0].transcript);
    };
    r.onerror = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') setError(`Microphone: ${e.error}`);
    };
    r.onend = () => setListening(false);
    recognition.current = r;
    setListening(true);
    r.start();
  }

  async function send(message: string) {
    const clean = message.trim();
    if (!clean || !call) return;
    recognition.current?.stop();
    setText('');
    setThinking(true);
    setError(null);
    try {
      await api.sendTurn(call.id, clean);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setThinking(false);
    }
  }

  async function hangUp() {
    if (!call) return;
    window.speechSynthesis?.cancel();
    recognition.current?.stop();
    await api.endCall(call.id).catch((e) => setError((e as Error).message));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    void send(text);
  }

  if (!call) return <div className="py-20 text-center text-slate-400">Loading call…</div>;

  const kept = call.outcome === 'confirmed' || call.outcome === 'rescheduled';
  const mood: EightMood =
    call.status === 'transferred' ? 'handoff'
    : thinking || call.status === 'analyzing' ? 'think'
    : listening ? 'listen'
    : kept ? 'confirmed'
    : 'greet';

  return (
    <>
      <Link to="/calls" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> All calls
      </Link>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="card flex min-h-[70vh] flex-col xl:col-span-2">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-3">
              <Eight mood={mood} size={52} />
              <div>
              <h1 className="text-lg font-semibold">{appt?.client_name ?? 'Call'}</h1>
              <p className="text-xs text-slate-500">
                {call.channel === 'web' ? 'Browser simulator' : 'Phone call via Twilio'} · {duration(call.duration_seconds)}
              </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge value={call.status} />
              {interactive && (
                <button className="btn-danger" onClick={hangUp}>
                  <PhoneOff className="h-4 w-4" /> End
                </button>
              )}
            </div>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
            {turns.map((t) =>
              t.role === 'system' ? (
                <div key={t.id} className="mx-auto max-w-lg rounded-lg bg-indigo-50 px-3 py-2 text-center text-xs text-indigo-700">
                  {t.content}
                  {t.model && <span className="text-indigo-400"> · {modelName(t.model)}</span>}
                </div>
              ) : (
                <div key={t.id} className={`flex gap-3 ${t.role === 'client' ? 'flex-row-reverse' : ''}`}>
                  <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${t.role === 'agent' ? 'bg-brand-50' : 'bg-slate-200 text-slate-600'}`}>
                    {t.role === 'agent' ? <Eight crop="head" size={28} /> : <User className="h-4 w-4" />}
                  </div>
                  <div className={`max-w-[80%] ${t.role === 'client' ? 'text-right' : ''}`}>
                    <div className={`inline-block rounded-2xl px-4 py-2.5 text-sm ${t.role === 'agent' ? 'bg-slate-100 text-slate-900' : 'bg-slate-900 text-white'}`}>
                      {t.content}
                    </div>
                    {t.role === 'agent' && t.tier && (
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
                        <StatusBadge value={t.tier} />
                        {t.tier !== 'template' && <span>{modelName(t.model)}</span>}
                        {!!t.latency_ms && <span>{(t.latency_ms / 1000).toFixed(2)}s</span>}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
            {(thinking || call.status === 'analyzing') && (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Eight mood="think" size={40} />
                {call.status === 'analyzing' ? 'Nemotron reasoning tier is auditing the call…' : 'Agent is thinking…'}
              </div>
            )}
            <div ref={bottom} />
          </div>

          {interactive && (
            <footer className="border-t border-slate-100 p-4">
              {error && <div className="mb-2 text-sm text-rose-600">{error}</div>}
              <form onSubmit={submit} className="flex items-center gap-2">
                {RecognitionCtor && (
                  <button
                    type="button"
                    onClick={() => (listening ? recognition.current?.stop() : listen())}
                    className={`btn ${listening ? 'bg-rose-500 text-white' : 'btn-ghost'} px-3`}
                    aria-label={listening ? 'Stop listening' : 'Speak'}
                  >
                    {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
                )}
                <input
                  className="input"
                  placeholder={listening ? 'Listening… speak as the client' : 'Reply as the client, e.g. “Can we move it to Thursday?”'}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  disabled={thinking}
                />
                <button className="btn-primary" disabled={thinking || !text.trim()}>
                  <Send className="h-4 w-4" />
                </button>
              </form>
              <div className="mt-2 flex gap-4 text-xs text-slate-500">
                <button type="button" onClick={() => setVoiceOn(!voiceOn)} className="flex items-center gap-1 hover:text-slate-900">
                  {voiceOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />} Agent voice {voiceOn ? 'on' : 'off'}
                </button>
                {RecognitionCtor && (
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={handsFree} onChange={(e) => setHandsFree(e.target.checked)} /> Hands-free (auto-listen after agent speaks)
                  </label>
                )}
              </div>
            </footer>
          )}
        </section>

        <aside className="space-y-6">
          {appt && (
            <section className="card p-5">
              <h2 className="mb-3 font-semibold">Appointment</h2>
              <dl className="space-y-2 text-sm">
                <Row k="When" v={when(appt.starts_at)} />
                {appt.rescheduled_from && <Row k="Originally" v={when(appt.rescheduled_from)} />}
                <Row k="Service" v={appt.service} />
                {appt.provider && <Row k="Provider" v={appt.provider} />}
                <Row k="Phone" v={appt.client_phone} />
                <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd><StatusBadge value={appt.status} /></dd></div>
              </dl>
            </section>
          )}

          <section className="card p-5">
            <h2 className="mb-1 font-semibold">Post-call analysis</h2>
            {call.analysis ? (
              <>
                <p className="mb-4 text-xs text-slate-500">
                  {modelName(call.analysis.model)} · {(call.analysis.latency_ms / 1000).toFixed(1)}s · confidence {Math.round(call.analysis.confidence * 100)}%
                </p>
                <div className="mb-4 flex flex-wrap gap-2">
                  <StatusBadge value={call.analysis.outcome} />
                  <StatusBadge value={call.analysis.sentiment} />
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${call.analysis.no_show_risk === 'high' ? 'bg-rose-50 text-rose-700 ring-rose-200' : call.analysis.no_show_risk === 'medium' ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>
                    {label(call.analysis.no_show_risk)} no-show risk
                  </span>
                </div>
                <p className="text-sm">{call.analysis.summary}</p>
                <List title="Client requests" items={call.analysis.client_requests} />
                <List title="Follow-up actions" items={call.analysis.follow_up_actions} />
                <List title="Risk flags" items={call.analysis.risk_flags} />
              </>
            ) : call.summary ? (
              <p className="mt-2 text-sm">{call.summary}</p>
            ) : (
              <p className="mt-2 text-sm text-slate-500">
                When the call ends, Nemotron's reasoning tier audits the transcript and updates the appointment automatically.
              </p>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="mt-4">
      <div className="label">{title}</div>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
        {items.map((i) => <li key={i}>{i}</li>)}
      </ul>
    </div>
  );
}
