-- Email Events Analytics System
-- Creates email_events table, materialized view for campaign stats, and auto-refresh trigger

-- 1. Email events table
create table if not exists email_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  campaign_id uuid,
  message_id uuid,
  event_type text not null check (event_type in ('delivered','opened','clicked','bounced','replied')),
  event_time timestamptz not null default now(),
  meta jsonb default '{}'::jsonb
);

create index if not exists idx_events_campaign on email_events(campaign_id, event_type);
create index if not exists idx_events_time on email_events(event_time desc);
create index if not exists idx_events_org on email_events(org_id);

-- 2. Materialized campaign stats view
drop materialized view if exists mv_campaign_stats;
create materialized view mv_campaign_stats as
select
  c.id as campaign_id,
  c.org_id,
  c.name,
  count(*) filter (where e.event_type='delivered') as delivered,
  count(*) filter (where e.event_type='opened') as opened,
  count(*) filter (where e.event_type='clicked') as clicked,
  count(*) filter (where e.event_type='bounced') as bounced,
  count(*) filter (where e.event_type='replied') as replied,
  round(100.0 * count(*) filter (where e.event_type='opened') / nullif(count(*) filter (where e.event_type='delivered'),0),1) as open_rate,
  round(100.0 * count(*) filter (where e.event_type='clicked') / nullif(count(*) filter (where e.event_type='delivered'),0),1) as click_rate,
  round(100.0 * count(*) filter (where e.event_type='replied') / nullif(count(*) filter (where e.event_type='delivered'),0),1) as reply_rate,
  max(e.event_time) as last_event
from email_events e
join campaigns c on c.id = e.campaign_id
group by 1,2,3;

create unique index if not exists idx_mv_campaign_stats_unique on mv_campaign_stats(campaign_id);
create index if not exists idx_mv_campaign_stats_org on mv_campaign_stats(org_id);

-- 3. Trigger for auto refresh
create or replace function refresh_mv_campaign_stats()
returns trigger language plpgsql as $$
begin
  refresh materialized view concurrently mv_campaign_stats;
  return null;
end;
$$;

drop trigger if exists trg_refresh_mv_campaign_stats on email_events;
create trigger trg_refresh_mv_campaign_stats
  after insert or delete or update on email_events
  for each statement execute procedure refresh_mv_campaign_stats();

-- Initial refresh
refresh materialized view mv_campaign_stats;

-- RLS Policies
alter table email_events enable row level security;

create policy "email_events_select_own_org"
  on email_events for select
  using (org_id in (
    select org_id from orgs o
    join org_members om on om.org_id = o.id
    where om.user_id = auth.uid()
  ));

create policy "email_events_insert_service"
  on email_events for insert
  to service_role
  with check (true);

-- Grant permissions on materialized view
grant select on mv_campaign_stats to authenticated;

