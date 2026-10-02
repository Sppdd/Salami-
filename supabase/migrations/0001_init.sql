-- 811 schema: businesses, appointments, calls, call turns.
-- Every row carries owner_id; RLS scopes each user to their own data.
-- The API server writes calls/turns with the service-role key (bypasses RLS).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Businesses: one per owner; holds the customizable agent personality.
-- ---------------------------------------------------------------------------
create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users (id) on delete cascade,
  name text not null default 'My Business',
  business_type text not null default 'clinic',
  timezone text not null default 'America/New_York',
  agent_name text not null default 'Eight',
  agent_persona text not null default 'Warm, concise and professional. Never pushy.',
  policies text not null default 'Appointments can be rescheduled up to 24 hours in advance at no charge. Late cancellations may incur a fee.',
  opening_hour int not null default 9 check (opening_hour between 0 and 23),
  closing_hour int not null default 17 check (closing_hour between 1 and 24),
  slot_minutes int not null default 30 check (slot_minutes between 5 and 240),
  front_desk_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Appointments
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.appointment_status as enum
    ('scheduled', 'confirmed', 'rescheduled', 'cancelled', 'needs_followup', 'no_answer');
exception when duplicate_object then null; end $$;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  client_name text not null,
  client_phone text not null,
  service text not null default 'Appointment',
  provider text,
  starts_at timestamptz not null,
  duration_minutes int not null default 30,
  notes text,
  status public.appointment_status not null default 'scheduled',
  rescheduled_from timestamptz, -- original time, kept when the agent moves an appointment
  last_call_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists appointments_owner_starts_idx on public.appointments (owner_id, starts_at);

-- ---------------------------------------------------------------------------
-- Calls
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.call_status as enum
    ('queued', 'ringing', 'in_progress', 'analyzing', 'completed', 'failed', 'no_answer', 'busy', 'transferred');
exception when duplicate_object then null; end $$;

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  appointment_id uuid references public.appointments (id) on delete set null,
  channel text not null check (channel in ('phone', 'web')),
  twilio_call_sid text unique,
  status public.call_status not null default 'queued',
  outcome text,             -- confirmed | rescheduled | cancelled | needs_followup | no_answer | voicemail
  sentiment text,           -- positive | neutral | negative
  summary text,
  analysis jsonb,           -- full structured post-call analysis from the reasoning tier
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists calls_owner_created_idx on public.calls (owner_id, created_at desc);

alter table public.appointments
  drop constraint if exists appointments_last_call_fk;
alter table public.appointments
  add constraint appointments_last_call_fk foreign key (last_call_id)
  references public.calls (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Call turns: live transcript + which Nemotron tier produced each agent line.
-- ---------------------------------------------------------------------------
create table if not exists public.call_turns (
  id bigint generated always as identity primary key,
  call_id uuid not null references public.calls (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('agent', 'client', 'system')),
  content text not null,
  model text,
  tier text,                -- fast | smart | reasoning
  latency_ms int,
  created_at timestamptz not null default now()
);
create index if not exists call_turns_call_idx on public.call_turns (call_id, id);

-- ---------------------------------------------------------------------------
-- Insight reports produced by the reasoning tier
-- ---------------------------------------------------------------------------
create table if not exists public.insight_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  model text not null,
  report jsonb not null,
  calls_analyzed int not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists businesses_touch on public.businesses;
create trigger businesses_touch before update on public.businesses
  for each row execute function public.touch_updated_at();
drop trigger if exists appointments_touch on public.appointments;
create trigger appointments_touch before update on public.appointments
  for each row execute function public.touch_updated_at();
drop trigger if exists calls_touch on public.calls;
create trigger calls_touch before update on public.calls
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.businesses enable row level security;
alter table public.appointments enable row level security;
alter table public.calls enable row level security;
alter table public.call_turns enable row level security;
alter table public.insight_reports enable row level security;

drop policy if exists "own business" on public.businesses;
create policy "own business" on public.businesses
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "own appointments" on public.appointments;
create policy "own appointments" on public.appointments
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Calls, turns and reports are written by the server only; users can read theirs.
drop policy if exists "read own calls" on public.calls;
create policy "read own calls" on public.calls
  for select using (owner_id = auth.uid());

drop policy if exists "read own turns" on public.call_turns;
create policy "read own turns" on public.call_turns
  for select using (owner_id = auth.uid());

drop policy if exists "read own reports" on public.insight_reports;
create policy "read own reports" on public.insight_reports
  for select using (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Realtime: stream status + transcript changes to the dashboard
-- ---------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.appointments;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.calls;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.call_turns;
exception when duplicate_object then null; end $$;
