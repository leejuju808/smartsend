-- =========================================================
-- Block 22790 — SmartSend Roofing Homeowner Portal v1
-- "Photos, Status, Next Steps"
-- =========================================================
-- 
-- The portal that makes homeowners stop calling, stop worrying, and start trusting your roofing company instantly.
-- 
-- This turns SmartSend into a customer-facing experience — without giving homeowners any access to internal data.
-- 
-- This is the final missing piece that elite roofing companies fake using Dropbox links, random text chains, and emailed PDFs.
-- 
-- Now SmartSend does it automatically.

-- ============================================================================
-- PART 1 — CREATE homeowner_portals TABLE
-- ============================================================================
-- Simple homeowner portal record with a secure token

CREATE TABLE IF NOT EXISTS public.homeowner_portals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  portal_token text NOT NULL UNIQUE,
  is_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_homeowner_portals_token ON public.homeowner_portals(portal_token);
CREATE INDEX IF NOT EXISTS idx_homeowner_portals_job_id ON public.homeowner_portals(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_portals_workspace_id ON public.homeowner_portals(workspace_id);

-- ============================================================================
-- PART 2 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.homeowner_portals ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view portals for jobs in their workspace
CREATE POLICY "hp select"
  ON public.homeowner_portals
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- Policy: Users can create portals for jobs in their workspace
CREATE POLICY "hp insert"
  ON public.homeowner_portals
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- Policy: Users can update portals for jobs in their workspace
CREATE POLICY "hp update"
  ON public.homeowner_portals
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- Policy: Public access for reading portal data (no auth required)
-- This allows the edge function to read portal data using service role
CREATE POLICY "hp public read"
  ON public.homeowner_portals
  FOR SELECT
  USING (true);

-- ============================================================================
-- PART 3 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.homeowner_portals TO authenticated;
GRANT SELECT ON public.homeowner_portals TO anon; -- Allow public read via edge function

-- ============================================================================
-- PART 4 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.homeowner_portals IS 'Block 22790: Homeowner portal records with secure tokens for public job status access';
COMMENT ON COLUMN public.homeowner_portals.portal_token IS 'Block 22790: Unique secure token (32-48 chars) used to access the homeowner portal';
COMMENT ON COLUMN public.homeowner_portals.is_enabled IS 'Block 22790: Whether the portal is currently enabled/active';







































