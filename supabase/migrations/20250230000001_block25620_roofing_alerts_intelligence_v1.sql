-- =========================================================
-- Block 25620 — SmartSend Roofing Notifications & Alerts v1
-- (Smart Alerts • Job Risk Warnings • Crew Alerts • Owner Alerts • Payment Alerts • System-Wide Intelligence Pings)
-- =========================================================
-- 
-- THE ROOFING COMMAND-CENTER ALERT SYSTEM — ZERO FLUFF.
-- 
-- This block upgrades SmartSend into a live intelligence system that watches EVERY part 
-- of the roofing company and alerts the right person at the right time.
--
-- Roofers lose money and time because:
-- ❌ they miss homeowner replies
-- ❌ they miss payment reminders
-- ❌ they miss material shortages
-- ❌ they miss weather shifts
-- ❌ they miss job risks
-- ❌ they miss crew problems
-- ❌ they miss insurance document deadlines
-- ❌ they miss follow-ups
-- ❌ they miss scheduling issues
--
-- SmartSend Notifications & Alerts v1 fixes all of it by making SmartSend think for 
-- roofers and speak up when something needs attention.
-- =========================================================

-- ============================================================================
-- PART 1 — EXTEND ALERTS TABLE WITH INTELLIGENCE FIELDS
-- ============================================================================
-- Add fields to track alert intelligence, risk scores, and context

ALTER TABLE IF EXISTS public.notifications
  ADD COLUMN IF NOT EXISTS risk_score integer CHECK (risk_score >= 0 AND risk_score <= 100),
  ADD COLUMN IF NOT EXISTS alert_context jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS requires_action boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS action_taken boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS action_taken_at timestamptz,
  ADD COLUMN IF NOT EXISTS action_taken_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Add indexes for alert intelligence queries
CREATE INDEX IF NOT EXISTS idx_notifications_risk_score ON public.notifications(risk_score DESC) WHERE risk_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_requires_action ON public.notifications(requires_action, created_at DESC) WHERE requires_action = true;
CREATE INDEX IF NOT EXISTS idx_notifications_action_taken ON public.notifications(action_taken, action_taken_at DESC);

-- ============================================================================
-- PART 2 — CREATE ALERT INTELLIGENCE TABLE
-- ============================================================================
-- Stores intelligence about alerts, risk factors, and alert patterns

