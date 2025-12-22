-- Block 23500 — SmartSend Roofing Demo CRM Notes v1
-- 4-Line Demo Note Format • Buying Signal Scoring • Auto-Triggers • Tag System
-- This powers follow-up, closing, and future automation for SmartSend sales team

-- ============================================================================
-- 1️⃣ DEMO NOTES TABLE (4-Line Structured Format)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.demo_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Line 1: Company Snapshot
  -- Format: "City, State — X crews, Y–Z jobs/mo, primary service"
  company_snapshot TEXT NOT NULL,
  
  -- Line 2: Pain Points (Top 2–3, comma-separated)
  -- Examples: "No follow-up, Referrals drying up, Slow office admin"
  pain_points TEXT NOT NULL,
  
  -- Line 3: Buying Signal Score (1-5)
  -- 1 = Cold, 2 = Low interest, 3 = Warm, 4 = Hot, 5 = Fire
  buying_signal_score INTEGER NOT NULL CHECK (buying_signal_score >= 1 AND buying_signal_score <= 5),
  
  -- Line 4: Activation Blocker (The One Thing Stopping Them)
  -- Examples: "Needs partner approval", "Wants pricing emailed", "Busy with storm rush"
  activation_blocker TEXT NOT NULL,
  
  -- Full formatted note (for display/backup)
  full_note_text TEXT,
  
  -- Metadata for automation
  metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_demo_notes_lead ON public.demo_notes(lead_id);
CREATE INDEX IF NOT EXISTS idx_demo_notes_workspace ON public.demo_notes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_demo_notes_buying_signal ON public.demo_notes(buying_signal_score);
CREATE INDEX IF NOT EXISTS idx_demo_notes_created_at ON public.demo_notes(created_at DESC);

