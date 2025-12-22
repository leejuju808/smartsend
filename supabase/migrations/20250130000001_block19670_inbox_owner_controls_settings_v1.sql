-- =========================================================
-- Block 19670 — Inbox Owner Controls & Settings v1
-- (Notification Toggles, Default View, Lead Priority Settings, Quiet Hours)
-- =========================================================

-- ============================================================================
-- 1. CREATE INBOX_SETTINGS TABLE
-- ============================================================================
-- One row per user_id for personalized inbox behavior

-- Create enum for default tab selection
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inbox_default_tab') THEN
    CREATE TYPE inbox_default_tab AS ENUM ('all', 'hot', 'warm', 'follow_up');
  END IF;
END$$;

-- Create inbox_settings table
CREATE TABLE IF NOT EXISTS public.inbox_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  default_tab inbox_default_tab DEFAULT 'all',
  notify_new_hot boolean DEFAULT true,
  notify_new_warm boolean DEFAULT true,
  notify_new_follow_up boolean DEFAULT true,
  notify_booked boolean DEFAULT true,
  quiet_hours_start time,
  quiet_hours_end time,
  lead_priority_weight_hot integer DEFAULT 100 CHECK (lead_priority_weight_hot >= 0 AND lead_priority_weight_hot <= 100),
  lead_priority_weight_warm integer DEFAULT 70 CHECK (lead_priority_weight_warm >= 0 AND lead_priority_weight_warm <= 100),
  lead_priority_weight_followup integer DEFAULT 50 CHECK (lead_priority_weight_followup >= 0 AND lead_priority_weight_followup <= 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_inbox_settings_user_id ON public.inbox_settings(user_id);

-- ============================================================================
-- 2. ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.inbox_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "inbox_settings_select_own" ON public.inbox_settings;
DROP POLICY IF EXISTS "inbox_settings_insert_own" ON public.inbox_settings;
DROP POLICY IF EXISTS "inbox_settings_update_own" ON public.inbox_settings;
DROP POLICY IF EXISTS "inbox_settings_delete_own" ON public.inbox_settings;

-- RLS Policies: Users can only access their own settings
CREATE POLICY "inbox_settings_select_own" ON public.inbox_settings
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "inbox_settings_insert_own" ON public.inbox_settings
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "inbox_settings_update_own" ON public.inbox_settings
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "inbox_settings_delete_own" ON public.inbox_settings
  FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================================
-- 3. AUTO-CREATE DEFAULT SETTINGS ON USER CREATION
-- ============================================================================
-- Function to create default inbox settings for a new user

CREATE OR REPLACE FUNCTION public.create_default_inbox_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.inbox_settings (
    user_id,
    default_tab,
    notify_new_hot,
    notify_new_warm,
    notify_new_follow_up,
    notify_booked,
    lead_priority_weight_hot,
    lead_priority_weight_warm,
    lead_priority_weight_followup
  ) VALUES (
    NEW.id,
    'all',
    true,
    true,
    true,
    true,
    100,
    70,
    50
  )
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- Create trigger to auto-create settings on user signup
DROP TRIGGER IF EXISTS on_auth_user_created_inbox_settings ON auth.users;
CREATE TRIGGER on_auth_user_created_inbox_settings
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_default_inbox_settings();

-- ============================================================================
-- 4. HELPER FUNCTION: GET OR CREATE USER SETTINGS
-- ============================================================================
-- Ensures settings exist for a user, creating defaults if missing

CREATE OR REPLACE FUNCTION public.get_or_create_inbox_settings(p_user_id uuid)
RETURNS public.inbox_settings
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settings public.inbox_settings;
BEGIN
  -- Try to get existing settings
  SELECT * INTO v_settings
  FROM public.inbox_settings
  WHERE user_id = p_user_id;
  
  -- If no settings exist, create defaults
  IF v_settings IS NULL THEN
    INSERT INTO public.inbox_settings (
      user_id,
      default_tab,
      notify_new_hot,
      notify_new_warm,
      notify_new_follow_up,
      notify_booked,
      lead_priority_weight_hot,
      lead_priority_weight_warm,
      lead_priority_weight_followup
    ) VALUES (
      p_user_id,
      'all',
      true,
      true,
      true,
      true,
      100,
      70,
      50
    )
    RETURNING * INTO v_settings;
  END IF;
  
  RETURN v_settings;
END;
$$;

-- ============================================================================
-- 5. HELPER FUNCTION: CHECK IF QUIET HOURS ARE ACTIVE
-- ============================================================================
-- Returns true if current time falls within quiet hours

CREATE OR REPLACE FUNCTION public.is_quiet_hours_active(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_settings public.inbox_settings;
  v_current_time time;
  v_start_time time;
  v_end_time time;
BEGIN
  -- Get user settings
  SELECT * INTO v_settings
  FROM public.inbox_settings
  WHERE user_id = p_user_id;
  
  -- If no settings or quiet hours not set, return false
  IF v_settings IS NULL OR v_settings.quiet_hours_start IS NULL OR v_settings.quiet_hours_end IS NULL THEN
    RETURN false;
  END IF;
  
  v_current_time := CURRENT_TIME;
  v_start_time := v_settings.quiet_hours_start;
  v_end_time := v_settings.quiet_hours_end;
  
  -- Handle quiet hours that span midnight (e.g., 8pm to 6am)
  IF v_start_time > v_end_time THEN
    -- Quiet hours span midnight
    RETURN v_current_time >= v_start_time OR v_current_time <= v_end_time;
  ELSE
    -- Quiet hours within same day
    RETURN v_current_time >= v_start_time AND v_current_time <= v_end_time;
  END IF;
END;
$$;

-- ============================================================================
-- 6. UPDATE TRIGGER: AUTO-UPDATE updated_at TIMESTAMP
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_inbox_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_inbox_settings_updated_at ON public.inbox_settings;
CREATE TRIGGER trg_update_inbox_settings_updated_at
  BEFORE UPDATE ON public.inbox_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_inbox_settings_updated_at();

-- ============================================================================
-- 7. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.inbox_settings IS 'Per-user inbox preferences: default view, notifications, quiet hours, and lead priority weights';
COMMENT ON COLUMN public.inbox_settings.default_tab IS 'Default tab to show when inbox loads: all, hot, warm, or follow_up';
COMMENT ON COLUMN public.inbox_settings.notify_new_hot IS 'Send push notifications for new hot leads';
COMMENT ON COLUMN public.inbox_settings.notify_new_warm IS 'Send push notifications for new warm leads';
COMMENT ON COLUMN public.inbox_settings.notify_new_follow_up IS 'Send push notifications for follow-up required leads';
COMMENT ON COLUMN public.inbox_settings.notify_booked IS 'Send push notifications when leads book estimates';
COMMENT ON COLUMN public.inbox_settings.quiet_hours_start IS 'Start time for quiet hours (no push notifications)';
COMMENT ON COLUMN public.inbox_settings.quiet_hours_end IS 'End time for quiet hours (no push notifications)';
COMMENT ON COLUMN public.inbox_settings.lead_priority_weight_hot IS 'Weight multiplier (0-100) for hot leads when calculating priority score';
COMMENT ON COLUMN public.inbox_settings.lead_priority_weight_warm IS 'Weight multiplier (0-100) for warm leads when calculating priority score';
COMMENT ON COLUMN public.inbox_settings.lead_priority_weight_followup IS 'Weight multiplier (0-100) for follow-up leads when calculating priority score';



















































