-- =========================================================
-- Block 19760 — Inbox Success Tracking & Feedback Loop v1
-- (Real Roofing Feedback → Product Improvements → Inbox Evolution Engine)
-- =========================================================
--
-- This block installs the feedback engine for the Owner Inbox.
-- Every roofing beta user's experience → flows into → structured insights → flows into → SmartSend improvements.
--
-- This block provides:
-- - A success tracker
-- - A structured feedback form
-- - Automatic usage signals
-- - A monthly improvement loop
-- - A "Top Issues" heatmap
-- - A "Top Wins" summary
-- - A personal founder follow-up system
-- =========================================================

-- ============================================================================
-- 1. CREATE ENUM TYPES
-- ============================================================================

-- Usage event type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inbox_usage_event_type') THEN
    CREATE TYPE inbox_usage_event_type AS ENUM (
      'thread_opened',
      'action_button_clicked',
      'setting_changed',
      'notification_fired',
      'ai_summary_viewed',
      'inactivity_session',
      'filter_applied',
      'thread_selected',
      'reply_sent',
      'thread_closed',
      'thread_snoozed',
      'intent_manually_corrected',
      'task_created',
      'call_initiated',
      'mark_as_booked'
    );
  END IF;
END$$;

-- Feedback improvement category enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inbox_feedback_improvement') THEN
    CREATE TYPE inbox_feedback_improvement AS ENUM (
      'faster_ui',
      'better_ai_accuracy',
      'more_filters',
      'more_action_buttons',
      'better_mobile_experience',
      'other'
    );
  END IF;
END$$;

-- Feedback trigger moment enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inbox_feedback_trigger') THEN
    CREATE TYPE inbox_feedback_trigger AS ENUM (
      'after_5th_use',
      'after_first_booked',
      'after_10_leads_replied',
      'exit_inactivity',
      'manual'
    );
  END IF;
END$$;

-- Improvement impact level enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inbox_improvement_impact') THEN
    CREATE TYPE inbox_improvement_impact AS ENUM (
      'high',   -- affects booked jobs
      'medium', -- affects workflow
      'low'     -- cosmetic
    );
  END IF;
END$$;

-- ============================================================================
-- 2. CREATE inbox_success_metrics TABLE
-- ============================================================================
-- Tracks success metrics per user/workspace per week/month
-- Aggregated from usage events and actions

