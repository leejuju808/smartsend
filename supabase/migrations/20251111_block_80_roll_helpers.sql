-- Block 80 helper RPC: aggregate domain-level outcomes across 1d / 7d / 30d windows.
-- Idempotent definition.

create or replace function public.rpc_domain_roll_source()
returns table(
  account_id uuid,
  domain text,
  "1d_sends" bigint, "7d_sends" bigint, "30d_sends" bigint,
  "1d_opens" bigint, "7d_opens" bigint, "30d_opens" bigint,
  "1d_clicks" bigint, "7d_clicks" bigint, "30d_clicks" bigint,
  "1d_replies" bigint, "7d_replies" bigint, "30d_replies" bigint,
  "1d_bounces" bigint, "7d_bounces" bigint, "30d_bounces" bigint,
  "1d_complaints" bigint, "7d_complaints" bigint, "30d_complaints" bigint
)
language sql
set search_path = public
as $$
with base as (
  select
    s.account_id,
    lower(split_part(s.to_email, '@', 2)) as domain,
    s.id as send_id,
    s.created_at::date as send_date
  from public.email_sends s
  where s.created_at >= (now() - interval '30 days')
    and s.to_email is not null
),
events as (
  select
    e.send_id,
    bool_or(e.type = 'open')::int as opened,
    bool_or(e.type = 'click')::int as clicked,
    bool_or(e.type = 'reply')::int as replied,
    bool_or(e.type = 'bounce')::int as bounced,
    bool_or(e.type = 'complaint')::int as complained
  from public.email_events e
  where e.created_at >= (now() - interval '30 days')
  group by e.send_id
),
joined as (
  select
    b.account_id,
    b.domain,
    b.send_date,
    1 as send,
    coalesce(ev.opened, 0) as opened,
    coalesce(ev.clicked, 0) as clicked,
    coalesce(ev.replied, 0) as replied,
    coalesce(ev.bounced, 0) as bounced,
    coalesce(ev.complained, 0) as complained
  from base b
  left join events ev on ev.send_id = b.send_id
)
select
  account_id,
  domain,
  sum(case when send_date >= current_date - interval '1 day' then send else 0 end) as "1d_sends",
  sum(case when send_date >= current_date - interval '7 day' then send else 0 end) as "7d_sends",
  sum(send) as "30d_sends",
  sum(case when send_date >= current_date - interval '1 day' then opened else 0 end) as "1d_opens",
  sum(case when send_date >= current_date - interval '7 day' then opened else 0 end) as "7d_opens",
  sum(opened) as "30d_opens",
  sum(case when send_date >= current_date - interval '1 day' then clicked else 0 end) as "1d_clicks",
  sum(case when send_date >= current_date - interval '7 day' then clicked else 0 end) as "7d_clicks",
  sum(clicked) as "30d_clicks",
  sum(case when send_date >= current_date - interval '1 day' then replied else 0 end) as "1d_replies",
  sum(case when send_date >= current_date - interval '7 day' then replied else 0 end) as "7d_replies",
  sum(replied) as "30d_replies",
  sum(case when send_date >= current_date - interval '1 day' then bounced else 0 end) as "1d_bounces",
  sum(case when send_date >= current_date - interval '7 day' then bounced else 0 end) as "7d_bounces",
  sum(bounced) as "30d_bounces",
  sum(case when send_date >= current_date - interval '1 day' then complained else 0 end) as "1d_complaints",
  sum(case when send_date >= current_date - interval '7 day' then complained else 0 end) as "7d_complaints",
  sum(complained) as "30d_complaints"
from joined
where domain is not null
group by account_id, domain;
$$;

