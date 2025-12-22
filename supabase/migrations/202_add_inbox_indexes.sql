-- Block 202 — Replies Inbox Performance v2
-- SQL Indexes — Make Queries Blazing Fast

-- Fast lookup by intent
CREATE INDEX IF NOT EXISTS idx_reply_threads_intent
ON public.reply_threads(intent_primary);

-- Fast ordering by updated_at
CREATE INDEX IF NOT EXISTS idx_reply_threads_updated_at
ON public.reply_threads(updated_at DESC);

-- Fast filtering by campaign
CREATE INDEX IF NOT EXISTS idx_reply_threads_campaign
ON public.reply_threads(campaign_id);

-- Fast lead lookup
CREATE INDEX IF NOT EXISTS idx_reply_threads_lead
ON public.reply_threads(lead_id);

-- Fast join for latest_message
CREATE INDEX IF NOT EXISTS idx_messages_thread_id
ON public.messages(thread_id, created_at DESC);










