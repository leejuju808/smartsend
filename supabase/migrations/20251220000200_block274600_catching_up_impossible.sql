-- =========================================================
-- BLOCK 274600 — SmartSend Permanent Advantage Sprint
-- Make “Catching Up” Impossible (time asymmetry)
--
-- Adds:
-- - workspaces.outreach_last_paused_at: persisted timestamp of the last pause event
-- - workspaces.outreach_last_resumed_at: persisted timestamp of the last resume event
--
-- Why:
-- - outreach_paused_at is nulled on resume, which destroys stop/resume history.
-- - This sprint needs durable stop/resume timestamps to enforce restart ≠ reset.
-- =========================================================

alter table public.workspaces
  add column if not exists outreach_last_paused_at timestamptz,
  add column if not exists outreach_last_resumed_at timestamptz;

comment on column public.workspaces.outreach_last_paused_at is
  'Block 274600: Persisted timestamp for the most recent outreach pause event (does not reset on resume).';
comment on column public.workspaces.outreach_last_resumed_at is
  'Block 274600: Persisted timestamp for the most recent outreach resume event.';

-- Backfill best-effort:
-- - If currently paused, last_paused_at should match outreach_paused_at.
update public.workspaces
set outreach_last_paused_at = outreach_paused_at
where outreach_state = 'paused'
  and outreach_paused_at is not null
  and outreach_last_paused_at is null;



