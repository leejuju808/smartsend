-- =========================================================
-- Block 271400 — SmartSend Resilience Sprint (foundation)
-- Storm / Surge mode: operational resilience toggle per workspace.
--
-- Adds:
-- - workspaces.resilience_mode (normal|storm|surge)
-- - workspaces.resilience_mode_set_at
-- =========================================================

alter table public.workspaces
  add column if not exists resilience_mode text not null default 'normal'
    check (resilience_mode in ('normal','storm','surge')),
  add column if not exists resilience_mode_set_at timestamptz;

comment on column public.workspaces.resilience_mode is
  'Block 271400: Operational resilience mode. normal=default, storm=protect ops (low outbound + prioritize urgent replies), surge=controlled high volume.';
comment on column public.workspaces.resilience_mode_set_at is
  'Block 271400: Timestamp when resilience_mode was last changed.';



