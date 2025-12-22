-- Block 234 — AI Follow-Up Brain v1
-- Store AI-generated follow-up suggestions in reply_threads and inbox_threads tables

-- Add columns to reply_threads (for reply_threads-based systems)
ALTER TABLE public.reply_threads
ADD COLUMN IF NOT EXISTS ai_next_followup text,
ADD COLUMN IF NOT EXISTS ai_next_followup_variants text[];

COMMENT ON COLUMN public.reply_threads.ai_next_followup IS 'Primary AI-generated follow-up email suggestion';
COMMENT ON COLUMN public.reply_threads.ai_next_followup_variants IS 'Array of AI-generated follow-up email variants (typically 3: soft, direct, concise)';

-- Add columns to inbox_threads (for inbox-based systems like ThreadPane)
ALTER TABLE public.inbox_threads
ADD COLUMN IF NOT EXISTS ai_next_followup text,
ADD COLUMN IF NOT EXISTS ai_next_followup_variants text[];

COMMENT ON COLUMN public.inbox_threads.ai_next_followup IS 'Primary AI-generated follow-up email suggestion';
COMMENT ON COLUMN public.inbox_threads.ai_next_followup_variants IS 'Array of AI-generated follow-up email variants (typically 3: soft, direct, concise)';

