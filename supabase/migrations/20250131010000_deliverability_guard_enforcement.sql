-- Ensure vw_sendable_items respects Deliverability Guard pause flags
create or replace view public.vw_sendable_items as
with caps as (
  select
    ca.id as account_id,
    coalesce(ca.daily_cap, 40) as daily_cap,
    coalesce(ca.send_start, '08:00')::time as window_start,
    coalesce(ca.send_end, '18:00')::time as window_end,
    coalesce(ca.paused, false) as paused
  from public.connected_accounts ca
),
tally as (
  select c.id as account_id, coalesce(v.sent_count_today, 0) as sent_today
  from public.connected_accounts c
  left join public.vw_account_sends_today v on v.account_id = c.id
)
select q.*
from public.send_queue q
join caps on caps.account_id = coalesce(q.account_id, q.mailbox_id)
join tally t on t.account_id = caps.account_id
left join public.campaign_steps steps on steps.id = q.step_id
left join public.step_variants variants on variants.id = q.variant_id
where q.status = 'queued'
  and coalesce(q.next_attempt_at, q.scheduled_at, now()) <= now()
  and now()::time between caps.window_start and caps.window_end
  and t.sent_today < caps.daily_cap
  and caps.paused = false
  and (q.step_id is null or coalesce(steps.paused, false) = false)
  and (q.variant_id is null or coalesce(variants.active, true) = true)
  and coalesce((select paused from public.accounts where id = q.account_id), false) = false
  and coalesce((select do_not_contact from public.leads where id = q.lead_id), false) = false
  and coalesce((select email_status from public.leads where id = q.lead_id), 'unknown') <> 'bounced'
  and coalesce((select snooze_until from public.inbox_threads where id = q.thread_id), now() - interval '1 second') <= now()
  and coalesce((select cooldown_until from public.inbox_threads where id = q.thread_id), now() - interval '1 second') <= now();

grant select on public.vw_sendable_items to service_role, authenticated;

