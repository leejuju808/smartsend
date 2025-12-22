-- =========================================================
-- Block 21708 — SmartSend Roofing Reply Listener + Follow-Up Stopper v1
-- =========================================================
-- 
-- This is the piece that makes SmartSend feel smart to roofers:
-- 
-- Homeowner replies →
-- → SmartSend logs it
-- → stops all follow-ups instantly
-- → runs intent classification
-- → marks the lead as hot / warm / not interested
-- 
-- This is how roofers avoid looking spammy and never miss a money lead.

-- ============================================================================
-- A. Intent enums (for leads)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_intent') THEN
    CREATE TYPE lead_intent AS ENUM (
      'unknown',
      'hot',
      'warm',
      'not_interested',
      'other'
    );
  END IF;
END $$;

-- ============================================================================
-- B. inbound_emails — raw homeowner replies
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inbound_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id uuid,
  campaign_id uuid,
  contact_id uuid,

  message_provider_id text,          -- id from Mailgun/Resend/etc.
  in_reply_to_message_id text,       -- provider thread id / message-id

  from_email text NOT NULL,
  to_email text NOT NULL,
  subject text,
  text_body text,
  html_body text,

  received_at timestamptz NOT NULL DEFAULT now(),

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbound_emails_company
  ON public.inbound_emails (company_id, received_at DESC)
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbound_emails_contact
  ON public.inbound_emails (contact_id, received_at DESC)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbound_emails_campaign
  ON public.inbound_emails (campaign_id, received_at DESC)
  WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbound_emails_to_email
  ON public.inbound_emails (to_email, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbound_emails_from_email
  ON public.inbound_emails (from_email, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbound_emails_provider_id
  ON public.inbound_emails (message_provider_id)
  WHERE message_provider_id IS NOT NULL;

-- ============================================================================
-- C. Wire replies into follow_up_profiles
-- ============================================================================
-- We'll let follow_up_profiles hold the last inbound + intent

ALTER TABLE public.follow_up_profiles
  ADD COLUMN IF NOT EXISTS lead_intent lead_intent NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_inbound_email_provider_id text;

-- ============================================================================
-- D. Update leads table if it exists (optional)
-- ============================================================================

DO $$
BEGIN
  -- Add intent column to leads if table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'leads'
  ) THEN
    -- Add intent column if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'leads' 
        AND column_name = 'intent'
    ) THEN
      ALTER TABLE public.leads
        ADD COLUMN intent lead_intent DEFAULT 'unknown';
    END IF;

    -- Add last_contacted_at if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND table_name = 'leads' 
        AND column_name = 'last_contacted_at'
    ) THEN
      ALTER TABLE public.leads
        ADD COLUMN last_contacted_at timestamptz;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- E. RLS Policies
-- ============================================================================

ALTER TABLE public.inbound_emails ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for Edge Functions)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'inbound_emails'
      AND policyname = 'inbound_emails_service_role'
  ) THEN
    CREATE POLICY "inbound_emails_service_role"
      ON public.inbound_emails
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Comments
COMMENT ON TABLE public.inbound_emails IS 'Block 21708: Raw homeowner replies captured from email provider webhooks';
COMMENT ON COLUMN public.follow_up_profiles.lead_intent IS 'Block 21708: Current intent classification for this lead';

