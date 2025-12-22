-- ============================================================
-- Block 65000 — SmartSend Roofing "Homeowner Experience Portal v2"
-- (REAL-TIME JOB PROGRESS • DAILY PHOTOS • LIVE MAP • CREW TIMELINE • MILESTONE TRACKER • HOMEOWNER NOTIFICATIONS)
-- ============================================================
-- 
-- This block transforms SmartSend into something NO roofing company in America has:
-- A premium, live-tracking customer experience — just like Amazon tracking, but for roofing.
--
-- Features:
-- - Live Job Map (GPS Integration)
-- - Daily Photo Feed (Auto-Populated)
-- - Production Milestone Tracker
-- - Live Job Timeline
-- - Homeowner Notifications (Event-Based)
-- - Homeowner "Ask a Question" Chat
-- - Homeowner Satisfaction Pulse
-- ============================================================

-- ============================================================
-- 1. HOMEOWNER_JOB_VIEWS TABLE
-- ============================================================
-- Tracks when homeowners view their job portal
CREATE TABLE IF NOT EXISTS public.homeowner_job_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  homeowner_id uuid,
  last_viewed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Add foreign key constraints dynamically
DO $$
BEGIN
  -- Link to roofing_jobs if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_job_views_job_id_fkey'
    ) THEN
      ALTER TABLE public.homeowner_job_views
        ADD CONSTRAINT homeowner_job_views_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  -- Link to jobs table if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_job_views_job_id_jobs_fkey'
    ) THEN
      -- Only add if roofing_jobs constraint doesn't exist
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'homeowner_job_views_job_id_fkey'
      ) THEN
        ALTER TABLE public.homeowner_job_views
          ADD CONSTRAINT homeowner_job_views_job_id_jobs_fkey
          FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
  
  -- Link to homeowners if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'homeowners') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_job_views_homeowner_id_fkey'
    ) THEN
      ALTER TABLE public.homeowner_job_views
        ADD CONSTRAINT homeowner_job_views_homeowner_id_fkey
        FOREIGN KEY (homeowner_id) REFERENCES public.homeowners(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_homeowner_job_views_job ON public.homeowner_job_views(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_job_views_homeowner ON public.homeowner_job_views(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_job_views_last_viewed ON public.homeowner_job_views(last_viewed_at DESC);

-- ============================================================
-- 2. HOMEOWNER_PHOTO_FEED TABLE
-- ============================================================
-- Auto-populated photo feed for homeowners (Instagram-style)
CREATE TABLE IF NOT EXISTS public.homeowner_photo_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  photo_url text NOT NULL,
  caption text,
  photo_type text CHECK (photo_type IN ('before', 'during', 'after')) DEFAULT 'during',
  uploaded_by_crew boolean DEFAULT false,
  uploaded_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Add foreign key constraints dynamically
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_photo_feed_job_id_fkey'
    ) THEN
      ALTER TABLE public.homeowner_photo_feed
        ADD CONSTRAINT homeowner_photo_feed_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_photo_feed_job_id_jobs_fkey'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'homeowner_photo_feed_job_id_fkey'
      ) THEN
        ALTER TABLE public.homeowner_photo_feed
          ADD CONSTRAINT homeowner_photo_feed_job_id_jobs_fkey
          FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_homeowner_photo_feed_job ON public.homeowner_photo_feed(job_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_homeowner_photo_feed_type ON public.homeowner_photo_feed(photo_type);

-- ============================================================
-- 3. HOMEOWNER_MILESTONES TABLE
-- ============================================================
-- Production milestone tracker (Material delivery, Tear-off, etc.)
CREATE TABLE IF NOT EXISTS public.homeowner_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  milestone text NOT NULL,
  status text NOT NULL CHECK (status IN ('not_started', 'in_progress', 'completed')) DEFAULT 'not_started',
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key constraints dynamically
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_milestones_job_id_fkey'
    ) THEN
      ALTER TABLE public.homeowner_milestones
        ADD CONSTRAINT homeowner_milestones_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_milestones_job_id_jobs_fkey'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'homeowner_milestones_job_id_fkey'
      ) THEN
        ALTER TABLE public.homeowner_milestones
          ADD CONSTRAINT homeowner_milestones_job_id_jobs_fkey
          FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_homeowner_milestones_job ON public.homeowner_milestones(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_milestones_status ON public.homeowner_milestones(status);

-- ============================================================
-- 4. HOMEOWNER_NOTIFICATIONS TABLE
-- ============================================================
-- Event-based notifications for homeowners
CREATE TABLE IF NOT EXISTS public.homeowner_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  homeowner_id uuid,
  type text NOT NULL CHECK (type IN (
    'crew_en_route',
    'crew_arrived',
    'material_delivered',
    'milestone_reached',
    'weather_delay',
    'day_end_summary',
    'job_completion',
    'photo_uploaded',
    'general_update'
  )),
  message text NOT NULL,
  sent_via text CHECK (sent_via IN ('sms', 'email', 'both')) DEFAULT 'both',
  sent_at timestamptz DEFAULT now(),
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key constraints dynamically
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_notifications_job_id_fkey'
    ) THEN
      ALTER TABLE public.homeowner_notifications
        ADD CONSTRAINT homeowner_notifications_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_notifications_job_id_jobs_fkey'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'homeowner_notifications_job_id_fkey'
      ) THEN
        ALTER TABLE public.homeowner_notifications
          ADD CONSTRAINT homeowner_notifications_job_id_jobs_fkey
          FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'homeowners') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_notifications_homeowner_id_fkey'
    ) THEN
      ALTER TABLE public.homeowner_notifications
        ADD CONSTRAINT homeowner_notifications_homeowner_id_fkey
        FOREIGN KEY (homeowner_id) REFERENCES public.homeowners(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_homeowner_notifications_job ON public.homeowner_notifications(job_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_homeowner_notifications_homeowner ON public.homeowner_notifications(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_notifications_type ON public.homeowner_notifications(type);
CREATE INDEX IF NOT EXISTS idx_homeowner_notifications_unread ON public.homeowner_notifications(read_at) WHERE read_at IS NULL;

-- ============================================================
-- 5. HOMEOWNER_MESSAGES TABLE (Enhanced)
-- ============================================================
-- Enhanced messaging for "Ask a Question" chat
-- Note: This table may already exist from Block 44000, so we'll add columns if needed
DO $$
BEGIN
  -- Add new columns if they don't exist
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'homeowner_messages') THEN
    -- Add read status if not exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'homeowner_messages' 
      AND column_name = 'read_at'
    ) THEN
      ALTER TABLE public.homeowner_messages
        ADD COLUMN read_at timestamptz;
    END IF;
    
    -- Add assigned_to if not exists (for routing to PM)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'homeowner_messages' 
      AND column_name = 'assigned_to_user_id'
    ) THEN
      ALTER TABLE public.homeowner_messages
        ADD COLUMN assigned_to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- ============================================================
