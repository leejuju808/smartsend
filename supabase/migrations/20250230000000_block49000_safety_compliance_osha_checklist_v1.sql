-- =========================================================
-- Block 49000 — SmartSend Roofing "Safety Compliance + OSHA Checklist System" v1
-- (DAILY CREW SAFETY FORMS • PRE-START CHECKLIST • OSHA COMPLIANCE • INCIDENT REPORTING • PHOTO VERIFICATION)
-- =========================================================
-- 
-- This block adds the legal + safety backbone to SmartSend.
-- Roofers GET SUED and GET FINED when safety falls apart.
-- This system protects:
--   - the company
--   - the crews
--   - the homeowner
--   - the owner's liability
-- 
-- This is a MAJOR trust + professionalism upgrade.

-- ============================================================================
-- PART 1 — CREATE safety_checklists TABLE
-- ============================================================================
-- Daily pre-start safety checklist that crews must complete before starting a job
-- Each checklist contains Yes/No items, notes, and required photos

CREATE TABLE IF NOT EXISTS public.safety_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  
  -- Checklist data stored as JSONB for flexibility
  -- Structure: [{ item: "Harness check", answer: "yes|no", notes: "...", photo_required: true, photo_url: "..." }, ...]
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  
  -- Weather conditions at time of checklist
  weather jsonb, -- { temperature, wind_speed, conditions, etc }
  
  -- Completion status
  completed boolean DEFAULT false,
  completed_at timestamptz,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_checklists_job ON public.safety_checklists(job_id);
CREATE INDEX IF NOT EXISTS idx_safety_checklists_crew ON public.safety_checklists(crew_id);
CREATE INDEX IF NOT EXISTS idx_safety_checklists_member ON public.safety_checklists(member_id);
CREATE INDEX IF NOT EXISTS idx_safety_checklists_completed ON public.safety_checklists(completed, created_at);

-- ============================================================================
-- PART 2 — CREATE safety_photos TABLE
-- ============================================================================
-- Mandatory safety photos required for each job
-- Categories: harness, ladder, edge_protection, warning_lines, material_placement, etc.

CREATE TABLE IF NOT EXISTS public.safety_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  checklist_id uuid REFERENCES public.safety_checklists(id) ON DELETE SET NULL,
  
  -- Photo metadata
  category text NOT NULL, -- 'harness', 'ladder', 'edge_protection', 'warning_lines', 'material_placement', 'other'
  url text NOT NULL, -- Storage URL (Supabase Storage or external)
  thumbnail_url text, -- Optional thumbnail for faster loading
  
  -- Photo details
  description text,
  taken_at timestamptz DEFAULT now(),
  
  -- Metadata
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_photos_job ON public.safety_photos(job_id);
CREATE INDEX IF NOT EXISTS idx_safety_photos_category ON public.safety_photos(category);
CREATE INDEX IF NOT EXISTS idx_safety_photos_checklist ON public.safety_photos(checklist_id);
CREATE INDEX IF NOT EXISTS idx_safety_photos_member ON public.safety_photos(member_id);

-- ============================================================================
-- PART 3 — CREATE incident_reports TABLE
-- ============================================================================
-- Incident reporting tool for falls, cuts, tool damage, property damage, near misses
-- Owner is notified instantly when an incident is reported

CREATE TABLE IF NOT EXISTS public.incident_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  
  -- Incident details
  incident_type text NOT NULL CHECK (incident_type IN (
    'fall',
    'cut',
    'tool_damage',
    'property_damage',
    'near_miss',
    'injury',
    'other'
  )),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'low',
  
  -- Description
  description text NOT NULL,
  what_happened text,
  who_was_involved text[],
  witnesses text[],
  
  -- Conditions
  weather jsonb, -- { temperature, wind_speed, conditions, etc }
  time_of_incident timestamptz DEFAULT now(),
  
  -- Media
  photo_urls text[] DEFAULT '{}',
  
  -- Status
  status text CHECK (status IN ('reported', 'investigating', 'resolved', 'closed')) DEFAULT 'reported',
  owner_notified boolean DEFAULT false,
  owner_notified_at timestamptz,
  
  -- Follow-up
  resolution_notes text,
  resolved_at timestamptz,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_reports_job ON public.incident_reports(job_id);
