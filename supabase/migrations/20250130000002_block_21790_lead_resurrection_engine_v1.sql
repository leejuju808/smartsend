-- =========================================================
-- Block 21790 — SmartSend Roofing Lead Resurrection Engine v1
-- 🧟‍♂️ Bring Dead Leads Back to Life
-- =========================================================
-- Automatically re-engage:
-- - Homeowners who never replied
-- - Leads that ghosted
-- - Estimates that didn't book
-- - Proposals that never got accepted
-- - Warm leads that went cold
-- - Customers from last season
--
-- This system fills roofer calendars with jobs without spending on ads.
-- This is exactly why roofers will pay $199–$399/mo.

-- ============================================================================
-- 1. CREATE LEAD_RESURRECTIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lead_resurrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  resurrection_type TEXT NOT NULL, -- no_reply, ghosted, estimate_not_booked, proposal_unanswered, warm_cooled, seasonal_revival
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'sent', -- sent | replied | ignored
  response_at TIMESTAMPTZ,
  message_body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_lead_resurrections_lead_id 
  ON public.lead_resurrections(lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_resurrections_status 
  ON public.lead_resurrections(status);

CREATE INDEX IF NOT EXISTS idx_lead_resurrections_type 
  ON public.lead_resurrections(resurrection_type);

CREATE INDEX IF NOT EXISTS idx_lead_resurrections_sent_at 
  ON public.lead_resurrections(sent_at DESC);

-- RLS
ALTER TABLE public.lead_resurrections ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view resurrections for leads in their workspace
CREATE POLICY "Users can view resurrections"
  ON public.lead_resurrections
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.leads l
      JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE l.id = lead_resurrections.lead_id
        AND wm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.leads l
      WHERE l.id = lead_resurrections.lead_id
        AND l.owner_id = auth.uid()
    )
  );

-- Policy: Service role can insert/update resurrections
CREATE POLICY "Service role can manage resurrections"
  ON public.lead_resurrections
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 2. ADD RESURRECTION TRACKING COLUMNS TO LEADS TABLE
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_resurrection_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resurrection_count INTEGER DEFAULT 0;

-- Index for resurrection queries
CREATE INDEX IF NOT EXISTS idx_leads_last_resurrection_at 
  ON public.leads(last_resurrection_at DESC)
  WHERE last_resurrection_at IS NOT NULL;

-- ============================================================================
-- 3. ADD FIRST_REPLY_AT COLUMN IF NOT EXISTS (for resurrection logic)
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS first_reply_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_first_reply_at 
  ON public.leads(first_reply_at DESC)
  WHERE first_reply_at IS NOT NULL;

-- ============================================================================
-- 4. HELPER FUNCTION: Check if lead can be resurrected
-- ============================================================================

CREATE OR REPLACE FUNCTION public.can_resurrect_lead(p_lead_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead RECORD;
  v_hours_since_resurrection NUMERIC;
BEGIN
  -- Get lead data
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Skip active/hot leads
  IF v_lead.heat_category = 'hot' THEN
    RETURN FALSE;
  END IF;

  -- Skip leads that are won, lost, or unsubscribed
  IF v_lead.status IN ('won', 'lost', 'unsubscribed', 'bounced') THEN
    RETURN FALSE;
  END IF;

  -- Skip leads in final pipeline stages
  IF v_lead.pipeline_stage IN ('won', 'lost') THEN
    RETURN FALSE;
  END IF;

  -- Check if we've resurrected recently (don't spam - wait 24 hours)
  IF v_lead.last_resurrection_at IS NOT NULL THEN
    v_hours_since_resurrection := EXTRACT(EPOCH FROM (now() - v_lead.last_resurrection_at)) / 3600;
    IF v_hours_since_resurrection < 24 THEN
      RETURN FALSE;
    END IF;
  END IF;

  -- Don't resurrect if they've replied recently (within 48 hours)
  IF v_lead.last_reply_at IS NOT NULL THEN
    IF EXTRACT(EPOCH FROM (now() - v_lead.last_reply_at)) / 3600 < 48 THEN
      RETURN FALSE;
    END IF;
  END IF;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.can_resurrect_lead IS 'Block 21790: Checks if a lead qualifies for resurrection (not hot, not recently resurrected, not recently replied)';

-- ============================================================================
-- 5. HELPER FUNCTION: Determine resurrection type
-- ============================================================================

CREATE OR REPLACE FUNCTION public.determine_resurrection_type(p_lead_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead RECORD;
  v_hours_since_contact NUMERIC;
  v_days_since_estimate NUMERIC;
  v_days_since_proposal NUMERIC;
BEGIN
  -- Get lead data
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  
  IF NOT FOUND THEN
    RETURN 'generic_reengagement';
  END IF;

  -- No reply at all
  IF v_lead.first_reply_at IS NULL AND v_lead.last_reply_at IS NULL THEN
    -- Check how long since created/contacted
    IF v_lead.created_at IS NOT NULL THEN
      v_hours_since_contact := EXTRACT(EPOCH FROM (now() - v_lead.created_at)) / 3600;
      IF v_hours_since_contact >= 24 THEN
        RETURN 'no_reply';
      END IF;
    END IF;
  END IF;

  -- Ghosted after initial interest
  IF v_lead.first_reply_at IS NOT NULL AND v_lead.last_reply_at IS NOT NULL THEN
    v_hours_since_contact := EXTRACT(EPOCH FROM (now() - v_lead.last_reply_at)) / 3600;
    IF v_hours_since_contact >= 48 THEN
      RETURN 'ghosted';
    END IF;
  END IF;

  -- Estimate not booked (check pipeline_stage)
  IF v_lead.pipeline_stage = 'estimate_completed' OR v_lead.pipeline_stage = 'estimate_scheduled' THEN
    -- Check if estimate was completed more than 3 days ago
    -- Note: This assumes we track estimate completion date in metadata or another field
    -- For now, we'll use last_reply_at as proxy
    IF v_lead.last_reply_at IS NOT NULL THEN
      v_days_since_estimate := EXTRACT(EPOCH FROM (now() - v_lead.last_reply_at)) / 86400;
      IF v_days_since_estimate >= 3 THEN
        RETURN 'estimate_not_booked';
      END IF;
    END IF;
  END IF;

  -- Proposal sent but not accepted
  IF v_lead.pipeline_stage = 'contract_sent' THEN
    IF v_lead.last_reply_at IS NOT NULL THEN
      v_days_since_proposal := EXTRACT(EPOCH FROM (now() - v_lead.last_reply_at)) / 86400;
      IF v_days_since_proposal >= 7 THEN
        RETURN 'proposal_unanswered';
      END IF;
    END IF;
  END IF;

  -- Warm lead cooled down
  IF v_lead.heat_category = 'cold' AND v_lead.first_reply_at IS NOT NULL THEN
    RETURN 'warm_cooled';
  END IF;

  -- Seasonal revival (6+ months old)
  IF v_lead.created_at IS NOT NULL THEN
    IF EXTRACT(EPOCH FROM (now() - v_lead.created_at)) / 86400 >= 180 THEN
      RETURN 'seasonal_revival';
    END IF;
  END IF;

  RETURN 'generic_reengagement';
END;
$$;

COMMENT ON FUNCTION public.determine_resurrection_type IS 'Block 21790: Determines the type of resurrection message to send based on lead state';

