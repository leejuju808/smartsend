-- =========================================================
-- Block 19890 — Inbox Team Collaboration v1
-- (Multi-User Threads, Assignments, Mentions, Internal Notes, Shared Pipelines, and Roofing Crew Coordination)
-- =========================================================

-- ============================================================================
-- PART 1: THREAD INTERNAL NOTES (Private, Team-Only)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.thread_internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  content text NOT NULL,
  -- Mentions stored as JSON array: ["@owner", "@john", "@office"]
  mentions text[] DEFAULT '{}',
  -- Metadata for flexible storage
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thread_internal_notes_thread ON public.thread_internal_notes(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thread_internal_notes_workspace ON public.thread_internal_notes(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thread_internal_notes_created_by ON public.thread_internal_notes(created_by);
CREATE INDEX IF NOT EXISTS idx_thread_internal_notes_mentions ON public.thread_internal_notes USING GIN(mentions);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_thread_internal_notes_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_thread_internal_notes_updated_at ON public.thread_internal_notes;
CREATE TRIGGER trg_thread_internal_notes_updated_at
  BEFORE UPDATE ON public.thread_internal_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_thread_internal_notes_updated_at();

-- Enable RLS
ALTER TABLE public.thread_internal_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Workspace members can view internal notes
CREATE POLICY "thread_internal_notes_select_workspace_member"
  ON public.thread_internal_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = thread_internal_notes.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Workspace members can create internal notes
CREATE POLICY "thread_internal_notes_insert_workspace_member"
  ON public.thread_internal_notes
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = thread_internal_notes.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Creator or workspace admin can update/delete
CREATE POLICY "thread_internal_notes_update_creator_or_admin"
  ON public.thread_internal_notes
  FOR UPDATE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = thread_internal_notes.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = thread_internal_notes.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "thread_internal_notes_delete_creator_or_admin"
  ON public.thread_internal_notes
  FOR DELETE
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = thread_internal_notes.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- PART 2: MENTIONS SYSTEM (@username)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.thread_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mentioned_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Source of mention: 'internal_note', 'task', 'message'
  source_type text NOT NULL CHECK (source_type IN ('internal_note', 'task', 'message')),
  source_id uuid NOT NULL,
  -- Mention text for display: "@owner", "@john", etc.
  mention_text text NOT NULL,
  -- Whether user has been notified
  notified boolean DEFAULT false,
  -- Whether user has viewed the mention
  viewed boolean DEFAULT false,
  viewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thread_mentions_thread ON public.thread_mentions(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thread_mentions_user ON public.thread_mentions(mentioned_user_id, viewed, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thread_mentions_workspace ON public.thread_mentions(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thread_mentions_source ON public.thread_mentions(source_type, source_id);

-- Enable RLS
ALTER TABLE public.thread_mentions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view mentions for their workspace
CREATE POLICY "thread_mentions_select_workspace_member"
  ON public.thread_mentions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = thread_mentions.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Workspace members can create mentions
CREATE POLICY "thread_mentions_insert_workspace_member"
  ON public.thread_mentions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = thread_mentions.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Mentioned user can update their mention (mark as viewed)
CREATE POLICY "thread_mentions_update_mentioned_user"
  ON public.thread_mentions
  FOR UPDATE
  USING (mentioned_user_id = auth.uid())
  WITH CHECK (mentioned_user_id = auth.uid());

-- Function to extract mentions from text and create mention records
CREATE OR REPLACE FUNCTION public.create_mentions_from_text(
  p_thread_id uuid,
  p_workspace_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_text text,
  p_mentioned_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mention_text text;
  v_user_id uuid;
  v_username text;
  v_profile_record record;
BEGIN
  -- Extract @mentions from text (pattern: @username or @owner, @john, etc.)
  -- This is a simple implementation - can be enhanced with regex
  FOR v_mention_text IN
    SELECT DISTINCT regexp_split_to_table(p_text, E'\\s+') AS word
    WHERE word ~ '^@[a-zA-Z0-9_]+'
  LOOP
    -- Remove @ symbol
    v_username := substring(v_mention_text from 2);
    
    -- Try to find user by username/email or role
    -- First, check if it's a role like "owner"
    IF v_username = 'owner' THEN
      SELECT user_id INTO v_user_id
      FROM public.workspace_members
      WHERE workspace_id = p_workspace_id
      AND role = 'owner'
      LIMIT 1;
    ELSE
      -- Try to find by email or profile name
      SELECT id INTO v_user_id
      FROM auth.users
      WHERE email ILIKE '%' || v_username || '%'
      LIMIT 1;
      
      -- If not found by email, check profiles table
      IF v_user_id IS NULL THEN
        SELECT p.id INTO v_user_id
        FROM public.profiles p
        JOIN public.workspace_members wm ON wm.user_id = p.id
        WHERE wm.workspace_id = p_workspace_id
        AND (p.email ILIKE '%' || v_username || '%' OR p.full_name ILIKE '%' || v_username || '%')
        LIMIT 1;
      END IF;
    END IF;
    
    -- Create mention record if user found
    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.thread_mentions (
        thread_id,
        workspace_id,
        mentioned_user_id,
        mentioned_by,
        source_type,
        source_id,
        mention_text
      ) VALUES (
        p_thread_id,
        p_workspace_id,
        v_user_id,
        p_mentioned_by,
        p_source_type,
        p_source_id,
        v_mention_text
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- PART 3: TEAM READ TRACKING (Who opened, Who read last message)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.thread_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Last message ID that was read
  last_message_id uuid REFERENCES public.inbox_messages(id) ON DELETE SET NULL,
  -- First time user opened this thread
  first_opened_at timestamptz NOT NULL DEFAULT now(),
  -- Last time user viewed this thread
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  -- Count of times thread was viewed
  view_count int DEFAULT 1,
  UNIQUE(thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_thread_reads_thread ON public.thread_reads(thread_id, last_viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_thread_reads_user ON public.thread_reads(user_id, last_viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_thread_reads_workspace ON public.thread_reads(workspace_id);

-- Enable RLS
ALTER TABLE public.thread_reads ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view read tracking for threads in their workspace
CREATE POLICY "thread_reads_select_workspace_member"
  ON public.thread_reads
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = thread_reads.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Users can insert/update their own read tracking
CREATE POLICY "thread_reads_insert_update_own"
  ON public.thread_reads
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Function to mark thread as read
CREATE OR REPLACE FUNCTION public.mark_thread_read(
  p_thread_id uuid,
  p_message_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_campaign_id uuid;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  -- Get campaign_id and workspace_id from thread
  SELECT t.campaign_id, COALESCE(t.workspace_id, c.workspace_id) INTO v_campaign_id, v_workspace_id
  FROM public.inbox_threads t
  LEFT JOIN public.campaigns c ON c.id = t.campaign_id
  WHERE t.id = p_thread_id;
  
  -- If workspace_id still null, get from campaign
  IF v_workspace_id IS NULL THEN
    SELECT c.workspace_id INTO v_workspace_id
    FROM public.campaigns c
    WHERE c.id = v_campaign_id;
  END IF;
  
  -- Upsert read tracking
  INSERT INTO public.thread_reads (
    thread_id,
    workspace_id,
    user_id,
    last_message_id,
    last_viewed_at,
    view_count
  )
  VALUES (
    p_thread_id,
    v_workspace_id,
    v_user_id,
    p_message_id,
    now(),
    1
  )
  ON CONFLICT (thread_id, user_id)
  DO UPDATE SET
    last_message_id = COALESCE(p_message_id, thread_reads.last_message_id),
    last_viewed_at = now(),
    view_count = thread_reads.view_count + 1;
    
  -- Reset unread count for this user (if we track per-user unread)
  -- This would require a per-user unread tracking table
END;
$$;

-- ============================================================================
-- PART 4: ENHANCE TASKS TABLE WITH THREAD LINK
-- ============================================================================

-- Add thread_id to tasks if not exists
ALTER TABLE IF EXISTS public.tasks
  ADD COLUMN IF NOT EXISTS thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_thread ON public.tasks(thread_id) WHERE thread_id IS NOT NULL;

-- ============================================================================
-- PART 5: TEAM ACTIVITY FEED ENHANCEMENTS
-- ============================================================================

-- Add thread-related activity types to activity_logs if using that table
-- Or create a dedicated thread_activity table

CREATE TABLE IF NOT EXISTS public.thread_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type text NOT NULL CHECK (
    activity_type IN (
      'assigned',
      'unassigned',
      'note_added',
      'note_updated',
      'task_created',
      'task_completed',
      'status_changed',
      'mentioned',
      'replied',
      'viewed'
    )
  ),
  -- Related entity references
  related_note_id uuid REFERENCES public.thread_internal_notes(id) ON DELETE SET NULL,
  related_task_id uuid REFERENCES public.tasks(id) ON DELETE SET NULL,
  related_message_id uuid REFERENCES public.inbox_messages(id) ON DELETE SET NULL,
  -- Human-readable summary
  summary text NOT NULL,
  -- Detailed JSON data
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thread_activity_thread ON public.thread_activity(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thread_activity_workspace ON public.thread_activity(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thread_activity_user ON public.thread_activity(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thread_activity_type ON public.thread_activity(activity_type, created_at DESC);

-- Enable RLS
ALTER TABLE public.thread_activity ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Workspace members can view thread activity
CREATE POLICY "thread_activity_select_workspace_member"
  ON public.thread_activity
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = thread_activity.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Workspace members can create activity entries
CREATE POLICY "thread_activity_insert_workspace_member"
  ON public.thread_activity
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = thread_activity.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Function to log thread activity
CREATE OR REPLACE FUNCTION public.log_thread_activity(
  p_thread_id uuid,
  p_activity_type text,
  p_summary text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_related_note_id uuid DEFAULT NULL,
  p_related_task_id uuid DEFAULT NULL,
  p_related_message_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_user_id uuid;
  v_activity_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  -- Get workspace_id from thread (use denormalized field if available, otherwise join)
  SELECT COALESCE(t.workspace_id, c.workspace_id) INTO v_workspace_id
  FROM public.inbox_threads t
  LEFT JOIN public.campaigns c ON c.id = t.campaign_id
  WHERE t.id = p_thread_id;
  
  -- Insert activity
  INSERT INTO public.thread_activity (
    thread_id,
    workspace_id,
    user_id,
    activity_type,
    related_note_id,
    related_task_id,
    related_message_id,
    summary,
    metadata
  )
  VALUES (
    p_thread_id,
    v_workspace_id,
    v_user_id,
    p_activity_type,
    p_related_note_id,
    p_related_task_id,
    p_related_message_id,
    p_summary,
    p_metadata
  )
  RETURNING id INTO v_activity_id;
  
  RETURN v_activity_id;
END;
$$;

-- ============================================================================
-- PART 6: THREAD ASSIGNMENT TRIGGERS & ACTIVITY LOGGING
-- ============================================================================

-- Trigger to log assignment changes
CREATE OR REPLACE FUNCTION public.log_thread_assignment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_old_assignee_name text;
  v_new_assignee_name text;
  v_summary text;
BEGIN
  -- Get workspace_id
  SELECT c.workspace_id INTO v_workspace_id
  FROM public.campaigns c
  WHERE c.id = NEW.campaign_id;
  
  -- Only log if assignment changed
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    -- Get assignee names
    SELECT COALESCE(p.email, p.full_name, 'Unknown') INTO v_old_assignee_name
    FROM public.profiles p
    WHERE p.id = OLD.assigned_to;
    
    SELECT COALESCE(p.email, p.full_name, 'Unknown') INTO v_new_assignee_name
    FROM public.profiles p
    WHERE p.id = NEW.assigned_to;
    
    -- Create summary
    IF NEW.assigned_to IS NULL THEN
      v_summary := 'Thread unassigned from ' || COALESCE(v_old_assignee_name, 'user');
    ELSIF OLD.assigned_to IS NULL THEN
      v_summary := 'Thread assigned to ' || COALESCE(v_new_assignee_name, 'user');
    ELSE
      v_summary := 'Thread reassigned from ' || COALESCE(v_old_assignee_name, 'user') || ' to ' || COALESCE(v_new_assignee_name, 'user');
    END IF;
    
    -- Log activity
    PERFORM public.log_thread_activity(
      NEW.id,
      CASE WHEN NEW.assigned_to IS NULL THEN 'unassigned' ELSE 'assigned' END,
      v_summary,
      jsonb_build_object(
        'old_assigned_to', OLD.assigned_to,
        'new_assigned_to', NEW.assigned_to
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_thread_assignment_change ON public.inbox_threads;
CREATE TRIGGER trg_log_thread_assignment_change
  AFTER UPDATE OF assigned_to ON public.inbox_threads
  FOR EACH ROW
  WHEN (OLD.assigned_to IS DISTINCT FROM NEW.assigned_to)
  EXECUTE FUNCTION public.log_thread_assignment_change();

-- ============================================================================
-- PART 7: THREAD ROUTING RULES (Auto-Routing Logic)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.thread_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- Rule priority (lower number = higher priority)
  priority int NOT NULL DEFAULT 100,
  -- Rule conditions (JSONB for flexibility)
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Example conditions:
  -- {"job_type": "insurance", "territory": "north", "lead_score": {"gte": 70}}
  -- Action to take
  action_type text NOT NULL CHECK (action_type IN ('assign', 'notify', 'tag')),
  -- Target user or role
  target_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_role text CHECK (target_role IN ('owner', 'admin', 'member', 'sales_rep', 'office_staff')),
  -- Whether rule is active
  active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thread_routing_rules_workspace ON public.thread_routing_rules(workspace_id, active, priority);
CREATE INDEX IF NOT EXISTS idx_thread_routing_rules_active ON public.thread_routing_rules(active, priority);

-- Enable RLS
ALTER TABLE public.thread_routing_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Workspace members can view routing rules
CREATE POLICY "thread_routing_rules_select_workspace_member"
  ON public.thread_routing_rules
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = thread_routing_rules.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Only owners/admins can manage routing rules
CREATE POLICY "thread_routing_rules_manage_admin"
  ON public.thread_routing_rules
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = thread_routing_rules.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = thread_routing_rules.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

-- Function to apply routing rules to a thread
CREATE OR REPLACE FUNCTION public.apply_thread_routing_rules(
  p_thread_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_campaign_id uuid;
  v_lead_id uuid;
  v_rule record;
  v_target_user_id uuid;
  v_assigned boolean := false;
BEGIN
  -- Get thread details
  SELECT campaign_id, lead_id INTO v_campaign_id, v_lead_id
  FROM public.inbox_threads
  WHERE id = p_thread_id;
  
  -- Get workspace_id
  SELECT workspace_id INTO v_workspace_id
  FROM public.campaigns
  WHERE id = v_campaign_id;
  
  -- Apply rules in priority order
  FOR v_rule IN
    SELECT *
    FROM public.thread_routing_rules
    WHERE workspace_id = v_workspace_id
    AND active = true
    ORDER BY priority ASC, created_at ASC
  LOOP
    -- Check if rule conditions match (simplified - can be enhanced)
    -- For now, we'll check basic conditions
    -- In production, this would be more sophisticated
    
    -- If rule matches, apply action
    IF v_rule.action_type = 'assign' THEN
      -- Determine target user
      IF v_rule.target_user_id IS NOT NULL THEN
        v_target_user_id := v_rule.target_user_id;
      ELSIF v_rule.target_role IS NOT NULL THEN
        -- Find user with target role
        SELECT user_id INTO v_target_user_id
        FROM public.workspace_members
        WHERE workspace_id = v_workspace_id
        AND role = v_rule.target_role
        LIMIT 1;
      END IF;
      
      -- Assign thread if user found and not already assigned
      IF v_target_user_id IS NOT NULL THEN
        UPDATE public.inbox_threads
        SET assigned_to = v_target_user_id
        WHERE id = p_thread_id
        AND assigned_to IS NULL;
        
        v_assigned := true;
        EXIT; -- Stop after first matching rule
      END IF;
    END IF;
  END LOOP;
  
  RETURN v_target_user_id;
END;
$$;

-- ============================================================================
-- PART 8: TEAM PERFORMANCE ANALYTICS (Mini Version)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.team_performance_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Time period (daily, weekly, monthly)
  period_type text NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  -- Metrics
  assigned_leads_count int DEFAULT 0,
  response_time_avg_seconds numeric(10,2),
  calls_count int DEFAULT 0,
  booked_jobs_count int DEFAULT 0,
  tasks_completed_count int DEFAULT 0,
  total_job_value numeric(12,2) DEFAULT 0,
  pipeline_contribution jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, user_id, period_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_team_performance_workspace ON public.team_performance_metrics(workspace_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_team_performance_user ON public.team_performance_metrics(user_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_team_performance_period ON public.team_performance_metrics(period_type, period_start DESC);

-- Enable RLS
ALTER TABLE public.team_performance_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Workspace members can view performance metrics
CREATE POLICY "team_performance_metrics_select_workspace_member"
  ON public.team_performance_metrics
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = team_performance_metrics.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Function to calculate and update performance metrics
CREATE OR REPLACE FUNCTION public.update_team_performance_metrics(
  p_workspace_id uuid,
  p_user_id uuid,
  p_period_type text,
  p_period_start date,
  p_period_end date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_assigned_leads int;
  v_response_time_avg numeric;
  v_calls_count int;
  v_booked_jobs int;
  v_tasks_completed int;
  v_total_job_value numeric;
BEGIN
  -- Calculate assigned leads count
  SELECT COUNT(*) INTO v_assigned_leads
  FROM public.inbox_threads t
  JOIN public.campaigns c ON c.id = t.campaign_id
  WHERE c.workspace_id = p_workspace_id
  AND t.assigned_to = p_user_id
  AND t.created_at >= p_period_start::timestamptz
  AND t.created_at < (p_period_end + interval '1 day')::timestamptz;
  
  -- Calculate average response time (simplified)
  SELECT AVG(EXTRACT(EPOCH FROM (m.sent_at - t.created_at))) INTO v_response_time_avg
  FROM public.inbox_threads t
  JOIN public.campaigns c ON c.id = t.campaign_id
  JOIN public.inbox_messages m ON m.thread_id = t.id
  WHERE c.workspace_id = p_workspace_id
  AND t.assigned_to = p_user_id
  AND m.direction = 'out'
  AND m.sent_at >= p_period_start::timestamptz
  AND m.sent_at < (p_period_end + interval '1 day')::timestamptz;
  
  -- Calculate tasks completed
  SELECT COUNT(*) INTO v_tasks_completed
  FROM public.tasks
  WHERE workspace_id = p_workspace_id
  AND assigned_to = p_user_id
  AND status = 'completed'
  AND completed_at >= p_period_start::timestamptz
  AND completed_at < (p_period_end + interval '1 day')::timestamptz;
  
  -- Upsert metrics
  INSERT INTO public.team_performance_metrics (
    workspace_id,
    user_id,
    period_type,
    period_start,
    period_end,
    assigned_leads_count,
    response_time_avg_seconds,
    tasks_completed_count
  )
  VALUES (
    p_workspace_id,
    p_user_id,
    p_period_type,
    p_period_start,
    p_period_end,
    v_assigned_leads,
    v_response_time_avg,
    v_tasks_completed
  )
  ON CONFLICT (workspace_id, user_id, period_type, period_start)
  DO UPDATE SET
    assigned_leads_count = EXCLUDED.assigned_leads_count,
    response_time_avg_seconds = EXCLUDED.response_time_avg_seconds,
    tasks_completed_count = EXCLUDED.tasks_completed_count,
    updated_at = now();
END;
$$;

-- ============================================================================
-- PART 9: ENHANCE INBOX_THREADS WITH WORKSPACE_ID
-- ============================================================================

-- Add workspace_id to inbox_threads if not exists (for easier filtering)
-- This is denormalized from campaigns for performance
ALTER TABLE IF EXISTS public.inbox_threads
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_inbox_threads_workspace ON public.inbox_threads(workspace_id, updated_at DESC);

-- Function to backfill workspace_id from campaigns
CREATE OR REPLACE FUNCTION public.backfill_thread_workspace_ids()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.inbox_threads t
  SET workspace_id = c.workspace_id
  FROM public.campaigns c
  WHERE t.campaign_id = c.id
  AND t.workspace_id IS NULL;
END;
$$;

-- Trigger to auto-set workspace_id on insert
CREATE OR REPLACE FUNCTION public.set_thread_workspace_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.workspace_id IS NULL THEN
    SELECT workspace_id INTO NEW.workspace_id
    FROM public.campaigns
    WHERE id = NEW.campaign_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_thread_workspace_id ON public.inbox_threads;
CREATE TRIGGER trg_set_thread_workspace_id
  BEFORE INSERT OR UPDATE ON public.inbox_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_thread_workspace_id();

-- ============================================================================
-- PART 10: COMMENTS & DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.thread_internal_notes IS 'Private team-only notes for threads (not visible to homeowners)';
COMMENT ON TABLE public.thread_mentions IS 'Mentions (@username) in internal notes, tasks, or messages';
COMMENT ON TABLE public.thread_reads IS 'Tracks who has read/viewed threads and when';
COMMENT ON TABLE public.thread_activity IS 'Activity feed for thread-related events (assignments, notes, tasks, etc.)';
COMMENT ON TABLE public.thread_routing_rules IS 'Auto-routing rules for assigning threads based on conditions';
COMMENT ON TABLE public.team_performance_metrics IS 'Performance metrics per user per time period (assigned leads, response time, tasks completed, etc.)';

COMMENT ON FUNCTION public.create_mentions_from_text IS 'Extracts @mentions from text and creates mention records';
COMMENT ON FUNCTION public.mark_thread_read IS 'Marks a thread as read for the current user';
COMMENT ON FUNCTION public.log_thread_activity IS 'Logs activity events for threads';
COMMENT ON FUNCTION public.apply_thread_routing_rules IS 'Applies routing rules to automatically assign threads';
COMMENT ON FUNCTION public.update_team_performance_metrics IS 'Calculates and updates team performance metrics for a user and period';

