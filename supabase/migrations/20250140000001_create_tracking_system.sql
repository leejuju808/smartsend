-- SmartSend Tracking System
-- Creates tables for link tracking, open tracking, and analytics

-- Where each tracked link token resolves to
create table if not exists public.tracking_links (
  token text primary key,
  workspace_id uuid not null,
  url text not null,
  email citext not null,
  subscriber_id uuid,          -- sequence_subscribers.id
  sequence_id uuid,
  step_no int,
  created_at timestamptz not null default now()
);

-- Open tokens are per-subscriber (1..n per contact if you want to rotate)
create table if not exists public.open_tokens (
  token text primary key,
  workspace_id uuid not null,
  email citext not null,
  subscriber_id uuid,
  sequence_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.open_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  token text not null,
  email citext,
  subscriber_id uuid,
  sequence_id uuid,
  user_agent text,
  ip inet,
  created_at timestamptz not null default now()
);

create table if not exists public.click_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  token text not null,
  url text not null,
  email citext,
  subscriber_id uuid,
  sequence_id uuid,
  user_agent text,
  ip inet,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.tracking_links enable row level security;
alter table public.open_tokens enable row level security;
alter table public.open_events enable row level security;
alter table public.click_events enable row level security;

-- Create the set_workspace function if it doesn't exist
create or replace function app.set_workspace(id uuid)
returns void language sql as $$ 
  select set_config('app.workspace_id', id::text, true); 
$$;

-- RLS Policies
create policy if not exists tl_rw on public.tracking_links for all
  using (workspace_id = current_setting('app.workspace_id', true)::uuid)
  with check (workspace_id = current_setting('app.workspace_id', true)::uuid);

create policy if not exists ot_rw on public.open_tokens for all
  using (workspace_id = current_setting('app.workspace_id', true)::uuid)
  with check (workspace_id = current_setting('app.workspace_id', true)::uuid);

create policy if not exists oe_rw on public.open_events for all
  using (workspace_id = current_setting('app.workspace_id', true)::uuid)
  with check (workspace_id = current_setting('app.workspace_id', true)::uuid);

create policy if not exists ce_rw on public.click_events for all
  using (workspace_id = current_setting('app.workspace_id', true)::uuid)
  with check (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- Helpful indexes
create index if not exists idx_click_ws_time on public.click_events(workspace_id, created_at desc);
create index if not exists idx_open_ws_time on public.open_events(workspace_id, created_at desc);
create index if not exists idx_tl_ws_created on public.tracking_links(workspace_id, created_at desc);
create index if not exists idx_open_tokens_ws_email on public.open_tokens(workspace_id, email);
create index if not exists idx_tracking_links_ws_email on public.tracking_links(workspace_id, email); 