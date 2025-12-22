-- Campaign table (create if missing); adapt if you already have one.
create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft' check (status in ('draft','running','paused','completed')),
  -- Safety/ramp settings
  daily_cap int not null default 100,
  ramp_step int not null default 50,
  max_daily_cap int not null default 1000,
  max_bounce_pct numeric not null default 3,
  max_complaint_pct numeric not null default 0.2,
  window_days int not null default 7,
  -- Runtime counters
  today_count int not null default 0,
  today_date date not null default (current_date),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.campaigns is 'Email campaigns with per-campaign send guardrails.';

-- Alerts for campaigns
create table if not exists public.campaign_alerts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  level text not null check (level in ('info','warning','error')),
  code text not null, -- e.g., 'DAILY_CAP_REACHED','BOUNCE_EVENT','COMPLAINT_EVENT','CAMPAIGN_PAUSED'
  message text not null,
  meta jsonb,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);

comment on table public.campaign_alerts is 'Operator-facing alerts specific to campaigns.';

-- Ensure messages has campaign_id + complaint flags for health math
alter table public.messages
  add column if not exists campaign_id uuid,
  add column if not exists complaint boolean default false,
  add column if not exists complained_at timestamptz;

create index if not exists idx_messages_campaign_created on public.messages (campaign_id, created_at);

-- Campaign health view
create or replace view public.v_campaign_health as
with base as (
  select
    m.campaign_id,
    count(*) filter (where m.created_at >= now() - interval '7 days' and m.direction = 'outbound') as sends_7d,
    count(*) filter (where m.created_at >= now() - interval '7 days' and m.bounce is true) as bounces_7d,
    count(*) filter (where m.created_at >= now() - interval '7 days' and m.complaint is true) as complaints_7d
  from public.messages m
  where m.campaign_id is not null
  group by 1
)
select
  c.id as campaign_id,
  c.name,
  c.status,
  c.daily_cap,
  c.ramp_step,
  c.max_daily_cap,
  c.max_bounce_pct,
  c.max_complaint_pct,
  c.window_days,
  c.today_count,
  c.today_date,
  coalesce(b.sends_7d,0) as sends_7d,
  coalesce(b.bounces_7d,0) as bounces_7d,
  coalesce(b.complaints_7d,0) as complaints_7d,
  case when coalesce(b.sends_7d,0)=0 then 0
    else round((b.bounces_7d::numeric / greatest(b.sends_7d,1)) * 100, 2) end as bounce_rate_7d,
  case when coalesce(b.sends_7d,0)=0 then 0
    else round((b.complaints_7d::numeric / greatest(b.sends_7d,1)) * 100, 3) end as complaint_rate_7d
from public.campaigns c
left join base b on b.campaign_id = c.id;

-- RLS
alter table public.campaigns enable row level security;
alter table public.campaign_alerts enable row level security;

drop policy if exists "campaigns_read" on public.campaigns;
create policy "campaigns_read" on public.campaigns for select to authenticated using (true);
revoke insert, update, delete on public.campaigns from anon, authenticated;

drop policy if exists "campaign_alerts_read" on public.campaign_alerts;
create policy "campaign_alerts_read" on public.campaign_alerts for select to authenticated using (true);
revoke insert, update, delete on public.campaign_alerts from anon, authenticated;

create index if not exists idx_campaigns_name on public.campaigns (name);
create index if not exists idx_campaign_alerts_campaign on public.campaign_alerts (campaign_id);