-- 6. CREW_LOCATION_TRACKING TABLE
-- ============================================================
-- GPS tracking for crew location (en route, on site, left site)
CREATE TABLE IF NOT EXISTS public.crew_location_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  crew_member_id uuid,
  location_type text NOT NULL CHECK (location_type IN ('en_route', 'on_site', 'left_site')),
  latitude numeric,
  longitude numeric,
  address text,
  timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Add foreign key constraints dynamically
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'crew_location_tracking_job_id_fkey'
    ) THEN
      ALTER TABLE public.crew_location_tracking
        ADD CONSTRAINT crew_location_tracking_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'crew_location_tracking_job_id_jobs_fkey'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'crew_location_tracking_job_id_fkey'
      ) THEN
        ALTER TABLE public.crew_location_tracking
          ADD CONSTRAINT crew_location_tracking_job_id_jobs_fkey
          FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crew_location_tracking_job ON public.crew_location_tracking(job_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_crew_location_tracking_crew ON public.crew_location_tracking(crew_member_id);
CREATE INDEX IF NOT EXISTS idx_crew_location_tracking_latest ON public.crew_location_tracking(job_id, location_type, timestamp DESC);

-- ============================================================
-- 7. HOMEOWNER_SATISFACTION_PULSE TABLE
-- ============================================================
-- Quick satisfaction check (Everything looks good / I have a concern / Something needs attention)
CREATE TABLE IF NOT EXISTS public.homeowner_satisfaction_pulse (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  homeowner_id uuid,
  satisfaction_level text NOT NULL CHECK (satisfaction_level IN ('good', 'concern', 'needs_attention')),
  feedback_text text,
  service_ticket_id uuid, -- Links to service ticket if concern detected
  created_at timestamptz DEFAULT now()
);

-- Add foreign key constraints dynamically
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_satisfaction_pulse_job_id_fkey'
    ) THEN
      ALTER TABLE public.homeowner_satisfaction_pulse
        ADD CONSTRAINT homeowner_satisfaction_pulse_job_id_fkey
        FOREIGN KEY (job_id) REFERENCES public.roofing_jobs(id) ON DELETE CASCADE;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_satisfaction_pulse_job_id_jobs_fkey'
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'homeowner_satisfaction_pulse_job_id_fkey'
      ) THEN
        ALTER TABLE public.homeowner_satisfaction_pulse
          ADD CONSTRAINT homeowner_satisfaction_pulse_job_id_jobs_fkey
          FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE;
      END IF;
    END IF;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'homeowners') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'homeowner_satisfaction_pulse_homeowner_id_fkey'
    ) THEN
      ALTER TABLE public.homeowner_satisfaction_pulse
        ADD CONSTRAINT homeowner_satisfaction_pulse_homeowner_id_fkey
        FOREIGN KEY (homeowner_id) REFERENCES public.homeowners(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_homeowner_satisfaction_pulse_job ON public.homeowner_satisfaction_pulse(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_homeowner_satisfaction_pulse_level ON public.homeowner_satisfaction_pulse(satisfaction_level);

-- ============================================================
-- 8. TRIGGERS
-- ============================================================

-- Update updated_at on homeowner_milestones
CREATE OR REPLACE FUNCTION update_homeowner_milestones_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_homeowner_milestones_updated_at ON public.homeowner_milestones;
CREATE TRIGGER trg_homeowner_milestones_updated_at
BEFORE UPDATE ON public.homeowner_milestones
FOR EACH ROW
EXECUTE FUNCTION update_homeowner_milestones_updated_at();

-- Auto-create notification when milestone is completed
CREATE OR REPLACE FUNCTION notify_milestone_completed()
RETURNS TRIGGER AS $$
DECLARE
  v_homeowner_id uuid;
  v_homeowner_email text;
  v_message text;
BEGIN
  -- Only trigger on status change to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Get homeowner info from job
    SELECT h.id, h.email INTO v_homeowner_id, v_homeowner_email
    FROM public.homeowners h
    WHERE h.job_id = NEW.job_id
    LIMIT 1;
    
    -- Create notification
    v_message := 'Great news! "' || NEW.milestone || '" has been completed.';
    
    INSERT INTO public.homeowner_notifications (
      job_id,
      homeowner_id,
      type,
      message
    ) VALUES (
      NEW.job_id,
      v_homeowner_id,
      'milestone_reached',
      v_message
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_notify_milestone_completed ON public.homeowner_milestones;
CREATE TRIGGER trg_notify_milestone_completed
AFTER UPDATE ON public.homeowner_milestones
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed')
EXECUTE FUNCTION notify_milestone_completed();

-- Auto-create service ticket when homeowner reports concern
CREATE OR REPLACE FUNCTION create_service_ticket_on_concern()
RETURNS TRIGGER AS $$
DECLARE
  v_ticket_id uuid;
BEGIN
  -- Only create ticket if concern or needs_attention
  IF NEW.satisfaction_level IN ('concern', 'needs_attention') AND NEW.service_ticket_id IS NULL THEN
    -- Create service ticket (assuming service_tickets table exists)
    -- If it doesn't exist, we'll just log it for now
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'service_tickets') THEN
      INSERT INTO public.service_tickets (
        job_id,
        title,
        description,
        priority,
        status,
        created_by_type
      ) VALUES (
        NEW.job_id,
        'Homeowner Concern: ' || NEW.satisfaction_level,
        COALESCE(NEW.feedback_text, 'Homeowner reported: ' || NEW.satisfaction_level),
        CASE WHEN NEW.satisfaction_level = 'needs_attention' THEN 'high' ELSE 'medium' END,
        'open',
        'homeowner'
      )
      RETURNING id INTO v_ticket_id;
      
      -- Update satisfaction pulse with ticket ID
      UPDATE public.homeowner_satisfaction_pulse
      SET service_ticket_id = v_ticket_id
      WHERE id = NEW.id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_service_ticket_on_concern ON public.homeowner_satisfaction_pulse;
CREATE TRIGGER trg_create_service_ticket_on_concern
AFTER INSERT ON public.homeowner_satisfaction_pulse
FOR EACH ROW
WHEN (NEW.satisfaction_level IN ('concern', 'needs_attention'))
EXECUTE FUNCTION create_service_ticket_on_concern();

-- ============================================================
-- 9. HELPER FUNCTIONS
-- ============================================================

-- Get current crew status for a job
CREATE OR REPLACE FUNCTION get_current_crew_status(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status jsonb;
  v_latest record;
BEGIN
  -- Get latest location tracking entry
  SELECT * INTO v_latest
  FROM public.crew_location_tracking
  WHERE job_id = p_job_id
  ORDER BY timestamp DESC
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'not_arrived',
      'location_type', null,
      'timestamp', null
    );
  END IF;
  
  RETURN jsonb_build_object(
    'status', v_latest.location_type,
    'location_type', v_latest.location_type,
    'latitude', v_latest.latitude,
    'longitude', v_latest.longitude,
    'address', v_latest.address,
    'timestamp', v_latest.timestamp
  );
END;
$$;

-- Get homeowner portal data for a job
CREATE OR REPLACE FUNCTION get_homeowner_portal_data(p_job_id uuid, p_homeowner_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'job_id', p_job_id,
    'photos', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', id,
          'photo_url', photo_url,
          'caption', caption,
          'photo_type', photo_type,
          'uploaded_at', uploaded_at
        ) ORDER BY uploaded_at DESC
      )
      FROM public.homeowner_photo_feed
      WHERE job_id = p_job_id
    ),
    'milestones', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', id,
          'milestone', milestone,
          'status', status,
          'completed_at', completed_at
        ) ORDER BY created_at ASC
      )
      FROM public.homeowner_milestones
      WHERE job_id = p_job_id
    ),
    'crew_status', get_current_crew_status(p_job_id),
    'recent_notifications', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', id,
          'type', type,
          'message', message,
          'sent_at', sent_at,
          'read_at', read_at
        ) ORDER BY sent_at DESC LIMIT 10
      )
      FROM public.homeowner_notifications
      WHERE job_id = p_job_id
      AND (p_homeowner_id IS NULL OR homeowner_id = p_homeowner_id)
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- ============================================================
-- 10. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.homeowner_job_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeowner_photo_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeowner_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeowner_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_location_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeowner_satisfaction_pulse ENABLE ROW LEVEL SECURITY;

