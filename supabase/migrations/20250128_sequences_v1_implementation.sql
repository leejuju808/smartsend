-- Sequences v1 Implementation
-- Multi-step drip sequences with wait rules, send windows, templating, and stop-on-reply

-- Drop existing sequences tables if they exist (for clean implementation)
drop table if exists public.sequence_events cascade;
drop table if exists public.sequence_subscribers cascade;
drop table if exists public.sequence_steps cascade;
drop table if exists public.sequences cascade;

-- Create sequences table
create table if not exists public.sequences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  name text not null,
  timezone text not null default 'America/Los_Angeles',
  stop_on_reply boolean not null default true,
  send_window jsonb not null default '{"days":[1,2,3,4,5],"start_hour":8,"end_hour":17}',
  throttle_per_tick int not null default 50,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create sequence_steps table
create table if not exists public.sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  step_no int not null,
  wait_seconds int not null default 0,
  subject_template text,
  html_template text,
  text_template text,
  created_at timestamptz not null default now(),
  unique(sequence_id, step_no)
);

-- Create sequence_subscribers table
create table if not exists public.sequence_subscribers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  email citext not null,
  status text not null default 'active', -- active | paused | completed | unsubscribed | bounced
  current_step int not null default 0, -- 0 = before first
  next_send_at timestamptz,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique(sequence_id, contact_id)
);

-- Create sequence_events table
create table if not exists public.sequence_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  sequence_id uuid not null,
  subscriber_id uuid not null,
  type text not null, -- enrolled | sent | completed | paused | resumed | skipped_window | bounced | unsubscribed | replied
  meta jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Create helpful indexes
create index if not exists idx_seqsub_due on public.sequence_subscribers(workspace_id, status, next_send_at);
create index if not exists idx_seqevents_ws_time on public.sequence_events(workspace_id, created_at desc);

-- Enable RLS
alter table public.sequences enable row level security;
alter table public.sequence_steps enable row level security;
alter table public.sequence_subscribers enable row level security;
alter table public.sequence_events enable row level security;

-- Create workspace scoping function if it doesn't exist
create or replace function app.set_workspace(id uuid)
returns void language sql as $$ 
  select set_config('app.workspace_id', id::text, true); 
$$;

-- Create RLS policies using app.set_workspace
create policy if not exists sequences_rw on public.sequences for all
  using (workspace_id = current_setting('app.workspace_id', true)::uuid)
  with check (workspace_id = current_setting('app.workspace_id', true)::uuid);

create policy if not exists steps_rw on public.sequence_steps for all
  using (
    sequence_id in (select id from public.sequences where workspace_id = current_setting('app.workspace_id', true)::uuid)
  ) with check (
    sequence_id in (select id from public.sequences where workspace_id = current_setting('app.workspace_id', true)::uuid)
  );

create policy if not exists subs_rw on public.sequence_subscribers for all
  using (workspace_id = current_setting('app.workspace_id', true)::uuid)
  with check (workspace_id = current_setting('app.workspace_id', true)::uuid);

create policy if not exists se_events_rw on public.sequence_events for all
  using (workspace_id = current_setting('app.workspace_id', true)::uuid)
  with check (workspace_id = current_setting('app.workspace_id', true)::uuid); 