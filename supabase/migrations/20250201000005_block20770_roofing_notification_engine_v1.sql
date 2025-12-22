-- =========================================================
-- Block 20770 — SmartSend Roofing Notification Engine v1
-- (Real-Time Alerts for Homeowner Replies • Claim Approvals • Adjuster Responses • Install-Ready Signals • Missed Follow-Ups)
-- =========================================================
--
-- This block makes SmartSend feel ALIVE.
-- Roofers NEVER check software. They only react to notifications.
-- If SmartSend alerts them at the right time →
-- they close more jobs, respond faster, look more professional, and win more installs.
--
-- Block 20770 builds the intelligent notification system roofers have always needed.
-- =========================================================

-- ============================================================================
-- PART 1 — Create/Extend Notifications Table for Roofing Notifications
-- ============================================================================

-- Ensure notifications table exists (may already exist from previous blocks)
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  
  -- Notification type (matches spec)
  type text NOT NULL CHECK (type IN (
    -- 🟢 Homeowner Activity
    'homeowner_replied',
    'homeowner_buying_signal',
    'homeowner_question',
    'homeowner_schedule_request',
    'homeowner_uploaded_adjuster_email',
    'homeowner_wants_to_move_forward',
    
    -- 🔵 Insurance Claims
    'claim_approved',
    'claim_status_changed',
    'adjuster_approval_letter',
    
    -- 🟣 Adjuster Communications
    'adjuster_replied',
    'adjuster_asked_for_photos',
    'adjuster_scheduled_inspection',
    'adjuster_approved_supplement',
    'adjuster_denied_supplement',
    
    -- 🔥 Install-Ready
    'install_ready',
    
    -- ⚠️ Follow-Ups
    'missed_follow_up_hot_lead',
    'missed_follow_up_homeowner',
    'missed_follow_up_adjuster',
    'missed_follow_up_proposal',
    
    -- 🟠 Supplement Opportunities
    'supplement_opportunity_detected',
    
    -- 🔴 Urgent Alerts
    'adjuster_denied_claim',
    'homeowner_reported_leak',
    'homeowner_hired_another_company',
    'homeowner_complained_delays'
  )),
  
  -- Notification content
  title text NOT NULL,
  body text,
  payload jsonb DEFAULT '{}'::jsonb, -- Stores additional context (project_value, claim_amount, etc.)
  
  -- Status
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add columns if table already exists (for backward compatibility)
DO $$
BEGIN
  -- Add workspace_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL;
  END IF;
  
  -- Add lead_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'lead_id'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;
  END IF;
  
  -- Add thread_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'thread_id'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL;
  END IF;
  
  -- Add job_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'job_id'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL;
  END IF;
  
  -- Add campaign_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'campaign_id'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;
  END IF;
  
  -- Add payload if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'payload'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN payload jsonb DEFAULT '{}'::jsonb;
  END IF;
  
  -- Ensure is_read exists (may be named 'read' in older versions)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'notifications' 
    AND column_name = 'is_read'
  ) THEN
    ALTER TABLE public.notifications ADD COLUMN is_read boolean NOT NULL DEFAULT false;
    -- Sync from 'read' column if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'notifications' 
      AND column_name = 'read'
    ) THEN
      UPDATE public.notifications SET is_read = read WHERE is_read IS NULL;
    END IF;
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read, created_at DESC) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_lead ON public.notifications(lead_id, created_at DESC) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_thread ON public.notifications(thread_id, created_at DESC) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_workspace ON public.notifications(workspace_id, created_at DESC) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- RLS Policies
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own notifications
DROP POLICY IF EXISTS "users_read_own_notifications" ON public.notifications;
CREATE POLICY "users_read_own_notifications"
ON public.notifications
FOR SELECT
USING (user_id = auth.uid());

-- Policy: Users can update their own notifications (mark as read)
DROP POLICY IF EXISTS "users_update_own_notifications" ON public.notifications;
CREATE POLICY "users_update_own_notifications"
ON public.notifications
FOR UPDATE
USING (user_id = auth.uid());

-- Policy: Service role can insert notifications (for system triggers)
DROP POLICY IF EXISTS "service_role_insert_notifications" ON public.notifications;
CREATE POLICY "service_role_insert_notifications"
ON public.notifications
FOR INSERT
TO service_role
WITH CHECK (true);

-- ============================================================================
-- PART 2 — Notification Frequency Rules (Anti-Spam Logic)
-- ============================================================================

