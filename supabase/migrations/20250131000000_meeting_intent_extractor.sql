-- Block 473: Meeting Intent Extractor (auto-book meetings + calendar sync)
-- Creates tables for meeting availability, meetings, and meeting intent events

-- 1) meeting_availability (simple v1 availability per user)
create table if not exists meeting_availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- e.g. ["mon","tue","wed","thu","fri"]
  active_weekdays text[] not null default '{mon,tue,wed,thu,fri}',

  -- local times in HH:MM 24h format (we'll combine with timezone on the app side)
  day_start time not null default '09:00',
  day_end   time not null default '17:00',
  slot_duration_min integer not null default 30,

  timezone text not null default 'America/Los_Angeles',

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_meeting_availability_user
  on meeting_availability (user_id);

-- Ensure one availability per user
create unique index if not exists uq_meeting_availability_user
  on meeting_availability (user_id);

-- 2) meetings
create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete set null,

  status text not null check (status in ('pending','confirmed','cancelled'))
    default 'confirmed',

  provider text check (provider in ('google','outlook','manual'))
    default 'google',

  external_event_id text,  -- calendar event id

  start_at timestamptz not null,
  end_at   timestamptz not null,
  timezone text not null,

  title text not null default 'Intro Call',
  location text,           -- e.g. Zoom link, Google Meet, phone, etc.
  notes text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_meetings_user_start
  on meetings (user_id, start_at);

create index if not exists idx_meetings_lead
  on meetings (lead_id);

-- 3) meeting_intent_events (log what AI decided)
create table if not exists meeting_intent_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  meeting_id uuid references meetings(id) on delete set null,

  -- detected_no_intent / detected_intent / booked_meeting / failed_booking
  event_type text not null,
  confidence numeric,
  intent_summary text,
  raw_model_output jsonb,

  created_at timestamptz default now()
);

create index if not exists idx_meeting_intent_events_user_lead
  on meeting_intent_events (user_id, lead_id);

create index if not exists idx_meeting_intent_events_meeting
  on meeting_intent_events (meeting_id);

-- Basic RLS
alter table meeting_availability enable row level security;
alter table meetings enable row level security;
alter table meeting_intent_events enable row level security;

create policy "user can manage their availability"
  on meeting_availability
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user can see their meetings"
  on meetings
  for select using (auth.uid() = user_id);

create policy "user can insert/update their meetings"
  on meetings
  for insert, update
  with check (auth.uid() = user_id);

create policy "user can see their meeting intent events"
  on meeting_intent_events
  for select using (auth.uid() = user_id);

create policy "user can insert their meeting intent events"
  on meeting_intent_events
  for insert
  with check (auth.uid() = user_id);

-- Add updated_at trigger
create trigger trg_meeting_availability_updated_at
before update on meeting_availability
for each row
execute function public.set_updated_at();

create trigger trg_meetings_updated_at
before update on meetings
for each row
execute function public.set_updated_at();