CREATE TABLE IF NOT EXISTS public.alert_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Alert type and context
  alert_type text NOT NULL,
  alert_category text NOT NULL,
  
  -- Related entities
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE CASCADE,
  
  -- Intelligence data
  risk_factors jsonb DEFAULT '{}'::jsonb, -- Array of risk factors detected
  recommended_actions text[], -- Recommended actions to resolve
  predicted_impact text, -- 'low', 'medium', 'high', 'critical'
  confidence_score numeric(3,2) CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
  
  -- Status
  is_resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_intelligence_workspace ON public.alert_intelligence(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_intelligence_job ON public.alert_intelligence(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alert_intelligence_unresolved ON public.alert_intelligence(workspace_id, is_resolved, created_at DESC) WHERE is_resolved = false;

-- ============================================================================
-- PART 3 — LEAD & SALES ALERT FUNCTIONS
-- ============================================================================

-- A) New Lead Alert (Instant ping to assign and follow up)
CREATE OR REPLACE FUNCTION public.alert_new_lead(
  p_workspace_id uuid,
  p_lead_id uuid,
  p_contact_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_owner_id uuid;
  v_sales_rep_id uuid;
BEGIN
  -- Get org_id from workspace
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Notify owner (CRITICAL)
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.workspace_id = p_workspace_id 
    AND EXISTS (
      SELECT 1 FROM public.organization_members om 
      WHERE om.org_id = w.org_id AND om.user_id = wm.user_id AND om.role = 'owner'
    )
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_owner_id,
      p_category := 'lead',
      p_type := 'hot_lead',
      p_priority := 'critical',
      p_title := format('🔥 NEW LEAD: %s', COALESCE(p_contact_name, 'Assign and follow up')),
      p_body := 'Instant ping — assign and follow up for highest close rate',
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_lead_id := p_lead_id,
      p_requires_action := true,
      p_url := format('/leads/%s', p_lead_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify sales reps (CRITICAL)
  FOR v_sales_rep_id IN
    SELECT wm.user_id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    JOIN public.organization_members om ON om.org_id = w.org_id AND om.user_id = wm.user_id
    WHERE wm.workspace_id = p_workspace_id 
      AND om.role IN ('sales_rep', 'sales')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_sales_rep_id,
      p_category := 'lead',
      p_type := 'hot_lead',
      p_priority := 'critical',
      p_title := format('🔥 NEW LEAD: %s', COALESCE(p_contact_name, 'Assign and follow up')),
      p_body := 'Instant ping — assign and follow up for highest close rate',
      p_target_roles := ARRAY['sales_rep', 'sales'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_lead_id := p_lead_id,
      p_requires_action := true,
      p_url := format('/leads/%s', p_lead_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- B) Lead Not Contacted Alert (15 minutes)
CREATE OR REPLACE FUNCTION public.alert_lead_not_contacted(
  p_workspace_id uuid,
  p_lead_id uuid,
  p_minutes_since_created int,
  p_contact_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_sales_rep_id uuid;
BEGIN
  -- Only alert if 15+ minutes
  IF p_minutes_since_created < 15 THEN
    RETURN NULL;
  END IF;
  
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Notify sales reps (CRITICAL)
  FOR v_sales_rep_id IN
    SELECT wm.user_id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    JOIN public.organization_members om ON om.org_id = w.org_id AND om.user_id = wm.user_id
    WHERE wm.workspace_id = p_workspace_id 
      AND om.role IN ('sales_rep', 'sales')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_sales_rep_id,
      p_category := 'lead',
      p_type := 'hot_lead',
      p_priority := 'critical',
      p_title := format('⏰ LEAD NOT CONTACTED: %s', COALESCE(p_contact_name, 'Contact lead NOW')),
      p_body := format('Contact lead NOW for highest close rate (%s minutes since created)', p_minutes_since_created),
      p_target_roles := ARRAY['sales_rep', 'sales'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_lead_id := p_lead_id,
      p_requires_action := true,
      p_risk_score := 90,
      p_url := format('/leads/%s', p_lead_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- C) Quote Viewed Alert
CREATE OR REPLACE FUNCTION public.alert_quote_viewed(
  p_workspace_id uuid,
  p_lead_id uuid,
  p_proposal_id uuid DEFAULT NULL,
  p_minutes_ago int DEFAULT NULL,
  p_contact_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_sales_rep_id uuid;
  v_title text;
BEGIN
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF p_minutes_ago IS NOT NULL THEN
    v_title := format('👀 %s opened quote %s minutes ago', COALESCE(p_contact_name, 'Homeowner'), p_minutes_ago);
  ELSE
    v_title := format('👀 %s opened quote', COALESCE(p_contact_name, 'Homeowner'));
  END IF;
  
  -- Notify sales reps (IMPORTANT)
  FOR v_sales_rep_id IN
    SELECT wm.user_id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    JOIN public.organization_members om ON om.org_id = w.org_id AND om.user_id = wm.user_id
    WHERE wm.workspace_id = p_workspace_id 
      AND om.role IN ('sales_rep', 'sales')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_sales_rep_id,
      p_category := 'lead',
      p_type := 'lead_opened_quote',
      p_priority := 'important',
      p_title := v_title,
      p_body := 'Follow up now for best conversion rate',
      p_target_roles := ARRAY['sales_rep', 'sales'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_lead_id := p_lead_id,
      p_requires_action := true,
      p_url := format('/leads/%s', p_lead_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- D) Hot Lead Behavior Alert
CREATE OR REPLACE FUNCTION public.alert_hot_lead_behavior(
  p_workspace_id uuid,
  p_lead_id uuid,
  p_behavior_signals text[],
  p_contact_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_owner_id uuid;
  v_sales_rep_id uuid;
  v_signals_text text;
BEGIN
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  v_signals_text := array_to_string(p_behavior_signals, ', ');
  
  -- Notify owner (CRITICAL)
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.workspace_id = p_workspace_id 
    AND EXISTS (
      SELECT 1 FROM public.organization_members om 
      WHERE om.org_id = w.org_id AND om.user_id = wm.user_id AND om.role = 'owner'
    )
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_owner_id,
      p_category := 'lead',
      p_type := 'hot_lead',
      p_priority := 'critical',
      p_title := format('🔥 HOT LEAD: %s', COALESCE(p_contact_name, 'This lead is heating up')),
      p_body := format('Strong intent detected: %s. Contact immediately.', v_signals_text),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_lead_id := p_lead_id,
      p_requires_action := true,
      p_risk_score := 95,
      p_url := format('/leads/%s', p_lead_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify sales reps (CRITICAL)
  FOR v_sales_rep_id IN
    SELECT wm.user_id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    JOIN public.organization_members om ON om.org_id = w.org_id AND om.user_id = wm.user_id
    WHERE wm.workspace_id = p_workspace_id 
      AND om.role IN ('sales_rep', 'sales')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_sales_rep_id,
      p_category := 'lead',
      p_type := 'hot_lead',
      p_priority := 'critical',
      p_title := format('🔥 HOT LEAD: %s', COALESCE(p_contact_name, 'This lead is heating up')),
      p_body := format('Strong intent detected: %s. Contact immediately.', v_signals_text),
      p_target_roles := ARRAY['sales_rep', 'sales'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_lead_id := p_lead_id,
      p_requires_action := true,
      p_risk_score := 95,
      p_url := format('/leads/%s', p_lead_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- ============================================================================
-- PART 4 — JOB RISK ALERT FUNCTIONS (Roofing-Specific AI)
-- ============================================================================

-- A) Weather Risk High Alert
CREATE OR REPLACE FUNCTION public.alert_weather_risk_high(
  p_workspace_id uuid,
  p_job_id uuid,
  p_weather_type text,
  p_forecast_time timestamptz,
  p_severity text DEFAULT 'high',
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_owner_id uuid;
  v_ops_manager_id uuid;
  v_crew_lead_id uuid;
  v_title text;
BEGIN
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  v_title := format('🌧️ WEATHER RISK HIGH: %s expected at %s', 
    INITCAP(p_weather_type),
    to_char(p_forecast_time, 'Mon DD, YYYY HH:MI AM')
  );
  
  -- Notify owner (CRITICAL)
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.workspace_id = p_workspace_id 
    AND EXISTS (
      SELECT 1 FROM public.organization_members om 
      WHERE om.org_id = w.org_id AND om.user_id = wm.user_id AND om.role = 'owner'
    )
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_owner_id,
      p_category := 'weather',
      p_type := 'rain_expected',
      p_priority := 'critical',
      p_title := v_title,
      p_body := format('Consider rescheduling job: %s', COALESCE(p_job_title, 'Review schedule')),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_requires_action := true,
      p_risk_score := CASE WHEN p_severity = 'severe' THEN 95 ELSE 80 END,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify operations managers (CRITICAL)
  FOR v_ops_manager_id IN
    SELECT wm.user_id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    JOIN public.organization_members om ON om.org_id = w.org_id AND om.user_id = wm.user_id
    WHERE wm.workspace_id = p_workspace_id 
      AND om.role IN ('operations_manager', 'ops_manager', 'manager')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_ops_manager_id,
      p_category := 'weather',
      p_type := 'rain_expected',
      p_priority := 'critical',
      p_title := v_title,
      p_body := format('Consider rescheduling job: %s', COALESCE(p_job_title, 'Review schedule')),
      p_target_roles := ARRAY['operations_manager', 'ops_manager', 'manager'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_requires_action := true,
      p_risk_score := CASE WHEN p_severity = 'severe' THEN 95 ELSE 80 END,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  -- Notify crew leads
  FOR v_crew_lead_id IN
    SELECT DISTINCT cm.user_id
    FROM public.crew_members cm
    JOIN public.job_crew_assignments jca ON jca.crew_id = cm.crew_id
    WHERE jca.job_id = p_job_id AND cm.is_lead = true
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_crew_lead_id,
      p_category := 'weather',
      p_type := 'rain_expected',
      p_priority := 'critical',
      p_title := v_title,
      p_body := format('Weather alert for job: %s', COALESCE(p_job_title, 'Review schedule')),
      p_target_roles := ARRAY['crew_lead'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_crew_id := (SELECT crew_id FROM public.job_crew_assignments WHERE job_id = p_job_id LIMIT 1),
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- B) Material Not Confirmed Alert
CREATE OR REPLACE FUNCTION public.alert_material_not_confirmed(
  p_workspace_id uuid,
  p_job_id uuid,
  p_material_order_id uuid DEFAULT NULL,
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_owner_id uuid;
  v_ops_manager_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Notify owner (CRITICAL)
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.workspace_id = p_workspace_id 
    AND EXISTS (
      SELECT 1 FROM public.organization_members om 
      WHERE om.org_id = w.org_id AND om.user_id = wm.user_id AND om.role = 'owner'
    )
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_owner_id,
      p_category := 'supplier',
      p_type := 'material_shortage',
      p_priority := 'critical',
      p_title := '🔴 MATERIAL NOT CONFIRMED: PO not confirmed — install at risk',
      p_body := format('Job: %s · Install cannot proceed without confirmed materials', COALESCE(p_job_title, 'Review immediately')),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_requires_action := true,
      p_risk_score := 90,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify operations managers (CRITICAL)
  FOR v_ops_manager_id IN
    SELECT wm.user_id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    JOIN public.organization_members om ON om.org_id = w.org_id AND om.user_id = wm.user_id
    WHERE wm.workspace_id = p_workspace_id 
      AND om.role IN ('operations_manager', 'ops_manager', 'manager')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_ops_manager_id,
      p_category := 'supplier',
      p_type := 'material_shortage',
      p_priority := 'critical',
      p_title := '🔴 MATERIAL NOT CONFIRMED: PO not confirmed — install at risk',
      p_body := format('Job: %s · Install cannot proceed without confirmed materials', COALESCE(p_job_title, 'Review immediately')),
      p_target_roles := ARRAY['operations_manager', 'ops_manager', 'manager'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_requires_action := true,
      p_risk_score := 90,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- C) Crew Not Checked In Alert
CREATE OR REPLACE FUNCTION public.alert_crew_not_checked_in(
  p_workspace_id uuid,
  p_job_id uuid,
  p_crew_id uuid,
  p_expected_start_time timestamptz,
  p_minutes_late int DEFAULT NULL,
  p_crew_name text DEFAULT NULL,
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_owner_id uuid;
  v_ops_manager_id uuid;
  v_title text;
BEGIN
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF p_minutes_late IS NOT NULL THEN
    v_title := format('⏰ CREW LATE: %s is %s minutes late', COALESCE(p_crew_name, 'Crew'), p_minutes_late);
  ELSE
    v_title := format('⏰ CREW NOT CHECKED IN: %s', COALESCE(p_crew_name, 'Crew'));
  END IF;
  
  -- Notify owner (IMPORTANT)
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.workspace_id = p_workspace_id 
    AND EXISTS (
      SELECT 1 FROM public.organization_members om 
      WHERE om.org_id = w.org_id AND om.user_id = wm.user_id AND om.role = 'owner'
    )
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_owner_id,
      p_category := 'crew',
      p_type := 'crew_delay',
      p_priority := 'important',
      p_title := v_title,
      p_body := format('Install start delayed · Job: %s', COALESCE(p_job_title, 'Review immediately')),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_job_id := p_job_id,
      p_crew_id := p_crew_id,
      p_requires_action := true,
      p_risk_score := 70,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify operations managers (IMPORTANT)
  FOR v_ops_manager_id IN
    SELECT wm.user_id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    JOIN public.organization_members om ON om.org_id = w.org_id AND om.user_id = wm.user_id
    WHERE wm.workspace_id = p_workspace_id 
      AND om.role IN ('operations_manager', 'ops_manager', 'manager')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_ops_manager_id,
      p_category := 'crew',
      p_type := 'crew_delay',
      p_priority := 'important',
      p_title := v_title,
      p_body := format('Install start delayed · Job: %s', COALESCE(p_job_title, 'Review immediately')),
      p_target_roles := ARRAY['operations_manager', 'ops_manager', 'manager'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_job_id := p_job_id,
      p_crew_id := p_crew_id,
      p_requires_action := true,
      p_risk_score := 70,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- D) Missing Cleanup Photos Alert
CREATE OR REPLACE FUNCTION public.alert_missing_cleanup_photos(
  p_workspace_id uuid,
  p_job_id uuid,
  p_crew_id uuid DEFAULT NULL,
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_owner_id uuid;
  v_ops_manager_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Notify owner (IMPORTANT)
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.workspace_id = p_workspace_id 
    AND EXISTS (
      SELECT 1 FROM public.organization_members om 
      WHERE om.org_id = w.org_id AND om.user_id = wm.user_id AND om.role = 'owner'
    )
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_owner_id,
      p_category := 'crew',
      p_type := 'crew_missing_docs',
      p_priority := 'important',
      p_title := '📸 MISSING CLEANUP PHOTOS: Crew marked job complete but cleanup photos missing',
      p_body := format('Job: %s · Cannot close job without cleanup documentation', COALESCE(p_job_title, 'Review immediately')),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_job_id := p_job_id,
      p_crew_id := p_crew_id,
      p_requires_action := true,
      p_risk_score := 60,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify operations managers (IMPORTANT)
  FOR v_ops_manager_id IN
    SELECT wm.user_id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    JOIN public.organization_members om ON om.org_id = w.org_id AND om.user_id = wm.user_id
    WHERE wm.workspace_id = p_workspace_id 
      AND om.role IN ('operations_manager', 'ops_manager', 'manager')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_ops_manager_id,
      p_category := 'crew',
      p_type := 'crew_missing_docs',
      p_priority := 'important',
      p_title := '📸 MISSING CLEANUP PHOTOS: Crew marked job complete but cleanup photos missing',
      p_body := format('Job: %s · Cannot close job without cleanup documentation', COALESCE(p_job_title, 'Review immediately')),
      p_target_roles := ARRAY['operations_manager', 'ops_manager', 'manager'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_job_id := p_job_id,
      p_crew_id := p_crew_id,
      p_requires_action := true,
      p_risk_score := 60,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- E) Permit Not Uploaded Alert
CREATE OR REPLACE FUNCTION public.alert_permit_not_uploaded(
  p_workspace_id uuid,
  p_job_id uuid,
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_owner_id uuid;
  v_ops_manager_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Notify owner (CRITICAL)
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.workspace_id = p_workspace_id 
    AND EXISTS (
      SELECT 1 FROM public.organization_members om 
      WHERE om.org_id = w.org_id AND om.user_id = wm.user_id AND om.role = 'owner'
    )
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_owner_id,
      p_category := 'job',
      p_type := 'job_at_risk',
      p_priority := 'critical',
      p_title := '📋 PERMIT NOT UPLOADED: Job cannot proceed without permit documentation',
      p_body := format('Job: %s · Upload permit immediately to avoid delays', COALESCE(p_job_title, 'Review immediately')),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_is_owner_red_bar := true,
      p_requires_action := true,
      p_risk_score := 95,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify operations managers (CRITICAL)
  FOR v_ops_manager_id IN
    SELECT wm.user_id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    JOIN public.organization_members om ON om.org_id = w.org_id AND om.user_id = wm.user_id
    WHERE wm.workspace_id = p_workspace_id 
      AND om.role IN ('operations_manager', 'ops_manager', 'manager')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_ops_manager_id,
      p_category := 'job',
      p_type := 'job_at_risk',
      p_priority := 'critical',
      p_title := '📋 PERMIT NOT UPLOADED: Job cannot proceed without permit documentation',
      p_body := format('Job: %s · Upload permit immediately to avoid delays', COALESCE(p_job_title, 'Review immediately')),
      p_target_roles := ARRAY['operations_manager', 'ops_manager', 'manager'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_requires_action := true,
      p_risk_score := 95,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- F) Labor Hours Exceed Target Alert
CREATE OR REPLACE FUNCTION public.alert_labor_hours_exceed_target(
  p_workspace_id uuid,
  p_job_id uuid,
  p_target_hours numeric,
  p_actual_hours numeric,
  p_percentage_over numeric DEFAULT NULL,
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_owner_id uuid;
  v_ops_manager_id uuid;
  v_title text;
BEGIN
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF p_percentage_over IS NOT NULL THEN
    v_title := format('⏱️ LABOR HOURS EXCEED TARGET: %s%% over budget', p_percentage_over::int);
  ELSE
    v_title := '⏱️ LABOR HOURS EXCEED TARGET: Crew labor cost rising';
  END IF;
  
  -- Notify owner (IMPORTANT)
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.workspace_id = p_workspace_id 
    AND EXISTS (
      SELECT 1 FROM public.organization_members om 
      WHERE om.org_id = w.org_id AND om.user_id = wm.user_id AND om.role = 'owner'
    )
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_owner_id,
      p_category := 'job',
      p_type := 'job_at_risk',
      p_priority := 'important',
      p_title := v_title,
      p_body := format('Job margin shrinking · Target: %s hrs, Actual: %s hrs · Job: %s', 
        p_target_hours, p_actual_hours, COALESCE(p_job_title, 'Review immediately')),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_job_id := p_job_id,
      p_requires_action := true,
      p_risk_score := 75,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify operations managers (IMPORTANT)
  FOR v_ops_manager_id IN
    SELECT wm.user_id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    JOIN public.organization_members om ON om.org_id = w.org_id AND om.user_id = wm.user_id
    WHERE wm.workspace_id = p_workspace_id 
      AND om.role IN ('operations_manager', 'ops_manager', 'manager')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_ops_manager_id,
      p_category := 'job',
      p_type := 'job_at_risk',
      p_priority := 'important',
      p_title := v_title,
      p_body := format('Job margin shrinking · Target: %s hrs, Actual: %s hrs · Job: %s', 
        p_target_hours, p_actual_hours, COALESCE(p_job_title, 'Review immediately')),
      p_target_roles := ARRAY['operations_manager', 'ops_manager', 'manager'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_job_id := p_job_id,
      p_requires_action := true,
      p_risk_score := 75,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- ============================================================================
-- PART 5 — MATERIAL & SUPPLIER ALERT FUNCTIONS
-- ============================================================================

-- A) Material Shortage Alert
CREATE OR REPLACE FUNCTION public.alert_material_shortage(
  p_workspace_id uuid,
  p_job_id uuid,
  p_missing_items text[],
  p_supplier_name text DEFAULT NULL,
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_owner_id uuid;
  v_ops_manager_id uuid;
  v_missing_text text;
BEGIN
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  v_missing_text := array_to_string(p_missing_items, ', ');
  
  -- Notify owner (CRITICAL)
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.workspace_id = p_workspace_id 
    AND EXISTS (
      SELECT 1 FROM public.organization_members om 
      WHERE om.org_id = w.org_id AND om.user_id = wm.user_id AND om.role = 'owner'
    )
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_owner_id,
      p_category := 'supplier',
      p_type := 'material_shortage',
      p_priority := 'critical',
      p_title := '🔴 MATERIAL SHORTAGE DETECTED',
      p_body := format('Missing: %s%s · Job: %s', 
        v_missing_text,
        CASE WHEN p_supplier_name IS NOT NULL THEN format(' · Supplier: %s', p_supplier_name) ELSE '' END,
        COALESCE(p_job_title, 'Review immediately')
      ),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_requires_action := true,
      p_risk_score := 90,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify operations managers (CRITICAL)
  FOR v_ops_manager_id IN
    SELECT wm.user_id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    JOIN public.organization_members om ON om.org_id = w.org_id AND om.user_id = wm.user_id
    WHERE wm.workspace_id = p_workspace_id 
      AND om.role IN ('operations_manager', 'ops_manager', 'manager')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_ops_manager_id,
      p_category := 'supplier',
      p_type := 'material_shortage',
      p_priority := 'critical',
      p_title := '🔴 MATERIAL SHORTAGE DETECTED',
      p_body := format('Missing: %s%s · Job: %s', 
        v_missing_text,
        CASE WHEN p_supplier_name IS NOT NULL THEN format(' · Supplier: %s', p_supplier_name) ELSE '' END,
        COALESCE(p_job_title, 'Review immediately')
      ),
      p_target_roles := ARRAY['operations_manager', 'ops_manager', 'manager'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_requires_action := true,
      p_risk_score := 90,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- B) Wrong Color Delivered Alert
CREATE OR REPLACE FUNCTION public.alert_wrong_color_delivered(
  p_workspace_id uuid,
  p_job_id uuid,
  p_expected_color text,
  p_delivered_color text,
  p_supplier_name text DEFAULT NULL,
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_owner_id uuid;
  v_ops_manager_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Notify owner (CRITICAL)
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.workspace_id = p_workspace_id 
    AND EXISTS (
      SELECT 1 FROM public.organization_members om 
      WHERE om.org_id = w.org_id AND om.user_id = wm.user_id AND om.role = 'owner'
    )
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_owner_id,
      p_category := 'supplier',
      p_type := 'wrong_material_delivered',
      p_priority := 'critical',
      p_title := '🎨 WRONG COLOR DELIVERED',
      p_body := format('Expected: %s, Delivered: %s%s · Job: %s', 
        p_expected_color,
        p_delivered_color,
        CASE WHEN p_supplier_name IS NOT NULL THEN format(' · Supplier: %s', p_supplier_name) ELSE '' END,
        COALESCE(p_job_title, 'Review immediately')
      ),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_requires_action := true,
      p_risk_score := 95,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify operations managers (CRITICAL)
  FOR v_ops_manager_id IN
    SELECT wm.user_id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    JOIN public.organization_members om ON om.org_id = w.org_id AND om.user_id = wm.user_id
    WHERE wm.workspace_id = p_workspace_id 
      AND om.role IN ('operations_manager', 'ops_manager', 'manager')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_ops_manager_id,
      p_category := 'supplier',
      p_type := 'wrong_material_delivered',
      p_priority := 'critical',
      p_title := '🎨 WRONG COLOR DELIVERED',
      p_body := format('Expected: %s, Delivered: %s%s · Job: %s', 
        p_expected_color,
        p_delivered_color,
        CASE WHEN p_supplier_name IS NOT NULL THEN format(' · Supplier: %s', p_supplier_name) ELSE '' END,
        COALESCE(p_job_title, 'Review immediately')
      ),
      p_target_roles := ARRAY['operations_manager', 'ops_manager', 'manager'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_requires_action := true,
      p_risk_score := 95,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- C) Supplier Delayed Alert
CREATE OR REPLACE FUNCTION public.alert_supplier_delayed(
  p_workspace_id uuid,
  p_job_id uuid,
  p_supplier_name text,
  p_original_eta date,
  p_new_eta date DEFAULT NULL,
  p_delay_days int DEFAULT NULL,
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_owner_id uuid;
  v_ops_manager_id uuid;
  v_title text;
BEGIN
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF p_delay_days IS NOT NULL THEN
    v_title := format('⏰ SUPPLIER DELAYED: %s is %s day%s late', 
      p_supplier_name, 
      p_delay_days,
      CASE WHEN p_delay_days > 1 THEN 's' ELSE '' END
    );
  ELSE
    v_title := format('⏰ SUPPLIER DELAYED: %s', p_supplier_name);
  END IF;
  
  -- Notify owner (CRITICAL)
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.workspace_id = p_workspace_id 
    AND EXISTS (
      SELECT 1 FROM public.organization_members om 
      WHERE om.org_id = w.org_id AND om.user_id = wm.user_id AND om.role = 'owner'
    )
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_owner_id,
      p_category := 'supplier',
      p_type := 'delivery_delayed',
      p_priority := 'critical',
      p_title := v_title,
      p_body := format('Original ETA: %s%s · Job: %s', 
        to_char(p_original_eta, 'Mon DD, YYYY'),
        CASE WHEN p_new_eta IS NOT NULL THEN format(' · New ETA: %s', to_char(p_new_eta, 'Mon DD, YYYY')) ELSE '' END,
        COALESCE(p_job_title, 'Review immediately')
      ),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_requires_action := true,
      p_risk_score := 85,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify operations managers (CRITICAL)
  FOR v_ops_manager_id IN
    SELECT wm.user_id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    JOIN public.organization_members om ON om.org_id = w.org_id AND om.user_id = wm.user_id
    WHERE wm.workspace_id = p_workspace_id 
      AND om.role IN ('operations_manager', 'ops_manager', 'manager')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_ops_manager_id,
      p_category := 'supplier',
      p_type := 'delivery_delayed',
      p_priority := 'critical',
      p_title := v_title,
      p_body := format('Original ETA: %s%s · Job: %s', 
        to_char(p_original_eta, 'Mon DD, YYYY'),
        CASE WHEN p_new_eta IS NOT NULL THEN format(' · New ETA: %s', to_char(p_new_eta, 'Mon DD, YYYY')) ELSE '' END,
        COALESCE(p_job_title, 'Review immediately')
      ),
      p_target_roles := ARRAY['operations_manager', 'ops_manager', 'manager'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_requires_action := true,
      p_risk_score := 85,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- D) Dumpster Not Delivered Alert
CREATE OR REPLACE FUNCTION public.alert_dumpster_not_delivered(
  p_workspace_id uuid,
  p_job_id uuid,
  p_expected_date date,
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_owner_id uuid;
  v_ops_manager_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Notify owner (IMPORTANT)
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.workspace_id = p_workspace_id 
    AND EXISTS (
      SELECT 1 FROM public.organization_members om 
      WHERE om.org_id = w.org_id AND om.user_id = wm.user_id AND om.role = 'owner'
    )
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_owner_id,
      p_category := 'supplier',
      p_type := 'delivery_delayed',
      p_priority := 'important',
      p_title := '🗑️ DUMPSTER NOT DELIVERED',
      p_body := format('Expected: %s · Job: %s', 
        to_char(p_expected_date, 'Mon DD, YYYY'),
        COALESCE(p_job_title, 'Review immediately')
      ),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_job_id := p_job_id,
      p_requires_action := true,
      p_risk_score := 70,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify operations managers (IMPORTANT)
  FOR v_ops_manager_id IN
    SELECT wm.user_id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    JOIN public.organization_members om ON om.org_id = w.org_id AND om.user_id = wm.user_id
    WHERE wm.workspace_id = p_workspace_id 
      AND om.role IN ('operations_manager', 'ops_manager', 'manager')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_ops_manager_id,
      p_category := 'supplier',
      p_type := 'delivery_delayed',
      p_priority := 'important',
      p_title := '🗑️ DUMPSTER NOT DELIVERED',
      p_body := format('Expected: %s · Job: %s', 
        to_char(p_expected_date, 'Mon DD, YYYY'),
        COALESCE(p_job_title, 'Review immediately')
      ),
      p_target_roles := ARRAY['operations_manager', 'ops_manager', 'manager'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_job_id := p_job_id,
      p_requires_action := true,
      p_risk_score := 70,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- ============================================================================
-- PART 6 — UPDATE create_smartsend_notification TO SUPPORT NEW FIELDS
-- ============================================================================
-- Extend the function to accept risk_score, requires_action, and alert_context

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
  p_url text DEFAULT NULL,
  p_risk_score integer DEFAULT NULL,
  p_requires_action boolean DEFAULT false,
  p_alert_context jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_user_role text;
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
  
  -- Insert notification with new fields
  INSERT INTO public.notifications (
    org_id, user_id, category, type, priority, title, body,
    target_roles, delivery_channels, is_owner_red_bar,
    lead_id, job_id, thread_id, crew_id, supplier_id, material_delivery_id,
    payload, url, sent_at, created_at,
    risk_score, requires_action, alert_context
  )
  VALUES (
    p_org_id, p_user_id, p_category, p_type, p_priority, p_title, p_body,
    p_target_roles, p_delivery_channels, p_is_owner_red_bar,
    p_lead_id, p_job_id, p_thread_id, p_crew_id, p_supplier_id, p_material_delivery_id,
    p_payload, p_url, now(), now(),
    p_risk_score, p_requires_action, p_alert_context
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
-- PART 7 — CREW ALERT FUNCTIONS
-- ============================================================================

-- A) Crew Briefing Alert (Tomorrow's job briefing)
CREATE OR REPLACE FUNCTION public.alert_crew_briefing(
  p_workspace_id uuid,
  p_job_id uuid,
  p_crew_id uuid,
  p_job_date date,
  p_weather_warning text DEFAULT NULL,
  p_material_status text DEFAULT NULL,
  p_special_instructions text DEFAULT NULL,
  p_crew_name text DEFAULT NULL,
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_crew_lead_id uuid;
  v_body text;
BEGIN
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  v_body := format('Job scheduled for %s', to_char(p_job_date, 'Mon DD, YYYY'));
  IF p_weather_warning IS NOT NULL THEN
    v_body := v_body || format(' · Weather: %s', p_weather_warning);
  END IF;
  IF p_material_status IS NOT NULL THEN
    v_body := v_body || format(' · Materials: %s', p_material_status);
  END IF;
  IF p_special_instructions IS NOT NULL THEN
    v_body := v_body || format(' · Special instructions: %s', p_special_instructions);
  END IF;
  
  -- Notify crew leads
  FOR v_crew_lead_id IN
    SELECT DISTINCT cm.user_id
    FROM public.crew_members cm
    WHERE cm.crew_id = p_crew_id AND cm.is_lead = true
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_crew_lead_id,
      p_category := 'crew',
      p_type := 'crew_check_in',
      p_priority := 'standard',
      p_title := format('📋 Tomorrow''s Job Briefing: %s', COALESCE(p_job_title, 'Job briefing')),
      p_body := v_body,
      p_target_roles := ARRAY['crew_lead'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_job_id := p_job_id,
      p_crew_id := p_crew_id,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- B) Crew Behind Schedule Alert
CREATE OR REPLACE FUNCTION public.alert_crew_behind_schedule(
  p_workspace_id uuid,
  p_job_id uuid,
  p_crew_id uuid,
  p_expected_progress numeric,
  p_actual_progress numeric,
  p_hours_behind numeric DEFAULT NULL,
  p_crew_name text DEFAULT NULL,
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_owner_id uuid;
  v_ops_manager_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Notify owner (IMPORTANT)
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.workspace_id = p_workspace_id 
    AND EXISTS (
      SELECT 1 FROM public.organization_members om 
      WHERE om.org_id = w.org_id AND om.user_id = wm.user_id AND om.role = 'owner'
    )
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_owner_id,
      p_category := 'crew',
      p_type := 'crew_delay',
      p_priority := 'important',
      p_title := format('⏰ CREW BEHIND SCHEDULE: %s', COALESCE(p_crew_name, 'Crew')),
      p_body := format('Expected: %s%%, Actual: %s%%%s · Job: %s', 
        p_expected_progress,
        p_actual_progress,
        CASE WHEN p_hours_behind IS NOT NULL THEN format(' · %s hours behind', p_hours_behind) ELSE '' END,
        COALESCE(p_job_title, 'Review immediately')
      ),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_job_id := p_job_id,
      p_crew_id := p_crew_id,
      p_requires_action := true,
      p_risk_score := 75,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify operations managers (IMPORTANT)
  FOR v_ops_manager_id IN
    SELECT wm.user_id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    JOIN public.organization_members om ON om.org_id = w.org_id AND om.user_id = wm.user_id
    WHERE wm.workspace_id = p_workspace_id 
      AND om.role IN ('operations_manager', 'ops_manager', 'manager')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_ops_manager_id,
      p_category := 'crew',
      p_type := 'crew_delay',
      p_priority := 'important',
      p_title := format('⏰ CREW BEHIND SCHEDULE: %s', COALESCE(p_crew_name, 'Crew')),
      p_body := format('Expected: %s%%, Actual: %s%%%s · Job: %s', 
        p_expected_progress,
        p_actual_progress,
        CASE WHEN p_hours_behind IS NOT NULL THEN format(' · %s hours behind', p_hours_behind) ELSE '' END,
        COALESCE(p_job_title, 'Review immediately')
      ),
      p_target_roles := ARRAY['operations_manager', 'ops_manager', 'manager'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_job_id := p_job_id,
      p_crew_id := p_crew_id,
      p_requires_action := true,
      p_risk_score := 75,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- ============================================================================
-- PART 8 — PAYMENT ALERT FUNCTIONS
-- ============================================================================

-- A) Homeowner Viewed Invoice Alert
CREATE OR REPLACE FUNCTION public.alert_invoice_viewed(
  p_workspace_id uuid,
  p_job_id uuid,
  p_invoice_id uuid,
  p_minutes_ago int DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_amount numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_owner_id uuid;
  v_title text;
BEGIN
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  IF p_minutes_ago IS NOT NULL THEN
    v_title := format('👀 %s viewed invoice %s minutes ago', COALESCE(p_contact_name, 'Homeowner'), p_minutes_ago);
  ELSE
    v_title := format('👀 %s viewed invoice', COALESCE(p_contact_name, 'Homeowner'));
  END IF;
  
  -- Notify owner (STANDARD)
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.workspace_id = p_workspace_id 
    AND EXISTS (
      SELECT 1 FROM public.organization_members om 
      WHERE om.org_id = w.org_id AND om.user_id = wm.user_id AND om.role = 'owner'
    )
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_owner_id,
      p_category := 'payment',
      p_type := 'payment_overdue',
      p_priority := 'standard',
      p_title := v_title,
      p_body := CASE WHEN p_amount IS NOT NULL THEN format('Amount: $%s · Follow up now', p_amount::text) ELSE 'Follow up now' END,
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['in_app'],
      p_job_id := p_job_id,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  RETURN v_notification_id;
END;
$$;

-- B) Payment Failed Alert
CREATE OR REPLACE FUNCTION public.alert_payment_failed(
  p_workspace_id uuid,
  p_job_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_failure_reason text DEFAULT NULL,
  p_contact_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_owner_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Notify owner (CRITICAL)
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.workspace_id = p_workspace_id 
    AND EXISTS (
      SELECT 1 FROM public.organization_members om 
      WHERE om.org_id = w.org_id AND om.user_id = wm.user_id AND om.role = 'owner'
    )
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_owner_id,
      p_category := 'payment',
      p_type := 'payment_overdue',
      p_priority := 'critical',
      p_title := format('💳 PAYMENT FAILED: $%s', p_amount::text),
      p_body := format('%s%s', 
        COALESCE(p_contact_name, 'Payment failed'),
        CASE WHEN p_failure_reason IS NOT NULL THEN format(' · Reason: %s', p_failure_reason) ELSE '' END
      ),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_requires_action := true,
      p_risk_score := 90,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  RETURN v_notification_id;
END;
$$;

-- C) ACV Check Received Alert
CREATE OR REPLACE FUNCTION public.alert_acv_check_received(
  p_workspace_id uuid,
  p_job_id uuid,
  p_amount numeric,
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_owner_id uuid;
  v_insurance_coord_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Notify owner (IMPORTANT)
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.workspace_id = p_workspace_id 
    AND EXISTS (
      SELECT 1 FROM public.organization_members om 
      WHERE om.org_id = w.org_id AND om.user_id = wm.user_id AND om.role = 'owner'
    )
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_owner_id,
      p_category := 'payment',
      p_type := 'insurance_payment_posted',
      p_priority := 'important',
      p_title := format('✅ ACV CHECK RECEIVED: $%s', p_amount::text),
      p_body := format('Job: %s', COALESCE(p_job_title, 'ACV check received')),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_job_id := p_job_id,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify insurance coordinators (IMPORTANT)
  FOR v_insurance_coord_id IN
    SELECT wm.user_id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    JOIN public.organization_members om ON om.org_id = w.org_id AND om.user_id = wm.user_id
    WHERE wm.workspace_id = p_workspace_id 
      AND om.role IN ('insurance_coordinator', 'insurance')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_insurance_coord_id,
      p_category := 'payment',
      p_type := 'insurance_payment_posted',
      p_priority := 'important',
      p_title := format('✅ ACV CHECK RECEIVED: $%s', p_amount::text),
      p_body := format('Job: %s', COALESCE(p_job_title, 'ACV check received')),
      p_target_roles := ARRAY['insurance_coordinator', 'insurance'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_job_id := p_job_id,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- D) Depreciation Pending Alert
CREATE OR REPLACE FUNCTION public.alert_depreciation_pending(
  p_workspace_id uuid,
  p_job_id uuid,
  p_expected_amount numeric DEFAULT NULL,
  p_days_since_completion int DEFAULT NULL,
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_owner_id uuid;
  v_insurance_coord_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Notify owner (IMPORTANT)
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.workspace_id = p_workspace_id 
    AND EXISTS (
      SELECT 1 FROM public.organization_members om 
      WHERE om.org_id = w.org_id AND om.user_id = wm.user_id AND om.role = 'owner'
    )
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_owner_id,
      p_category := 'payment',
      p_type := 'depreciation_check_missing',
      p_priority := 'important',
      p_title := format('⏳ DEPRECIATION PENDING%s', CASE WHEN p_expected_amount IS NOT NULL THEN format(' ($%s)', p_expected_amount::text) ELSE '' END),
      p_body := format('Job: %s%s', 
        COALESCE(p_job_title, 'Depreciation check pending'),
        CASE WHEN p_days_since_completion IS NOT NULL THEN format(' · %s days since completion', p_days_since_completion) ELSE '' END
      ),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_job_id := p_job_id,
      p_requires_action := true,
      p_risk_score := 70,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify insurance coordinators (IMPORTANT)
  FOR v_insurance_coord_id IN
    SELECT wm.user_id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    JOIN public.organization_members om ON om.org_id = w.org_id AND om.user_id = wm.user_id
    WHERE wm.workspace_id = p_workspace_id 
      AND om.role IN ('insurance_coordinator', 'insurance')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_insurance_coord_id,
      p_category := 'payment',
      p_type := 'depreciation_check_missing',
      p_priority := 'important',
      p_title := format('⏳ DEPRECIATION PENDING%s', CASE WHEN p_expected_amount IS NOT NULL THEN format(' ($%s)', p_expected_amount::text) ELSE '' END),
      p_body := format('Job: %s%s', 
        COALESCE(p_job_title, 'Depreciation check pending'),
        CASE WHEN p_days_since_completion IS NOT NULL THEN format(' · %s days since completion', p_days_since_completion) ELSE '' END
      ),
      p_target_roles := ARRAY['insurance_coordinator', 'insurance'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_job_id := p_job_id,
      p_requires_action := true,
      p_risk_score := 70,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- ============================================================================
-- PART 9 — INSURANCE ALERT FUNCTIONS
-- ============================================================================

-- A) Supplement Ready Alert
CREATE OR REPLACE FUNCTION public.alert_supplement_ready(
  p_workspace_id uuid,
  p_job_id uuid,
  p_supplement_amount numeric,
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_owner_id uuid;
  v_insurance_coord_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Notify owner (IMPORTANT)
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.workspace_id = p_workspace_id 
    AND EXISTS (
      SELECT 1 FROM public.organization_members om 
      WHERE om.org_id = w.org_id AND om.user_id = wm.user_id AND om.role = 'owner'
    )
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_owner_id,
      p_category := 'insurance',
      p_type := 'supplement_approved',
      p_priority := 'important',
      p_title := format('📄 SUPPLEMENT READY: $%s', p_supplement_amount::text),
      p_body := format('Job: %s · Ready to submit', COALESCE(p_job_title, 'Supplement ready')),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_job_id := p_job_id,
      p_requires_action := true,
      p_risk_score := 60,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify insurance coordinators (IMPORTANT)
  FOR v_insurance_coord_id IN
    SELECT wm.user_id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    JOIN public.organization_members om ON om.org_id = w.org_id AND om.user_id = wm.user_id
    WHERE wm.workspace_id = p_workspace_id 
      AND om.role IN ('insurance_coordinator', 'insurance')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_insurance_coord_id,
      p_category := 'insurance',
      p_type := 'supplement_approved',
      p_priority := 'important',
      p_title := format('📄 SUPPLEMENT READY: $%s', p_supplement_amount::text),
      p_body := format('Job: %s · Ready to submit', COALESCE(p_job_title, 'Supplement ready')),
      p_target_roles := ARRAY['insurance_coordinator', 'insurance'],
      p_delivery_channels := ARRAY['push', 'in_app'],
      p_job_id := p_job_id,
      p_requires_action := true,
      p_risk_score := 60,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- B) Supplement Denied Alert
CREATE OR REPLACE FUNCTION public.alert_supplement_denied(
  p_workspace_id uuid,
  p_job_id uuid,
  p_denial_reason text DEFAULT NULL,
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_owner_id uuid;
  v_insurance_coord_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Notify owner (CRITICAL)
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.workspace_id = p_workspace_id 
    AND EXISTS (
      SELECT 1 FROM public.organization_members om 
      WHERE om.org_id = w.org_id AND om.user_id = wm.user_id AND om.role = 'owner'
    )
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_owner_id,
      p_category := 'insurance',
      p_type := 'adjuster_denied_claim',
      p_priority := 'critical',
      p_title := '❌ SUPPLEMENT DENIED',
      p_body := format('Job: %s%s', 
        COALESCE(p_job_title, 'Supplement denied'),
        CASE WHEN p_denial_reason IS NOT NULL THEN format(' · Reason: %s', p_denial_reason) ELSE '' END
      ),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_is_owner_red_bar := true,
      p_requires_action := true,
      p_risk_score := 90,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify insurance coordinators (CRITICAL)
  FOR v_insurance_coord_id IN
    SELECT wm.user_id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    JOIN public.organization_members om ON om.org_id = w.org_id AND om.user_id = wm.user_id
    WHERE wm.workspace_id = p_workspace_id 
      AND om.role IN ('insurance_coordinator', 'insurance')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_insurance_coord_id,
      p_category := 'insurance',
      p_type := 'adjuster_denied_claim',
      p_priority := 'critical',
      p_title := '❌ SUPPLEMENT DENIED',
      p_body := format('Job: %s%s', 
        COALESCE(p_job_title, 'Supplement denied'),
        CASE WHEN p_denial_reason IS NOT NULL THEN format(' · Reason: %s', p_denial_reason) ELSE '' END
      ),
      p_target_roles := ARRAY['insurance_coordinator', 'insurance'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_requires_action := true,
      p_risk_score := 90,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- C) Missing Documentation Alert
CREATE OR REPLACE FUNCTION public.alert_missing_documentation(
  p_workspace_id uuid,
  p_job_id uuid,
  p_missing_docs text[],
  p_doc_type text DEFAULT NULL, -- 'scope_of_loss', 'permit', 'photos', etc.
  p_job_title text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_owner_id uuid;
  v_insurance_coord_id uuid;
  v_docs_text text;
BEGIN
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  v_docs_text := array_to_string(p_missing_docs, ', ');
  
  -- Notify owner (CRITICAL)
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.workspace_id = p_workspace_id 
    AND EXISTS (
      SELECT 1 FROM public.organization_members om 
      WHERE om.org_id = w.org_id AND om.user_id = wm.user_id AND om.role = 'owner'
    )
  LIMIT 1;
  
  IF v_owner_id IS NOT NULL THEN
    SELECT public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_owner_id,
      p_category := 'insurance',
      p_type := 'adjuster_requested_info',
      p_priority := 'critical',
      p_title := format('📋 MISSING DOCUMENTATION: %s', COALESCE(p_doc_type, 'Required documents')),
      p_body := format('Missing: %s · Job: %s', v_docs_text, COALESCE(p_job_title, 'Review immediately')),
      p_target_roles := ARRAY['owner'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_is_owner_red_bar := true,
      p_requires_action := true,
      p_risk_score := 95,
      p_url := format('/jobs/%s', p_job_id)
    ) INTO v_notification_id;
  END IF;
  
  -- Notify insurance coordinators (CRITICAL)
  FOR v_insurance_coord_id IN
    SELECT wm.user_id
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    JOIN public.organization_members om ON om.org_id = w.org_id AND om.user_id = wm.user_id
    WHERE wm.workspace_id = p_workspace_id 
      AND om.role IN ('insurance_coordinator', 'insurance')
  LOOP
    PERFORM public.create_smartsend_notification(
      p_org_id := v_org_id,
      p_user_id := v_insurance_coord_id,
      p_category := 'insurance',
      p_type := 'adjuster_requested_info',
      p_priority := 'critical',
      p_title := format('📋 MISSING DOCUMENTATION: %s', COALESCE(p_doc_type, 'Required documents')),
      p_body := format('Missing: %s · Job: %s', v_docs_text, COALESCE(p_job_title, 'Review immediately')),
      p_target_roles := ARRAY['insurance_coordinator', 'insurance'],
      p_delivery_channels := ARRAY['push', 'sms', 'in_app'],
      p_job_id := p_job_id,
      p_requires_action := true,
      p_risk_score := 95,
      p_url := format('/jobs/%s', p_job_id)
    );
  END LOOP;
  
  RETURN v_notification_id;
END;
$$;

-- ============================================================================
-- PART 10 — OWNER DAILY BRIEFING FUNCTION
-- ============================================================================
-- Generates comprehensive daily intelligence briefing for owners

CREATE OR REPLACE FUNCTION public.generate_owner_daily_briefing(
  p_workspace_id uuid,
  p_briefing_date date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
  v_org_id uuid;
  v_owner_id uuid;
  v_briefing_data jsonb;
  v_title text;
  v_body text;
  
  -- Metrics
  v_hot_leads_count int := 0;
  v_jobs_at_risk_count int := 0;
  v_jobs_ready_to_close_count int := 0;
  v_invoices_overdue_count int := 0;
  v_invoices_overdue_amount numeric := 0;
  v_crews_behind_schedule_count int := 0;
  v_weather_alert_jobs_count int := 0;
  v_material_shortage_jobs_count int := 0;
  v_insurance_delays_count int := 0;
  v_revenue_forecast_change numeric := 0;
BEGIN
  SELECT org_id INTO v_org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1;
  
  IF v_org_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Get owner
  SELECT user_id INTO v_owner_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.workspace_id = p_workspace_id 
    AND EXISTS (
      SELECT 1 FROM public.organization_members om 
      WHERE om.org_id = w.org_id AND om.user_id = wm.user_id AND om.role = 'owner'
    )
  LIMIT 1;
  
  IF v_owner_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Count hot leads (last 7 days)
  SELECT COUNT(*) INTO v_hot_leads_count
  FROM public.leads l
  JOIN public.workspaces w ON w.id = l.workspace_id
  WHERE l.workspace_id = p_workspace_id
    AND l.status = 'hot'
    AND l.updated_at >= p_briefing_date - INTERVAL '7 days';
  
  -- Count jobs at risk
  SELECT COUNT(*) INTO v_jobs_at_risk_count
  FROM public.roofing_jobs rj
  WHERE rj.workspace_id = p_workspace_id
    AND rj.status NOT IN ('completed', 'cancelled')
    AND (
      -- Jobs with high-risk alerts
      EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.job_id = rj.id
          AND n.risk_score >= 80
          AND n.created_at::date >= p_briefing_date - INTERVAL '1 day'
      )
      -- Or jobs with material issues
      OR EXISTS (
        SELECT 1 FROM public.material_orders mo
        WHERE mo.job_id = rj.id
          AND mo.status IN ('delayed', 'issue_reported')
      )
      -- Or jobs with weather alerts
      OR EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.job_id = rj.id
          AND n.category = 'weather'
          AND n.priority = 'critical'
          AND n.created_at::date >= p_briefing_date - INTERVAL '1 day'
      )
    );
  
  -- Count jobs ready to close
  SELECT COUNT(*) INTO v_jobs_ready_to_close_count
  FROM public.roofing_jobs rj
  WHERE rj.workspace_id = p_workspace_id
    AND rj.status = 'in_progress'
    AND EXISTS (
      SELECT 1 FROM public.crew_check_ins cci
      WHERE cci.job_id = rj.id
        AND cci.status = 'completed'
        AND cci.cleanup_confirmed = true
    );
  
  -- Count overdue invoices
  SELECT 
    COUNT(*),
    COALESCE(SUM(ji.amount), 0)
  INTO v_invoices_overdue_count, v_invoices_overdue_amount
  FROM public.job_invoices ji
  JOIN public.roofing_jobs rj ON rj.id = ji.job_id
  WHERE rj.workspace_id = p_workspace_id
    AND ji.status = 'overdue'
    AND ji.due_date < p_briefing_date;
  
  -- Count crews behind schedule
  SELECT COUNT(DISTINCT jca.crew_id) INTO v_crews_behind_schedule_count
  FROM public.job_crew_assignments jca
  JOIN public.roofing_jobs rj ON rj.id = jca.job_id
  WHERE rj.workspace_id = p_workspace_id
    AND rj.status = 'in_progress'
    AND EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.job_id = rj.id
        AND n.type = 'crew_delay'
        AND n.created_at::date >= p_briefing_date - INTERVAL '1 day'
    );
  
  -- Count weather alert jobs
  SELECT COUNT(DISTINCT n.job_id) INTO v_weather_alert_jobs_count
  FROM public.notifications n
  JOIN public.roofing_jobs rj ON rj.id = n.job_id
  WHERE rj.workspace_id = p_workspace_id
    AND n.category = 'weather'
    AND n.priority = 'critical'
    AND n.created_at::date >= p_briefing_date - INTERVAL '1 day';
  
  -- Count material shortage jobs
  SELECT COUNT(DISTINCT n.job_id) INTO v_material_shortage_jobs_count
  FROM public.notifications n
  JOIN public.roofing_jobs rj ON rj.id = n.job_id
  WHERE rj.workspace_id = p_workspace_id
    AND n.category = 'supplier'
    AND n.type = 'material_shortage'
    AND n.created_at::date >= p_briefing_date - INTERVAL '1 day';
  
  -- Count insurance delays
  SELECT COUNT(*) INTO v_insurance_delays_count
  FROM public.job_insurance_claims jic
  JOIN public.roofing_jobs rj ON rj.id = jic.job_id
  WHERE rj.workspace_id = p_workspace_id
    AND jic.claim_status IN ('awaiting_acv', 'awaiting_rcv', 'awaiting_supplement')
    AND EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.job_id = rj.id
        AND n.category = 'insurance'
        AND n.type IN ('claim_stalled', 'acv_check_missing', 'depreciation_check_missing')
        AND n.created_at::date >= p_briefing_date - INTERVAL '7 days'
    );
  
  -- Build briefing data
  v_briefing_data := jsonb_build_object(
    'hot_leads', v_hot_leads_count,
    'jobs_at_risk', v_jobs_at_risk_count,
    'jobs_ready_to_close', v_jobs_ready_to_close_count,
    'invoices_overdue', jsonb_build_object(
      'count', v_invoices_overdue_count,
      'amount', v_invoices_overdue_amount
    ),
    'crews_behind_schedule', v_crews_behind_schedule_count,
    'weather_alert_jobs', v_weather_alert_jobs_count,
    'material_shortage_jobs', v_material_shortage_jobs_count,
    'insurance_delays', v_insurance_delays_count,
    'revenue_forecast_change', v_revenue_forecast_change
  );
  
  -- Build title and body
  v_title := format('📊 Daily Briefing — %s', to_char(p_briefing_date, 'Mon DD, YYYY'));
  
  v_body := format(
    'Hot Leads: %s | Jobs at Risk: %s | Ready to Close: %s | Overdue Invoices: %s ($%s) | Crews Behind: %s | Weather Alerts: %s | Material Issues: %s | Insurance Delays: %s',
    v_hot_leads_count,
    v_jobs_at_risk_count,
    v_jobs_ready_to_close_count,
    v_invoices_overdue_count,
    v_invoices_overdue_amount::text,
    v_crews_behind_schedule_count,
    v_weather_alert_jobs_count,
    v_material_shortage_jobs_count,
    v_insurance_delays_count
  );
  
  -- Create notification
  SELECT public.create_smartsend_notification(
    p_org_id := v_org_id,
    p_user_id := v_owner_id,
    p_category := 'system',
    p_type := 'system',
    p_priority := 'standard',
    p_title := v_title,
    p_body := v_body,
    p_target_roles := ARRAY['owner'],
    p_delivery_channels := ARRAY['in_app'],
    p_payload := v_briefing_data,
    p_url := format('/dashboard?date=%s', p_briefing_date)
  ) INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;

-- ============================================================================
-- PART 11 — BACKGROUND MONITORING FUNCTIONS
-- ============================================================================
-- Functions that check conditions and generate alerts automatically

-- A) Monitor Lead Contact Times
CREATE OR REPLACE FUNCTION public.monitor_lead_contact_times(
  p_workspace_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead_record RECORD;
  v_minutes_since_created int;
  v_alerts_created int := 0;
BEGIN
  -- Find leads created in last 24 hours that haven't been contacted
  FOR v_lead_record IN
    SELECT 
      l.id,
      l.workspace_id,
      l.created_at,
      c.first_name || ' ' || c.last_name as contact_name
    FROM public.leads l
    LEFT JOIN public.contacts c ON c.id = l.contact_id
    WHERE l.workspace_id = p_workspace_id
      AND l.created_at >= NOW() - INTERVAL '24 hours'
      AND l.status NOT IN ('won', 'lost', 'closed')
      AND NOT EXISTS (
        -- Check if there's been any contact (email sent, call logged, etc.)
        SELECT 1 FROM public.inbox_messages im
        WHERE im.thread_id IN (
          SELECT id FROM public.inbox_threads WHERE lead_id = l.id
        )
        AND im.direction = 'outbound'
        AND im.created_at >= l.created_at
      )
  LOOP
    v_minutes_since_created := EXTRACT(EPOCH FROM (NOW() - v_lead_record.created_at)) / 60;
    
    -- Alert if 15+ minutes
    IF v_minutes_since_created >= 15 THEN
      PERFORM public.alert_lead_not_contacted(
        v_lead_record.workspace_id,
        v_lead_record.id,
        v_minutes_since_created::int,
        v_lead_record.contact_name
      );
      v_alerts_created := v_alerts_created + 1;
    END IF;
  END LOOP;
  
  RETURN v_alerts_created;
END;
$$;

-- B) Monitor Job Risks
CREATE OR REPLACE FUNCTION public.monitor_job_risks(
  p_workspace_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_record RECORD;
  v_alerts_created int := 0;
BEGIN
  -- Check for jobs with material orders not confirmed
  FOR v_job_record IN
    SELECT DISTINCT rj.id, rj.workspace_id, rj.title, rj.scheduled_start_date
    FROM public.roofing_jobs rj
    JOIN public.material_orders mo ON mo.job_id = rj.id
    WHERE rj.workspace_id = p_workspace_id
      AND rj.status IN ('scheduled', 'in_progress')
      AND mo.status NOT IN ('confirmed', 'delivered', 'materials_approved_for_build')
      AND rj.scheduled_start_date <= CURRENT_DATE + INTERVAL '2 days'
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.job_id = rj.id
          AND n.type = 'material_shortage'
          AND n.created_at >= CURRENT_DATE - INTERVAL '1 day'
      )
  LOOP
    PERFORM public.alert_material_not_confirmed(
      v_job_record.workspace_id,
      v_job_record.id,
      NULL,
      v_job_record.title
    );
    v_alerts_created := v_alerts_created + 1;
  END LOOP;
  
  -- Check for jobs with permits missing
  FOR v_job_record IN
    SELECT rj.id, rj.workspace_id, rj.title
    FROM public.roofing_jobs rj
    WHERE rj.workspace_id = p_workspace_id
      AND rj.status IN ('scheduled', 'in_progress')
      AND NOT EXISTS (
        SELECT 1 FROM public.job_documents jd
        WHERE jd.job_id = rj.id
          AND jd.document_type = 'permit'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.job_id = rj.id
          AND n.type = 'job_at_risk'
          AND n.body LIKE '%permit%'
          AND n.created_at >= CURRENT_DATE - INTERVAL '1 day'
      )
  LOOP
    PERFORM public.alert_permit_not_uploaded(
      v_job_record.workspace_id,
      v_job_record.id,
      v_job_record.title
    );
    v_alerts_created := v_alerts_created + 1;
  END LOOP;
  
  -- Check for jobs with labor hours exceeding target
  FOR v_job_record IN
    SELECT 
      rj.id, 
      rj.workspace_id, 
      rj.title,
      rj.target_hours,
      rj.actual_hours,
      CASE 
        WHEN rj.target_hours > 0 THEN ((rj.actual_hours - rj.target_hours) / rj.target_hours * 100)
        ELSE NULL
      END as percentage_over
    FROM public.roofing_jobs rj
    WHERE rj.workspace_id = p_workspace_id
      AND rj.status = 'in_progress'
      AND rj.target_hours IS NOT NULL
      AND rj.actual_hours IS NOT NULL
      AND rj.actual_hours > rj.target_hours * 1.1 -- 10% over target
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.job_id = rj.id
          AND n.type = 'job_at_risk'
          AND n.body LIKE '%labor%'
          AND n.created_at >= CURRENT_DATE - INTERVAL '1 day'
      )
  LOOP
    PERFORM public.alert_labor_hours_exceed_target(
      v_job_record.workspace_id,
      v_job_record.id,
      v_job_record.target_hours,
      v_job_record.actual_hours,
      v_job_record.percentage_over,
      v_job_record.title
    );
    v_alerts_created := v_alerts_created + 1;
  END LOOP;
  
  RETURN v_alerts_created;
END;
$$;

-- C) Monitor Crew Check-ins
CREATE OR REPLACE FUNCTION public.monitor_crew_check_ins(
  p_workspace_id uuid
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_record RECORD;
  v_alerts_created int := 0;
  v_expected_start_time timestamptz;
  v_minutes_late int;
BEGIN
  -- Check for crews that should have checked in but haven't
  FOR v_job_record IN
    SELECT 
      rj.id,
      rj.workspace_id,
      rj.title,
      rj.scheduled_start_date,
      jca.crew_id,
      c.name as crew_name
    FROM public.roofing_jobs rj
    JOIN public.job_crew_assignments jca ON jca.job_id = rj.id
    JOIN public.crews c ON c.id = jca.crew_id
    WHERE rj.workspace_id = p_workspace_id
      AND rj.status = 'scheduled'
      AND rj.scheduled_start_date = CURRENT_DATE
      AND NOT EXISTS (
        SELECT 1 FROM public.crew_check_ins cci
        WHERE cci.job_id = rj.id
          AND cci.crew_id = jca.crew_id
          AND cci.check_in_time::date = CURRENT_DATE
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.job_id = rj.id
          AND n.type = 'crew_delay'
          AND n.created_at >= CURRENT_DATE
      )
  LOOP
    -- Assume expected start time is 7 AM on scheduled date
    v_expected_start_time := (v_job_record.scheduled_start_date::timestamp + INTERVAL '7 hours');
    v_minutes_late := EXTRACT(EPOCH FROM (NOW() - v_expected_start_time)) / 60;
    
    IF v_minutes_late > 0 THEN
      PERFORM public.alert_crew_not_checked_in(
        v_job_record.workspace_id,
        v_job_record.id,
        v_job_record.crew_id,
        v_expected_start_time,
        v_minutes_late::int,
        v_job_record.crew_name,
        v_job_record.title
      );
      v_alerts_created := v_alerts_created + 1;
    END IF;
  END LOOP;
  
  RETURN v_alerts_created;
END;
$$;

-- ============================================================================
-- PART 12 — RLS POLICIES FOR ALERT INTELLIGENCE
-- ============================================================================

ALTER TABLE public.alert_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view alert intelligence for their workspace"
  ON public.alert_intelligence FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert alert intelligence"
  ON public.alert_intelligence FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Users can update alert intelligence for their workspace"
  ON public.alert_intelligence FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 13 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.alert_intelligence IS 'Block 25620: Stores intelligence about alerts, risk factors, and alert patterns';
COMMENT ON COLUMN public.notifications.risk_score IS 'Block 25620: Risk score from 0-100 indicating severity';
COMMENT ON COLUMN public.notifications.requires_action IS 'Block 25620: Whether this alert requires immediate action';
COMMENT ON COLUMN public.notifications.alert_context IS 'Block 25620: Additional context data about the alert';

COMMENT ON FUNCTION public.generate_owner_daily_briefing IS 'Block 25620: Generates comprehensive daily intelligence briefing for owners with all key metrics';
COMMENT ON FUNCTION public.monitor_lead_contact_times IS 'Block 25620: Monitors leads and alerts if not contacted within 15 minutes';
COMMENT ON FUNCTION public.monitor_job_risks IS 'Block 25620: Monitors jobs for risk factors and generates alerts';
COMMENT ON FUNCTION public.monitor_crew_check_ins IS 'Block 25620: Monitors crew check-ins and alerts if crews are late';





































