-- SENDER ACCOUNTS (abstract sending identity; you can map to SMTP creds later)
create table if not exists public.senders (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  display_name text,
  -- Safety/ramp settings
  daily_cap int not null default 50,
  ramp_step int not null default 25,          -- how many to add per day until daily_cap
  max_daily_cap int not null default 250,     -- hard ceiling
  max_bounce_pct numeric not null default 3,  -- stop if >= this % over the rolling window
  bounce_window_days int not null default 7,  -- rolling window days for bounce calc
  -- Runtime counters
  today_count int not null default 0,
  today_date date not null default (current_date),
  status text not null default 'active' check (status in ('active','paused_bounce','paused_manual')),
  paused_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.senders is 'Per-sender sending guardrails and counters.';

-- ALERTS
create table if not exists public.sender_alerts (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.senders(id) on delete cascade,
  level text not null check (level in ('info','warning','error')),
  code text not null, -- e.g., 'BOUNCE_SPIKE','DAILY_CAP_REACHED','SENDER_PAUSED'
  message text not null,
  meta jsonb,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);

comment on table public.sender_alerts is 'Operator-facing alerts for send safety.';

-- BASIC VIEW to compute rolling bounce rate using messages table
-- Assumptions:
--   public.messages(email_from text/citext, created_at timestamptz, bounce bool)
-- If your schema differs, adjust the fields below.
create or replace view public.v_sender_health as
with base as (
  select
    m.email_from::citext as sender_email,
    count(*) filter (where m.created_at >= now() - interval '7 days' and m.direction = 'outbound') as sends_7d,
    count(*) filter (where m.created_at >= now() - interval '7 days' and m.bounce is true) as bounces_7d
  from public.messages m
  group by 1
)
select
  s.id as sender_id,
  s.email as sender_email,
  s.status,
  s.daily_cap,
  s.ramp_step,
  s.max_daily_cap,
  s.max_bounce_pct,
  s.bounce_window_days,
  s.today_count,
  s.today_date,
  coalesce(b.sends_7d,0) as sends_7d,
  coalesce(b.bounces_7d,0) as bounces_7d,
  case
    when coalesce(b.sends_7d,0) = 0 then 0
    else round((b.bounces_7d::numeric / greatest(b.sends_7d,1)) * 100, 2)
  end as bounce_rate_7d
from public.senders s
left join base b on b.sender_email = s.email;

-- RLS
alter table public.senders enable row level security;
alter table public.sender_alerts enable row level security;

-- For now, allow authenticated users to read (tighten later with workspace_id).
drop policy if exists "senders_read" on public.senders;
create policy "senders_read" on public.senders for select to authenticated using (true);
revoke insert, update, delete on public.senders from anon, authenticated;

drop policy if exists "sender_alerts_read" on public.sender_alerts;
create policy "sender_alerts_read" on public.sender_alerts for select to authenticated using (true);
revoke insert, update, delete on public.sender_alerts from anon, authenticated;

-- Helpful indices
create index if not exists idx_senders_email on public.senders (email);
create index if not exists idx_sender_alerts_sender_id on public.sender_alerts (sender_id);
