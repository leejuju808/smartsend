-- Enable snooze timestamps on follow-up tasks (idempotent)
alter table public.followup_tasks
  add column if not exists snooze_until timestamptz;

create index if not exists idx_followup_tasks_snooze
  on public.followup_tasks (campaign_id, lead_id, status, snooze_until)
  where status = 'paused' and snooze_until is not null;





