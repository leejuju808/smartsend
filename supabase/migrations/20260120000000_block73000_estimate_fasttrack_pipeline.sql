-- =========================================================
-- Block 73000 — SmartSend Roofing
-- "Estimate Fast-Track + Lead-to-Job Auto Pipeline" v1
-- =========================================================
-- 
-- This is the moment SmartSend stops being "An AI cold email tool"
-- and becomes "Our full roofing sales pipeline."
-- 
-- Roofers LIVE inside pipeline stages.
-- Owners run their ENTIRE business off this one screen.
-- This block is a MUST HAVE for revenue.
--
-- Features:
-- ✅ Auto Lead Classification (Hot/Warm/Not Interested)
-- ✅ Estimate Request Form (Fast-Track Button)
-- ✅ Estimate Upload + Send Flow
-- ✅ Auto Follow-Up Engine
-- ✅ Lead-to-Job Conversion
-- ✅ Pipeline Board (Kanban)
-- =========================================================

-- ============================================================================
-- 1. CREATE PIPELINE_STAGES TABLE (Roofing-Specific Stages)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- "New Lead", "Replied", "Estimate Needed", "Estimate Sent", "Follow-Up", "Won", "Lost"
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_company_id ON public.pipeline_stages(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_workspace_id ON public.pipeline_stages(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_order ON public.pipeline_stages(COALESCE(company_id, workspace_id), order_index);

-- ============================================================================
-- 2. CREATE LEAD_PIPELINE_STATUS TABLE (Tracks Lead Stage)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lead_pipeline_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(lead_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lead_pipeline_status_lead_id ON public.lead_pipeline_status(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_pipeline_status_stage_id ON public.lead_pipeline_status(stage_id);

-- ============================================================================
-- 3. CREATE ESTIMATE_REQUESTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.estimate_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  job_type TEXT, -- "Roof Repair", "Full Tear-Off", "Inspection", "Gutter Replacement", etc.
  urgency TEXT CHECK (urgency IN ('Low', 'Medium', 'High')),
  notes TEXT,
  photo_urls TEXT[], -- Array of photo URLs
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_estimate_requests_lead_id ON public.estimate_requests(lead_id);
CREATE INDEX IF NOT EXISTS idx_estimate_requests_company_id ON public.estimate_requests(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estimate_requests_workspace_id ON public.estimate_requests(workspace_id) WHERE workspace_id IS NOT NULL;

-- ============================================================================
-- 4. CREATE ESTIMATES TABLE (Estimate Files)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  estimate_request_id UUID REFERENCES public.estimate_requests(id) ON DELETE SET NULL,
  file_url TEXT NOT NULL,
  price NUMERIC(12,2),
  sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_estimates_lead_id ON public.estimates(lead_id);
CREATE INDEX IF NOT EXISTS idx_estimates_estimate_request_id ON public.estimates(estimate_request_id) WHERE estimate_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estimates_sent_at ON public.estimates(sent_at DESC) WHERE sent_at IS NOT NULL;

-- ============================================================================
-- 5. CREATE ESTIMATE_FOLLOWUPS TABLE (Auto Follow-Up Scheduler)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.estimate_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id UUID NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  sent BOOLEAN NOT NULL DEFAULT false,
  sent_at TIMESTAMPTZ,
  followup_sequence INTEGER NOT NULL DEFAULT 1, -- 1 = Day 1, 2 = Day 3, 3 = Day 7
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_estimate_followups_estimate_id ON public.estimate_followups(estimate_id);
CREATE INDEX IF NOT EXISTS idx_estimate_followups_lead_id ON public.estimate_followups(lead_id);
CREATE INDEX IF NOT EXISTS idx_estimate_followups_due_date ON public.estimate_followups(due_date) WHERE sent = false;
CREATE INDEX IF NOT EXISTS idx_estimate_followups_pending ON public.estimate_followups(due_date, sent) WHERE sent = false;

-- ============================================================================
-- 6. ADD COLUMNS TO LEADS TABLE (if not exist)
-- ============================================================================

DO $$
BEGIN
  -- Add pipeline_stage_id to leads if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'pipeline_stage_id'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN pipeline_stage_id UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage_id ON public.leads(pipeline_stage_id) WHERE pipeline_stage_id IS NOT NULL;
  END IF;

  -- Add intent_classification to leads (Hot/Warm/Not Interested)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'intent_classification'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN intent_classification TEXT CHECK (intent_classification IN ('Hot', 'Warm', 'Not Interested'));
    
    CREATE INDEX IF NOT EXISTS idx_leads_intent_classification ON public.leads(intent_classification) WHERE intent_classification IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- 7. TRIGGERS FOR UPDATED_AT
-- ============================================================================

-- Estimate requests updated_at trigger
CREATE OR REPLACE FUNCTION update_estimate_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_estimate_requests_updated_at ON public.estimate_requests;
CREATE TRIGGER trg_estimate_requests_updated_at
BEFORE UPDATE ON public.estimate_requests
FOR EACH ROW
EXECUTE FUNCTION update_estimate_requests_updated_at();

-- Estimates updated_at trigger
CREATE OR REPLACE FUNCTION update_estimates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_estimates_updated_at ON public.estimates;
CREATE TRIGGER trg_estimates_updated_at
BEFORE UPDATE ON public.estimates
FOR EACH ROW
EXECUTE FUNCTION update_estimates_updated_at();

-- ============================================================================
-- 8. FUNCTION: Auto-create default pipeline stages for workspace/company
-- ============================================================================

CREATE OR REPLACE FUNCTION create_default_roofing_pipeline_stages(
  p_workspace_id UUID DEFAULT NULL,
  p_company_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stages TEXT[] := ARRAY[
    'New Lead',
    'Replied',
    'Estimate Needed',
    'Estimate Sent',
    'Follow-Up',
    'Won',
    'Lost'
  ];
  v_stage TEXT;
  v_order INTEGER := 1;
BEGIN
  -- Validate that at least one ID is provided
  IF p_workspace_id IS NULL AND p_company_id IS NULL THEN
    RAISE EXCEPTION 'Either workspace_id or company_id must be provided';
  END IF;

  -- Create default stages
  FOREACH v_stage IN ARRAY v_stages
  LOOP
    INSERT INTO public.pipeline_stages (workspace_id, company_id, name, order_index)
    VALUES (p_workspace_id, p_company_id, v_stage, v_order)
    ON CONFLICT (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), name) DO NOTHING;
    
    v_order := v_order + 1;
  END LOOP;
END;
$$;

-- ============================================================================
-- 9. FUNCTION: Move lead to pipeline stage
-- ============================================================================

CREATE OR REPLACE FUNCTION move_lead_to_stage(
  p_lead_id UUID,
  p_stage_name TEXT,
  p_workspace_id UUID DEFAULT NULL,
  p_company_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stage_id UUID;
  v_existing_status_id UUID;
BEGIN
  -- Find or create the stage
  SELECT id INTO v_stage_id
  FROM public.pipeline_stages
  WHERE name = p_stage_name
    AND (p_workspace_id IS NULL OR workspace_id = p_workspace_id)
    AND (p_company_id IS NULL OR company_id = p_company_id)
  LIMIT 1;

  -- If stage doesn't exist, create default stages and try again
  IF v_stage_id IS NULL THEN
    PERFORM create_default_roofing_pipeline_stages(p_workspace_id, p_company_id);
    
    SELECT id INTO v_stage_id
    FROM public.pipeline_stages
    WHERE name = p_stage_name
      AND (p_workspace_id IS NULL OR workspace_id = p_workspace_id)
      AND (p_company_id IS NULL OR company_id = p_company_id)
    LIMIT 1;
  END IF;

  IF v_stage_id IS NULL THEN
    RAISE EXCEPTION 'Pipeline stage not found: %', p_stage_name;
  END IF;

  -- Update or insert lead_pipeline_status
  INSERT INTO public.lead_pipeline_status (lead_id, stage_id, updated_at)
  VALUES (p_lead_id, v_stage_id, now())
  ON CONFLICT (lead_id) 
  DO UPDATE SET 
    stage_id = v_stage_id,
    updated_at = now();

  -- Also update leads.pipeline_stage_id for backward compatibility
  UPDATE public.leads
  SET pipeline_stage_id = v_stage_id
  WHERE id = p_lead_id;

  RETURN v_stage_id;
END;
$$;

-- ============================================================================
-- 10. FUNCTION: Auto-schedule estimate follow-ups
-- ============================================================================

CREATE OR REPLACE FUNCTION schedule_estimate_followups(p_estimate_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead_id UUID;
  v_sent_at TIMESTAMPTZ;
BEGIN
  -- Get estimate info
  SELECT lead_id, sent_at INTO v_lead_id, v_sent_at
  FROM public.estimates
  WHERE id = p_estimate_id;

  IF v_lead_id IS NULL OR v_sent_at IS NULL THEN
    RETURN; -- Can't schedule if estimate not sent
  END IF;

  -- Schedule Day 1 follow-up (1 day after sent)
  INSERT INTO public.estimate_followups (estimate_id, lead_id, due_date, followup_sequence)
  VALUES (p_estimate_id, v_lead_id, (v_sent_at::date + INTERVAL '1 day'), 1)
  ON CONFLICT DO NOTHING;

  -- Schedule Day 3 follow-up (3 days after sent)
  INSERT INTO public.estimate_followups (estimate_id, lead_id, due_date, followup_sequence)
  VALUES (p_estimate_id, v_lead_id, (v_sent_at::date + INTERVAL '3 days'), 2)
  ON CONFLICT DO NOTHING;

  -- Schedule Day 7 follow-up (7 days after sent)
  INSERT INTO public.estimate_followups (estimate_id, lead_id, due_date, followup_sequence)
  VALUES (p_estimate_id, v_lead_id, (v_sent_at::date + INTERVAL '7 days'), 3)
  ON CONFLICT DO NOTHING;
END;
$$;

-- ============================================================================
-- 11. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Pipeline stages RLS
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view pipeline stages for their workspace/company"
  ON public.pipeline_stages
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage pipeline stages for their workspace/company"
  ON public.pipeline_stages
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR company_id IN (
      SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
    )
  );

-- Lead pipeline status RLS
ALTER TABLE public.lead_pipeline_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view lead pipeline status for their workspace/company"
  ON public.lead_pipeline_status
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_pipeline_status.lead_id
        AND (
          l.workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
          OR l.company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
        )
    )
  );

CREATE POLICY "Users can manage lead pipeline status for their workspace/company"
  ON public.lead_pipeline_status
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_pipeline_status.lead_id
        AND (
          l.workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
          OR l.company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
        )
    )
  );

-- Estimate requests RLS
ALTER TABLE public.estimate_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view estimate requests for their workspace/company"
  ON public.estimate_requests
  FOR SELECT
  USING (
    workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
    OR company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Users can manage estimate requests for their workspace/company"
  ON public.estimate_requests
  FOR ALL
  USING (
    workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
    OR company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
  );

-- Estimates RLS
ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view estimates for their workspace/company"
  ON public.estimates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = estimates.lead_id
        AND (
          l.workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
          OR l.company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
        )
    )
  );

CREATE POLICY "Users can manage estimates for their workspace/company"
  ON public.estimates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = estimates.lead_id
        AND (
          l.workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
          OR l.company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
        )
    )
  );

-- Estimate followups RLS
ALTER TABLE public.estimate_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view estimate followups for their workspace/company"
  ON public.estimate_followups
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = estimate_followups.lead_id
        AND (
          l.workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
          OR l.company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
        )
    )
  );

CREATE POLICY "Users can manage estimate followups for their workspace/company"
  ON public.estimate_followups
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = estimate_followups.lead_id
        AND (
          l.workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
          OR l.company_id IN (SELECT company_id FROM public.company_members WHERE user_id = auth.uid())
        )
    )
  );

-- ============================================================================
-- 12. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.pipeline_stages IS 'Block 73000: Roofing pipeline stages (New Lead, Replied, Estimate Needed, etc.)';
COMMENT ON TABLE public.lead_pipeline_status IS 'Block 73000: Tracks which pipeline stage each lead is in';
COMMENT ON TABLE public.estimate_requests IS 'Block 73000: Fast-track estimate requests from foreman/owner';
COMMENT ON TABLE public.estimates IS 'Block 73000: Estimate files (PDFs) sent to homeowners';
COMMENT ON TABLE public.estimate_followups IS 'Block 73000: Auto-scheduled follow-up reminders for estimates';



























