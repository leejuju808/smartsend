-- Block 238 — Smart Intent Routing v1
-- Add intent routing fields to reply_threads table

ALTER TABLE public.reply_threads
ADD COLUMN IF NOT EXISTS routed_to text,
ADD COLUMN IF NOT EXISTS snooze_until timestamptz,
ADD COLUMN IF NOT EXISTS unsubscribed boolean DEFAULT false;

-- Add index for filtering by routed_to (inbox buckets)
CREATE INDEX IF NOT EXISTS idx_reply_threads_routed_to 
ON public.reply_threads (account_id, routed_to);

-- Add index for snoozed threads
CREATE INDEX IF NOT EXISTS idx_reply_threads_snooze_until 
ON public.reply_threads (account_id, snooze_until) 
WHERE snooze_until IS NOT NULL;

-- Add index for unsubscribed threads
CREATE INDEX IF NOT EXISTS idx_reply_threads_unsubscribed 
ON public.reply_threads (account_id, unsubscribed) 
WHERE unsubscribed = true;

COMMENT ON COLUMN public.reply_threads.routed_to IS 'Inbox bucket: Meeting, Interested, Not Interested, Unsubscribed, Snoozed, General';
COMMENT ON COLUMN public.reply_threads.snooze_until IS 'Date to resume OOO threads';
COMMENT ON COLUMN public.reply_threads.unsubscribed IS 'Whether the lead has unsubscribed';










