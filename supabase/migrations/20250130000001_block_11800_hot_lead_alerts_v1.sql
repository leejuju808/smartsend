-- =========================================================
-- Block 11800 — SmartSend Roofing Hot Lead Alerts v1
-- (The Instant Notification System That Makes Roofers Jump on Money FAST)
-- =========================================================

-- 1. CREATE ALERTS TABLE
-- Tracks all hot lead alerts sent via different channels
CREATE TABLE IF NOT EXISTS public.hot_lead_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  inbound_message_id uuid REFERENCES public.inbound_messages(id) ON DELETE SET NULL,
  
  -- Alert type (currently only 'hot_lead', but extensible)
  type text NOT NULL DEFAULT 'hot_lead' CHECK (type = 'hot_lead'),
  
  -- Channel delivery tracking
  sent_via_email boolean NOT NULL DEFAULT false,
  sent_via_sms boolean NOT NULL DEFAULT false,
  sent_in_app boolean NOT NULL DEFAULT false,
  
  -- Alert metadata
  reply_snippet text, -- First 200 chars of the reply
  lead_name text,
  lead_email text,
  
  -- Cooldown tracking (to prevent duplicate alerts)
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_hot_lead_alerts_user_id ON public.hot_lead_alerts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hot_lead_alerts_lead_id ON public.hot_lead_alerts(lead_id);
CREATE INDEX IF NOT EXISTS idx_hot_lead_alerts_workspace_id ON public.hot_lead_alerts(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hot_lead_alerts_cooldown ON public.hot_lead_alerts(user_id, lead_id, created_at);

-- 2. FUNCTION: CHECK COOLDOWN
-- Returns true if an alert was sent for this lead in the last hour
CREATE OR REPLACE FUNCTION public.should_suppress_hot_lead_alert(
  p_user_id uuid,
  p_lead_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_recent_alert_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.hot_lead_alerts
    WHERE user_id = p_user_id
      AND lead_id = p_lead_id
      AND created_at > now() - interval '1 hour'
  ) INTO v_recent_alert_exists;
  
  RETURN v_recent_alert_exists;
END;
$$;

-- 3. FUNCTION: CREATE HOT LEAD ALERT
-- Creates alert record and returns alert ID
CREATE OR REPLACE FUNCTION public.create_hot_lead_alert(
  p_user_id uuid,
  p_workspace_id uuid,
  p_lead_id uuid,
  p_inbound_message_id uuid DEFAULT NULL,
  p_reply_snippet text DEFAULT NULL,
  p_lead_name text DEFAULT NULL,
  p_lead_email text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alert_id uuid;
  v_should_suppress boolean;
BEGIN
  -- Check cooldown
  v_should_suppress := public.should_suppress_hot_lead_alert(p_user_id, p_lead_id);
  
  IF v_should_suppress THEN
    -- Return NULL to indicate alert was suppressed
    RETURN NULL;
  END IF;
  
  -- Create alert record
  INSERT INTO public.hot_lead_alerts (
    user_id,
    workspace_id,
    lead_id,
    inbound_message_id,
    reply_snippet,
    lead_name,
    lead_email,
    sent_in_app -- Always send in-app first
  )
  VALUES (
    p_user_id,
    p_workspace_id,
    p_lead_id,
    p_inbound_message_id,
    LEFT(p_reply_snippet, 200), -- Truncate to 200 chars
    p_lead_name,
    p_lead_email,
    true
  )
  RETURNING id INTO v_alert_id;
  
  RETURN v_alert_id;
END;
$$;

-- 4. FUNCTION: UPDATE ALERT CHANNELS
-- Updates which channels the alert was sent via
CREATE OR REPLACE FUNCTION public.update_hot_lead_alert_channels(
  p_alert_id uuid,
  p_sent_via_email boolean DEFAULT false,
  p_sent_via_sms boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.hot_lead_alerts
  SET 
    sent_via_email = COALESCE(p_sent_via_email, sent_via_email),
    sent_via_sms = COALESCE(p_sent_via_sms, sent_via_sms)
  WHERE id = p_alert_id;
END;
$$;

-- 5. RLS POLICIES
ALTER TABLE public.hot_lead_alerts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own alerts
DROP POLICY IF EXISTS "Users can read their own hot lead alerts" ON public.hot_lead_alerts;
CREATE POLICY "Users can read their own hot lead alerts"
  ON public.hot_lead_alerts
  FOR SELECT
  USING (user_id = auth.uid());

-- Policy: Service role can insert alerts (for edge functions)
DROP POLICY IF EXISTS "Service role can insert hot lead alerts" ON public.hot_lead_alerts;
CREATE POLICY "Service role can insert hot lead alerts"
  ON public.hot_lead_alerts
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Policy: Service role can update alerts (for channel tracking)
DROP POLICY IF EXISTS "Service role can update hot lead alerts" ON public.hot_lead_alerts;
CREATE POLICY "Service role can update hot lead alerts"
  ON public.hot_lead_alerts
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6. COMMENTS
COMMENT ON TABLE public.hot_lead_alerts IS 'Tracks hot lead alerts sent to roofers via email, SMS, and in-app notifications. Includes cooldown logic to prevent spam.';
COMMENT ON COLUMN public.hot_lead_alerts.sent_via_email IS 'Whether email notification was sent';
COMMENT ON COLUMN public.hot_lead_alerts.sent_via_sms IS 'Whether SMS notification was sent (v2 feature)';
COMMENT ON COLUMN public.hot_lead_alerts.sent_in_app IS 'Whether in-app banner notification was created';
COMMENT ON FUNCTION public.should_suppress_hot_lead_alert IS 'Checks if an alert was sent for this lead in the last hour (cooldown logic)';
COMMENT ON FUNCTION public.create_hot_lead_alert IS 'Creates a hot lead alert record with cooldown check. Returns NULL if suppressed.';
COMMENT ON FUNCTION public.update_hot_lead_alert_channels IS 'Updates which channels the alert was sent via (email, SMS)';

