-- Block 265: Team Permissions v1 - Workspace Invites Table
-- Migration 281: Create workspace_invites table for token-based invite flow

CREATE TABLE IF NOT EXISTS public.workspace_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'read_only')),
  token text NOT NULL UNIQUE,
  accepted boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_workspace_invites_workspace ON public.workspace_invites(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_email ON public.workspace_invites(email);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_token ON public.workspace_invites(token);
CREATE INDEX IF NOT EXISTS idx_workspace_invites_expires ON public.workspace_invites(expires_at);

-- Enable RLS
ALTER TABLE public.workspace_invites ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Workspace members can view invites for their workspace
CREATE POLICY "workspace_invites: select workspace invites"
  ON public.workspace_invites FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid() AND status = 'active'
    )
  );

-- RLS Policy: Owners/admins can manage invites
CREATE POLICY "workspace_invites: manage by owner/admin"
  ON public.workspace_invites FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.workspace_id = workspace_invites.workspace_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
        AND tm.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.workspace_id = workspace_invites.workspace_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
        AND tm.status = 'active'
    )
  );

-- Grant access
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspace_invites TO authenticated;









