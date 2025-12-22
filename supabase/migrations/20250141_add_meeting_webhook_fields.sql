-- Add missing fields to meetings table for Calendly webhook integration
-- These fields are needed for the enhanced meetings page functionality

-- Add external source tracking
alter table if exists public.meetings
  add column if not exists external_source text,
  add column if not exists external_event_id text;

-- Add Calendly webhook fields
alter table if exists public.meetings
  add column if not exists invitee_uri text,
  add column if not exists event_uri text;

-- Add booking timestamp
alter table if not exists public.meetings
  add column if not exists booked_at timestamptz;

-- Add helpful indexes for the new fields
create index if not exists idx_meetings_external_source on public.meetings(external_source);
create index if not exists idx_meetings_booked_at on public.meetings(booked_at);

-- Add comment for documentation
comment on column public.meetings.external_source is 'Source system that created this meeting (e.g., "calendly", "gmail")';
comment on column public.meetings.external_event_id is 'External system event ID for reference';
comment on column public.meetings.invitee_uri is 'Calendly invitee URI from webhook';
comment on column public.meetings.event_uri is 'Calendly event URI from webhook';
comment on column public.meetings.booked_at is 'Timestamp when meeting was confirmed/booked'; 