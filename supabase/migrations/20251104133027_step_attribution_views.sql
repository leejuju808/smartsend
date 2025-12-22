-- Step Attribution System
-- A) Persist step numbers on queue + logs (idempotent)

alter table public.send_queue
  add column if not exists step_no int default 1 check (step_no >= 1);

alter table public.send_logs
  add column if not exists step_no int;

create index if not exists idx_sq_campaign_step on public.send_queue(campaign_id, step_no);
create index if not exists idx_logs_campaign_step on public.send_logs(campaign_id, step_no);

-- B) Safe function: attribute a reply to the most recent outbound step before the reply

create or replace function public.reply_step_for(camp uuid, lead uuid, reply_at timestamptz)
returns int
language sql stable
as $$
  select coalesce(
    (select sl.step_no
       from public.send_logs sl
      where sl.campaign_id = camp
        and sl.lead_id = lead
        and sl.status = 'sent'
        and sl.created_at <= reply_at
      order by sl.created_at desc
      limit 1),
    1
  )::int;
$$;

-- C) Daily sent per step (for denominators)

create or replace view public.v_step_sent_daily as
select
  campaign_id,
  step_no,
  (created_at at time zone 'UTC')::date as day,
  count(*)::int as sent
from public.send_logs
where status = 'sent'
group by 1,2,3;

-- D) Daily replies per step (attribute to latest sent before reply)
--   We treat each thread-day as 0/1 reply; attribution uses reply timestamp.

create or replace view public.v_step_replies_daily as
with replies as (
  select
    t.campaign_id,
    t.lead_id,
    min(coalesce(m.received_at, m.sent_at)) as first_reply_at  -- first reply on the thread
  from public.inbox_threads t
  join public.inbox_messages m on m.thread_id = t.id
  where m.direction = 'in'
  group by 1,2
)
select
  r.campaign_id,
  public.reply_step_for(r.campaign_id, r.lead_id, r.first_reply_at) as step_no,
  (r.first_reply_at at time zone 'UTC')::date as day,
  count(*)::int as replies
from replies r
group by 1,2,3;

-- E) Step aggregate (lifetime + 7d) with rates

create or replace view public.v_step_summary as
with sent_all as (
  select campaign_id, step_no, count(*)::int as sent_all
  from public.send_logs where status='sent'
  group by 1,2
),
sent_7 as (
  select campaign_id, step_no, count(*)::int as sent_7d
  from public.send_logs
  where status='sent' and created_at >= now() - interval '7 days'
  group by 1,2
),
rep_all as (
  select campaign_id, step_no, count(*)::int as replies_all
  from public.v_step_replies_daily
  group by 1,2
),
rep_7 as (
  select campaign_id, step_no, count(*)::int as replies_7d
  from public.v_step_replies_daily
  where day >= (now() - interval '7 days')::date
  group by 1,2
)
select
  coalesce(sa.campaign_id, s7.campaign_id, ra.campaign_id, r7.campaign_id) as campaign_id,
  coalesce(sa.step_no, s7.step_no, ra.step_no, r7.step_no) as step_no,
  coalesce(sa.sent_all,0) as sent_all,
  coalesce(s7.sent_7d,0) as sent_7d,
  coalesce(ra.replies_all,0) as replies_all,
  coalesce(r7.replies_7d,0) as replies_7d,
  case when coalesce(s7.sent_7d,0) > 0 then round((coalesce(r7.replies_7d,0))::numeric / s7.sent_7d, 4) else 0 end as reply_rate_7d
from sent_all sa
full outer join sent_7 s7 on s7.campaign_id=sa.campaign_id and s7.step_no=sa.step_no
full outer join rep_all ra on ra.campaign_id=coalesce(sa.campaign_id,s7.campaign_id) and ra.step_no=coalesce(sa.step_no,s7.step_no)
full outer join rep_7 r7 on r7.campaign_id=coalesce(sa.campaign_id,s7.campaign_id,ra.campaign_id) and r7.step_no=coalesce(sa.step_no,s7.step_no,ra.step_no);
