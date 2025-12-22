-- SENDER HEALTH & POLICIES SYSTEM
-- Tracks sender reputation, bounce rates, and enforces daily send caps with warmup ramps

-- SENDER POLICIES (per sending identity / mailbox)
create table if not exists public.send_policies (
  id uuid primary key default gen_random_uuid(),
  sender_email text not null unique,
  -- ramp config
  daily_cap_start int not null default 25,        -- day 1 cap
  daily_cap_max int not null default 200,         -- ceiling
  daily_cap_step int not null default 25,         -- per day increase
  warmup_start_date date not null default current_date,
  -- safety thresholds
  hard_bounce_threshold numeric not null default 0.03, -- 3%
  soft_bounce_threshold numeric not null default 0.08, -- 8%
  complaint_threshold numeric not null default 0.001,  -- 0.1%
  paused boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists send_policies_sender_email_idx on public.send_policies(sender_email);

-- DAILY STATS (rolled up per sender per day)
create table if not exists public.sender_stats_daily (
  id uuid primary key default gen_random_uuid(),
  sender_email text not null,
  day date not null,
  sends int not null default 0,
  delivered int not null default 0,
  soft_bounces int not null default 0,
  hard_bounces int not null default 0,
  complaints int not null default 0,
  unique (sender_email, day)
);
create index if not exists sender_stats_daily_sender_day_idx on public.sender_stats_daily(sender_email, day);

-- RAW BOUNCE/COMPLAINT EVENTS (from provider webhooks)
create type bounce_kind as enum ('soft','hard','complaint');
create table if not exists public.bounce_events (
  id uuid primary key default gen_random_uuid(),
  provider text,
  provider_message_id text,
  sender_email text not null,
  recipient_email text not null,
  kind bounce_kind not null,
  reason text,
  occurred_at timestamptz not null default now(),
  day date generated always as (date(occurred_at)) stored
);
create index if not exists bounce_events_sender_day_idx on public.bounce_events(sender_email, day);

-- OPTIONAL: messages table may already exist; if not, a lightweight log:
create table if not exists public.send_attempts (
  id uuid primary key default gen_random_uuid(),
  sender_email text not null,
  recipient_email text not null,
  campaign_id uuid,
  msg_id text,      -- your internal id
  provider_message_id text,
  attempted_at timestamptz default now()
);
create index if not exists send_attempts_sender_day_idx on public.send_attempts(sender_email, (date(attempted_at)));

-- RLS (permissive read; insert via service role)
alter table public.send_policies enable row level security;
alter table public.sender_stats_daily enable row level security;
alter table public.bounce_events enable row level security;
alter table public.send_attempts enable row level security;

create policy "read auth - policies" on public.send_policies for select to authenticated using (true);
create policy "read auth - stats" on public.sender_stats_daily for select to authenticated using (true);
create policy "read auth - bounces" on public.bounce_events for select to authenticated using (true);
create policy "read auth - attempts" on public.send_attempts for select to authenticated using (true);

create policy "insert service - policies" on public.send_policies for insert to service_role with check (true);
create policy "insert service - stats" on public.sender_stats_daily for insert to service_role with check (true);
create policy "insert service - bounces" on public.bounce_events for insert to service_role with check (true);
create policy "insert service - attempts" on public.send_attempts for insert to service_role with check (true);

create policy "update service - policies" on public.send_policies for update to service_role using (true) with check (true);
create policy "update service - stats" on public.sender_stats_daily for update to service_role using (true) with check (true);

-- VIEW: compute current health band for a sender for today
create or replace view public.sender_health_today as
select
  p.sender_email,
  p.paused,
  p.daily_cap_start,
  p.daily_cap_max,
  p.daily_cap_step,
  p.warmup_start_date,
  p.hard_bounce_threshold,
  p.soft_bounce_threshold,
  p.complaint_threshold,
  coalesce(s.sends,0) as sends_today,
  coalesce(s.hard_bounces,0) as hard_bounces_today,
  coalesce(s.soft_bounces,0) as soft_bounces_today,
  coalesce(s.complaints,0) as complaints_today,
  case
    when p.paused then 'red'
    when coalesce(s.sends,0) = 0 then 'green'
    else
      case
        when (coalesce(s.hard_bounces,0)::numeric / nullif(s.sends,0)) > p.hard_bounce_threshold
          or (coalesce(s.soft_bounces,0)::numeric / nullif(s.sends,0)) > p.soft_bounce_threshold
          or (coalesce(s.complaints,0)::numeric / nullif(s.sends,0)) > p.complaint_threshold
          then 'red'
        when (coalesce(s.hard_bounces,0)::numeric / nullif(s.sends,0)) > (p.hard_bounce_threshold*0.5)
          or (coalesce(s.soft_bounces,0)::numeric / nullif(s.sends,0)) > (p.soft_bounce_threshold*0.5)
          then 'yellow'
        else 'green'
      end
  end as health_color
from public.send_policies p
left join public.sender_stats_daily s
  on s.sender_email = p.sender_email
  and s.day = current_date;
