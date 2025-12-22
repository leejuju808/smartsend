-- Block 200 — AI Auto-Tagging Rules v1
-- Add intent_primary field to reply_threads table

ALTER TABLE public.reply_threads
ADD COLUMN IF NOT EXISTS intent_primary TEXT CHECK (
  intent_primary IN (
    'meeting_intent',
    'interested',
    'not_interested',
    'referral',
    'question',
    'out_of_office',
    'unsubscribe',
    'other'
  )
) DEFAULT 'other';

-- Add index for filtering by intent
CREATE INDEX IF NOT EXISTS idx_reply_threads_intent 
ON public.reply_threads (account_id, intent_primary);

COMMENT ON COLUMN public.reply_threads.intent_primary IS 'Primary intent classification: meeting_intent, interested, not_interested, referral, question, out_of_office, unsubscribe, or other';