CREATE INDEX IF NOT EXISTS idx_incident_reports_severity ON public.incident_reports(severity);
CREATE INDEX IF NOT EXISTS idx_incident_reports_status ON public.incident_reports(status);
CREATE INDEX IF NOT EXISTS idx_incident_reports_crew ON public.incident_reports(crew_id);
CREATE INDEX IF NOT EXISTS idx_incident_reports_created ON public.incident_reports(created_at DESC);

-- ============================================================================
-- PART 4 — CREATE safety_scores TABLE
-- ============================================================================
-- Safety score for each job (out of 100)
-- Score calculation:
--   - All safety checklist items completed = +60
--   - All required photos uploaded = +40
-- Low score triggers owner alert

CREATE TABLE IF NOT EXISTS public.safety_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  
  -- Score breakdown
  score numeric NOT NULL CHECK (score >= 0 AND score <= 100),
  checklist_score numeric DEFAULT 0, -- 0-60
  photo_score numeric DEFAULT 0, -- 0-40
  
  -- Details
  checklist_items_total integer DEFAULT 0,
  checklist_items_completed integer DEFAULT 0,
  photos_required integer DEFAULT 0,
  photos_uploaded integer DEFAULT 0,
  
  -- Alert status
  low_score_alert_sent boolean DEFAULT false,
  low_score_alert_sent_at timestamptz,
  
  -- Metadata
  calculated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_safety_scores_job_unique ON public.safety_scores(job_id);
CREATE INDEX IF NOT EXISTS idx_safety_scores_score ON public.safety_scores(score);
CREATE INDEX IF NOT EXISTS idx_safety_scores_low_score ON public.safety_scores(score) WHERE score < 80;

-- ============================================================================
-- PART 5 — CREATE safety_templates TABLE (OSHA Templates)
-- ============================================================================
-- Pre-built OSHA compliance templates that can be used for checklists

CREATE TABLE IF NOT EXISTS public.safety_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Template info
  name text NOT NULL, -- e.g. "Roofing Fall Protection Checklist"
  template_type text NOT NULL CHECK (template_type IN (
    'pre_start_checklist',
    'fall_protection',
    'hazard_communication',
    'accident_near_miss',
    'tool_inspection',
    'custom'
  )),
  
  -- Template structure (JSONB array of checklist items)
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Structure: [{ id: "...", question: "...", required: true, photo_required: false, category: "..." }, ...]
  
  -- Is this a default OSHA template?
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_templates_workspace ON public.safety_templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_safety_templates_type ON public.safety_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_safety_templates_default ON public.safety_templates(is_default) WHERE is_default = true;

-- Create unique constraint for default templates (name + template_type)
CREATE UNIQUE INDEX IF NOT EXISTS idx_safety_templates_default_unique 
  ON public.safety_templates(name, template_type) 
  WHERE is_default = true;

-- Insert default OSHA templates (only if they don't exist)
INSERT INTO public.safety_templates (name, template_type, is_default, items) VALUES
(
  'Roofing Fall Protection Checklist',
  'fall_protection',
  true,
  '[
    {"id": "harness_check", "question": "Is safety harness inspected and properly worn?", "required": true, "photo_required": true, "category": "harness"},
    {"id": "ladder_secured", "question": "Is ladder properly secured and positioned?", "required": true, "photo_required": true, "category": "ladder"},
    {"id": "ppe_worn", "question": "Is all required PPE (hard hat, safety glasses, gloves) being worn?", "required": true, "photo_required": false, "category": "ppe"},
    {"id": "weather_review", "question": "Has weather been reviewed? (wind < 25mph, no ice/rain)", "required": true, "photo_required": false, "category": "weather"},
    {"id": "jobsite_hazards", "question": "Have jobsite hazards been identified and marked?", "required": true, "photo_required": false, "category": "hazards"},
    {"id": "electrical_risks", "question": "Have electrical risks been identified and addressed?", "required": true, "photo_required": false, "category": "electrical"},
    {"id": "open_edges", "question": "Are all open edges protected with warning lines or guardrails?", "required": true, "photo_required": true, "category": "edge_protection"},
    {"id": "fall_protection", "question": "Is fall protection system in place and functional?", "required": true, "photo_required": true, "category": "fall_protection"}
  ]'::jsonb
),
(
  'Hazard Communication Log',
  'hazard_communication',
  true,
  '[
    {"id": "msds_reviewed", "question": "Have Material Safety Data Sheets (MSDS) been reviewed?", "required": true, "photo_required": false, "category": "documentation"},
    {"id": "chemicals_identified", "question": "Have all chemicals and materials been identified?", "required": true, "photo_required": false, "category": "hazards"},
    {"id": "safety_data_available", "question": "Is safety data available on-site?", "required": true, "photo_required": false, "category": "documentation"}
  ]'::jsonb
),
(
  'Accident Near-Miss Report',
  'accident_near_miss',
  true,
  '[
    {"id": "incident_type", "question": "What type of incident occurred?", "required": true, "photo_required": false, "category": "incident"},
    {"id": "severity", "question": "What is the severity level?", "required": true, "photo_required": false, "category": "incident"},
    {"id": "description", "question": "Describe what happened", "required": true, "photo_required": false, "category": "incident"},
    {"id": "witnesses", "question": "Were there any witnesses?", "required": false, "photo_required": false, "category": "incident"}
  ]'::jsonb
),
(
  'Tool Inspection Checklist',
  'tool_inspection',
  true,
  '[
    {"id": "power_tools", "question": "Are all power tools inspected and in good working condition?", "required": true, "photo_required": false, "category": "tools"},
    {"id": "hand_tools", "question": "Are all hand tools inspected and in good condition?", "required": true, "photo_required": false, "category": "tools"},
    {"id": "safety_equipment", "question": "Is all safety equipment (harnesses, ropes, anchors) inspected?", "required": true, "photo_required": true, "category": "tools"}
  ]'::jsonb
)
ON CONFLICT (name, template_type) WHERE is_default = true DO NOTHING;

