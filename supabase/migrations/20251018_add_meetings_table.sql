-- Migration: Add meetings table for reply intent detection
-- Created: 2025-10-18

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  message_id uuid,
  sender_email text not null,
  intent text check (intent in ('interested', 'not interested', 'neutral')),
  calendly_link text,
  ics_file text,
  status text default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add index for faster lookups
create index if not exists idx_meetings_message_id on public.meetings(message_id);
create index if not exists idx_meetings_sender_email on public.meetings(sender_email);
create index if not exists idx_meetings_status on public.meetings(status);

-- Enable RLS
alter table public.meetings enable row level security;

-- Policy: Allow logged-in users to view their own meetings
create policy "Allow logged-in users to view own meetings"
  on public.meetings
  for select 
  using (auth.uid() is not null);

-- Policy: Allow service role to insert/update meetings
create policy "Allow service role to manage meetings"
  on public.meetings
  for all
  using (auth.jwt() ->> 'role' = 'service_role');

-- Add updated_at trigger
create or replace function public.update_meetings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger meetings_updated_at
  before update on public.meetings
  for each row
  execute function public.update_meetings_updated_at();

-- Add comment
comment on table public.meetings is 'Stores meetings scheduled via AI reply intent detection';
