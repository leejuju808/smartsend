-- =========================================================
-- Block 17700 — SmartSend Real-Time Alerts v1
-- (Instant Notifications for Hot Replies, Insurance Signals, Storm Damage, 
--  Appointment Activity, Payment Issues & Domain Health)
-- =========================================================

-- ============================================================================
-- 1. ALERT TYPES ENUM
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_type') THEN
    CREATE TYPE alert_type AS ENUM (
      'hot_lead',              -- Homeowner replies with intent
      'insurance_claim',      -- Insurance language detected
      'storm_damage',         -- Storm/hail/wind/leak detected
      'appointment',          -- Booking, cancel, reschedule, reminder
      'system_billing',       -- Payment failed, trial ending, limits
      'performance_insights'  -- Campaign performance, high-value leads
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_priority') THEN
    CREATE TYPE alert_priority AS ENUM (
      'priority_1',  -- Hot Lead + Insurance + Storm (immediate push)
      'priority_2',  -- Reply + Booking + Appointment (fast push)
      'priority_3',  -- Insights + Performance (in-app only)
      'priority_4',  -- Billing + System Health (push + email)
      'priority_5'   -- Low-level (daily summary only)
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_status') THEN
    CREATE TYPE alert_status AS ENUM (
      'unread',
      'read',
      'archived',
      'dismissed'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'alert_delivery_channel') THEN
    CREATE TYPE alert_delivery_channel AS ENUM (
      'push',
      'desktop',
      'in_app',
      'email',
      'sms'
    );
  END IF;
END$$;

-- ============================================================================
-- 2. ALERTS TABLE (Main alerts)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, -- null = workspace-wide
  
  -- Alert Classification
  type alert_type NOT NULL,
  priority alert_priority NOT NULL DEFAULT 'priority_3',
  status alert_status NOT NULL DEFAULT 'unread',
  
  -- Content
  title text NOT NULL,
  message text NOT NULL,
  icon text, -- emoji or icon name (🔥, 📄, 🌪️, 📅, ⚠️, 📈)
  
  -- Context
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES public.schedule_bookings(id) ON DELETE SET NULL,
  message_id uuid, -- email message or reply ID
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb, -- flexible data storage
  source text, -- 'reply_detection', 'storm_api', 'billing_webhook', etc.
  
  -- Recommended Actions
  recommended_actions jsonb DEFAULT '[]'::jsonb, -- [{action: "reply", label: "Reply Now"}, ...]
  action_taken jsonb DEFAULT '{}'::jsonb, -- what user did
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  archived_at timestamptz,
  
  -- Throttling
  throttled boolean DEFAULT false, -- true if this was throttled/batched
  batch_id uuid -- groups related alerts together
);

CREATE INDEX IF NOT EXISTS idx_alerts_workspace_user 
  ON public.alerts(workspace_id, user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_type_priority 
  ON public.alerts(workspace_id, type, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_contact 
  ON public.alerts(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alerts_unread 
  ON public.alerts(workspace_id, user_id, status) WHERE status = 'unread';
CREATE INDEX IF NOT EXISTS idx_alerts_batch 
  ON public.alerts(batch_id) WHERE batch_id IS NOT NULL;

-- ============================================================================
-- 3. ALERT_EVENTS TABLE (Activity Stream / Audit Log)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid REFERENCES public.alerts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Event Details
  event_type text NOT NULL, -- 'created', 'sent', 'read', 'action_taken', 'resolved'
  category alert_type,
  severity alert_priority,
  
  -- Context
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  recommended_action text,
  action_taken text,
  resolution text,
  
  -- Source tracking
  source text,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_events_workspace 
  ON public.alert_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_events_alert 
  ON public.alert_events(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_events_category 
  ON public.alert_events(workspace_id, category, created_at DESC);

-- ============================================================================
-- 4. ALERT_SETTINGS TABLE (User Preferences)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.alert_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Channel Preferences (which channels for which alert types)
  channels jsonb DEFAULT '{
    "hot_lead": ["push", "in_app", "email"],
    "insurance_claim": ["push", "in_app", "email"],
    "storm_damage": ["push", "in_app", "email"],
    "appointment": ["push", "in_app"],
    "system_billing": ["push", "email"],
    "performance_insights": ["in_app"]
  }'::jsonb,
  
  -- Throttling Preferences
  throttle_minutes integer DEFAULT 20, -- max 1 alert per lead every X minutes
  batch_low_priority boolean DEFAULT true,
  daily_digest_enabled boolean DEFAULT true,
  daily_digest_time time DEFAULT '08:00:00'::time,
  
  -- Priority Overrides
  priority_overrides jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_settings_user 
  ON public.alert_settings(workspace_id, user_id);

-- ============================================================================
-- 5. ALERT_DELIVERY TABLE (Delivery Tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.alert_delivery (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.alerts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Delivery Details
  channel alert_delivery_channel NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'failed', 'bounced'
  
  -- Provider Info
  provider text, -- 'fcm', 'apns', 'resend', 'twilio', etc.
  provider_message_id text,
  error_message text,
  
  -- Timestamps
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_delivery_alert 
  ON public.alert_delivery(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_delivery_user 
  ON public.alert_delivery(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_delivery_status 
  ON public.alert_delivery(status, created_at DESC) WHERE status = 'pending';

-- ============================================================================
-- 6. HELPER FUNCTIONS
-- ============================================================================

-- Function: Create alert with throttling check
CREATE OR REPLACE FUNCTION public.create_alert(
  p_workspace_id uuid,
  p_user_id uuid,
  p_type alert_type,
  p_title text,
  p_message text,
  p_contact_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_appointment_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_source text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alert_id uuid;
  v_priority alert_priority;
  v_icon text;
  v_recommended_actions jsonb;
  v_throttled boolean := false;
  v_existing_alert_id uuid;
  v_throttle_minutes integer;
BEGIN
  -- Determine priority based on type
  CASE p_type
    WHEN 'hot_lead', 'insurance_claim', 'storm_damage' THEN
      v_priority := 'priority_1';
      v_icon := CASE p_type
        WHEN 'hot_lead' THEN '🔥'
        WHEN 'insurance_claim' THEN '📄'
        WHEN 'storm_damage' THEN '🌪️'
      END;
    WHEN 'appointment' THEN
      v_priority := 'priority_2';
      v_icon := '📅';
    WHEN 'system_billing' THEN
      v_priority := 'priority_4';
      v_icon := '⚠️';
    WHEN 'performance_insights' THEN
      v_priority := 'priority_3';
      v_icon := '📈';
    ELSE
      v_priority := 'priority_3';
      v_icon := '🔔';
  END CASE;

  -- Generate recommended actions based on type
  v_recommended_actions := CASE p_type
    WHEN 'hot_lead' THEN '[{"action": "reply", "label": "Reply Now"}, {"action": "move_pipeline", "label": "Move to HOT"}, {"action": "book_appointment", "label": "Offer Time"}]'::jsonb
    WHEN 'insurance_claim' THEN '[{"action": "move_pipeline", "label": "Move to Insurance Pipeline"}, {"action": "send_template", "label": "Send Adjuster Prep Message"}]'::jsonb
    WHEN 'storm_damage' THEN '[{"action": "send_template", "label": "Send Storm Inspection Template"}, {"action": "book_appointment", "label": "Book Inspection"}]'::jsonb
    WHEN 'appointment' THEN '[{"action": "view_appointment", "label": "View Details"}, {"action": "confirm", "label": "Confirm Appointment"}]'::jsonb
    ELSE '[]'::jsonb
  END;

  -- Check throttling (max 1 alert per contact every X minutes)
  IF p_contact_id IS NOT NULL THEN
    SELECT throttle_minutes INTO v_throttle_minutes
    FROM public.alert_settings
    WHERE workspace_id = p_workspace_id AND user_id = p_user_id
    LIMIT 1;
    
    IF v_throttle_minutes IS NULL THEN
      v_throttle_minutes := 20; -- default
    END IF;

    SELECT id INTO v_existing_alert_id
    FROM public.alerts
    WHERE workspace_id = p_workspace_id
      AND contact_id = p_contact_id
      AND type = p_type
      AND created_at > now() - (v_throttle_minutes || ' minutes')::interval
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_alert_id IS NOT NULL THEN
      v_throttled := true;
      -- Update existing alert instead of creating new one
      UPDATE public.alerts
      SET 
        title = p_title,
        message = p_message,
        metadata = p_metadata,
        throttled = true,
        updated_at = now()
      WHERE id = v_existing_alert_id
      RETURNING id INTO v_alert_id;
      
      RETURN v_alert_id;
    END IF;
  END IF;

  -- Create new alert
  INSERT INTO public.alerts (
    workspace_id,
    user_id,
    type,
    priority,
    title,
    message,
    icon,
    contact_id,
    campaign_id,
    appointment_id,
    metadata,
    source,
    recommended_actions,
    throttled
  ) VALUES (
    p_workspace_id,
    p_user_id,
    p_type,
    v_priority,
    p_title,
    p_message,
    v_icon,
    p_contact_id,
    p_campaign_id,
    p_appointment_id,
    p_metadata,
    p_source,
    v_recommended_actions,
    v_throttled
  ) RETURNING id INTO v_alert_id;

  -- Log event
  INSERT INTO public.alert_events (
    alert_id,
    workspace_id,
    event_type,
    category,
    severity,
    contact_id,
    source,
    metadata
  ) VALUES (
    v_alert_id,
    p_workspace_id,
    'created',
    p_type,
    v_priority,
    p_contact_id,
    p_source,
    p_metadata
  );

  RETURN v_alert_id;
END;
$$;

-- Function: Mark alert as read
CREATE OR REPLACE FUNCTION public.mark_alert_read(
  p_alert_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.alerts
  SET 
    status = 'read',
    read_at = now()
  WHERE id = p_alert_id AND user_id = p_user_id;

  INSERT INTO public.alert_events (
    alert_id,
    workspace_id,
    event_type,
    contact_id
  )
  SELECT 
    p_alert_id,
    workspace_id,
    'read',
    contact_id
  FROM public.alerts
  WHERE id = p_alert_id;
END;
$$;

-- Function: Get unread alert count
CREATE OR REPLACE FUNCTION public.get_unread_alert_count(
  p_workspace_id uuid,
  p_user_id uuid
)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::integer
  FROM public.alerts
  WHERE workspace_id = p_workspace_id
    AND (user_id = p_user_id OR user_id IS NULL)
    AND status = 'unread';
$$;

-- ============================================================================
-- 7. RLS POLICIES
-- ============================================================================
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_delivery ENABLE ROW LEVEL SECURITY;

-- Alerts: Users can see alerts for their workspace
DROP POLICY IF EXISTS "alerts_select_workspace" ON public.alerts;
CREATE POLICY "alerts_select_workspace" ON public.alerts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = alerts.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "alerts_insert_workspace" ON public.alerts;
CREATE POLICY "alerts_insert_workspace" ON public.alerts
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = alerts.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "alerts_update_own" ON public.alerts;
CREATE POLICY "alerts_update_own" ON public.alerts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = alerts.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Alert Events: Same workspace access
DROP POLICY IF EXISTS "alert_events_select_workspace" ON public.alert_events;
CREATE POLICY "alert_events_select_workspace" ON public.alert_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = alert_events.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Alert Settings: Users manage their own settings
DROP POLICY IF EXISTS "alert_settings_select_own" ON public.alert_settings;
CREATE POLICY "alert_settings_select_own" ON public.alert_settings
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "alert_settings_insert_own" ON public.alert_settings;
CREATE POLICY "alert_settings_insert_own" ON public.alert_settings
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "alert_settings_update_own" ON public.alert_settings;
CREATE POLICY "alert_settings_update_own" ON public.alert_settings
  FOR UPDATE
  USING (user_id = auth.uid());

-- Alert Delivery: Same workspace access
DROP POLICY IF EXISTS "alert_delivery_select_workspace" ON public.alert_delivery;
CREATE POLICY "alert_delivery_select_workspace" ON public.alert_delivery
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = alert_delivery.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 8. COMMENTS
-- ============================================================================
COMMENT ON TABLE public.alerts IS 'SmartSend Real-Time Alerts - Main alerts table';
COMMENT ON TABLE public.alert_events IS 'Alert activity stream / audit log';
COMMENT ON TABLE public.alert_settings IS 'User preferences for alert delivery channels and throttling';
COMMENT ON TABLE public.alert_delivery IS 'Delivery tracking for push, email, SMS notifications';

COMMENT ON COLUMN public.alerts.recommended_actions IS 'JSON array of suggested actions: [{"action": "reply", "label": "Reply Now"}]';
COMMENT ON COLUMN public.alerts.action_taken IS 'JSON object tracking what user did: {"action": "reply", "timestamp": "2025-01-30T10:00:00Z"}';
COMMENT ON COLUMN public.alerts.batch_id IS 'Groups related alerts together (e.g., storm spike)';





















































