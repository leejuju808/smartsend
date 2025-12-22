-- BLOCK 269800 — SmartSend Final Lock Sprint
-- Make quitting feel like self-sabotage: distinguish manual pause vs billing-canceled pause.

-- ---------------------------------------------------------
-- 1) Add pause reason to workspace outreach state
-- ---------------------------------------------------------
alter table public.workspaces
  add column if not exists outreach_paused_reason text;

-- Keep it intentionally small and explicit.
alter table public.workspaces
  drop constraint if exists workspaces_outreach_paused_reason_check;

alter table public.workspaces
  add constraint workspaces_outreach_paused_reason_check
  check (
    outreach_paused_reason is null
    or outreach_paused_reason in (
      'manual',
      'billing_past_due',
      'billing_canceled',
      'system'
    )
  );

comment on column public.workspaces.outreach_paused_reason is
  'Block 269800: Why workspace outreach is paused. null when running.';




