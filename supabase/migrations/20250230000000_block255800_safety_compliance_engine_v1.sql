-- ============================================================================
-- Block 255800 — SmartSend Safety & Compliance Engine v1
-- "OSHA Logs, Digital Safety Training, Daily Toolbox Talks, Violations Alerts, 
--  PPE Tracking, Incident Reports"
-- ============================================================================
-- 
-- This block turns SmartSend into the safety command system for roofing companies
-- — keeping them OSHA-compliant, preventing fines, avoiding injuries, and making
-- crews safer and more professional.
--
-- Roofers will say:
-- "SmartSend made our crews 10x safer."
-- "We finally have OSHA compliance handled."
-- "We'd be stupid not using this."
-- ============================================================================

-- ============================================================================
-- PART 1 — DATABASE SCHEMA
-- ============================================================================

-- 1.1 safety_meetings (Daily Toolbox Talks)
CREATE TABLE IF NOT EXISTS public.safety_meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid, -- References jobs(id) or roofing_jobs(id) - flexible
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  topic text NOT NULL, -- fall protection, ladder safety, nail gun safety, etc.
  notes text,
  completed_by uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  completed_at timestamptz DEFAULT now(),
  
  -- Attendance tracking
  attendee_ids uuid[] DEFAULT '{}', -- Array of crew_member IDs who attended
  group_photo_url text, -- Required photo of team
  
  -- Mandatory completion flag
  is_completed boolean DEFAULT false,
  required_before_job_start boolean DEFAULT true,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_meetings_job ON public.safety_meetings(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_safety_meetings_crew ON public.safety_meetings(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_safety_meetings_workspace ON public.safety_meetings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_safety_meetings_completed_at ON public.safety_meetings(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_safety_meetings_topic ON public.safety_meetings(topic);

COMMENT ON TABLE public.safety_meetings IS 'Daily toolbox talks - mandatory before job start (Block 255800)';
COMMENT ON COLUMN public.safety_meetings.topic IS 'Topic: fall_protection, ladder_safety, nail_gun_safety, weather_hazards, electrical_hazards, ppe_requirements, roof_edge_safety, teardown_hazards';
COMMENT ON COLUMN public.safety_meetings.required_before_job_start IS 'If true, crew cannot start workflow until this is completed';

-- 1.2 safety_checklists (Mandatory Pre/Mid/End-of-Day Checklists)
CREATE TABLE IF NOT EXISTS public.safety_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid, -- References jobs(id) or roofing_jobs(id) - flexible
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  checklist_type text NOT NULL CHECK (checklist_type IN ('pre_job', 'mid_job', 'end_of_day')),
  checklist jsonb NOT NULL, -- Structured checklist data
  
  -- Checklist items (example structure):
  -- {
  --   "ladders_tied_off": true,
  --   "harnesses_inspected": true,
  --   "anchor_points_set": true,
  --   "weather_monitored": true,
  --   "ppe_worn": true,
  --   "electrical_hazards_checked": true,
  --   "debris_managed": false,
  --   "edge_guard_enforced": true,
  --   "nail_gun_safety_verified": true,
  --   "site_cleaned": false,
  --   "tools_secured": true,
  --   "hazards_removed": true
  -- }
  
  completed_by uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  completed_at timestamptz DEFAULT now(),
  is_completed boolean DEFAULT false,
  
  -- Photo requirements
  required_photos text[] DEFAULT '{}', -- Array of photo URLs required for this checklist
  photos_uploaded text[] DEFAULT '{}', -- Array of photo URLs actually uploaded
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_checklists_job ON public.safety_checklists(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_safety_checklists_crew ON public.safety_checklists(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_safety_checklists_workspace ON public.safety_checklists(workspace_id);
CREATE INDEX IF NOT EXISTS idx_safety_checklists_type ON public.safety_checklists(checklist_type);
CREATE INDEX IF NOT EXISTS idx_safety_checklists_completed ON public.safety_checklists(is_completed, completed_at DESC);

COMMENT ON TABLE public.safety_checklists IS 'Mandatory safety checklists - Pre-Job, Mid-Job, End-of-Day (Block 255800)';
COMMENT ON COLUMN public.safety_checklists.checklist_type IS 'Type: pre_job, mid_job, end_of_day';

-- 1.3 incidents (Injury, Near-Miss, Equipment Failure)
CREATE TABLE IF NOT EXISTS public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid, -- References jobs(id) or roofing_jobs(id) - flexible
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  type text NOT NULL CHECK (type IN ('injury', 'near_miss', 'equipment_failure', 'safety_violation', 'property_damage')),
  description text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'moderate', 'serious', 'fatal')) DEFAULT 'low',
  
  -- Media evidence
  photos text[] DEFAULT '{}', -- Array of photo URLs
  videos text[] DEFAULT '{}', -- Array of video URLs
  
  -- Injury details (if type = 'injury')
  injury_type text, -- cut, fall, burn, etc.
  body_part_affected text,
  medical_treatment_required boolean DEFAULT false,
  hospital_visit boolean DEFAULT false,
  
  -- Reporting
  reported_by uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  reported_at timestamptz DEFAULT now(),
  
  -- OSHA tracking
  osha_recordable boolean DEFAULT false,
  osha_forms_generated boolean DEFAULT false,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incidents_job ON public.incidents(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_incidents_crew ON public.incidents(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_incidents_crew_member ON public.incidents(crew_member_id) WHERE crew_member_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_incidents_workspace ON public.incidents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_incidents_type ON public.incidents(type);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON public.incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_reported_at ON public.incidents(reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_osha_recordable ON public.incidents(osha_recordable) WHERE osha_recordable = true;

COMMENT ON TABLE public.incidents IS 'Safety incidents - injuries, near-misses, equipment failures (Block 255800)';
COMMENT ON COLUMN public.incidents.type IS 'Type: injury, near_miss, equipment_failure, safety_violation, property_damage';
COMMENT ON COLUMN public.incidents.severity IS 'Severity: low, moderate, serious, fatal';

-- 1.4 ppe_inventory (PPE Tracking & Expiration Warnings)
CREATE TABLE IF NOT EXISTS public.ppe_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_member_id uuid NOT NULL REFERENCES public.crew_members(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  item text NOT NULL, -- harness, lanyard, hardhat, safety_glasses, gloves, high_visibility_vest
  brand text,
  model text,
  serial_number text,
  
  expiration_date date,
  purchase_date date,
  last_inspection_date date,
  
  status text NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'expired', 'lost', 'damaged', 'replaced')),
  
  -- Photo of PPE item
  photo_url text,
  
  -- Alert tracking
  expiration_warning_sent boolean DEFAULT false,
  expiration_warning_sent_at timestamptz,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ppe_inventory_crew_member ON public.ppe_inventory(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_ppe_inventory_workspace ON public.ppe_inventory(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ppe_inventory_item ON public.ppe_inventory(item);
CREATE INDEX IF NOT EXISTS idx_ppe_inventory_status ON public.ppe_inventory(status);
CREATE INDEX IF NOT EXISTS idx_ppe_inventory_expiration ON public.ppe_inventory(expiration_date) WHERE expiration_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ppe_inventory_expiring_soon ON public.ppe_inventory(expiration_date) 
  WHERE expiration_date IS NOT NULL AND expiration_date <= CURRENT_DATE + INTERVAL '30 days';

COMMENT ON TABLE public.ppe_inventory IS 'PPE inventory tracking with expiration warnings (Block 255800)';
COMMENT ON COLUMN public.ppe_inventory.item IS 'Item: harness, lanyard, hardhat, safety_glasses, gloves, high_visibility_vest';
COMMENT ON COLUMN public.ppe_inventory.status IS 'Status: valid, expired, lost, damaged, replaced';

-- 1.5 osha_log_entries (OSHA 300, 300A, 301 Forms)
CREATE TABLE IF NOT EXISTS public.osha_log_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid REFERENCES public.incidents(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  form_type text NOT NULL CHECK (form_type IN ('300', '300A', '301')),
  year integer NOT NULL, -- Year this log entry applies to
  
  data jsonb NOT NULL, -- Complete form data
  
  -- Form 300 fields (example):
  -- {
  --   "case_number": "2025-001",
  --   "employee_name": "John Doe",
  --   "job_title": "Roofer",
  --   "date_of_injury": "2025-01-15",
  --   "where_event_occurred": "Job Site",
  --   "description": "Fell from ladder",
  --   "injury_type": "Fracture",
  --   "body_part": "Left arm",
  --   "days_away_from_work": 5,
  --   "days_on_restricted_work": 0,
  --   "other_recordable": false
  -- }
  
  -- Form 300A fields (summary):
  -- {
  --   "total_deaths": 0,
  --   "total_cases_with_days_away": 2,
  --   "total_cases_with_job_transfer": 1,
  --   "total_other_recordable_cases": 0,
  --   "total_days_away_from_work": 10,
  --   "total_days_on_restricted_work": 5
  -- }
  
  -- Form 301 fields (incident report):
  -- {
  --   "employee_name": "John Doe",
  --   "date_of_birth": "1990-01-01",
  --   "date_hired": "2024-01-01",
  --   "address": "123 Main St",
  --   "phone": "555-1234",
  --   "supervisor_name": "Mike Smith",
  --   "date_of_injury": "2025-01-15",
  --   "time_of_injury": "10:30 AM",
  --   "where_occurred": "Job Site - 456 Oak St",
  --   "what_employee_was_doing": "Installing shingles on roof",
  --   "what_happened": "Lost balance and fell from ladder",
  --   "injury_description": "Fractured left arm",
  --   "object_substance": "Ladder",
  --   "treatment_provided": "Emergency room visit, cast applied"
  -- }
  
  generated_at timestamptz DEFAULT now(),
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_osha_log_entries_incident ON public.osha_log_entries(incident_id) WHERE incident_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_osha_log_entries_workspace ON public.osha_log_entries(workspace_id);
CREATE INDEX IF NOT EXISTS idx_osha_log_entries_form_type ON public.osha_log_entries(form_type);
CREATE INDEX IF NOT EXISTS idx_osha_log_entries_year ON public.osha_log_entries(year DESC);
CREATE INDEX IF NOT EXISTS idx_osha_log_entries_workspace_year ON public.osha_log_entries(workspace_id, year DESC);

COMMENT ON TABLE public.osha_log_entries IS 'OSHA log entries - Forms 300, 300A, 301 (Block 255800)';
COMMENT ON COLUMN public.osha_log_entries.form_type IS 'Form type: 300 (Log of Work-Related Injuries), 300A (Summary), 301 (Incident Report)';

-- 1.6 safety_violations (Violation Detection & Alerts)
CREATE TABLE IF NOT EXISTS public.safety_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid, -- References jobs(id) or roofing_jobs(id) - flexible
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  violation_type text NOT NULL, -- no_harness, ladder_angle_incorrect, high_wind, missing_ppe, etc.
  severity text NOT NULL CHECK (severity IN ('warning', 'critical', 'shutdown')) DEFAULT 'warning',
  
  description text NOT NULL,
  detected_at timestamptz DEFAULT now(),
  
  -- Detection method
  detection_method text, -- photo_ai, gps, manual, weather_api
  
  -- Evidence
  photo_url text,
  gps_coordinates point, -- PostGIS point for location
  weather_data jsonb, -- Wind speed, temperature, etc.
  
  -- Alert status
  alert_sent boolean DEFAULT false,
  alert_sent_to uuid[], -- Array of user IDs notified
  alert_sent_at timestamptz,
  
  -- Resolution
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_violations_job ON public.safety_violations(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_safety_violations_crew ON public.safety_violations(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_safety_violations_workspace ON public.safety_violations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_safety_violations_type ON public.safety_violations(violation_type);
CREATE INDEX IF NOT EXISTS idx_safety_violations_severity ON public.safety_violations(severity);
CREATE INDEX IF NOT EXISTS idx_safety_violations_resolved ON public.safety_violations(resolved) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_safety_violations_detected_at ON public.safety_violations(detected_at DESC);

COMMENT ON TABLE public.safety_violations IS 'Safety violations detected via AI, GPS, photos (Block 255800)';
COMMENT ON COLUMN public.safety_violations.violation_type IS 'Type: no_harness, ladder_angle_incorrect, high_wind, missing_ppe, unsafe_conditions, etc.';

-- 1.7 safety_photos (Mandatory Safety Photo Requirements)
CREATE TABLE IF NOT EXISTS public.safety_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid, -- References jobs(id) or roofing_jobs(id) - flexible
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  photo_type text NOT NULL, -- ladder_setup, harness_inspection, anchor_installation, perimeter_hazard_check, cleanup_proof, ppe_group_shot
  photo_url text NOT NULL,
  
  -- Metadata
  taken_by uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  taken_at timestamptz DEFAULT now(),
  gps_coordinates point, -- PostGIS point for location
  
  -- Verification
  verified boolean DEFAULT false,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  
  -- Workflow blocking
  required_for_workflow_step text, -- Which workflow step requires this photo
  workflow_step_unlocked boolean DEFAULT false, -- Whether this photo unlocked the next step
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_photos_job ON public.safety_photos(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_safety_photos_crew ON public.safety_photos(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_safety_photos_workspace ON public.safety_photos(workspace_id);
CREATE INDEX IF NOT EXISTS idx_safety_photos_type ON public.safety_photos(photo_type);
CREATE INDEX IF NOT EXISTS idx_safety_photos_workflow_step ON public.safety_photos(required_for_workflow_step) WHERE required_for_workflow_step IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_safety_photos_taken_at ON public.safety_photos(taken_at DESC);

COMMENT ON TABLE public.safety_photos IS 'Mandatory safety photos required before workflow progression (Block 255800)';
COMMENT ON COLUMN public.safety_photos.photo_type IS 'Type: ladder_setup, harness_inspection, anchor_installation, perimeter_hazard_check, cleanup_proof, ppe_group_shot';

-- 1.8 crew_safety_scores (Crew Safety Score Tracking)
CREATE TABLE IF NOT EXISTS public.crew_safety_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  score integer NOT NULL CHECK (score >= 0 AND score <= 100),
  score_date date NOT NULL DEFAULT CURRENT_DATE,
  
  -- Score components (for transparency)
  violations_count integer DEFAULT 0,
  toolbox_talks_completed integer DEFAULT 0,
  toolbox_talks_required integer DEFAULT 0,
  incidents_count integer DEFAULT 0,
  checklist_accuracy numeric(5,2) DEFAULT 0, -- Percentage
  ppe_compliance numeric(5,2) DEFAULT 0, -- Percentage
  photo_evidence_count integer DEFAULT 0,
  
  -- Score breakdown (stored as JSONB for flexibility)
  score_breakdown jsonb DEFAULT '{}'::jsonb,
  -- Example:
  -- {
  --   "violations_penalty": -10,
  --   "toolbox_talks_bonus": 5,
  --   "incidents_penalty": -20,
  --   "checklist_bonus": 10,
  --   "ppe_bonus": 5,
  --   "photo_evidence_bonus": 5
  -- }
  
  -- Status
  status text NOT NULL CHECK (status IN ('excellent', 'good', 'needs_improvement', 'high_risk')) DEFAULT 'good',
  
  -- Training recommendations
  training_recommendations text[] DEFAULT '{}',
  
  calculated_at timestamptz DEFAULT now(),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(crew_id, score_date)
);

CREATE INDEX IF NOT EXISTS idx_crew_safety_scores_crew ON public.crew_safety_scores(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_safety_scores_workspace ON public.crew_safety_scores(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crew_safety_scores_date ON public.crew_safety_scores(score_date DESC);
CREATE INDEX IF NOT EXISTS idx_crew_safety_scores_status ON public.crew_safety_scores(status);
CREATE INDEX IF NOT EXISTS idx_crew_safety_scores_crew_date ON public.crew_safety_scores(crew_id, score_date DESC);

COMMENT ON TABLE public.crew_safety_scores IS 'Crew safety scores (0-100) based on violations, incidents, compliance (Block 255800)';
COMMENT ON COLUMN public.crew_safety_scores.status IS 'Status: excellent (90-100), good (80-89), needs_improvement (70-79), high_risk (0-69)';

-- ============================================================================
-- PART 2 — UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_safety_compliance_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_safety_meetings_updated_at
  BEFORE UPDATE ON public.safety_meetings
  FOR EACH ROW EXECUTE FUNCTION public.set_safety_compliance_updated_at();

CREATE TRIGGER trg_safety_checklists_updated_at
  BEFORE UPDATE ON public.safety_checklists
  FOR EACH ROW EXECUTE FUNCTION public.set_safety_compliance_updated_at();

CREATE TRIGGER trg_incidents_updated_at
  BEFORE UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.set_safety_compliance_updated_at();

CREATE TRIGGER trg_ppe_inventory_updated_at
  BEFORE UPDATE ON public.ppe_inventory
  FOR EACH ROW EXECUTE FUNCTION public.set_safety_compliance_updated_at();

CREATE TRIGGER trg_osha_log_entries_updated_at
  BEFORE UPDATE ON public.osha_log_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_safety_compliance_updated_at();

CREATE TRIGGER trg_safety_violations_updated_at
  BEFORE UPDATE ON public.safety_violations
  FOR EACH ROW EXECUTE FUNCTION public.set_safety_compliance_updated_at();

CREATE TRIGGER trg_safety_photos_updated_at
  BEFORE UPDATE ON public.safety_photos
  FOR EACH ROW EXECUTE FUNCTION public.set_safety_compliance_updated_at();

CREATE TRIGGER trg_crew_safety_scores_updated_at
  BEFORE UPDATE ON public.crew_safety_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_safety_compliance_updated_at();

-- ============================================================================
-- PART 3 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.safety_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ppe_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.osha_log_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_safety_scores ENABLE ROW LEVEL SECURITY;

-- Helper function to check workspace access
CREATE OR REPLACE FUNCTION public.can_access_workspace_safety(_workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = _workspace_id
    AND wm.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.workspaces w
    WHERE w.id = _workspace_id
    AND w.owner_id = auth.uid()
  );
$$;

-- RLS Policies for safety_meetings
CREATE POLICY "safety_meetings_workspace_access"
  ON public.safety_meetings
  FOR ALL
  USING (can_access_workspace_safety(workspace_id))
  WITH CHECK (can_access_workspace_safety(workspace_id));

-- RLS Policies for safety_checklists
CREATE POLICY "safety_checklists_workspace_access"
  ON public.safety_checklists
  FOR ALL
  USING (can_access_workspace_safety(workspace_id))
  WITH CHECK (can_access_workspace_safety(workspace_id));

-- RLS Policies for incidents
CREATE POLICY "incidents_workspace_access"
  ON public.incidents
  FOR ALL
  USING (can_access_workspace_safety(workspace_id))
  WITH CHECK (can_access_workspace_safety(workspace_id));

-- RLS Policies for ppe_inventory
CREATE POLICY "ppe_inventory_workspace_access"
  ON public.ppe_inventory
  FOR ALL
  USING (can_access_workspace_safety(workspace_id))
  WITH CHECK (can_access_workspace_safety(workspace_id));

-- RLS Policies for osha_log_entries
CREATE POLICY "osha_log_entries_workspace_access"
  ON public.osha_log_entries
  FOR ALL
  USING (can_access_workspace_safety(workspace_id))
  WITH CHECK (can_access_workspace_safety(workspace_id));

-- RLS Policies for safety_violations
CREATE POLICY "safety_violations_workspace_access"
  ON public.safety_violations
  FOR ALL
  USING (can_access_workspace_safety(workspace_id))
  WITH CHECK (can_access_workspace_safety(workspace_id));

-- RLS Policies for safety_photos
CREATE POLICY "safety_photos_workspace_access"
  ON public.safety_photos
  FOR ALL
  USING (can_access_workspace_safety(workspace_id))
  WITH CHECK (can_access_workspace_safety(workspace_id));

-- RLS Policies for crew_safety_scores
CREATE POLICY "crew_safety_scores_workspace_access"
  ON public.crew_safety_scores
  FOR ALL
  USING (can_access_workspace_safety(workspace_id))
  WITH CHECK (can_access_workspace_safety(workspace_id));

-- ============================================================================
-- PART 4 — HELPER FUNCTIONS
-- ============================================================================

-- Function: Check if toolbox talk is required before job start
CREATE OR REPLACE FUNCTION public.is_toolbox_talk_required(_job_id uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.safety_meetings sm
    WHERE sm.job_id = _job_id
    AND sm.required_before_job_start = true
    AND sm.is_completed = false
  );
$$;

COMMENT ON FUNCTION public.is_toolbox_talk_required IS 'Check if toolbox talk is required and not completed for a job (Block 255800)';

-- Function: Check if safety checklist is required
CREATE OR REPLACE FUNCTION public.is_safety_checklist_required(_job_id uuid, _checklist_type text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.safety_checklists sc
    WHERE sc.job_id = _job_id
    AND sc.checklist_type = _checklist_type
    AND sc.is_completed = true
    AND sc.completed_at::date = CURRENT_DATE
  );
$$;

COMMENT ON FUNCTION public.is_safety_checklist_required IS 'Check if safety checklist is required for a job (Block 255800)';

-- Function: Check if required safety photos are uploaded
CREATE OR REPLACE FUNCTION public.are_safety_photos_required(_job_id uuid, _photo_types text[])
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM unnest(_photo_types) AS required_type
    WHERE NOT EXISTS (
      SELECT 1 FROM public.safety_photos sp
      WHERE sp.job_id = _job_id
      AND sp.photo_type = required_type
      AND sp.taken_at::date = CURRENT_DATE
    )
  );
$$;

COMMENT ON FUNCTION public.are_safety_photos_required IS 'Check if required safety photos are missing for a job (Block 255800)';

-- Function: Get expiring PPE items
CREATE OR REPLACE FUNCTION public.get_expiring_ppe(_workspace_id uuid, _days_ahead integer DEFAULT 30)
RETURNS TABLE (
  id uuid,
  crew_member_id uuid,
  crew_member_name text,
  item text,
  expiration_date date,
  days_until_expiration integer
) LANGUAGE sql STABLE AS $$
  SELECT 
    ppe.id,
    ppe.crew_member_id,
    cm.name AS crew_member_name,
    ppe.item,
    ppe.expiration_date,
    (ppe.expiration_date - CURRENT_DATE)::integer AS days_until_expiration
  FROM public.ppe_inventory ppe
  JOIN public.crew_members cm ON cm.id = ppe.crew_member_id
  WHERE ppe.workspace_id = _workspace_id
  AND ppe.status = 'valid'
  AND ppe.expiration_date IS NOT NULL
  AND ppe.expiration_date <= CURRENT_DATE + (_days_ahead || ' days')::interval
  AND ppe.expiration_date > CURRENT_DATE
  ORDER BY ppe.expiration_date ASC;
$$;

COMMENT ON FUNCTION public.get_expiring_ppe IS 'Get PPE items expiring within specified days (Block 255800)';

-- Function: Get expired PPE items
CREATE OR REPLACE FUNCTION public.get_expired_ppe(_workspace_id uuid)
RETURNS TABLE (
  id uuid,
  crew_member_id uuid,
  crew_member_name text,
  item text,
  expiration_date date,
  days_expired integer
) LANGUAGE sql STABLE AS $$
  SELECT 
    ppe.id,
    ppe.crew_member_id,
    cm.name AS crew_member_name,
    ppe.item,
    ppe.expiration_date,
    (CURRENT_DATE - ppe.expiration_date)::integer AS days_expired
  FROM public.ppe_inventory ppe
  JOIN public.crew_members cm ON cm.id = ppe.crew_member_id
  WHERE ppe.workspace_id = _workspace_id
  AND ppe.status = 'valid'
  AND ppe.expiration_date IS NOT NULL
  AND ppe.expiration_date < CURRENT_DATE
  ORDER BY ppe.expiration_date ASC;
$$;

COMMENT ON FUNCTION public.get_expired_ppe IS 'Get expired PPE items (Block 255800)';

-- ============================================================================
-- PART 5 — CREW SAFETY SCORE CALCULATION
-- ============================================================================

-- Function: Calculate crew safety score (0-100)
CREATE OR REPLACE FUNCTION public.calculate_crew_safety_score(
  _crew_id uuid,
  _start_date date DEFAULT CURRENT_DATE - INTERVAL '30 days',
  _end_date date DEFAULT CURRENT_DATE
)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_score integer := 100;
  v_violations_count integer;
  v_toolbox_talks_completed integer;
  v_toolbox_talks_required integer;
  v_incidents_count integer;
  v_checklist_accuracy numeric;
  v_ppe_compliance numeric;
  v_photo_evidence_count integer;
  v_score_breakdown jsonb := '{}'::jsonb;
BEGIN
  -- Start with base score of 100
  
  -- 1. Violations penalty (-5 per violation)
  SELECT COUNT(*) INTO v_violations_count
  FROM public.safety_violations
  WHERE crew_id = _crew_id
  AND detected_at::date BETWEEN _start_date AND _end_date;
  
  v_score := v_score - (v_violations_count * 5);
  v_score_breakdown := v_score_breakdown || jsonb_build_object('violations_penalty', -(v_violations_count * 5));
  
  -- 2. Toolbox talks bonus/penalty
  SELECT 
    COUNT(*) FILTER (WHERE is_completed = true),
    COUNT(*)
  INTO v_toolbox_talks_completed, v_toolbox_talks_required
  FROM public.safety_meetings
  WHERE crew_id = _crew_id
  AND completed_at::date BETWEEN _start_date AND _end_date;
  
  IF v_toolbox_talks_required > 0 THEN
    IF v_toolbox_talks_completed = v_toolbox_talks_required THEN
      v_score := v_score + 5; -- Bonus for 100% completion
      v_score_breakdown := v_score_breakdown || jsonb_build_object('toolbox_talks_bonus', 5);
    ELSIF v_toolbox_talks_completed < v_toolbox_talks_required THEN
      v_score := v_score - ((v_toolbox_talks_required - v_toolbox_talks_completed) * 3); -- Penalty for missing talks
      v_score_breakdown := v_score_breakdown || jsonb_build_object('toolbox_talks_penalty', -((v_toolbox_talks_required - v_toolbox_talks_completed) * 3));
    END IF;
  END IF;
  
  -- 3. Incidents penalty (-20 per incident)
  SELECT COUNT(*) INTO v_incidents_count
  FROM public.incidents
  WHERE crew_id = _crew_id
  AND reported_at::date BETWEEN _start_date AND _end_date;
  
  v_score := v_score - (v_incidents_count * 20);
  v_score_breakdown := v_score_breakdown || jsonb_build_object('incidents_penalty', -(v_incidents_count * 20));
  
  -- 4. Checklist accuracy bonus/penalty
  SELECT 
    COALESCE(
      AVG(
        CASE 
          WHEN is_completed = true THEN 100
          ELSE 0
        END
      ),
      0
    )::numeric(5,2)
  INTO v_checklist_accuracy
  FROM public.safety_checklists
  WHERE crew_id = _crew_id
  AND completed_at::date BETWEEN _start_date AND _end_date;
  
  IF v_checklist_accuracy >= 90 THEN
    v_score := v_score + 10; -- Bonus for high checklist accuracy
    v_score_breakdown := v_score_breakdown || jsonb_build_object('checklist_bonus', 10);
  ELSIF v_checklist_accuracy < 70 THEN
    v_score := v_score - 10; -- Penalty for low checklist accuracy
    v_score_breakdown := v_score_breakdown || jsonb_build_object('checklist_penalty', -10);
  END IF;
  
  -- 5. PPE compliance bonus
  -- Check if all crew members have valid, non-expired PPE
  SELECT 
    COUNT(DISTINCT cm.id) FILTER (WHERE ppe.status = 'valid' AND (ppe.expiration_date IS NULL OR ppe.expiration_date > CURRENT_DATE)),
    COUNT(DISTINCT cm.id)
  INTO v_ppe_compliance, v_ppe_compliance
  FROM public.crew_members cm
  LEFT JOIN public.ppe_inventory ppe ON ppe.crew_member_id = cm.id
  WHERE cm.crew_id = _crew_id
  AND cm.is_active = true;
  
  -- This is simplified - in reality, you'd check for all required PPE items per crew member
  IF v_ppe_compliance > 0 THEN
    v_score := v_score + 5; -- Bonus for PPE compliance
    v_score_breakdown := v_score_breakdown || jsonb_build_object('ppe_bonus', 5);
  END IF;
  
  -- 6. Photo evidence bonus (+2 per required photo type uploaded)
  SELECT COUNT(DISTINCT photo_type) INTO v_photo_evidence_count
  FROM public.safety_photos
  WHERE crew_id = _crew_id
  AND taken_at::date BETWEEN _start_date AND _end_date;
  
  IF v_photo_evidence_count >= 6 THEN
    v_score := v_score + 5; -- Bonus for complete photo evidence
    v_score_breakdown := v_score_breakdown || jsonb_build_object('photo_evidence_bonus', 5);
  END IF;
  
  -- Ensure score is between 0 and 100
  v_score := GREATEST(0, LEAST(100, v_score));
  
  RETURN v_score;
END;
$$;

COMMENT ON FUNCTION public.calculate_crew_safety_score IS 'Calculate crew safety score (0-100) based on violations, incidents, compliance (Block 255800)';

-- Function: Update or insert crew safety score
CREATE OR REPLACE FUNCTION public.update_crew_safety_score(_crew_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_score integer;
  v_status text;
  v_workspace_id uuid;
  v_violations_count integer;
  v_toolbox_talks_completed integer;
  v_toolbox_talks_required integer;
  v_incidents_count integer;
  v_checklist_accuracy numeric;
  v_ppe_compliance numeric;
  v_photo_evidence_count integer;
BEGIN
  -- Get workspace_id from crew
  SELECT workspace_id INTO v_workspace_id
  FROM public.crews
  WHERE id = _crew_id;
  
  -- Calculate score
  v_score := public.calculate_crew_safety_score(_crew_id);
  
  -- Determine status
  IF v_score >= 90 THEN
    v_status := 'excellent';
  ELSIF v_score >= 80 THEN
    v_status := 'good';
  ELSIF v_score >= 70 THEN
    v_status := 'needs_improvement';
  ELSE
    v_status := 'high_risk';
  END IF;
  
  -- Get component counts for storage
  SELECT COUNT(*) INTO v_violations_count
  FROM public.safety_violations
  WHERE crew_id = _crew_id
  AND detected_at::date >= CURRENT_DATE - INTERVAL '30 days';
  
  SELECT 
    COUNT(*) FILTER (WHERE is_completed = true),
    COUNT(*)
  INTO v_toolbox_talks_completed, v_toolbox_talks_required
  FROM public.safety_meetings
  WHERE crew_id = _crew_id
  AND completed_at::date >= CURRENT_DATE - INTERVAL '30 days';
  
  SELECT COUNT(*) INTO v_incidents_count
  FROM public.incidents
  WHERE crew_id = _crew_id
  AND reported_at::date >= CURRENT_DATE - INTERVAL '30 days';
  
  SELECT 
    COALESCE(
      AVG(
        CASE 
          WHEN is_completed = true THEN 100
          ELSE 0
        END
      ),
      0
    )::numeric(5,2)
  INTO v_checklist_accuracy
  FROM public.safety_checklists
  WHERE crew_id = _crew_id
  AND completed_at::date >= CURRENT_DATE - INTERVAL '30 days';
  
  -- Simplified PPE compliance (would need more complex logic in production)
  v_ppe_compliance := 100.0; -- Placeholder
  
  SELECT COUNT(DISTINCT photo_type) INTO v_photo_evidence_count
  FROM public.safety_photos
  WHERE crew_id = _crew_id
  AND taken_at::date >= CURRENT_DATE - INTERVAL '30 days';
  
  -- Insert or update crew safety score
  INSERT INTO public.crew_safety_scores (
    crew_id,
    workspace_id,
    score,
    score_date,
    violations_count,
    toolbox_talks_completed,
    toolbox_talks_required,
    incidents_count,
    checklist_accuracy,
    ppe_compliance,
    photo_evidence_count,
    status,
    calculated_at
  )
  VALUES (
    _crew_id,
    v_workspace_id,
    v_score,
    CURRENT_DATE,
    v_violations_count,
    v_toolbox_talks_completed,
    v_toolbox_talks_required,
    v_incidents_count,
    v_checklist_accuracy,
    v_ppe_compliance,
    v_photo_evidence_count,
    v_status,
    now()
  )
  ON CONFLICT (crew_id, score_date)
  DO UPDATE SET
    score = EXCLUDED.score,
    violations_count = EXCLUDED.violations_count,
    toolbox_talks_completed = EXCLUDED.toolbox_talks_completed,
    toolbox_talks_required = EXCLUDED.toolbox_talks_required,
    incidents_count = EXCLUDED.incidents_count,
    checklist_accuracy = EXCLUDED.checklist_accuracy,
    ppe_compliance = EXCLUDED.ppe_compliance,
    photo_evidence_count = EXCLUDED.photo_evidence_count,
    status = EXCLUDED.status,
    calculated_at = EXCLUDED.calculated_at,
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.update_crew_safety_score IS 'Update or insert crew safety score for today (Block 255800)';

-- ============================================================================
-- PART 6 — OSHA LOG GENERATION
-- ============================================================================

-- Function: Generate OSHA 301 form from incident
CREATE OR REPLACE FUNCTION public.generate_osha_301(_incident_id uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_incident_record public.incidents%ROWTYPE;
  v_crew_member_record public.crew_members%ROWTYPE;
  v_workspace_id uuid;
  v_osha_log_entry_id uuid;
  v_form_data jsonb;
BEGIN
  -- Get incident record
  SELECT * INTO v_incident_record
  FROM public.incidents
  WHERE id = _incident_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident not found: %', _incident_id;
  END IF;
  
  -- Get crew member record if available
  IF v_incident_record.crew_member_id IS NOT NULL THEN
    SELECT * INTO v_crew_member_record
    FROM public.crew_members
    WHERE id = v_incident_record.crew_member_id;
  END IF;
  
  -- Get workspace_id
  v_workspace_id := v_incident_record.workspace_id;
  
  -- Build OSHA 301 form data
  v_form_data := jsonb_build_object(
    'employee_name', COALESCE(v_crew_member_record.name, 'Unknown'),
    'date_of_injury', v_incident_record.reported_at::date,
    'time_of_injury', v_incident_record.reported_at::time,
    'where_occurred', 'Job Site',
    'what_employee_was_doing', 'Working on roofing job',
    'what_happened', v_incident_record.description,
    'injury_description', v_incident_record.description,
    'injury_type', v_incident_record.injury_type,
    'body_part_affected', v_incident_record.body_part_affected,
    'treatment_provided', CASE 
      WHEN v_incident_record.hospital_visit THEN 'Hospital visit required'
      WHEN v_incident_record.medical_treatment_required THEN 'Medical treatment provided'
      ELSE 'First aid only'
    END,
    'severity', v_incident_record.severity,
    'photos', v_incident_record.photos,
    'videos', v_incident_record.videos
  );
  
  -- Create OSHA log entry
  INSERT INTO public.osha_log_entries (
    incident_id,
    workspace_id,
    form_type,
    year,
    data,
    generated_at,
    generated_by
  )
  VALUES (
    _incident_id,
    v_workspace_id,
    '301',
    EXTRACT(YEAR FROM v_incident_record.reported_at),
    v_form_data,
    now(),
    auth.uid()
  )
  RETURNING id INTO v_osha_log_entry_id;
  
  -- Mark incident as having OSHA forms generated
  UPDATE public.incidents
  SET osha_forms_generated = true,
      osha_recordable = true
  WHERE id = _incident_id;
  
  RETURN v_osha_log_entry_id;
END;
$$;

COMMENT ON FUNCTION public.generate_osha_301 IS 'Generate OSHA 301 form from incident (Block 255800)';

-- Function: Generate OSHA 300 log entry from incident
CREATE OR REPLACE FUNCTION public.generate_osha_300(_incident_id uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_incident_record public.incidents%ROWTYPE;
  v_crew_member_record public.crew_members%ROWTYPE;
  v_workspace_id uuid;
  v_osha_log_entry_id uuid;
  v_form_data jsonb;
  v_case_number text;
BEGIN
  -- Get incident record
  SELECT * INTO v_incident_record
  FROM public.incidents
  WHERE id = _incident_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incident not found: %', _incident_id;
  END IF;
  
  -- Get crew member record if available
  IF v_incident_record.crew_member_id IS NOT NULL THEN
    SELECT * INTO v_crew_member_record
    FROM public.crew_members
    WHERE id = v_incident_record.crew_member_id;
  END IF;
  
  -- Get workspace_id
  v_workspace_id := v_incident_record.workspace_id;
  
  -- Generate case number (format: YYYY-###)
  SELECT 
    COALESCE(
      MAX(
        (data->>'case_number')::text
      ),
      '0'
    )
  INTO v_case_number
  FROM public.osha_log_entries
  WHERE workspace_id = v_workspace_id
  AND form_type = '300'
  AND year = EXTRACT(YEAR FROM v_incident_record.reported_at);
  
  -- Increment case number
  v_case_number := EXTRACT(YEAR FROM v_incident_record.reported_at)::text || '-' || 
    LPAD((COALESCE(SPLIT_PART(v_case_number, '-', 2)::integer, 0) + 1)::text, 3, '0');
  
  -- Build OSHA 300 form data
  v_form_data := jsonb_build_object(
    'case_number', v_case_number,
    'employee_name', COALESCE(v_crew_member_record.name, 'Unknown'),
    'job_title', COALESCE(v_crew_member_record.role, 'Roofer'),
    'date_of_injury', v_incident_record.reported_at::date,
    'where_event_occurred', 'Job Site',
    'description', v_incident_record.description,
    'injury_type', v_incident_record.injury_type,
    'body_part', v_incident_record.body_part_affected,
    'days_away_from_work', 0, -- Would need to track this separately
    'days_on_restricted_work', 0, -- Would need to track this separately
    'other_recordable', false,
    'severity', v_incident_record.severity
  );
  
  -- Create OSHA log entry
  INSERT INTO public.osha_log_entries (
    incident_id,
    workspace_id,
    form_type,
    year,
    data,
    generated_at,
    generated_by
  )
  VALUES (
    _incident_id,
    v_workspace_id,
    '300',
    EXTRACT(YEAR FROM v_incident_record.reported_at),
    v_form_data,
    now(),
    auth.uid()
  )
  RETURNING id INTO v_osha_log_entry_id;
  
  RETURN v_osha_log_entry_id;
END;
$$;

COMMENT ON FUNCTION public.generate_osha_300 IS 'Generate OSHA 300 log entry from incident (Block 255800)';

-- Function: Generate OSHA 300A summary for a year
CREATE OR REPLACE FUNCTION public.generate_osha_300a(_workspace_id uuid, _year integer)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_osha_log_entry_id uuid;
  v_form_data jsonb;
  v_total_deaths integer;
  v_total_cases_with_days_away integer;
  v_total_cases_with_job_transfer integer;
  v_total_other_recordable_cases integer;
  v_total_days_away_from_work integer;
  v_total_days_on_restricted_work integer;
BEGIN
  -- Calculate summary statistics from incidents
  SELECT 
    COUNT(*) FILTER (WHERE severity = 'fatal'),
    COUNT(*) FILTER (WHERE type = 'injury' AND severity IN ('serious', 'fatal')),
    COUNT(*) FILTER (WHERE type = 'injury' AND severity = 'moderate'),
    COUNT(*) FILTER (WHERE type = 'near_miss' AND osha_recordable = true),
    0, -- Would need to track days away separately
    0  -- Would need to track restricted work days separately
  INTO 
    v_total_deaths,
    v_total_cases_with_days_away,
    v_total_cases_with_job_transfer,
    v_total_other_recordable_cases,
    v_total_days_away_from_work,
    v_total_days_on_restricted_work
  FROM public.incidents
  WHERE workspace_id = _workspace_id
  AND EXTRACT(YEAR FROM reported_at) = _year
  AND osha_recordable = true;
  
  -- Build OSHA 300A form data
  v_form_data := jsonb_build_object(
    'total_deaths', v_total_deaths,
    'total_cases_with_days_away', v_total_cases_with_days_away,
    'total_cases_with_job_transfer', v_total_cases_with_job_transfer,
    'total_other_recordable_cases', v_total_other_recordable_cases,
    'total_days_away_from_work', v_total_days_away_from_work,
    'total_days_on_restricted_work', v_total_days_on_restricted_work,
    'year', _year
  );
  
  -- Create OSHA log entry
  INSERT INTO public.osha_log_entries (
    workspace_id,
    form_type,
    year,
    data,
    generated_at,
    generated_by
  )
  VALUES (
    _workspace_id,
    '300A',
    _year,
    v_form_data,
    now(),
    auth.uid()
  )
  RETURNING id INTO v_osha_log_entry_id;
  
  RETURN v_osha_log_entry_id;
END;
$$;

COMMENT ON FUNCTION public.generate_osha_300a IS 'Generate OSHA 300A summary for a year (Block 255800)';

-- Trigger: Auto-generate OSHA forms when incident is marked as recordable
CREATE OR REPLACE FUNCTION public.auto_generate_osha_forms()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- If incident is marked as OSHA recordable and forms haven't been generated yet
  IF NEW.osha_recordable = true AND NEW.osha_forms_generated = false THEN
    -- Generate OSHA 301 (Incident Report)
    PERFORM public.generate_osha_301(NEW.id);
    
    -- Generate OSHA 300 (Log Entry)
    PERFORM public.generate_osha_300(NEW.id);
    
    -- Mark as generated
    NEW.osha_forms_generated := true;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_generate_osha_forms
  AFTER INSERT OR UPDATE ON public.incidents
  FOR EACH ROW
  WHEN (NEW.osha_recordable = true AND NEW.osha_forms_generated = false)
  EXECUTE FUNCTION public.auto_generate_osha_forms();

-- ============================================================================
-- PART 7 — SAFETY VIOLATION ALERTS
-- ============================================================================

-- Function: Create safety violation alert
CREATE OR REPLACE FUNCTION public.create_safety_violation_alert(
  _job_id uuid,
  _crew_id uuid,
  _violation_type text,
  _severity text,
  _description text,
  _photo_url text DEFAULT NULL,
  _weather_data jsonb DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_violation_id uuid;
  v_workspace_id uuid;
BEGIN
  -- Get workspace_id from job or crew
  SELECT workspace_id INTO v_workspace_id
  FROM public.crews
  WHERE id = _crew_id;
  
  IF v_workspace_id IS NULL THEN
    -- Try to get from job (would need to check both jobs and roofing_jobs tables)
    -- This is simplified - in production, you'd handle both table types
    SELECT workspace_id INTO v_workspace_id
    FROM public.jobs
    WHERE id = _job_id;
  END IF;
  
  -- Create violation record
  INSERT INTO public.safety_violations (
    job_id,
    crew_id,
    workspace_id,
    violation_type,
    severity,
    description,
    photo_url,
    weather_data,
    detected_at
  )
  VALUES (
    _job_id,
    _crew_id,
    v_workspace_id,
    _violation_type,
    _severity,
    _description,
    _photo_url,
    _weather_data,
    now()
  )
  RETURNING id INTO v_violation_id;
  
  -- In production, this would trigger notifications to PM, owner, etc.
  -- For now, we just mark it as needing alert
  UPDATE public.safety_violations
  SET alert_sent = false -- Will be set to true when notification is sent
  WHERE id = v_violation_id;
  
  RETURN v_violation_id;
END;
$$;

COMMENT ON FUNCTION public.create_safety_violation_alert IS 'Create safety violation alert (Block 255800)';

-- ============================================================================
-- PART 8 — PPE EXPIRATION WARNINGS
-- ============================================================================

-- Function: Check and alert on expiring PPE
CREATE OR REPLACE FUNCTION public.check_ppe_expirations(_workspace_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_expiring_ppe RECORD;
BEGIN
  -- Check for PPE expiring in next 30 days
  FOR v_expiring_ppe IN 
    SELECT * FROM public.get_expiring_ppe(_workspace_id, 30)
  LOOP
    -- Update expiration warning if not already sent
    UPDATE public.ppe_inventory
    SET 
      expiration_warning_sent = true,
      expiration_warning_sent_at = now()
    WHERE id = v_expiring_ppe.id
    AND expiration_warning_sent = false;
    
    -- In production, this would trigger a notification
    -- e.g., "Miguel's harness expires in 14 days. Replace before use."
  END LOOP;
  
  -- Check for expired PPE
  FOR v_expiring_ppe IN 
    SELECT * FROM public.get_expired_ppe(_workspace_id)
  LOOP
    -- Mark as expired
    UPDATE public.ppe_inventory
    SET status = 'expired'
    WHERE id = v_expiring_ppe.id
    AND status = 'valid';
    
    -- In production, this would trigger a critical alert
    -- e.g., "Expired PPE detected — Crew cannot start job."
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.check_ppe_expirations IS 'Check and alert on expiring/expired PPE (Block 255800)';

-- ============================================================================
-- PART 9 — WORKFLOW ENFORCEMENT
-- ============================================================================

-- Function: Check if job can start (all safety requirements met)
CREATE OR REPLACE FUNCTION public.can_job_start(_job_id uuid)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  v_toolbox_talk_required boolean;
  v_pre_job_checklist_required boolean;
  v_safety_photos_required boolean;
  v_required_photo_types text[] := ARRAY['ladder_setup', 'harness_inspection', 'anchor_installation', 'ppe_group_shot'];
BEGIN
  -- Check if toolbox talk is required and completed
  v_toolbox_talk_required := public.is_toolbox_talk_required(_job_id);
  IF v_toolbox_talk_required THEN
    RETURN false;
  END IF;
  
  -- Check if pre-job checklist is required and completed
  v_pre_job_checklist_required := public.is_safety_checklist_required(_job_id, 'pre_job');
  IF v_pre_job_checklist_required THEN
    RETURN false;
  END IF;
  
  -- Check if required safety photos are uploaded
  v_safety_photos_required := public.are_safety_photos_required(_job_id, v_required_photo_types);
  IF v_safety_photos_required THEN
    RETURN false;
  END IF;
  
  -- All requirements met
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.can_job_start IS 'Check if job can start (all safety requirements met) (Block 255800)';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================





















