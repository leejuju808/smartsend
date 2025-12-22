-- ============================================================================
-- Block 261900 — SmartSend Mobile App, Offline Mode & Field Superpowers v1
-- Mobile-First Crew App • True Offline Mode • Geo-Fenced Clock-Ins
-- ============================================================================
--
-- This block gives crews a mobile-first, offline-capable spine tied to jobs:
-- - Tracks mobile sessions per auth user / device
-- - Queues offline actions (clock-ins, photos, checklists, issues) for sync
-- - Logs geo-fence enter/exit events per job for "no fake clock-ins"
-- - Feeds existing jobs / crew / legal evidence engines
--
-- NOTE ON SCOPING
-- - "user" here maps to auth.users
-- - Jobs map to public.jobs (Block 31440 — Job Pipeline Engine)
-- - Team / visibility is enforced via existing team_members + job policies
-- ============================================================================


-- ============================================================================
-- 1. mobile_sessions — per-device mobile app sessions
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.mobile_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Arbitrary device metadata (platform, model, app_version, os_version, etc.)
  device_info jsonb NOT NULL DEFAULT '{}'::jsonb,

  last_sync timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mobile_sessions_user_last_sync
  ON public.mobile_sessions(user_id, last_sync DESC NULLS LAST);

COMMENT ON TABLE public.mobile_sessions IS
  'Block 261900: Tracks per-user mobile app sessions and last sync timestamps for offline/online transitions.';


-- updated_at trigger using shared helper if available
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_mobile_sessions_updated_at'
  ) THEN
    CREATE TRIGGER trg_mobile_sessions_updated_at
    BEFORE UPDATE ON public.mobile_sessions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END;
$$;


-- ============================================================================
-- 2. offline_actions — queued offline actions (clock-ins, photos, checklists)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.offline_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Optional direct link to a job for fast lookups / PM feeds
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,

  -- clock_in | clock_out | photo | checklist | note | issue
  action_type text NOT NULL CHECK (action_type IN (
    'clock_in',
    'clock_out',
    'photo',
    'checklist',
    'note',
    'issue'
  )),

  -- Raw payload from the mobile app (timestamps, GPS, file refs, checklist IDs, etc.)
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  synced boolean NOT NULL DEFAULT FALSE,
  synced_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offline_actions_user_synced_created
  ON public.offline_actions(user_id, synced, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_offline_actions_job_created
  ON public.offline_actions(job_id, created_at DESC)
  WHERE job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_offline_actions_synced_at
  ON public.offline_actions(synced, synced_at DESC NULLS LAST);

COMMENT ON TABLE public.offline_actions IS
  'Block 261900: Offline action queue for clock-ins, photos, checklists, issues and notes captured without connectivity.';


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_offline_actions_updated_at'
  ) THEN
    CREATE TRIGGER trg_offline_actions_updated_at
    BEFORE UPDATE ON public.offline_actions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END;
$$;


-- ============================================================================
-- 3. geo_events — geo-fence enter/exit around job sites
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.geo_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  lat numeric(10,8) NOT NULL,
  lng numeric(11,8) NOT NULL,

  -- enter | exit
  event_type text NOT NULL CHECK (event_type IN ('enter', 'exit')),

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_geo_events_job_created
  ON public.geo_events(job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_geo_events_user_created
  ON public.geo_events(user_id, created_at DESC);

COMMENT ON TABLE public.geo_events IS
  'Block 261900: Geo-fence enter/exit events per job to enforce on-site clock-ins and movement logs.';


-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE public.mobile_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offline_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geo_events ENABLE ROW LEVEL SECURITY;


-- 4.1 mobile_sessions RLS

DROP POLICY IF EXISTS "mobile_sessions_owner" ON public.mobile_sessions;
CREATE POLICY "mobile_sessions_owner" ON public.mobile_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "mobile_sessions_service_role" ON public.mobile_sessions;
CREATE POLICY "mobile_sessions_service_role" ON public.mobile_sessions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- 4.2 offline_actions RLS

DROP POLICY IF EXISTS "offline_actions_owner" ON public.offline_actions;
CREATE POLICY "offline_actions_owner" ON public.offline_actions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "offline_actions_service_role" ON public.offline_actions;
CREATE POLICY "offline_actions_service_role" ON public.offline_actions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- 4.3 geo_events RLS
--
-- Authenticated users can see geo events for jobs where they are team members.
-- Inserts/updates from mobile devices are allowed only for team members on that job.

DROP POLICY IF EXISTS "geo_events_team_member_all" ON public.geo_events;
CREATE POLICY "geo_events_team_member_all" ON public.geo_events
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = geo_events.job_id
        AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id = geo_events.job_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "geo_events_service_role" ON public.geo_events;
CREATE POLICY "geo_events_service_role" ON public.geo_events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);


-- ============================================================================
-- End Block 261900 — Field Operations Superpowers Engine v1
-- ============================================================================












