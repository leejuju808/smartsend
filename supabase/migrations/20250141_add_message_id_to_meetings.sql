-- Add message_id field to meetings table for auto-insert feature
-- This allows linking meetings back to the original message that triggered them

-- Add message_id column to existing meetings table
alter table if exists public.meetings 
  add column if not exists message_id uuid references public.messages(id) on delete cascade;

-- Add index for faster lookups by message_id
create index if not exists idx_meetings_message_id on public.meetings(message_id);

-- Update the comment to reflect the new functionality
comment on table public.meetings is 'Tracks meetings created from reply intent detection and auto-insert feature';