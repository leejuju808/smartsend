-- Block 224 — Team Analytics v1
-- User metrics table for tracking per-user performance

CREATE TABLE IF NOT EXISTS public.user_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,

  emails_sent int DEFAULT 0,
  replies_received int DEFAULT 0,
  meetings_booked int DEFAULT 0,
  opens int DEFAULT 0,
  clicks int DEFAULT 0,

  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_metrics_unique
ON public.user_metrics(user_id, workspace_id);

-- Index for workspace queries
CREATE INDEX IF NOT EXISTS idx_user_metrics_workspace ON public.user_metrics(workspace_id);

-- Enable RLS
ALTER TABLE public.user_metrics ENABLE ROW LEVEL SECURITY;

-- RLS: Users can read metrics for their workspace
CREATE POLICY "user_metrics_select" ON public.user_metrics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = user_metrics.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Service role can manage all metrics (for triggers/edge functions)
CREATE POLICY "user_metrics_service_role" ON public.user_metrics
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);










