-- ============================================================
-- Block 94000 — SmartSend Roofing "Customer Experience Engine + Homeowner Portal 10× Upgrade" v1
-- ============================================================
-- 
-- This block turns SmartSend from "Sick backend system" into
-- "This is the best contractor experience I've ever had in my life."
--
-- Features:
-- - Homeowner preferences (SMS/Email, frequency, quiet hours)
-- - Experience journey milestones (estimate_scheduled, crew_assigned, install_day, etc.)
-- - Micro-feedback events (NPS-style ratings at key touchpoints)
-- - Portal messaging (centralized communication)
-- - Auto experience check-ins
-- - Experience score tracking for owners
-- ============================================================

-- ============================================================
-- PART 1 — CREATE homeowner_preferences TABLE
-- ============================================================
-- Homeowner communication preferences per job/portal

CREATE TABLE IF NOT EXISTS public.homeowner_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid REFERENCES public.homeowner_portals(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  prefers_sms boolean DEFAULT true,
  prefers_email boolean DEFAULT true,
  update_frequency text CHECK (update_frequency IN ('minimal', 'normal', 'detailed')),
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key constraints dynamically
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_preferences_job_id_fkey'
    ) THEN
      ALTER TABLE public.homeowner_preferences
        ADD CONSTRAINT homeowner_preferences_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_preferences_job_id_jobs_fkey'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'homeowner_preferences_job_id_fkey'
      ) THEN
        ALTER TABLE public.homeowner_preferences
          ADD CONSTRAINT homeowner_preferences_job_id_jobs_fkey
          FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_homeowner_preferences_portal ON public.homeowner_preferences(portal_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_preferences_job ON public.homeowner_preferences(job_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_homeowner_preferences_job_unique ON public.homeowner_preferences(job_id);

-- ============================================================
-- PART 2 — CREATE experience_milestones TABLE
-- ============================================================
-- Experience journey milestones that track where homeowner is in the process

CREATE TABLE IF NOT EXISTS public.experience_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid REFERENCES public.homeowner_portals(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  milestone_type text NOT NULL, -- "estimate_scheduled", "crew_assigned", "materials_scheduled", "install_day", "cleanup_complete", "final_walkthrough"
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key constraints dynamically
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'experience_milestones_job_id_fkey'
    ) THEN
      ALTER TABLE public.experience_milestones
        ADD CONSTRAINT experience_milestones_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'experience_milestones_job_id_jobs_fkey'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'experience_milestones_job_id_fkey'
      ) THEN
        ALTER TABLE public.experience_milestones
          ADD CONSTRAINT experience_milestones_job_id_jobs_fkey
          FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_experience_milestones_portal ON public.experience_milestones(portal_id);
CREATE INDEX IF NOT EXISTS idx_experience_milestones_job ON public.experience_milestones(job_id);
CREATE INDEX IF NOT EXISTS idx_experience_milestones_type ON public.experience_milestones(milestone_type);
CREATE INDEX IF NOT EXISTS idx_experience_milestones_status ON public.experience_milestones(status);
CREATE INDEX IF NOT EXISTS idx_experience_milestones_job_type ON public.experience_milestones(job_id, milestone_type);

-- Unique constraint for ON CONFLICT handling
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'experience_milestones_job_type_unique'
  ) THEN
    ALTER TABLE public.experience_milestones
    ADD CONSTRAINT experience_milestones_job_type_unique 
    UNIQUE (job_id, milestone_type);
  END IF;
END $$;

-- ============================================================
-- PART 3 — CREATE experience_feedback_events TABLE
-- ============================================================
-- Micro-feedback events (NPS-style & touchpoint ratings)

CREATE TABLE IF NOT EXISTS public.experience_feedback_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid REFERENCES public.homeowner_portals(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  trigger_type text NOT NULL, -- "after_estimate", "after_install", "after_cleanup", "30_day_checkin"
  rating integer CHECK (rating >= 1 AND rating <= 10),
  comment text,
  is_promoter boolean GENERATED ALWAYS AS (rating >= 9) STORED, -- Auto-flag promoters (9-10)
  is_at_risk boolean GENERATED ALWAYS AS (rating <= 6) STORED, -- Auto-flag at-risk (≤6)
  created_at timestamptz DEFAULT now()
);

