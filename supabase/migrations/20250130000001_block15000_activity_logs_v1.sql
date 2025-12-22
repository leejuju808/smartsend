-- =========================================================
-- Block 15000 — SmartSend Activity Logs v1
-- (The Full Audit Log System That Tracks Every Action Across Inbox, Contacts, Pipeline, Sending & Team Activity)
-- =========================================================

-- Extend existing activity_logs table with comprehensive event tracking
-- This migration extends the existing activity_logs table from Block 11300

-- Add new columns if they don't exist
DO $$
BEGIN
  -- Add category column (10 main categories)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'activity_logs' 
    AND column_name = 'category'
  ) THEN
    ALTER TABLE public.activity_logs 
    ADD COLUMN category text CHECK (category IN (
      'sending',
      'inbox',
      'contact',
      'campaign',
      'task',
      'pipeline',
      'scheduler',
      'deliverability',
      'team',
      'billing'
    ));
  END IF;

  -- Add event_type column (more specific than type)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'activity_logs' 
    AND column_name = 'event_type'
  ) THEN
    ALTER TABLE public.activity_logs 
    ADD COLUMN event_type text;
  END IF;

  -- Add event_data column (replaces/extends metadata)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'activity_logs' 
    AND column_name = 'event_data'
  ) THEN
    ALTER TABLE public.activity_logs 
    ADD COLUMN event_data jsonb DEFAULT '{}'::jsonb;
  END IF;

  -- Add contact_id column (for contact-level activity)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'activity_logs' 
    AND column_name = 'contact_id'
  ) THEN
    ALTER TABLE public.activity_logs 
    ADD COLUMN contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
  END IF;

  -- Add revenue_value column (for revenue-related events)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'activity_logs' 
    AND column_name = 'revenue_value'
  ) THEN
    ALTER TABLE public.activity_logs 
    ADD COLUMN revenue_value numeric(12,2);
  END IF;
END $$;

-- Update type constraint to include all event types from 10 categories
-- Drop old constraint if exists and create new comprehensive one
DO $$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'activity_logs_type_check' 
    AND table_name = 'activity_logs'
  ) THEN
    ALTER TABLE public.activity_logs DROP CONSTRAINT activity_logs_type_check;
  END IF;
END $$;

