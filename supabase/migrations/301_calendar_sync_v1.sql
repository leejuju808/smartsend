-- Block 282 — Calendar Sync v1
-- Google/Outlook 2-Way Sync for Meeting Objects

-- ============================================================================
-- 1. Calendar Connections Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.calendar_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'outlook')),
  account_email text NOT NULL,
  access_token text NOT NULL, -- encrypted/vaulted in production
  refresh_token text,
  expires_at timestamptz,
  calendar_id text NOT NULL DEFAULT 'primary', -- primary calendar or chosen one
  is_active boolean DEFAULT true,
  last_synced_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id, user_id, provider) -- one connection per provider per user per workspace
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_calendar_connections_user 
  ON public.calendar_connections(user_id, provider, is_active);
CREATE INDEX IF NOT EXISTS idx_calendar_connections_workspace 
  ON public.calendar_connections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_calendar_connections_active 
  ON public.calendar_connections(is_active, last_synced_at) 
  WHERE is_active = true;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_calendar_connections_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calendar_connections_updated_at ON public.calendar_connections;
CREATE TRIGGER trg_calendar_connections_updated_at
BEFORE UPDATE ON public.calendar_connections
FOR EACH ROW EXECUTE FUNCTION public.set_calendar_connections_updated_at();

-- RLS
ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;

-- Users can view their own connections
DROP POLICY IF EXISTS "calendar_connections: select own" ON public.calendar_connections;
CREATE POLICY "calendar_connections: select own" ON public.calendar_connections
  FOR SELECT USING (user_id = auth.uid());

-- Users can insert their own connections
DROP POLICY IF EXISTS "calendar_connections: insert own" ON public.calendar_connections;
CREATE POLICY "calendar_connections: insert own" ON public.calendar_connections
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Users can update their own connections
DROP POLICY IF EXISTS "calendar_connections: update own" ON public.calendar_connections;
CREATE POLICY "calendar_connections: update own" ON public.calendar_connections
  FOR UPDATE USING (user_id = auth.uid());

-- Users can delete their own connections
DROP POLICY IF EXISTS "calendar_connections: delete own" ON public.calendar_connections;
CREATE POLICY "calendar_connections: delete own" ON public.calendar_connections
  FOR DELETE USING (user_id = auth.uid());

-- Service role can manage all connections (for edge functions)
DROP POLICY IF EXISTS "calendar_connections: service role full access" ON public.calendar_connections;
CREATE POLICY "calendar_connections: service role full access" ON public.calendar_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.calendar_connections IS 'Stores OAuth tokens and settings for Google Calendar and Outlook calendar connections per user';

-- ============================================================================
-- 2. Add Calendar Sync Columns to Meetings Table
-- ============================================================================

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS calendar_event_id text,
  ADD COLUMN IF NOT EXISTS calendar_provider text CHECK (calendar_provider IN ('google', 'outlook')),
  ADD COLUMN IF NOT EXISTS calendar_status text DEFAULT 'pending' CHECK (calendar_status IN ('pending', 'synced', 'failed', 'disabled', 'cancelled'));

-- Indexes for calendar sync queries
CREATE INDEX IF NOT EXISTS idx_meetings_calendar_event_id 
  ON public.meetings(calendar_event_id, calendar_provider) 
  WHERE calendar_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_calendar_status 
  ON public.meetings(calendar_status, owner_id) 
  WHERE calendar_status IN ('pending', 'failed');

COMMENT ON COLUMN public.meetings.calendar_event_id IS 'External calendar event ID (Google event.id or Outlook event.id)';
COMMENT ON COLUMN public.meetings.calendar_provider IS 'Calendar provider: google or outlook';
COMMENT ON COLUMN public.meetings.calendar_status IS 'Sync status: pending, synced, failed, disabled, cancelled';

