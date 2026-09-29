import { Cpu, PhoneCall } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabase';

export function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const { data, error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) setMessage({ kind: 'error', text: error.message });
    else if (mode === 'signup' && !data.session) setMessage({ kind: 'info', text: 'Check your inbox to confirm your email, then sign in.' });
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-slate-950 p-12 text-white lg:flex">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600">
            <PhoneCall className="h-5 w-5" />
          </div>
          811
        </div>
        <div>
          <h1 className="text-4xl font-semibold leading-tight">
            No-shows cost appointment businesses hours every week.
            <span className="text-brand-600"> 811 calls every client for you.</span>
          </h1>
          <p className="mt-4 max-w-lg text-slate-400">
            An AI phone agent that confirms, reschedules against your real calendar, and flags at-risk clients. It's built on NVIDIA
            Nemotron models served by Nebius Token Factory.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Cpu className="h-4 w-4 text-brand-600" /> Nemotron Nano for live turns · Super for escalations · Ultra for analysis
        </div>
      </div>

      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div>
            <h2 className="text-2xl font-semibold">{mode === 'signin' ? 'Welcome back' : 'Create your workspace'}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {mode === 'signin' ? 'Sign in to your dashboard.' : 'Takes 10 seconds. No custom setup.'}
            </p>
          </div>
          {!supabaseConfigured && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env to enable sign-in.
            </div>
          )}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {message && (
            <div className={`rounded-lg p-3 text-sm ${message.kind === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-sky-50 text-sky-700'}`}>
              {message.text}
            </div>
          )}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
          <button type="button" className="w-full text-sm text-slate-500 hover:text-slate-900" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
            {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