-- Homeowner job views: Public read (for token-based access)
DROP POLICY IF EXISTS "homeowner_job_views_public_read" ON public.homeowner_job_views;
CREATE POLICY "homeowner_job_views_public_read"
  ON public.homeowner_job_views FOR SELECT
  USING (true);

-- Homeowner photo feed: Public read, authenticated insert
DROP POLICY IF EXISTS "homeowner_photo_feed_public_read" ON public.homeowner_photo_feed;
CREATE POLICY "homeowner_photo_feed_public_read"
  ON public.homeowner_photo_feed FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "homeowner_photo_feed_authenticated_insert" ON public.homeowner_photo_feed;
CREATE POLICY "homeowner_photo_feed_authenticated_insert"
  ON public.homeowner_photo_feed FOR INSERT
  WITH CHECK (true); -- Service role will handle authorization

-- Homeowner milestones: Public read, authenticated insert/update
DROP POLICY IF EXISTS "homeowner_milestones_public_read" ON public.homeowner_milestones;
CREATE POLICY "homeowner_milestones_public_read"
  ON public.homeowner_milestones FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "homeowner_milestones_authenticated_modify" ON public.homeowner_milestones;
CREATE POLICY "homeowner_milestones_authenticated_modify"
  ON public.homeowner_milestones FOR ALL
  WITH CHECK (true); -- Service role will handle authorization

