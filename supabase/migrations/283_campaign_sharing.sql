-- Block 266: Campaign Sharing v1
-- Team-Wide Campaign Visibility, Ownership, and Access Controls
-- Migration 283: Add owner_id and visibility columns, update RLS policies

-- ============================================================================
-- 1. ADD COLUMNS TO CAMPAIGNS TABLE
-- ============================================================================

-- Add owner_id column (references auth.users)
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add visibility column with default 'workspace'
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'workspace' 
  CHECK (visibility IN ('workspace', 'restricted'));

-- Create index for owner_id lookups
CREATE INDEX IF NOT EXISTS idx_campaigns_owner_id ON public.campaigns(owner_id);

-- Create index for visibility filtering
CREATE INDEX IF NOT EXISTS idx_campaigns_visibility ON public.campaigns(visibility);

-- Set owner_id for existing campaigns (use user_id if exists, otherwise creator)
DO $$
BEGIN
  -- If campaigns table has user_id column, use it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'campaigns' AND column_name = 'user_id'
  ) THEN
    UPDATE public.campaigns
    SET owner_id = user_id
    WHERE owner_id IS NULL AND user_id IS NOT NULL;
  END IF;
  
  -- For campaigns without user_id, try to infer from created_by or leave NULL
  -- (NULL owner_id means workspace owner/admin can manage)
END $$;

-- ============================================================================
-- 2. HELPER FUNCTIONS FOR CAMPAIGN ACCESS CONTROL
-- ============================================================================

-- Function to check if user is campaign owner
CREATE OR REPLACE FUNCTION public.is_campaign_owner(p_campaign_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = p_campaign_id
      AND c.owner_id = p_user_id
  );
$$;

-- Function to check if user is workspace owner or admin
CREATE OR REPLACE FUNCTION public.is_workspace_owner_or_admin(p_workspace_id uuid, p_user_id uuid DEFAULT auth.uid())
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
      AND tm.role IN ('owner', 'admin')
      AND tm.status = 'active'
  ) OR EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = p_user_id
      AND wm.role IN ('owner', 'admin')
  );
$$;

-- Function to check if user can read a campaign (respects visibility)
CREATE OR REPLACE FUNCTION public.can_read_campaign(p_campaign_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = p_campaign_id
      AND (
        -- Workspace visibility: all workspace members can read
        (c.visibility = 'workspace' AND can_read_workspace_resource(c.workspace_id, p_user_id))
        OR
        -- Restricted visibility: only owner, workspace owner/admin can read
        (
          c.visibility = 'restricted' 
          AND (
            c.owner_id = p_user_id
            OR is_workspace_owner_or_admin(c.workspace_id, p_user_id)
          )
        )
      )
  );
$$;

-- Function to check if user can write/edit a campaign
CREATE OR REPLACE FUNCTION public.can_write_campaign(p_campaign_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = p_campaign_id
      AND can_modify_workspace_resource(c.workspace_id, p_user_id)
      AND (
        -- Campaign owner can edit
        c.owner_id = p_user_id
        OR
        -- Workspace owner/admin can edit any campaign
        is_workspace_owner_or_admin(c.workspace_id, p_user_id)
      )
  );
$$;

-- ============================================================================
-- 3. UPDATE RLS POLICIES FOR CAMPAIGNS
-- ============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS "campaigns_select_workspace_member" ON public.campaigns;
DROP POLICY IF EXISTS "campaigns_modify_non_readonly" ON public.campaigns;
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

-- READ: Respect visibility settings
CREATE POLICY "campaigns_read_with_visibility"
  ON public.campaigns FOR SELECT
  USING (can_read_campaign(id));

-- INSERT: Workspace members with write permissions can create campaigns
-- owner_id defaults to creator (set via trigger or application logic)
CREATE POLICY "campaigns_insert_workspace_member"
  ON public.campaigns FOR INSERT
  WITH CHECK (
    can_modify_workspace_resource(workspace_id)
    AND (
      -- Creator becomes owner by default
      owner_id = auth.uid()
      OR owner_id IS NULL  -- Allow NULL, will be set by trigger
    )
  );

