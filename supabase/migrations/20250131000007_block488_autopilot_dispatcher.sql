-- Block 488 — Autopilot Dispatcher v1
-- Extend send_queue to handle AI SDR sends from sdr_autopilot_queue

-- Add columns to send_queue for AI SDR tracking
ALTER TABLE public.send_queue
ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'campaign',         -- 'campaign' | 'ai_sdr'
ADD COLUMN IF NOT EXISTS autopilot_queue_id UUID NULL,           -- link back to sdr_autopilot_queue
ADD COLUMN IF NOT EXISTS reply_id UUID NULL REFERENCES public.lead_replies(id) ON DELETE SET NULL;

-- Note: send_queue.campaign_id is required (NOT NULL constraint)
-- The autopilot-dispatcher will skip jobs where the lead has no campaign_id
-- Consider creating a default "AI SDR" campaign for each account if needed

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_send_queue_autopilot_queue_id ON public.send_queue(autopilot_queue_id) WHERE autopilot_queue_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_send_queue_source ON public.send_queue(source) WHERE source = 'ai_sdr';
CREATE INDEX IF NOT EXISTS idx_send_queue_reply_id ON public.send_queue(reply_id) WHERE reply_id IS NOT NULL;

