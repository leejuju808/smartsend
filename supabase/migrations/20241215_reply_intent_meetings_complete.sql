-- Migration: Complete schema for reply-intent meetings
-- Ensures all columns needed by reply-intent-detector function and UI

-- Ensure meetings table exists with all necessary columns
do $$ 
begin
  -- Create table if it doesn't exist
  if not exists (select from pg_tables where schemaname = 'public' and tablename = 'meetings') then
    create table public.meetings (
      id uuid primary key default gen_random_uuid(),
      profile_id uuid not null references public.profiles(id) on delete cascade,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  end if;
end $$;

-- Add all columns if they don't exist (idempotent)
alter table public.meetings
  add column if not exists contact_email text,
  add column if not exists sender_email text,
  add column if not exists subject text,
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists scheduled_at timestamptz,
  add column if not exists status text default 'proposed',
  add column if not exists calendly_link text,
  add column if not exists calendly_url text,
  add column if not exists calendly_event_uri text,
  add column if not exists calendly_invitee_uri text,
  add column if not exists ics text,
  add column if not exists ics_blob text,
  add column if not exists location text,
  add column if not exists thread_id text,
  add column if not exists user_id uuid,
  add column if not exists contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null,
  add column if not exists message_id uuid references public.messages(id) on delete set null,
  add column if not exists title text default 'Discovery Call',
  add column if not exists notes text,
  add column if not exists detected_at timestamptz,
  add column if not exists reply_snippet text;

-- Add check constraint for status if not exists
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'meetings_status_check' 
    and conrelid = 'public.meetings'::regclass
  ) then
    alter table public.meetings 
      add constraint meetings_status_check 
      check (status in ('pending', 'proposed', 'sent', 'booked', 'accepted', 'declined', 'cancelled', 'scheduled', 'no_meeting'));
  end if;
end $$;

-- Create indexes for common queries
create index if not exists idx_meetings_profile_id on public.meetings(profile_id);
create index if not exists idx_meetings_user_id on public.meetings(user_id);
create index if not exists idx_meetings_contact_email on public.meetings(contact_email);
create index if not exists idx_meetings_sender_email on public.meetings(sender_email);
create index if not exists idx_meetings_status on public.meetings(status);
create index if not exists idx_meetings_scheduled_at on public.meetings(scheduled_at);
create index if not exists idx_meetings_created_at on public.meetings(created_at desc);
create index if not exists idx_meetings_thread_id on public.meetings(thread_id);

-- Add updated_at trigger if not exists
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_meetings_touch on public.meetings;
create trigger trg_meetings_touch 
  before update on public.meetings
  for each row execute function public.touch_updated_at();

-- Enable RLS
alter table public.meetings enable row level security;

-- Drop old policies if they exist
drop policy if exists p_meetings_select on public.meetings;
drop policy if exists p_meetings_insert on public.meetings;
drop policy if exists p_meetings_update on public.meetings;
drop policy if exists p_meetings_delete on public.meetings;
drop policy if exists "own meetings" on public.meetings;
drop policy if exists "meetings_service_insert" on public.meetings;
drop policy if exists "meetings_service_select" on public.meetings;

-- Create comprehensive RLS policies
-- Users can view their own meetings (matched by profile_id or user_id)
create policy p_meetings_select on public.meetings
  for select using (
    auth.uid() = profile_id 
    or auth.uid() = user_id
  );

-- Users can insert their own meetings
create policy p_meetings_insert on public.meetings
  for insert with check (
    auth.uid() = profile_id 
    or auth.uid() = user_id
  );

-- Users can update their own meetings
create policy p_meetings_update on public.meetings
  for update using (
    auth.uid() = profile_id 
    or auth.uid() = user_id
  );

-- Users can delete their own meetings
create policy p_meetings_delete on public.meetings
  for delete using (
    auth.uid() = profile_id 
    or auth.uid() = user_id
  );

-- Service role has full access (for Edge Functions)
create policy meetings_service_all on public.meetings
  to service_role
  using (true)
  with check (true);

-- Add helpful comments
comment on table public.meetings is 'Stores meeting bookings detected from email replies via AI intent classification';
comment on column public.meetings.contact_email is 'Email of the person who replied with meeting intent';
comment on column public.meetings.sender_email is 'Alternative field for sender email';
comment on column public.meetings.subject is 'Email subject line';
comment on column public.meetings.start_at is 'Proposed meeting start time';
comment on column public.meetings.end_at is 'Proposed meeting end time';
comment on column public.meetings.status is 'Meeting status: pending, proposed, sent, booked, accepted, declined, cancelled, no_meeting';
comment on column public.meetings.calendly_link is 'Calendly booking link sent in response';
comment on column public.meetings.ics is 'Generated ICS calendar file content';
comment on column public.meetings.thread_id is 'Email thread ID for correlation';
comment on column public.meetings.profile_id is 'Owner user ID (references profiles)';
comment on column public.meetings.user_id is 'Alternative user ID field for compatibility';
