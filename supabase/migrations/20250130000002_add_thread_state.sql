-- Block 203 — Thread State System v1
-- Add state field to reply_threads table

ALTER TABLE public.reply_threads
ADD COLUMN IF NOT EXISTS state TEXT CHECK (
  state IN (
    'open',
    'needs_reply',
    'replied',
    'closed'
  )
) DEFAULT 'open';

-- Create index for state filtering
CREATE INDEX IF NOT EXISTS idx_reply_threads_state 
ON public.reply_threads(account_id, state, last_message_at DESC);

-- Update existing threads: if status is 'closed', set state to 'closed'
-- Otherwise, default to 'open' (will be updated by triggers going forward)
UPDATE public.reply_threads
SET state = CASE 
  WHEN status = 'closed' THEN 'closed'
  ELSE 'open'
END
WHERE state IS NULL;










