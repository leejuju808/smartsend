-- =========================================================
-- Block 20840 — SmartSend Roofing Team Permissions v1
-- (Roles: Owner • Sales Rep • Office Staff • Adjuster Helper)
-- =========================================================
--
-- This block makes SmartSend feel like a real system a roofing company 
-- can run a team on, not just a solo tool.
--
-- Owner-led roofing companies usually have:
-- - Owner
-- - 1–3 sales reps
-- - 1 office admin
-- - Sometimes someone who "helps with insurance"
--
-- If everyone sees everything and can click everything → chaos, mistakes, and risk.
-- 20840 gives clean roles + access that match how roofing companies actually work.
-- =========================================================

-- ============================================================================
-- PART 1 — Create Role Enum
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE roofing_team_role AS ENUM (
    'OWNER',
    'SALES_REP',
    'OFFICE_STAFF',
    'ADJUSTER_HELPER'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE roofing_team_role IS 'Team roles for roofing companies: OWNER (full control), SALES_REP (assigned leads only), OFFICE_STAFF (scheduling/coordination), ADJUSTER_HELPER (insurance/supplements)';

-- ============================================================================
-- PART 2 — Create organization_users Table (or update org_memberships)
-- ============================================================================

-- We'll use org_memberships but add a new role column for roofing-specific roles
-- First, check if we need to migrate existing roles

-- Add roofing_role column to org_memberships (nullable, defaults to OWNER for existing owners)
ALTER TABLE IF EXISTS public.org_memberships
  ADD COLUMN IF NOT EXISTS roofing_role roofing_team_role;

-- Migrate existing roles to roofing roles
-- owner/admin -> OWNER, member -> SALES_REP (default, can be changed)
DO $$
BEGIN
  UPDATE public.org_memberships
  SET roofing_role = CASE
    WHEN role IN ('owner', 'admin') THEN 'OWNER'::roofing_team_role
    WHEN role = 'member' THEN 'SALES_REP'::roofing_team_role
    ELSE 'SALES_REP'::roofing_team_role
  END
  WHERE roofing_role IS NULL;
END $$;

-- Set default for new rows
ALTER TABLE IF EXISTS public.org_memberships
  ALTER COLUMN roofing_role SET DEFAULT 'SALES_REP'::roofing_team_role;

-- Create index for role lookups
CREATE INDEX IF NOT EXISTS idx_org_memberships_roofing_role 
  ON public.org_memberships(org_id, roofing_role) 
  WHERE status = 'active';

COMMENT ON COLUMN public.org_memberships.roofing_role IS 'Roofing-specific role: OWNER, SALES_REP, OFFICE_STAFF, ADJUSTER_HELPER';

-- ============================================================================
-- PART 3 — Add Lead Assignment to Leads and Roofing Jobs
-- ============================================================================

-- Add assigned_user_id to leads table
ALTER TABLE IF EXISTS public.leads
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_assigned_user 
  ON public.leads(org_id, assigned_user_id) 
  WHERE assigned_user_id IS NOT NULL;

COMMENT ON COLUMN public.leads.assigned_user_id IS 'Sales rep assigned to this lead (for SALES_REP role filtering)';

-- Add assigned_user_id to roofing_jobs table
ALTER TABLE IF EXISTS public.roofing_jobs
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_roofing_jobs_assigned_user 
  ON public.roofing_jobs(assigned_user_id) 
  WHERE assigned_user_id IS NOT NULL;

COMMENT ON COLUMN public.roofing_jobs.assigned_user_id IS 'Sales rep assigned to this job (for SALES_REP role filtering)';

-- Sync assigned_user_id from leads to roofing_jobs when job is created/updated
CREATE OR REPLACE FUNCTION public.sync_job_assigned_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If job has a lead_id, sync assigned_user_id from lead
  IF NEW.lead_id IS NOT NULL AND (NEW.assigned_user_id IS NULL OR OLD.assigned_user_id IS DISTINCT FROM NEW.assigned_user_id) THEN
    SELECT assigned_user_id INTO NEW.assigned_user_id
    FROM public.leads
    WHERE id = NEW.lead_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_job_assigned_user ON public.roofing_jobs;
CREATE TRIGGER trg_sync_job_assigned_user
BEFORE INSERT OR UPDATE OF lead_id ON public.roofing_jobs
FOR EACH ROW
EXECUTE FUNCTION public.sync_job_assigned_user();

-- ============================================================================
-- PART 4 — Permission Helper Functions
-- ============================================================================

-- Get current user's role in an organization
CREATE OR REPLACE FUNCTION public.get_user_roofing_role(p_org_id uuid)
RETURNS roofing_team_role
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT roofing_role
  FROM public.org_memberships
  WHERE org_id = p_org_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;
$$;

-- Check if user can view a lead
CREATE OR REPLACE FUNCTION public.can_view_lead(p_lead_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_assigned_user_id uuid;
  v_user_role roofing_team_role;
BEGIN
  -- Get lead's org and assigned user
  SELECT org_id, assigned_user_id INTO v_org_id, v_assigned_user_id
  FROM public.leads
  WHERE id = p_lead_id;
  
  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;
  
  -- Get user's role
  v_user_role := public.get_user_roofing_role(v_org_id);
  
  -- OWNER and OFFICE_STAFF can view all leads
  IF v_user_role IN ('OWNER', 'OFFICE_STAFF', 'ADJUSTER_HELPER') THEN
    RETURN true;
  END IF;
  
  -- SALES_REP can only view assigned leads
  IF v_user_role = 'SALES_REP' THEN
    RETURN v_assigned_user_id = auth.uid();
  END IF;
  
  RETURN false;
END;
$$;

-- Check if user can send proposals
CREATE OR REPLACE FUNCTION public.can_send_proposal(p_thread_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_assigned_user_id uuid;
  v_user_role roofing_team_role;
BEGIN
  -- Get thread's org and assigned user
  SELECT t.campaign_id, l.assigned_user_id INTO v_org_id, v_assigned_user_id
  FROM public.inbox_threads t
  LEFT JOIN public.leads l ON l.id = t.lead_id
  WHERE t.id = p_thread_id;
  
  -- Get org_id from campaign if needed
  IF v_org_id IS NOT NULL THEN
    SELECT org_id INTO v_org_id
    FROM public.campaigns
    WHERE id = v_org_id;
  END IF;
  
  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;
  
  v_user_role := public.get_user_roofing_role(v_org_id);
  
  -- OWNER and SALES_REP (if assigned) can send proposals
  IF v_user_role = 'OWNER' THEN
    RETURN true;
  END IF;
  
  IF v_user_role = 'SALES_REP' THEN
    RETURN v_assigned_user_id = auth.uid();
  END IF;
  
  -- OFFICE_STAFF can send homeowner emails (limited proposals)
  IF v_user_role = 'OFFICE_STAFF' THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- Check if user can send adjuster emails
CREATE OR REPLACE FUNCTION public.can_send_adjuster_email(p_thread_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_user_role roofing_team_role;
BEGIN
  -- Get thread's org
  SELECT c.org_id INTO v_org_id
  FROM public.inbox_threads t
  LEFT JOIN public.campaigns c ON c.id = t.campaign_id
  WHERE t.id = p_thread_id;
  
  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;
  
  v_user_role := public.get_user_roofing_role(v_org_id);
  
  -- Only OWNER can send adjuster emails (ADJUSTER_HELPER can draft but not send in v1)
  RETURN v_user_role = 'OWNER';
END;
$$;

-- Check if user can update job stage
CREATE OR REPLACE FUNCTION public.can_update_job_stage(p_job_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_assigned_user_id uuid;
  v_user_role roofing_team_role;
BEGIN
  -- Get job's org and assigned user
  SELECT 
    COALESCE(l.org_id, c.org_id),
    rj.assigned_user_id
  INTO v_org_id, v_assigned_user_id
  FROM public.roofing_jobs rj
  LEFT JOIN public.leads l ON l.id = rj.lead_id
  LEFT JOIN public.campaigns c ON c.id = rj.campaign_id
  WHERE rj.id = p_job_id;
  
  IF v_org_id IS NULL THEN
    RETURN false;
  END IF;
  
  v_user_role := public.get_user_roofing_role(v_org_id);
  
  -- OWNER can update any job
  IF v_user_role = 'OWNER' THEN
    RETURN true;
  END IF;
  
  -- SALES_REP can update their assigned jobs
  IF v_user_role = 'SALES_REP' THEN
    RETURN v_assigned_user_id = auth.uid();
  END IF;
  
  -- OFFICE_STAFF can update to SCHEDULED_INSTALL and COMPLETED
  IF v_user_role = 'OFFICE_STAFF' THEN
    RETURN true; -- Stage restrictions enforced in API layer
  END IF;
  
  RETURN false;
END;
$$;

-- Check if user can view revenue dashboard
CREATE OR REPLACE FUNCTION public.can_view_revenue_dashboard(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.get_user_roofing_role(p_org_id) = 'OWNER';
$$;

-- Check if user can manage team
CREATE OR REPLACE FUNCTION public.can_manage_team(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.get_user_roofing_role(p_org_id) = 'OWNER';
$$;

-- Check if user can manage billing
CREATE OR REPLACE FUNCTION public.can_manage_billing(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT public.get_user_roofing_role(p_org_id) = 'OWNER';
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_user_roofing_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_lead(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_send_proposal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_send_adjuster_email(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_update_job_stage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_revenue_dashboard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_team(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_billing(uuid) TO authenticated;

-- ============================================================================
-- PART 5 — Update RLS Policies for Role-Based Access
-- ============================================================================

-- Note: RLS policies will be enforced at the API layer primarily,
-- but we can add database-level filtering for performance

-- Helper function to check if user is org member with any role
CREATE OR REPLACE FUNCTION public.is_org_member_roofing(check_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT exists(
    SELECT 1 FROM public.org_memberships
    WHERE org_id = check_org 
      AND user_id = auth.uid() 
      AND status = 'active'
  );
$$;

-- ============================================================================
-- PART 6 — Comments
-- ============================================================================

COMMENT ON FUNCTION public.get_user_roofing_role(uuid) IS 'Returns current user''s roofing role in the specified organization';
COMMENT ON FUNCTION public.can_view_lead(uuid) IS 'Checks if current user can view a specific lead based on their role';
COMMENT ON FUNCTION public.can_send_proposal(uuid) IS 'Checks if current user can send proposals for a thread';
COMMENT ON FUNCTION public.can_send_adjuster_email(uuid) IS 'Checks if current user can send adjuster emails (OWNER only in v1)';
COMMENT ON FUNCTION public.can_update_job_stage(uuid) IS 'Checks if current user can update job stage';
COMMENT ON FUNCTION public.can_view_revenue_dashboard(uuid) IS 'Checks if current user can view revenue dashboard (OWNER only)';
COMMENT ON FUNCTION public.can_manage_team(uuid) IS 'Checks if current user can manage team members (OWNER only)';
COMMENT ON FUNCTION public.can_manage_billing(uuid) IS 'Checks if current user can manage billing (OWNER only)';