-- Homeowner notifications: Public read, authenticated insert
DROP POLICY IF EXISTS "homeowner_notifications_public_read" ON public.homeowner_notifications;
CREATE POLICY "homeowner_notifications_public_read"
  ON public.homeowner_notifications FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "homeowner_notifications_authenticated_insert" ON public.homeowner_notifications;
CREATE POLICY "homeowner_notifications_authenticated_insert"
  ON public.homeowner_notifications FOR INSERT
  WITH CHECK (true); -- Service role will handle authorization

-- Crew location tracking: Public read (for homeowner portal), authenticated insert
DROP POLICY IF EXISTS "crew_location_tracking_public_read" ON public.crew_location_tracking;
CREATE POLICY "crew_location_tracking_public_read"
  ON public.crew_location_tracking FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "crew_location_tracking_authenticated_insert" ON public.crew_location_tracking;
CREATE POLICY "crew_location_tracking_authenticated_insert"
  ON public.crew_location_tracking FOR INSERT
  WITH CHECK (true); -- Service role will handle authorization

-- Homeowner satisfaction pulse: Public insert/read (for homeowner portal)
DROP POLICY IF EXISTS "homeowner_satisfaction_pulse_public_all" ON public.homeowner_satisfaction_pulse;
CREATE POLICY "homeowner_satisfaction_pulse_public_all"
  ON public.homeowner_satisfaction_pulse FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- 11. GRANT PERMISSIONS
