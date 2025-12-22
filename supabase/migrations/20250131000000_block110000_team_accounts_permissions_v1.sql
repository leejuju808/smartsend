-- =========================================================
-- Block 110000 — SmartSend Roofing Team Accounts + Crew Manager + Permissions System v1
-- =========================================================
-- 
-- This block enables multi-user support for roofing companies:
-- - Multiple users per company with role-based permissions
-- - Team inbox for leads with assignment
-- - Crew Manager for field team job assignments
-- - Activity tracking for team oversight
-- - Invite system for team creation
--
-- This turns SmartSend into the central brain of a roofing business.

-- ============================================================================
-- PART 1 — ROLE PERMISSIONS TABLE
-- ============================================================================
-- Defines what each role can do

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL UNIQUE,
  can_view_leads boolean DEFAULT false,
  can_manage_campaigns boolean DEFAULT false,
  can_send_emails boolean DEFAULT false,
  can_assign_jobs boolean DEFAULT false,
  can_view_revenue boolean DEFAULT false,
  can_manage_team boolean DEFAULT false,
  can_manage_crews boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for role lookups
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions(role);

-- Seed default permissions
INSERT INTO public.role_permissions (role, can_view_leads, can_manage_campaigns, can_send_emails, can_assign_jobs, can_view_revenue, can_manage_team, can_manage_crews)
VALUES
  ('owner', true, true, true, true, true, true, true),
  ('admin', true, true, true, true, true, true, true),
  ('sales', true, false, true, false, false, false, false),
  ('estimator', true, false, false, true, false, false, false),
  ('production', false, false, false, true, false, false, true)
ON CONFLICT (role) DO UPDATE SET
  can_view_leads = EXCLUDED.can_view_leads,
  can_manage_campaigns = EXCLUDED.can_manage_campaigns,
  can_send_emails = EXCLUDED.can_send_emails,
  can_assign_jobs = EXCLUDED.can_assign_jobs,
  can_view_revenue = EXCLUDED.can_view_revenue,
  can_manage_team = EXCLUDED.can_manage_team,
  can_manage_crews = EXCLUDED.can_manage_crews;

COMMENT ON TABLE public.role_permissions IS 'Role-based permissions for roofing company team members (Block 110000)';

-- ============================================================================
-- PART 2 — TEAM INVITES TABLE
-- ============================================================================
-- Handles invitations to join roofing companies

CREATE TABLE IF NOT EXISTS public.roofing_team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'sales', 'estimator', 'production')),
  token text NOT NULL UNIQUE,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_team_invites_company ON public.roofing_team_invites(roofing_company_id, status);
CREATE INDEX IF NOT EXISTS idx_roofing_team_invites_token ON public.roofing_team_invites(token) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_roofing_team_invites_email ON public.roofing_team_invites(email, status);

COMMENT ON TABLE public.roofing_team_invites IS 'Team member invitations for roofing companies (Block 110000)';

-- ============================================================================
-- PART 3 — ADD ASSIGNED_TO TO LEADS
-- ============================================================================
-- Allows leads to be assigned to specific team members

