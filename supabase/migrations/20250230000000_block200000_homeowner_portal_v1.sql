-- ============================================================
-- Block 200000 — SmartSend Roofing "Homeowner Portal + Real-Time Project Tracker" v1
-- ============================================================
-- 
-- FULL NEXT SPRINT STEP — NO BULLSHIT
--
-- This is a customer-facing portal generated automatically for each job.
-- It makes the homeowner feel: Safe, Informed, Connected, Confident
--
-- SmartSend creates what NO other roofing SaaS gives:
-- A professional portal that feels like Amazon tracking — but for their roof replacement.
--
-- Features:
-- - PIN + Last Name Authentication (simple, no accounts)
-- - Unique portal URL: https://portal.smartsendhq.com/j/ABCD1234
-- - Real-time project status timeline
-- - Photo feed (crew uploads → homeowner sees instantly)
-- - Insurance claim tracker
-- - Roof measurement report
-- - Materials & delivery tracking
-- - Chat with contractor (AI or real person)
-- - Automated SMS/email notifications
-- - Final completion PDF report
-- ============================================================

-- ============================================================
-- PART 1 — UPDATE homeowner_portals TABLE
-- ============================================================
-- Add PIN authentication and portal URL structure

-- Add new columns to existing homeowner_portals table
ALTER TABLE IF EXISTS public.homeowner_portals
  ADD COLUMN IF NOT EXISTS portal_code text UNIQUE,          -- Short code like "ABCD1234" for URL
  ADD COLUMN IF NOT EXISTS portal_url text,                  -- Full URL: https://portal.smartsendhq.com/j/ABCD1234
  ADD COLUMN IF NOT EXISTS pin_code text,                    -- 4-digit PIN for authentication
  ADD COLUMN IF NOT EXISTS homeowner_last_name text,         -- For PIN + last name auth
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,          -- Optional expiration
  ADD COLUMN IF NOT EXISTS last_accessed_at timestamptz,    -- Track portal access
  ADD COLUMN IF NOT EXISTS access_count int DEFAULT 0,      -- Track how many times accessed
  ADD COLUMN IF NOT EXISTS contractor_logo_url text,        -- Company logo for branding
  ADD COLUMN IF NOT EXISTS contractor_name text;            -- Company name for branding

-- Create index on portal_code for fast lookups
CREATE INDEX IF NOT EXISTS idx_homeowner_portals_code ON public.homeowner_portals(portal_code) WHERE portal_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_homeowner_portals_job_active ON public.homeowner_portals(job_id, is_active) WHERE is_active = true;

-- ============================================================
-- PART 2 — CREATE homeowner_portal_sessions TABLE
-- ============================================================
-- Track authenticated portal sessions (PIN + last name validated)

CREATE TABLE IF NOT EXISTS public.homeowner_portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid NOT NULL REFERENCES public.homeowner_portals(id) ON DELETE CASCADE,
  session_token text UNIQUE NOT NULL,                       -- Secure session token
  ip_address inet,
  user_agent text,
  authenticated_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,                          -- Session expiration (24 hours default)
  last_activity_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_sessions_portal ON public.homeowner_portal_sessions(portal_id);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_token ON public.homeowner_portal_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_expires ON public.homeowner_portal_sessions(expires_at) WHERE expires_at > now();

-- ============================================================
-- PART 3 — CREATE homeowner_portal_chat_messages TABLE
-- ============================================================
-- Chat messages between homeowner and contractor
-- Integrates with unified inbox (Block 150000)

