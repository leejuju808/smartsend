-- Block 243: Team Members v1
-- Team Members table for workspace-based team management

CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id, email)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_team_members_workspace ON public.team_members(workspace_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email ON public.team_members(email);
CREATE INDEX IF NOT EXISTS idx_team_members_status ON public.team_members(status);

-- Enable RLS
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Team members can view members of their workspace
CREATE POLICY "team_members: select workspace members"
  ON public.team_members FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Owners/admins can manage team members
CREATE POLICY "team_members: manage by owner/admin"
  ON public.team_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.workspace_id = team_members.workspace_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
        AND tm.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.workspace_id = team_members.workspace_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
        AND tm.status = 'active'
    )
  );

-- Function to refresh seats based on team_members (active members only)
CREATE OR REPLACE FUNCTION public.refresh_workspace_seats_from_team_members(_ws uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.billing_subscriptions b
  SET seats_in_use = (
    SELECT COUNT(*) FROM public.team_members tm 
    WHERE tm.workspace_id = _ws AND tm.status = 'active'
  ),
  updated_at = now()
  WHERE b.workspace_id = _ws;
$$;

-- Function to decrement seat count when member is removed
CREATE OR REPLACE FUNCTION public.decrement_seat_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Refresh seats count for the workspace
  PERFORM public.refresh_workspace_seats_from_team_members(OLD.workspace_id);
  -- Also call the existing function if it exists (for backward compatibility)
  BEGIN
    PERFORM public.refresh_workspace_seats(OLD.workspace_id);
  EXCEPTION WHEN OTHERS THEN
    -- Function might not exist, ignore
  END;
  RETURN OLD;
END;
$$;

-- Trigger to refresh seats on member deletion
DROP TRIGGER IF EXISTS trg_team_members_decrement_seats ON public.team_members;
CREATE TRIGGER trg_team_members_decrement_seats
  AFTER DELETE ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.decrement_seat_count();

-- Trigger to refresh seats on member status change to active
CREATE OR REPLACE FUNCTION public.increment_seat_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Only increment if status changed to active
  IF NEW.status = 'active' AND (OLD.status IS NULL OR OLD.status != 'active') THEN
    PERFORM public.refresh_workspace_seats_from_team_members(NEW.workspace_id);
    -- Also call the existing function if it exists (for backward compatibility)
    BEGIN
      PERFORM public.refresh_workspace_seats(NEW.workspace_id);
    EXCEPTION WHEN OTHERS THEN
      -- Function might not exist, ignore
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_team_members_increment_seats ON public.team_members;
CREATE TRIGGER trg_team_members_increment_seats
  AFTER INSERT OR UPDATE ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.increment_seat_count();

-- Grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;

-- Update is_workspace_member function to also check team_members
-- This ensures RLS policies for workspace data (campaigns, leads, etc.) work with team_members
CREATE OR REPLACE FUNCTION public.is_workspace_member(p_ws uuid, p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_ws AND user_id = p_uid
  ) OR EXISTS (
    SELECT 1 FROM public.team_members
    WHERE workspace_id = p_ws AND user_id = p_uid AND status = 'active'
  );
$$;

