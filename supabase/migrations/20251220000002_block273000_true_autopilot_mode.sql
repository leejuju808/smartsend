-- ============================================================
-- Block 273000 — True Autopilot Mode (No Overrides)
--
-- Goal:
--   SmartSend becomes the default decision maker for growth.
--   When AUTOPILOT is enabled:
--     - Volume / Area / Follow-up pressure are system-owned
--     - Owner cannot pause/throttle/tweak (enforced in API layer)
--     - System logs decisions + proof
--
-- Notes:
--   - This migration only adds state + logging tables.
--   - API enforcement is implemented in Next routes (service-role still runs triggers).
-- ============================================================

alter table public.workspaces
  add column if not exists autopilot_enabled boolean not null default false;

alter table public.workspaces
  add column if not exists autopilot_enabled_at timestamptz null;

alter table public.workspaces
  add column if not exists autopilot_locked boolean not null default false;

alter table public.workspaces
  add column if not exists autopilot_locked_at timestamptz null;

alter table public.workspaces
  add column if not exists autopilot_lock_days integer not null default 14;

comment on column public.workspaces.autopilot_enabled is
  'Block 273000: AUTOPILOT master switch. When true: owner override routes are locked.';

comment on column public.workspaces.autopilot_enabled_at is
  'Block 273000: timestamp when AUTOPILOT was enabled.';

comment on column public.workspaces.autopilot_locked is
  'Block 273000: once locked, AUTOPILOT cannot be disabled.';

comment on column public.workspaces.autopilot_locked_at is
  'Block 273000: timestamp when AUTOPILOT became irreversible.';

comment on column public.workspaces.autopilot_lock_days is
  'Block 273000: days until AUTOPILOT becomes irreversible (default 14).';

create table if not exists public.autopilot_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  decided_at timestamptz not null default now(),
  actor text not null default 'system',
  reason text null,
  metrics jsonb not null default '{}'::jsonb,
  changes jsonb not null default '{}'::jsonb
);

create index if not exists autopilot_decisions_workspace_id_decided_at_idx
  on public.autopilot_decisions(workspace_id, decided_at desc);

comment on table public.autopilot_decisions is
  'Block 273000: audit trail of system-decided growth changes (volume/area/followup pressure).';

create table if not exists public.autopilot_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid null,
  event_type text not null,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists autopilot_events_workspace_id_occurred_at_idx
  on public.autopilot_events(workspace_id, occurred_at desc);

comment on table public.autopilot_events is
  'Block 273000: enable/disable/lock timeline for AUTOPILOT.';




