-- =========================================================
-- Block 253600 — SmartSend Crew Communication Suite v1
-- "Group Chat, Job Threads, AI Summaries, Voice-to-Note, Photo-to-Instruction, Supervisor Alerts"
-- =========================================================
-- 
-- This block makes SmartSend the communication backbone of a roofing company.
-- 
-- Roofing communication today is CHAOS:
-- ❌ Texts everywhere
-- ❌ No documentation
-- ❌ Lost instructions
-- ❌ Miscommunication
-- ❌ Spanish/English confusion
-- ❌ Too many group chats
-- ❌ No photos attached to jobs
-- ❌ No job-level threads
-- ❌ PM overwhelmed
-- ❌ Supervisors blind
-- ❌ No record for disputes
-- 
-- SmartSend fixes EVERYTHING:
-- ✔ Job-specific chat rooms
-- ✔ Company-wide chat
-- ✔ AI photo notes
-- ✔ AI voice transcription
-- ✔ AI summaries
-- ✔ EN↔SP translation
-- ✔ Supervisor alerts
-- ✔ Automatically linked to jobs
-- ✔ Searchable history
-- ✔ Crew communication centralized
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE chat_rooms TABLE
-- ============================================================================
-- Chat rooms for different communication contexts

CREATE TABLE IF NOT EXISTS public.chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  room_type text NOT NULL CHECK (room_type IN ('company', 'job', 'supervisor', 'safety')),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure job_id is set for job rooms
  CONSTRAINT job_rooms_require_job_id CHECK (
    (room_type = 'job' AND job_id IS NOT NULL) OR
    (room_type != 'job')
  )
);

