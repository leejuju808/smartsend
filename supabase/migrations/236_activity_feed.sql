-- Block 222 — Team Collaboration v1
-- Activity Feed table for tracking team actions

CREATE TABLE IF NOT EXISTS public.activity_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  type text NOT NULL,
  metadata jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_feed_workspace ON public.activity_feed(workspace_id);
CREATE INDEX IF NOT EXISTS idx_activity_feed_type ON public.activity_feed(type);
CREATE INDEX IF NOT EXISTS idx_activity_feed_created_at ON public.activity_feed(workspace_id, created_at DESC);

-- RLS Policies
ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_feed_select"
ON public.activity_feed
FOR SELECT
TO authenticated
USING (workspace_id = (auth.jwt()->>'workspace_id')::uuid);

CREATE POLICY "activity_feed_insert"
ON public.activity_feed
FOR INSERT
TO authenticated
WITH CHECK (workspace_id = (auth.jwt()->>'workspace_id')::uuid);










