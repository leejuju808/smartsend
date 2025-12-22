-- Block 268 - Smart Notifications v2
-- Migration 287: Notification throttling to prevent floods

CREATE TABLE IF NOT EXISTS public.notification_throttle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL,
  last_sent timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, event)
);

-- Indexes
CREATE INDEX IF NOT EXISTS notification_throttle_user_event_idx ON public.notification_throttle(user_id, event);
CREATE INDEX IF NOT EXISTS notification_throttle_last_sent_idx ON public.notification_throttle(last_sent);

-- Enable RLS
ALTER TABLE public.notification_throttle ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Service role can manage throttles (used by edge function)
CREATE POLICY "service_role_manage_throttle" ON public.notification_throttle
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can read their own throttle records
CREATE POLICY "users_read_own_throttle" ON public.notification_throttle
  FOR SELECT
  USING (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT ON public.notification_throttle TO authenticated;
GRANT ALL ON public.notification_throttle TO service_role;

-- Function to check if notification should be throttled
CREATE OR REPLACE FUNCTION public.should_throttle_notification(
  p_user_id uuid,
  p_event text,
  p_throttle_minutes integer DEFAULT 5
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_sent timestamptz;
BEGIN
  SELECT last_sent INTO v_last_sent
  FROM public.notification_throttle
  WHERE user_id = p_user_id AND event = p_event;
  
  -- If no record exists, allow notification
  IF v_last_sent IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if enough time has passed
  IF v_last_sent > now() - (p_throttle_minutes || ' minutes')::interval THEN
    RETURN true; -- Should throttle
  END IF;
  
  RETURN false; -- Can send
END;
$$;

-- Function to update throttle timestamp
CREATE OR REPLACE FUNCTION public.update_notification_throttle(
  p_user_id uuid,
  p_event text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.notification_throttle (user_id, event, last_sent)
  VALUES (p_user_id, p_event, now())
  ON CONFLICT (user_id, event)
  DO UPDATE SET
    last_sent = now(),
    updated_at = now();
END;
$$;

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_throttle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER notification_throttle_updated_at
  BEFORE UPDATE ON public.notification_throttle
  FOR EACH ROW
  EXECUTE FUNCTION public.update_throttle_updated_at();