CREATE INDEX IF NOT EXISTS idx_chat_rooms_company ON public.chat_rooms(company_id);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_type ON public.chat_rooms(company_id, room_type);
CREATE INDEX IF NOT EXISTS idx_chat_rooms_job ON public.chat_rooms(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_rooms_created ON public.chat_rooms(created_at DESC);

COMMENT ON TABLE public.chat_rooms IS 'Chat rooms for crew communication (Block 253600)';
COMMENT ON COLUMN public.chat_rooms.room_type IS 'Room type: company (whole crew), job (auto-created per job), supervisor (PM & Foremen), safety (Safety Manager, PM, Foremen, AI Safety Bot)';

-- ============================================================================
-- PART 2 — CREATE chat_room_members TABLE
-- ============================================================================
-- Track who has access to which rooms

CREATE TABLE IF NOT EXISTS public.chat_room_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  role text CHECK (role IN ('member', 'admin')) DEFAULT 'member',
  joined_at timestamptz DEFAULT now(),
  
  -- Ensure either employee_id or user_id is set
  CONSTRAINT chat_room_members_require_identity CHECK (
    (employee_id IS NOT NULL) OR (user_id IS NOT NULL)
  ),
  
  -- Prevent duplicate memberships
  CONSTRAINT unique_room_member UNIQUE (room_id, COALESCE(employee_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

CREATE INDEX IF NOT EXISTS idx_chat_room_members_room ON public.chat_room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_chat_room_members_employee ON public.chat_room_members(employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_room_members_user ON public.chat_room_members(user_id) WHERE user_id IS NOT NULL;

COMMENT ON TABLE public.chat_room_members IS 'Membership tracking for chat rooms (Block 253600)';

-- ============================================================================
-- PART 3 — CREATE chat_messages TABLE
-- ============================================================================
-- All messages in chat rooms

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.workforce_employees(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Message content
  message text NOT NULL,
  photo_url text,
  audio_url text,
  
  -- AI processing
  ai_summary text,                    -- AI-generated summary of the message
  ai_photo_note text,                 -- AI-generated note from photo (Photo-to-Note)
  ai_transcription text,              -- AI transcription of voice message (Voice-to-Note)
  translated_message text,            -- Translated message (EN ↔ Spanish)
  detected_language text,             -- Detected language of original message
  
  -- Metadata
  message_type text CHECK (message_type IN ('text', 'photo', 'audio', 'system')) DEFAULT 'text',
  is_edited boolean DEFAULT false,
  edited_at timestamptz,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure either employee_id or user_id is set
  CONSTRAINT chat_messages_require_sender CHECK (
    (employee_id IS NOT NULL) OR (user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON public.chat_messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_employee ON public.chat_messages(employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON public.chat_messages(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON public.chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_photo ON public.chat_messages(photo_url) WHERE photo_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_audio ON public.chat_messages(audio_url) WHERE audio_url IS NOT NULL;

-- Full-text search index for message content
CREATE INDEX IF NOT EXISTS idx_chat_messages_search ON public.chat_messages USING gin(to_tsvector('english', message));

COMMENT ON TABLE public.chat_messages IS 'Messages in chat rooms (Block 253600)';
COMMENT ON COLUMN public.chat_messages.ai_photo_note IS 'AI-generated structured note from photo (e.g., "Underlayment installed, Valley area, No wrinkles visible, Ready for shingles")';
COMMENT ON COLUMN public.chat_messages.ai_transcription IS 'AI transcription of voice message, cleaned and structured';
COMMENT ON COLUMN public.chat_messages.translated_message IS 'Translated version of message (EN ↔ Spanish)';

-- ============================================================================
-- PART 4 — CREATE supervisor_alerts TABLE
-- ============================================================================
-- Alerts triggered by AI or keywords for supervisors

CREATE TABLE IF NOT EXISTS public.supervisor_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  room_id uuid REFERENCES public.chat_rooms(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.chat_messages(id) ON DELETE SET NULL,
  
  alert_type text NOT NULL CHECK (alert_type IN ('safety', 'delay', 'materials', 'conflict', 'quality', 'other')),
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  
  -- Alert content
  title text NOT NULL,
  message text NOT NULL,
  context jsonb DEFAULT '{}'::jsonb,  -- Additional context (keywords detected, photo analysis, etc.)
  
  -- Resolution
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes text,
  
  -- Notification
  notified_users uuid[],              -- Array of user IDs who were notified
  notified_at timestamptz,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supervisor_alerts_company ON public.supervisor_alerts(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supervisor_alerts_job ON public.supervisor_alerts(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_supervisor_alerts_resolved ON public.supervisor_alerts(company_id, resolved) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_supervisor_alerts_type ON public.supervisor_alerts(company_id, alert_type);
CREATE INDEX IF NOT EXISTS idx_supervisor_alerts_severity ON public.supervisor_alerts(company_id, severity) WHERE severity IN ('high', 'critical');

COMMENT ON TABLE public.supervisor_alerts IS 'Supervisor alerts triggered by AI or keywords (Block 253600)';
COMMENT ON COLUMN public.supervisor_alerts.alert_type IS 'Alert type: safety, delay, materials, conflict, quality, other';
COMMENT ON COLUMN public.supervisor_alerts.context IS 'Additional context JSON: keywords detected, photo analysis results, etc.';

-- ============================================================================
-- PART 5 — CREATE chat_room_summaries TABLE
-- ============================================================================
-- AI-generated summaries of conversations

CREATE TABLE IF NOT EXISTS public.chat_room_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.chat_rooms(id) ON DELETE CASCADE,
  
  -- Summary content
  summary_text text NOT NULL,
  summary_type text CHECK (summary_type IN ('daily', 'thread', 'job_completion')) DEFAULT 'daily',
  
  -- Time range covered
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  message_count int DEFAULT 0,
  
  -- Key points extracted
  key_points text[],                  -- Array of key points from conversation
  action_items text[],                -- Array of action items identified
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_room_summaries_room ON public.chat_room_summaries(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_room_summaries_type ON public.chat_room_summaries(room_id, summary_type);

COMMENT ON TABLE public.chat_room_summaries IS 'AI-generated summaries of chat conversations (Block 253600)';

-- ============================================================================
-- PART 6 — TRIGGERS AND FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_chat_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for chat_rooms
CREATE TRIGGER trg_chat_rooms_updated_at
BEFORE UPDATE ON public.chat_rooms
FOR EACH ROW
EXECUTE FUNCTION public.update_chat_updated_at();

-- Trigger for chat_messages
CREATE TRIGGER trg_chat_messages_updated_at
BEFORE UPDATE ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.update_chat_updated_at();

-- Trigger for supervisor_alerts
CREATE TRIGGER trg_supervisor_alerts_updated_at
BEFORE UPDATE ON public.supervisor_alerts
FOR EACH ROW
EXECUTE FUNCTION public.update_chat_updated_at();

-- Function to auto-create job chat room (called from API)
-- This function is designed to be called from application code when a job is created
CREATE OR REPLACE FUNCTION public.ensure_job_chat_room(
  p_job_id uuid,
  p_company_id uuid,
  p_job_name text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_room_id uuid;
  v_final_job_name text;
BEGIN
  -- Check if room already exists
  SELECT id INTO v_room_id
  FROM public.chat_rooms
  WHERE job_id = p_job_id
    AND room_type = 'job'
  LIMIT 1;
  
  -- If room exists, return it
  IF v_room_id IS NOT NULL THEN
    RETURN v_room_id;
  END IF;
  
  -- Generate job name if not provided
  IF p_job_name IS NULL THEN
    v_final_job_name := 'Job #' || SUBSTRING(p_job_id::text, 1, 8) || ' — Chat';
  ELSE
    v_final_job_name := p_job_name;
  END IF;
  
  -- Create the chat room
  INSERT INTO public.chat_rooms (room_type, job_id, name, company_id)
  VALUES ('job', p_job_id, v_final_job_name, p_company_id)
  RETURNING id INTO v_room_id;
  
  -- Auto-add relevant employees (foremen, PM, installers) to the room
  INSERT INTO public.chat_room_members (room_id, employee_id, role)
  SELECT v_room_id, id, 'member'
  FROM public.workforce_employees
  WHERE company_id = p_company_id
    AND role IN ('foreman', 'project_manager', 'installer')
    AND status = 'active'
  ON CONFLICT DO NOTHING;
  
  RETURN v_room_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.ensure_job_chat_room IS 'Ensure a job chat room exists, creating it if needed (Block 253600)';

-- Function to detect supervisor alerts from messages
CREATE OR REPLACE FUNCTION public.detect_supervisor_alert()
RETURNS TRIGGER AS $$
DECLARE
  v_alert_type text;
  v_severity text;
  v_keywords text[];
  v_company_id uuid;
  v_job_id uuid;
BEGIN
  -- Get company_id and job_id from room
  SELECT cr.company_id, cr.job_id INTO v_company_id, v_job_id
  FROM public.chat_rooms cr
  WHERE cr.id = NEW.room_id;
  
  -- Keyword detection for alerts
  v_keywords := ARRAY['problem', 'delay', 'missing', 'danger', 'safety', 'accident', 'injury', 
                      'shortage', 'conflict', 'complaint', 'issue', 'broken', 'damage', 
                      'emergency', 'urgent', 'help', 'stuck', 'can''t', 'unable'];
  
  -- Check if message contains alert keywords (case-insensitive)
  IF EXISTS (
    SELECT 1
    FROM unnest(v_keywords) AS keyword
    WHERE LOWER(NEW.message) LIKE '%' || LOWER(keyword) || '%'
  ) THEN
    -- Determine alert type based on keywords
    IF LOWER(NEW.message) LIKE '%safety%' OR LOWER(NEW.message) LIKE '%danger%' OR 
       LOWER(NEW.message) LIKE '%accident%' OR LOWER(NEW.message) LIKE '%injury%' THEN
      v_alert_type := 'safety';
      v_severity := 'high';
    ELSIF LOWER(NEW.message) LIKE '%delay%' OR LOWER(NEW.message) LIKE '%stuck%' OR 
          LOWER(NEW.message) LIKE '%can''t%' OR LOWER(NEW.message) LIKE '%unable%' THEN
      v_alert_type := 'delay';
      v_severity := 'medium';
    ELSIF LOWER(NEW.message) LIKE '%missing%' OR LOWER(NEW.message) LIKE '%shortage%' THEN
      v_alert_type := 'materials';
      v_severity := 'medium';
    ELSIF LOWER(NEW.message) LIKE '%conflict%' OR LOWER(NEW.message) LIKE '%complaint%' THEN
      v_alert_type := 'conflict';
      v_severity := 'medium';
    ELSE
      v_alert_type := 'other';
      v_severity := 'low';
    END IF;
    
    -- Create supervisor alert
    INSERT INTO public.supervisor_alerts (
      company_id,
      job_id,
      room_id,
      message_id,
      alert_type,
      severity,
      title,
      message,
      context
    ) VALUES (
      v_company_id,
      v_job_id,
      NEW.room_id,
      NEW.id,
      v_alert_type,
      v_severity,
      'Supervisor Alert: ' || v_alert_type,
      NEW.message,
      jsonb_build_object(
        'keywords_detected', v_keywords,
        'message_type', NEW.message_type,
        'has_photo', NEW.photo_url IS NOT NULL,
        'has_audio', NEW.audio_url IS NOT NULL
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to detect alerts on message insert
CREATE TRIGGER trg_detect_supervisor_alert
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.detect_supervisor_alert();

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_room_summaries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for chat_rooms
-- Users can see rooms for their company
CREATE POLICY "chat_rooms_select_company" ON public.chat_rooms
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.roofing_companies rc
      WHERE rc.id = chat_rooms.company_id
        AND (rc.owner_id = auth.uid() OR EXISTS (
          SELECT 1 FROM public.workforce_employees we
          WHERE we.company_id = rc.id
            AND we.email = (SELECT email FROM auth.users WHERE id = auth.uid())
        ))
    )
  );

-- Users can create rooms for their company
CREATE POLICY "chat_rooms_insert_company" ON public.chat_rooms
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.roofing_companies rc
      WHERE rc.id = chat_rooms.company_id
        AND (rc.owner_id = auth.uid() OR EXISTS (
          SELECT 1 FROM public.workforce_employees we
          WHERE we.company_id = rc.id
            AND we.email = (SELECT email FROM auth.users WHERE id = auth.uid())
        ))
    )
  );

-- RLS Policies for chat_room_members
-- Users can see members of rooms they belong to
CREATE POLICY "chat_room_members_select_member" ON public.chat_room_members
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_room_members crm2
      WHERE crm2.room_id = chat_room_members.room_id
        AND (crm2.employee_id IN (
          SELECT id FROM public.workforce_employees 
          WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
        ) OR crm2.user_id = auth.uid())
    )
  );

-- RLS Policies for chat_messages
-- Users can see messages in rooms they belong to
CREATE POLICY "chat_messages_select_member" ON public.chat_messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_room_members crm
      WHERE crm.room_id = chat_messages.room_id
        AND (crm.employee_id IN (
          SELECT id FROM public.workforce_employees 
          WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
        ) OR crm.user_id = auth.uid())
    )
  );

-- Users can insert messages in rooms they belong to
CREATE POLICY "chat_messages_insert_member" ON public.chat_messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.chat_room_members crm
      WHERE crm.room_id = chat_messages.room_id
        AND (crm.employee_id IN (
          SELECT id FROM public.workforce_employees 
          WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
        ) OR crm.user_id = auth.uid())
    )
  );

-- RLS Policies for supervisor_alerts
-- Users can see alerts for their company
CREATE POLICY "supervisor_alerts_select_company" ON public.supervisor_alerts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.roofing_companies rc
      WHERE rc.id = supervisor_alerts.company_id
        AND (rc.owner_id = auth.uid() OR EXISTS (
          SELECT 1 FROM public.workforce_employees we
          WHERE we.company_id = rc.id
            AND we.role IN ('project_manager', 'foreman', 'owner')
            AND we.email = (SELECT email FROM auth.users WHERE id = auth.uid())
        ))
    )
  );

-- RLS Policies for chat_room_summaries
-- Users can see summaries for rooms they belong to
CREATE POLICY "chat_room_summaries_select_member" ON public.chat_room_summaries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_room_members crm
      WHERE crm.room_id = chat_room_summaries.room_id
        AND (crm.employee_id IN (
          SELECT id FROM public.workforce_employees 
          WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
        ) OR crm.user_id = auth.uid())
    )
  );

-- ============================================================================
-- PART 8 — HELPER FUNCTIONS
-- ============================================================================

-- Function to get or create company-wide chat room
CREATE OR REPLACE FUNCTION public.get_or_create_company_chat(company_uuid uuid)
RETURNS uuid AS $$
DECLARE
  v_room_id uuid;
BEGIN
  -- Try to find existing company chat room
  SELECT id INTO v_room_id
  FROM public.chat_rooms
  WHERE company_id = company_uuid
    AND room_type = 'company'
  LIMIT 1;
  
  -- If not found, create it
  IF v_room_id IS NULL THEN
    INSERT INTO public.chat_rooms (company_id, room_type, name, description)
    VALUES (company_uuid, 'company', 'Company Chat', 'Company-wide announcements and updates')
    RETURNING id INTO v_room_id;
  END IF;
  
  RETURN v_room_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get or create job chat room
CREATE OR REPLACE FUNCTION public.get_or_create_job_chat(job_uuid uuid, company_uuid uuid)
RETURNS uuid AS $$
DECLARE
  v_room_id uuid;
  v_job_name text;
BEGIN
  -- Try to find existing job chat room
  SELECT id INTO v_room_id
  FROM public.chat_rooms
  WHERE job_id = job_uuid
    AND room_type = 'job'
  LIMIT 1;
  
  -- If not found, create it
  IF v_room_id IS NULL THEN
    -- Generate job name (you may want to get actual job title from jobs table)
    v_job_name := 'Job #' || SUBSTRING(job_uuid::text, 1, 8) || ' — Chat';
    
    INSERT INTO public.chat_rooms (company_id, room_type, job_id, name)
    VALUES (company_uuid, 'job', job_uuid, v_job_name)
    RETURNING id INTO v_room_id;
    
    -- Auto-add relevant employees (foremen, PM, installers assigned to job)
    -- This is a placeholder - adjust based on your crew assignment structure
    INSERT INTO public.chat_room_members (room_id, employee_id, role)
    SELECT v_room_id, id, 'member'
    FROM public.workforce_employees
    WHERE company_id = company_uuid
      AND role IN ('foreman', 'project_manager', 'installer')
      AND status = 'active'
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN v_room_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.get_or_create_company_chat IS 'Get or create company-wide chat room (Block 253600)';
COMMENT ON FUNCTION public.get_or_create_job_chat IS 'Get or create job-specific chat room (Block 253600)';
























