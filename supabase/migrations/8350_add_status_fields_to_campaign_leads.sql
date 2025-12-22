-- Block 8350 — Reply-Driven Campaign State Updates (Auto-Mark Replied + Stop Future Sends)
-- Adds status tracking fields to campaign_leads for per-lead campaign status

-- 1. Enum for campaign lead status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'campaign_lead_status'
  ) THEN
    CREATE TYPE campaign_lead_status AS ENUM (
      'active',        -- still eligible for future sends
      'completed',     -- sequence done (hit last step normally)
      'replied',       -- got a real reply
      'unsubscribed',  -- asked to stop
      'bounced',       -- hard bounce
      'error'          -- something went wrong
    );
  END IF;
END;
$$;

-- 2. Ensure campaign_replies table exists (from Block 8340)
-- This table stores classified replies with intent information
CREATE TABLE IF NOT EXISTS public.campaign_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  from_email text NOT NULL,
  to_email text,
  subject text,
  raw_text text,  -- Main text field (may also have body_text/body_html)
  body_text text,
  body_html text,
  intent reply_intent,  -- Uses existing reply_intent enum from Block 8340
  intent_confidence numeric CHECK (intent_confidence >= 0 AND intent_confidence <= 1),
  classified_at timestamptz,
  classifier_version text,
  classifier_raw jsonb,
  sub_intent text,
  sentiment text,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Indexes for campaign_replies
CREATE INDEX IF NOT EXISTS idx_campaign_replies_campaign_lead 
  ON public.campaign_replies (campaign_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_campaign_replies_classified_at 
  ON public.campaign_replies (classified_at) WHERE classified_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campaign_replies_intent 
  ON public.campaign_replies (intent) WHERE intent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_campaign_replies_from_email 
  ON public.campaign_replies (lower(from_email));

-- 3. Columns on campaign_leads
-- Note: We'll keep the existing text status column for backward compatibility
-- but add the new enum status column. The application can migrate gradually.

-- Add new columns
ALTER TABLE public.campaign_leads
  ADD COLUMN IF NOT EXISTS status_enum campaign_lead_status,
  ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_reply_intent reply_intent;

-- Migrate existing status values to new enum where possible
-- Map existing text statuses to enum values
UPDATE public.campaign_leads
SET status_enum = CASE
  WHEN status = 'replied' THEN 'replied'::campaign_lead_status
  WHEN status = 'unsub' THEN 'unsubscribed'::campaign_lead_status
  WHEN status = 'bounced' THEN 'bounced'::campaign_lead_status
  WHEN status IN ('new', 'queued', 'sent', 'paused') THEN 'active'::campaign_lead_status
  ELSE 'active'::campaign_lead_status
END
WHERE status_enum IS NULL;

-- Set default for new rows
ALTER TABLE public.campaign_leads
  ALTER COLUMN status_enum SET DEFAULT 'active'::campaign_lead_status;

-- 4. Helpful indexes
CREATE INDEX IF NOT EXISTS idx_campaign_leads_campaign_status
  ON public.campaign_leads (campaign_id, status_enum);

CREATE INDEX IF NOT EXISTS idx_campaign_leads_lead_status
  ON public.campaign_leads (lead_id, status_enum);

CREATE INDEX IF NOT EXISTS idx_campaign_leads_replied_at
  ON public.campaign_leads (replied_at) WHERE replied_at IS NOT NULL;

-- 5. RLS for campaign_replies (if RLS is enabled)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'campaign_replies'
    AND rowsecurity = true
  ) THEN
    -- RLS already enabled, skip
    NULL;
  ELSE
    -- Enable RLS if needed (optional, adjust based on your security model)
    -- ALTER TABLE public.campaign_replies ENABLE ROW LEVEL SECURITY;
    NULL;
  END IF;
END;
$$;

