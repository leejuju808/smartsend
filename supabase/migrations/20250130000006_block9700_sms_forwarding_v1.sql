-- =========================================================
-- Block 9700 — SMS Forwarding v1
-- Owner Text Alerts for Hot Leads
-- =========================================================

-- 1. Create notification_settings table for SMS alerts
CREATE TABLE IF NOT EXISTS public.notification_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  owner_name text,
  owner_email text,
  owner_phone text,                -- E.164 format: +1XXX...
  
  sms_enabled boolean NOT NULL DEFAULT false,
  sms_hot_leads boolean NOT NULL DEFAULT true,
  sms_warm_leads boolean NOT NULL DEFAULT false,
  sms_estimate_scheduled boolean NOT NULL DEFAULT false,
  sms_won_jobs boolean NOT NULL DEFAULT true,
  
  quiet_hours_start time,         -- optional (e.g. 21:00)
  quiet_hours_end time,           -- optional (e.g. 07:00)
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(account_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_settings_account ON public.notification_settings(account_id);
CREATE INDEX IF NOT EXISTS idx_notification_settings_sms_enabled ON public.notification_settings(account_id, sms_enabled) WHERE sms_enabled = true;

COMMENT ON TABLE public.notification_settings IS 'SMS notification settings for account owners';
COMMENT ON COLUMN public.notification_settings.account_id IS 'References auth.users(id) - the account owner';
COMMENT ON COLUMN public.notification_settings.owner_phone IS 'E.164 format phone number for SMS alerts';
COMMENT ON COLUMN public.notification_settings.quiet_hours_start IS 'Start of quiet hours (e.g. 21:00 for 9 PM)';
COMMENT ON COLUMN public.notification_settings.quiet_hours_end IS 'End of quiet hours (e.g. 07:00 for 7 AM)';

-- 2. Create sms_logs table for audit trail
CREATE TABLE IF NOT EXISTS public.sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id),
  campaign_id uuid REFERENCES public.campaigns(id),
  routing_event_id uuid REFERENCES public.routing_events(id),
  
  to_phone text NOT NULL,
  body text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  provider_message_id text,
  error_message text,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_account ON public.sms_logs(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_contact ON public.sms_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_campaign ON public.sms_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_routing_event ON public.sms_logs(routing_event_id);
CREATE INDEX IF NOT EXISTS idx_sms_logs_status ON public.sms_logs(status, created_at DESC);

COMMENT ON TABLE public.sms_logs IS 'Audit trail of all SMS notifications sent to owners';
COMMENT ON COLUMN public.sms_logs.status IS 'Status: queued, sent, failed, or skipped (e.g. quiet hours)';

-- 3. Create function to check quiet hours
CREATE OR REPLACE FUNCTION public.is_quiet_hours(
  p_quiet_start time,
  p_quiet_end time,
  p_now timestamptz DEFAULT now()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_now_time time;
  v_start_time time;
  v_end_time time;
BEGIN
  -- If no quiet hours configured, return false
  IF p_quiet_start IS NULL OR p_quiet_end IS NULL THEN
    RETURN false;
  END IF;
  
  v_now_time := (p_now AT TIME ZONE 'UTC')::time;
  v_start_time := p_quiet_start;
  v_end_time := p_quiet_end;
  
  -- Handle wrap-around (e.g. 21:00 -> 07:00)
  IF v_start_time > v_end_time THEN
    -- Quiet hours span midnight (e.g. 21:00 to 07:00)
    RETURN v_now_time >= v_start_time OR v_now_time < v_end_time;
  ELSE
    -- Quiet hours within same day (e.g. 22:00 to 06:00 next day)
    RETURN v_now_time >= v_start_time AND v_now_time < v_end_time;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.is_quiet_hours(time, time, timestamptz) IS 'Checks if current time is within quiet hours (handles wrap-around)';

-- 4. Create function to check rate limiting
CREATE OR REPLACE FUNCTION public.check_sms_rate_limit(
  p_account_id uuid,
  p_to_phone text,
  p_max_per_lead_minutes int DEFAULT 10,
  p_max_per_account_hour int DEFAULT 20
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_recent_lead_count int;
  v_recent_account_count int;
BEGIN
  -- Check: Max 1 SMS per lead per 10 minutes
  IF p_max_per_lead_minutes > 0 THEN
    SELECT COUNT(*) INTO v_recent_lead_count
    FROM public.sms_logs
    WHERE account_id = p_account_id
      AND to_phone = p_to_phone
      AND status = 'sent'
      AND created_at > now() - (p_max_per_lead_minutes || ' minutes')::interval;
    
    IF v_recent_lead_count > 0 THEN
      RETURN false;
    END IF;
  END IF;
  
  -- Check: Max X SMS per account per hour
  IF p_max_per_account_hour > 0 THEN
    SELECT COUNT(*) INTO v_recent_account_count
    FROM public.sms_logs
    WHERE account_id = p_account_id
      AND status = 'sent'
      AND created_at > now() - interval '1 hour';
    
    IF v_recent_account_count >= p_max_per_account_hour THEN
      RETURN false;
    END IF;
  END IF;
  
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.check_sms_rate_limit(uuid, text, int, int) IS 'Checks if SMS can be sent based on rate limits (per lead and per account)';

-- 5. Enable RLS on notification_settings
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notification settings"
  ON public.notification_settings FOR SELECT
  USING (account_id = auth.uid());

CREATE POLICY "Users can update their own notification settings"
  ON public.notification_settings FOR UPDATE
  USING (account_id = auth.uid())
  WITH CHECK (account_id = auth.uid());

CREATE POLICY "Users can insert their own notification settings"
  ON public.notification_settings FOR INSERT
  WITH CHECK (account_id = auth.uid());

-- 6. Enable RLS on sms_logs
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own SMS logs"
  ON public.sms_logs FOR SELECT
  USING (account_id = auth.uid());

-- 7. Create trigger to update updated_at
CREATE OR REPLACE FUNCTION public.set_notification_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_notification_settings_updated_at ON public.notification_settings;
CREATE TRIGGER trg_set_notification_settings_updated_at
  BEFORE UPDATE ON public.notification_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_notification_settings_updated_at();

-- 8. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_quiet_hours(time, time, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_sms_rate_limit(uuid, text, int, int) TO authenticated;
























































