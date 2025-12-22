-- Campaign analytics views and helpers
create or replace view public.v_inbound_replies as
select
  nm.id,
  nm.linked_thread_id as thread_id,
  t.campaign_id,
  t.lead_id,
  nm.sent_at::date as d
from public.normalized_messages nm
join public.inbox_threads t on t.id = nm.linked_thread_id
where nm.direction = 'inbound'
  and coalesce(nm.ai_label, '') in ('human_reply', 'question', 'positive', 'neutral', 'routing');

create or replace view public.v_bounces as
select
  nm.id,
  nm.linked_thread_id as thread_id,
  t.campaign_id,
  t.lead_id,
  nm.sent_at::date as d
from public.normalized_messages nm
join public.inbox_threads t on t.id = nm.linked_thread_id
where nm.direction = 'inbound'
  and coalesce(nm.ai_label, '') = 'bounce';

create or replace view public.v_sends as
select
  l.id,
  l.thread_id,
  l.campaign_id,
  l.lead_id,
  coalesce(l.created_at, now())::date as d
from public.send_logs l;

create or replace view public.v_opens as
select
  e.id,
  e.campaign_id,
  e.thread_id,
  e.lead_id,
  e.occurred_at::date as d
from public.delivery_events e
where e.event = 'open';

create or replace function public.get_campaign_series(p_campaign uuid, p_days int default 30)
returns table(
  d date,
  sends int,
  replies int,
  bounces int,
  opens int
) language sql stable as $$
  with dates as (
    select generate_series((now()::date - (p_days::int - 1)), now()::date, interval '1 day')::date as d
  ),
  s as (select d, count(*)::int c from public.v_sends where campaign_id = p_campaign group by 1),
  r as (select d, count(*)::int c from public.v_inbound_replies where campaign_id = p_campaign group by 1),
  b as (select d, count(*)::int c from public.v_bounces where campaign_id = p_campaign group by 1),
  o as (select d, count(*)::int c from public.v_opens where campaign_id = p_campaign group by 1)
  select
    dates.d,
    coalesce(s.c, 0) as sends,
    coalesce(r.c, 0) as replies,
    coalesce(b.c, 0) as bounces,
    coalesce(o.c, 0) as opens
  from dates
  left join s on s.d = dates.d
  left join r on r.d = dates.d
  left join b on b.d = dates.d
  left join o on o.d = dates.d
  order by dates.d asc;
$$;

create or replace function public.get_campaign_kpis(p_campaign uuid, p_days int default 30)
returns table(
  sends int,
  replies int,
  reply_rate numeric,
  bounces int,
  bounce_rate numeric,
  opens int,
  open_rate numeric
) language sql stable as $$
  with s as (select count(*)::int c from public.v_sends where campaign_id = p_campaign and d >= now()::date - (p_days::int - 1)),
       r as (select count(*)::int c from public.v_inbound_replies where campaign_id = p_campaign and d >= now()::date - (p_days::int - 1)),
       b as (select count(*)::int c from public.v_bounces where campaign_id = p_campaign and d >= now()::date - (p_days::int - 1)),
       o as (select count(*)::int c from public.v_opens where campaign_id = p_campaign and d >= now()::date - (p_days::int - 1))
  select
    s.c as sends,
    r.c as replies,
    case when s.c > 0 then round((r.c::numeric / s.c) * 100, 2) else 0 end as reply_rate,
    b.c as bounces,
    case when s.c > 0 then round((b.c::numeric / s.c) * 100, 2) else 0 end as bounce_rate,
    o.c as opens,
    case when s.c > 0 then round((o.c::numeric / s.c) * 100, 2) else 0 end as open_rate
  from s, r, b, o;
$$;

alter table public.send_logs enable row level security;
drop policy if exists "logs_read_members" on public.send_logs;
create policy "logs_read_members" on public.send_logs
  for select to authenticated using (public.is_campaign_viewer(campaign_id));

create or replace view public.v_campaign_totals as
select
  c.id as campaign_id,
  (select count(*) from public.v_sends s where s.campaign_id = c.id) as sends,
  (select count(*) from public.v_inbound_replies r where r.campaign_id = c.id) as replies
from public.campaigns c;


