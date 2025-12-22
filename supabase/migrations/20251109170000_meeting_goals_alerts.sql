-- Meeting goals and alerts tables
create table if not exists public.meeting_goals (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  created_at timestamptz not null default now(),
  intent_to_booked_target numeric(5,2) not null default 40.0,
  median_book_time_target int not null default 86400,
  alert_recipients text[] not null default '{}',
  active boolean not null default true
);

create table if not exists public.meeting_alerts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  metric text not null,
  actual numeric(10,2),
  target numeric(10,2),
  level text not null default 'warn',
  message text not null,
  sent_to text[]
);

create index if not exists idx_meeting_alerts_campaign on public.meeting_alerts (campaign_id);