-- Table to track notification frequency (prevents spam)
CREATE TABLE IF NOT EXISTS public.notification_frequency_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type text NOT NULL,
  entity_id uuid, -- lead_id, thread_id, or job_id
  last_sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_frequency_user_type ON public.notification_frequency_tracking(user_id, notification_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notification_frequency_last_sent ON public.notification_frequency_tracking(last_sent_at);

-- Function to check if notification should be sent (respects frequency rules)
CREATE OR REPLACE FUNCTION public.should_send_notification(
  p_user_id uuid,
  p_notification_type text,
  p_entity_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_sent timestamptz;
  v_cooldown_interval interval;
BEGIN
  -- Define cooldown intervals based on notification type
  CASE p_notification_type
    WHEN 'homeowner_replied' THEN
      v_cooldown_interval := INTERVAL '10 minutes';
    WHEN 'adjuster_replied' THEN
      v_cooldown_interval := INTERVAL '1 hour';
    WHEN 'missed_follow_up_adjuster' THEN
      v_cooldown_interval := INTERVAL '1 day';
    WHEN 'missed_follow_up_hot_lead' THEN
      v_cooldown_interval := INTERVAL '24 hours';
    WHEN 'missed_follow_up_proposal' THEN
      v_cooldown_interval := INTERVAL '24 hours';
    WHEN 'install_ready' THEN
      -- Check if install_ready was already sent for this entity
      SELECT last_sent_at INTO v_last_sent
      FROM public.notification_frequency_tracking
      WHERE user_id = p_user_id
        AND notification_type = 'install_ready'
        AND entity_id = p_entity_id
      ORDER BY last_sent_at DESC
      LIMIT 1;
      
      -- Only send install_ready once unless new activity triggers it again
      IF v_last_sent IS NOT NULL THEN
        RETURN false;
      END IF;
      RETURN true;
    WHEN 'supplement_opportunity_detected' THEN
      -- Only send once unless updated
      SELECT last_sent_at INTO v_last_sent
      FROM public.notification_frequency_tracking
      WHERE user_id = p_user_id
        AND notification_type = 'supplement_opportunity_detected'
        AND entity_id = p_entity_id
      ORDER BY last_sent_at DESC
      LIMIT 1;
      
      IF v_last_sent IS NOT NULL THEN
        RETURN false;
      END IF;
      RETURN true;
    ELSE
      -- Default: allow all other notifications
      RETURN true;
  END CASE;
  
  -- Check if cooldown period has passed
  SELECT last_sent_at INTO v_last_sent
  FROM public.notification_frequency_tracking
  WHERE user_id = p_user_id
    AND notification_type = p_notification_type
    AND (entity_id = p_entity_id OR (entity_id IS NULL AND p_entity_id IS NULL))
  ORDER BY last_sent_at DESC
  LIMIT 1;
  
  IF v_last_sent IS NULL THEN
    RETURN true; -- Never sent before
  END IF;
  
  IF v_last_sent + v_cooldown_interval < now() THEN
    RETURN true; -- Cooldown period has passed
  END IF;
  
  RETURN false; -- Still in cooldown period
END;
$$;

-- Function to record notification sent (for frequency tracking)
CREATE OR REPLACE FUNCTION public.record_notification_sent(
  p_user_id uuid,
  p_notification_type text,
  p_entity_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.notification_frequency_tracking (
    user_id,
    notification_type,
    entity_id,
    last_sent_at
  )
  VALUES (
    p_user_id,
    p_notification_type,
    p_entity_id,
    now()
  )
  ON CONFLICT DO NOTHING;
END;
$$;

-- ============================================================================
-- PART 3 — Core Notification Creation Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_roofing_notification(
  p_user_id uuid,
  p_notification_type text,
  p_title text,
  p_body text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_lead_id uuid DEFAULT NULL,
  p_thread_id uuid DEFAULT NULL,
  p_job_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_workspace_id uuid DEFAULT NULL,
  p_check_frequency boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_entity_id uuid;
  v_should_send boolean;
BEGIN
  -- Determine entity_id for frequency tracking
  v_entity_id := COALESCE(p_thread_id, p_lead_id, p_job_id);
  
  -- Check frequency rules if enabled
  IF p_check_frequency THEN
    v_should_send := public.should_send_notification(p_user_id, p_notification_type, v_entity_id);
    IF NOT v_should_send THEN
      -- Skip notification due to frequency rules
      RETURN NULL;
    END IF;
  END IF;
  
  -- Get workspace_id from thread if not provided
  IF p_workspace_id IS NULL AND p_thread_id IS NOT NULL THEN
    SELECT workspace_id INTO p_workspace_id
    FROM public.inbox_threads
    WHERE id = p_thread_id;
  END IF;
  
  -- Get workspace_id from campaign if still not found
  IF p_workspace_id IS NULL AND p_campaign_id IS NOT NULL THEN
    SELECT workspace_id INTO p_workspace_id
    FROM public.campaigns
    WHERE id = p_campaign_id;
  END IF;
  
  -- Insert notification
  INSERT INTO public.notifications (
    user_id,
    workspace_id,
    lead_id,
    thread_id,
    job_id,
    campaign_id,
    type,
    title,
    body,
    payload,
    is_read,
    created_at
  )
  VALUES (
    p_user_id,
    p_workspace_id,
    p_lead_id,
    p_thread_id,
    p_job_id,
    p_campaign_id,
    p_notification_type,
    p_title,
    p_body,
    p_payload,
    false,
    now()
  )
  RETURNING id INTO v_notification_id;
  
  -- Record notification sent for frequency tracking
  PERFORM public.record_notification_sent(p_user_id, p_notification_type, v_entity_id);
  
  RETURN v_notification_id;
END;
$$;

-- ============================================================================
-- PART 4 — Notification Type-Specific Helper Functions
-- ============================================================================

-- A) Homeowner Replied Notification
CREATE OR REPLACE FUNCTION public.notify_homeowner_replied(
  p_thread_id uuid,
  p_message_preview text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread record;
  v_user_id uuid;
  v_title text;
  v_body text;
  v_notification_id uuid;
BEGIN
  -- Get thread and user info
  SELECT 
    t.*,
    c.first_name || ' ' || c.last_name as homeowner_name,
    c.email as homeowner_email,
    wm.user_id as owner_user_id
  INTO v_thread
  FROM public.inbox_threads t
  LEFT JOIN public.contacts c ON c.id = t.contact_id
  LEFT JOIN public.workspace_members wm ON wm.workspace_id = t.workspace_id
  WHERE t.id = p_thread_id
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get the primary user (workspace owner or first member)
  SELECT user_id INTO v_user_id
  FROM public.workspace_members
  WHERE workspace_id = v_thread.workspace_id
  ORDER BY 
    CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
    created_at ASC
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Build notification
  v_title := COALESCE(v_thread.homeowner_name, 'Homeowner') || ' replied';
  v_body := COALESCE(p_message_preview, 'New message received');
  
  -- Create notification
  v_notification_id := public.create_roofing_notification(
    p_user_id := v_user_id,
    p_notification_type := 'homeowner_replied',
    p_title := v_title,
    p_body := v_body,
    p_payload := jsonb_build_object(
      'homeowner_name', v_thread.homeowner_name,
      'homeowner_email', v_thread.homeowner_email,
      'message_preview', p_message_preview
    ),
    p_thread_id := p_thread_id,
    p_lead_id := v_thread.lead_id,
    p_campaign_id := v_thread.campaign_id,
    p_workspace_id := v_thread.workspace_id,
    p_check_frequency := true
  );
  
  RETURN v_notification_id;
END;
$$;

-- B) Claim Approved Notification
CREATE OR REPLACE FUNCTION public.notify_claim_approved(
  p_thread_id uuid,
  p_claim_amount numeric DEFAULT NULL,
  p_insurance_company text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread record;
  v_user_id uuid;
  v_title text;
  v_body text;
  v_notification_id uuid;
BEGIN
  -- Get thread info
  SELECT 
    t.*,
    c.first_name || ' ' || c.last_name as homeowner_name
  INTO v_thread
  FROM public.inbox_threads t
  LEFT JOIN public.contacts c ON c.id = t.contact_id
  WHERE t.id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get user
  SELECT user_id INTO v_user_id
  FROM public.workspace_members
  WHERE workspace_id = v_thread.workspace_id
  ORDER BY 
    CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
    created_at ASC
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Build notification
  v_title := COALESCE(p_insurance_company, 'Insurance') || ' approved ' || COALESCE(v_thread.homeowner_name, 'claim');
  IF p_claim_amount IS NOT NULL THEN
    v_title := v_title || ' for $' || p_claim_amount::text;
  END IF;
  v_body := 'Install-ready.';
  
  -- Create notification
  v_notification_id := public.create_roofing_notification(
    p_user_id := v_user_id,
    p_notification_type := 'claim_approved',
    p_title := v_title,
    p_body := v_body,
    p_payload := jsonb_build_object(
      'claim_amount', p_claim_amount,
      'insurance_company', p_insurance_company,
      'homeowner_name', v_thread.homeowner_name
    ),
    p_thread_id := p_thread_id,
    p_lead_id := v_thread.lead_id,
    p_campaign_id := v_thread.campaign_id,
    p_workspace_id := v_thread.workspace_id,
    p_check_frequency := false -- Always notify on claim approval
  );
  
  RETURN v_notification_id;
END;
$$;

-- C) Adjuster Responded Notification
CREATE OR REPLACE FUNCTION public.notify_adjuster_responded(
  p_thread_id uuid,
  p_adjuster_name text DEFAULT NULL,
  p_message_preview text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread record;
  v_user_id uuid;
  v_title text;
  v_body text;
  v_notification_id uuid;
BEGIN
  -- Get thread info
  SELECT 
    t.*,
    c.first_name || ' ' || c.last_name as homeowner_name
  INTO v_thread
  FROM public.inbox_threads t
  LEFT JOIN public.contacts c ON c.id = t.contact_id
  WHERE t.id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get user
  SELECT user_id INTO v_user_id
  FROM public.workspace_members
  WHERE workspace_id = v_thread.workspace_id
  ORDER BY 
    CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
    created_at ASC
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Build notification
  v_title := 'Adjuster ' || COALESCE(p_adjuster_name, 'responded');
  v_body := COALESCE(p_message_preview, 'New message from adjuster');
  
  -- Create notification
  v_notification_id := public.create_roofing_notification(
    p_user_id := v_user_id,
    p_notification_type := 'adjuster_replied',
    p_title := v_title,
    p_body := v_body,
    p_payload := jsonb_build_object(
      'adjuster_name', p_adjuster_name,
      'message_preview', p_message_preview,
      'homeowner_name', v_thread.homeowner_name
    ),
    p_thread_id := p_thread_id,
    p_lead_id := v_thread.lead_id,
    p_campaign_id := v_thread.campaign_id,
    p_workspace_id := v_thread.workspace_id,
    p_check_frequency := true
  );
  
  RETURN v_notification_id;
END;
$$;

-- D) Install-Ready Notification
CREATE OR REPLACE FUNCTION public.notify_install_ready(
  p_thread_id uuid,
  p_project_value numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread record;
  v_user_id uuid;
  v_title text;
  v_body text;
  v_notification_id uuid;
BEGIN
  -- Get thread info
  SELECT 
    t.*,
    c.first_name || ' ' || c.last_name as homeowner_name
  INTO v_thread
  FROM public.inbox_threads t
  LEFT JOIN public.contacts c ON c.id = t.contact_id
  WHERE t.id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get user
  SELECT user_id INTO v_user_id
  FROM public.workspace_members
  WHERE workspace_id = v_thread.workspace_id
  ORDER BY 
    CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
    created_at ASC
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Build notification
  v_title := COALESCE(v_thread.homeowner_name, 'Lead') || ' is INSTALL READY';
  IF p_project_value IS NOT NULL THEN
    v_body := 'Project value: $' || p_project_value::text || '. Recommended Action: CALL TODAY.';
  ELSE
    v_body := 'Recommended Action: CALL TODAY.';
  END IF;
  
  -- Create notification
  v_notification_id := public.create_roofing_notification(
    p_user_id := v_user_id,
    p_notification_type := 'install_ready',
    p_title := v_title,
    p_body := v_body,
    p_payload := jsonb_build_object(
      'project_value', p_project_value,
      'homeowner_name', v_thread.homeowner_name
    ),
    p_thread_id := p_thread_id,
    p_lead_id := v_thread.lead_id,
    p_campaign_id := v_thread.campaign_id,
    p_workspace_id := v_thread.workspace_id,
    p_check_frequency := true -- Only send once unless new activity
  );
  
  RETURN v_notification_id;
END;
$$;

-- E) Missed Follow-Up Notification
CREATE OR REPLACE FUNCTION public.notify_missed_follow_up(
  p_thread_id uuid,
  p_follow_up_type text, -- 'hot_lead', 'homeowner', 'adjuster', 'proposal'
  p_hours_since_contact integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread record;
  v_user_id uuid;
  v_title text;
  v_body text;
  v_notification_type text;
  v_notification_id uuid;
BEGIN
  -- Get thread info
  SELECT 
    t.*,
    c.first_name || ' ' || c.last_name as homeowner_name
  INTO v_thread
  FROM public.inbox_threads t
  LEFT JOIN public.contacts c ON c.id = t.contact_id
  WHERE t.id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get user
  SELECT user_id INTO v_user_id
  FROM public.workspace_members
  WHERE workspace_id = v_thread.workspace_id
  ORDER BY 
    CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
    created_at ASC
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Determine notification type
  v_notification_type := 'missed_follow_up_' || p_follow_up_type;
  
  -- Build notification
  CASE p_follow_up_type
    WHEN 'hot_lead' THEN
      v_title := 'You have 1 HOT lead that needs follow-up: ' || COALESCE(v_thread.homeowner_name, 'Lead');
      v_body := 'No contact in ' || COALESCE(p_hours_since_contact::text, '24') || ' hours';
    WHEN 'homeowner' THEN
      v_title := COALESCE(v_thread.homeowner_name, 'Homeowner') || ' waiting for response';
      v_body := 'Waiting ' || COALESCE(p_hours_since_contact::text, '12') || ' hours';
    WHEN 'adjuster' THEN
      v_title := 'Adjuster unresponsive';
      v_body := 'No response in ' || COALESCE(p_hours_since_contact::text, '48') || ' hours';
    WHEN 'proposal' THEN
      v_title := 'Proposal sent but no follow-up';
      v_body := 'Sent ' || COALESCE(p_hours_since_contact::text, '24') || ' hours ago';
    ELSE
      v_title := 'Follow-up needed';
      v_body := 'Action required';
  END CASE;
  
  -- Create notification
  v_notification_id := public.create_roofing_notification(
    p_user_id := v_user_id,
    p_notification_type := v_notification_type,
    p_title := v_title,
    p_body := v_body,
    p_payload := jsonb_build_object(
      'follow_up_type', p_follow_up_type,
      'hours_since_contact', p_hours_since_contact,
      'homeowner_name', v_thread.homeowner_name
    ),
    p_thread_id := p_thread_id,
    p_lead_id := v_thread.lead_id,
    p_campaign_id := v_thread.campaign_id,
    p_workspace_id := v_thread.workspace_id,
    p_check_frequency := true
  );
  
  RETURN v_notification_id;
END;
$$;

-- F) Supplement Opportunity Notification
CREATE OR REPLACE FUNCTION public.notify_supplement_opportunity(
  p_thread_id uuid,
  p_supplement_value numeric,
  p_missing_items jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread record;
  v_user_id uuid;
  v_title text;
  v_body text;
  v_notification_id uuid;
BEGIN
  -- Get thread info
  SELECT 
    t.*,
    c.first_name || ' ' || c.last_name as homeowner_name
  INTO v_thread
  FROM public.inbox_threads t
  LEFT JOIN public.contacts c ON c.id = t.contact_id
  WHERE t.id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get user
  SELECT user_id INTO v_user_id
  FROM public.workspace_members
  WHERE workspace_id = v_thread.workspace_id
  ORDER BY 
    CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
    created_at ASC
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Build notification
  v_title := 'Supplement opportunity: +$' || p_supplement_value::text || ' on ' || COALESCE(v_thread.homeowner_name, 'roof');
  v_body := 'Missing items detected that could increase claim value.';
  
  -- Create notification
  v_notification_id := public.create_roofing_notification(
    p_user_id := v_user_id,
    p_notification_type := 'supplement_opportunity_detected',
    p_title := v_title,
    p_body := v_body,
    p_payload := jsonb_build_object(
      'supplement_value', p_supplement_value,
      'missing_items', p_missing_items,
      'homeowner_name', v_thread.homeowner_name
    ),
    p_thread_id := p_thread_id,
    p_lead_id := v_thread.lead_id,
    p_campaign_id := v_thread.campaign_id,
    p_workspace_id := v_thread.workspace_id,
    p_check_frequency := true -- Only send once unless updated
  );
  
  RETURN v_notification_id;
END;
$$;

-- G) Urgent Alert Notification
CREATE OR REPLACE FUNCTION public.notify_urgent_alert(
  p_thread_id uuid,
  p_alert_type text, -- 'adjuster_denied_claim', 'homeowner_reported_leak', 'homeowner_hired_another_company', 'homeowner_complained_delays'
  p_message text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread record;
  v_user_id uuid;
  v_title text;
  v_body text;
  v_notification_id uuid;
BEGIN
  -- Get thread info
  SELECT 
    t.*,
    c.first_name || ' ' || c.last_name as homeowner_name
  INTO v_thread
  FROM public.inbox_threads t
  LEFT JOIN public.contacts c ON c.id = t.contact_id
  WHERE t.id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Get user
  SELECT user_id INTO v_user_id
  FROM public.workspace_members
  WHERE workspace_id = v_thread.workspace_id
  ORDER BY 
    CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
    created_at ASC
  LIMIT 1;
  
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Build notification based on alert type
  CASE p_alert_type
    WHEN 'adjuster_denied_claim' THEN
      v_title := 'URGENT: Claim Denied';
      v_body := COALESCE(p_message, 'Adjuster denied the claim. Immediate action required.');
    WHEN 'homeowner_reported_leak' THEN
      v_title := 'URGENT: Water Damage Reported';
      v_body := COALESCE(p_message, 'Homeowner reported leak/water damage. Immediate attention needed.');
    WHEN 'homeowner_hired_another_company' THEN
      v_title := 'URGENT: Lead Lost';
      v_body := COALESCE(p_message, 'Homeowner hired another company.');
    WHEN 'homeowner_complained_delays' THEN
      v_title := 'URGENT: Homeowner Complaint';
      v_body := COALESCE(p_message, 'Homeowner complained about delays.');
    ELSE
      v_title := 'URGENT: Action Required';
      v_body := COALESCE(p_message, 'Immediate attention needed.');
  END CASE;
  
  -- Create notification (no frequency check for urgent alerts)
  v_notification_id := public.create_roofing_notification(
    p_user_id := v_user_id,
    p_notification_type := p_alert_type,
    p_title := v_title,
    p_body := v_body,
    p_payload := jsonb_build_object(
      'alert_type', p_alert_type,
      'message', p_message,
      'homeowner_name', v_thread.homeowner_name
    ),
    p_thread_id := p_thread_id,
    p_lead_id := v_thread.lead_id,
    p_campaign_id := v_thread.campaign_id,
    p_workspace_id := v_thread.workspace_id,
    p_check_frequency := false -- Always send urgent alerts
  );
  
  RETURN v_notification_id;
END;
$$;

-- ============================================================================
-- PART 5 — Triggers on Activity Feed Events
-- ============================================================================

-- Trigger function to create notifications from activity feed events
CREATE OR REPLACE FUNCTION public.trigger_notification_from_activity_feed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread record;
  v_user_id uuid;
BEGIN
  -- Only process certain event types that should trigger notifications
  IF NEW.event_type IN (
    'homeowner_replied',
    'claim_approved',
    'adjuster_responded',
    'stage_install_ready',
    'supplement_items_detected',
    'claim_denied',
    'adjuster_unresponsive_72h',
    'homeowner_replied_waiting'
  ) THEN
    -- Get thread info to find user
    SELECT * INTO v_thread
    FROM public.inbox_threads
    WHERE id = NEW.thread_id;
    
    IF FOUND THEN
      -- Get user
      SELECT user_id INTO v_user_id
      FROM public.workspace_members
      WHERE workspace_id = v_thread.workspace_id
      ORDER BY 
        CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
        created_at ASC
      LIMIT 1;
      
      IF v_user_id IS NOT NULL THEN
        -- Create appropriate notification based on event type
        CASE NEW.event_type
          WHEN 'homeowner_replied' THEN
            PERFORM public.notify_homeowner_replied(NEW.thread_id, NEW.event_text);
          WHEN 'claim_approved' THEN
            PERFORM public.notify_claim_approved(
              NEW.thread_id,
              (NEW.event_payload->>'claim_amount')::numeric,
              NEW.event_payload->>'insurance_company'
            );
          WHEN 'adjuster_responded' THEN
            PERFORM public.notify_adjuster_responded(
              NEW.thread_id,
              NEW.event_payload->>'adjuster_name',
              NEW.event_text
            );
          WHEN 'stage_install_ready' THEN
            PERFORM public.notify_install_ready(
              NEW.thread_id,
              (NEW.event_payload->>'project_value')::numeric
            );
          WHEN 'supplement_items_detected' THEN
            PERFORM public.notify_supplement_opportunity(
              NEW.thread_id,
              (NEW.event_payload->>'supplement_value')::numeric,
              COALESCE(NEW.event_payload->'missing_items', '[]'::jsonb)
            );
          WHEN 'claim_denied' THEN
            PERFORM public.notify_urgent_alert(
              NEW.thread_id,
              'adjuster_denied_claim',
              NEW.event_text
            );
          WHEN 'adjuster_unresponsive_72h' THEN
            PERFORM public.notify_missed_follow_up(
              NEW.thread_id,
              'adjuster',
              72
            );
          WHEN 'homeowner_replied_waiting' THEN
            PERFORM public.notify_missed_follow_up(
              NEW.thread_id,
              'homeowner',
              12
            );
        END CASE;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_notification_from_activity_feed ON public.activity_feed_events;
CREATE TRIGGER trg_notification_from_activity_feed
AFTER INSERT ON public.activity_feed_events
FOR EACH ROW
EXECUTE FUNCTION public.trigger_notification_from_activity_feed();

-- ============================================================================
-- PART 6 — Trigger on Proposal Sent
-- ============================================================================

-- Trigger function to notify when proposal is sent
CREATE OR REPLACE FUNCTION public.trigger_notification_proposal_sent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread record;
  v_user_id uuid;
BEGIN
  -- Only trigger when proposal status changes to 'sent'
  IF NEW.status = 'sent' AND (OLD.status IS NULL OR OLD.status != 'sent') THEN
    -- Get thread info
    SELECT * INTO v_thread
    FROM public.inbox_threads
    WHERE id = NEW.thread_id;
    
    IF FOUND THEN
      -- Get user
      SELECT user_id INTO v_user_id
      FROM public.workspace_members
      WHERE workspace_id = v_thread.workspace_id
      ORDER BY 
        CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 ELSE 3 END,
        created_at ASC
      LIMIT 1;
      
      IF v_user_id IS NOT NULL THEN
        -- Create notification for proposal sent (but don't notify immediately - wait for follow-up check)
        -- This will be handled by the missed follow-up detection
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on proposals table
DROP TRIGGER IF EXISTS trg_notification_proposal_sent ON public.proposals;
CREATE TRIGGER trg_notification_proposal_sent
AFTER UPDATE ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.trigger_notification_proposal_sent();

-- ============================================================================
-- PART 7 — Comments and Documentation
-- ============================================================================

COMMENT ON TABLE public.notifications IS 'SmartSend Roofing Notification Engine v1 - Real-time alerts for homeowner replies, claim approvals, adjuster responses, install-ready signals, and missed follow-ups';
COMMENT ON TABLE public.notification_frequency_tracking IS 'Tracks notification frequency to prevent spam and respect cooldown periods';
COMMENT ON FUNCTION public.should_send_notification IS 'Checks if notification should be sent based on frequency rules (anti-spam logic)';
COMMENT ON FUNCTION public.create_roofing_notification IS 'Core function to create roofing notifications with frequency checking';
COMMENT ON FUNCTION public.notify_homeowner_replied IS 'Creates notification when homeowner replies to proposal or message';
COMMENT ON FUNCTION public.notify_claim_approved IS 'Creates notification when insurance claim is approved';
COMMENT ON FUNCTION public.notify_adjuster_responded IS 'Creates notification when adjuster responds';
COMMENT ON FUNCTION public.notify_install_ready IS 'Creates notification when lead is install-ready';
COMMENT ON FUNCTION public.notify_missed_follow_up IS 'Creates notification for missed follow-ups (hot leads, homeowners, adjusters, proposals)';
COMMENT ON FUNCTION public.notify_supplement_opportunity IS 'Creates notification when supplement opportunity is detected';
COMMENT ON FUNCTION public.notify_urgent_alert IS 'Creates urgent alert notification (claim denied, leaks, complaints, etc.)';

-- ============================================================================
-- PART 8 — Helper Functions for Detection Logic
-- ============================================================================

-- Function to detect install-ready status
CREATE OR REPLACE FUNCTION public.detect_install_ready(
  p_thread_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread record;
  v_has_proposal boolean;
  v_has_homeowner_reply boolean;
  v_claim_approved boolean;
  v_deductible_known boolean;
BEGIN
  -- Get thread info
  SELECT * INTO v_thread
  FROM public.inbox_threads
  WHERE id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Check if proposal was sent
  SELECT EXISTS(
    SELECT 1 FROM public.proposals
    WHERE thread_id = p_thread_id
      AND status = 'sent'
  ) INTO v_has_proposal;
  
  -- Check if homeowner replied
  SELECT EXISTS(
    SELECT 1 FROM public.inbox_messages
    WHERE thread_id = p_thread_id
      AND direction = 'in'
      AND sent_at > (
        SELECT COALESCE(MAX(sent_at), '1970-01-01'::timestamptz)
        FROM public.proposals
        WHERE thread_id = p_thread_id AND status = 'sent'
      )
  ) INTO v_has_homeowner_reply;
  
  -- Check if claim is approved
  SELECT COALESCE(
    v_thread.insurance_status = 'approved',
    false
  ) INTO v_claim_approved;
  
  -- Check if deductible is known
  SELECT COALESCE(
    v_thread.insurance_deductible IS NOT NULL,
    false
  ) INTO v_deductible_known;
  
  -- Install-ready if: proposal sent + homeowner replied + insurance approved + deductible known
  RETURN v_has_proposal AND v_has_homeowner_reply AND v_claim_approved AND v_deductible_known;
END;
$$;

-- Function to detect missed follow-ups
CREATE OR REPLACE FUNCTION public.detect_missed_follow_ups()
RETURNS TABLE (
  thread_id uuid,
  follow_up_type text,
  hours_since_contact integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH follow_ups AS (
    -- Hot leads with no contact >24 hours
    SELECT 
      t.id as thread_id,
      'hot_lead'::text as follow_up_type,
      EXTRACT(EPOCH FROM (NOW() - t.last_message_at)) / 3600::integer as hours_since_contact
    FROM public.inbox_threads t
    WHERE t.last_message_at < NOW() - INTERVAL '24 hours'
      AND t.priority = 'hot'
      AND t.last_direction = 'out' -- We contacted them last
      
    UNION ALL
    
    -- Homeowners waiting >12 hours
    SELECT 
      t.id as thread_id,
      'homeowner'::text as follow_up_type,
      EXTRACT(EPOCH FROM (NOW() - t.last_message_at)) / 3600::integer as hours_since_contact
    FROM public.inbox_threads t
    WHERE t.last_message_at < NOW() - INTERVAL '12 hours'
      AND t.last_direction = 'in' -- They contacted us last
      
    UNION ALL
    
    -- Adjusters unresponsive for 48 hours
    SELECT 
      t.id as thread_id,
      'adjuster'::text as follow_up_type,
      EXTRACT(EPOCH FROM (NOW() - t.last_message_at)) / 3600::integer as hours_since_contact
    FROM public.inbox_threads t
    WHERE t.last_message_at < NOW() - INTERVAL '48 hours'
      AND t.insurance_adjuster_email IS NOT NULL
      AND t.last_direction = 'out'
      
    UNION ALL
    
    -- Proposals sent but no follow-up in 24 hours
    SELECT 
      p.thread_id,
      'proposal'::text as follow_up_type,
      EXTRACT(EPOCH FROM (NOW() - p.sent_at)) / 3600::integer as hours_since_contact
    FROM public.proposals p
    WHERE p.status = 'sent'
      AND p.sent_at < NOW() - INTERVAL '24 hours'
      AND NOT EXISTS (
        SELECT 1 FROM public.inbox_messages m
        WHERE m.thread_id = p.thread_id
          AND m.direction = 'out'
          AND m.sent_at > p.sent_at
      )
  )
  SELECT * FROM follow_ups;
END;
$$;

-- Function to check and create missed follow-up notifications (to be called by cron)
CREATE OR REPLACE FUNCTION public.check_and_notify_missed_follow_ups()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_follow_up record;
  v_count integer := 0;
BEGIN
  FOR v_follow_up IN 
    SELECT * FROM public.detect_missed_follow_ups()
  LOOP
    -- Create notification (function will handle frequency checking)
    PERFORM public.notify_missed_follow_up(
      v_follow_up.thread_id,
      v_follow_up.follow_up_type,
      v_follow_up.hours_since_contact::integer
    );
    v_count := v_count + 1;
  END LOOP;
  
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.detect_install_ready IS 'Detects if a thread is install-ready based on proposal sent, homeowner reply, claim approval, and deductible known';
COMMENT ON FUNCTION public.detect_missed_follow_ups IS 'Detects all missed follow-ups across hot leads, homeowners, adjusters, and proposals';
COMMENT ON FUNCTION public.check_and_notify_missed_follow_ups IS 'Checks for missed follow-ups and creates notifications (to be called by cron job)';

