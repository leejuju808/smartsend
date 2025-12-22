-- =========================================================
-- Block 67000 — SmartSend Roofing "AI Crew Training Insights + Skill Gap Detection System" v1
-- (ANALYZE CREW MISTAKES • IDENTIFY SKILL GAPS • TRAINING RECOMMENDATIONS • PERFORMANCE IMPROVEMENT ENGINE)
-- =========================================================
-- 
-- This block turns SmartSend into an AI crew development coach — something roofing companies desperately need but never have.
--
-- Roofers lose HUGE money because:
-- - crews repeat the same mistakes
-- - no one tracks skill improvement
-- - no training system exists
-- - new hires slow down production
-- - sloppy workmanship creates warranty claims
-- - owner doesn't know who the strong and weak workers are
--
-- SmartSend will identify EXACTLY where each crew member needs improvement and give training recommendations automatically.

-- ============================================================================
-- PART 1 — CREATE crew_skill_scores TABLE
-- ============================================================================
-- Tracks skill scores (0-100) for each crew member on each job

CREATE TABLE IF NOT EXISTS public.crew_skill_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  
  -- Skill scores (0-100, null = not assessed)
  tear_off numeric(5,2) CHECK (tear_off >= 0 AND tear_off <= 100),
  shingle_installation numeric(5,2) CHECK (shingle_installation >= 0 AND shingle_installation <= 100),
  flashing numeric(5,2) CHECK (flashing >= 0 AND flashing <= 100),
  ventilation numeric(5,2) CHECK (ventilation >= 0 AND ventilation <= 100),
  ridge numeric(5,2) CHECK (ridge >= 0 AND ridge <= 100),
  cleanup numeric(5,2) CHECK (cleanup >= 0 AND cleanup <= 100),
  safety numeric(5,2) CHECK (safety >= 0 AND safety <= 100),
  time_management numeric(5,2) CHECK (time_management >= 0 AND time_management <= 100),
  
  -- Overall score (calculated average)
  overall numeric(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN (
        (COALESCE(tear_off, 0) + COALESCE(shingle_installation, 0) + 
         COALESCE(flashing, 0) + COALESCE(ventilation, 0) + 
         COALESCE(ridge, 0) + COALESCE(cleanup, 0) + 
         COALESCE(safety, 0) + COALESCE(time_management, 0)) > 0
      ) THEN
        ROUND(
          (COALESCE(tear_off, 0) + COALESCE(shingle_installation, 0) + 
           COALESCE(flashing, 0) + COALESCE(ventilation, 0) + 
           COALESCE(ridge, 0) + COALESCE(cleanup, 0) + 
           COALESCE(safety, 0) + COALESCE(time_management, 0))::numeric / 
          NULLIF(
            (CASE WHEN tear_off IS NOT NULL THEN 1 ELSE 0 END +
             CASE WHEN shingle_installation IS NOT NULL THEN 1 ELSE 0 END +
             CASE WHEN flashing IS NOT NULL THEN 1 ELSE 0 END +
             CASE WHEN ventilation IS NOT NULL THEN 1 ELSE 0 END +
             CASE WHEN ridge IS NOT NULL THEN 1 ELSE 0 END +
             CASE WHEN cleanup IS NOT NULL THEN 1 ELSE 0 END +
             CASE WHEN safety IS NOT NULL THEN 1 ELSE 0 END +
             CASE WHEN time_management IS NOT NULL THEN 1 ELSE 0 END), 0
          ), 2
        )
      ELSE NULL
    END
  ) STORED,
  
  -- Assessment metadata
  assessment_method text CHECK (assessment_method IN ('ai_analysis', 'supervisor_review', 'qc_inspection', 'combined')) DEFAULT 'combined',
  assessment_source jsonb DEFAULT '{}'::jsonb, -- Links to qc_inspection_id, risk_assessment_id, etc.
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_skill_scores_workspace ON public.crew_skill_scores(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crew_skill_scores_crew_member ON public.crew_skill_scores(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_crew_skill_scores_crew ON public.crew_skill_scores(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_skill_scores_job ON public.crew_skill_scores(job_id);
CREATE INDEX IF NOT EXISTS idx_crew_skill_scores_overall ON public.crew_skill_scores(overall DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_crew_skill_scores_created ON public.crew_skill_scores(created_at DESC);

-- ============================================================================
-- PART 2 — CREATE crew_training_recommendations TABLE
-- ============================================================================
-- Stores AI-generated training recommendations based on identified skill gaps

CREATE TABLE IF NOT EXISTS public.crew_training_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  
  -- Recommendation details
  skill_area text NOT NULL CHECK (skill_area IN (
    'tear_off',
    'shingle_installation',
    'flashing',
    'ventilation',
    'ridge',
    'cleanup',
    'safety',
    'time_management',
    'general'
  )),
  
  recommendation_title text NOT NULL,
  recommendation text NOT NULL,
  
  -- Reasoning (JSONB with details)
  reasoning jsonb DEFAULT '{}'::jsonb,
  -- Structure: {
  --   "weakness_detected": "step_flashing_improper",
  --   "evidence": ["QC photo shows gap", "Risk alert flagged"],
  --   "impact": "High warranty risk",
  --   "priority": "high"
  -- }
  
  -- Training resources
  training_type text CHECK (training_type IN ('video', 'pdf', 'checklist', 'on_site', 'workshop')) DEFAULT 'video',
  training_resource_url text, -- Link to video, PDF, etc.
  training_duration_minutes integer,
  
  -- Priority
  priority text CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  
  -- Status tracking
  status text CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'dismissed')) DEFAULT 'pending',
  assigned_at timestamptz,
  completed_at timestamptz,
  dismissed_at timestamptz,
  dismissed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_training_recommendations_workspace ON public.crew_training_recommendations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crew_training_recommendations_crew_member ON public.crew_training_recommendations(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_crew_training_recommendations_crew ON public.crew_training_recommendations(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_training_recommendations_job ON public.crew_training_recommendations(job_id);
CREATE INDEX IF NOT EXISTS idx_crew_training_recommendations_status ON public.crew_training_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_crew_training_recommendations_skill ON public.crew_training_recommendations(skill_area);
CREATE INDEX IF NOT EXISTS idx_crew_training_recommendations_priority ON public.crew_training_recommendations(priority DESC);

-- ============================================================================
-- PART 3 — CREATE crew_performance_history TABLE
-- ============================================================================
-- Stores historical snapshots for tracking improvement/regression over time

CREATE TABLE IF NOT EXISTS public.crew_performance_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  
  -- Snapshot period
  snapshot_period_start date NOT NULL,
  snapshot_period_end date NOT NULL,
  snapshot_type text CHECK (snapshot_type IN ('weekly', 'monthly', 'quarterly', 'custom')) DEFAULT 'monthly',
  
  -- Skill snapshot (JSONB)
  skill_snapshot jsonb DEFAULT '{}'::jsonb,
  -- Structure: {
  --   "tear_off": 75,
  --   "shingle_installation": 82,
  --   "flashing": 68,
  --   "ventilation": 85,
  --   "ridge": 80,
  --   "cleanup": 90,
  --   "safety": 88,
  --   "time_management": 72,
  --   "overall": 80
  -- }
  
  -- Performance metrics
  jobs_completed integer DEFAULT 0,
  average_quality_score numeric(5,2),
  average_risk_score numeric(5,2),
  callback_count integer DEFAULT 0,
  warranty_issues_count integer DEFAULT 0,
  training_completed_count integer DEFAULT 0,
  
  -- Improvement metrics
  improvement_percentage numeric(5,2), -- vs previous period
  strongest_skill text,
  weakest_skill text,
  
  -- Notes
  notes text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_performance_history_workspace ON public.crew_performance_history(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crew_performance_history_crew_member ON public.crew_performance_history(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_crew_performance_history_crew ON public.crew_performance_history(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_performance_history_period ON public.crew_performance_history(snapshot_period_start, snapshot_period_end);
CREATE INDEX IF NOT EXISTS idx_crew_performance_history_type ON public.crew_performance_history(snapshot_type);

-- ============================================================================
-- PART 4 — CREATE supervisor_coaching_notes TABLE
-- ============================================================================
-- Allows supervisors to record coaching notes and observations

CREATE TABLE IF NOT EXISTS public.supervisor_coaching_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  
  -- Note details
  note_type text CHECK (note_type IN ('positive', 'coaching', 'concern', 'general')) DEFAULT 'general',
  title text NOT NULL,
  notes text NOT NULL,
  
  -- Related skills
  related_skills text[], -- Array of skill areas
  
  -- Behavior observations (JSONB)
  behavior_observations jsonb DEFAULT '{}'::jsonb,
  
  -- Supervisor info
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Follow-up
  requires_follow_up boolean DEFAULT false,
  follow_up_date date,
  follow_up_completed boolean DEFAULT false,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supervisor_coaching_notes_workspace ON public.supervisor_coaching_notes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_coaching_notes_crew_member ON public.supervisor_coaching_notes(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_coaching_notes_crew ON public.supervisor_coaching_notes(crew_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_coaching_notes_job ON public.supervisor_coaching_notes(job_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_coaching_notes_follow_up ON public.supervisor_coaching_notes(requires_follow_up, follow_up_date) WHERE requires_follow_up = true;

-- ============================================================================
-- PART 5 — CREATE crew_ranking VIEW
-- ============================================================================
-- View that ranks crews based on quality, speed, complaints, risk, warranty probability

CREATE OR REPLACE VIEW public.v_crew_rankings AS
SELECT 
  c.id AS crew_id,
  c.workspace_id,
  c.name AS crew_name,
  
  -- Quality metrics
  COALESCE(AVG(css.overall), 0) AS avg_quality_score,
  
  -- Speed metrics (from job completion times)
  COALESCE(
    AVG(EXTRACT(EPOCH FROM (rj.updated_at - rj.scheduled_start_date)) / 86400),
    0
  ) AS avg_completion_days,
  
  -- Complaints count (from homeowner complaints, risk alerts)
  COALESCE(
    (SELECT COUNT(*) FROM public.risk_alerts ra 
     WHERE ra.job_id IN (SELECT id FROM public.roofing_jobs WHERE crew_id = c.id)
     AND ra.severity IN ('high', 'critical')), 0
  ) AS high_severity_alerts_count,
  
  -- Risk score
  COALESCE(
    AVG((SELECT AVG(risk_score) FROM public.risk_assessments 
         WHERE job_id IN (SELECT id FROM public.roofing_jobs WHERE crew_id = c.id))), 0
  ) AS avg_risk_score,
  
  -- Warranty probability
  COALESCE(
    AVG((SELECT AVG((warranty_risk->>'probability')::numeric) FROM public.risk_assessments 
         WHERE job_id IN (SELECT id FROM public.roofing_jobs WHERE crew_id = c.id))), 0
  ) AS avg_warranty_probability,
  
  -- Jobs completed
  COUNT(DISTINCT rj.id) AS jobs_completed_count,
  
  -- Overall ranking score (lower is better)
  (
    (100 - COALESCE(AVG(css.overall), 0)) * 0.3 + -- Quality (inverted, 30% weight)
    LEAST(COALESCE(
      AVG(EXTRACT(EPOCH FROM (rj.updated_at - rj.scheduled_start_date)) / 86400),
      0
    ) * 10, 100) * 0.2 + -- Speed (20% weight, normalized)
    LEAST(
      COALESCE(
        (SELECT COUNT(*) FROM public.risk_alerts ra 
         WHERE ra.job_id IN (SELECT id FROM public.roofing_jobs WHERE crew_id = c.id)
         AND ra.severity IN ('high', 'critical')), 0
      ) * 10, 100
    ) * 0.25 + -- Complaints (25% weight)
    COALESCE(
      AVG((SELECT AVG(risk_score) FROM public.risk_assessments 
           WHERE job_id IN (SELECT id FROM public.roofing_jobs WHERE crew_id = c.id))), 0
    ) * 0.15 + -- Risk (15% weight)
    COALESCE(
      AVG((SELECT AVG((warranty_risk->>'probability')::numeric) FROM public.risk_assessments 
           WHERE job_id IN (SELECT id FROM public.roofing_jobs WHERE crew_id = c.id))), 0
    ) * 0.1 -- Warranty (10% weight)
  ) AS ranking_score
  
FROM public.crews c
LEFT JOIN public.roofing_jobs rj ON rj.crew_id = c.id AND rj.status = 'completed'
LEFT JOIN public.crew_skill_scores css ON css.crew_id = c.id
WHERE c.is_active = true
GROUP BY c.id, c.workspace_id, c.name
ORDER BY ranking_score ASC; -- Lower score = better crew

-- ============================================================================
-- PART 6 — CREATE crew_member_performance_summary VIEW
-- ============================================================================
-- Summary view for individual crew member performance

CREATE OR REPLACE VIEW public.v_crew_member_performance_summary AS
SELECT 
  cm.id AS crew_member_id,
  cm.workspace_id,
  cm.name AS crew_member_name,
  cm.crew_id,
  c.name AS crew_name,
  
  -- Current skill scores (latest)
  css.tear_off,
  css.shingle_installation,
  css.flashing,
  css.ventilation,
  css.ridge,
  css.cleanup,
  css.safety,
  css.time_management,
  css.overall,
  
  -- Performance metrics
  COUNT(DISTINCT css.job_id) AS jobs_assessed_count,
  
  -- Improvement trend
  (
    SELECT improvement_percentage 
    FROM public.crew_performance_history cph
    WHERE cph.crew_member_id = cm.id
    ORDER BY cph.created_at DESC
    LIMIT 1
  ) AS latest_improvement_percentage,
  
  -- Pending training recommendations
  COUNT(DISTINCT ctr.id) FILTER (WHERE ctr.status = 'pending') AS pending_training_count,
  
  -- Last assessment date
  MAX(css.created_at) AS last_assessed_at
  
FROM public.crew_members cm
LEFT JOIN public.crews c ON c.id = cm.crew_id
LEFT JOIN public.crew_skill_scores css ON css.crew_member_id = cm.id
LEFT JOIN public.crew_training_recommendations ctr ON ctr.crew_member_id = cm.id
WHERE cm.is_active = true
GROUP BY 
  cm.id, cm.workspace_id, cm.name, cm.crew_id, c.name,
  css.tear_off, css.shingle_installation, css.flashing, css.ventilation,
  css.ridge, css.cleanup, css.safety, css.time_management, css.overall;

-- ============================================================================
-- PART 7 — TRIGGERS
-- ============================================================================

-- Update updated_at for crew_skill_scores
CREATE OR REPLACE FUNCTION public.set_crew_skill_scores_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_crew_skill_scores_updated_at ON public.crew_skill_scores;
CREATE TRIGGER trg_set_crew_skill_scores_updated_at
BEFORE UPDATE ON public.crew_skill_scores
FOR EACH ROW
EXECUTE FUNCTION public.set_crew_skill_scores_updated_at();

-- Update updated_at for crew_training_recommendations
CREATE OR REPLACE FUNCTION public.set_crew_training_recommendations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_crew_training_recommendations_updated_at ON public.crew_training_recommendations;
CREATE TRIGGER trg_set_crew_training_recommendations_updated_at
BEFORE UPDATE ON public.crew_training_recommendations
FOR EACH ROW
EXECUTE FUNCTION public.set_crew_training_recommendations_updated_at();

-- Update updated_at for supervisor_coaching_notes
CREATE OR REPLACE FUNCTION public.set_supervisor_coaching_notes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_supervisor_coaching_notes_updated_at ON public.supervisor_coaching_notes;
CREATE TRIGGER trg_set_supervisor_coaching_notes_updated_at
BEFORE UPDATE ON public.supervisor_coaching_notes
FOR EACH ROW
EXECUTE FUNCTION public.set_supervisor_coaching_notes_updated_at();

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.crew_skill_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_training_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_performance_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_coaching_notes ENABLE ROW LEVEL SECURITY;

-- RLS policies: workspace-based access
CREATE POLICY "crew_skill_scores_workspace_access" ON public.crew_skill_scores
  FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "crew_training_recommendations_workspace_access" ON public.crew_training_recommendations
  FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "crew_performance_history_workspace_access" ON public.crew_performance_history
  FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "supervisor_coaching_notes_workspace_access" ON public.supervisor_coaching_notes
  FOR ALL
  USING (workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  ));




























