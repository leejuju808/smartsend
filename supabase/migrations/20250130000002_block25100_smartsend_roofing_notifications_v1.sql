-- =========================================================
-- Block 25100 — SmartSend Roofing Notifications System v1
-- (Real-Time Push Notifications • Critical Alerts • Crew Updates • Material Alerts • Lead Replies • Owner Priority Signals)
-- =========================================================
--
-- THE INSTANT-REACTION SYSTEM — ZERO FLUFF.
--
-- This block builds the notification backbone SmartSend needs so roofers NEVER miss:
-- ✔ a hot lead
-- ✔ a homeowner reply
-- ✔ a delivery issue
-- ✔ a crew update
-- ✔ a weather risk
-- ✔ a job delay
-- ✔ a missed payment
-- ✔ an insurance update
--
-- Roofers live on their phones.
-- SmartSend must send the right notifications, at the right moment, with the right urgency.
-- =========================================================

-- ============================================================================
-- PART 1 — EXTEND NOTIFICATIONS TABLE WITH PRIORITY, ROLES, AND CHANNELS
-- ============================================================================

-- Add priority level (CRITICAL, IMPORTANT, STANDARD)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS priority text CHECK (priority IN ('critical', 'important', 'standard')) DEFAULT 'standard';

-- Add org_id for multi-tenant support
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Add role targeting (who should receive this notification)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS target_roles text[] DEFAULT ARRAY[]::text[];

-- Add delivery channels (push, in_app, email, sms)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS delivery_channels text[] DEFAULT ARRAY['in_app']::text[];

-- Add owner-only red bar alert flag
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS is_owner_red_bar boolean NOT NULL DEFAULT false;

-- Add notification category (lead, job, crew, supplier, weather, payment, insurance)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS category text CHECK (category IN ('lead', 'job', 'crew', 'supplier', 'weather', 'payment', 'insurance', 'system'));

-- Add crew_id, supplier_id, material_delivery_id references
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_id uuid,
  ADD COLUMN IF NOT EXISTS material_delivery_id uuid;

