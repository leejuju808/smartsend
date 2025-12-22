-- Block 204 — Replies Inbox Search v1
-- Create Full-Text Search Vector for reply_threads
-- Indexes intent_primary and status for fast search

ALTER TABLE public.reply_threads
ADD COLUMN IF NOT EXISTS search_tsv tsvector;

-- Build vector from intent_primary and status
UPDATE public.reply_threads t
SET search_tsv = to_tsvector(
  coalesce(t.intent_primary, '') || ' ' ||
  coalesce(t.status, '')
);

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_reply_threads_search
ON public.reply_threads
USING GIN (search_tsv);

COMMENT ON COLUMN public.reply_threads.search_tsv IS 'Full-text search vector combining intent_primary and status for fast inbox search';










