-- Migration: Add columns for reply-intent API
-- Ensures meetings table has all necessary fields for /api/reply-intent

-- Add missing columns if they don't exist
alter table public.meetings 
  add column if not exists sender_email text,
  add column if not exists calendly_url text,
  add column if not exists ics_blob text,
  add column if not exists detected_at timestamptz;

-- Add index for sender_email lookups
create index if not exists idx_meetings_sender_email on public.meetings(sender_email);

-- Add index for detected_at for analytics
create index if not exists idx_meetings_detected_at on public.meetings(detected_at);

-- Add service role policy for API route insertions
drop policy if exists "meetings_service_insert" on public.meetings;
create policy "meetings_service_insert"
  on public.meetings for insert
  to service_role
  with check (true);

-- Add service role read policy
drop policy if exists "meetings_service_select" on public.meetings;
create policy "meetings_service_select"
  on public.meetings for select
  to service_role
  using (true);

-- Comment for documentation
comment on column public.meetings.sender_email is 'Email of the person who replied with meeting intent';
comment on column public.meetings.calendly_url is 'Calendly booking link sent in response';
comment on column public.meetings.ics_blob is 'Generated ICS calendar file content';
comment on column public.meetings.detected_at is 'When the meeting intent was detected by AI';
