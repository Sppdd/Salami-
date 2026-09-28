import { BarChart3, CalendarClock, Cpu, LayoutDashboard, LogOut, Menu, PhoneCall, Settings, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useBusiness } from '../lib/business';
import { modelName } from '../lib/format';
import { useHealth } from '../lib/hooks';
import { supabase } from '../lib/supabase';

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/appointments', label: 'Appointments', icon: CalendarClock },
  { to: '/calls', label: 'Calls', icon: PhoneCall },
  { to: '/insights', label: 'Insights', icon: BarChart3 },
  { to: '/settings', label: 'Agent & business', icon: Settings },
];

export function Layout() {
  const { business } = useBusiness();
  const health = useHealth();
  const [open, setOpen] = useState(false);

  const sidebar = (
    <div className="flex h-full flex-col bg-slate-950 text-slate-300">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white">
          <PhoneCall className="h-5 w-5" />
        </div>
        <div>
          <div className="font-semibold text-white">CallVance</div>
          <div className="text-xs text-slate-400">{business?.name ?? '…'}</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive ? 'bg-slate-800 text-white' : 'hover:bg-slate-900 hover:text-white'
              }`
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="m-3 rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs">
        <div className="mb-2 flex items-center gap-2 font-semibold text-slate-200">
          <Cpu className="h-3.5 w-3.5 text-brand-600" /> NVIDIA Nemotron · Nebius
        </div>
        {health ? (
          <dl className="space-y-1">
            {(['fast', 'smart', 'reasoning'] as const).map((t) => (
              <div key={t} className="flex justify-between gap-2">
                <dt className="capitalize text-slate-500">{t}</dt>
                <dd className="truncate text-right text-slate-300" title={health.models[t]}>
                  {modelName(health.models[t])}
                </dd>
              </div>
            ))}
            <div className="flex justify-between gap-2 pt-1">
              <dt className="text-slate-500">Phone</dt>
              <dd className={health.twilio ? 'text-emerald-400' : 'text-amber-400'}>
                {health.twilio ? 'Twilio live' : 'Simulator only'}
              </dd>
            </div>
          </dl>
        ) : (
          <div className="text-slate-500">Connecting to API…</div>
        )}
      </div>
      <button
        onClick={() => supabase.auth.signOut()}
        className="mx-3 mb-4 flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-slate-900 hover:text-white"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64">{sidebar}</aside>
        </div>
      )}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(!open)} className="btn-ghost px-2" aria-label="Menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <span className="font-semibold">CallVance</span>
        <span className="w-9" />
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