CREATE TABLE IF NOT EXISTS public.inbox_success_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  
  -- Time period
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  period_type text NOT NULL CHECK (period_type IN ('weekly', 'monthly')),
  
  -- 1. Inbox Adoption Metrics
  inbox_sessions_count integer DEFAULT 0,
  avg_session_duration_seconds integer DEFAULT 0,
  threads_opened_count integer DEFAULT 0,
  messages_viewed_count integer DEFAULT 0,
  
  -- 2. Lead Quality Validation
  correct_ai_classifications_count integer DEFAULT 0,
  total_ai_classifications_count integer DEFAULT 0,
  misclassifications_manually_corrected_count integer DEFAULT 0,
  
  -- 3. Conversion Flow
  calls_initiated_count integer DEFAULT 0,
  tasks_created_count integer DEFAULT 0,
  mark_as_booked_count integer DEFAULT 0,
  estimated_value_added numeric(12,2) DEFAULT 0,
  
  -- 4. Responsiveness
  avg_time_to_open_seconds integer DEFAULT 0, -- homeowner reply → owner opening inbox
  avg_time_to_action_seconds integer DEFAULT 0, -- reply → owner taking action
  
  -- 5. Noise Reduction
  filtered_auto_replies_count integer DEFAULT 0,
  orphan_reply_assignments_count integer DEFAULT 0,
  bounce_filters_count integer DEFAULT 0,
  
  -- 6. Mobile Usage
  mobile_sessions_count integer DEFAULT 0,
  total_sessions_count integer DEFAULT 0,
  mobile_actions_count integer DEFAULT 0,
  total_actions_count integer DEFAULT 0,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure one metric record per user/period
  UNIQUE(user_id, period_start, period_type, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_inbox_success_metrics_user_id ON public.inbox_success_metrics(user_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_success_metrics_workspace_id ON public.inbox_success_metrics(workspace_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_success_metrics_campaign_id ON public.inbox_success_metrics(campaign_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_success_metrics_period ON public.inbox_success_metrics(period_start, period_end);

-- ============================================================================
-- 3. CREATE inbox_usage_events TABLE
-- ============================================================================
-- Logs every UI interaction and event for analysis
-- These events feed the Inbox Health Dashboard

CREATE TABLE IF NOT EXISTS public.inbox_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  
  event_type inbox_usage_event_type NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb, -- Flexible JSON for event-specific data
  
  -- Device/Platform info
  is_mobile boolean DEFAULT false,
  user_agent text,
  platform text, -- 'web', 'ios', 'android'
  
  -- Timing
  session_id text, -- Track sessions
  event_timestamp timestamptz NOT NULL DEFAULT now(),
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbox_usage_events_user_id ON public.inbox_usage_events(user_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_usage_events_workspace_id ON public.inbox_usage_events(workspace_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_usage_events_campaign_id ON public.inbox_usage_events(campaign_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_usage_events_thread_id ON public.inbox_usage_events(thread_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_usage_events_type ON public.inbox_usage_events(event_type, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_usage_events_session ON public.inbox_usage_events(session_id, event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_usage_events_timestamp ON public.inbox_usage_events(event_timestamp DESC);

-- ============================================================================
-- 4. CREATE inbox_feedback TABLE
-- ============================================================================
-- Stores user feedback submissions from the feedback form
-- Triggered at specific moments (after 5th use, first booked, etc.)

CREATE TABLE IF NOT EXISTS public.inbox_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Trigger moment
  trigger_moment inbox_feedback_trigger NOT NULL,
  
  -- 3 Questions Only
  question_1_confusion text, -- "What's one thing in the Inbox that confused you?"
  question_2_help text, -- "What's one thing the Inbox helped you with this week?"
  question_3_improvement inbox_feedback_improvement, -- "What's one improvement you want next?"
  question_3_other_text text, -- Free text if "other" selected
  
  -- Additional context
  metadata jsonb DEFAULT '{}'::jsonb, -- Screenshots, thread IDs, etc.
  
  -- Processing status (for monthly improvement loop)
  processed boolean DEFAULT false,
  processed_at timestamptz,
  impact_level inbox_improvement_impact,
  improvement_loop_id uuid, -- Links to inbox_improvement_loops
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbox_feedback_user_id ON public.inbox_feedback(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_feedback_workspace_id ON public.inbox_feedback(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_feedback_processed ON public.inbox_feedback(processed, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_feedback_improvement_loop ON public.inbox_feedback(improvement_loop_id);
CREATE INDEX IF NOT EXISTS idx_inbox_feedback_trigger ON public.inbox_feedback(trigger_moment);

-- ============================================================================
-- 5. CREATE inbox_improvement_loops TABLE
-- ============================================================================
-- Tracks monthly improvement cycles
-- Each month, feedback is categorized and improvements are planned

CREATE TABLE IF NOT EXISTS public.inbox_improvement_loops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Time period
  month_start timestamptz NOT NULL,
  month_end timestamptz NOT NULL,
  
  -- Step 1: Pull Data + Feedback
  misclassified_intents_count integer DEFAULT 0,
  frequent_confusion_points text[], -- Array of common confusion points
  most_used_actions text[], -- Array of most-used action types
  least_used_actions text[], -- Array of least-used action types
  top_missing_features text[], -- Array of requested features
  
  -- Step 2: Categorized by Impact Level
  high_impact_feedback_ids uuid[], -- Array of feedback IDs
  medium_impact_feedback_ids uuid[],
  low_impact_feedback_ids uuid[],
  
  -- Step 3: Recurring Patterns Identified
  recurring_patterns jsonb DEFAULT '[]'::jsonb, -- Array of pattern objects
  
  -- Step 4: Next Sprint Tasks
  next_3_improvements jsonb DEFAULT '[]'::jsonb, -- Array of improvement objects
  
  -- Step 5: Deployment Status
  improvements_deployed boolean DEFAULT false,
  deployed_at timestamptz,
  deployed_to_users text[], -- Array of user IDs or 'all'
  
  -- Step 6: Measurement Results
  improvement_results jsonb DEFAULT '{}'::jsonb, -- Results after deployment
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure one loop per month
  UNIQUE(month_start)
);

CREATE INDEX IF NOT EXISTS idx_inbox_improvement_loops_month ON public.inbox_improvement_loops(month_start DESC);

-- ============================================================================
-- 6. CREATE inbox_top_wins_reports TABLE
-- ============================================================================
-- Weekly auto-generated "Top Wins" summary reports
-- Fuels confidence and provides proof

CREATE TABLE IF NOT EXISTS public.inbox_top_wins_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL = aggregate for all users
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Time period
  week_start timestamptz NOT NULL,
  week_end timestamptz NOT NULL,
  
  -- Auto-Report Includes:
  replies_handled_count integer DEFAULT 0,
  hot_leads_detected_count integer DEFAULT 0,
  booked_jobs_created_count integer DEFAULT 0,
  estimated_total_job_value numeric(12,2) DEFAULT 0,
  tasks_created_count integer DEFAULT 0,
  notifications_sent_count integer DEFAULT 0,
  
  -- Inbox adoption curves (JSON for flexibility)
  adoption_curves jsonb DEFAULT '{}'::jsonb,
  
  -- Beta user sentiment (aggregated from feedback)
  sentiment_score numeric(3,2) DEFAULT 0, -- 0.00 to 1.00
  positive_feedback_count integer DEFAULT 0,
  negative_feedback_count integer DEFAULT 0,
  neutral_feedback_count integer DEFAULT 0,
  
  -- Generated report data
  report_data jsonb DEFAULT '{}'::jsonb, -- Full report JSON
  
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure one report per user/workspace per week
  UNIQUE(user_id, workspace_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_inbox_top_wins_reports_user_id ON public.inbox_top_wins_reports(user_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_top_wins_reports_workspace_id ON public.inbox_top_wins_reports(workspace_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_top_wins_reports_week ON public.inbox_top_wins_reports(week_start DESC);

-- ============================================================================
-- 7. CREATE inbox_founder_followups TABLE
-- ============================================================================
-- Tracks personal founder follow-up conversations
-- High-touch founder-style feedback system

CREATE TABLE IF NOT EXISTS public.inbox_founder_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Follow-up details
  followup_date timestamptz NOT NULL,
  followup_type text NOT NULL CHECK (followup_type IN ('weekly', 'monthly')),
  
  -- Script responses (stored as JSON)
  responses jsonb DEFAULT '{}'::jsonb, -- {
    --   "confusing": "...",
    --   "slowed_down": "...",
    --   "loved": "...",
    --   "want_next": "..."
    -- }
  
  -- Follow-up status
  completed boolean DEFAULT false,
  completed_at timestamptz,
  notes text, -- Additional notes from founder
  
  -- Link to improvements
  improvement_loop_id uuid REFERENCES public.inbox_improvement_loops(id) ON DELETE SET NULL,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbox_founder_followups_user_id ON public.inbox_founder_followups(user_id, followup_date DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_founder_followups_workspace_id ON public.inbox_founder_followups(workspace_id, followup_date DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_founder_followups_completed ON public.inbox_founder_followups(completed, followup_date DESC);

-- ============================================================================
-- 8. CREATE inbox_health_dashboard_cache TABLE
-- ============================================================================
-- Cached data for the internal Inbox Health Dashboard
-- Updated periodically for performance

CREATE TABLE IF NOT EXISTS public.inbox_health_dashboard_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Cache key (e.g., 'all_users', 'workspace_123', 'user_456')
  cache_key text NOT NULL UNIQUE,
  
  -- Dashboard data
  hot_lead_detection_accuracy numeric(5,2) DEFAULT 0, -- Percentage
  thread_creation_stats jsonb DEFAULT '{}'::jsonb,
  orphan_reply_count integer DEFAULT 0,
  mis_thread_detection_logs jsonb DEFAULT '[]'::jsonb,
  inbox_adoption_charts jsonb DEFAULT '{}'::jsonb,
  user_by_user_usage_graphs jsonb DEFAULT '{}'::jsonb,
  top_5_friction_points jsonb DEFAULT '[]'::jsonb,
  top_5_requested_improvements jsonb DEFAULT '[]'::jsonb,
  inbox_stability_score numeric(5,2) DEFAULT 0, -- 0-100
  response_time_benchmarks jsonb DEFAULT '{}'::jsonb,
  mobile_vs_desktop_usage jsonb DEFAULT '{}'::jsonb,
  booked_estimate_counts integer DEFAULT 0,
  
  -- Cache metadata
  cached_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 hour')
);

CREATE INDEX IF NOT EXISTS idx_inbox_health_dashboard_cache_key ON public.inbox_health_dashboard_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_inbox_health_dashboard_cache_expires ON public.inbox_health_dashboard_cache(expires_at);

-- ============================================================================
-- 9. TRIGGERS FOR UPDATED_AT
-- ============================================================================

-- Trigger for inbox_success_metrics
DROP TRIGGER IF EXISTS trg_inbox_success_metrics_updated_at ON public.inbox_success_metrics;
CREATE TRIGGER trg_inbox_success_metrics_updated_at
  BEFORE UPDATE ON public.inbox_success_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for inbox_improvement_loops
DROP TRIGGER IF EXISTS trg_inbox_improvement_loops_updated_at ON public.inbox_improvement_loops;
CREATE TRIGGER trg_inbox_improvement_loops_updated_at
  BEFORE UPDATE ON public.inbox_improvement_loops
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger for inbox_founder_followups
DROP TRIGGER IF EXISTS trg_inbox_founder_followups_updated_at ON public.inbox_founder_followups;
CREATE TRIGGER trg_inbox_founder_followups_updated_at
  BEFORE UPDATE ON public.inbox_founder_followups
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 10. ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.inbox_success_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_improvement_loops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_top_wins_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_founder_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_health_dashboard_cache ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 11. RLS POLICIES
-- ============================================================================

-- Helper function to check if user can view workspace
CREATE OR REPLACE FUNCTION public.can_view_workspace(p_workspace_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  IF p_workspace_id IS NULL THEN
    RETURN false;
  END IF;
  
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
    AND user_id = auth.uid()
  );
END;
$$;

-- RLS Policy: inbox_success_metrics
-- Users can only see their own metrics or workspace metrics they belong to
DROP POLICY IF EXISTS "inbox_success_metrics_select" ON public.inbox_success_metrics;
CREATE POLICY "inbox_success_metrics_select"
  ON public.inbox_success_metrics
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (workspace_id IS NOT NULL AND public.can_view_workspace(workspace_id))
  );

DROP POLICY IF EXISTS "inbox_success_metrics_insert" ON public.inbox_success_metrics;
CREATE POLICY "inbox_success_metrics_insert"
  ON public.inbox_success_metrics
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- RLS Policy: inbox_usage_events
-- Users can only see their own events or workspace events they belong to
DROP POLICY IF EXISTS "inbox_usage_events_select" ON public.inbox_usage_events;
CREATE POLICY "inbox_usage_events_select"
  ON public.inbox_usage_events
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (workspace_id IS NOT NULL AND public.can_view_workspace(workspace_id))
  );

DROP POLICY IF EXISTS "inbox_usage_events_insert" ON public.inbox_usage_events;
CREATE POLICY "inbox_usage_events_insert"
  ON public.inbox_usage_events
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- RLS Policy: inbox_feedback
-- Users can only see their own feedback or workspace feedback they belong to
DROP POLICY IF EXISTS "inbox_feedback_select" ON public.inbox_feedback;
CREATE POLICY "inbox_feedback_select"
  ON public.inbox_feedback
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (workspace_id IS NOT NULL AND public.can_view_workspace(workspace_id))
  );

DROP POLICY IF EXISTS "inbox_feedback_insert" ON public.inbox_feedback;
CREATE POLICY "inbox_feedback_insert"
  ON public.inbox_feedback
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- RLS Policy: inbox_improvement_loops
-- Visible to all workspace members (internal tool)
DROP POLICY IF EXISTS "inbox_improvement_loops_select" ON public.inbox_improvement_loops;
CREATE POLICY "inbox_improvement_loops_select"
  ON public.inbox_improvement_loops
  FOR SELECT
  USING (true); -- Internal tool, visible to all authenticated users

-- RLS Policy: inbox_top_wins_reports
-- Users can see their own reports or workspace reports
DROP POLICY IF EXISTS "inbox_top_wins_reports_select" ON public.inbox_top_wins_reports;
CREATE POLICY "inbox_top_wins_reports_select"
  ON public.inbox_top_wins_reports
  FOR SELECT
  USING (
    (user_id = auth.uid() OR user_id IS NULL)
    OR (workspace_id IS NOT NULL AND public.can_view_workspace(workspace_id))
  );

-- RLS Policy: inbox_founder_followups
-- Users can see their own follow-ups or workspace follow-ups
DROP POLICY IF EXISTS "inbox_founder_followups_select" ON public.inbox_founder_followups;
CREATE POLICY "inbox_founder_followups_select"
  ON public.inbox_founder_followups
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR (workspace_id IS NOT NULL AND public.can_view_workspace(workspace_id))
  );

DROP POLICY IF EXISTS "inbox_founder_followups_insert" ON public.inbox_founder_followups;
CREATE POLICY "inbox_founder_followups_insert"
  ON public.inbox_founder_followups
  FOR INSERT
  WITH CHECK (true); -- Founder can create for any user

DROP POLICY IF EXISTS "inbox_founder_followups_update" ON public.inbox_founder_followups;
CREATE POLICY "inbox_founder_followups_update"
  ON public.inbox_founder_followups
  FOR UPDATE
  USING (true); -- Founder can update any follow-up

-- RLS Policy: inbox_health_dashboard_cache
-- Visible to all authenticated users (internal tool)
DROP POLICY IF EXISTS "inbox_health_dashboard_cache_select" ON public.inbox_health_dashboard_cache;
CREATE POLICY "inbox_health_dashboard_cache_select"
  ON public.inbox_health_dashboard_cache
  FOR SELECT
  USING (true); -- Internal tool, visible to all authenticated users

-- ============================================================================
-- 12. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.inbox_success_metrics IS 'Tracks success metrics per user/workspace per week/month. Aggregated from usage events and actions.';
COMMENT ON TABLE public.inbox_usage_events IS 'Logs every UI interaction and event for analysis. These events feed the Inbox Health Dashboard.';
COMMENT ON TABLE public.inbox_feedback IS 'Stores user feedback submissions from the feedback form. Triggered at specific moments (after 5th use, first booked, etc.).';
COMMENT ON TABLE public.inbox_improvement_loops IS 'Tracks monthly improvement cycles. Each month, feedback is categorized and improvements are planned.';
COMMENT ON TABLE public.inbox_top_wins_reports IS 'Weekly auto-generated "Top Wins" summary reports. Fuels confidence and provides proof.';
COMMENT ON TABLE public.inbox_founder_followups IS 'Tracks personal founder follow-up conversations. High-touch founder-style feedback system.';
COMMENT ON TABLE public.inbox_health_dashboard_cache IS 'Cached data for the internal Inbox Health Dashboard. Updated periodically for performance.';

COMMENT ON COLUMN public.inbox_success_metrics.period_type IS 'Time period type: weekly or monthly';
COMMENT ON COLUMN public.inbox_success_metrics.estimated_value_added IS 'Estimated total value of jobs created from inbox actions';
COMMENT ON COLUMN public.inbox_success_metrics.avg_time_to_open_seconds IS 'Average time between homeowner reply and owner opening inbox';
COMMENT ON COLUMN public.inbox_success_metrics.avg_time_to_action_seconds IS 'Average time between reply and owner taking an action';

COMMENT ON COLUMN public.inbox_usage_events.event_type IS 'Type of UI interaction: thread_opened, action_button_clicked, etc.';
COMMENT ON COLUMN public.inbox_usage_events.metadata IS 'Flexible JSON for event-specific data (e.g. action type, filter applied, etc.)';
COMMENT ON COLUMN public.inbox_usage_events.session_id IS 'Session identifier to track user sessions';

COMMENT ON COLUMN public.inbox_feedback.trigger_moment IS 'When feedback was triggered: after_5th_use, after_first_booked, etc.';
COMMENT ON COLUMN public.inbox_feedback.question_1_confusion IS 'What is one thing in the Inbox that confused you?';
COMMENT ON COLUMN public.inbox_feedback.question_2_help IS 'What is one thing the Inbox helped you with this week?';
COMMENT ON COLUMN public.inbox_feedback.question_3_improvement IS 'What is one improvement you want next?';
COMMENT ON COLUMN public.inbox_feedback.impact_level IS 'Impact level assigned during monthly improvement loop processing';

COMMENT ON COLUMN public.inbox_improvement_loops.recurring_patterns IS 'JSON array of identified recurring patterns from feedback';
COMMENT ON COLUMN public.inbox_improvement_loops.next_3_improvements IS 'JSON array of the next 3 improvements planned for the following month';

COMMENT ON COLUMN public.inbox_top_wins_reports.sentiment_score IS 'Aggregated sentiment score from feedback (0.00 to 1.00)';
COMMENT ON COLUMN public.inbox_top_wins_reports.report_data IS 'Full report JSON with all metrics and visualizations';

COMMENT ON COLUMN public.inbox_founder_followups.responses IS 'JSON object with script responses: confusing, slowed_down, loved, want_next';
COMMENT ON COLUMN public.inbox_founder_followups.followup_type IS 'Type of follow-up: weekly (first 2 months) or monthly (afterwards)';



















































