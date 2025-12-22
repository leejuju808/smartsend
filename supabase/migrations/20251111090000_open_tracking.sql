-- Raw opens
create table if not exists public.open_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  message_id text,
  pixel text not null,
  ip inet,
  ua text,
  via text,
  is_counted boolean not null default true
);

create index if not exists idx_open_events_pixel on public.open_events(pixel);
create index if not exists idx_open_events_account_time on public.open_events(account_id, created_at);

-- Pixel registry
create table if not exists public.message_pixels (
  pixel text primary key,
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  message_id text,
  track_enabled boolean not null default true,
  gdpr_optout boolean not null default false
);

create index if not exists idx_message_pixels_account on public.message_pixels(account_id);

-- Aggregates for UI
create or replace view public.open_stats as
select
  mp.account_id,
  mp.campaign_id,
  mp.lead_id,
  mp.message_id,
  mp.pixel,
  min(oe.created_at) filter (where oe.is_counted) as first_open_at,
  count(oe.*) filter (where oe.is_counted)::int as total_opens,
  count(oe.*)::int as raw_opens
from public.message_pixels mp
left join public.open_events oe on oe.pixel = mp.pixel
group by mp.account_id, mp.campaign_id, mp.lead_id, mp.message_id, mp.pixel;

-- Per-lead convenient rollup
create or replace view public.lead_open_summary as
select
  lead_id,
  count(distinct pixel)::int as messages_tracked,
  count(*) filter (where first_open_at is not null)::int as messages_opened,
  coalesce(sum(total_opens), 0)::int as opens_counted
from public.open_stats
group by lead_id;

-- Enable RLS
alter table public.message_pixels enable row level security;
alter table public.open_events enable row level security;

-- Account configuration
alter table public.accounts
  add column if not exists track_opens boolean not null default true,
  add column if not exists tracking_host text;

create policy read_own_pixels on public.message_pixels for select using (
  exists (
    select 1
    from public.team_members tm
    where tm.account_id = message_pixels.account_id
      and tm.user_id = auth.uid()
  )
);

create policy read_own_opens on public.open_events for select using (
  exists (
    select 1
    from public.team_members tm
    where tm.account_id = open_events.account_id
      and tm.user_id = auth.uid()
  )
);

