-- =========================================================
-- Block 16600 — SmartSend Activity Log v2
-- (The Full-System Audit Trail: Replies, Tasks, Pipeline Moves, Storm Events, Insurance Signals, Scheduling, Revenue Updates & User Actions)
-- =========================================================

-- ============================================================================
-- 1. CREATE activity_logs_v2 TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.activity_logs_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Workspace/Company scope
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- User who triggered the event (nullable for system events)
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Contact associated with this event (nullable for company-level events)
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  
  -- Event categorization
  category text NOT NULL CHECK (
    category IN (
      'messaging',
      'pipeline',
      'scheduler',
      'task',
      'storm',
      'insurance',
      'revenue',
      'contact_intelligence',
      'user_action'
    )
  ),
  
  -- Event type within category
  type text NOT NULL,
  
  -- Severity level for UI coloring
  severity text NOT NULL DEFAULT 'info' CHECK (
    severity IN ('urgent', 'important', 'info', 'success')
  ),
  
  -- Human-readable summary
  summary text NOT NULL,
  
  -- Detailed JSON data
  details jsonb DEFAULT '{}'::jsonb,
  
  -- Source of the event
  source text NOT NULL DEFAULT 'system' CHECK (
    source IN ('ai', 'user', 'system')
  ),
  
  -- Associated pipeline stage (if applicable)
  pipeline_stage_key text,
  
  -- Optional references to related entities
  message_id uuid,
  task_id uuid,
  campaign_id uuid,
  appointment_id uuid,
  quote_id uuid,
  note_id uuid,
  thread_id uuid
);

-- ============================================================================
-- 2. INDEXES FOR FAST QUERIES
-- ============================================================================

-- Company-level queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_v2_workspace_created 
  ON public.activity_logs_v2(workspace_id, created_at DESC);

-- Contact-level queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_v2_contact_created 
  ON public.activity_logs_v2(contact_id, created_at DESC) 
  WHERE contact_id IS NOT NULL;

-- Category filtering
CREATE INDEX IF NOT EXISTS idx_activity_logs_v2_category 
  ON public.activity_logs_v2(category, created_at DESC);

-- Type filtering
CREATE INDEX IF NOT EXISTS idx_activity_logs_v2_type 
  ON public.activity_logs_v2(type, created_at DESC);

-- Severity filtering
CREATE INDEX IF NOT EXISTS idx_activity_logs_v2_severity 
  ON public.activity_logs_v2(severity, created_at DESC);

-- Pipeline stage filtering
CREATE INDEX IF NOT EXISTS idx_activity_logs_v2_pipeline_stage 
  ON public.activity_logs_v2(pipeline_stage_key, created_at DESC) 
  WHERE pipeline_stage_key IS NOT NULL;

-- User filtering
CREATE INDEX IF NOT EXISTS idx_activity_logs_v2_user 
  ON public.activity_logs_v2(user_id, created_at DESC) 
  WHERE user_id IS NOT NULL;

