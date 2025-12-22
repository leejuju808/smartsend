-- Campaigns
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  name text not null,
  status text not null default 'active' check (status in ('active','paused','archived')),
  created_at timestamptz not null default now()
);

create index if not exists campaigns_workspace_idx on public.campaigns(workspace_id);

-- Add campaign FK to email_jobs
alter table public.email_jobs
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;

create index if not exists email_jobs_campaign_idx on public.email_jobs(campaign_id);

-- RLS
alter table public.campaigns enable row level security;

-- service role: full access
create policy "service role full on campaigns"
on public.campaigns
as permissive
for all
to service_role
using (true)
with check (true);

-- users: CRUD in their workspace (adjust workspace ownership check as needed)
create policy "users select their campaigns"
on public.campaigns
for select
to authenticated
using (workspace_id = auth.uid());

create policy "users insert their campaigns"
on public.campaigns
for insert
to authenticated
with check (workspace_id = auth.uid());

create policy "users update their campaigns"
on public.campaigns
for update
to authenticated
using (workspace_id = auth.uid())
with check (workspace_id = auth.uid());

-- Update analytics views to include campaign breakdowns
create or replace view public.v_email_metrics_daily as
select
  date_trunc('day', j.created_at)::date as day,
  j.workspace_id,
  j.campaign_id,
  count(*) filter (where j.status in ('sent','in_progress','queued','retry_wait')) as enqueued,
  count(*) filter (where j.status = 'sent') as sent,
  count(*) filter (where j.delivered_at is not null) as delivered,
  count(*) filter (where j.bounced_at is not null) as bounced
from public.email_jobs j
where j.created_at >= now() - interval '90 days'
group by 1,2,3;

create or replace view public.v_email_events_daily as
select
  date_trunc('day', e.created_at)::date as day,
  j.workspace_id,
  j.campaign_id,
  count(*) filter (where e.event_type = 'opened')  as opens,
  count(*) filter (where e.event_type = 'clicked') as clicks
from public.email_events e
join public.email_jobs j on j.id = e.job_id
where e.created_at >= now() - interval '90 days'
group by 1,2,3;

create or replace view public.v_email_metrics_daily_merged as
select
  d.day,
  d.workspace_id,
  d.campaign_id,
  d.enqueued, d.sent, d.delivered, d.bounced,
  coalesce(ev.opens, 0)  as opens,
  coalesce(ev.clicks, 0) as clicks
from public.v_email_metrics_daily d
left join public.v_email_events_daily ev
  on ev.day = d.day
 and ev.workspace_id = d.workspace_id
 and coalesce(ev.campaign_id, '00000000-0000-0000-0000-000000000000'::uuid)
   = coalesce(d.campaign_id, '00000000-0000-0000-0000-000000000000'::uuid);

-- Domain stats by campaign (30d)
create or replace view public.v_email_domain_stats as
select
  j.workspace_id,
  j.campaign_id,
  lower(split_part(j.to_email, '@', 2)) as domain,
  count(*)                                  as total,
  count(*) filter (where j.delivered_at is not null) as delivered,
  count(*) filter (where j.bounced_at   is not null) as bounced
from public.email_jobs j
where j.created_at >= now() - interval '30 days'
group by 1,2,3;

alter view public.v_email_metrics_daily            set (security_invoker = on);
alter view public.v_email_events_daily             set (security_invoker = on);
alter view public.v_email_metrics_daily_merged     set (security_invoker = on);
alter view public.v_email_domain_stats             set (security_invoker = on);