-- Add sent_at and delivered_at timestamps for delivery tracking
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- Update type CHECK constraint to include all new notification types
DO $$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'notifications_type_check' 
    AND conrelid = 'public.notifications'::regclass
  ) THEN
    ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
  END IF;
  
  -- Add new constraint with all notification types
  ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_type_check 
    CHECK (type IN (
      -- Lead Notifications
      'hot_lead', 'homeowner_replied', 'lead_opened_quote', 'lead_intent_detected',
      
      -- Job Notifications
      'job_status_changed', 'job_moved_to_approved', 'inspection_scheduled', 
      'install_confirmed', 'final_invoice_paid', 'job_at_risk',
      
      -- Crew Notifications
      'crew_arrived', 'crew_reporting_issue', 'crew_missing_docs', 'crew_check_in',
      'crew_check_out', 'crew_delay',
      
      -- Supplier Notifications
      'delivery_delayed', 'delivery_eta_changed', 'wrong_material_delivered',
      'material_shortage', 'delivery_failed', 'delivery_arrived',
      
      -- Weather Notifications
      'rain_expected', 'wind_unsafe', 'weather_alert', 'weather_clear',
      
      -- Payment Notifications
      'deposit_received', 'final_invoice_overdue', 'payment_overdue',
      'insurance_payment_posted', 'acv_check_missing', 'depreciation_check_missing',
      
      -- Insurance Notifications
      'supplement_approved', 'adjuster_requested_info', 'claim_stalled',
      'adjuster_delay_impacting_schedule', 'insurance_update',
      
      -- System Notifications (from existing system)
      'homeowner_replied', 'hot_lead', 'warm_lead', 'sms_received', 'thread_resurfaced',
      'task_assigned', 'task_due', 'task_overdue', 'task_completed',
      'missed_call', 'call_followup_due',
      'campaign_paused', 'campaign_limit_reached', 'deliverability_issue', 'warmup_warning',
      'billing_issue', 'plan_limit_reached', 'subscription_past_due',
      'claim_approved', 'adjuster_replied', 'install_ready',
      'missed_follow_up_hot_lead', 'missed_follow_up_homeowner', 'missed_follow_up_adjuster',
      'supplement_opportunity_detected', 'adjuster_denied_claim', 'homeowner_reported_leak',
      'homeowner_hired_another_company', 'homeowner_complained_delays',
      'system'
    ));
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON public.notifications(priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_org_priority ON public.notifications(org_id, priority, created_at DESC) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_red_bar ON public.notifications(is_owner_red_bar, created_at DESC) WHERE is_owner_red_bar = true;
CREATE INDEX IF NOT EXISTS idx_notifications_category ON public.notifications(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_target_roles ON public.notifications USING GIN(target_roles);
CREATE INDEX IF NOT EXISTS idx_notifications_delivery_channels ON public.notifications USING GIN(delivery_channels);
CREATE INDEX IF NOT EXISTS idx_notifications_crew ON public.notifications(crew_id, created_at DESC) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_job ON public.notifications(job_id, created_at DESC) WHERE job_id IS NOT NULL;

-- ============================================================================
-- PART 2 — NOTIFICATION PREFERENCES TABLE (User-level notification settings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Channel preferences
  enable_push boolean NOT NULL DEFAULT true,
  enable_email boolean NOT NULL DEFAULT true,
  enable_sms boolean NOT NULL DEFAULT false,
  enable_in_app boolean NOT NULL DEFAULT true,
  
  -- Priority preferences
  enable_critical boolean NOT NULL DEFAULT true,
  enable_important boolean NOT NULL DEFAULT true,
  enable_standard boolean NOT NULL DEFAULT true,
  
  -- Category preferences (JSONB for flexibility)
  category_preferences jsonb DEFAULT '{}'::jsonb,
  
  -- Quiet hours (don't send notifications during these hours)
  quiet_hours_start time DEFAULT NULL, -- e.g., '22:00:00'
  quiet_hours_end time DEFAULT NULL,   -- e.g., '06:00:00'
  
  -- Daily summary preferences
  enable_daily_summary boolean NOT NULL DEFAULT true,
  daily_summary_time time DEFAULT '06:00:00',
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON public.notification_preferences(user_id, org_id);

-- ============================================================================
-- PART 3 — DAILY SUMMARY TABLE (Stores daily summaries)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.daily_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  summary_date date NOT NULL DEFAULT CURRENT_DATE,
  
  -- Summary data (JSONB for flexibility)
  summary_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- Counts
  jobs_today_count int DEFAULT 0,
  jobs_at_risk_count int DEFAULT 0,
  overdue_payments_count int DEFAULT 0,
  overdue_payments_amount numeric(12,2) DEFAULT 0,
  insurance_updates_count int DEFAULT 0,
  weather_alerts_count int DEFAULT 0,
  tasks_due_count int DEFAULT 0,
  hot_leads_count int DEFAULT 0,
  warm_leads_count int DEFAULT 0,
  
  -- Status
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, org_id, summary_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_summaries_user_date ON public.daily_summaries(user_id, summary_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_org_date ON public.daily_summaries(org_id, summary_date DESC);

-- ============================================================================
-- PART 4 — OWNER RED BAR ALERTS TABLE (Persistent critical alerts for owners)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.owner_red_bar_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Alert details
  title text NOT NULL,
  message text NOT NULL,
  alert_type text NOT NULL CHECK (alert_type IN (
    'homeowner_angry', 'job_failing', 'safety_risk', 'legal_compliance_issue',
    'insurance_cancellation', 'missing_permit', 'repeated_crew_problems'
  )),
  
  -- Related entities
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  
  -- Status
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owner_red_bar_alerts_org ON public.owner_red_bar_alerts(org_id, is_resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_owner_red_bar_alerts_owner ON public.owner_red_bar_alerts(owner_user_id, is_resolved, created_at DESC);

-- ============================================================================
-- PART 5 — CORE NOTIFICATION CREATION FUNCTION WITH PRIORITY & ROLE ROUTING
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_smartsend_notification(
  p_org_id uuid,
  p_user_id uuid,
  p_category text,
  p_type text,
  p_priority text DEFAULT 'standard',
  p_title text,
  p_body text DEFAULT NULL,
  p_target_roles text[] DEFAULT ARRAY[]::text[],
  p_delivery_channels text[] DEFAULT ARRAY['in_app']::text[],
  p_is_owner_red_bar boolean DEFAULT false,
  p_lead_id uuid DEFAULT NULL,
  p_job_id uuid DEFAULT NULL,
  p_thread_id uuid DEFAULT NULL,
  p_crew_id uuid DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL,
  p_material_delivery_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_url text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_user_role text;
  v_should_notify boolean := false;
BEGIN
  -- Check if user should receive this notification based on role targeting
  IF array_length(p_target_roles, 1) > 0 THEN
    -- Get user's role in org
    SELECT role INTO v_user_role
    FROM public.organization_members
    WHERE org_id = p_org_id AND user_id = p_user_id
    LIMIT 1;
    
    -- Check if user's role matches target roles
    IF v_user_role IS NULL OR NOT (v_user_role = ANY(p_target_roles)) THEN
      -- User doesn't match target roles, skip notification
      RETURN NULL;
    END IF;
  END IF;
  
  -- Insert notification
  INSERT INTO public.notifications (
    org_id, user_id, category, type, priority, title, body,
    target_roles, delivery_channels, is_owner_red_bar,
    lead_id, job_id, thread_id, crew_id, supplier_id, material_delivery_id,
    payload, url, sent_at, created_at
  )
  VALUES (
    p_org_id, p_user_id, p_category, p_type, p_priority, p_title, p_body,
    p_target_roles, p_delivery_channels, p_is_owner_red_bar,
    p_lead_id, p_job_id, p_thread_id, p_crew_id, p_supplier_id, p_material_delivery_id,
    p_payload, p_url, now(), now()
  )
  RETURNING id INTO v_notification_id;
  
  -- If this is an owner red bar alert, also create entry in owner_red_bar_alerts
  IF p_is_owner_red_bar THEN
    INSERT INTO public.owner_red_bar_alerts (
      org_id, owner_user_id, title, message, alert_type,
      job_id, lead_id, thread_id, metadata
    )
    VALUES (
      p_org_id, p_user_id, p_title, COALESCE(p_body, p_title), 
      CASE 
        WHEN p_type LIKE '%angry%' OR p_type LIKE '%complaint%' THEN 'homeowner_angry'
        WHEN p_type LIKE '%failing%' OR p_type LIKE '%risk%' THEN 'job_failing'
        WHEN p_type LIKE '%safety%' THEN 'safety_risk'
        WHEN p_type LIKE '%legal%' OR p_type LIKE '%compliance%' THEN 'legal_compliance_issue'
        WHEN p_type LIKE '%insurance%' AND p_type LIKE '%cancel%' THEN 'insurance_cancellation'
        WHEN p_type LIKE '%permit%' THEN 'missing_permit'
        WHEN p_type LIKE '%crew%' AND p_type LIKE '%problem%' THEN 'repeated_crew_problems'
        ELSE 'job_failing'
      END,
      p_job_id, p_lead_id, p_thread_id, p_payload
    )
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN v_notification_id;
END;
$$;

-- ============================================================================
-- PART 6 — NOTIFICATION HELPER FUNCTIONS BY CATEGORY
-- ============================================================================

-- A) LEAD NOTIFICATIONS

CREATE OR REPLACE FUNCTION public.notify_hot_lead(
  p_org_id uuid,
  p_lead_id uuid,
  p_thread_id uuid DEFAULT NULL,
  p_contact_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_owner_id uuid;
  v_sales_rep_id uuid;
  v_title text;
BEGIN
  v_title := format('🔥 HOT LEAD: %s', COALESCE(p_contact_name, 'New lead'));
  
  -- Notify owner (CRITICAL)
  SELECT user_id INTO v_owner_id
  FROM public.organization_members
  WHERE org_id = p_org_id AND role = 'owner'
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_owner_id,
      p_category := 'lead',
      p_type := 'hot_lead',
      p_priority := 'critical',
      p_title := v_title,
      p_body := 'Urgent intent detected — respond immediately',
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_lead_id := p_lead_id,
      p_thread_id := p_thread_id,
      p_url := format('/inbox/replies?threadId=%s', COALESCE(p_thread_id, gen_random_uuid()))
    ) INTO v_notification_id;
  END IF;
  
  -- Notify sales reps (CRITICAL)
  FOR v_sales_rep_id IN
    SELECT user_id
    FROM public.organization_members
    WHERE org_id = p_org_id AND role IN ('sales_rep', 'sales')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_sales_rep_id,
      p_category := 'lead',
      p_type := 'hot_lead',
      p_priority := 'critical',
      p_title := v_title,
      p_body := 'Urgent intent detected — respond immediately',
      p_target_roles := ARRAY['sales_rep', 'sales'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_lead_id := p_lead_id,
      p_thread_id := p_thread_id,
      p_url := format('/inbox/replies?threadId=%s', COALESCE(p_thread_id, gen_random_uuid()))
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_homeowner_reply(
  p_org_id uuid,
  p_thread_id uuid,
  p_contact_name text DEFAULT NULL,
  p_message_preview text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_owner_id uuid;
  v_sales_rep_id uuid;
  v_title text;
BEGIN
  v_title := format('💬 %s replied', COALESCE(p_contact_name, 'Homeowner'));
  
  -- Notify owner (IMPORTANT)
  SELECT user_id INTO v_owner_id
  FROM public.organization_members
  WHERE org_id = p_org_id AND role = 'owner'
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_owner_id,
      p_category := 'lead',
      p_type := 'homeowner_replied',
      p_priority := 'important',
      p_title := v_title,
      p_body := COALESCE(p_message_preview, 'New message received'),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_thread_id := p_thread_id,
      p_url := format('/inbox/replies?threadId=%s', p_thread_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify sales reps (IMPORTANT)
  FOR v_sales_rep_id IN
    SELECT user_id
    FROM public.organization_members
    WHERE org_id = p_org_id AND role IN ('sales_rep', 'sales')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_sales_rep_id,
      p_category := 'lead',
      p_type := 'homeowner_replied',
      p_priority := 'important',
      p_title := v_title,
      p_body := COALESCE(p_message_preview, 'New message received'),
      p_target_roles := ARRAY['sales_rep', 'sales'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_thread_id := p_thread_id,
      p_url := format('/inbox/replies?threadId=%s', p_thread_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_lead_opened_quote(
  p_org_id uuid,
  p_lead_id uuid,
  p_contact_name text DEFAULT NULL,
  p_open_count int DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_sales_rep_id uuid;
  v_title text;
BEGIN
  v_title := format('👀 %s opened quote %s time%s', 
    COALESCE(p_contact_name, 'Lead'), 
    p_open_count,
    CASE WHEN p_open_count > 1 THEN 's' ELSE '' END
  );
  
  -- Notify sales reps (STANDARD)
  FOR v_sales_rep_id IN
    SELECT user_id
    FROM public.organization_members
    WHERE org_id = p_org_id AND role IN ('sales_rep', 'sales')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_sales_rep_id,
      p_category := 'lead',
      p_type := 'lead_opened_quote',
      p_priority := 'standard',
      p_title := v_title,
      p_body := 'Follow-up opportunity',
      p_target_roles := ARRAY['sales_rep', 'sales'],
      p_delivery_channels := ARRAY['in_app'],
      p_lead_id := p_lead_id,
      p_url := format('/leads/%s', p_lead_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- B) JOB NOTIFICATIONS

CREATE OR REPLACE FUNCTION public.notify_job_status_changed(
  p_org_id uuid,
  p_job_id uuid,
  p_old_status text,
  p_new_status text,
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_owner_id uuid;
  v_ops_manager_id uuid;
  v_title text;
  v_priority text;
BEGIN
  v_title := format('📋 Job moved: %s → %s', p_old_status, p_new_status);
  
  -- Determine priority based on status change
  IF p_new_status IN ('approved', 'install_confirmed', 'final_invoice_paid') THEN
    v_priority := 'important';
  ELSE
    v_priority := 'standard';
  END IF;
  
  -- Notify owner
  SELECT user_id INTO v_owner_id
  FROM public.organization_members
  WHERE org_id = p_org_id AND role = 'owner'
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_owner_id,
      p_category := 'job',
      p_type := 'job_status_changed',
      p_priority := v_priority,
      p_title := v_title,
      p_body := COALESCE(p_job_title, 'Job status updated'),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['in_app'],
      p_job_id := p_job_id,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify operations managers
  FOR v_ops_manager_id IN
    SELECT user_id
    FROM public.organization_members
    WHERE org_id = p_org_id AND role IN ('operations_manager', 'ops_manager', 'manager')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_ops_manager_id,
      p_category := 'job',
      p_type := 'job_status_changed',
      p_priority := v_priority,
      p_title := v_title,
      p_body := COALESCE(p_job_title, 'Job status updated'),
      p_target_roles := ARRAY['operations_manager', 'ops_manager', 'manager'],
      p_delivery_channels := ARRAY['in_app'],
      p_job_id := p_job_id,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_job_at_risk(
  p_org_id uuid,
  p_job_id uuid,
  p_risk_reason text,
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_owner_id uuid;
BEGIN
  -- Notify owner (CRITICAL + RED BAR)
  SELECT user_id INTO v_owner_id
  FROM public.organization_members
  WHERE org_id = p_org_id AND role = 'owner'
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_owner_id,
      p_category := 'job',
      p_type := 'job_at_risk',
      p_priority := 'critical',
      p_title := format('🔴 CRITICAL: Job at risk — %s', COALESCE(p_job_title, 'Review immediately')),
      p_body := p_risk_reason,
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_is_owner_red_bar := true,
      p_job_id := p_job_id,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  RETURN v_notification_id;
END;
$$;

-- C) CREW NOTIFICATIONS

CREATE OR REPLACE FUNCTION public.notify_crew_arrived(
  p_org_id uuid,
  p_job_id uuid,
  p_crew_id uuid,
  p_crew_name text DEFAULT NULL,
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_owner_id uuid;
  v_ops_manager_id uuid;
BEGIN
  -- Notify owner (STANDARD)
  SELECT user_id INTO v_owner_id
  FROM public.organization_members
  WHERE org_id = p_org_id AND role = 'owner'
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_owner_id,
      p_category := 'crew',
      p_type := 'crew_arrived',
      p_priority := 'standard',
      p_title := format('👷 %s on-site', COALESCE(p_crew_name, 'Crew')),
      p_body := COALESCE(p_job_title, 'Crew has arrived'),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['in_app'],
      p_job_id := p_job_id,
      p_crew_id := p_crew_id,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify operations managers (STANDARD)
  FOR v_ops_manager_id IN
    SELECT user_id
    FROM public.organization_members
    WHERE org_id = p_org_id AND role IN ('operations_manager', 'ops_manager', 'manager')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_ops_manager_id,
      p_category := 'crew',
      p_type := 'crew_arrived',
      p_priority := 'standard',
      p_title := format('👷 %s on-site', COALESCE(p_crew_name, 'Crew')),
      p_body := COALESCE(p_job_title, 'Crew has arrived'),
      p_target_roles := ARRAY['operations_manager', 'ops_manager', 'manager'],
      p_delivery_channels := ARRAY['in_app'],
      p_job_id := p_job_id,
      p_crew_id := p_crew_id,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_crew_issue(
  p_org_id uuid,
  p_job_id uuid,
  p_crew_id uuid,
  p_issue_description text,
  p_crew_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_owner_id uuid;
  v_ops_manager_id uuid;
BEGIN
  -- Notify owner (IMPORTANT)
  SELECT user_id INTO v_owner_id
  FROM public.organization_members
  WHERE org_id = p_org_id AND role = 'owner'
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_owner_id,
      p_category := 'crew',
      p_type := 'crew_reporting_issue',
      p_priority := 'important',
      p_title := format('⚠️ Crew issue: %s', COALESCE(p_crew_name, 'Crew')),
      p_body := p_issue_description,
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_job_id := p_job_id,
      p_crew_id := p_crew_id,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify operations managers (IMPORTANT)
  FOR v_ops_manager_id IN
    SELECT user_id
    FROM public.organization_members
    WHERE org_id = p_org_id AND role IN ('operations_manager', 'ops_manager', 'manager')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_ops_manager_id,
      p_category := 'crew',
      p_type := 'crew_reporting_issue',
      p_priority := 'important',
      p_title := format('⚠️ Crew issue: %s', COALESCE(p_crew_name, 'Crew')),
      p_body := p_issue_description,
      p_target_roles := ARRAY['operations_manager', 'ops_manager', 'manager'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_job_id := p_job_id,
      p_crew_id := p_crew_id,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- D) SUPPLIER NOTIFICATIONS

CREATE OR REPLACE FUNCTION public.notify_delivery_delayed(
  p_org_id uuid,
  p_job_id uuid,
  p_supplier_name text DEFAULT NULL,
  p_new_eta timestamptz DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_owner_id uuid;
  v_ops_manager_id uuid;
BEGIN
  -- Notify owner (IMPORTANT)
  SELECT user_id INTO v_owner_id
  FROM public.organization_members
  WHERE org_id = p_org_id AND role = 'owner'
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_owner_id,
      p_category := 'supplier',
      p_type := 'delivery_delayed',
      p_priority := 'important',
      p_title := format('📦 Delivery delayed%s', CASE WHEN p_supplier_name IS NOT NULL THEN format(': %s', p_supplier_name) ELSE '' END),
      p_body := format('New ETA: %s%s', 
        CASE WHEN p_new_eta IS NOT NULL THEN to_char(p_new_eta, 'Mon DD, YYYY HH:MI AM') ELSE 'TBD' END,
        CASE WHEN p_reason IS NOT NULL THEN format(' · %s', p_reason) ELSE '' END
      ),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_job_id := p_job_id,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify operations managers (IMPORTANT)
  FOR v_ops_manager_id IN
    SELECT user_id
    FROM public.organization_members
    WHERE org_id = p_org_id AND role IN ('operations_manager', 'ops_manager', 'manager')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_ops_manager_id,
      p_category := 'lead',
      p_type := 'delivery_delayed',
      p_priority := 'important',
      p_title := format('📦 Delivery delayed%s', CASE WHEN p_supplier_name IS NOT NULL THEN format(': %s', p_supplier_name) ELSE '' END),
      p_body := format('New ETA: %s%s', 
        CASE WHEN p_new_eta IS NOT NULL THEN to_char(p_new_eta, 'Mon DD, YYYY HH:MI AM') ELSE 'TBD' END,
        CASE WHEN p_reason IS NOT NULL THEN format(' · %s', p_reason) ELSE '' END
      ),
      p_target_roles := ARRAY['operations_manager', 'ops_manager', 'manager'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_job_id := p_job_id,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_material_shortage(
  p_org_id uuid,
  p_job_id uuid,
  p_missing_items text[],
  p_supplier_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_owner_id uuid;
  v_ops_manager_id uuid;
  v_missing_text text;
BEGIN
  v_missing_text := array_to_string(p_missing_items, ', ');
  
  -- Notify owner (CRITICAL)
  SELECT user_id INTO v_owner_id
  FROM public.organization_members
  WHERE org_id = p_org_id AND role = 'owner'
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_owner_id,
      p_category := 'supplier',
      p_type := 'material_shortage',
      p_priority := 'critical',
      p_title := format('🔴 Material shortage detected'),
      p_body := format('Missing: %s%s', v_missing_text, CASE WHEN p_supplier_name IS NOT NULL THEN format(' · Supplier: %s', p_supplier_name) ELSE '' END),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify operations managers (CRITICAL)
  FOR v_ops_manager_id IN
    SELECT user_id
    FROM public.organization_members
    WHERE org_id = p_org_id AND role IN ('operations_manager', 'ops_manager', 'manager')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_ops_manager_id,
      p_category := 'supplier',
      p_type := 'material_shortage',
      p_priority := 'critical',
      p_title := format('🔴 Material shortage detected'),
      p_body := format('Missing: %s%s', v_missing_text, CASE WHEN p_supplier_name IS NOT NULL THEN format(' · Supplier: %s', p_supplier_name) ELSE '' END),
      p_target_roles := ARRAY['operations_manager', 'ops_manager', 'manager'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- E) WEATHER NOTIFICATIONS

CREATE OR REPLACE FUNCTION public.notify_weather_alert(
  p_org_id uuid,
  p_job_id uuid,
  p_weather_type text, -- 'rain', 'wind', 'storm'
  p_forecast_date date,
  p_severity text DEFAULT 'moderate', -- 'moderate', 'severe'
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_owner_id uuid;
  v_ops_manager_id uuid;
  v_crew_lead_id uuid;
  v_title text;
  v_priority text;
BEGIN
  IF p_severity = 'severe' THEN
    v_priority := 'critical';
    v_title := format('🌧️ SEVERE WEATHER ALERT: %s expected %s', 
      INITCAP(p_weather_type),
      to_char(p_forecast_date, 'Mon DD')
    );
  ELSE
    v_priority := 'important';
    v_title := format('🌧️ Weather alert: %s expected %s', 
      INITCAP(p_weather_type),
      to_char(p_forecast_date, 'Mon DD')
    );
  END IF;
  
  -- Notify owner (CRITICAL/IMPORTANT)
  SELECT user_id INTO v_owner_id
  FROM public.organization_members
  WHERE org_id = p_org_id AND role = 'owner'
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_owner_id,
      p_category := 'weather',
      p_type := CASE WHEN p_weather_type = 'rain' THEN 'rain_expected' WHEN p_weather_type = 'wind' THEN 'wind_unsafe' ELSE 'weather_alert' END,
      p_priority := v_priority,
      p_title := v_title,
      p_body := format('Job at risk: %s', COALESCE(p_job_title, 'Review schedule')),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := CASE WHEN v_priority = 'critical' THEN ARRAY['push', 'sms', 'in_app'] ELSE ARRAY['push', 'in_app'] END,
      p_job_id := p_job_id,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify operations managers
  FOR v_ops_manager_id IN
    SELECT user_id
    FROM public.organization_members
    WHERE org_id = p_org_id AND role IN ('operations_manager', 'ops_manager', 'manager')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_ops_manager_id,
      p_category := 'weather',
      p_type := CASE WHEN p_weather_type = 'rain' THEN 'rain_expected' WHEN p_weather_type = 'wind' THEN 'wind_unsafe' ELSE 'weather_alert' END,
      p_priority := v_priority,
      p_title := v_title,
      p_body := format('Job at risk: %s', COALESCE(p_job_title, 'Review schedule')),
      p_target_roles := ARRAY['operations_manager', 'ops_manager', 'manager'],
      p_delivery_channels := CASE WHEN v_priority = 'critical' THEN ARRAY['push', 'sms', 'in_app'] ELSE ARRAY['push', 'in_app'] END,
      p_job_id := p_job_id,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  -- Notify crew leads
  FOR v_crew_lead_id IN
    SELECT DISTINCT cm.user_id
    FROM public.crew_members cm
    JOIN public.job_production_slots jps ON jps.crew_id = cm.crew_id
    WHERE jps.job_id = p_job_id AND cm.is_lead = true
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_crew_lead_id,
      p_category := 'weather',
      p_type := CASE WHEN p_weather_type = 'rain' THEN 'rain_expected' WHEN p_weather_type = 'wind' THEN 'wind_unsafe' ELSE 'weather_alert' END,
      p_priority := v_priority,
      p_title := v_title,
      p_body := format('Job at risk: %s', COALESCE(p_job_title, 'Review schedule')),
      p_target_roles := ARRAY['crew_lead'],
      p_delivery_channels := CASE WHEN v_priority = 'critical' THEN ARRAY['push', 'sms', 'in_app'] ELSE ARRAY['push', 'in_app'] END,
      p_job_id := p_job_id,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- F) PAYMENT NOTIFICATIONS

CREATE OR REPLACE FUNCTION public.notify_payment_overdue(
  p_org_id uuid,
  p_job_id uuid,
  p_amount numeric(12,2),
  p_days_overdue int DEFAULT NULL,
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_owner_id uuid;
BEGIN
  -- Notify owner (CRITICAL)
  SELECT user_id INTO v_owner_id
  FROM public.organization_members
  WHERE org_id = p_org_id AND role = 'owner'
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_owner_id,
      p_category := 'payment',
      p_type := 'payment_overdue',
      p_priority := 'critical',
      p_title := format('💰 Payment overdue: $%s', p_amount::text),
      p_body := format('%s%s', 
        COALESCE(p_job_title, 'Payment overdue'),
        CASE WHEN p_days_overdue IS NOT NULL THEN format(' · %s days overdue', p_days_overdue) ELSE '' END
      ),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_acv_check_missing(
  p_org_id uuid,
  p_job_id uuid,
  p_expected_amount numeric(12,2) DEFAULT NULL,
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_owner_id uuid;
  v_insurance_coord_id uuid;
BEGIN
  -- Notify owner (CRITICAL)
  SELECT user_id INTO v_owner_id
  FROM public.organization_members
  WHERE org_id = p_org_id AND role = 'owner'
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_owner_id,
      p_category := 'payment',
      p_type := 'acv_check_missing',
      p_priority := 'critical',
      p_title := format('💳 ACV check missing%s', CASE WHEN p_expected_amount IS NOT NULL THEN format(' ($%s)', p_expected_amount::text) ELSE '' END),
      p_body := COALESCE(p_job_title, 'ACV check not received'),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify insurance coordinators
  FOR v_insurance_coord_id IN
    SELECT user_id
    FROM public.organization_members
    WHERE org_id = p_org_id AND role IN ('insurance_coordinator', 'insurance')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_insurance_coord_id,
      p_category := 'payment',
      p_type := 'acv_check_missing',
      p_priority := 'critical',
      p_title := format('💳 ACV check missing%s', CASE WHEN p_expected_amount IS NOT NULL THEN format(' ($%s)', p_expected_amount::text) ELSE '' END),
      p_body := COALESCE(p_job_title, 'ACV check not received'),
      p_target_roles := ARRAY['insurance_coordinator', 'insurance'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- G) INSURANCE NOTIFICATIONS

CREATE OR REPLACE FUNCTION public.notify_adjuster_reply(
  p_org_id uuid,
  p_thread_id uuid,
  p_adjuster_name text DEFAULT NULL,
  p_message_preview text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_owner_id uuid;
  v_insurance_coord_id uuid;
BEGIN
  -- Notify owner (IMPORTANT)
  SELECT user_id INTO v_owner_id
  FROM public.organization_members
  WHERE org_id = p_org_id AND role = 'owner'
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_owner_id,
      p_category := 'insurance',
      p_type := 'adjuster_replied',
      p_priority := 'important',
      p_title := format('📧 Adjuster replied: %s', COALESCE(p_adjuster_name, 'Adjuster')),
      p_body := COALESCE(p_message_preview, 'New message from adjuster'),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_thread_id := p_thread_id,
      p_url := format('/inbox/replies?threadId=%s', p_thread_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify insurance coordinators (IMPORTANT)
  FOR v_insurance_coord_id IN
    SELECT user_id
    FROM public.organization_members
    WHERE org_id = p_org_id AND role IN ('insurance_coordinator', 'insurance')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_insurance_coord_id,
      p_category := 'insurance',
      p_type := 'adjuster_replied',
      p_priority := 'important',
      p_title := format('📧 Adjuster replied: %s', COALESCE(p_adjuster_name, 'Adjuster')),
      p_body := COALESCE(p_message_preview, 'New message from adjuster'),
      p_target_roles := ARRAY['insurance_coordinator', 'insurance'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_thread_id := p_thread_id,
      p_url := format('/inbox/replies?threadId=%s', p_thread_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_supplement_approved(
  p_org_id uuid,
  p_job_id uuid,
  p_supplement_amount numeric(12,2),
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_owner_id uuid;
  v_insurance_coord_id uuid;
BEGIN
  -- Notify owner (IMPORTANT)
  SELECT user_id INTO v_owner_id
  FROM public.organization_members
  WHERE org_id = p_org_id AND role = 'owner'
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_owner_id,
      p_category := 'insurance',
      p_type := 'supplement_approved',
      p_priority := 'important',
      p_title := format('✅ Supplement approved: +$%s', p_supplement_amount::text),
      p_body := COALESCE(p_job_title, 'Supplement approved'),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_job_id := p_job_id,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify insurance coordinators (IMPORTANT)
  FOR v_insurance_coord_id IN
    SELECT user_id
    FROM public.organization_members
    WHERE org_id = p_org_id AND role IN ('insurance_coordinator', 'insurance')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_insurance_coord_id,
      p_category := 'insurance',
      p_type := 'supplement_approved',
      p_priority := 'important',
      p_title := format('✅ Supplement approved: +$%s', p_supplement_amount::text),
      p_body := COALESCE(p_job_title, 'Supplement approved'),
      p_target_roles := ARRAY['insurance_coordinator', 'insurance'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_job_id := p_job_id,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_claim_stalled(
  p_org_id uuid,
  p_job_id uuid,
  p_days_stalled int,
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_owner_id uuid;
  v_insurance_coord_id uuid;
BEGIN
  -- Notify owner (CRITICAL)
  SELECT user_id INTO v_owner_id
  FROM public.organization_members
  WHERE org_id = p_org_id AND role = 'owner'
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_owner_id,
      p_category := 'insurance',
      p_type := 'claim_stalled',
      p_priority := 'critical',
      p_title := format('⏸️ Claim stalled for %s days', p_days_stalled),
      p_body := format('%s · Schedule impact', COALESCE(p_job_title, 'Claim stalled')),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify insurance coordinators (CRITICAL)
  FOR v_insurance_coord_id IN
    SELECT user_id
    FROM public.organization_members
    WHERE org_id = p_org_id AND role IN ('insurance_coordinator', 'insurance')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := p_org_id,
      p_user_id := v_insurance_coord_id,
      p_category := 'insurance',
      p_type := 'claim_stalled',
      p_priority := 'critical',
      p_title := format('⏸️ Claim stalled for %s days', p_days_stalled),
      p_body := format('%s · Schedule impact', COALESCE(p_job_title, 'Claim stalled')),
      p_target_roles := ARRAY['insurance_coordinator', 'insurance'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- ============================================================================
-- PART 7 — DAILY MORNING SUMMARY FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_daily_summary(
  p_org_id uuid,
  p_user_id uuid,
  p_summary_date date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_summary_id uuid;
  v_jobs_today_count int;
  v_jobs_at_risk_count int;
  v_overdue_payments_count int;
  v_overdue_payments_amount numeric(12,2);
  v_insurance_updates_count int;
  v_weather_alerts_count int;
  v_tasks_due_count int;
  v_hot_leads_count int;
  v_warm_leads_count int;
  v_summary_data jsonb;
BEGIN
  -- Count jobs today
  SELECT COUNT(*) INTO v_jobs_today_count
  FROM public.roofing_jobs
  WHERE org_id = p_org_id
    AND scheduled_date = p_summary_date
    AND status NOT IN ('cancelled', 'completed');
  
  -- Count jobs at risk
  SELECT COUNT(*) INTO v_jobs_at_risk_count
  FROM public.roofing_jobs
  WHERE org_id = p_org_id
    AND status NOT IN ('cancelled', 'completed')
    AND (
      -- Jobs with weather alerts
      EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.job_id = roofing_jobs.id
          AND n.category = 'weather'
          AND n.created_at::date = p_summary_date
      )
      -- Or jobs with material issues
      OR EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.job_id = roofing_jobs.id
          AND n.category = 'supplier'
          AND n.type IN ('material_shortage', 'delivery_failed')
          AND n.created_at::date = p_summary_date
      )
    );
  
  -- Count overdue payments
  SELECT 
    COUNT(*),
    COALESCE(SUM(amount), 0)
  INTO v_overdue_payments_count, v_overdue_payments_amount
  FROM public.roofing_jobs
  WHERE org_id = p_org_id
    AND payment_status = 'overdue'
    AND final_invoice_due_date < p_summary_date;
  
  -- Count insurance updates
  SELECT COUNT(*) INTO v_insurance_updates_count
  FROM public.notifications
  WHERE org_id = p_org_id
    AND category = 'insurance'
    AND created_at::date = p_summary_date - INTERVAL '1 day';
  
  -- Count weather alerts
  SELECT COUNT(*) INTO v_weather_alerts_count
  FROM public.notifications
  WHERE org_id = p_org_id
    AND category = 'weather'
    AND created_at::date = p_summary_date;
  
  -- Count tasks due
  SELECT COUNT(*) INTO v_tasks_due_count
  FROM public.tasks
  WHERE org_id = p_org_id
    AND due_at::date = p_summary_date
    AND status != 'completed';
  
  -- Count hot leads
  SELECT COUNT(*) INTO v_hot_leads_count
  FROM public.leads
  WHERE org_id = p_org_id
    AND status = 'hot'
    AND updated_at::date >= p_summary_date - INTERVAL '7 days';
  
  -- Count warm leads
  SELECT COUNT(*) INTO v_warm_leads_count
  FROM public.leads
  WHERE org_id = p_org_id
    AND status = 'warm'
    AND updated_at::date >= p_summary_date - INTERVAL '7 days';
  
  -- Build summary data
  v_summary_data := jsonb_build_object(
    'jobs_today', v_jobs_today_count,
    'jobs_at_risk', v_jobs_at_risk_count,
    'overdue_payments', jsonb_build_object(
      'count', v_overdue_payments_count,
      'amount', v_overdue_payments_amount
    ),
    'insurance_updates', v_insurance_updates_count,
    'weather_alerts', v_weather_alerts_count,
    'tasks_due', v_tasks_due_count,
    'hot_leads', v_hot_leads_count,
    'warm_leads', v_warm_leads_count
  );
  
  -- Insert or update daily summary
  INSERT INTO public.daily_summaries (
    user_id, org_id, summary_date,
    summary_data,
    jobs_today_count, jobs_at_risk_count,
    overdue_payments_count, overdue_payments_amount,
    insurance_updates_count, weather_alerts_count,
    tasks_due_count, hot_leads_count, warm_leads_count
  )
  VALUES (
    p_user_id, p_org_id, p_summary_date,
    v_summary_data,
    v_jobs_today_count, v_jobs_at_risk_count,
    v_overdue_payments_count, v_overdue_payments_amount,
    v_insurance_updates_count, v_weather_alerts_count,
    v_tasks_due_count, v_hot_leads_count, v_warm_leads_count
  )
  ON CONFLICT (user_id, org_id, summary_date)
  DO UPDATE SET
    summary_data = EXCLUDED.summary_data,
    jobs_today_count = EXCLUDED.jobs_today_count,
    jobs_at_risk_count = EXCLUDED.jobs_at_risk_count,
    overdue_payments_count = EXCLUDED.overdue_payments_count,
    overdue_payments_amount = EXCLUDED.overdue_payments_amount,
    insurance_updates_count = EXCLUDED.insurance_updates_count,
    weather_alerts_count = EXCLUDED.weather_alerts_count,
    tasks_due_count = EXCLUDED.tasks_due_count,
    hot_leads_count = EXCLUDED.hot_leads_count,
    warm_leads_count = EXCLUDED.warm_leads_count
  RETURNING id INTO v_summary_id;
  
  -- Create notification for daily summary
  PERFORM public.create_smartsend_notification(
    p_org_id := p_org_id,
    p_user_id := p_user_id,
    p_category := 'system',
    p_type := 'system',
    p_priority := 'standard',
    p_title := format('📊 Daily Summary — %s', to_char(p_summary_date, 'Mon DD, YYYY')),
    p_body := format('Jobs Today: %s | At Risk: %s | Payments: $%s overdue | Insurance: %s updates | Weather: %s alerts | Tasks: %s due | Leads: %s hot, %s warm',
      v_jobs_today_count,
      v_jobs_at_risk_count,
      v_overdue_payments_amount::text,
      v_insurance_updates_count,
      v_weather_alerts_count,
      v_tasks_due_count,
      v_hot_leads_count,
      v_warm_leads_count
    ),
    p_target_roles := ARRAY[]::text[],
    p_delivery_channels := ARRAY['in_app'],
    p_url := format('/dashboard?date=%s', p_summary_date)
  );
  
  RETURN v_summary_id;
END;
$$;

-- Function to send daily summaries to all users in org (called by cron at 6AM)
CREATE OR REPLACE FUNCTION public.send_daily_summaries_to_org(
  p_org_id uuid,
  p_summary_date date DEFAULT CURRENT_DATE
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_record RECORD;
  v_count int := 0;
BEGIN
  -- Get all users in org who have daily summary enabled
  FOR v_user_record IN
    SELECT om.user_id
    FROM public.organization_members om
    LEFT JOIN public.notification_preferences np ON np.user_id = om.user_id AND np.org_id = p_org_id
    WHERE om.org_id = p_org_id
      AND (np.enable_daily_summary IS NULL OR np.enable_daily_summary = true)
  LOOP
    PERFORM public.generate_daily_summary(p_org_id, v_user_record.user_id, p_summary_date);
    v_count := v_count + 1;
  END LOOP;
  
  RETURN v_count;
END;
$$;

-- ============================================================================
-- PART 8 — RLS POLICIES
-- ============================================================================

-- Notification preferences
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notification preferences"
  ON public.notification_preferences FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own notification preferences"
  ON public.notification_preferences FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own notification preferences"
  ON public.notification_preferences FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Daily summaries
ALTER TABLE public.daily_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own daily summaries"
  ON public.daily_summaries FOR SELECT
  USING (user_id = auth.uid());

-- Owner red bar alerts
ALTER TABLE public.owner_red_bar_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can view their own red bar alerts"
  ON public.owner_red_bar_alerts FOR SELECT
  USING (owner_user_id = auth.uid());

CREATE POLICY "Owners can update their own red bar alerts"
  ON public.owner_red_bar_alerts FOR UPDATE
  USING (owner_user_id = auth.uid());

-- ============================================================================
-- PART 9 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.notifications IS 'SmartSend Roofing Notifications System v1 — Real-time push notifications with priority levels, role-based routing, and multi-channel delivery';
COMMENT ON COLUMN public.notifications.priority IS 'Priority level: critical (instant push+SMS), important (push+in-app), standard (in-app only)';
COMMENT ON COLUMN public.notifications.target_roles IS 'Array of roles that should receive this notification (empty = all roles)';
COMMENT ON COLUMN public.notifications.delivery_channels IS 'Array of delivery channels: push, in_app, email, sms';
COMMENT ON COLUMN public.notifications.is_owner_red_bar IS 'If true, shows as persistent red alert bar at top of owner view';
COMMENT ON COLUMN public.notifications.category IS 'Notification category: lead, job, crew, supplier, weather, payment, insurance, system';

COMMENT ON TABLE public.notification_preferences IS 'User-level notification preferences for channels, priorities, categories, and quiet hours';
COMMENT ON TABLE public.daily_summaries IS 'Daily morning summaries sent at 6AM with jobs, payments, insurance updates, weather alerts, tasks, and leads';
COMMENT ON TABLE public.owner_red_bar_alerts IS 'Persistent critical alerts for owners (homeowner angry, job failing, safety risk, etc.)';

COMMENT ON FUNCTION public.create_smartsend_notification IS 'Core notification creation function with priority, role routing, and multi-channel delivery';
COMMENT ON FUNCTION public.generate_daily_summary IS 'Generates daily morning summary for a user with jobs, payments, insurance, weather, tasks, and leads';
COMMENT ON FUNCTION public.send_daily_summaries_to_org IS 'Sends daily summaries to all users in an org (called by cron at 6AM)';

-- ============================================================================
-- PART 10 — EVENT-DRIVEN TRIGGERS FOR REAL-TIME NOTIFICATIONS
-- ============================================================================

-- Trigger: Hot lead detected (from lead intent classifier)
CREATE OR REPLACE FUNCTION public.trigger_notify_hot_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_thread_id uuid;
  v_contact_name text;
BEGIN
  -- Only trigger on status change to 'hot'
  IF NEW.status = 'hot' AND (OLD.status IS NULL OR OLD.status != 'hot') THEN
    -- Get org_id and thread_id
    SELECT org_id INTO v_org_id FROM public.leads WHERE id = NEW.id;
    
    -- Get contact name
    SELECT first_name || ' ' || last_name INTO v_contact_name
    FROM public.contacts
    WHERE id = NEW.contact_id
    LIMIT 1;
    
    -- Get thread_id if available
    SELECT id INTO v_thread_id
    FROM public.inbox_threads
    WHERE lead_id = NEW.id
    LIMIT 1;
    
    IF v_org_id IS NOT NULL THEN
      PERFORM public.notify_hot_lead(v_org_id, NEW.id, v_thread_id, v_contact_name);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_hot_lead ON public.leads;
CREATE TRIGGER trg_notify_hot_lead
AFTER UPDATE OF status ON public.leads
FOR EACH ROW
WHEN (NEW.status = 'hot' AND (OLD.status IS NULL OR OLD.status != 'hot'))
EXECUTE FUNCTION public.trigger_notify_hot_lead();

-- Trigger: Homeowner replied (from inbox_messages)
CREATE OR REPLACE FUNCTION public.trigger_notify_homeowner_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_thread_id uuid;
  v_contact_name text;
BEGIN
  -- Only trigger on inbound messages
  IF NEW.direction = 'inbound' OR NEW.direction = 'in' THEN
    v_thread_id := NEW.thread_id;
    
    -- Get org_id and contact name from thread
    SELECT 
      t.workspace_id,
      c.first_name || ' ' || c.last_name
    INTO v_org_id, v_contact_name
    FROM public.inbox_threads t
    LEFT JOIN public.contacts c ON c.id = t.contact_id
    WHERE t.id = NEW.thread_id
    LIMIT 1;
    
    -- Get org_id from workspace if needed
    IF v_org_id IS NULL THEN
      SELECT org_id INTO v_org_id
      FROM public.workspaces
      WHERE id = (SELECT workspace_id FROM public.inbox_threads WHERE id = NEW.thread_id LIMIT 1)
      LIMIT 1;
    END IF;
    
    IF v_org_id IS NOT NULL AND v_thread_id IS NOT NULL THEN
      PERFORM public.notify_homeowner_reply(
        v_org_id, 
        v_thread_id, 
        v_contact_name,
        LEFT(NEW.body, 100) -- Message preview
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_homeowner_reply ON public.inbox_messages;
CREATE TRIGGER trg_notify_homeowner_reply
AFTER INSERT ON public.inbox_messages
FOR EACH ROW
WHEN (NEW.direction IN ('inbound', 'in'))
EXECUTE FUNCTION public.trigger_notify_homeowner_reply();

-- Trigger: Job status changed
CREATE OR REPLACE FUNCTION public.trigger_notify_job_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_job_title text;
BEGIN
  -- Only trigger on status change
  IF NEW.status != OLD.status THEN
    -- Get org_id from job
    SELECT org_id, title INTO v_org_id, v_job_title
    FROM public.roofing_jobs
    WHERE id = NEW.id
    LIMIT 1;
    
    IF v_org_id IS NOT NULL THEN
      PERFORM public.notify_job_status_changed(
        v_org_id,
        NEW.id,
        OLD.status,
        NEW.status,
        v_job_title
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_job_status_change ON public.roofing_jobs;
CREATE TRIGGER trg_notify_job_status_change
AFTER UPDATE OF status ON public.roofing_jobs
FOR EACH ROW
WHEN (NEW.status != OLD.status)
EXECUTE FUNCTION public.trigger_notify_job_status_change();

-- Trigger: Payment overdue (check on job update)
CREATE OR REPLACE FUNCTION public.trigger_check_payment_overdue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_job_title text;
  v_amount numeric(12,2);
  v_days_overdue int;
BEGIN
  -- Check if payment is overdue
  IF NEW.payment_status = 'overdue' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'overdue') THEN
    -- Get org_id and job details
    SELECT 
      org_id,
      title,
      final_invoice_amount,
      EXTRACT(EPOCH FROM (CURRENT_DATE - final_invoice_due_date)) / 86400::int
    INTO v_org_id, v_job_title, v_amount, v_days_overdue
    FROM public.roofing_jobs
    WHERE id = NEW.id
    LIMIT 1;
    
    IF v_org_id IS NOT NULL THEN
      PERFORM public.notify_payment_overdue(
        v_org_id,
        NEW.id,
        COALESCE(v_amount, 0),
        v_days_overdue,
        v_job_title
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_payment_overdue ON public.roofing_jobs;
CREATE TRIGGER trg_check_payment_overdue
AFTER UPDATE OF payment_status ON public.roofing_jobs
FOR EACH ROW
WHEN (NEW.payment_status = 'overdue' AND (OLD.payment_status IS NULL OR OLD.payment_status != 'overdue'))
EXECUTE FUNCTION public.trigger_check_payment_overdue();

-- Trigger: Adjuster replied (from inbox_messages with adjuster email)
CREATE OR REPLACE FUNCTION public.trigger_notify_adjuster_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_thread_id uuid;
  v_adjuster_email text;
  v_is_adjuster boolean;
BEGIN
  -- Only trigger on inbound messages
  IF NEW.direction IN ('inbound', 'in') THEN
    v_thread_id := NEW.thread_id;
    
    -- Check if sender is an adjuster
    SELECT 
      t.workspace_id,
      t.insurance_adjuster_email,
      (NEW.from_email = t.insurance_adjuster_email OR NEW.from_email LIKE '%adjuster%' OR NEW.from_email LIKE '%@%insurance%')
    INTO v_org_id, v_adjuster_email, v_is_adjuster
    FROM public.inbox_threads t
    WHERE t.id = NEW.thread_id
    LIMIT 1;
    
    -- Get org_id from workspace if needed
    IF v_org_id IS NULL THEN
      SELECT org_id INTO v_org_id
      FROM public.workspaces
      WHERE id = (SELECT workspace_id FROM public.inbox_threads WHERE id = NEW.thread_id LIMIT 1)
      LIMIT 1;
    END IF;
    
    IF v_org_id IS NOT NULL AND v_thread_id IS NOT NULL AND v_is_adjuster THEN
      PERFORM public.notify_adjuster_reply(
        v_org_id,
        v_thread_id,
        SPLIT_PART(COALESCE(v_adjuster_email, NEW.from_email), '@', 1), -- Adjuster name
        LEFT(NEW.body, 100) -- Message preview
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_adjuster_reply ON public.inbox_messages;
CREATE TRIGGER trg_notify_adjuster_reply
AFTER INSERT ON public.inbox_messages
FOR EACH ROW
WHEN (NEW.direction IN ('inbound', 'in'))
EXECUTE FUNCTION public.trigger_notify_adjuster_reply();

-- ============================================================================
-- PART 11 — CRON JOB SETUP (Daily summaries at 6AM)
-- ============================================================================

-- Note: This function should be called by pg_cron or Supabase Edge Function
-- Example cron job:
-- SELECT cron.schedule('send-daily-summaries', '0 6 * * *', $$
--   SELECT public.send_daily_summaries_to_org(org_id, CURRENT_DATE)
--   FROM public.organizations
--   WHERE is_active = true
-- $$);

-- ============================================================================
-- PART 12 — ENABLE REALTIME FOR NOTIFICATIONS
-- ============================================================================

-- Enable Realtime publication for notifications table
-- Note: This may need to be run manually in Supabase Dashboard if not already enabled
DO $$
BEGIN
  -- Add table to realtime publication if not already added
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- Check if table is already in publication
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND tablename = 'notifications'
    ) THEN
      -- Note: This requires superuser privileges, so we'll just document it
      -- Run manually: ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
      RAISE NOTICE 'Realtime publication exists. Ensure notifications table is added to supabase_realtime publication.';
    END IF;
  END IF;
END $$;

