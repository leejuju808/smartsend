-- Campaign Analytics Migration
-- Create campaigns table and analytics views

create table if not exists campaigns (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table campaigns enable row level security;

create policy "own campaigns" on campaigns
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- helpful indexes
create index if not exists campaigns_user_idx on campaigns(user_id, created_at desc);

-- metrics: per job, count opens/clicks
create or replace view v_job_metrics as
select
  j.id as job_id,
  j.campaign_id,
  j.user_id,
  j.to_email,
  j.sent_at,
  coalesce(s.opens, 0) as opens,
  coalesce(s.clicks, 0) as clicks,
  s.first_open_at,
  s.first_click_at
from email_jobs j
left join email_sends s on s.job_id = j.id;

-- metrics: per campaign aggregates (unique opens/clicks by recipient)
create or replace view v_campaign_metrics as
with base as (
  select
    campaign_id,
    user_id,
    count(*) filter (where status in ('sent','failed','canceled','processing','queued')) as total_jobs,
    count(*) filter (where status = 'sent') as sent_jobs
  from email_jobs
  group by campaign_id, user_id
),
uniq as (
  select
    campaign_id,
    user_id,
    count(distinct case when vm.opens > 0 then vm.to_email end) as unique_opens,
    count(distinct case when vm.clicks > 0 then vm.to_email end) as unique_clicks
  from v_job_metrics vm
  group by campaign_id, user_id
)
select
  c.id as campaign_id,
  c.name,
  c.user_id,
  b.total_jobs,
  b.sent_jobs,
  coalesce(u.unique_opens, 0) as unique_opens,
  coalesce(u.unique_clicks, 0) as unique_clicks,
  case when b.sent_jobs > 0 then round(u.unique_opens::numeric * 100 / b.sent_jobs, 1) else 0 end as open_rate_pct,
  case when b.sent_jobs > 0 then round(u.unique_clicks::numeric * 100 / b.sent_jobs, 1) else 0 end as click_rate_pct,
  c.created_at
from campaigns c
left join base b on b.campaign_id = c.id and b.user_id = c.user_id
left join uniq u on u.campaign_id = c.id and u.user_id = c.user_id
order by c.created_at desc;