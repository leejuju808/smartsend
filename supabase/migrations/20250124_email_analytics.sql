-- Daily rollups per workspace (last 90 days)
create or replace view public.v_email_daily as
select
  date_trunc('day', j.created_at)::date as day,
  j.workspace_id,
  count(*) filter (where j.status in ('sent','in_progress','queued','retry_wait')) as enqueued,
  count(*) filter (where j.status = 'sent') as sent,
  count(*) filter (where j.delivered_at is not null) as delivered,
  count(*) filter (where j.bounced_at is not null) as bounced
from public.email_jobs j
where j.created_at >= now() - interval '90 days'
group by 1,2;

-- Event-based opens/clicks by day (based on when they happened)
create or replace view public.v_email_events_daily as
select
  date_trunc('day', e.created_at)::date as day,
  j.workspace_id,
  count(*) filter (where e.event_type = 'opened')  as opens,
  count(*) filter (where e.event_type = 'clicked') as clicks
from public.email_events e
join public.email_jobs j on j.id = e.job_id
where e.created_at >= now() - interval '90 days'
group by 1,2;

-- Convenience view merged
create or replace view public.v_email_metrics_daily as
select
  d.day,
  d.workspace_id,
  d.enqueued,
  d.sent,
  d.delivered,
  d.bounced,
  coalesce(ev.opens, 0)  as opens,
  coalesce(ev.clicks, 0) as clicks
from public.v_email_daily d
left join public.v_email_events_daily ev
  on ev.day = d.day and ev.workspace_id = d.workspace_id;

-- Domain breakdown (useful for deliverability)
create or replace view public.v_email_domain_stats as
select
  j.workspace_id,
  lower(split_part(j.to_email, '@', 2)) as domain,
  count(*)                                  as total,
  count(*) filter (where j.delivered_at is not null) as delivered,
  count(*) filter (where j.bounced_at   is not null) as bounced
from public.email_jobs j
where j.created_at >= now() - interval '30 days'
group by 1,2;

-- RLS passthrough: base tables already enforce read-by-workspace.
-- Mark views as security invoker to honor caller's rights.
alter view public.v_email_daily            set (security_invoker = on);
alter view public.v_email_events_daily     set (security_invoker = on);
alter view public.v_email_metrics_daily    set (security_invoker = on);
alter view public.v_email_domain_stats     set (security_invoker = on);