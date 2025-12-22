-- Ensure ai_reply_events table has columns needed for reply intent detection
-- This migration is idempotent and safe to run multiple times

-- Add columns if they don't exist
alter table if exists public.ai_reply_events
  add column if not exists intent_label text,
  add column if not exists confidence numeric,
  add column if not exists action_taken text,
  add column if not exists metadata jsonb default '{}'::jsonb;

-- Add helpful indexes for filtering and querying
create index if not exists idx_ai_reply_events_intent on public.ai_reply_events(intent_label);
create index if not exists idx_ai_reply_events_action on public.ai_reply_events(action_taken);
create index if not exists idx_ai_reply_events_contact on public.ai_reply_events(contact_email);

-- Comment for documentation
comment on column public.ai_reply_events.intent_label is 'The classified intent: positive_meeting_intent, neutral, or negative';
comment on column public.ai_reply_events.action_taken is 'Action taken based on intent: meeting_proposed, none, etc.';
comment on column public.ai_reply_events.metadata is 'Additional metadata about the reply event (messageId, threadId, etc.)';
