-- =========================================================
-- Block 21734 — SmartSend Roofing Call Queue v1
-- (Auto-Prioritized Call List from Hot Leads)
-- =========================================================
-- 
-- This is where SmartSend stops being "email software" and starts being
-- "Here's who you call RIGHT NOW to book roofs."
--
-- Call Queue v1 takes:
-- - HOT leads
-- - High heat_score leads
-- - New HOT replies
-- - Warm leads with recent intent
-- ...and turns them into ordered call tasks.

-- ============================================================================
-- 1. CREATE CALL TASKS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.call_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  assigned_to UUID, -- future: user/estimator id
  status TEXT NOT NULL DEFAULT 'pending',
  -- pending, in_progress, completed, no_answer, voicemail_left, bad_number, do_not_call
  priority INTEGER NOT NULL DEFAULT 0, -- higher = earlier in queue
  due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL, -- hot_lead, new_reply, followup, manual, ai_hot_lead, heat_score
  notes TEXT,
  outcome_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- ============================================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_call_tasks_status_due_priority
ON public.call_tasks (status, due_at ASC, priority DESC);

CREATE INDEX IF NOT EXISTS idx_call_tasks_lead_id
ON public.call_tasks (lead_id);

CREATE INDEX IF NOT EXISTS idx_call_tasks_assigned_to
ON public.call_tasks (assigned_to)
WHERE assigned_to IS NOT NULL;

-- ============================================================================
-- 3. FUNCTION: CREATE CALL TASK IF NEEDED
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_call_task_if_needed(
  p_lead_id UUID,
  p_source TEXT DEFAULT 'hot_lead'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  -- Do not create if there's an open task already
  SELECT EXISTS (
    SELECT 1 FROM public.call_tasks
    WHERE lead_id = p_lead_id
      AND status IN ('pending', 'in_progress')
  ) INTO v_exists;

  IF v_exists THEN
    RETURN;
  END IF;

  -- Create new call task with default priority
  INSERT INTO public.call_tasks (lead_id, source, status, priority, due_at)
  VALUES (p_lead_id, p_source, 'pending', 100, now());
END;
$$;

-- ============================================================================
-- 4. ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.call_tasks ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view call tasks for leads in their workspace
-- This assumes leads table has workspace_id and workspace_members table exists
CREATE POLICY "call_tasks_select_workspace"
ON public.call_tasks
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
    WHERE l.id = call_tasks.lead_id
    AND wm.user_id = auth.uid()
  )
);

-- Policy: Users can update call tasks for leads in their workspace
CREATE POLICY "call_tasks_update_workspace"
ON public.call_tasks
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.leads l
    JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
    WHERE l.id = call_tasks.lead_id
    AND wm.user_id = auth.uid()
  )
);

-- Policy: Service role has full access
CREATE POLICY "call_tasks_service_role_all"
ON public.call_tasks
FOR ALL
TO service_role
USING (true) WITH CHECK (true);

-- ============================================================================
-- 5. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.call_tasks IS 'Call tasks for estimators to work through prioritized leads';
COMMENT ON COLUMN public.call_tasks.priority IS 'Higher priority = earlier in queue. Default 100 for hot leads.';
COMMENT ON COLUMN public.call_tasks.source IS 'How this call task was created: hot_lead, ai_hot_lead, heat_score, new_reply, followup, manual';
COMMENT ON FUNCTION public.create_call_task_if_needed IS 'Creates a call task for a lead if one does not already exist with pending/in_progress status';

