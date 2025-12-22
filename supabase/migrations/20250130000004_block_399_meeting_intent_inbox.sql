-- Block 399 — Meeting Intent Inbox v1
-- Indexes for fast meeting-intent queries on reply_logs

-- Index on ai_meeting_intent for filtering
create index if not exists idx_reply_logs_ai_meeting_intent
  on public.reply_logs (ai_meeting_intent)
  where ai_meeting_intent is not null;

-- Composite index for workspace-scoped meeting intent queries with date ordering
create index if not exists idx_reply_logs_workspace_meeting
  on public.reply_logs (workspace_id, ai_meeting_intent, received_at desc)
  where workspace_id is not null 
    and ai_meeting_intent is not null
    and ai_meeting_intent in ('meeting_requested', 'meeting_confirmed', 'followup_needed');