-- Create comprehensive type constraint
ALTER TABLE public.activity_logs 
ADD CONSTRAINT activity_logs_type_check CHECK (type IN (
  -- Sending Events
  'campaign_email_sent',
  'followup_sent',
  'warmup_email_sent',
  'suppression_blocked_send',
  'plan_limit_blocked_send',
  -- Inbox Events
  'new_reply_received',
  'intent_detected',
  'tags_applied',
  'lead_score_updated',
  'pipeline_moved',
  'message_intelligence_triggered',
  -- Contact Events
  'contact_created',
  'contact_imported',
  'contact_updated',
  'tag_added',
  'tag_removed',
  'enrichment_added',
  -- Campaign Events
  'campaign_created',
  'campaign_edited',
  'campaign_started',
  'campaign_paused',
  'campaign_completed',
  'step_skipped',
  'template_updated',
  -- Task Events
  'task_created',
  'task_assigned',
  'task_marked_done',
  'overdue_task_alert',
  -- Pipeline Events
  'moved_to_hot',
  'moved_to_warm',
  'moved_to_cold',
  'moved_to_followup',
  'moved_to_not_interested',
  'auto_moved_by_intent',
  'auto_moved_by_lead_score',
  -- Scheduler Events
  'appointment_booked',
  'appointment_rescheduled',
  'appointment_canceled',
  'no_show_logged',
  -- Deliverability Events
  'bounce_detected',
  'spam_complaint',
  'domain_health_score_drop',
  'warmup_stage_advanced',
  'dns_failed',
  'sender_reputation_flagged',
  -- Team Events
  'user_invited',
  'role_changed',
  'staff_assigned_to_lead',
  'staff_removed',
  'login_from_new_device',
  'user_removed',
  -- Billing Events
  'plan_upgraded',
  'plan_downgraded',
  'card_failed',
  'trial_started',
  'trial_ended',
  'plan_canceled',
  'stripe_sync_event',
  -- Legacy types (for backward compatibility)
  'email_sent',
  'followup_triggered',
  'reply_received',
  'classified',
  'sequence_paused',
  'import',
  'campaign_launched'
));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_activity_logs_category 
  ON public.activity_logs(category) WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_logs_event_type 
  ON public.activity_logs(event_type) WHERE event_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_logs_contact 
  ON public.activity_logs(contact_id) WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_logs_category_created 
  ON public.activity_logs(category, created_at DESC) WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_logs_user 
  ON public.activity_logs(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_logs_workspace_category_created 
  ON public.activity_logs(workspace_id, category, created_at DESC);

-- Update RLS policies for role-based visibility
-- Drop old policies
DROP POLICY IF EXISTS "Users can view activity logs for their workspaces" ON public.activity_logs;
DROP POLICY IF EXISTS "Service role can insert activity logs" ON public.activity_logs;

-- Role-based visibility policy
-- Owner: sees ALL events
-- Manager/Admin: sees all except billing  
-- Staff/Member: sees events where they are the user_id or events for assigned leads/contacts
CREATE POLICY "Role-based activity log access"
  ON public.activity_logs
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    AND (
      -- Owner sees everything
      EXISTS (
        SELECT 1 FROM public.workspace_members wm
        WHERE wm.workspace_id = activity_logs.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role = 'owner'
      )
      OR
      -- Manager/Admin sees everything except billing
      (
        EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = activity_logs.workspace_id
          AND wm.user_id = auth.uid()
          AND wm.role IN ('admin', 'manager')
        )
        AND (category IS NULL OR category != 'billing')
      )
      OR
      -- Staff/Member sees their own actions
      (
        EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = activity_logs.workspace_id
          AND wm.user_id = auth.uid()
        )
        AND user_id = auth.uid()
      )
    )
  );

-- Service role and authenticated users can insert (for API/edge functions)
CREATE POLICY "Service role and users can insert activity logs"
  ON public.activity_logs
  FOR INSERT
  WITH CHECK (
    -- Service role (bypasses RLS)
    auth.jwt() IS NOT NULL
    OR
    -- Authenticated users inserting for their workspace
    workspace_id IN (
      SELECT w.id FROM public.workspaces w
      INNER JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = auth.uid()
    )
  );

-- Helper function to get user role in workspace
CREATE OR REPLACE FUNCTION public.get_user_workspace_role(p_workspace_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT role FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
  AND user_id = auth.uid()
  LIMIT 1;
$$;

-- Comments
COMMENT ON TABLE public.activity_logs IS 'Comprehensive audit log system tracking all SmartSend activity across sending, inbox, contacts, pipeline, tasks, scheduler, deliverability, team, and billing';
COMMENT ON COLUMN public.activity_logs.category IS 'Main category: sending, inbox, contact, campaign, task, pipeline, scheduler, deliverability, team, billing';
COMMENT ON COLUMN public.activity_logs.event_type IS 'Specific event type within category (e.g., campaign_email_sent, new_reply_received)';
COMMENT ON COLUMN public.activity_logs.event_data IS 'Detailed JSON metadata with event-specific information (source, system logic, impact, etc.)';
COMMENT ON COLUMN public.activity_logs.contact_id IS 'Contact involved in this event (if applicable)';
COMMENT ON COLUMN public.activity_logs.revenue_value IS 'Revenue value associated with this event (if applicable)';

-- Create cleanup function for old logs (removes logs older than 12 months)
CREATE OR REPLACE FUNCTION public.cleanup_old_activity_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.activity_logs
  WHERE created_at < NOW() - INTERVAL '12 months';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_activity_logs IS 'Removes activity logs older than 12 months. Run via cron job.';