-- Unique constraint: one demo note per lead (can be updated)
CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_notes_lead_unique ON public.demo_notes(lead_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_demo_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_demo_notes_updated_at ON public.demo_notes;
CREATE TRIGGER trg_demo_notes_updated_at
  BEFORE UPDATE ON public.demo_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_demo_notes_updated_at();

-- Trigger to auto-generate full_note_text
CREATE OR REPLACE FUNCTION generate_demo_note_text()
RETURNS TRIGGER AS $$
BEGIN
  NEW.full_note_text := format(
    '%s' || E'\n' ||
    '%s' || E'\n' ||
    '%s/5 — %s' || E'\n' ||
    'Blocker: %s',
    NEW.company_snapshot,
    NEW.pain_points,
    NEW.buying_signal_score,
    CASE NEW.buying_signal_score
      WHEN 1 THEN 'Cold'
      WHEN 2 THEN 'Low interest'
      WHEN 3 THEN 'Warm'
      WHEN 4 THEN 'Hot'
      WHEN 5 THEN 'Fire'
    END,
    NEW.activation_blocker
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_generate_demo_note_text ON public.demo_notes;
CREATE TRIGGER trg_generate_demo_note_text
  BEFORE INSERT OR UPDATE ON public.demo_notes
  FOR EACH ROW
  EXECUTE FUNCTION generate_demo_note_text();

-- ============================================================================
-- 2️⃣ DEMO NOTE TAGS TABLE (3-Tag System)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.demo_note_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demo_note_id UUID NOT NULL REFERENCES public.demo_notes(id) ON DELETE CASCADE,
  
  -- Tag #1: Interest Level
  interest_level TEXT CHECK (interest_level IN ('hot_lead', 'warm_lead', 'not_ready')),
  
  -- Tag #2: Service Type
  service_type TEXT CHECK (service_type IN (
    'roof_repair',
    'roof_replace',
    'storm_damage',
    'gutters',
    'solar_roof'
  )),
  
  -- Tag #3: Ideal Plan Target
  ideal_plan_target TEXT CHECK (ideal_plan_target IN (
    'starter_fit',    -- 1 crew, <10 jobs/mo
    'growth_fit',    -- 2–4 crews, 10–30 jobs/mo
    'domination_fit' -- 5+ crews, big markets
  )),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- One tag set per demo note
  UNIQUE(demo_note_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_demo_note_tags_note ON public.demo_note_tags(demo_note_id);
CREATE INDEX IF NOT EXISTS idx_demo_note_tags_interest ON public.demo_note_tags(interest_level);
CREATE INDEX IF NOT EXISTS idx_demo_note_tags_service ON public.demo_note_tags(service_type);
CREATE INDEX IF NOT EXISTS idx_demo_note_tags_plan ON public.demo_note_tags(ideal_plan_target);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_demo_note_tags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_demo_note_tags_updated_at ON public.demo_note_tags;
CREATE TRIGGER trg_demo_note_tags_updated_at
  BEFORE UPDATE ON public.demo_note_tags
  FOR EACH ROW
  EXECUTE FUNCTION update_demo_note_tags_updated_at();

-- Function to auto-set interest_level based on buying_signal_score
CREATE OR REPLACE FUNCTION auto_set_interest_level()
RETURNS TRIGGER AS $$
DECLARE
  v_buying_score INTEGER;
  v_interest_level TEXT;
BEGIN
  -- Get buying signal score from demo_notes
  SELECT buying_signal_score INTO v_buying_score
  FROM public.demo_notes
  WHERE id = NEW.demo_note_id;
  
  -- Map score to interest level
  CASE v_buying_score
    WHEN 4, 5 THEN v_interest_level := 'hot_lead';
    WHEN 3 THEN v_interest_level := 'warm_lead';
    WHEN 1, 2 THEN v_interest_level := 'not_ready';
    ELSE v_interest_level := NULL;
  END CASE;
  
  -- Auto-set interest_level if not provided
  IF NEW.interest_level IS NULL AND v_interest_level IS NOT NULL THEN
    NEW.interest_level := v_interest_level;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_set_interest_level ON public.demo_note_tags;
CREATE TRIGGER trg_auto_set_interest_level
  BEFORE INSERT OR UPDATE ON public.demo_note_tags
  FOR EACH ROW
  EXECUTE FUNCTION auto_set_interest_level();

-- ============================================================================
-- 3️⃣ AUTO-TRIGGER WORKFLOWS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.demo_workflow_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demo_note_id UUID NOT NULL REFERENCES public.demo_notes(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Workflow type based on buying signal score
  workflow_type TEXT NOT NULL CHECK (workflow_type IN ('hot_lead', 'warm_lead', 'cold_lead')),
  
  -- Workflow status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'triggered', 'completed', 'cancelled')),
  
  -- Workflow steps metadata
  steps_metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  triggered_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_demo_workflow_triggers_note ON public.demo_workflow_triggers(demo_note_id);
CREATE INDEX IF NOT EXISTS idx_demo_workflow_triggers_lead ON public.demo_workflow_triggers(lead_id);
CREATE INDEX IF NOT EXISTS idx_demo_workflow_triggers_workspace ON public.demo_workflow_triggers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_demo_workflow_triggers_type ON public.demo_workflow_triggers(workflow_type);
CREATE INDEX IF NOT EXISTS idx_demo_workflow_triggers_status ON public.demo_workflow_triggers(status);
CREATE INDEX IF NOT EXISTS idx_demo_workflow_triggers_pending ON public.demo_workflow_triggers(workspace_id, status) WHERE status = 'pending';

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_demo_workflow_triggers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_demo_workflow_triggers_updated_at ON public.demo_workflow_triggers;
CREATE TRIGGER trg_demo_workflow_triggers_updated_at
  BEFORE UPDATE ON public.demo_workflow_triggers
  FOR EACH ROW
  EXECUTE FUNCTION update_demo_workflow_triggers_updated_at();

-- ============================================================================
-- 4️⃣ WORKFLOW STEPS TABLE (Individual Actions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.demo_workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_trigger_id UUID NOT NULL REFERENCES public.demo_workflow_triggers(id) ON DELETE CASCADE,
  
  -- Step details
  step_name TEXT NOT NULL,
  step_type TEXT NOT NULL CHECK (step_type IN ('sms', 'email', 'value_proof', 'case_study', 'reminder')),
  delay_hours INTEGER NOT NULL DEFAULT 0, -- Hours to wait before executing
  
  -- Action details
  action_subject TEXT,
  action_body TEXT,
  action_template_key TEXT, -- References email_templates.template_key
  
  -- Execution status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'sent', 'failed', 'skipped')),
  
  -- Execution timestamps
  scheduled_for TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  
  -- Results
  result_metadata JSONB DEFAULT '{}'::jsonb,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_demo_workflow_steps_trigger ON public.demo_workflow_steps(workflow_trigger_id);
CREATE INDEX IF NOT EXISTS idx_demo_workflow_steps_status ON public.demo_workflow_steps(status);
CREATE INDEX IF NOT EXISTS idx_demo_workflow_steps_scheduled ON public.demo_workflow_steps(scheduled_for) WHERE status = 'scheduled';

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_demo_workflow_steps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_demo_workflow_steps_updated_at ON public.demo_workflow_steps;
CREATE TRIGGER trg_demo_workflow_steps_updated_at
  BEFORE UPDATE ON public.demo_workflow_steps
  FOR EACH ROW
  EXECUTE FUNCTION update_demo_workflow_steps_updated_at();

-- ============================================================================
-- 5️⃣ FUNCTION: Auto-Create Workflow Trigger on Demo Note Creation
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_create_demo_workflow()
RETURNS TRIGGER AS $$
DECLARE
  v_workflow_type TEXT;
  v_workflow_id UUID;
  v_lead_id UUID;
  v_workspace_id UUID;
BEGIN
  -- Determine workflow type based on buying signal score
  CASE NEW.buying_signal_score
    WHEN 4, 5 THEN v_workflow_type := 'hot_lead';
    WHEN 3 THEN v_workflow_type := 'warm_lead';
    WHEN 1, 2 THEN v_workflow_type := 'cold_lead';
    ELSE RETURN NEW;
  END CASE;
  
  -- Get lead_id and workspace_id
  v_lead_id := NEW.lead_id;
  v_workspace_id := NEW.workspace_id;
  
  -- Create workflow trigger
  INSERT INTO public.demo_workflow_triggers (
    demo_note_id,
    lead_id,
    workspace_id,
    workflow_type,
    status
  )
  VALUES (
    NEW.id,
    v_lead_id,
    v_workspace_id,
    v_workflow_type,
    'pending'
  )
  RETURNING id INTO v_workflow_id;
  
  -- Create workflow steps based on type
  IF v_workflow_type = 'hot_lead' THEN
    -- Hot Lead Workflow: Immediate SMS, 24-hour email, 3-day value proof
    INSERT INTO public.demo_workflow_steps (workflow_trigger_id, step_name, step_type, delay_hours, action_template_key)
    VALUES
      (v_workflow_id, 'Immediate SMS', 'sms', 0, NULL),
      (v_workflow_id, '24-Hour Email', 'email', 24, 'followup_48h'),
      (v_workflow_id, '3-Day Value Proof', 'value_proof', 72, NULL);
      
  ELSIF v_workflow_type = 'warm_lead' THEN
    -- Warm Lead Workflow: 24-hour reminder, Day 3 proof, Day 7 "hold your spot"
    INSERT INTO public.demo_workflow_steps (workflow_trigger_id, step_name, step_type, delay_hours, action_template_key)
    VALUES
      (v_workflow_id, '24-Hour Reminder', 'email', 24, 'followup_48h'),
      (v_workflow_id, 'Day 3 Proof', 'value_proof', 72, NULL),
      (v_workflow_id, 'Day 7 Hold Spot', 'email', 168, 'followup_7d');
      
  ELSIF v_workflow_type = 'cold_lead' THEN
    -- Cold Lead Workflow: Slow nurture, 10-day value offer, Case study drops
    INSERT INTO public.demo_workflow_steps (workflow_trigger_id, step_name, step_type, delay_hours, action_template_key)
    VALUES
      (v_workflow_id, '10-Day Value Offer', 'email', 240, 'followup_14d'),
      (v_workflow_id, 'Case Study Drop', 'case_study', 336, NULL);
  END IF;
  
  -- Update workflow trigger status
  UPDATE public.demo_workflow_triggers
  SET status = 'triggered', triggered_at = now()
  WHERE id = v_workflow_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_create_demo_workflow ON public.demo_notes;
CREATE TRIGGER trg_auto_create_demo_workflow
  AFTER INSERT ON public.demo_notes
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_demo_workflow();

-- ============================================================================
-- 6️⃣ FUNCTION: Get Demo Note Data for Follow-Up Personalization
-- ============================================================================

CREATE OR REPLACE FUNCTION get_demo_note_for_followup(p_lead_id UUID)
RETURNS TABLE (
  company_snapshot TEXT,
  pain_points TEXT,
  buying_signal_score INTEGER,
  activation_blocker TEXT,
  interest_level TEXT,
  service_type TEXT,
  ideal_plan_target TEXT,
  city TEXT,
  crew_size TEXT,
  jobs_per_month TEXT,
  primary_service TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    dn.company_snapshot,
    dn.pain_points,
    dn.buying_signal_score,
    dn.activation_blocker,
    dnt.interest_level,
    dnt.service_type,
    dnt.ideal_plan_target,
    -- Extract city from company_snapshot (format: "City, State — ...")
    (regexp_match(dn.company_snapshot, '^([^,]+),'))[1]::TEXT AS city,
    -- Extract crew size (format: "X crews")
    (regexp_match(dn.company_snapshot, '(\d+)\s+crews?'))[1]::TEXT AS crew_size,
    -- Extract jobs/month (format: "Y–Z jobs/mo")
    (regexp_match(dn.company_snapshot, '(\d+)[–-](\d+)\s+jobs?/mo'))[1]::TEXT || '-' || (regexp_match(dn.company_snapshot, '(\d+)[–-](\d+)\s+jobs?/mo'))[2]::TEXT AS jobs_per_month,
    -- Extract primary service (everything after the last comma)
    trim(split_part(dn.company_snapshot, '—', 2)) AS primary_service
  FROM public.demo_notes dn
  LEFT JOIN public.demo_note_tags dnt ON dnt.demo_note_id = dn.id
  WHERE dn.lead_id = p_lead_id
  ORDER BY dn.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 7️⃣ FUNCTION: Format Demo Note for Display
-- ============================================================================

CREATE OR REPLACE FUNCTION format_demo_note(p_demo_note_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_note RECORD;
  v_formatted TEXT;
BEGIN
  SELECT * INTO v_note
  FROM public.demo_notes
  WHERE id = p_demo_note_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  v_formatted := format(
    '%s' || E'\n' ||
    '%s' || E'\n' ||
    '%s/5 — %s' || E'\n' ||
    'Blocker: %s',
    v_note.company_snapshot,
    v_note.pain_points,
    v_note.buying_signal_score,
    CASE v_note.buying_signal_score
      WHEN 1 THEN 'Cold'
      WHEN 2 THEN 'Low interest'
      WHEN 3 THEN 'Warm'
      WHEN 4 THEN 'Hot'
      WHEN 5 THEN 'Fire'
    END,
    v_note.activation_blocker
  );
  
  RETURN v_formatted;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================================
-- 8️⃣ RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE public.demo_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_note_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_workflow_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_workflow_steps ENABLE ROW LEVEL SECURITY;

-- Demo Notes RLS: Workspace members can read/write
CREATE POLICY "demo_notes_select_workspace_member" ON public.demo_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = demo_notes.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "demo_notes_insert_workspace_member" ON public.demo_notes
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = demo_notes.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "demo_notes_update_workspace_member" ON public.demo_notes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = demo_notes.workspace_id
      AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = demo_notes.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "demo_notes_delete_workspace_member" ON public.demo_notes
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = demo_notes.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

-- Demo Note Tags RLS: Same as demo_notes
CREATE POLICY "demo_note_tags_select_workspace_member" ON public.demo_note_tags
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.demo_notes dn
      JOIN public.workspace_members wm ON wm.workspace_id = dn.workspace_id
      WHERE dn.id = demo_note_tags.demo_note_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "demo_note_tags_insert_workspace_member" ON public.demo_note_tags
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.demo_notes dn
      JOIN public.workspace_members wm ON wm.workspace_id = dn.workspace_id
      WHERE dn.id = demo_note_tags.demo_note_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "demo_note_tags_update_workspace_member" ON public.demo_note_tags
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.demo_notes dn
      JOIN public.workspace_members wm ON wm.workspace_id = dn.workspace_id
      WHERE dn.id = demo_note_tags.demo_note_id
      AND wm.user_id = auth.uid()
    )
  );

-- Workflow Triggers RLS: Same as demo_notes
CREATE POLICY "demo_workflow_triggers_select_workspace_member" ON public.demo_workflow_triggers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = demo_workflow_triggers.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "demo_workflow_triggers_insert_workspace_member" ON public.demo_workflow_triggers
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = demo_workflow_triggers.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Workflow Steps RLS: Same as workflow triggers
CREATE POLICY "demo_workflow_steps_select_workspace_member" ON public.demo_workflow_steps
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.demo_workflow_triggers dwt
      JOIN public.workspace_members wm ON wm.workspace_id = dwt.workspace_id
      WHERE dwt.id = demo_workflow_steps.workflow_trigger_id
      AND wm.user_id = auth.uid()
    )
  );

