-- Email Tracking System (Team-Scoped)
-- Tracks opens and clicks with per-link analytics

-- 1. email_events table
create table if not exists email_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  email_id uuid references email_messages(id) on delete set null, -- outbound email row id
  type text not null check (type in ('open','click')),
  link_id uuid references email_links(id) on delete set null,
  ip inet,
  ua text,
  created_at timestamptz not null default now()
);

create index if not exists email_events_team_created_at on email_events (team_id, created_at desc);
create index if not exists email_events_type on email_events (type);
create index if not exists email_events_campaign on email_events (campaign_id);

-- 2. email_links table (links per outbound email for CTR, per-link stats)
create table if not exists email_links (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,
  email_id uuid references email_messages(id) on delete cascade,
  ordinal int not null, -- 1..N in the email
  url text not null,
  clicks_count int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists email_links_unique_ord on email_links (email_id, ordinal);
create index if not exists email_links_campaign on email_links (campaign_id);

-- 3. Fast campaign aggregates view
create or replace view v_campaign_metrics as
select
  e.team_id,
  e.campaign_id,
  count(*) filter (where e.type='open') as opens,
  count(*) filter (where e.type='click') as clicks
from email_events e
group by 1,2;

-- 4. RLS (uses is_member_of from teams system)
alter table email_events enable row level security;
alter table email_links enable row level security;

drop policy if exists "events in my teams" on email_events;
create policy "events in my teams" on email_events
  for all using (is_member_of(team_id)) with check (is_member_of(team_id));

drop policy if exists "links in my teams" on email_links;
create policy "links in my teams" on email_links
  for all using (is_member_of(team_id)) with check (is_member_of(team_id));

-- 5. RPC helper to safely increment clicks
create or replace function increment_clicks(p_link_id uuid)
returns void language sql security definer as $$
  update email_links set clicks_count = clicks_count + 1 where id = p_link_id;
$$;