ALTER TABLE IF EXISTS public.leads
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON public.leads(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_company_assigned ON public.leads(roofing_company_id, assigned_to) WHERE roofing_company_id IS NOT NULL;

COMMENT ON COLUMN public.leads.assigned_to IS 'Block 110000: Team member assigned to this lead';

-- ============================================================================
-- PART 4 — ENHANCE CREWS TABLE FOR ROOFING COMPANIES
-- ============================================================================
-- Link crews to roofing companies (in addition to workspace_id if it exists)

ALTER TABLE IF EXISTS public.crews
  ADD COLUMN IF NOT EXISTS roofing_company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_crews_roofing_company ON public.crews(roofing_company_id) WHERE roofing_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crews_company_active ON public.crews(roofing_company_id, is_active) WHERE roofing_company_id IS NOT NULL;

COMMENT ON COLUMN public.crews.roofing_company_id IS 'Block 110000: Link crew to roofing company';

-- ============================================================================
-- PART 5 — CREW ASSIGNMENTS TABLE
-- ============================================================================
-- Assigns jobs to crews with scheduling

CREATE TABLE IF NOT EXISTS public.crew_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  scheduled_date date,
  scheduled_start_time time,
  scheduled_end_time time,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  notes text,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Support both roofing_jobs and jobs tables
-- First try roofing_jobs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    ALTER TABLE IF EXISTS public.crew_assignments
      ADD COLUMN IF NOT EXISTS roofing_job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_crew_assignments_roofing_job ON public.crew_assignments(roofing_job_id);
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    ALTER TABLE IF EXISTS public.crew_assignments
      ADD COLUMN IF NOT EXISTS job_id_alt uuid REFERENCES public.jobs(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_crew_assignments_job_alt ON public.crew_assignments(job_id_alt);
  END IF;
END $$;

-- If job_id column exists, make it flexible
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'crew_assignments' 
    AND column_name = 'job_id'
  ) THEN
    -- job_id is already there, just ensure it can reference either table
    -- We'll handle this at application level
    NULL;
  ELSE
    -- Create job_id as text to be flexible
    ALTER TABLE public.crew_assignments ADD COLUMN job_id uuid;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crew_assignments_crew ON public.crew_assignments(crew_id, status);
CREATE INDEX IF NOT EXISTS idx_crew_assignments_scheduled_date ON public.crew_assignments(scheduled_date) WHERE scheduled_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crew_assignments_status ON public.crew_assignments(status);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_crew_assignments_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_crew_assignments_updated_at ON public.crew_assignments;
CREATE TRIGGER trg_crew_assignments_updated_at
BEFORE UPDATE ON public.crew_assignments
FOR EACH ROW EXECUTE FUNCTION public.set_crew_assignments_updated_at();

COMMENT ON TABLE public.crew_assignments IS 'Crew job assignments with scheduling (Block 110000)';

-- ============================================================================
-- PART 6 — TEAM ACTIVITY LOG
-- ============================================================================
-- Tracks what each team member does

CREATE TABLE IF NOT EXISTS public.team_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity_type text, -- 'lead', 'campaign', 'job', 'crew', etc.
  entity_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_activity_user ON public.team_activity(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_activity_company ON public.team_activity(roofing_company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_activity_action ON public.team_activity(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_activity_entity ON public.team_activity(entity_type, entity_id) WHERE entity_type IS NOT NULL AND entity_id IS NOT NULL;

COMMENT ON TABLE public.team_activity IS 'Activity log for team member actions (Block 110000)';

-- ============================================================================
-- PART 7 — HELPER FUNCTIONS
-- ============================================================================

-- Function: Check if user has permission
CREATE OR REPLACE FUNCTION public.user_has_permission(
  p_user_id uuid,
  p_roofing_company_id uuid,
  p_permission text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_role text;
  v_has_permission boolean;
BEGIN
  -- Get user's role in the company
  SELECT role INTO v_role
  FROM public.roofing_company_members
  WHERE user_id = p_user_id
    AND roofing_company_id = p_roofing_company_id
    AND is_active = true
  LIMIT 1;

  IF v_role IS NULL THEN
    RETURN false;
  END IF;

  -- Check permission
  SELECT CASE p_permission
    WHEN 'can_view_leads' THEN can_view_leads
    WHEN 'can_manage_campaigns' THEN can_manage_campaigns
    WHEN 'can_send_emails' THEN can_send_emails
    WHEN 'can_assign_jobs' THEN can_assign_jobs
    WHEN 'can_view_revenue' THEN can_view_revenue
    WHEN 'can_manage_team' THEN can_manage_team
    WHEN 'can_manage_crews' THEN can_manage_crews
    ELSE false
  END INTO v_has_permission
  FROM public.role_permissions
  WHERE role = v_role;

  RETURN COALESCE(v_has_permission, false);
END;
$$;

COMMENT ON FUNCTION public.user_has_permission IS 'Block 110000: Check if user has a specific permission in a roofing company';

-- Function: Get user's role in company
CREATE OR REPLACE FUNCTION public.get_user_company_role(
  p_user_id uuid,
  p_roofing_company_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role
  FROM public.roofing_company_members
  WHERE user_id = p_user_id
    AND roofing_company_id = p_roofing_company_id
    AND is_active = true
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_user_company_role IS 'Block 110000: Get user role in a roofing company';

-- ============================================================================
-- PART 8 — RLS POLICIES
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE IF EXISTS public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.roofing_team_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.crew_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.team_activity ENABLE ROW LEVEL SECURITY;

-- Role permissions: readable by all authenticated users
DROP POLICY IF EXISTS "role_permissions_read" ON public.role_permissions;
CREATE POLICY "role_permissions_read" ON public.role_permissions
  FOR SELECT
  TO authenticated
  USING (true);

-- Team invites: readable by company members
DROP POLICY IF EXISTS "roofing_team_invites_read" ON public.roofing_team_invites;
CREATE POLICY "roofing_team_invites_read" ON public.roofing_team_invites
  FOR SELECT
  TO authenticated
  USING (
    roofing_company_id IN (
      SELECT roofing_company_id
      FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Team invites: writable by owners/admins
DROP POLICY IF EXISTS "roofing_team_invites_write" ON public.roofing_team_invites;
CREATE POLICY "roofing_team_invites_write" ON public.roofing_team_invites
  FOR ALL
  TO authenticated
  USING (
    roofing_company_id IN (
      SELECT roofing_company_id
      FROM public.roofing_company_members
      WHERE user_id = auth.uid() 
        AND is_active = true
        AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    roofing_company_id IN (
      SELECT roofing_company_id
      FROM public.roofing_company_members
      WHERE user_id = auth.uid() 
        AND is_active = true
        AND role IN ('owner', 'admin')
    )
  );

-- Crew assignments: readable by company members
DROP POLICY IF EXISTS "crew_assignments_read" ON public.crew_assignments;
CREATE POLICY "crew_assignments_read" ON public.crew_assignments
  FOR SELECT
  TO authenticated
  USING (
    crew_id IN (
      SELECT c.id
      FROM public.crews c
      JOIN public.roofing_company_members rcm ON rcm.roofing_company_id = c.roofing_company_id
      WHERE rcm.user_id = auth.uid() AND rcm.is_active = true
    )
  );

-- Crew assignments: writable by production managers and above
DROP POLICY IF EXISTS "crew_assignments_write" ON public.crew_assignments;
CREATE POLICY "crew_assignments_write" ON public.crew_assignments
  FOR ALL
  TO authenticated
  USING (
    crew_id IN (
      SELECT c.id
      FROM public.crews c
      JOIN public.roofing_company_members rcm ON rcm.roofing_company_id = c.roofing_company_id
      WHERE rcm.user_id = auth.uid() 
        AND rcm.is_active = true
        AND rcm.role IN ('owner', 'admin', 'production')
    )
  )
  WITH CHECK (
    crew_id IN (
      SELECT c.id
      FROM public.crews c
      JOIN public.roofing_company_members rcm ON rcm.roofing_company_id = c.roofing_company_id
      WHERE rcm.user_id = auth.uid() 
        AND rcm.is_active = true
        AND rcm.role IN ('owner', 'admin', 'production')
    )
  );

-- Team activity: readable by company members
DROP POLICY IF EXISTS "team_activity_read" ON public.team_activity;
CREATE POLICY "team_activity_read" ON public.team_activity
  FOR SELECT
  TO authenticated
  USING (
    roofing_company_id IN (
      SELECT roofing_company_id
      FROM public.roofing_company_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Team activity: writable by service role and triggers
DROP POLICY IF EXISTS "team_activity_write" ON public.team_activity;
CREATE POLICY "team_activity_write" ON public.team_activity
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to insert their own activity
DROP POLICY IF EXISTS "team_activity_insert_own" ON public.team_activity;
CREATE POLICY "team_activity_insert_own" ON public.team_activity
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- PART 9 — TRIGGERS FOR ACTIVITY LOGGING
-- ============================================================================

-- Function to log lead assignment
CREATE OR REPLACE FUNCTION public.log_lead_assignment()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND (OLD.assigned_to IS NULL OR OLD.assigned_to != NEW.assigned_to) THEN
    INSERT INTO public.team_activity (
      user_id,
      roofing_company_id,
      action,
      entity_type,
      entity_id,
      metadata
    )
    SELECT
      auth.uid(),
      NEW.roofing_company_id,
      'assigned_lead',
      'lead',
      NEW.id,
      jsonb_build_object(
        'assigned_to', NEW.assigned_to,
        'lead_email', NEW.email,
        'lead_name', COALESCE(NEW.name, NEW.first_name || ' ' || NEW.last_name)
      )
    WHERE NEW.roofing_company_id IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_lead_assignment ON public.leads;
CREATE TRIGGER trg_log_lead_assignment
AFTER UPDATE OF assigned_to ON public.leads
FOR EACH ROW
WHEN (NEW.assigned_to IS DISTINCT FROM OLD.assigned_to)
EXECUTE FUNCTION public.log_lead_assignment();

COMMENT ON FUNCTION public.log_lead_assignment IS 'Block 110000: Log lead assignment activity';


























