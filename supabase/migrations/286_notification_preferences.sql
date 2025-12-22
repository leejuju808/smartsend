-- Block 268 - Smart Notifications v2
-- Migration 286: Per-user notification preferences

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  event text NOT NULL,             -- 'reply_high_intent', 'campaign_blocked', etc.
  channel text NOT NULL,           -- 'email', 'in_app', 'none'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, event, channel)  -- Allow multiple channels per event
);

-- Indexes
CREATE INDEX IF NOT EXISTS notification_preferences_user_idx ON public.notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS notification_preferences_event_idx ON public.notification_preferences(event);

-- Enable RLS
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can read their own preferences
CREATE POLICY "users_read_own_preferences" ON public.notification_preferences
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert/update their own preferences
CREATE POLICY "users_manage_own_preferences" ON public.notification_preferences
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;

-- Function to set default preferences for a user
CREATE OR REPLACE FUNCTION public.set_default_notification_preferences(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert default preferences if they don't exist
  INSERT INTO public.notification_preferences (user_id, event, channel)
  VALUES
    (p_user_id, 'reply_high_intent', 'email'),
    (p_user_id, 'reply_high_intent', 'in_app'),
    (p_user_id, 'reply_general', 'in_app'),
    (p_user_id, 'campaign_blocked', 'email'),
    (p_user_id, 'campaign_blocked', 'in_app'),
    (p_user_id, 'enrichment_finished', 'in_app'),
    (p_user_id, 'digest_daily', 'email'),
    (p_user_id, 'digest_weekly', 'email'),
    (p_user_id, 'deal_opened', 'in_app'),
    (p_user_id, 'mailbox_health_issue', 'email')
  ON CONFLICT (user_id, event, channel) DO NOTHING;
END;
$$;

-- Trigger to set defaults on user creation
CREATE OR REPLACE FUNCTION public.handle_new_user_notification_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.set_default_notification_preferences(NEW.id);
  RETURN NEW;
END;
$$;

-- Create trigger (if not exists)
DROP TRIGGER IF EXISTS on_auth_user_created_set_notification_prefs ON auth.users;
CREATE TRIGGER on_auth_user_created_set_notification_prefs
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_notification_preferences();

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_notification_preferences_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_notification_preferences_updated_at();