-- ============================================================================
-- 3. User Calendar Preferences
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_calendar_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  auto_sync_meetings boolean DEFAULT true, -- auto-create calendar events for detected meetings
  manual_sync_only boolean DEFAULT false, -- only sync meetings manually marked
  sync_disabled boolean DEFAULT false, -- disable all calendar sync
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, workspace_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_user_calendar_preferences_user 
  ON public.user_calendar_preferences(user_id, workspace_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_user_calendar_preferences_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_calendar_preferences_updated_at ON public.user_calendar_preferences;
CREATE TRIGGER trg_user_calendar_preferences_updated_at
BEFORE UPDATE ON public.user_calendar_preferences
FOR EACH ROW EXECUTE FUNCTION public.set_user_calendar_preferences_updated_at();

-- RLS
ALTER TABLE public.user_calendar_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_calendar_preferences: select own" ON public.user_calendar_preferences;
CREATE POLICY "user_calendar_preferences: select own" ON public.user_calendar_preferences
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_calendar_preferences: insert own" ON public.user_calendar_preferences;
CREATE POLICY "user_calendar_preferences: insert own" ON public.user_calendar_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_calendar_preferences: update own" ON public.user_calendar_preferences;
CREATE POLICY "user_calendar_preferences: update own" ON public.user_calendar_preferences
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_calendar_preferences: service role full access" ON public.user_calendar_preferences;
CREATE POLICY "user_calendar_preferences: service role full access" ON public.user_calendar_preferences
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.user_calendar_preferences IS 'User preferences for calendar sync behavior';

-- ============================================================================
-- 4. Helper Functions
-- ============================================================================

-- Get active calendar connection for a user
CREATE OR REPLACE FUNCTION public.get_user_calendar_connection(
  p_user_id uuid,
  p_provider text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  workspace_id uuid,
  user_id uuid,
  provider text,
  account_email text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  calendar_id text,
  is_active boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cc.id,
    cc.workspace_id,
    cc.user_id,
    cc.provider,
    cc.account_email,
    cc.access_token,
    cc.refresh_token,
    cc.expires_at,
    cc.calendar_id,
    cc.is_active
  FROM public.calendar_connections cc
  WHERE cc.user_id = p_user_id
    AND cc.is_active = true
    AND (p_provider IS NULL OR cc.provider = p_provider)
  ORDER BY cc.created_at DESC
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.get_user_calendar_connection IS 'Returns active calendar connection for a user, optionally filtered by provider';

-- Check if user should sync meeting to calendar
CREATE OR REPLACE FUNCTION public.should_sync_meeting_to_calendar(
  p_meeting_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid;
  v_start_time timestamptz;
  v_calendar_status text;
  v_has_connection boolean;
  v_prefs_sync_disabled boolean;
  v_prefs_manual_only boolean;
BEGIN
  -- Get meeting details
  SELECT owner_id, start_time, calendar_status
  INTO v_owner_id, v_start_time, v_calendar_status
  FROM public.meetings
  WHERE id = p_meeting_id;

  -- Must have owner
  IF v_owner_id IS NULL THEN
    RETURN false;
  END IF;

  -- Must have start time
  IF v_start_time IS NULL THEN
    RETURN false;
  END IF;

  -- Don't sync if explicitly disabled
  IF v_calendar_status = 'disabled' THEN
    RETURN false;
  END IF;

  -- Check if user has active calendar connection
  SELECT EXISTS (
    SELECT 1 FROM public.calendar_connections
    WHERE user_id = v_owner_id AND is_active = true
  ) INTO v_has_connection;

  IF NOT v_has_connection THEN
    RETURN false;
  END IF;

  -- Check user preferences
  SELECT sync_disabled, manual_sync_only
  INTO v_prefs_sync_disabled, v_prefs_manual_only
  FROM public.user_calendar_preferences
  WHERE user_id = v_owner_id
  LIMIT 1;

  -- If sync disabled in preferences, don't sync
  IF COALESCE(v_prefs_sync_disabled, false) THEN
    RETURN false;
  END IF;

  -- If manual sync only, only sync if status is explicitly 'synced' or 'pending' (not auto)
  -- For v1, we'll allow auto-sync unless manual_sync_only is true
  -- In v2, we can add a flag to meetings table for manual sync requests

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.should_sync_meeting_to_calendar IS 'Determines if a meeting should be synced to calendar based on owner, connection, and preferences';

-- ============================================================================
-- 5. Function to Update Meeting Calendar Status
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_meeting_calendar_status(
  p_meeting_id uuid,
  p_calendar_event_id text DEFAULT NULL,
  p_calendar_provider text DEFAULT NULL,
  p_calendar_status text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.meetings
  SET 
    calendar_event_id = COALESCE(p_calendar_event_id, calendar_event_id),
    calendar_provider = COALESCE(p_calendar_provider, calendar_provider),
    calendar_status = COALESCE(p_calendar_status, calendar_status),
    updated_at = now()
  WHERE id = p_meeting_id;
END;
$$;

COMMENT ON FUNCTION public.update_meeting_calendar_status IS 'Updates calendar sync status for a meeting';

-- ============================================================================
-- 6. Database Triggers for Automatic Outbound Sync
-- ============================================================================

-- Function to trigger outbound sync via edge function (fire and forget)
CREATE OR REPLACE FUNCTION public.trigger_calendar_sync_outbound()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edge_url text;
  v_should_sync boolean;
  v_payload jsonb;
BEGIN
  -- Check if meeting should be synced
  SELECT public.should_sync_meeting_to_calendar(NEW.id) INTO v_should_sync;
  
  IF NOT v_should_sync THEN
    RETURN NEW;
  END IF;

  -- Build edge function URL
  v_edge_url := COALESCE(
    current_setting('app.supabase_url', true),
    current_setting('app.public_supabase_url', true),
    'https://' || current_setting('app.project_ref', true) || '.supabase.co'
  ) || '/functions/v1/calendar-sync-outbound';

  -- Only sync if status is 'pending' or if time/title changed
  IF TG_OP = 'INSERT' THEN
    -- New meeting - sync if pending
    IF NEW.calendar_status = 'pending' OR NEW.calendar_status IS NULL THEN
      v_payload := jsonb_build_object('meeting_id', NEW.id, 'action', 'create');
      
      -- Use pg_net extension if available
      IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
        BEGIN
          PERFORM net.http_post(
            url := v_edge_url,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || COALESCE(
                current_setting('app.supabase_service_role_key', true),
                current_setting('app.service_role_key', true)
              )
            ),
            body := v_payload
          );
        EXCEPTION
          WHEN OTHERS THEN
            RAISE WARNING 'Failed to trigger calendar sync: %', SQLERRM;
        END;
      ELSE
        RAISE WARNING 'pg_net extension not available, cannot call calendar-sync-outbound function';
      END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Updated meeting - sync if time/title changed or status is pending
    IF (OLD.start_time IS DISTINCT FROM NEW.start_time) OR
       (OLD.end_time IS DISTINCT FROM NEW.end_time) OR
       (OLD.title IS DISTINCT FROM NEW.title) OR
       (NEW.calendar_status = 'pending') THEN
      
      v_payload := jsonb_build_object('meeting_id', NEW.id, 'action', 'update');
      
      IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
        BEGIN
          PERFORM net.http_post(
            url := v_edge_url,
            headers := jsonb_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || COALESCE(
                current_setting('app.supabase_service_role_key', true),
                current_setting('app.service_role_key', true)
              )
            ),
            body := v_payload
          );
        EXCEPTION
          WHEN OTHERS THEN
            RAISE WARNING 'Failed to trigger calendar sync: %', SQLERRM;
        END;
      ELSE
        RAISE WARNING 'pg_net extension not available, cannot call calendar-sync-outbound function';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail transaction
    RAISE WARNING 'Error in trigger_calendar_sync_outbound: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger on meetings table
DROP TRIGGER IF EXISTS trg_calendar_sync_outbound_insert ON public.meetings;
CREATE TRIGGER trg_calendar_sync_outbound_insert
  AFTER INSERT ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_calendar_sync_outbound();

DROP TRIGGER IF EXISTS trg_calendar_sync_outbound_update ON public.meetings;
CREATE TRIGGER trg_calendar_sync_outbound_update
  AFTER UPDATE ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_calendar_sync_outbound();

COMMENT ON FUNCTION public.trigger_calendar_sync_outbound IS 'Automatically triggers calendar sync when meetings are created or updated';