CREATE TABLE IF NOT EXISTS public.homeowner_portal_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid NOT NULL REFERENCES public.homeowner_portals(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  message_type text NOT NULL CHECK (message_type IN ('homeowner', 'contractor', 'ai_auto_reply', 'system')),
  sender_name text,                                         -- "John Smith" or "Carlos (Crew Lead)"
  body text NOT NULL,
  read_by_homeowner boolean DEFAULT false,
  read_by_contractor boolean DEFAULT false,
  unified_message_id uuid,                                  -- Link to unified_messages table if exists
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_chat_portal ON public.homeowner_portal_chat_messages(portal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_chat_job ON public.homeowner_portal_chat_messages(job_id);
CREATE INDEX IF NOT EXISTS idx_portal_chat_unread ON public.homeowner_portal_chat_messages(portal_id, read_by_contractor) WHERE read_by_contractor = false;

-- ============================================================
-- PART 4 — CREATE homeowner_portal_notifications TABLE
-- ============================================================
-- Track automated notifications sent to homeowner
-- Extends homeowner_notifications from Block 65000

CREATE TABLE IF NOT EXISTS public.homeowner_portal_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid NOT NULL REFERENCES public.homeowner_portals(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  notification_type text NOT NULL CHECK (notification_type IN (
    'estimate_scheduled',
    'job_approved',
    'materials_delivered',
    'crew_on_way',
    'crew_arrived',
    'crew_finished',
    'photos_uploaded',
    'job_complete',
    'supplement_approved',
    'invoice_ready',
    'inspection_scheduled',
    'status_update'
  )),
  message text NOT NULL,
  sent_via_sms boolean DEFAULT false,
  sent_via_email boolean DEFAULT false,
  sms_sid text,                                             -- Twilio SID if sent via SMS
  email_id text,                                            -- Email provider ID if sent
  sent_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_notifications_portal ON public.homeowner_portal_notifications(portal_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_notifications_job ON public.homeowner_portal_notifications(job_id);

-- ============================================================
-- PART 5 — CREATE homeowner_portal_completion_reports TABLE
-- ============================================================
-- Final completion report PDFs generated for each job

CREATE TABLE IF NOT EXISTS public.homeowner_portal_completion_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_id uuid NOT NULL REFERENCES public.homeowner_portals(id) ON DELETE CASCADE,
  job_id uuid NOT NULL,
  report_pdf_url text NOT NULL,                             -- URL to PDF in storage
  report_pdf_path text NOT NULL,                            -- Storage path
  generated_at timestamptz DEFAULT now(),
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb DEFAULT '{}'::jsonb,                       -- Report data (photos, measurements, etc.)
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_completion_reports_portal ON public.homeowner_portal_completion_reports(portal_id);
CREATE INDEX IF NOT EXISTS idx_completion_reports_job ON public.homeowner_portal_completion_reports(job_id);

-- ============================================================
-- PART 6 — HELPER FUNCTIONS
-- ============================================================

-- Generate unique 8-character portal code (alphanumeric, uppercase)
CREATE OR REPLACE FUNCTION generate_portal_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_code text;
  v_exists boolean;
  v_chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  i int;
BEGIN
  LOOP
    -- Generate 8-character code
    v_code := '';
    FOR i IN 1..8 LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM public.homeowner_portals WHERE portal_code = v_code) INTO v_exists;
    
    -- Exit loop if code is unique
    EXIT WHEN NOT v_exists;
  END LOOP;
  
  RETURN v_code;
END;
$$;

-- Generate 4-digit PIN code
CREATE OR REPLACE FUNCTION generate_pin_code()
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  -- Generate random 4-digit PIN (0000-9999)
  RETURN LPAD(floor(random() * 10000)::text, 4, '0');
END;
$$;

-- Create or update homeowner portal for a job
CREATE OR REPLACE FUNCTION create_homeowner_portal(
  p_job_id uuid,
  p_homeowner_name text DEFAULT NULL,
  p_homeowner_last_name text DEFAULT NULL,
  p_homeowner_email text DEFAULT NULL,
  p_homeowner_phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_portal_id uuid;
  v_portal_code text;
  v_pin_code text;
  v_portal_url text;
  v_workspace_id uuid;
  v_company_id uuid;
  v_contractor_name text;
  v_contractor_logo text;
  v_job_address text;
BEGIN
  -- Get job and workspace info
  SELECT j.workspace_id, j.company_id, j.address, j.homeowner_name, j.homeowner_email, j.homeowner_phone
  INTO v_workspace_id, v_company_id, v_job_address, p_homeowner_name, p_homeowner_email, p_homeowner_phone
  FROM public.jobs j
  WHERE j.id = p_job_id
  LIMIT 1;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found: %', p_job_id;
  END IF;
  
  -- Get contractor branding info
  IF v_company_id IS NOT NULL THEN
    SELECT rc.name, rc.logo_url
    INTO v_contractor_name, v_contractor_logo
    FROM public.roofing_companies rc
    WHERE rc.id = v_company_id
    LIMIT 1;
  END IF;
  
  -- Check if portal already exists
  SELECT id INTO v_portal_id
  FROM public.homeowner_portals
  WHERE job_id = p_job_id AND is_active = true
  LIMIT 1;
  
  IF v_portal_id IS NOT NULL THEN
    -- Update existing portal
    v_portal_code := (SELECT portal_code FROM public.homeowner_portals WHERE id = v_portal_id);
    v_pin_code := (SELECT pin_code FROM public.homeowner_portals WHERE id = v_portal_id);
    
    -- Generate PIN if not exists
    IF v_pin_code IS NULL THEN
      v_pin_code := generate_pin_code();
    END IF;
    
    UPDATE public.homeowner_portals
    SET
      homeowner_name = COALESCE(p_homeowner_name, homeowner_name),
      homeowner_last_name = COALESCE(p_homeowner_last_name, homeowner_last_name),
      homeowner_email = COALESCE(p_homeowner_email, homeowner_email),
      pin_code = v_pin_code,
      contractor_name = v_contractor_name,
      contractor_logo_url = v_contractor_logo,
      updated_at = now()
    WHERE id = v_portal_id;
    
    RETURN v_portal_id;
  END IF;
  
  -- Create new portal
  v_portal_code := generate_portal_code();
  v_pin_code := generate_pin_code();
  v_portal_url := 'https://portal.smartsendhq.com/j/' || v_portal_code;
  
  INSERT INTO public.homeowner_portals (
    workspace_id,
    company_id,
    job_id,
    portal_token,              -- Keep for backward compatibility
    portal_code,
    portal_url,
    pin_code,
    homeowner_name,
    homeowner_last_name,
    homeowner_email,
    contractor_name,
    contractor_logo_url,
    is_active
  ) VALUES (
    v_workspace_id,
    v_company_id,
    p_job_id,
    v_portal_code,              -- Use portal_code as token for backward compat
    v_portal_code,
    v_portal_url,
    v_pin_code,
    p_homeowner_name,
    p_homeowner_last_name,
    p_homeowner_email,
    v_contractor_name,
    v_contractor_logo_url,
    true
  )
  RETURNING id INTO v_portal_id;
  
  -- Create initial portal event
  INSERT INTO public.homeowner_portal_events (
    portal_id,
    job_id,
    event_type,
    title,
    description
  ) VALUES (
    v_portal_id,
    p_job_id,
    'status_update',
    'Portal Created',
    'Your SmartSend project portal is ready. Track your roof replacement here.'
  );
  
  -- Send initial SMS with PIN
  IF p_homeowner_phone IS NOT NULL THEN
    INSERT INTO public.homeowner_portal_notifications (
      portal_id,
      job_id,
      notification_type,
      message,
      sent_via_sms
    ) VALUES (
      v_portal_id,
      p_job_id,
      'status_update',
      format('Your SmartSend project portal is ready. Access: %s PIN: %s', v_portal_url, v_pin_code),
      true
    );
    
    -- Trigger SMS send (via pg_notify for edge function)
    PERFORM pg_notify('portal_notification', json_build_object(
      'portal_id', v_portal_id,
      'job_id', p_job_id,
      'type', 'portal_created',
      'phone', p_homeowner_phone,
      'message', format('Your SmartSend project portal is ready. Access: %s PIN: %s', v_portal_url, v_pin_code)
    )::text);
  END IF;
  
  RETURN v_portal_id;
END;
$$;

-- Authenticate portal access with PIN + last name
CREATE OR REPLACE FUNCTION authenticate_portal_access(
  p_portal_code text,
  p_pin_code text,
  p_last_name text,
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_portal record;
  v_session_token text;
  v_session_id uuid;
  v_expires_at timestamptz;
BEGIN
  -- Find portal by code
  SELECT * INTO v_portal
  FROM public.homeowner_portals
  WHERE portal_code = p_portal_code
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Portal not found or expired'
    );
  END IF;
  
  -- Verify PIN
  IF v_portal.pin_code != p_pin_code THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid PIN code'
    );
  END IF;
  
  -- Verify last name (case-insensitive)
  IF LOWER(TRIM(v_portal.homeowner_last_name)) != LOWER(TRIM(p_last_name)) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Last name does not match'
    );
  END IF;
  
  -- Generate session token
  v_session_token := encode(gen_random_bytes(32), 'hex');
  v_expires_at := now() + interval '24 hours';
  
  -- Create session
  INSERT INTO public.homeowner_portal_sessions (
    portal_id,
    session_token,
    ip_address,
    user_agent,
    expires_at
  ) VALUES (
    v_portal.id,
    v_session_token,
    p_ip_address,
    p_user_agent,
    v_expires_at
  )
  RETURNING id INTO v_session_id;
  
  -- Update portal access tracking
  UPDATE public.homeowner_portals
  SET
    last_accessed_at = now(),
    access_count = access_count + 1
  WHERE id = v_portal.id;
  
  RETURN jsonb_build_object(
    'success', true,
    'session_token', v_session_token,
    'portal_id', v_portal.id,
    'job_id', v_portal.job_id,
    'expires_at', v_expires_at
  );
END;
$$;

-- Get portal data for authenticated session
CREATE OR REPLACE FUNCTION get_portal_data(p_session_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_session record;
  v_portal record;
  v_job record;
  v_result jsonb;
BEGIN
  -- Validate session
  SELECT * INTO v_session
  FROM public.homeowner_portal_sessions
  WHERE session_token = p_session_token
    AND expires_at > now()
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Invalid or expired session');
  END IF;
  
  -- Update last activity
  UPDATE public.homeowner_portal_sessions
  SET last_activity_at = now()
  WHERE id = v_session.id;
  
  -- Get portal info
  SELECT * INTO v_portal
  FROM public.homeowner_portals
  WHERE id = v_session.portal_id;
  
  -- Get job info
  SELECT * INTO v_job
  FROM public.jobs
  WHERE id = v_portal.job_id
  LIMIT 1;
  
  -- Build result with all portal sections
  SELECT jsonb_build_object(
    'portal', jsonb_build_object(
      'id', v_portal.id,
      'portal_code', v_portal.portal_code,
      'portal_url', v_portal.portal_url,
      'homeowner_name', v_portal.homeowner_name,
      'contractor_name', v_portal.contractor_name,
      'contractor_logo_url', v_portal.contractor_logo_url
    ),
    'job', jsonb_build_object(
      'id', v_job.id,
      'address', v_job.address,
      'homeowner_name', COALESCE(v_job.homeowner_name, v_portal.homeowner_name),
      'homeowner_email', COALESCE(v_job.homeowner_email, v_portal.homeowner_email),
      'homeowner_phone', v_job.homeowner_phone,
      'stage', (SELECT name FROM public.job_stages WHERE id = v_job.stage_id),
      'progress', v_job.progress,
      'production_date', v_job.production_date,
      'estimated_value', v_job.estimated_value,
      'final_value', v_job.final_value,
      'insurance_claim', v_job.insurance_claim
    ),
    'timeline', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', id,
          'event_type', event_type,
          'title', title,
          'description', description,
          'created_at', created_at
        ) ORDER BY created_at DESC
      )
      FROM public.homeowner_portal_events
      WHERE portal_id = v_portal.id
      LIMIT 50
    ),
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
      WHERE job_id = v_job.id
      LIMIT 100
    ),
    'chat_messages', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', id,
          'message_type', message_type,
          'sender_name', sender_name,
          'body', body,
          'created_at', created_at
        ) ORDER BY created_at DESC
      )
      FROM public.homeowner_portal_chat_messages
      WHERE portal_id = v_portal.id
      LIMIT 50
    ),
    'notifications', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', id,
          'notification_type', notification_type,
          'message', message,
          'sent_at', sent_at
        ) ORDER BY sent_at DESC
      )
      FROM public.homeowner_portal_notifications
      WHERE portal_id = v_portal.id
      LIMIT 20
    ),
    'insurance_claim', (
      SELECT jsonb_build_object(
        'claim_number', claim_number,
        'carrier_name', carrier_name,
        'claim_status', claim_status,
        'deductible', deductible,
        'acv_amount', acv_amount,
        'rcv_amount', rcv_amount,
        'depreciation_amount', depreciation_amount,
        'acv_paid', acv_paid,
        'rcv_paid', rcv_paid,
        'supplement_requested', supplement_requested,
        'supplement_approved', supplement_approved
      )
      FROM public.job_insurance_claims
      WHERE job_id = v_job.id
      LIMIT 1
    ),
    'measurement', (
      SELECT jsonb_build_object(
        'total_squares', total_squares,
        'squares_min', squares_min,
        'squares_max', squares_max,
        'pitch_value', pitch_value,
        'pitch_category', pitch_category,
        'ridges_linear_ft', ridges_linear_ft,
        'valleys_linear_ft', valleys_linear_ft,
        'rakes_linear_ft', rakes_linear_ft,
        'eaves_linear_ft', eaves_linear_ft,
        'waste_factor_percent', waste_factor_percent,
        'complexity_rating', complexity_rating
      )
      FROM public.roof_measurement_data
      WHERE job_id = v_job.id
      LIMIT 1
    ),
    'materials', (
      SELECT jsonb_build_object(
        'bundles', (materials->>'bundles')::int,
        'ridge_bundles', (materials->>'ridge_bundles')::int,
        'underlayment', materials->>'underlayment',
        'drip_edge', (materials->>'drip_edge')::numeric,
        'ice_water_shield', (materials->>'ice_water_shield')::numeric,
        'materials_list', (SELECT jsonb_agg(value) FROM jsonb_array_elements_text(materials->'materials_list'))
      )
      FROM public.jobs
      WHERE id = v_job.id AND materials IS NOT NULL
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- ============================================================
-- PART 7 — TRIGGERS FOR AUTOMATED NOTIFICATIONS
-- ============================================================

-- Auto-create notification when job stage changes
CREATE OR REPLACE FUNCTION notify_homeowner_on_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_portal_id uuid;
  v_stage_name text;
  v_notification_type text;
  v_message text;
  v_homeowner_phone text;
  v_homeowner_email text;
BEGIN
  -- Only trigger on stage change
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    -- Get portal for this job
    SELECT id, homeowner_phone, homeowner_email INTO v_portal_id, v_homeowner_phone, v_homeowner_email
    FROM public.homeowner_portals
    WHERE job_id = NEW.id AND is_active = true
    LIMIT 1;
    
    IF v_portal_id IS NOT NULL THEN
      -- Get stage name
      SELECT name INTO v_stage_name
      FROM public.job_stages
      WHERE id = NEW.stage_id;
      
      -- Map stage to notification type and message
      CASE v_stage_name
        WHEN 'Production' THEN
          v_notification_type := 'status_update';
          v_message := 'Your roof installation has been scheduled! Check your portal for details.';
        WHEN 'Completed' THEN
          v_notification_type := 'job_complete';
          v_message := 'Great news! Your roof replacement is complete. View your completion report in the portal.';
        ELSE
          v_notification_type := 'status_update';
          v_message := format('Your project status has been updated: %s', v_stage_name);
      END CASE;
      
      -- Create notification record
      INSERT INTO public.homeowner_portal_notifications (
        portal_id,
        job_id,
        notification_type,
        message,
        sent_via_sms,
        sent_via_email
      ) VALUES (
        v_portal_id,
        NEW.id,
        v_notification_type,
        v_message,
        v_homeowner_phone IS NOT NULL,
        v_homeowner_email IS NOT NULL
      );
      
      -- Trigger SMS/email send (via pg_notify for edge function)
      IF v_homeowner_phone IS NOT NULL THEN
        PERFORM pg_notify('portal_notification', json_build_object(
          'portal_id', v_portal_id,
          'job_id', NEW.id,
          'type', v_notification_type,
          'phone', v_homeowner_phone,
          'message', v_message
        )::text);
      END IF;
      
      IF v_homeowner_email IS NOT NULL THEN
        PERFORM pg_notify('portal_notification', json_build_object(
          'portal_id', v_portal_id,
          'job_id', NEW.id,
          'type', v_notification_type,
          'email', v_homeowner_email,
          'message', v_message
        )::text);
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_homeowner_on_stage_change ON public.jobs;
CREATE TRIGGER trg_notify_homeowner_on_stage_change
AFTER UPDATE OF stage_id ON public.jobs
FOR EACH ROW
WHEN (OLD.stage_id IS DISTINCT FROM NEW.stage_id)
EXECUTE FUNCTION notify_homeowner_on_stage_change();

-- Auto-add photo to portal feed when crew uploads photo
CREATE OR REPLACE FUNCTION add_photo_to_portal_feed()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_portal_id uuid;
  v_job_id uuid;
BEGIN
  -- Get job_id from photo record
  v_job_id := NEW.job_id;
  
  IF v_job_id IS NOT NULL THEN
    -- Get portal for this job
    SELECT id INTO v_portal_id
    FROM public.homeowner_portals
    WHERE job_id = v_job_id AND is_active = true
    LIMIT 1;
    
    IF v_portal_id IS NOT NULL THEN
      -- Add photo to homeowner_photo_feed if not exists
      INSERT INTO public.homeowner_photo_feed (
        job_id,
        photo_url,
        caption,
        photo_type,
        uploaded_by_crew
      )
      SELECT
        v_job_id,
        NEW.url,
        COALESCE(NEW.caption, 'Progress photo'),
        COALESCE(NEW.category, 'during'),
        true
      WHERE NOT EXISTS (
        SELECT 1 FROM public.homeowner_photo_feed
        WHERE job_id = v_job_id AND photo_url = NEW.url
      );
      
      -- Create portal event
      INSERT INTO public.homeowner_portal_events (
        portal_id,
        job_id,
        event_type,
        title,
        description
      ) VALUES (
        v_portal_id,
        v_job_id,
        'photo_added',
        'New Photo Added',
        'New progress photos have been added to your project.'
      );
      
      -- Send notification
      INSERT INTO public.homeowner_portal_notifications (
        portal_id,
        job_id,
        notification_type,
        message,
        sent_via_sms
      )
      SELECT
        v_portal_id,
        v_job_id,
        'photos_uploaded',
        'New progress photos have been added to your project portal!',
        true
      WHERE EXISTS (
        SELECT 1 FROM public.homeowner_portals
        WHERE id = v_portal_id AND homeowner_phone IS NOT NULL
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- This trigger will be added to job_photos table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_photos') THEN
    DROP TRIGGER IF EXISTS trg_add_photo_to_portal_feed ON public.job_photos;
    CREATE TRIGGER trg_add_photo_to_portal_feed
    AFTER INSERT ON public.job_photos
    FOR EACH ROW
    EXECUTE FUNCTION add_photo_to_portal_feed();
  END IF;
END $$;

-- ============================================================
-- PART 8 — ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE IF EXISTS public.homeowner_portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.homeowner_portal_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.homeowner_portal_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.homeowner_portal_completion_reports ENABLE ROW LEVEL SECURITY;

-- Portal sessions: Public insert (for authentication), read by session token (handled in functions)
DROP POLICY IF EXISTS "portal_sessions_public_insert" ON public.homeowner_portal_sessions;
CREATE POLICY "portal_sessions_public_insert"
  ON public.homeowner_portal_sessions FOR INSERT
  WITH CHECK (true);

-- Chat messages: Public read/insert (for authenticated portal access)
DROP POLICY IF EXISTS "portal_chat_public_all" ON public.homeowner_portal_chat_messages;
CREATE POLICY "portal_chat_public_all"
  ON public.homeowner_portal_chat_messages FOR ALL
  USING (true)
  WITH CHECK (true);

-- Notifications: Public read (for authenticated portal access)
DROP POLICY IF EXISTS "portal_notifications_public_read" ON public.homeowner_portal_notifications;
CREATE POLICY "portal_notifications_public_read"
  ON public.homeowner_portal_notifications FOR SELECT
  USING (true);

-- Completion reports: Public read (for authenticated portal access)
DROP POLICY IF EXISTS "completion_reports_public_read" ON public.homeowner_portal_completion_reports;
CREATE POLICY "completion_reports_public_read"
  ON public.homeowner_portal_completion_reports FOR SELECT
  USING (true);

-- ============================================================
-- PART 9 — GRANT PERMISSIONS
-- ============================================================

GRANT SELECT, INSERT ON public.homeowner_portal_sessions TO anon;
GRANT SELECT, INSERT ON public.homeowner_portal_chat_messages TO anon;
GRANT SELECT ON public.homeowner_portal_notifications TO anon;
GRANT SELECT ON public.homeowner_portal_completion_reports TO anon;

GRANT SELECT, INSERT, UPDATE ON public.homeowner_portal_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.homeowner_portal_chat_messages TO authenticated;
GRANT SELECT, INSERT ON public.homeowner_portal_notifications TO authenticated;
GRANT SELECT, INSERT ON public.homeowner_portal_completion_reports TO authenticated;

-- ============================================================
-- PART 10 — COMMENTS
-- ============================================================

COMMENT ON TABLE public.homeowner_portal_sessions IS 'Block 200000: Authenticated portal sessions (PIN + last name validated)';
COMMENT ON TABLE public.homeowner_portal_chat_messages IS 'Block 200000: Chat messages between homeowner and contractor';
COMMENT ON TABLE public.homeowner_portal_notifications IS 'Block 200000: Automated notifications sent to homeowners';
COMMENT ON TABLE public.homeowner_portal_completion_reports IS 'Block 200000: Final completion report PDFs';
COMMENT ON FUNCTION create_homeowner_portal(uuid, text, text, text, text) IS 'Block 200000: Create or update homeowner portal for a job';
COMMENT ON FUNCTION authenticate_portal_access(text, text, text, inet, text) IS 'Block 200000: Authenticate portal access with PIN + last name';
COMMENT ON FUNCTION get_portal_data(text) IS 'Block 200000: Get all portal data for authenticated session';


