-- UPDATE: Campaign owner OR workspace owner/admin can update
CREATE POLICY "campaigns_update_owner_or_admin"
  ON public.campaigns FOR UPDATE
  USING (can_write_campaign(id))
  WITH CHECK (can_write_campaign(id));

-- DELETE: Campaign owner OR workspace owner/admin can delete
CREATE POLICY "campaigns_delete_owner_or_admin"
  ON public.campaigns FOR DELETE
  USING (
    can_modify_workspace_resource(workspace_id)
    AND (
      owner_id = auth.uid()
      OR is_workspace_owner_or_admin(workspace_id)
    )
  );

-- ============================================================================
-- 4. TRIGGER TO SET OWNER_ID ON INSERT
-- ============================================================================

-- Function to set owner_id to creator if not provided
CREATE OR REPLACE FUNCTION public.set_campaign_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If owner_id is NULL, set it to the current user
  IF NEW.owner_id IS NULL THEN
    NEW.owner_id := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_set_campaign_owner ON public.campaigns;
CREATE TRIGGER trg_set_campaign_owner
  BEFORE INSERT ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.set_campaign_owner();

-- ============================================================================
-- 5. AUDIT LOG TABLE FOR OWNERSHIP CHANGES (Optional but recommended)
-- ============================================================================

-- Create campaign_audit_log table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.campaign_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  action text NOT NULL, -- 'owner_changed', 'visibility_changed', etc.
  old_value jsonb,
  new_value jsonb,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_audit_log_campaign ON public.campaign_audit_log(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_audit_log_created_at ON public.campaign_audit_log(created_at DESC);

-- Enable RLS on audit log
ALTER TABLE public.campaign_audit_log ENABLE ROW LEVEL SECURITY;

-- Policy: Workspace members can read audit logs for campaigns they can read
CREATE POLICY "campaign_audit_log_read"
  ON public.campaign_audit_log FOR SELECT
  USING (can_read_campaign(campaign_id));

-- Policy: System can insert audit logs (via service role or triggers)
CREATE POLICY "campaign_audit_log_insert"
  ON public.campaign_audit_log FOR INSERT
  WITH CHECK (true);  -- Will be restricted by service role usage

-- ============================================================================
-- 6. TRIGGER TO LOG OWNERSHIP CHANGES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_campaign_ownership_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log owner_id changes
  IF OLD.owner_id IS DISTINCT FROM NEW.owner_id THEN
    INSERT INTO public.campaign_audit_log (
      campaign_id,
      action,
      old_value,
      new_value,
      changed_by
    ) VALUES (
      NEW.id,
      'owner_changed',
      jsonb_build_object('owner_id', OLD.owner_id),
      jsonb_build_object('owner_id', NEW.owner_id),
      auth.uid()
    );
  END IF;
  
  -- Log visibility changes
  IF OLD.visibility IS DISTINCT FROM NEW.visibility THEN
    INSERT INTO public.campaign_audit_log (
      campaign_id,
      action,
      old_value,
      new_value,
      changed_by
    ) VALUES (
      NEW.id,
      'visibility_changed',
      jsonb_build_object('visibility', OLD.visibility),
      jsonb_build_object('visibility', NEW.visibility),
      auth.uid()
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_log_campaign_changes ON public.campaigns;
CREATE TRIGGER trg_log_campaign_changes
  AFTER UPDATE ON public.campaigns
  FOR EACH ROW
  WHEN (
    OLD.owner_id IS DISTINCT FROM NEW.owner_id
    OR OLD.visibility IS DISTINCT FROM NEW.visibility
  )
  EXECUTE FUNCTION public.log_campaign_ownership_change();

-- ============================================================================
-- 7. GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT SELECT ON public.campaign_audit_log TO authenticated;









