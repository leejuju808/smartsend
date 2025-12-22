-- Migration: Create meetings table for reply intent detection
-- Created: 2025-01-20
-- Description: New schema matching the exact specifications for reply intent API

-- Drop existing meetings table if it exists (be careful in production!)
-- DROP TABLE IF EXISTS public.meetings;

-- Create the meetings table with the exact schema specified
create table if not exists meetings (
  id uuid primary key default uuid_generate_v4(),
  recipient_email text not null,
  message_id uuid,
  calendly_url text,
  status text check (status in ('booked', 'pending', 'cancelled')) default 'booked',
  created_at timestamp with time zone default now()
);

-- Add indexes for better performance
create index if not exists idx_meetings_recipient_email on meetings(recipient_email);
create index if not exists idx_meetings_message_id on meetings(message_id);
create index if not exists idx_meetings_status on meetings(status);
create index if not exists idx_meetings_created_at on meetings(created_at);

-- Enable row level security
alter table meetings enable row level security;

-- Policy: Allow users to view their meetings
create policy "users can view their meetings"
  on meetings for select
  using (auth.uid() is not null);

-- Policy: Allow service role to insert meetings
create policy "service role can insert meetings"
  on meetings for insert
  with check (true);

-- Add comment
comment on table meetings is 'Stores meetings scheduled via AI reply intent detection';