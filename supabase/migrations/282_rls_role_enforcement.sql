-- Block 265: Team Permissions v1 - RLS Role Enforcement
-- Migration 282: Update RLS policies to enforce role-based access (read-only restriction)

-- Helper function to check if user can modify workspace resources
-- Returns true if user is owner, admin, or member (but not read_only)
CREATE OR REPLACE FUNCTION public.can_modify_workspace_resource(p_workspace_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.workspace_id = p_workspace_id
      AND tm.user_id = p_user_id
      AND tm.role IN ('owner', 'admin', 'member')
      AND tm.status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = p_user_id
      AND wm.role IN ('owner', 'admin', 'member')
  );
$$;

-- Helper function to check if user can read workspace resources
-- Returns true for all workspace members (including read_only)
CREATE OR REPLACE FUNCTION public.can_read_workspace_resource(p_workspace_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.workspace_id = p_workspace_id
      AND tm.user_id = p_user_id
      AND tm.status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = p_user_id
  );
$$;

-- ============================================================================
-- CAMPAIGNS
-- ============================================================================
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "campaigns_select" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_insert" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_update" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_delete" ON public.campaigns;
DROP POLICY IF EXISTS "users select their campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "users insert their campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "users update their campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns tenant readers" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns insert" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns editors" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_read" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_insert" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_update" ON public.campaigns;

-- SELECT: All workspace members can read
CREATE POLICY "campaigns_select_workspace_member"
  ON public.campaigns FOR SELECT
  USING (can_read_workspace_resource(workspace_id));

-- INSERT/UPDATE/DELETE: Only non-read-only roles can modify
CREATE POLICY "campaigns_modify_non_readonly"
  ON public.campaigns FOR ALL
  USING (can_modify_workspace_resource(workspace_id))
  WITH CHECK (can_modify_workspace_resource(workspace_id));

-- ============================================================================
-- TEMPLATES
-- ============================================================================
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view shared or own templates" ON public.templates;
DROP POLICY IF EXISTS "Users can create templates in workspace" ON public.templates;
DROP POLICY IF EXISTS "Users can update own templates" ON public.templates;
DROP POLICY IF EXISTS "Users can delete own templates" ON public.templates;
DROP POLICY IF EXISTS "users read their templates" ON public.templates;
DROP POLICY IF EXISTS "users insert their templates" ON public.templates;
DROP POLICY IF EXISTS "users update their templates" ON public.templates;
DROP POLICY IF EXISTS "users delete their templates" ON public.templates;

-- SELECT: All workspace members can read
CREATE POLICY "templates_select_workspace_member"
  ON public.templates FOR SELECT
  USING (can_read_workspace_resource(workspace_id));

-- INSERT/UPDATE/DELETE: Only non-read-only roles can modify
CREATE POLICY "templates_modify_non_readonly"
  ON public.templates FOR ALL
  USING (can_modify_workspace_resource(workspace_id))
  WITH CHECK (can_modify_workspace_resource(workspace_id));

-- ============================================================================
-- SEGMENTS
-- ============================================================================
-- Check if segments table exists and has workspace_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'segments'
  ) THEN
    ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;

    -- Drop existing policies
    DROP POLICY IF EXISTS "segments_team_select" ON public.segments;
    DROP POLICY IF EXISTS "segments_team_insert" ON public.segments;
    DROP POLICY IF EXISTS "segments_team_update" ON public.segments;
    DROP POLICY IF EXISTS "segments_team_delete" ON public.segments;
    DROP POLICY IF EXISTS "teams can read their segments" ON public.segments;
    DROP POLICY IF EXISTS "teams can modify segments based on role" ON public.segments;

    -- SELECT: All workspace members can read
    EXECUTE format('CREATE POLICY "segments_select_workspace_member" ON public.segments FOR SELECT USING (can_read_workspace_resource(workspace_id))');

    -- INSERT/UPDATE/DELETE: Only non-read-only roles can modify
    EXECUTE format('CREATE POLICY "segments_modify_non_readonly" ON public.segments FOR ALL USING (can_modify_workspace_resource(workspace_id)) WITH CHECK (can_modify_workspace_resource(workspace_id))');
  END IF;
END $$;

-- ============================================================================
-- FOLLOWUP FLOWS
-- ============================================================================
-- Check if followup_flows table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'followup_flows'
  ) THEN
    ALTER TABLE public.followup_flows ENABLE ROW LEVEL SECURITY;

    -- Drop existing policies
    DROP POLICY IF EXISTS "followup_flows_select_workspace_member" ON public.followup_flows;
    DROP POLICY IF EXISTS "followup_flows_insert_workspace_member" ON public.followup_flows;
    DROP POLICY IF EXISTS "followup_flows_update_workspace_admin" ON public.followup_flows;
    DROP POLICY IF EXISTS "followup_flows_delete_workspace_admin" ON public.followup_flows;

    -- SELECT: All workspace members can read
    CREATE POLICY "followup_flows_select_workspace_member"
      ON public.followup_flows FOR SELECT
      USING (can_read_workspace_resource(workspace_id));

    -- INSERT/UPDATE/DELETE: Only non-read-only roles can modify
    CREATE POLICY "followup_flows_modify_non_readonly"
      ON public.followup_flows FOR ALL
      USING (can_modify_workspace_resource(workspace_id))
      WITH CHECK (can_modify_workspace_resource(workspace_id));
  END IF;
END $$;

-- ============================================================================
-- DEALS (if exists)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'deals'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'deals' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

    -- Drop existing policies
    DROP POLICY IF EXISTS "deals_select" ON public.deals;
    DROP POLICY IF EXISTS "deals_insert" ON public.deals;
    DROP POLICY IF EXISTS "deals_update" ON public.deals;
    DROP POLICY IF EXISTS "deals_delete" ON public.deals;

    -- SELECT: All workspace members can read
    CREATE POLICY "deals_select_workspace_member"
      ON public.deals FOR SELECT
      USING (can_read_workspace_resource(workspace_id));

    -- INSERT/UPDATE/DELETE: Only non-read-only roles can modify
    CREATE POLICY "deals_modify_non_readonly"
      ON public.deals FOR ALL
      USING (can_modify_workspace_resource(workspace_id))
      WITH CHECK (can_modify_workspace_resource(workspace_id));
  END IF;
END $$;