-- Date range queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_v2_created_at 
  ON public.activity_logs_v2(created_at DESC);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_v2_workspace_category_date 
  ON public.activity_logs_v2(workspace_id, category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_activity_logs_v2_contact_category_date 
  ON public.activity_logs_v2(contact_id, category, created_at DESC) 
  WHERE contact_id IS NOT NULL;

-- GIN index for JSONB details queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_v2_details_gin 
  ON public.activity_logs_v2 USING gin(details);

-- ============================================================================
-- 3. RLS POLICIES
-- ============================================================================

ALTER TABLE public.activity_logs_v2 ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view activity logs for their workspace
CREATE POLICY "activity_logs_v2_select_workspace"
  ON public.activity_logs_v2 FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

-- Policy: System and users can insert activity logs
CREATE POLICY "activity_logs_v2_insert_workspace"
  ON public.activity_logs_v2 FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

-- Grant access
GRANT SELECT, INSERT ON public.activity_logs_v2 TO authenticated;

-- ============================================================================
-- 4. HELPER FUNCTION TO LOG ACTIVITY
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_activity_v2(
  p_workspace_id uuid,
  p_category text,
  p_type text,
  p_summary text,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_severity text DEFAULT 'info',
  p_source text DEFAULT 'system',
  p_user_id uuid DEFAULT auth.uid(),
  p_contact_id uuid DEFAULT NULL,
  p_pipeline_stage_key text DEFAULT NULL,
  p_message_id uuid DEFAULT NULL,
  p_task_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_appointment_id uuid DEFAULT NULL,
  p_quote_id uuid DEFAULT NULL,
  p_note_id uuid DEFAULT NULL,
  p_thread_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Validate category
  IF p_category NOT IN (
    'messaging', 'pipeline', 'scheduler', 'task', 'storm', 
    'insurance', 'revenue', 'contact_intelligence', 'user_action'
  ) THEN
    RAISE EXCEPTION 'Invalid category: %', p_category;
  END IF;
  
  -- Validate severity
  IF p_severity NOT IN ('urgent', 'important', 'info', 'success') THEN
    RAISE EXCEPTION 'Invalid severity: %', p_severity;
  END IF;
  
  -- Validate source
  IF p_source NOT IN ('ai', 'user', 'system') THEN
    RAISE EXCEPTION 'Invalid source: %', p_source;
  END IF;
  
  -- Insert activity log
  INSERT INTO public.activity_logs_v2 (
    workspace_id,
    user_id,
    contact_id,
    category,
    type,
    severity,
    summary,
    details,
    source,
    pipeline_stage_key,
    message_id,
    task_id,
    campaign_id,
    appointment_id,
    quote_id,
    note_id,
    thread_id
  ) VALUES (
    p_workspace_id,
    p_user_id,
    p_contact_id,
    p_category,
    p_type,
    p_severity,
    p_summary,
    p_details,
    p_source,
    p_pipeline_stage_key,
    p_message_id,
    p_task_id,
    p_campaign_id,
    p_appointment_id,
    p_quote_id,
    p_note_id,
    p_thread_id
  )
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_activity_v2(
  uuid, text, text, text, jsonb, text, text, uuid, uuid, text, uuid, uuid, uuid, uuid, uuid, uuid, uuid
) TO authenticated;

COMMENT ON FUNCTION public.log_activity_v2 IS 'Helper function to log activity events (Block 16600 - Activity Log v2)';

-- ============================================================================
-- 5. CONVENIENCE FUNCTIONS FOR EACH CATEGORY
-- ============================================================================

-- Messaging Events
CREATE OR REPLACE FUNCTION public.log_messaging_event(
  p_workspace_id uuid,
  p_type text,
  p_summary text,
  p_contact_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_message_id uuid DEFAULT NULL,
  p_thread_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_severity text;
BEGIN
  -- Determine severity based on type
  v_severity := CASE p_type
    WHEN 'bounce' THEN 'urgent'
    WHEN 'spam_warning' THEN 'urgent'
    WHEN 'reply_received' THEN 'important'
    WHEN 'link_click' THEN 'important'
    WHEN 'email_sent' THEN 'info'
    WHEN 'followup_sent' THEN 'info'
    WHEN 'open_tracked' THEN 'info'
    ELSE 'info'
  END;
  
  RETURN public.log_activity_v2(
    p_workspace_id,
    'messaging',
    p_type,
    p_summary,
    p_details,
    v_severity,
    'system',
    NULL,
    p_contact_id,
    NULL,
    p_message_id,
    NULL,
    p_campaign_id,
    NULL,
    NULL,
    NULL,
    p_thread_id
  );
END;
$$;

-- Pipeline Events
CREATE OR REPLACE FUNCTION public.log_pipeline_event(
  p_workspace_id uuid,
  p_type text,
  p_summary text,
  p_contact_id uuid,
  p_pipeline_stage_key text,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_source text DEFAULT 'system'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_severity text := 'important';
BEGIN
  RETURN public.log_activity_v2(
    p_workspace_id,
    'pipeline',
    p_type,
    p_summary,
    p_details,
    v_severity,
    p_source,
    NULL,
    p_contact_id,
    p_pipeline_stage_key,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  );
END;
$$;

-- Scheduler Events
CREATE OR REPLACE FUNCTION public.log_scheduler_event(
  p_workspace_id uuid,
  p_type text,
  p_summary text,
  p_contact_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_appointment_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_severity text;
BEGIN
  v_severity := CASE p_type
    WHEN 'no_show' THEN 'urgent'
    WHEN 'appointment_booked' THEN 'success'
    WHEN 'appointment_confirmed' THEN 'success'
    WHEN 'cancellation' THEN 'important'
    ELSE 'info'
  END;
  
  RETURN public.log_activity_v2(
    p_workspace_id,
    'scheduler',
    p_type,
    p_summary,
    p_details,
    v_severity,
    'system',
    NULL,
    p_contact_id,
    NULL,
    NULL,
    NULL,
    NULL,
    p_appointment_id,
    NULL,
    NULL,
    NULL
  );
END;
$$;

-- Task Events
CREATE OR REPLACE FUNCTION public.log_task_event(
  p_workspace_id uuid,
  p_type text,
  p_summary text,
  p_contact_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_task_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_severity text;
BEGIN
  v_severity := CASE p_type
    WHEN 'task_overdue' THEN 'urgent'
    WHEN 'task_completed' THEN 'success'
    WHEN 'task_created' THEN 'important'
    ELSE 'info'
  END;
  
  RETURN public.log_activity_v2(
    p_workspace_id,
    'task',
    p_type,
    p_summary,
    p_details,
    v_severity,
    CASE WHEN p_user_id IS NOT NULL THEN 'user' ELSE 'ai' END,
    p_user_id,
    p_contact_id,
    NULL,
    NULL,
    p_task_id,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  );
END;
$$;

-- Storm & Weather Events
CREATE OR REPLACE FUNCTION public.log_storm_event(
  p_workspace_id uuid,
  p_type text,
  p_summary text,
  p_contact_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_severity text := 'important';
BEGIN
  RETURN public.log_activity_v2(
    p_workspace_id,
    'storm',
    p_type,
    p_summary,
    p_details,
    v_severity,
    'system',
    NULL,
    p_contact_id,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  );
END;
$$;

-- Insurance Events
CREATE OR REPLACE FUNCTION public.log_insurance_event(
  p_workspace_id uuid,
  p_type text,
  p_summary text,
  p_contact_id uuid,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_severity text := 'urgent';
BEGIN
  RETURN public.log_activity_v2(
    p_workspace_id,
    'insurance',
    p_type,
    p_summary,
    p_details,
    v_severity,
    'system',
    NULL,
    p_contact_id,
    'insurance_opportunity',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  );
END;
$$;

-- Revenue Events
CREATE OR REPLACE FUNCTION public.log_revenue_event(
  p_workspace_id uuid,
  p_type text,
  p_summary text,
  p_contact_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_quote_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_severity text := 'success';
BEGIN
  RETURN public.log_activity_v2(
    p_workspace_id,
    'revenue',
    p_type,
    p_summary,
    p_details,
    v_severity,
    'system',
    NULL,
    p_contact_id,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    p_quote_id,
    NULL,
    NULL
  );
END;
$$;

-- Contact Intelligence Events
CREATE OR REPLACE FUNCTION public.log_contact_intelligence_event(
  p_workspace_id uuid,
  p_type text,
  p_summary text,
  p_contact_id uuid,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN public.log_activity_v2(
    p_workspace_id,
    'contact_intelligence',
    p_type,
    p_summary,
    p_details,
    'info',
    'ai',
    NULL,
    p_contact_id,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  );
END;
$$;

-- User Actions
CREATE OR REPLACE FUNCTION public.log_user_action(
  p_workspace_id uuid,
  p_type text,
  p_summary text,
  p_contact_id uuid DEFAULT NULL,
  p_details jsonb DEFAULT '{}'::jsonb,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN public.log_activity_v2(
    p_workspace_id,
    'user_action',
    p_type,
    p_summary,
    p_details,
    'info',
    'user',
    p_user_id,
    p_contact_id,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.log_messaging_event(uuid, text, text, uuid, jsonb, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_pipeline_event(uuid, text, text, uuid, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_scheduler_event(uuid, text, text, uuid, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_task_event(uuid, text, text, uuid, jsonb, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_storm_event(uuid, text, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_insurance_event(uuid, text, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_revenue_event(uuid, text, text, uuid, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_contact_intelligence_event(uuid, text, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_user_action(uuid, text, text, uuid, jsonb, uuid) TO authenticated;

-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.activity_logs_v2 IS 'Comprehensive activity log v2 - Full audit trail for all SmartSend actions (Block 16600)';
COMMENT ON COLUMN public.activity_logs_v2.category IS 'Event category: messaging, pipeline, scheduler, task, storm, insurance, revenue, contact_intelligence, user_action';
COMMENT ON COLUMN public.activity_logs_v2.type IS 'Specific event type within category (e.g., email_sent, moved_to_hot, appointment_booked)';
COMMENT ON COLUMN public.activity_logs_v2.severity IS 'Severity level: urgent (red), important (yellow), info (blue), success (green)';
COMMENT ON COLUMN public.activity_logs_v2.source IS 'Source of event: ai, user, system';
COMMENT ON COLUMN public.activity_logs_v2.details IS 'JSONB field for event-specific data';





















































