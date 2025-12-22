-- Block 202 — Replies Inbox Performance v2
-- Lightweight Thread Preview Table (denormalized)
-- Purpose: never join messages on the inbox list

CREATE TABLE IF NOT EXISTS public.thread_previews (
  thread_id uuid PRIMARY KEY REFERENCES public.reply_threads(id) ON DELETE CASCADE,
  last_message_body text,
  last_message_direction text CHECK (last_message_direction IN ('inbound', 'outbound')),
  last_message_at timestamptz
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_thread_previews_thread_id
ON public.thread_previews(thread_id);

COMMENT ON TABLE public.thread_previews IS 'Denormalized preview table storing latest message snippet per thread for fast inbox loading';










