-- =========================================================
-- Block 24260 — SmartSend Roofing Job Pipeline v1
-- (Lead → Inspection → Quote → Approved → Scheduled → Installed)
-- Visual Pipeline • Automated Movement • Roofing-Specific Actions
-- =========================================================
-- 
-- THIS IS THE PIPELINE ROOFERS HAVE ALWAYS NEEDED — ZERO FLUFF.
-- Every detail exists to help roofers:
-- ✔ close more jobs
-- ✔ stay organized
-- ✔ stop losing money
-- ✔ visualize revenue
-- ✔ move homeowners toward "YES"
--
-- This is where SmartSend stops being a "cold email tool" and becomes a roofing operating system.
-- =========================================================

-- ============================================================================
-- STEP 1: ADD ROOFING PIPELINE COLUMNS TO LEADS TABLE
-- ============================================================================

DO $$
BEGIN
  -- Pipeline stage (6 stages: lead_in, inspection_set, quote_sent, approved, scheduled, installed)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'roofing_pipeline_stage'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN roofing_pipeline_stage TEXT DEFAULT 'lead_in' 
    CHECK (roofing_pipeline_stage IN ('lead_in', 'inspection_set', 'quote_sent', 'approved', 'scheduled', 'installed'));
  END IF;

  -- Estimated job value (revenue)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'estimated_job_value'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN estimated_job_value NUMERIC(10,2);
  END IF;

  -- Job type (repair/replacement)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'job_type'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN job_type TEXT 
    CHECK (job_type IS NULL OR job_type IN ('repair', 'replacement'));
  END IF;

  -- Payment type (insurance/cash)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'payment_type'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN payment_type TEXT 
    CHECK (payment_type IS NULL OR payment_type IN ('insurance', 'cash'));
  END IF;

  -- Close probability (0-100)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'close_probability'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN close_probability INTEGER 
    CHECK (close_probability IS NULL OR (close_probability >= 0 AND close_probability <= 100));
  END IF;

  -- Lead status (HOT/WARM/COLD)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'lead_status'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN lead_status TEXT DEFAULT 'WARM' 
    CHECK (lead_status IN ('HOT', 'WARM', 'COLD'));
  END IF;

  -- Tags (storm, insurance, repair, replacement) - stored as JSONB array
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'roofing_tags'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN roofing_tags JSONB DEFAULT '[]'::jsonb;
  END IF;

  -- Address fields (if not already exist)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'address'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN address TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'city'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN city TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'state'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN state TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'zip_code'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN zip_code TEXT;
  END IF;

  -- Phone (if not already exists)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'phone'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN phone TEXT;
  END IF;

  -- Stage entered at timestamp
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'stage_entered_at'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN stage_entered_at TIMESTAMPTZ DEFAULT now();
  END IF;

  -- Last reply timestamp
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'last_reply_at'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN last_reply_at TIMESTAMPTZ;
  END IF;

  -- Last contact timestamp
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'last_contact_at'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN last_contact_at TIMESTAMPTZ;
  END IF;

  -- Inspection scheduled date
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'inspection_scheduled_at'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN inspection_scheduled_at TIMESTAMPTZ;
  END IF;

  -- Quote sent date
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'quote_sent_at'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN quote_sent_at TIMESTAMPTZ;
  END IF;

  -- Approved date
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'approved_at'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN approved_at TIMESTAMPTZ;
  END IF;

  -- Scheduled date
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'scheduled_at'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN scheduled_at TIMESTAMPTZ;
  END IF;

  -- Installed/completed date
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'installed_at'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN installed_at TIMESTAMPTZ;
  END IF;
END $$;

-- ============================================================================
-- STEP 2: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_leads_roofing_pipeline_stage 
  ON public.leads(roofing_pipeline_stage) 
  WHERE roofing_pipeline_stage IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_workspace_pipeline_stage 
  ON public.leads(workspace_id, roofing_pipeline_stage) 
  WHERE workspace_id IS NOT NULL AND roofing_pipeline_stage IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_lead_status 
  ON public.leads(lead_status) 
  WHERE lead_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_estimated_job_value 
  ON public.leads(estimated_job_value DESC) 
  WHERE estimated_job_value IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_stage_entered_at 
  ON public.leads(stage_entered_at DESC);

