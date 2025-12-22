-- Block 8340 — Auto-Intent Processing (Auto-Classify All New Replies via Edge Function)
-- DB Migration — Add Intent Fields to campaign_replies

-- 1. Enum for classification intent
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'reply_intent'
  ) THEN
    CREATE TYPE reply_intent AS ENUM (
      'positive',
      'neutral',
      'negative',
      'out_of_office',
      'unsubscribe',
      'bounce',
      'spam',
      'wrong_person',
      'referral',
      'not_sure'
    );
  END IF;
END;
$$;

-- 2. Drop existing view if it exists (we're replacing it with a table)
DROP VIEW IF EXISTS public.campaign_replies;

-- 3. Create campaign_replies table
CREATE TABLE IF NOT EXISTS public.campaign_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  subject text,
  raw_text text,
  from_email text,
  to_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Add intent classification columns
ALTER TABLE public.campaign_replies
  ADD COLUMN IF NOT EXISTS intent reply_intent,
  ADD COLUMN IF NOT EXISTS sub_intent TEXT,
  ADD COLUMN IF NOT EXISTS sentiment TEXT,
  ADD COLUMN IF NOT EXISTS intent_confidence NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS classifier_version TEXT,
  ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS classifier_raw JSONB;

-- 5. Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_campaign_replies_intent
  ON public.campaign_replies (intent);

CREATE INDEX IF NOT EXISTS idx_campaign_replies_classified_at
  ON public.campaign_replies (classified_at);

CREATE INDEX IF NOT EXISTS idx_campaign_replies_campaign_id
  ON public.campaign_replies (campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_replies_lead_id
  ON public.campaign_replies (lead_id);

CREATE INDEX IF NOT EXISTS idx_campaign_replies_created_at
  ON public.campaign_replies (created_at DESC);

-- 6. Enable RLS
ALTER TABLE public.campaign_replies ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies (basic - adjust based on your auth model)
-- Users can view replies for campaigns they have access to
CREATE POLICY IF NOT EXISTS campaign_replies_select
  ON public.campaign_replies
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_replies.campaign_id
      -- Add your access check here based on your auth model
    )
  );

-- Service role can manage all replies (for Edge Functions)
CREATE POLICY IF NOT EXISTS campaign_replies_service_role
  ON public.campaign_replies
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 8. Create updated_at trigger (if not exists)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS trg_campaign_replies_updated_at
  BEFORE UPDATE ON public.campaign_replies
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Note: The previous campaign_replies view (reply counts per campaign) has been replaced
-- with this table. If you need the aggregated view back, recreate it as:
-- CREATE VIEW public.campaign_reply_counts AS
-- SELECT campaign_id, COUNT(*) as replies
-- FROM public.campaign_replies
-- GROUP BY campaign_id;

