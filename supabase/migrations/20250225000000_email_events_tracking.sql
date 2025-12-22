-- Email Events Tracking Table
-- Tracks opens and clicks per campaign/lead

create table if not exists email_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references campaigns(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  event text check (event in ('open','click')),
  meta jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_email_events_lead_event on email_events(lead_id, event);
create index if not exists idx_email_events_campaign_event on email_events(campaign_id, event);

-- Campaign Event Stats View
-- Aggregates open/click stats per campaign
create or replace view campaign_event_stats as
select
  c.id as campaign_id,
  count(distinct e.lead_id) filter (where e.event='open') as opens,
  count(distinct e.lead_id) filter (where e.event='click') as clicks,
  round(100.0*count(distinct e.lead_id) filter (where e.event='open')/nullif(count(distinct cl.lead_id),0),2) as open_rate,
  round(100.0*count(distinct e.lead_id) filter (where e.event='click')/nullif(count(distinct cl.lead_id),0),2) as click_rate
from campaigns c
left join campaign_leads cl on cl.campaign_id=c.id
left join email_events e on e.campaign_id=c.id
group by 1;