-- ============================================================================
-- STEP 3: CREATE PIPELINE MOVEMENT LOG TABLE
-- ============================================================================
-- Tracks all automatic and manual pipeline stage movements for audit trail

CREATE TABLE IF NOT EXISTS public.pipeline_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('automatic', 'manual')),
  trigger_reason TEXT, -- e.g., 'homeowner_replied', 'inspection_scheduled', 'quote_sent', 'user_action'
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_movements_lead_id 
  ON public.pipeline_movements(lead_id);

CREATE INDEX IF NOT EXISTS idx_pipeline_movements_workspace_id 
  ON public.pipeline_movements(workspace_id);

CREATE INDEX IF NOT EXISTS idx_pipeline_movements_created_at 
  ON public.pipeline_movements(created_at DESC);

-- RLS for pipeline_movements
ALTER TABLE public.pipeline_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view pipeline movements for their workspace"
  ON public.pipeline_movements
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = pipeline_movements.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "SmartSend system can insert pipeline movements"
  ON public.pipeline_movements
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- STEP 4: FUNCTION — Move Lead to Pipeline Stage
-- ============================================================================
-- Centralized function for moving leads between stages with audit logging

CREATE OR REPLACE FUNCTION public.move_lead_to_pipeline_stage(
  p_lead_id UUID,
  p_new_stage TEXT,
  p_movement_type TEXT DEFAULT 'manual',
  p_trigger_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead RECORD;
  v_workspace_id UUID;
  v_old_stage TEXT;
BEGIN
  -- Get lead info
  SELECT 
    id, 
    workspace_id, 
    roofing_pipeline_stage,
    stage_entered_at
  INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found: %', p_lead_id;
  END IF;

  v_workspace_id := v_lead.workspace_id;
  v_old_stage := v_lead.roofing_pipeline_stage;

  -- Validate new stage
  IF p_new_stage NOT IN ('lead_in', 'inspection_set', 'quote_sent', 'approved', 'scheduled', 'installed') THEN
    RAISE EXCEPTION 'Invalid pipeline stage: %', p_new_stage;
  END IF;

  -- Skip if already in this stage
  IF v_old_stage = p_new_stage THEN
    RETURN false;
  END IF;

  -- Update lead stage and timestamp
  UPDATE public.leads
  SET 
    roofing_pipeline_stage = p_new_stage,
    stage_entered_at = now(),
    updated_at = now()
  WHERE id = p_lead_id;

  -- Set stage-specific timestamps
  CASE p_new_stage
    WHEN 'inspection_set' THEN
      UPDATE public.leads SET inspection_scheduled_at = COALESCE(inspection_scheduled_at, now()) WHERE id = p_lead_id;
    WHEN 'quote_sent' THEN
      UPDATE public.leads SET quote_sent_at = COALESCE(quote_sent_at, now()) WHERE id = p_lead_id;
    WHEN 'approved' THEN
      UPDATE public.leads SET approved_at = COALESCE(approved_at, now()) WHERE id = p_lead_id;
    WHEN 'scheduled' THEN
      UPDATE public.leads SET scheduled_at = COALESCE(scheduled_at, now()) WHERE id = p_lead_id;
    WHEN 'installed' THEN
      UPDATE public.leads SET installed_at = COALESCE(installed_at, now()) WHERE id = p_lead_id;
  END CASE;

  -- Log movement
  INSERT INTO public.pipeline_movements (
    lead_id,
    workspace_id,
    from_stage,
    to_stage,
    movement_type,
    trigger_reason,
    metadata
  )
  VALUES (
    p_lead_id,
    v_workspace_id,
    v_old_stage,
    p_new_stage,
    p_movement_type,
    p_trigger_reason,
    p_metadata
  );

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.move_lead_to_pipeline_stage IS 'Moves a lead to a new pipeline stage and logs the movement (Block 24260)';

-- ============================================================================
-- STEP 5: FUNCTION — Auto-Detect and Move Lead Based on Reply Content
-- ============================================================================
-- Automatically moves leads based on homeowner replies

CREATE OR REPLACE FUNCTION public.auto_move_lead_from_reply(
  p_lead_id UUID,
  p_reply_text TEXT,
  p_reply_subject TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead RECORD;
  v_current_stage TEXT;
  v_lower_text TEXT;
  v_lower_subject TEXT;
  v_new_stage TEXT;
BEGIN
  -- Get current lead info
  SELECT roofing_pipeline_stage INTO v_current_stage
  FROM public.leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_lower_text := LOWER(COALESCE(p_reply_text, ''));
  v_lower_subject := LOWER(COALESCE(p_reply_subject, ''));

  -- Detection logic for each stage transition

  -- Lead In → Inspection Set
  -- Keywords: "come by", "inspect", "available", "schedule", "appointment", "when can you"
  IF v_current_stage = 'lead_in' THEN
    IF (
      v_lower_text LIKE '%come by%' OR
      v_lower_text LIKE '%inspect%' OR
      v_lower_text LIKE '%available%' OR
      v_lower_text LIKE '%schedule%' OR
      v_lower_text LIKE '%appointment%' OR
      v_lower_text LIKE '%when can you%' OR
      v_lower_text LIKE '%this week%' OR
      v_lower_text LIKE '%tomorrow%' OR
      v_lower_text LIKE '%next week%'
    ) THEN
      v_new_stage := 'inspection_set';
    END IF;
  END IF;

  -- Inspection Set → Quote Sent (if roofer marks quote sent)
  -- This is typically manual, but can be triggered by integration

  -- Quote Sent → Approved
  -- Keywords: "yes", "let's do it", "approved", "go ahead", "sounds good", "proceed"
  IF v_current_stage = 'quote_sent' THEN
    IF (
      v_lower_text LIKE '%yes%' OR
      v_lower_text LIKE '%let''s do it%' OR
      v_lower_text LIKE '%approved%' OR
      v_lower_text LIKE '%go ahead%' OR
      v_lower_text LIKE '%sounds good%' OR
      v_lower_text LIKE '%proceed%' OR
      v_lower_text LIKE '%let''s move forward%' OR
      v_lower_text LIKE '%i''m in%'
    ) THEN
      v_new_stage := 'approved';
    END IF;
  END IF;

  -- Approved → Scheduled
  -- Keywords: "schedule", "when can you install", "install date", "ready to schedule"
  IF v_current_stage = 'approved' THEN
    IF (
      v_lower_text LIKE '%schedule%' OR
      v_lower_text LIKE '%install%' OR
      v_lower_text LIKE '%when can you%' OR
      v_lower_text LIKE '%ready%' OR
      v_lower_text LIKE '%date%'
    ) THEN
      v_new_stage := 'scheduled';
    END IF;
  END IF;

  -- Move if detected
  IF v_new_stage IS NOT NULL THEN
    PERFORM public.move_lead_to_pipeline_stage(
      p_lead_id,
      v_new_stage,
      'automatic',
      'homeowner_reply_detected',
      jsonb_build_object('reply_text', LEFT(p_reply_text, 500), 'reply_subject', p_reply_subject)
    );
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.auto_move_lead_from_reply IS 'Automatically moves lead to appropriate stage based on reply content (Block 24260)';

-- ============================================================================
-- STEP 6: FUNCTION — Auto-Tag Lead Status (HOT/WARM/COLD)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_tag_lead_status(
  p_lead_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead RECORD;
  v_last_reply_at TIMESTAMPTZ;
  v_days_since_reply INTEGER;
  v_pipeline_stage TEXT;
  v_new_status TEXT;
BEGIN
  -- Get lead info
  SELECT 
    roofing_pipeline_stage,
    last_reply_at,
    created_at
  INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_pipeline_stage := v_lead.roofing_pipeline_stage;
  v_last_reply_at := v_lead.last_reply_at;

  -- Calculate days since last reply
  IF v_last_reply_at IS NOT NULL THEN
    v_days_since_reply := EXTRACT(EPOCH FROM (now() - v_last_reply_at)) / 86400;
  ELSE
    v_days_since_reply := EXTRACT(EPOCH FROM (now() - v_lead.created_at)) / 86400;
  END IF;

  -- Determine status based on stage and recency
  IF v_pipeline_stage IN ('approved', 'scheduled') THEN
    v_new_status := 'HOT';
  ELSIF v_pipeline_stage IN ('quote_sent', 'inspection_set') AND v_days_since_reply <= 3 THEN
    v_new_status := 'HOT';
  ELSIF v_pipeline_stage = 'quote_sent' AND v_days_since_reply <= 7 THEN
    v_new_status := 'WARM';
  ELSIF v_days_since_reply <= 2 THEN
    v_new_status := 'HOT';
  ELSIF v_days_since_reply <= 7 THEN
    v_new_status := 'WARM';
  ELSE
    v_new_status := 'COLD';
  END IF;

  -- Update lead status
  UPDATE public.leads
  SET lead_status = v_new_status
  WHERE id = p_lead_id;

  RETURN v_new_status;
END;
$$;

COMMENT ON FUNCTION public.auto_tag_lead_status IS 'Automatically tags lead as HOT/WARM/COLD based on pipeline stage and recency (Block 24260)';

-- ============================================================================
-- STEP 7: TRIGGER — Auto-Update Lead Status on Reply
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_auto_move_on_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update last_reply_at
  UPDATE public.leads
  SET 
    last_reply_at = now(),
    last_contact_at = now(),
    updated_at = now()
  WHERE id = NEW.lead_id;

  -- Auto-move based on reply content
  PERFORM public.auto_move_lead_from_reply(
    NEW.lead_id,
    NEW.body,
    NEW.subject
  );

  -- Auto-tag status
  PERFORM public.auto_tag_lead_status(NEW.lead_id);

  RETURN NEW;
END;
$$;

-- Note: This trigger assumes there's an inbox_messages or email_replies table
-- Adjust table name based on your actual schema
-- CREATE TRIGGER trg_auto_move_on_reply
-- AFTER INSERT ON public.inbox_messages
-- FOR EACH ROW
-- WHEN (NEW.direction IN ('inbound', 'in'))
-- EXECUTE FUNCTION public.trigger_auto_move_on_reply();

-- ============================================================================
-- STEP 8: CREATE PIPELINE DASHBOARD METRICS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW public.roofing_pipeline_metrics AS
SELECT 
  workspace_id,
  COUNT(*) FILTER (WHERE roofing_pipeline_stage = 'lead_in') AS leads_in_count,
  COUNT(*) FILTER (WHERE roofing_pipeline_stage = 'inspection_set') AS inspections_set_count,
  COUNT(*) FILTER (WHERE roofing_pipeline_stage = 'quote_sent') AS quotes_sent_count,
  COUNT(*) FILTER (WHERE roofing_pipeline_stage = 'approved') AS approved_count,
  COUNT(*) FILTER (WHERE roofing_pipeline_stage = 'scheduled') AS scheduled_count,
  COUNT(*) FILTER (WHERE roofing_pipeline_stage = 'installed') AS installed_count,
  COUNT(*) AS total_leads,
  COALESCE(SUM(estimated_job_value) FILTER (WHERE roofing_pipeline_stage IN ('quote_sent', 'approved', 'scheduled', 'installed')), 0) AS total_estimated_revenue,
  COALESCE(SUM(estimated_job_value) FILTER (WHERE roofing_pipeline_stage = 'installed' AND installed_at >= date_trunc('month', now())), 0) AS revenue_won_this_month,
  COALESCE(AVG(close_probability) FILTER (WHERE close_probability IS NOT NULL), 0) AS avg_close_probability,
  COUNT(*) FILTER (WHERE lead_status = 'HOT') AS hot_leads_count,
  COUNT(*) FILTER (WHERE lead_status = 'WARM') AS warm_leads_count,
  COUNT(*) FILTER (WHERE lead_status = 'COLD') AS cold_leads_count
FROM public.leads
WHERE workspace_id IS NOT NULL
GROUP BY workspace_id;

-- ============================================================================
-- STEP 9: GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.roofing_pipeline_metrics TO authenticated;
GRANT SELECT ON public.pipeline_movements TO authenticated;

-- ============================================================================
-- STEP 10: INITIALIZE EXISTING LEADS
-- ============================================================================
-- Set default pipeline stage for existing leads that don't have one

UPDATE public.leads
SET 
  roofing_pipeline_stage = 'lead_in',
  stage_entered_at = COALESCE(stage_entered_at, created_at),
  lead_status = COALESCE(lead_status, 'WARM')
WHERE roofing_pipeline_stage IS NULL;






































