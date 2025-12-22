-- BLOCK 283000 — SmartSend Outreach Assault v1
-- “Contact 100 Roofers. Close the First 10.”
--
-- Scope:
-- - outbound_targets: internal target list (per workspace)
-- - outbound_outreach_settings: start/pause state
-- - outbound_outreach_messages: per-step send log + threading keys
-- - RLS: workspace member read, workspace admin write, service_role full access

-- ============================================================================
-- 0) Helpers
-- ============================================================================

-- Helper: workspace admin check (owner/admin)
create or replace function public.is_workspace_admin(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('owner','admin')
  ) or exists (
    select 1
    from public.workspaces w
    where w.id = p_workspace_id
      and w.owner_id = auth.uid()
  );
$$;

grant execute on function public.is_workspace_admin(uuid) to authenticated;

-- ============================================================================
-- 1) outbound_targets
-- ============================================================================

create table if not exists public.outbound_targets (
  id uuid primary key default gen_random_uuid(),

  -- tenant scope
  workspace_id uuid not null references public.workspaces(id) on delete cascade,

  company_name text not null,
  owner_name text,
  email text not null,
  phone text,
  city text not null,
  state text not null,
  website text,

  source text not null check (source in ('google_maps','list','referral')),
  status text not null default 'uncontacted'
    check (status in ('uncontacted','contacted','replied','demo_booked','trial','paid','lost')),

  last_contacted_at timestamptz,

  -- conversion bridge
  converted_workspace_id uuid references public.workspaces(id) on delete set null,
  converted_user_id uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Prevent duplicate target emails per workspace (case-insensitive)
create unique index if not exists outbound_targets_workspace_email_uq
  on public.outbound_targets (workspace_id, lower(email));

create index if not exists outbound_targets_workspace_status_idx
  on public.outbound_targets (workspace_id, status);

create index if not exists outbound_targets_workspace_last_touch_idx
  on public.outbound_targets (workspace_id, last_contacted_at desc nulls last);

create index if not exists outbound_targets_converted_workspace_idx
  on public.outbound_targets (converted_workspace_id);

-- updated_at trigger
create or replace function public.set_outbound_targets_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_outbound_targets_updated_at on public.outbound_targets;
create trigger trg_outbound_targets_updated_at
before update on public.outbound_targets
for each row
execute function public.set_outbound_targets_updated_at();

-- ============================================================================
-- 2) outbound_outreach_settings (pause/start control)
-- ============================================================================

create table if not exists public.outbound_outreach_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  paused boolean not null default false,
  started_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.set_outbound_outreach_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_outbound_outreach_settings_updated_at on public.outbound_outreach_settings;
create trigger trg_outbound_outreach_settings_updated_at
before update on public.outbound_outreach_settings
for each row
execute function public.set_outbound_outreach_settings_updated_at();

-- ============================================================================
-- 3) outbound_outreach_messages (send log + threading)
-- ============================================================================

create table if not exists public.outbound_outreach_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  target_id uuid not null references public.outbound_targets(id) on delete cascade,

  -- locked sequence steps
  step text not null check (step in ('day0_initial','day3_followup','day7_final')),

  subject text not null,
  body_text text not null,

  -- provider metadata
  provider text not null default 'gmail' check (provider in ('gmail','outlook','smtp')),

  -- RFC822 Message-ID we set (used for reply threading + matching)
  provider_message_id text not null,

  -- Provider response ids (best-effort; Gmail returns id/threadId)
  provider_send_id text,
  provider_thread_id text,

  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists outbound_outreach_messages_workspace_sent_idx
  on public.outbound_outreach_messages (workspace_id, sent_at desc);

create index if not exists outbound_outreach_messages_target_step_idx
  on public.outbound_outreach_messages (target_id, step);

create unique index if not exists outbound_outreach_messages_target_step_uq
  on public.outbound_outreach_messages (target_id, step);

-- ============================================================================
-- 4) Row Level Security
-- ============================================================================

alter table public.outbound_targets enable row level security;
alter table public.outbound_outreach_settings enable row level security;
alter table public.outbound_outreach_messages enable row level security;

-- outbound_targets
drop policy if exists "outbound_targets_select" on public.outbound_targets;
create policy "outbound_targets_select"
  on public.outbound_targets
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "outbound_targets_insert" on public.outbound_targets;
create policy "outbound_targets_insert"
  on public.outbound_targets
  for insert
  with check (public.is_workspace_admin(workspace_id));

drop policy if exists "outbound_targets_update" on public.outbound_targets;
create policy "outbound_targets_update"
  on public.outbound_targets
  for update
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

drop policy if exists "outbound_targets_delete" on public.outbound_targets;
create policy "outbound_targets_delete"
  on public.outbound_targets
  for delete
  using (public.is_workspace_admin(workspace_id));

-- outbound_outreach_settings
drop policy if exists "outbound_outreach_settings_select" on public.outbound_outreach_settings;
create policy "outbound_outreach_settings_select"
  on public.outbound_outreach_settings
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "outbound_outreach_settings_upsert" on public.outbound_outreach_settings;
create policy "outbound_outreach_settings_upsert"
  on public.outbound_outreach_settings
  for all
  using (public.is_workspace_admin(workspace_id))
  with check (public.is_workspace_admin(workspace_id));

-- outbound_outreach_messages
drop policy if exists "outbound_outreach_messages_select" on public.outbound_outreach_messages;
create policy "outbound_outreach_messages_select"
  on public.outbound_outreach_messages
  for select
  using (public.is_workspace_member(workspace_id));

drop policy if exists "outbound_outreach_messages_insert" on public.outbound_outreach_messages;
create policy "outbound_outreach_messages_insert"
  on public.outbound_outreach_messages
  for insert
  with check (public.is_workspace_admin(workspace_id));

drop policy if exists "outbound_outreach_messages_delete" on public.outbound_outreach_messages;
create policy "outbound_outreach_messages_delete"
  on public.outbound_outreach_messages
  for delete
  using (public.is_workspace_admin(workspace_id));

-- Service role can manage everything (webhooks / background jobs)
drop policy if exists "outbound_targets_service_role" on public.outbound_targets;
create policy "outbound_targets_service_role"
  on public.outbound_targets
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "outbound_outreach_settings_service_role" on public.outbound_outreach_settings;
create policy "outbound_outreach_settings_service_role"
  on public.outbound_outreach_settings
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "outbound_outreach_messages_service_role" on public.outbound_outreach_messages;
create policy "outbound_outreach_messages_service_role"
  on public.outbound_outreach_messages
  for all
  to service_role
  using (true)
  with check (true);









