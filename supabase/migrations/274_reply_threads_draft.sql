-- Block 258 — Reply Composer v1
-- Add draft_body column to reply_threads for per-thread draft persistence

ALTER TABLE public.reply_threads
ADD COLUMN IF NOT EXISTS draft_body text;

COMMENT ON COLUMN public.reply_threads.draft_body IS 'Draft reply body saved per thread for quick recovery';









