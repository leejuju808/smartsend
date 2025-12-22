-- Block 259200 — SmartSend Training Academy v1
-- Role-Based Learning • Certifications • Skill Tracking • Micro-Courses • Crew Upskilling
--
-- This block turns SmartSend into the built-in education system
-- for roofing companies (Sales, PM, Crew, Admin).
--
-- It provides:
--  - Role-based training tracks
--  - Micro-course modules (3–7 minute lessons)
--  - Certification tracking
--  - Skill scores per person
--  - Auto-onboarding & crew upskilling paths
--  - Refresher training (expiring skills)
--  - Training → performance linkage
--  - Company knowledge base (SOP library)


-- ============================================================================
-- PART 1 — CORE TRAINING TABLES
-- ============================================================================

-- 1.1 training_tracks — role-based learning paths per roofing company
CREATE TABLE IF NOT EXISTS public.training_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  roofing_company_id uuid NOT NULL
    REFERENCES public.roofing_companies(id)
    ON DELETE CASCADE,

  -- Human facing
  name text NOT NULL,
  description text,

  -- Target role in the company
  -- Examples: 'sales', 'project_manager', 'crew', 'admin'
  role text CHECK (
    role IS NULL OR role IN (
      'sales',
      'project_manager',
      'crew',
      'admin',
      'owner',
      'manager',
      'accounting',
      'ops',
      'insurance_specialist',
      'viewer',
      'other'
    )
  ),

  -- Track type for grouping and automation rules
  -- 'role'        = core track for a given role (Sales, PM, Crew, Admin)
  -- 'upskilling'  = progression paths (Helper → Installer → Crew Lead)
  -- 'refresher'   = used for expiring skills / safety refreshers
  -- 'cert_prep'   = prepares for a specific certification
  -- 'knowledge'   = pure knowledge base / SOP playlists
  -- 'custom'      = anything else the company defines
  track_type text NOT NULL DEFAULT 'role' CHECK (track_type IN (
    'role',
    'upskilling',
    'refresher',
    'cert_prep',
    'knowledge',
    'custom'
  )),

  -- Marks tracks that should be auto-assigned on hire
  is_default_onboarding boolean NOT NULL DEFAULT false,

  -- Optional level ordering inside an upskilling path
  -- e.g. 1 = Tear-Off Helper, 2 = Installer, 3 = Advanced Installer, 4 = Crew Lead
  level int,

  is_active boolean NOT NULL DEFAULT true,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT training_tracks_unique_name_per_company
    UNIQUE (roofing_company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_training_tracks_company
  ON public.training_tracks(roofing_company_id, track_type, is_active);

CREATE INDEX IF NOT EXISTS idx_training_tracks_role
  ON public.training_tracks(roofing_company_id, role) WHERE role IS NOT NULL;


-- 1.2 training_modules — micro-course modules inside tracks
CREATE TABLE IF NOT EXISTS public.training_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  roofing_company_id uuid NOT NULL
    REFERENCES public.roofing_companies(id)
    ON DELETE CASCADE,

  track_id uuid REFERENCES public.training_tracks(id) ON DELETE CASCADE,

  title text NOT NULL,

  -- Rich content: videos, diagrams, steps, images, text blocks
  -- Example structure:
  -- {
  --   "sections": [
  --     {"type": "video", "url": "...", "duration_seconds": 240},
  --     {"type": "image", "url": "...", "caption": "..."},
  --     {"type": "steps", "items": ["Step 1...", "Step 2..."]}
  --   ]
  -- }
  content jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Quiz definition per module
  -- Example:
  -- [
  --   {"question": "Where do you nail on a 10/12 pitch?", "options": [...], "correct_index": 1},
  --   {"question": "What is the minimum shingle overlap?", ...}
  -- ]
  quiz jsonb NOT NULL DEFAULT '[]'::jsonb,

  estimated_minutes int,

  -- Order inside track
  order_index int,

  is_required boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,

  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_modules_track
  ON public.training_modules(track_id, order_index);

CREATE INDEX IF NOT EXISTS idx_training_modules_company
  ON public.training_modules(roofing_company_id, is_active);


-- 1.3 training_assignments — who has which track/modules assigned & why
CREATE TABLE IF NOT EXISTS public.training_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  roofing_company_id uuid NOT NULL
    REFERENCES public.roofing_companies(id)
    ON DELETE CASCADE,

  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  track_id uuid REFERENCES public.training_tracks(id) ON DELETE CASCADE,
  module_id uuid REFERENCES public.training_modules(id) ON DELETE CASCADE,

  -- Why this was assigned
  -- 'onboarding'  = new hire auto-onboarding
  -- 'upskilling'  = Tear-Off → Installer → Crew Lead path
  -- 'refresher'   = certification/skill expiring
  -- 'manual'      = manager manually assigned
  -- 'performance' = driven by performance rules (bonuses / guardrails)
  assignment_type text NOT NULL DEFAULT 'onboarding' CHECK (assignment_type IN (
    'onboarding',
    'upskilling',
    'refresher',
    'manual',
    'performance'
  )),

  auto_assigned boolean NOT NULL DEFAULT false,

  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','cancelled')),

  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  due_at timestamptz,
  completed_at timestamptz,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT training_assignments_track_or_module
    CHECK (track_id IS NOT NULL OR module_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_training_assignments_user
  ON public.training_assignments(roofing_company_id, user_id, status);

CREATE INDEX IF NOT EXISTS idx_training_assignments_due
  ON public.training_assignments(roofing_company_id, due_at) WHERE due_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_training_assignments_unique
  ON public.training_assignments(
    roofing_company_id,
    user_id,
    COALESCE(track_id, module_id),
    assignment_type
  );


-- 1.4 training_progress — per-user per-module status & scores
CREATE TABLE IF NOT EXISTS public.training_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  roofing_company_id uuid NOT NULL
    REFERENCES public.roofing_companies(id)
    ON DELETE CASCADE,

  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,

  status text NOT NULL DEFAULT 'not_started' CHECK (status IN (
    'not_started',
    'in_progress',
    'completed',
    'failed',
    'expired'
  )),

  -- 0–100 score for quizzes / assessments
  score numeric(5,2) CHECK (score IS NULL OR (score >= 0 AND score <= 100)),

  attempts int NOT NULL DEFAULT 0,

  started_at timestamptz,
  completed_at timestamptz,
  last_activity_at timestamptz NOT NULL DEFAULT now(),

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT training_progress_unique_per_module
    UNIQUE (roofing_company_id, user_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_training_progress_user
  ON public.training_progress(roofing_company_id, user_id, status);

CREATE INDEX IF NOT EXISTS idx_training_progress_module
  ON public.training_progress(module_id, status);

CREATE INDEX IF NOT EXISTS idx_training_progress_activity
  ON public.training_progress(roofing_company_id, last_activity_at DESC);


-- 1.5 training_certifications — named certifications per user
-- (separate from safety block 71000's certifications table)
CREATE TABLE IF NOT EXISTS public.training_certifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  roofing_company_id uuid NOT NULL
    REFERENCES public.roofing_companies(id)
    ON DELETE CASCADE,

  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Human name of the certification ("Roof Safety Level 1", "Installer Certification")
  name text NOT NULL,

  -- Optional link to the track that produced this certification
  track_id uuid REFERENCES public.training_tracks(id) ON DELETE SET NULL,

  -- 0–100 score earned for this certification, if applicable
  score numeric(5,2) CHECK (score IS NULL OR (score >= 0 AND score <= 100)),

  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,

  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','revoked')),

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_training_certifications_user
  ON public.training_certifications(roofing_company_id, user_id, status);

CREATE INDEX IF NOT EXISTS idx_training_certifications_expiry
  ON public.training_certifications(roofing_company_id, expires_at)
  WHERE expires_at IS NOT NULL;


-- 1.6 training_skill_scores — skill-level metrics per user
CREATE TABLE IF NOT EXISTS public.training_skill_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  roofing_company_id uuid NOT NULL
    REFERENCES public.roofing_companies(id)
    ON DELETE CASCADE,

  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Skill key: 'inspection', 'insurance_knowledge', 'closing', 'safety', etc.
  skill_key text NOT NULL,

  -- 0–100 score representing current proficiency
  score numeric(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),

  -- Where this score came from ("training_module", "quiz", "manager_review", "ai_assessment")
  source text,

  last_assessed_at timestamptz NOT NULL DEFAULT now(),

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  CONSTRAINT training_skill_scores_unique
    UNIQUE (roofing_company_id, user_id, skill_key)
);

CREATE INDEX IF NOT EXISTS idx_training_skill_scores_user
  ON public.training_skill_scores(roofing_company_id, user_id);

CREATE INDEX IF NOT EXISTS idx_training_skill_scores_skill
  ON public.training_skill_scores(roofing_company_id, skill_key);


-- 1.7 training_performance_links — training → performance rules
CREATE TABLE IF NOT EXISTS public.training_performance_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  roofing_company_id uuid NOT NULL
    REFERENCES public.roofing_companies(id)
    ON DELETE CASCADE,

  -- Target role this rule applies to (sales, crew, project_manager, etc.)
  role text,

  -- Skill key this rule is based on (must match training_skill_scores.skill_key)
  skill_key text NOT NULL,

  -- Minimum score required for this rule (0–100)
  min_score numeric(5,2) NOT NULL CHECK (min_score >= 0 AND min_score <= 100),

  -- Action to take when condition is met/not met
  -- Examples: 'eligible_for_bonus', 'block_complex_roofs', 'eligible_for_promotion'
  action text NOT NULL,

  -- Optional free-form target identifier ("complex_roofs", "crew_lead", "premium_jobs")
  target text,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_performance_links_company
  ON public.training_performance_links(roofing_company_id, role, skill_key);


-- 1.8 company_knowledge_base_entries — SOPs, checklists, playbooks, scripts
CREATE TABLE IF NOT EXISTS public.company_knowledge_base_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  roofing_company_id uuid NOT NULL
    REFERENCES public.roofing_companies(id)
    ON DELETE CASCADE,

  title text NOT NULL,

  -- Rich content body (text, structured steps, embeds)
  -- Example:
  -- {
  --   "type": "doc",
  --   "blocks": [
  --     {"type": "heading", "text": "Tear-Off Procedure"},
  --     {"type": "checklist", "items": [...]},
  --     {"type": "image", "url": "..."}
  --   ]
  -- }
  content jsonb NOT NULL DEFAULT '{}'::jsonb,

  category text, -- 'SOP', 'install_standard', 'checklist', 'safety', 'sales_script', 'supplement_playbook', 'onboarding'

  tags text[] DEFAULT '{}'::text[],

  -- Optional: restrict to certain roles
  -- e.g. ['crew', 'project_manager'], ['sales'], etc.
  visible_to_roles text[] DEFAULT '{}'::text[],

  -- Optional linkage into training system
  track_id uuid REFERENCES public.training_tracks(id) ON DELETE SET NULL,

  is_published boolean NOT NULL DEFAULT true,

  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_kb_company_category
  ON public.company_knowledge_base_entries(roofing_company_id, category, is_published);

CREATE INDEX IF NOT EXISTS idx_company_kb_tags
  ON public.company_knowledge_base_entries
  USING GIN (tags);


-- ============================================================================
-- PART 2 — VIEWS & HELPER FUNCTIONS (SKILL DASHBOARDS & REFRESHERS)
-- ============================================================================

-- 2.1 View: training_user_skill_dashboard
-- Aggregates skill scores per user into a JSON object for fast dashboards.
CREATE OR REPLACE VIEW public.training_user_skill_dashboard AS
SELECT
  tss.roofing_company_id,
  tss.user_id,
  jsonb_object_agg(tss.skill_key, tss.score ORDER BY tss.skill_key) AS skills
FROM public.training_skill_scores tss
GROUP BY tss.roofing_company_id, tss.user_id;

COMMENT ON VIEW public.training_user_skill_dashboard IS
  'Block 259200: Aggregated skill scores per user (skill_key → 0–100 score).';


-- 2.2 Function: get_team_training_dashboard
-- Returns per-user training rollup (modules, completion %, certs, expiring certs)
CREATE OR REPLACE FUNCTION public.get_team_training_dashboard(
  p_roofing_company_id uuid
)
RETURNS TABLE (
  user_id uuid,
  role text,
  total_modules_assigned int,
  modules_completed int,
  completion_rate numeric(5,2),
  active_certifications_count int,
  expiring_certifications_30d int,
  last_activity_at timestamptz
) LANGUAGE sql STABLE AS $$
  WITH members AS (
    SELECT
      rcm.user_id,
      rcm.role
    FROM public.roofing_company_members rcm
    WHERE rcm.roofing_company_id = p_roofing_company_id
      AND rcm.is_active = true
  ),
  assigned AS (
    SELECT
      ta.user_id,
      COUNT(DISTINCT ta.module_id) AS total_modules_assigned
    FROM public.training_assignments ta
    WHERE ta.roofing_company_id = p_roofing_company_id
      AND ta.status = 'active'
      AND ta.module_id IS NOT NULL
    GROUP BY ta.user_id
  ),
  completed AS (
    SELECT
      tp.user_id,
      COUNT(DISTINCT tp.module_id) AS modules_completed
    FROM public.training_progress tp
    WHERE tp.roofing_company_id = p_roofing_company_id
      AND tp.status = 'completed'
    GROUP BY tp.user_id
  ),
  last_activity AS (
    SELECT
      tp.user_id,
      MAX(tp.last_activity_at) AS last_activity_at
    FROM public.training_progress tp
    WHERE tp.roofing_company_id = p_roofing_company_id
    GROUP BY tp.user_id
  ),
  certs AS (
    SELECT
      tc.user_id,
      COUNT(*) FILTER (
        WHERE tc.status = 'active'
          AND (tc.expires_at IS NULL OR tc.expires_at > now())
      ) AS active_certifications_count,
      COUNT(*) FILTER (
        WHERE tc.expires_at IS NOT NULL
          AND tc.expires_at <= now() + interval '30 days'
      ) AS expiring_certifications_30d
    FROM public.training_certifications tc
    WHERE tc.roofing_company_id = p_roofing_company_id
    GROUP BY tc.user_id
  )
  SELECT
    m.user_id,
    m.role,
    COALESCE(a.total_modules_assigned, 0) AS total_modules_assigned,
    COALESCE(c.modules_completed, 0) AS modules_completed,
    CASE
      WHEN COALESCE(a.total_modules_assigned, 0) = 0 THEN 0
      ELSE ROUND(
        100.0 * COALESCE(c.modules_completed, 0)::numeric
        / GREATEST(a.total_modules_assigned::numeric, 1),
        2
      )
    END AS completion_rate,
    COALESCE(ct.active_certifications_count, 0) AS active_certifications_count,
    COALESCE(ct.expiring_certifications_30d, 0) AS expiring_certifications_30d,
    la.last_activity_at
  FROM members m
  LEFT JOIN assigned a ON a.user_id = m.user_id
  LEFT JOIN completed c ON c.user_id = m.user_id
  LEFT JOIN last_activity la ON la.user_id = m.user_id
  LEFT JOIN certs ct ON ct.user_id = m.user_id
  ORDER BY completion_rate DESC, m.role, m.user_id;
$$;

COMMENT ON FUNCTION public.get_team_training_dashboard(uuid) IS
  'Block 259200: Returns per-user training rollup for a roofing company (modules, completion %, certs, expiring certs).';


-- 2.3 Function: get_certifications_expiring_soon
-- Helper for refresher training campaigns.
CREATE OR REPLACE FUNCTION public.get_certifications_expiring_soon(
  p_roofing_company_id uuid,
  p_days int DEFAULT 30
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  name text,
  score numeric(5,2),
  issued_at timestamptz,
  expires_at timestamptz
) LANGUAGE sql STABLE AS $$
  SELECT
    tc.id,
    tc.user_id,
    tc.name,
    tc.score,
    tc.issued_at,
    tc.expires_at
  FROM public.training_certifications tc
  WHERE tc.roofing_company_id = p_roofing_company_id
    AND tc.expires_at IS NOT NULL
    AND tc.expires_at <= now() + (p_days || ' days')::interval
    AND tc.status = 'active';
$$;

COMMENT ON FUNCTION public.get_certifications_expiring_soon(uuid, int) IS
  'Block 259200: Lists active training certifications that expire within N days for a roofing company.';


-- ============================================================================
-- PART 3 — AUTO-ONBOARDING & CREW UPSKILLING SUPPORT
-- ============================================================================

-- 3.1 Function: assign_default_tracks_for_company_member
-- Called when a new roofing_company_members row is created (auto-onboarding).
CREATE OR REPLACE FUNCTION public.assign_default_tracks_for_company_member(
  p_roofing_company_id uuid,
  p_user_id uuid,
  p_role text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_normalized_role text;
  v_track record;
  v_module record;
BEGIN
  -- Normalize role into training roles
  IF p_role IN ('sales', 'sales_rep') THEN
    v_normalized_role := 'sales';
  ELSIF p_role IN ('ops', 'production', 'project_manager', 'manager') THEN
    v_normalized_role := 'project_manager';
  ELSIF p_role = 'crew' THEN
    v_normalized_role := 'crew';
  ELSIF p_role IN ('owner', 'admin') THEN
    v_normalized_role := 'admin';
  ELSE
    v_normalized_role := 'other';
  END IF;

  -- Loop through default onboarding tracks for this role (or generic ones)
  FOR v_track IN
    SELECT *
    FROM public.training_tracks tt
    WHERE tt.roofing_company_id = p_roofing_company_id
      AND tt.is_default_onboarding = true
      AND (tt.role IS NULL OR tt.role = v_normalized_role)
      AND tt.is_active = true
  LOOP
    -- Create track-level assignment if not present
    INSERT INTO public.training_assignments (
      roofing_company_id,
      user_id,
      track_id,
      assignment_type,
      auto_assigned,
      status
    ) VALUES (
      p_roofing_company_id,
      p_user_id,
      v_track.id,
      'onboarding',
      true,
      'active'
    )
    ON CONFLICT ON CONSTRAINT ux_training_assignments_unique DO NOTHING;

    -- Also pre-create module-level assignments and progress rows
    FOR v_module IN
      SELECT *
      FROM public.training_modules tm
      WHERE tm.track_id = v_track.id
        AND tm.is_active = true
      ORDER BY tm.order_index NULLS LAST, tm.created_at
    LOOP
      -- Assignment
      INSERT INTO public.training_assignments (
        roofing_company_id,
        user_id,
        track_id,
        module_id,
        assignment_type,
        auto_assigned,
        status
      ) VALUES (
        p_roofing_company_id,
        p_user_id,
        v_track.id,
        v_module.id,
        'onboarding',
        true,
        'active'
      )
      ON CONFLICT ON CONSTRAINT ux_training_assignments_unique DO NOTHING;

      -- Progress shell row
      INSERT INTO public.training_progress (
        roofing_company_id,
        user_id,
        module_id,
        status,
        attempts
      ) VALUES (
        p_roofing_company_id,
        p_user_id,
        v_module.id,
        'not_started',
        0
      )
      ON CONFLICT (roofing_company_id, user_id, module_id) DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.assign_default_tracks_for_company_member(uuid, uuid, text) IS
  'Block 259200: Auto-assigns default onboarding training tracks + modules based on company member role.';


-- 3.2 Trigger function: wrapper to call assign_default_tracks_for_company_member from trigger context
CREATE OR REPLACE FUNCTION public.assign_default_tracks_for_company_member_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.assign_default_tracks_for_company_member(
    NEW.roofing_company_id,
    NEW.user_id,
    NEW.role
  );
  RETURN NEW;
END;
$$;

-- 3.3 Trigger: auto-assign onboarding tracks when a new roofing_company_member is created
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table = 'roofing_company_members'
      AND trigger_name = 'trg_roofing_company_members_auto_training'
  ) THEN
    CREATE TRIGGER trg_roofing_company_members_auto_training
      AFTER INSERT ON public.roofing_company_members
      FOR EACH ROW
      WHEN (NEW.is_active = true)
      EXECUTE FUNCTION public.assign_default_tracks_for_company_member_trigger();
  END IF;
END $$;


-- ============================================================================
-- PART 4 — ROW LEVEL SECURITY (RLS) & GRANTS
-- ============================================================================

-- Enable RLS
ALTER TABLE public.training_tracks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_modules                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_assignments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_progress               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_certifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_skill_scores           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_performance_links      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_knowledge_base_entries  ENABLE ROW LEVEL SECURITY;


-- training_tracks policies
CREATE POLICY training_tracks_company_members_select
  ON public.training_tracks
  FOR SELECT
  USING (public.is_company_member(roofing_company_id));

CREATE POLICY training_tracks_company_members_manage
  ON public.training_tracks
  FOR ALL
  USING (public.is_company_member(roofing_company_id))
  WITH CHECK (public.is_company_member(roofing_company_id));


-- training_modules policies
CREATE POLICY training_modules_company_members_select
  ON public.training_modules
  FOR SELECT
  USING (public.is_company_member(roofing_company_id));

CREATE POLICY training_modules_company_members_manage
  ON public.training_modules
  FOR ALL
  USING (public.is_company_member(roofing_company_id))
  WITH CHECK (public.is_company_member(roofing_company_id));


-- training_assignments policies
CREATE POLICY training_assignments_company_members_select
  ON public.training_assignments
  FOR SELECT
  USING (public.is_company_member(roofing_company_id));

CREATE POLICY training_assignments_company_members_manage
  ON public.training_assignments
  FOR ALL
  USING (public.is_company_member(roofing_company_id))
  WITH CHECK (public.is_company_member(roofing_company_id));


-- training_progress policies
CREATE POLICY training_progress_company_members_select
  ON public.training_progress
  FOR SELECT
  USING (public.is_company_member(roofing_company_id));

CREATE POLICY training_progress_company_members_manage
  ON public.training_progress
  FOR ALL
  USING (public.is_company_member(roofing_company_id))
  WITH CHECK (public.is_company_member(roofing_company_id));


-- training_certifications policies
CREATE POLICY training_certifications_company_members_select
  ON public.training_certifications
  FOR SELECT
  USING (public.is_company_member(roofing_company_id));

CREATE POLICY training_certifications_company_members_manage
  ON public.training_certifications
  FOR ALL
  USING (public.is_company_member(roofing_company_id))
  WITH CHECK (public.is_company_member(roofing_company_id));


-- training_skill_scores policies
CREATE POLICY training_skill_scores_company_members_select
  ON public.training_skill_scores
  FOR SELECT
  USING (public.is_company_member(roofing_company_id));

CREATE POLICY training_skill_scores_company_members_manage
  ON public.training_skill_scores
  FOR ALL
  USING (public.is_company_member(roofing_company_id))
  WITH CHECK (public.is_company_member(roofing_company_id));


-- training_performance_links policies
CREATE POLICY training_performance_links_company_members_select
  ON public.training_performance_links
  FOR SELECT
  USING (public.is_company_member(roofing_company_id));

CREATE POLICY training_performance_links_company_members_manage
  ON public.training_performance_links
  FOR ALL
  USING (public.is_company_member(roofing_company_id))
  WITH CHECK (public.is_company_member(roofing_company_id));


-- company_knowledge_base_entries policies
CREATE POLICY company_kb_company_members_select
  ON public.company_knowledge_base_entries
  FOR SELECT
  USING (public.is_company_member(roofing_company_id));

CREATE POLICY company_kb_company_members_manage
  ON public.company_knowledge_base_entries
  FOR ALL
  USING (public.is_company_member(roofing_company_id))
  WITH CHECK (public.is_company_member(roofing_company_id));


-- Service role: full access for internal automation / AI engines
CREATE POLICY training_tracks_service_role_all
  ON public.training_tracks
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY training_modules_service_role_all
  ON public.training_modules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY training_assignments_service_role_all
  ON public.training_assignments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY training_progress_service_role_all
  ON public.training_progress
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY training_certifications_service_role_all
  ON public.training_certifications
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY training_skill_scores_service_role_all
  ON public.training_skill_scores
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY training_performance_links_service_role_all
  ON public.training_performance_links
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY company_kb_service_role_all
  ON public.company_knowledge_base_entries
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- Grants (authenticated users get read/write via RLS; service_role has additional policies above)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_tracks                TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_modules               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_assignments           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_progress              TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_certifications        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_skill_scores          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_performance_links     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_knowledge_base_entries TO authenticated;

GRANT SELECT ON public.training_user_skill_dashboard TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_training_dashboard(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_certifications_expiring_soon(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_default_tracks_for_company_member(uuid, uuid, text) TO service_role;


COMMENT ON TABLE public.training_tracks IS 'Block 259200: Role-based training tracks per roofing company (Sales, PM, Crew, Admin).';
COMMENT ON TABLE public.training_modules IS 'Block 259200: Micro-course training modules (3–7 minute lessons with quizzes).';
COMMENT ON TABLE public.training_assignments IS 'Block 259200: Per-user training assignments (onboarding, upskilling, refresher, performance).';
COMMENT ON TABLE public.training_progress IS 'Block 259200: Per-user per-module training progress and scores.';
COMMENT ON TABLE public.training_certifications IS 'Block 259200: Per-user training certifications per roofing company.';
COMMENT ON TABLE public.training_skill_scores IS 'Block 259200: Per-user skill scores (0–100) for training dashboards.';
COMMENT ON TABLE public.training_performance_links IS 'Block 259200: Rules connecting training skill levels to performance actions (bonuses, promotions, guardrails).';
COMMENT ON TABLE public.company_knowledge_base_entries IS 'Block 259200: Company knowledge base (SOPs, install standards, checklists, safety rules, sales scripts).';