-- ============================================================
GRANT SELECT, INSERT ON public.homeowner_job_views TO authenticated;
GRANT SELECT, INSERT ON public.homeowner_photo_feed TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.homeowner_milestones TO authenticated;
GRANT SELECT, INSERT ON public.homeowner_notifications TO authenticated;
GRANT SELECT, INSERT ON public.crew_location_tracking TO authenticated;
GRANT SELECT, INSERT ON public.homeowner_satisfaction_pulse TO authenticated;

-- Public access for homeowner portal (via token)
GRANT SELECT ON public.homeowner_job_views TO anon;
GRANT SELECT ON public.homeowner_photo_feed TO anon;
GRANT SELECT ON public.homeowner_milestones TO anon;
GRANT SELECT ON public.homeowner_notifications TO anon;
GRANT SELECT ON public.crew_location_tracking TO anon;
GRANT SELECT, INSERT ON public.homeowner_satisfaction_pulse TO anon;

-- ============================================================
-- 12. COMMENTS
-- ============================================================
COMMENT ON TABLE public.homeowner_job_views IS 'Block 65000: Tracks homeowner portal views';
COMMENT ON TABLE public.homeowner_photo_feed IS 'Block 65000: Daily photo feed for homeowners (Instagram-style)';
COMMENT ON TABLE public.homeowner_milestones IS 'Block 65000: Production milestone tracker';
COMMENT ON TABLE public.homeowner_notifications IS 'Block 65000: Event-based homeowner notifications';
COMMENT ON TABLE public.crew_location_tracking IS 'Block 65000: GPS tracking for crew location';
COMMENT ON TABLE public.homeowner_satisfaction_pulse IS 'Block 65000: Quick satisfaction check and service ticket creation';
COMMENT ON FUNCTION get_current_crew_status(uuid) IS 'Block 65000: Get current crew status for a job';
COMMENT ON FUNCTION get_homeowner_portal_data(uuid, uuid) IS 'Block 65000: Get all homeowner portal data for a job';




























