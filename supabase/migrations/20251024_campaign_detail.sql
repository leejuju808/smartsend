-- Per-campaign funnel rollup
create or replace view public.v_campaign_funnel as
select
  c.id as campaign_id,
  c.workspace_id,
  count(j.*)                                          as total_enqueued,
  count(*) filter (where j.status = 'sent')           as sent,
  count(*) filter (where j.delivered_at is not null)  as delivered,
  count(*) filter (where j.bounced_at   is not null)  as bounced,
  coalesce((
    select count(*) from public.email_events e
    where e.job_id = j.id and e.event_type = 'opened'
  ), 0) as _opens_dummy,  -- placeholder for join perf

  -- opens/clicks computed via subqueries for accuracy
  (
    select count(*) from public.email_events e
    where e.job_id = any(array_agg(j.id)) and e.event_type = 'opened'
  ) as opens,
  (
    select count(*) from public.email_events e
    where e.job_id = any(array_agg(j.id)) and e.event_type = 'clicked'
  ) as clicks
from public.campaigns c
left join public.email_jobs j on j.campaign_id = c.id
group by c.id, c.workspace_id;

alter view public.v_campaign_funnel set (security_invoker = on);

-- Recent events (latest 200) for a campaign
create or replace view public.v_campaign_recent_events as
select
  e.created_at,
  e.event_type,
  j.to_email,
  j.subject,
  j.id as job_id,
  j.status as job_status,
  e.payload
from public.email_events e
join public.email_jobs j on j.id = e.job_id
where j.campaign_id is not null
order by e.created_at desc
limit 200;

alter view public.v_campaign_recent_events set (security_invoker = on);

create index if not exists email_jobs_campaign_status_idx
  on public.email_jobs(campaign_id, status);