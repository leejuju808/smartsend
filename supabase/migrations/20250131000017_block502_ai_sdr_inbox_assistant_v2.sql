-- Block 502 — AI SDR Inbox Assistant v2
-- Extend lead_replies for intent v2 with confidence + suggested stage/action

-- Add new intent v2 fields to lead_replies table
ALTER TABLE public.lead_replies
  ADD COLUMN IF NOT EXISTS suggested_pipeline_stage TEXT,
  ADD COLUMN IF NOT EXISTS suggested_action TEXT,
  ADD COLUMN IF NOT EXISTS intent_last_scored_at TIMESTAMPTZ;

-- Note: intent_label and intent_confidence already exist from previous migrations
-- We're just adding the suggested fields and timestamp

-- Create index for faster lookups by intent_last_scored_at
CREATE INDEX IF NOT EXISTS idx_lead_replies_intent_last_scored_at 
  ON public.lead_replies(intent_last_scored_at DESC);

-- Create index for suggested_pipeline_stage for filtering
CREATE INDEX IF NOT EXISTS idx_lead_replies_suggested_pipeline_stage 
  ON public.lead_replies(suggested_pipeline_stage)
  WHERE suggested_pipeline_stage IS NOT NULL;

