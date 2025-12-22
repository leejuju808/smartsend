alter table public.inbox_threads
  add column if not exists snoozed_until timestamptz,
  add column if not exists assigned_to uuid references auth.users(id) on delete set null;

create index if not exists idx_threads_snoozed on public.inbox_threads (snoozed_until);
create index if not exists idx_threads_assigned on public.inbox_threads (assigned_to);

create or replace view public.v_inbox_threads as
select
  t.*,
  coalesce(t.ai_intent, 'unknown') as ai_intent_safe,
  coalesce(t.ai_confidence, 0.0) as ai_confidence_safe,
  (t.snoozed_until is not null and t.snoozed_until > now()) as is_snoozed,
  exists (
    select 1
    from public.followup_tasks f
    where f.lead_id = t.lead_id
      and f.done = false
      and coalesce(f.paused, false) = true
  ) as is_paused
from public.inbox_threads t;

alter view public.v_inbox_threads set (security_invoker = on);



