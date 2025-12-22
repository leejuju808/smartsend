-- Email Tracking System Migration
-- Creates email_events and email_links tables for comprehensive email tracking

create table if not exists email_events (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null,
  lead_id uuid not null,
  event text not null,              -- 'open' | 'click'
  link_id uuid,                     -- for clicks
  user_agent text,
  ip_inet inet,
  created_at timestamptz default now()
);
create index if not exists idx_events_campaign on email_events(campaign_id);
create index if not exists idx_events_lead on email_events(lead_id);
alter table email_events enable row level security;
create policy "events_read_own" on email_events for select using (
  exists (select 1 from campaigns c where c.id = campaign_id and c.user_id = auth.uid())
);

-- Map each rewritten link to its destination (per email send)
create table if not exists email_links (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null,
  lead_id uuid not null,
  dest_url text not null,
  created_at timestamptz default now()
);
create index if not exists idx_links_campaign on email_links(campaign_id);
alter table email_links enable row level security;
create policy "links_read_own" on email_links for select using (
  exists (select 1 from campaigns c where c.id = campaign_id and c.user_id = auth.uid())
);