-- Add foreign key constraints dynamically
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'experience_feedback_events_job_id_fkey'
    ) THEN
      ALTER TABLE public.experience_feedback_events
        ADD CONSTRAINT experience_feedback_events_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'experience_feedback_events_job_id_jobs_fkey'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'experience_feedback_events_job_id_fkey'
      ) THEN
        ALTER TABLE public.experience_feedback_events
          ADD CONSTRAINT experience_feedback_events_job_id_jobs_fkey
          FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_experience_feedback_events_portal ON public.experience_feedback_events(portal_id);
CREATE INDEX IF NOT EXISTS idx_experience_feedback_events_job ON public.experience_feedback_events(job_id);
CREATE INDEX IF NOT EXISTS idx_experience_feedback_events_trigger ON public.experience_feedback_events(trigger_type);
CREATE INDEX IF NOT EXISTS idx_experience_feedback_events_rating ON public.experience_feedback_events(rating);
CREATE INDEX IF NOT EXISTS idx_experience_feedback_events_promoter ON public.experience_feedback_events(job_id, is_promoter) WHERE is_promoter = true;
CREATE INDEX IF NOT EXISTS idx_experience_feedback_events_at_risk ON public.experience_feedback_events(job_id, is_at_risk) WHERE is_at_risk = true;

-- ============================================================
-- PART 4 — CREATE homeowner_messages TABLE
-- ============================================================
-- Homeowner questions / messages from portal

