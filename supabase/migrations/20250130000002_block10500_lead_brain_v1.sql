-- =========================================================
-- Block 10500 — SmartSend Lead Brain v1
-- (The Auto-Classifier That Instantly Tags Every Homeowner Reply)
-- =========================================================

-- Create enum for lead intent classifications
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_intent_classification') THEN
    CREATE TYPE public.lead_intent_classification AS ENUM (
      'HOT',
      'WARM',
      'NOT_INTERESTED',
      'FOLLOW_UP',
      'OUT_OF_SCOPE'
    );
  END IF;
END$$;

-- Create lead_intents table
CREATE TABLE IF NOT EXISTS public.lead_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.inbound_messages(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  classification public.lead_intent_classification NOT NULL,
  confidence numeric(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure one classification per message
  UNIQUE(message_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_lead_intents_workspace 
  ON public.lead_intents(workspace_id);

CREATE INDEX IF NOT EXISTS idx_lead_intents_classification 
  ON public.lead_intents(classification);

CREATE INDEX IF NOT EXISTS idx_lead_intents_lead 
  ON public.lead_intents(lead_id) 
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_intents_campaign 
  ON public.lead_intents(campaign_id) 
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_intents_created_at 
  ON public.lead_intents(created_at DESC);

-- Enable RLS
ALTER TABLE public.lead_intents ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Workspace members can read lead intents
CREATE POLICY "Workspace members can read lead intents"
ON public.lead_intents
FOR SELECT
USING (
  workspace_id IN (
    SELECT wm.workspace_id
    FROM public.workspace_members wm
    WHERE wm.user_id = auth.uid()
  )
);

-- RLS Policy: Service role can insert/update (for automated classification)
CREATE POLICY "Service role can manage lead intents"
ON public.lead_intents
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Comments
COMMENT ON TABLE public.lead_intents IS 'Auto-classified lead intents from homeowner replies. Categories: HOT (wants estimate/appointment), WARM (interested but not urgent), NOT_INTERESTED (declined), FOLLOW_UP (needs manual response), OUT_OF_SCOPE (not a roofing job).';
COMMENT ON COLUMN public.lead_intents.classification IS 'Intent classification: HOT, WARM, NOT_INTERESTED, FOLLOW_UP, or OUT_OF_SCOPE';
COMMENT ON COLUMN public.lead_intents.confidence IS 'AI confidence score between 0 and 1';

-- Function to get latest intent for a lead
CREATE OR REPLACE FUNCTION public.get_latest_lead_intent(p_lead_id uuid)
RETURNS TABLE (
  classification public.lead_intent_classification,
  confidence numeric,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    li.classification,
    li.confidence,
    li.created_at
  FROM public.lead_intents li
  WHERE li.lead_id = p_lead_id
  ORDER BY li.created_at DESC
  LIMIT 1;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_latest_lead_intent(uuid) TO authenticated;

-- Update inbox_replies_view to include lead intent classification
-- Note: This view joins lead_intents via inbound_messages by matching email and date
CREATE OR REPLACE VIEW public.inbox_replies_view AS
SELECT
  er.id AS reply_id,
  el.workspace_id,
  el.lead_id,
  el.campaign_id,
  NULL::uuid AS sequence_id,
  COALESCE(er.body_text, er.body_html, er.raw_text, '') AS body,
  jsonb_build_object(
    'provider', er.provider,
    'provider_message_id', er.provider_message_id,
    'in_reply_to', er.in_reply_to,
    'subject', er.subject,
    'from_email', er.from_email,
    'to_email', er.to_email
  ) AS metadata,
  COALESCE(
    (er.metadata->>'received_at')::timestamptz,
    er.received_at, 
    er.created_at
  ) AS received_at,

  li.company,
  li.first_name,
  li.last_name,
  li.email AS lead_email,

  ci.category,
  ci.sentiment,
  ci.intent_score,
  ci.meeting_time,
  ci.meeting_location,
  ci.meeting_link,
  ci.objection_type,

  -- Block 10500: Lead Brain v1 - Add lead intent classification
  -- Join via inbound_messages by matching email and approximate timestamp
  li_intent.classification AS lead_intent_classification,
  li_intent.confidence AS lead_intent_confidence

FROM email_replies er
LEFT JOIN email_logs el ON el.id = er.email_log_id
LEFT JOIN leads li ON li.id = el.lead_id
LEFT JOIN reply_intent ci ON ci.reply_id = er.id
-- Join with lead_intents via inbound_messages
-- Match by email and date (within same day) or by message_id if available
LEFT JOIN inbound_messages im ON (
  LOWER(im.from_email) = LOWER(er.from_email) 
  AND im.created_at::date = COALESCE(er.received_at, er.created_at)::date
  AND im.workspace_id = el.workspace_id
)
LEFT JOIN lead_intents li_intent ON li_intent.message_id = im.id
WHERE el.workspace_id IS NOT NULL;

-- Also update the view to work with inbound_messages directly if needed
CREATE OR REPLACE VIEW public.inbox_replies_view_v2 AS
SELECT
  im.id AS reply_id,
  im.workspace_id,
  im.lead_id,
  im.campaign_id,
  NULL::uuid AS sequence_id,
  COALESCE(im.text_body, im.html_body, '') AS body,
  jsonb_build_object(
    'subject', im.subject,
    'from_email', im.from_email,
    'message_id', im.message_id,
    'in_reply_to', im.in_reply_to
  ) AS metadata,
  im.created_at AS received_at,

  li.company,
  li.first_name,
  li.last_name,
  li.email AS lead_email,

  NULL::text AS category,
  NULL::text AS sentiment,
  NULL::numeric AS intent_score,
  NULL::timestamptz AS meeting_time,
  NULL::text AS meeting_location,
  NULL::text AS meeting_link,
  NULL::text AS objection_type,

  -- Block 10500: Lead Brain v1 - Add lead intent classification
  li_intent.classification AS lead_intent_classification,
  li_intent.confidence AS lead_intent_confidence

FROM inbound_messages im
LEFT JOIN leads li ON li.id = im.lead_id
LEFT JOIN lead_intents li_intent ON li_intent.message_id = im.id
WHERE im.detected_as_reply = true OR im.in_reply_to IS NOT NULL;