-- ============================================================================
-- PART 6 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.safety_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for safety_checklists
CREATE POLICY "safety_checklists_select_workspace" ON public.safety_checklists
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE j.id = safety_checklists.job_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "safety_checklists_insert_crew" ON public.safety_checklists
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.crew_members cm
      JOIN public.roofing_jobs j ON j.id = safety_checklists.job_id
      WHERE cm.id = safety_checklists.member_id
      AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "safety_checklists_update_crew" ON public.safety_checklists
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.crew_members cm
      WHERE cm.id = safety_checklists.member_id
      AND cm.user_id = auth.uid()
    )
  );

-- RLS Policies for safety_photos
CREATE POLICY "safety_photos_select_workspace" ON public.safety_photos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE j.id = safety_photos.job_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "safety_photos_insert_crew" ON public.safety_photos
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.crew_members cm
      JOIN public.roofing_jobs j ON j.id = safety_photos.job_id
      WHERE cm.id = safety_photos.member_id
      AND cm.user_id = auth.uid()
    )
  );

-- RLS Policies for incident_reports
CREATE POLICY "incident_reports_select_workspace" ON public.incident_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE j.id = incident_reports.job_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "incident_reports_insert_crew" ON public.incident_reports
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.crew_members cm
      JOIN public.roofing_jobs j ON j.id = incident_reports.job_id
      WHERE cm.id = incident_reports.crew_member_id
      AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "incident_reports_update_owner" ON public.incident_reports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE j.id = incident_reports.job_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

-- RLS Policies for safety_scores
CREATE POLICY "safety_scores_select_workspace" ON public.safety_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs j
      JOIN public.workspace_members wm ON wm.workspace_id = j.workspace_id
      WHERE j.id = safety_scores.job_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policies for safety_templates