-- Service role can do everything
CREATE POLICY "demo_notes_service_role" ON public.demo_notes
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "demo_note_tags_service_role" ON public.demo_note_tags
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "demo_workflow_triggers_service_role" ON public.demo_workflow_triggers
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "demo_workflow_steps_service_role" ON public.demo_workflow_steps
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- 9️⃣ GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION get_demo_note_for_followup(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION format_demo_note(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auto_create_demo_workflow() TO service_role;

-- ============================================================================
-- 🔟 COMMENTS
-- ============================================================================

COMMENT ON TABLE public.demo_notes IS 'Structured demo notes using 4-line format: Company Snapshot, Pain Points, Buying Signal Score (1-5), Activation Blocker';
COMMENT ON COLUMN public.demo_notes.company_snapshot IS 'Format: "City, State — X crews, Y–Z jobs/mo, primary service"';
COMMENT ON COLUMN public.demo_notes.pain_points IS 'Top 2–3 pain points, comma-separated (e.g., "No follow-up, Referrals drying up, Slow office admin")';
COMMENT ON COLUMN public.demo_notes.buying_signal_score IS '1=Cold, 2=Low interest, 3=Warm, 4=Hot, 5=Fire';
COMMENT ON COLUMN public.demo_notes.activation_blocker IS 'The one thing stopping them from activating (e.g., "Needs partner approval", "Wants pricing emailed")';

COMMENT ON TABLE public.demo_note_tags IS '3-tag system: interest_level (hot_lead/warm_lead/not_ready), service_type (roof_repair/roof_replace/etc), ideal_plan_target (starter_fit/growth_fit/domination_fit)';
COMMENT ON COLUMN public.demo_note_tags.interest_level IS 'Auto-set based on buying_signal_score: 4-5=hot_lead, 3=warm_lead, 1-2=not_ready';
COMMENT ON COLUMN public.demo_note_tags.service_type IS 'Primary service type: roof_repair, roof_replace, storm_damage, gutters, solar_roof';
COMMENT ON COLUMN public.demo_note_tags.ideal_plan_target IS 'Plan fit: starter_fit (1 crew, <10 jobs/mo), growth_fit (2-4 crews, 10-30 jobs/mo), domination_fit (5+ crews)';

COMMENT ON TABLE public.demo_workflow_triggers IS 'Auto-triggered workflows based on buying signal score: hot_lead (4-5), warm_lead (3), cold_lead (1-2)';
COMMENT ON TABLE public.demo_workflow_steps IS 'Individual workflow steps (SMS, email, value proof, case study) with delay_hours for scheduling';

COMMENT ON FUNCTION get_demo_note_for_followup(UUID) IS 'Returns demo note data formatted for follow-up email personalization';
COMMENT ON FUNCTION format_demo_note(UUID) IS 'Formats demo note into readable 4-line text format';
COMMENT ON FUNCTION auto_create_demo_workflow() IS 'Automatically creates workflow trigger and steps when demo note is created';

-- ============================================================================
-- Block 23500 Complete ✅
-- ============================================================================

