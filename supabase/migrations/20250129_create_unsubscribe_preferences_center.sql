-- SmartSend Unsubscribe & Preferences Center
-- Creates the new schema for one-click unsubscribe, preferences center, and per-sequence opt-outs

-- 1. Tokens that identify an email (and optionally a sequence/subscriber) without login
create table if not exists public.unsubscribe_tokens (
  token text primary key,
  workspace_id uuid not null,
  email citext not null,
  sequence_id uuid,
  subscriber_id uuid,
  created_at timestamptz not null default now()
);

-- 2. Per-email preferences (global opt-out + arbitrary topic flags later)
create table if not exists public.email_preferences (
  workspace_id uuid not null,
  email citext not null,
  global_opt_out boolean not null default false,
  topics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, email)
);

-- 3. Per-sequence opt-outs (do not send steps for this sequence)
create table if not exists public.sequence_opt_outs (
  workspace_id uuid not null,
  email citext not null,
  sequence_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, email, sequence_id)
);

-- 4. Audit trail of unsubscribe actions
create table if not exists public.unsubscribe_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  email citext not null,
  action text not null,        -- 'global' | 'sequence' | 'topics'
  sequence_id uuid,
  reason text,
  user_agent text,
  ip inet,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table public.unsubscribe_tokens enable row level security;
alter table public.email_preferences enable row level security;
alter table public.sequence_opt_outs enable row level security;
alter table public.unsubscribe_events enable row level security;

-- RLS function for setting workspace context
create or replace function app.set_workspace(id uuid)
returns void language sql as $$ 
  select set_config('app.workspace_id', id::text, true); 
$$;

-- RLS policies
create policy if not exists unsub_tokens_rw on public.unsubscribe_tokens for all
  using (workspace_id = current_setting('app.workspace_id', true)::uuid)
  with check (workspace_id = current_setting('app.workspace_id', true)::uuid);

create policy if not exists email_prefs_rw on public.email_preferences for all
  using (workspace_id = current_setting('app.workspace_id', true)::uuid)
  with check (workspace_id = current_setting('app.workspace_id', true)::uuid);

create policy if not exists seq_optouts_rw on public.sequence_opt_outs for all
  using (workspace_id = current_setting('app.workspace_id', true)::uuid)
  with check (workspace_id = current_setting('app.workspace_id', true)::uuid);

create policy if not exists unsub_events_rw on public.unsubscribe_events for all
  using (workspace_id = current_setting('app.workspace_id', true)::uuid)
  with check (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- Index helpers
create index if not exists idx_unsub_token_ws on public.unsubscribe_tokens(workspace_id, created_at desc);
create index if not exists idx_email_prefs_ws on public.email_preferences(workspace_id, email);
create index if not exists idx_seq_optouts_ws on public.sequence_opt_outs(workspace_id, email, sequence_id);
create index if not exists idx_unsub_events_ws on public.unsubscribe_events(workspace_id, created_at desc);
create index if not exists idx_unsub_events_email on public.unsubscribe_events(workspace_id, email);
create index if not exists idx_unsub_events_sequence on public.unsubscribe_events(workspace_id, sequence_id);

-- Add sequence_id to existing sequence_subscribers if it doesn't exist
-- This is needed for the new unsubscribe system to work with existing sequences
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'sequence_subscribers' 
    and column_name = 'sequence_id'
  ) then
    alter table public.sequence_subscribers add column sequence_id uuid references public.sequences(id);
  end if;
end $$;

-- Create index on sequence_subscribers.sequence_id if it doesn't exist
create index if not exists idx_sequence_subscribers_sequence_id on public.sequence_subscribers(sequence_id); 