CREATE POLICY "safety_templates_select_workspace" ON public.safety_templates
  FOR SELECT USING (
    is_default = true OR
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = safety_templates.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "safety_templates_insert_owner" ON public.safety_templates
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = safety_templates.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- PART 7 — HELPER FUNCTIONS
-- ============================================================================

-- Function to check if safety checklist is completed for a job
CREATE OR REPLACE FUNCTION public.has_completed_safety_checklist(p_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.safety_checklists
    WHERE job_id = p_job_id
    AND completed = true
    AND created_at::date = CURRENT_DATE
  );
END;
$$;

-- Function to calculate safety score for a job
CREATE OR REPLACE FUNCTION public.calculate_safety_score(p_job_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_checklist_score numeric := 0;
  v_photo_score numeric := 0;
  v_total_score numeric := 0;
  v_checklist_items_total integer := 0;
  v_checklist_items_completed integer := 0;
  v_photos_required integer := 0;
  v_photos_uploaded integer := 0;
  v_checklist_data jsonb;
  v_item jsonb;
BEGIN
  -- Get the most recent checklist for today
  SELECT checklist INTO v_checklist_data
  FROM public.safety_checklists
  WHERE job_id = p_job_id
  AND created_at::date = CURRENT_DATE
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_checklist_data IS NULL THEN
    RETURN 0;
  END IF;

  -- Calculate checklist score (60 points max)
  v_checklist_items_total := jsonb_array_length(v_checklist_data);
  
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_checklist_data)
  LOOP
    IF (v_item->>'answer')::text = 'yes' THEN
      v_checklist_items_completed := v_checklist_items_completed + 1;
    END IF;
    
    IF (v_item->>'photo_required')::boolean = true THEN
      v_photos_required := v_photos_required + 1;
    END IF;
  END LOOP;

  -- Checklist score: 60 points if all items are "yes"
  IF v_checklist_items_total > 0 THEN
    v_checklist_score := (v_checklist_items_completed::numeric / v_checklist_items_total::numeric) * 60;
  END IF;

  -- Calculate photo score (40 points max)
  SELECT COUNT(*) INTO v_photos_uploaded
  FROM public.safety_photos
  WHERE job_id = p_job_id
  AND created_at::date = CURRENT_DATE;

  IF v_photos_required > 0 THEN
    v_photo_score := LEAST((v_photos_uploaded::numeric / v_photos_required::numeric) * 40, 40);
  ELSE
    -- If no photos required, give full 40 points
    v_photo_score := 40;
  END IF;

  v_total_score := v_checklist_score + v_photo_score;

  -- Upsert safety score
  INSERT INTO public.safety_scores (
    job_id,
    score,
    checklist_score,
    photo_score,
    checklist_items_total,
    checklist_items_completed,
    photos_required,
    photos_uploaded,
    calculated_at
  )
  VALUES (
    p_job_id,
    v_total_score,
    v_checklist_score,
    v_photo_score,
    v_checklist_items_total,
    v_checklist_items_completed,
    v_photos_required,
    v_photos_uploaded,
    now()
  )
  ON CONFLICT (job_id) DO UPDATE SET
    score = EXCLUDED.score,
    checklist_score = EXCLUDED.checklist_score,
    photo_score = EXCLUDED.photo_score,
    checklist_items_total = EXCLUDED.checklist_items_total,
    checklist_items_completed = EXCLUDED.checklist_items_completed,
    photos_required = EXCLUDED.photos_required,
    photos_uploaded = EXCLUDED.photos_uploaded,
    calculated_at = EXCLUDED.calculated_at,
    updated_at = now();

  RETURN v_total_score;
END;
$$;

-- Function to trigger owner notification for incidents
CREATE OR REPLACE FUNCTION public.notify_owner_of_incident()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Mark as notified (actual notification will be handled by API/webhook)
  NEW.owner_notified := true;
  NEW.owner_notified_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_owner_incident
  AFTER INSERT ON public.incident_reports
  FOR EACH ROW
  WHEN (NEW.severity IN ('high', 'critical'))
  EXECUTE FUNCTION public.notify_owner_of_incident();

-- ============================================================================
-- PART 8 — UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_safety_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_safety_checklists_updated_at
  BEFORE UPDATE ON public.safety_checklists
  FOR EACH ROW
  EXECUTE FUNCTION public.set_safety_updated_at();

CREATE TRIGGER trg_incident_reports_updated_at
  BEFORE UPDATE ON public.incident_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_safety_updated_at();

CREATE TRIGGER trg_safety_scores_updated_at
  BEFORE UPDATE ON public.safety_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.set_safety_updated_at();

CREATE TRIGGER trg_safety_templates_updated_at
  BEFORE UPDATE ON public.safety_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_safety_updated_at();

-- ============================================================================
-- PART 9 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.safety_checklists IS 'Daily pre-start safety checklists that crews must complete before starting a job';
COMMENT ON TABLE public.safety_photos IS 'Mandatory safety photos required for each job (harness, ladder, edge protection, etc.)';
COMMENT ON TABLE public.incident_reports IS 'Incident reporting for falls, cuts, tool damage, property damage, near misses';
COMMENT ON TABLE public.safety_scores IS 'Safety score for each job (0-100) based on checklist completion and photo uploads';
COMMENT ON TABLE public.safety_templates IS 'OSHA compliance templates for safety checklists';

