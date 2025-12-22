-- Block 20140 — SmartSend Inbox Conversation Thread View v1
-- Ensure inbox_messages has the right shape for conversation thread view

-- Add missing columns if they don't exist
ALTER TABLE IF EXISTS public.inbox_messages
  -- Add body text field (if only body_html exists)
  ADD COLUMN IF NOT EXISTS body TEXT,
  
  -- Add sent_at timestamp (use received_at as fallback)
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  
  -- Add raw_metadata JSONB for provider ids, headers, etc
  ADD COLUMN IF NOT EXISTS raw_metadata JSONB DEFAULT '{}'::jsonb;

-- Backfill sent_at from received_at if sent_at is null
UPDATE public.inbox_messages
SET sent_at = received_at
WHERE sent_at IS NULL AND received_at IS NOT NULL;

-- Backfill body from body_html if body is null
UPDATE public.inbox_messages
SET body = body_html
WHERE body IS NULL AND body_html IS NOT NULL;

-- Create index for conversation thread queries (conversation_id = thread_id in our system)
CREATE INDEX IF NOT EXISTS idx_inbox_messages_conversation
ON public.inbox_messages (thread_id, sent_at ASC);

-- Add comment for clarity
COMMENT ON COLUMN public.inbox_messages.thread_id IS 'References inbox_threads.id (conversation_id equivalent)';
COMMENT ON COLUMN public.inbox_messages.direction IS 'inbound (homeowner) | outbound (roofer)';
COMMENT ON COLUMN public.inbox_messages.body IS 'Message body text (fallback from body_html if needed)';
COMMENT ON COLUMN public.inbox_messages.sent_at IS 'When message was sent/received';
COMMENT ON COLUMN public.inbox_messages.raw_metadata IS 'Provider ids, headers, etc (optional)';

















































