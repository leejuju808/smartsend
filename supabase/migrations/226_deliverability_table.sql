-- Block 215 — Deliverability Diagnostics v1
-- Creates deliverability_reports table for storing scan results per workspace

CREATE TABLE IF NOT EXISTS public.deliverability_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  score int DEFAULT 0,
  dmarc_pass boolean,
  spf_pass boolean,
  dkim_pass boolean,
  spam_words jsonb,
  warmup_recommended boolean,
  inbox_placement jsonb,  -- seed test results
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deliverability_workspace ON public.deliverability_reports(workspace_id);
CREATE INDEX IF NOT EXISTS idx_deliverability_created_at ON public.deliverability_reports(created_at DESC);

-- Enable RLS
ALTER TABLE public.deliverability_reports ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "workspace_members_can_view_deliverability_reports"
ON public.deliverability_reports
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = deliverability_reports.workspace_id
    AND user_id = auth.uid()
  )
);

CREATE POLICY "service_role_full_access_deliverability_reports"
ON public.deliverability_reports
FOR ALL
TO service_role
USING (true) WITH CHECK (true);