CREATE TABLE IF NOT EXISTS public.homeowner_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid REFERENCES public.homeowner_portals(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  direction text NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  channel text NOT NULL CHECK (channel IN ('portal', 'email', 'sms')),
  body text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key constraints dynamically
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_messages_job_id_fkey'
    ) THEN
      ALTER TABLE public.homeowner_messages
        ADD CONSTRAINT homeowner_messages_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_messages_job_id_jobs_fkey'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'homeowner_messages_job_id_fkey'
      ) THEN
        ALTER TABLE public.homeowner_messages
          ADD CONSTRAINT homeowner_messages_job_id_jobs_fkey
          FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_homeowner_messages_portal ON public.homeowner_messages(portal_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_messages_job ON public.homeowner_messages(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_messages_direction ON public.homeowner_messages(direction);
CREATE INDEX IF NOT EXISTS idx_homeowner_messages_channel ON public.homeowner_messages(channel);
CREATE INDEX IF NOT EXISTS idx_homeowner_messages_unread ON public.homeowner_messages(job_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_homeowner_messages_created ON public.homeowner_messages(job_id, created_at DESC);

-- ============================================================
-- PART 5 — TRIGGERS
-- ============================================================

-- Update updated_at on homeowner_preferences
CREATE OR REPLACE FUNCTION update_homeowner_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_homeowner_preferences_updated_at ON public.homeowner_preferences;
CREATE TRIGGER trg_homeowner_preferences_updated_at
BEFORE UPDATE ON public.homeowner_preferences
FOR EACH ROW
EXECUTE FUNCTION update_homeowner_preferences_updated_at();

-- Update updated_at on experience_milestones
CREATE OR REPLACE FUNCTION update_experience_milestones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    NEW.completed_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_experience_milestones_updated_at ON public.experience_milestones;
CREATE TRIGGER trg_experience_milestones_updated_at
BEFORE UPDATE ON public.experience_milestones
FOR EACH ROW
EXECUTE FUNCTION update_experience_milestones_updated_at();

-- ============================================================
-- PART 6 — HELPER FUNCTIONS
-- ============================================================

-- Get current milestone for a job (what's next)
CREATE OR REPLACE FUNCTION get_current_milestone(p_job_id uuid)
RETURNS TABLE (
  milestone_type text,
  status text,
  completed_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    em.milestone_type,
    em.status,
    em.completed_at
  FROM public.experience_milestones em
  WHERE em.job_id = p_job_id
    AND em.status != 'completed'
  ORDER BY 
    CASE em.milestone_type
      WHEN 'estimate_scheduled' THEN 1
      WHEN 'crew_assigned' THEN 2
      WHEN 'materials_scheduled' THEN 3
      WHEN 'install_day' THEN 4
      WHEN 'cleanup_complete' THEN 5
      WHEN 'final_walkthrough' THEN 6
      ELSE 99
    END
  LIMIT 1;
END;
$$;

-- Get average experience rating for a job
CREATE OR REPLACE FUNCTION get_job_experience_rating(p_job_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avg_rating numeric;
BEGIN
  SELECT AVG(rating)::numeric(3,1)
  INTO v_avg_rating
  FROM public.experience_feedback_events
  WHERE job_id = p_job_id
    AND rating IS NOT NULL;
  
  RETURN COALESCE(v_avg_rating, 0);
END;
$$;

-- Get average experience rating for a workspace (last 30 days)
CREATE OR REPLACE FUNCTION get_workspace_experience_rating(p_workspace_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avg_rating numeric;
BEGIN
  SELECT AVG(efe.rating)::numeric(3,1)
  INTO v_avg_rating
  FROM public.experience_feedback_events efe
  JOIN public.homeowner_portals hp ON hp.id = efe.portal_id
  WHERE hp.workspace_id = p_workspace_id
    AND efe.rating IS NOT NULL
    AND efe.created_at >= now() - INTERVAL '30 days';
  
  RETURN COALESCE(v_avg_rating, 0);
END;
$$;

-- ============================================================
-- PART 7 — ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.homeowner_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experience_feedback_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeowner_messages ENABLE ROW LEVEL SECURITY;

-- Homeowner preferences: Public read/write (for homeowner portal), authenticated full access
DROP POLICY IF EXISTS "homeowner_preferences_public_all" ON public.homeowner_preferences;
CREATE POLICY "homeowner_preferences_public_all"
  ON public.homeowner_preferences FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "homeowner_preferences_authenticated_all" ON public.homeowner_preferences;
CREATE POLICY "homeowner_preferences_authenticated_all"
  ON public.homeowner_preferences FOR ALL
  USING (true)
  WITH CHECK (true);

-- Experience milestones: Public read, authenticated insert/update
DROP POLICY IF EXISTS "experience_milestones_public_read" ON public.experience_milestones;
CREATE POLICY "experience_milestones_public_read"
  ON public.experience_milestones FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "experience_milestones_authenticated_all" ON public.experience_milestones;
CREATE POLICY "experience_milestones_authenticated_all"
  ON public.experience_milestones FOR ALL
  USING (true)
  WITH CHECK (true);

-- Experience feedback events: Public insert/read (for homeowner portal), authenticated full access
DROP POLICY IF EXISTS "experience_feedback_events_public_all" ON public.experience_feedback_events;
CREATE POLICY "experience_feedback_events_public_all"
  ON public.experience_feedback_events FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "experience_feedback_events_authenticated_all" ON public.experience_feedback_events;
CREATE POLICY "experience_feedback_events_authenticated_all"
  ON public.experience_feedback_events FOR ALL
  USING (true)
  WITH CHECK (true);

-- Homeowner messages: Public insert/read (for homeowner portal), authenticated full access
DROP POLICY IF EXISTS "homeowner_messages_public_all" ON public.homeowner_messages;
CREATE POLICY "homeowner_messages_public_all"
  ON public.homeowner_messages FOR ALL
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "homeowner_messages_authenticated_all" ON public.homeowner_messages;
CREATE POLICY "homeowner_messages_authenticated_all"
  ON public.homeowner_messages FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- PART 8 — GRANT PERMISSIONS
-- ============================================================

GRANT SELECT, INSERT, UPDATE ON public.homeowner_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.experience_milestones TO authenticated;
GRANT SELECT, INSERT ON public.experience_feedback_events TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.homeowner_messages TO authenticated;

-- Public access for homeowner portal (via token)
GRANT SELECT, INSERT, UPDATE ON public.homeowner_preferences TO anon;
GRANT SELECT ON public.experience_milestones TO anon;
GRANT SELECT, INSERT ON public.experience_feedback_events TO anon;
GRANT SELECT, INSERT ON public.homeowner_messages TO anon;

-- ============================================================
-- PART 9 — COMMENTS
-- ============================================================

COMMENT ON TABLE public.homeowner_preferences IS 'Block 94000: Homeowner communication preferences per job/portal';
COMMENT ON TABLE public.experience_milestones IS 'Block 94000: Experience journey milestones tracking homeowner progress';
COMMENT ON TABLE public.experience_feedback_events IS 'Block 94000: Micro-feedback events (NPS-style ratings at key touchpoints)';
COMMENT ON TABLE public.homeowner_messages IS 'Block 94000: Homeowner questions/messages from portal';
COMMENT ON FUNCTION get_current_milestone(uuid) IS 'Block 94000: Get current milestone for a job (what''s next)';
COMMENT ON FUNCTION get_job_experience_rating(uuid) IS 'Block 94000: Get average experience rating for a job';
COMMENT ON FUNCTION get_workspace_experience_rating(uuid) IS 'Block 94000: Get average experience rating for a workspace (last 30 days)';
