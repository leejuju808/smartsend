-- Ensure messages has the fields we'll use (no-ops if already present)
alter table public.messages
  add column if not exists email_from citext,
  add column if not exists email_to citext,
  add column if not exists subject text,
  add column if not exists body_text text,
  add column if not exists body_html text,
  add column if not exists direction text,
  add column if not exists transport_message_id text,
  add column if not exists campaign_id uuid,
  add column if not exists bounce boolean default false,
  add column if not exists bounced_at timestamptz,
  add column if not exists complaint boolean default false,
  add column if not exists complained_at timestamptz;

create index if not exists idx_messages_transport_id on public.messages (transport_message_id);
create index if not exists idx_messages_to_created on public.messages (email_to, created_at);
create index if not exists idx_messages_campaign_id on public.messages (campaign_id);

-- Tighten suppressions (reason + upsert helper)
alter table public.suppressions
  add column if not exists reason text,
  add column if not exists created_by uuid;

-- Optional: a small table to log webhook deliveries for debugging
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  topic text not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

alter table public.webhook_events enable row level security;
drop policy if exists "webhook_events_read" on public.webhook_events;
create policy "webhook_events_read" on public.webhook_events for select to authenticated using (true);
revoke insert, update, delete on public.webhook_events from anon, authenticated;
comment on table public.webhook_events is 'Debug log of received webhook payloads.';

-- Assure senders/sender_alerts from previous slice exist (no-ops if already present)
create table if not exists public.senders (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  display_name text,
  daily_cap int not null default 50,
  ramp_step int not null default 25,
  max_daily_cap int not null default 250,
  max_bounce_pct numeric not null default 3,
  bounce_window_days int not null default 7,
  today_count int not null default 0,
  today_date date not null default (current_date),
  status text not null default 'active' check (status in ('active','paused_bounce','paused_manual')),
  paused_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.senders enable row level security;
drop policy if exists "senders_read" on public.senders;
create policy "senders_read" on public.senders for select to authenticated using (true);
revoke insert, update, delete on public.senders from anon, authenticated;
create index if not exists idx_senders_email on public.senders (email);

create table if not exists public.sender_alerts (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.senders(id) on delete cascade,
  level text not null check (level in ('info','warning','error')),
  code text not null,
  message text not null,
  meta jsonb,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);
alter table public.sender_alerts enable row level security;
drop policy if exists "sender_alerts_read" on public.sender_alerts;
create policy "sender_alerts_read" on public.sender_alerts for select to authenticated using (true);
revoke insert, update, delete on public.sender_alerts from anon, authenticated;
create index if not exists idx_sender_alerts_sender_id on public.sender_alerts (sender_id);

-- Campaign alerts table (for campaign-level bounce/complaint tracking)
create table if not exists public.campaign_alerts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  level text not null check (level in ('info','warning','error')),
  code text not null,
  message text not null,
  meta jsonb,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);
alter table public.campaign_alerts enable row level security;
drop policy if exists "campaign_alerts_read" on public.campaign_alerts;
create policy "campaign_alerts_read" on public.campaign_alerts for select to authenticated using (true);
revoke insert, update, delete on public.campaign_alerts from anon, authenticated;
create index if not exists idx_campaign_alerts_campaign_id on public.campaign_alerts (campaign_id);

-- Health view (if not created already)
create or replace view public.v_sender_health as
with base as (
  select
    m.email_from::citext as sender_email,
    count(*) filter (where m.created_at >= now() - interval '7 days' and m.direction = 'outbound') as sends_7d,
    count(*) filter (where m.created_at >= now() - interval '7 days' and m.bounce is true) as bounces_7d,
    count(*) filter (where m.created_at >= now() - interval '7 days' and m.complaint is true) as complaints_7d
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
  coalesce(b.complaints_7d,0) as complaints_7d,
  case
    when coalesce(b.sends_7d,0) = 0 then 0
    else round((b.bounces_7d::numeric / greatest(b.sends_7d,1)) * 100, 2)
  end as bounce_rate_7d,
  case
    when coalesce(b.sends_7d,0) = 0 then 0
    else round((b.complaints_7d::numeric / greatest(b.sends_7d,1)) * 100, 2)
  end as complaint_rate_7d
from public.senders s
left join base b on b.sender_email = s.email;
