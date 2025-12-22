-- ============================================================================
-- Block 34888 — SmartSend Roofing "AI Lead Scrubber + Qualification Engine" v1
-- ============================================================================
-- Auto-clean incoming leads • Enrich homeowner data • Detect bad leads 
-- Score intent • Route hot leads to immediate follow-up
--
-- This feature makes SmartSend a LEAD FILTER, not just a LEAD COLLECTOR.
-- ============================================================================

-- ============================================================================
-- 1. CREATE lead_quality TABLE
-- ============================================================================
-- Stores AI-generated quality scores and qualification data for each lead

CREATE TABLE IF NOT EXISTS public.lead_quality (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  
  -- Quality scoring
  quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100),
  lead_type TEXT CHECK (lead_type IN (
    'hot_lead',           -- Ready to Buy
    'warm_lead',          -- Curious / Getting Quotes
    'cold_lead',          -- Not ready / No urgency
    'emergency_lead',     -- Leak, storm damage
    'insurance_lead',     -- Insurance claim
    'retail_lead',        -- Retail (out of pocket)
    'bad_lead',           -- Trash / Spam
    'out_of_service_area', -- Outside service area
    'rental_tenant'       -- Rental tenant (no decision power)
  )),
  
  -- Intent & urgency
  urgency TEXT CHECK (urgency IN ('high', 'medium', 'low')),
  intent TEXT CHECK (intent IN ('ready_to_buy', 'shopping', 'curious', 'not_interested', 'unclear')),
  
  -- Risk flags (array of text)
  risk_flags TEXT[] DEFAULT '{}',
  
  -- Enrichment data (JSONB for flexible schema)
  enrichment JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure one quality record per lead
  CONSTRAINT lead_quality_lead_id_unique UNIQUE (lead_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_lead_quality_lead_id ON public.lead_quality(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_quality_score ON public.lead_quality(quality_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_lead_quality_type ON public.lead_quality(lead_type);
CREATE INDEX IF NOT EXISTS idx_lead_quality_urgency ON public.lead_quality(urgency) WHERE urgency = 'high';

-- ============================================================================
-- 2. CREATE lead_duplicates TABLE
-- ============================================================================
-- Tracks duplicate lead detection and merging

CREATE TABLE IF NOT EXISTS public.lead_duplicates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  duplicate_of UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  reason TEXT, -- e.g., "same_email", "same_phone", "same_address", "same_ip"
  confidence REAL CHECK (confidence >= 0 AND confidence <= 1), -- 0-1 confidence score
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Prevent duplicate entries
  CONSTRAINT lead_duplicates_lead_duplicate_unique UNIQUE (lead_id, duplicate_of)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lead_duplicates_lead_id ON public.lead_duplicates(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_duplicates_duplicate_of ON public.lead_duplicates(duplicate_of);

-- ============================================================================
-- 3. CREATE lead_intake_logs TABLE
-- ============================================================================
-- Logs raw intake data and AI analysis for debugging/auditing

CREATE TABLE IF NOT EXISTS public.lead_intake_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  
  -- Raw payload from intake (form, SMS, import, API, etc.)
  raw_payload JSONB DEFAULT '{}'::jsonb,
  
  -- AI analysis results
  ai_analysis JSONB DEFAULT '{}'::jsonb,
  
  -- Processing metadata
  source TEXT, -- 'form', 'sms', 'import', 'api', 'call'
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lead_intake_logs_lead_id ON public.lead_intake_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_intake_logs_status ON public.lead_intake_logs(processing_status) WHERE processing_status != 'completed';
CREATE INDEX IF NOT EXISTS idx_lead_intake_logs_created_at ON public.lead_intake_logs(created_at DESC);

-- ============================================================================
-- 4. TRIGGERS: Update updated_at timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_lead_quality_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_quality_updated_at ON public.lead_quality;
CREATE TRIGGER trg_lead_quality_updated_at
BEFORE UPDATE ON public.lead_quality
FOR EACH ROW
EXECUTE FUNCTION public.set_lead_quality_updated_at();

CREATE OR REPLACE FUNCTION public.set_lead_intake_logs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_intake_logs_updated_at ON public.lead_intake_logs;
CREATE TRIGGER trg_lead_intake_logs_updated_at
BEFORE UPDATE ON public.lead_intake_logs
FOR EACH ROW
EXECUTE FUNCTION public.set_lead_intake_logs_updated_at();

-- ============================================================================
-- 5. RLS POLICIES
-- ============================================================================

-- lead_quality RLS
ALTER TABLE public.lead_quality ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view lead quality in their workspace"
  ON public.lead_quality
  FOR SELECT
  USING (
    lead_id IN (
      SELECT l.id
      FROM public.leads l
      JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage lead quality"
  ON public.lead_quality
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- lead_duplicates RLS
ALTER TABLE public.lead_duplicates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view lead duplicates in their workspace"
  ON public.lead_duplicates
  FOR SELECT
  USING (
    lead_id IN (
      SELECT l.id
      FROM public.leads l
      JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage lead duplicates"
  ON public.lead_duplicates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- lead_intake_logs RLS
ALTER TABLE public.lead_intake_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view lead intake logs in their workspace"
  ON public.lead_intake_logs
  FOR SELECT
  USING (
    lead_id IN (
      SELECT l.id
      FROM public.leads l
      JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage lead intake logs"
  ON public.lead_intake_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 6. HELPER FUNCTIONS for lead routing
-- ============================================================================

-- Function: Schedule fast-track estimate for hot leads
CREATE OR REPLACE FUNCTION public.schedule_fast_track_estimate(p_lead_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- This can be extended to create appointments, send SMS, etc.
  -- For now, we'll just log the action
  INSERT INTO public.lead_intake_logs (lead_id, raw_payload, processing_status)
  VALUES (
    p_lead_id,
    jsonb_build_object('action', 'fast_track_estimate', 'triggered_at', now()),
    'completed'
  )
  ON CONFLICT DO NOTHING;
END;
$$;

-- Function: Start strong follow-up sequence
CREATE OR REPLACE FUNCTION public.start_strong_followup(p_lead_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- This can be extended to enroll in a specific sequence
  INSERT INTO public.lead_intake_logs (lead_id, raw_payload, processing_status)
  VALUES (
    p_lead_id,
    jsonb_build_object('action', 'start_strong_followup', 'triggered_at', now()),
    'completed'
  )
  ON CONFLICT DO NOTHING;
END;
$$;

-- Function: Nurture sequence
CREATE OR REPLACE FUNCTION public.nurture_sequence(p_lead_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- This can be extended to enroll in nurture sequence
  INSERT INTO public.lead_intake_logs (lead_id, raw_payload, processing_status)
  VALUES (
    p_lead_id,
    jsonb_build_object('action', 'nurture_sequence', 'triggered_at', now()),
    'completed'
  )
  ON CONFLICT DO NOTHING;
END;
$$;

-- Function: Mark as low quality
CREATE OR REPLACE FUNCTION public.mark_low_quality(p_lead_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update lead status or add tag
  UPDATE public.lead_quality
  SET lead_type = 'bad_lead'
  WHERE lead_id = p_lead_id;
END;
$$;

-- ============================================================================
-- 7. TRIGGER: Auto-trigger lead scrubbing on new lead insert
-- ============================================================================
-- This trigger fires when a new lead is inserted and logs it for processing

CREATE OR REPLACE FUNCTION public.trigger_lead_scrubbing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_edge_function_url TEXT;
BEGIN
  -- Log the intake for processing
  INSERT INTO public.lead_intake_logs (
    lead_id,
    raw_payload,
    source,
    processing_status
  )
  VALUES (
    NEW.id,
    jsonb_build_object(
      'email', NEW.email,
      'first_name', NEW.first_name,
      'last_name', NEW.last_name,
      'phone', NEW.phone,
      'workspace_id', NEW.workspace_id,
      'created_at', NEW.created_at
    ),
    'import', -- Can be determined from context
    'pending'
  );

  -- Trigger edge function asynchronously (using pg_net if available)
  -- This is optional - can also be done via API call from application
  -- PERFORM net.http_post(...) if pg_net extension is enabled

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_scrubbing ON public.leads;
CREATE TRIGGER trg_lead_scrubbing
AFTER INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.trigger_lead_scrubbing();
































