-- =========================================================
-- Block 11200 — SmartSend Lead Timeline v1
-- Lead Events Table for Complete Activity Tracking
-- =========================================================

-- Create lead_events table to track all SmartSend actions
CREATE TABLE IF NOT EXISTS public.lead_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  workspace_id uuid, -- Denormalized for easier querying
  type text NOT NULL CHECK (type IN (
    'email_sent',
    'followup_triggered',
    'reply_received',
    'classified',
    'followup_stopped',
    'note_added',
    'status_changed',
    'action_suggested'
  )),
  content text, -- Human-readable description
  metadata jsonb DEFAULT '{}'::jsonb, -- Flexible JSON for event-specific data
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_lead_events_lead_id ON public.lead_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_events_created_at ON public.lead_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_events_type ON public.lead_events(type);
CREATE INDEX IF NOT EXISTS idx_lead_events_workspace_id ON public.lead_events(workspace_id);

-- RLS Policies
ALTER TABLE public.lead_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read events for leads in their workspace
CREATE POLICY "Users can read lead events in their workspace"
ON public.lead_events
FOR SELECT
USING (
  workspace_id IN (
    SELECT workspace_id
    FROM public.workspace_members
    WHERE user_id = auth.uid()
  )
  OR workspace_id IN (
    SELECT id
    FROM public.workspaces
    WHERE owner_id = auth.uid()
  )
);

-- Policy: Users can insert events for leads in their workspace
CREATE POLICY "Users can insert lead events in their workspace"
ON public.lead_events
FOR INSERT
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id
    FROM public.workspace_members
    WHERE user_id = auth.uid()
  )
  OR workspace_id IN (
    SELECT id
    FROM public.workspaces
    WHERE owner_id = auth.uid()
  )
);

-- Helper function to log a lead event
CREATE OR REPLACE FUNCTION public.log_lead_event(
  p_lead_id uuid,
  p_type text,
  p_content text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_workspace_id uuid;
  v_event_id uuid;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  -- Get workspace_id from lead
  SELECT workspace_id INTO v_workspace_id
  FROM public.leads
  WHERE id = p_lead_id;
  
  -- Insert event
  INSERT INTO public.lead_events (
    lead_id,
    user_id,
    workspace_id,
    type,
    content,
    metadata
  ) VALUES (
    p_lead_id,
    v_user_id,
    v_workspace_id,
    p_type,
    p_content,
    p_metadata
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

-- Comments
COMMENT ON TABLE public.lead_events IS 'Tracks all SmartSend actions for each lead - emails sent, replies, classifications, follow-ups, etc.';
COMMENT ON COLUMN public.lead_events.type IS 'Event type: email_sent, followup_triggered, reply_received, classified, followup_stopped, note_added, status_changed, action_suggested';
COMMENT ON COLUMN public.lead_events.content IS 'Human-readable description of the event';
COMMENT ON COLUMN public.lead_events.metadata IS 'JSON object with event-specific data (template_id, step_number, intent, etc.)';
COMMENT ON FUNCTION public.log_lead_event IS 'Helper function to log a lead event with automatic user_id and workspace_id resolution';























































