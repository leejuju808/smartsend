-- =========================================================
-- Block 24380 — SmartSend Roofing Crew Assignment & Readiness v1
-- (Assign Crews • Prep Checklists • Day-Before Reminders • Crew Communication • Job-Day Organization Engine)
-- =========================================================
-- 
-- THE CREW MANAGEMENT SYSTEM THAT MAKES ROOFERS LOOK ELITE — ZERO FLUFF.
-- This block transforms SmartSend from a sales system into a field operations assistant that eliminates job-day chaos.
--
-- Every feature below directly helps roofers:
-- ✔ keep crews productive
-- ✔ avoid morning confusion
-- ✔ reduce callbacks
-- ✔ prevent mistakes
-- ✔ start jobs on time
-- ✔ run multiple crews smoothly

-- ============================================================================
-- PART 1 — ENHANCE crews TABLE WITH CREW PROFILES
-- ============================================================================
-- Add fields for crew leader, specialties, availability, and performance tracking

ALTER TABLE IF EXISTS public.crews
  ADD COLUMN IF NOT EXISTS crew_leader_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS specialties text[], -- ['TPO', 'shingles', 'metal', 'repairs']
  ADD COLUMN IF NOT EXISTS avg_job_duration_days numeric DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS availability_calendar jsonb DEFAULT '{}'::jsonb, -- Future: availability schedule
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS is_subcontractor boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS subcontractor_company text;

-- Index for crew leader lookups
CREATE INDEX IF NOT EXISTS idx_crews_crew_leader ON public.crews(crew_leader_id) WHERE crew_leader_id IS NOT NULL;

-- ============================================================================
-- PART 2 — ENHANCE crew_members TABLE
-- ============================================================================
-- Add phone and email for communication

ALTER TABLE IF EXISTS public.crew_members
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS is_crew_leader boolean DEFAULT false;

-- ============================================================================
-- PART 3 — ENHANCE job_crew_assignments TABLE
-- ============================================================================
-- Add project supervisor, helper assignments, and assignment details

ALTER TABLE IF EXISTS public.job_crew_assignments
  ADD COLUMN IF NOT EXISTS project_supervisor_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS helper_ids uuid[], -- Array of helper crew member IDs
  ADD COLUMN IF NOT EXISTS assignment_notes text,
  ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Index for project supervisor lookups
CREATE INDEX IF NOT EXISTS idx_job_crew_assignments_supervisor ON public.job_crew_assignments(project_supervisor_id) WHERE project_supervisor_id IS NOT NULL;

-- ============================================================================
-- PART 4 — CREATE crew_readiness_checklists TABLE
-- ============================================================================
-- Pre-job checklist that crew must complete before job day

CREATE TABLE IF NOT EXISTS public.crew_readiness_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Checklist items (all boolean, default false)
  shingle_color_verified boolean DEFAULT false,
  underlayment_confirmed boolean DEFAULT false,
  ridge_cap_included boolean DEFAULT false,
  drip_edge_included boolean DEFAULT false,
  flashing_confirmed boolean DEFAULT false,
  dumpster_scheduled boolean DEFAULT false,
  trailer_scheduled boolean DEFAULT false,
  weather_checked boolean DEFAULT false,
  address_verified boolean DEFAULT false,
  job_notes_reviewed boolean DEFAULT false,
  plywood_needs_prepared boolean DEFAULT false,
  homeowner_notified boolean DEFAULT false,
  
  -- Custom checklist items (flexible JSONB)
  custom_items jsonb DEFAULT '[]'::jsonb, -- [{"item": "Custom item", "checked": false}]
  
  -- Status tracking
  completed_at timestamptz,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_readiness_checklists_job ON public.crew_readiness_checklists(job_id);
CREATE INDEX IF NOT EXISTS idx_crew_readiness_checklists_workspace ON public.crew_readiness_checklists(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crew_readiness_checklists_completed ON public.crew_readiness_checklists(completed_at) WHERE completed_at IS NULL;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.set_crew_readiness_checklists_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crew_readiness_checklists_updated_at ON public.crew_readiness_checklists;
CREATE TRIGGER trg_crew_readiness_checklists_updated_at
BEFORE UPDATE ON public.crew_readiness_checklists
FOR EACH ROW
EXECUTE FUNCTION public.set_crew_readiness_checklists_updated_at();

-- ============================================================================
-- PART 5 — CREATE crew_job_reminders TABLE
-- ============================================================================
-- Day-before reminders sent to crew and homeowners

CREATE TABLE IF NOT EXISTS public.crew_job_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Reminder details
  reminder_type text NOT NULL CHECK (reminder_type IN (
    'day_before_crew',
    'day_before_homeowner',
    'job_morning_crew',
    'job_morning_homeowner'
  )),
  
  -- Recipient info
  recipient_type text NOT NULL CHECK (recipient_type IN ('crew_leader', 'crew_member', 'homeowner', 'roofer')),
  recipient_id uuid, -- crew_member_id or user_id
  recipient_email text,
  recipient_phone text,
  
  -- Message content
  message_text text NOT NULL,
  message_sent boolean DEFAULT false,
  sent_at timestamptz,
  
  -- Scheduling
  scheduled_send_at timestamptz NOT NULL,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_job_reminders_job ON public.crew_job_reminders(job_id);
CREATE INDEX IF NOT EXISTS idx_crew_job_reminders_scheduled ON public.crew_job_reminders(scheduled_send_at) WHERE message_sent = false;
CREATE INDEX IF NOT EXISTS idx_crew_job_reminders_workspace ON public.crew_job_reminders(workspace_id);

-- ============================================================================
-- PART 6 — CREATE job_morning_workflow TABLE
-- ============================================================================
-- Track crew status on job morning (on the way, arrived, materials confirmed, etc.)

CREATE TABLE IF NOT EXISTS public.job_morning_workflow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  
  -- Workflow status
  status text NOT NULL CHECK (status IN (
    'on_the_way',
    'arrived',
    'materials_confirmed',
    'materials_missing',
    'setup_complete',
    'work_started'
  )),
  
  -- Location tracking (optional GPS)
  check_in_location jsonb, -- {lat, lng, address}
  check_in_time timestamptz,
  
  -- Materials confirmation
  materials_confirmed boolean,
  materials_notes text,
  
  -- Safety checklist (optional)
  safety_checklist_completed boolean DEFAULT false,
  safety_checklist_items jsonb DEFAULT '[]'::jsonb,
  
  -- Metadata
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_morning_workflow_job ON public.job_morning_workflow(job_id);
CREATE INDEX IF NOT EXISTS idx_job_morning_workflow_crew ON public.job_morning_workflow(crew_id);
CREATE INDEX IF NOT EXISTS idx_job_morning_workflow_status ON public.job_morning_workflow(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_morning_workflow_workspace ON public.job_morning_workflow(workspace_id);

-- ============================================================================
-- PART 7 — CREATE crew_job_chat TABLE
-- ============================================================================
-- In-app chat channel for crew ↔ roofer communication per job

CREATE TABLE IF NOT EXISTS public.crew_job_chat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Message details
  sender_type text NOT NULL CHECK (sender_type IN ('crew', 'roofer', 'system')),
  sender_id uuid, -- crew_member_id or user_id
  sender_name text NOT NULL,
  
  -- Message content
  message_text text NOT NULL,
  
  -- Attachments (photos, documents)
  attachments jsonb DEFAULT '[]'::jsonb, -- [{"type": "photo", "url": "...", "filename": "..."}]
  
  -- Message metadata
  is_read boolean DEFAULT false,
  read_at timestamptz,
  read_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_job_chat_job ON public.crew_job_chat(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crew_job_chat_workspace ON public.crew_job_chat(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crew_job_chat_unread ON public.crew_job_chat(job_id, is_read) WHERE is_read = false;

-- ============================================================================
-- PART 8 — CREATE job_issues TABLE
-- ============================================================================
-- Crew can report issues and material shortages

CREATE TABLE IF NOT EXISTS public.job_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  reported_by uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  
  -- Issue details
  issue_type text NOT NULL CHECK (issue_type IN (
    'material_shortage',
    'wrong_material',
    'material_damage',
    'equipment_issue',
    'safety_concern',
    'homeowner_issue',
    'weather_delay',
    'other'
  )),
  
  -- Issue description
  title text NOT NULL,
  description text NOT NULL,
  
  -- Material details (if material-related)
  material_name text,
  material_quantity_needed text,
  material_notes text,
  
  -- Status tracking
  status text NOT NULL DEFAULT 'reported' CHECK (status IN (
    'reported',
    'acknowledged',
    'in_progress',
    'resolved',
    'cancelled'
  )),
  
  -- Resolution tracking
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes text,
  
  -- Priority
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  
  -- Supplier communication (if material issue)
  supplier_notified boolean DEFAULT false,
  supplier_notification_sent_at timestamptz,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_issues_job ON public.job_issues(job_id);
CREATE INDEX IF NOT EXISTS idx_job_issues_status ON public.job_issues(status, priority DESC);
CREATE INDEX IF NOT EXISTS idx_job_issues_workspace ON public.job_issues(workspace_id);
CREATE INDEX IF NOT EXISTS idx_job_issues_type ON public.job_issues(issue_type);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.set_job_issues_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_issues_updated_at ON public.job_issues;
CREATE TRIGGER trg_job_issues_updated_at
BEFORE UPDATE ON public.job_issues
FOR EACH ROW
EXECUTE FUNCTION public.set_job_issues_updated_at();

-- ============================================================================
-- PART 9 — CREATE crew_completion_workflow TABLE
-- ============================================================================
-- Track crew completion workflow and trigger post-completion automations

CREATE TABLE IF NOT EXISTS public.crew_completion_workflow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  completed_by uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  
  -- Completion status
  status text NOT NULL CHECK (status IN (
    'marked_complete',
    'cleanup_complete',
    'photos_uploaded',
    'homeowner_notified',
    'warranty_delivered',
    'fully_complete'
  )),
  
  -- Completion checklist
  cleanup_completed boolean DEFAULT false,
  photos_uploaded boolean DEFAULT false,
  before_photos jsonb DEFAULT '[]'::jsonb,
  after_photos jsonb DEFAULT '[]'::jsonb,
  warranty_delivered boolean DEFAULT false,
  warranty_notes text,
  
  -- Homeowner notification
  homeowner_notified boolean DEFAULT false,
  homeowner_notification_sent_at timestamptz,
  
  -- Review request
  review_request_sent boolean DEFAULT false,
  review_request_sent_at timestamptz,
  
  -- Referral request
  referral_request_sent boolean DEFAULT false,
  referral_request_sent_at timestamptz,
  
  -- Completion notes
  completion_notes text,
  
  -- Timestamps
  completed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_completion_workflow_job ON public.crew_completion_workflow(job_id);
CREATE INDEX IF NOT EXISTS idx_crew_completion_workflow_workspace ON public.crew_completion_workflow(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crew_completion_workflow_status ON public.crew_completion_workflow(status);

-- ============================================================================
-- PART 10 — CREATE crew_performance_scores TABLE (Phase 2 - Optional)
-- ============================================================================
-- Track crew performance metrics for scoring and comparison

CREATE TABLE IF NOT EXISTS public.crew_performance_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid NOT NULL REFERENCES public.crews(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Performance period
  period_start_date date NOT NULL,
  period_end_date date NOT NULL,
  
  -- Metrics
  jobs_completed integer DEFAULT 0,
  on_time_percentage numeric DEFAULT 0, -- Percentage of jobs started on time
  issues_per_job numeric DEFAULT 0, -- Average issues reported per job
  callback_rate numeric DEFAULT 0, -- Percentage of jobs requiring callbacks
  homeowner_satisfaction_score numeric DEFAULT 0, -- Average satisfaction (0-100)
  
  -- Scores (0-100)
  quality_score numeric DEFAULT 0,
  cleanup_score numeric DEFAULT 0,
  communication_score numeric DEFAULT 0,
  accuracy_score numeric DEFAULT 0,
  overall_score numeric DEFAULT 0,
  
  -- Manual feedback
  roofer_feedback text,
  roofer_feedback_score numeric,
  roofer_feedback_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Timestamps
  calculated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_performance_scores_crew ON public.crew_performance_scores(crew_id, period_end_date DESC);
CREATE INDEX IF NOT EXISTS idx_crew_performance_scores_workspace ON public.crew_performance_scores(workspace_id);
CREATE INDEX IF NOT EXISTS idx_crew_performance_scores_overall ON public.crew_performance_scores(overall_score DESC);

-- ============================================================================
-- PART 11 — FUNCTION: Auto-create readiness checklist when crew assigned
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_create_readiness_checklist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only create checklist if job is scheduled and doesn't already have one
  IF NEW.job_id IS NOT NULL AND NEW.unassigned_at IS NULL THEN
    INSERT INTO public.crew_readiness_checklists (job_id, workspace_id)
    SELECT j.id, j.workspace_id
    FROM public.roofing_jobs j
    WHERE j.id = NEW.job_id
      AND j.scheduled_start_date IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.crew_readiness_checklists crc
        WHERE crc.job_id = j.id
      )
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_readiness_checklist ON public.job_crew_assignments;
CREATE TRIGGER trg_auto_create_readiness_checklist
AFTER INSERT ON public.job_crew_assignments
FOR EACH ROW
WHEN (NEW.unassigned_at IS NULL)
EXECUTE FUNCTION public.auto_create_readiness_checklist();

-- ============================================================================
-- PART 12 — FUNCTION: Schedule day-before reminders
-- ============================================================================

CREATE OR REPLACE FUNCTION public.schedule_day_before_reminders(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job RECORD;
  v_crew RECORD;
  v_crew_leader RECORD;
  v_homeowner_email text;
  v_homeowner_phone text;
  v_reminder_time timestamptz;
  v_message_text text;
BEGIN
  -- Get job details
  SELECT 
    j.*,
    l.email as homeowner_email,
    l.phone as homeowner_phone,
    l.first_name || ' ' || COALESCE(l.last_name, '') as homeowner_name
  INTO v_job
  FROM public.roofing_jobs j
  LEFT JOIN public.leads l ON j.lead_id = l.id
  WHERE j.id = p_job_id;
  
  IF NOT FOUND OR v_job.scheduled_start_date IS NULL THEN
    RETURN;
  END IF;
  
  -- Calculate reminder time (12-24 hours before job start, default to 18 hours)
  v_reminder_time := (v_job.scheduled_start_date::timestamptz - INTERVAL '18 hours');
  
  -- Only schedule if reminder time is in the future
  IF v_reminder_time <= now() THEN
    RETURN;
  END IF;
  
  -- Get crew assignment
  SELECT c.*, cm.name as crew_leader_name, cm.email as crew_leader_email, cm.phone_number as crew_leader_phone
  INTO v_crew
  FROM public.job_crew_assignments jca
  JOIN public.crews c ON c.id = jca.crew_id
  LEFT JOIN public.crew_members cm ON cm.id = c.crew_leader_id
  WHERE jca.job_id = p_job_id
    AND jca.unassigned_at IS NULL
  LIMIT 1;
  
  -- Schedule crew leader reminder
  IF v_crew.id IS NOT NULL AND v_crew.crew_leader_email IS NOT NULL THEN
    v_message_text := format(
      'Tomorrow''s job: %s
Arrival: %s
Address: %s
Shingle: %s
Notes: %s
Materials confirmed on-site.',
      COALESCE(v_job.title, 'Roofing Job'),
      COALESCE(to_char(v_job.scheduled_start_date::timestamptz, 'HH:MI AM'), '8-9 AM'),
      COALESCE(v_job.address, 'See job details'),
      COALESCE(v_job.shingle_color, 'See job details'),
      COALESCE(v_job.notes, 'None')
    );
    
    INSERT INTO public.crew_job_reminders (
      job_id,
      workspace_id,
      reminder_type,
      recipient_type,
      recipient_id,
      recipient_email,
      recipient_phone,
      message_text,
      scheduled_send_at
    ) VALUES (
      p_job_id,
      v_job.workspace_id,
      'day_before_crew',
      'crew_leader',
      v_crew.crew_leader_id,
      v_crew.crew_leader_email,
      v_crew.crew_leader_phone,
      v_message_text,
      v_reminder_time
    )
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Schedule homeowner reminder
  IF v_job.homeowner_email IS NOT NULL THEN
    v_message_text := format(
      'Your roofing crew is scheduled for tomorrow between %s.
We''ll keep you updated as work progresses.',
      COALESCE(to_char(v_job.scheduled_start_date::timestamptz, 'HH:MI AM'), '8-9 AM')
    );
    
    INSERT INTO public.crew_job_reminders (
      job_id,
      workspace_id,
      reminder_type,
      recipient_type,
      recipient_email,
      message_text,
      scheduled_send_at
    ) VALUES (
      p_job_id,
      v_job.workspace_id,
      'day_before_homeowner',
      'homeowner',
      NULL,
      v_job.homeowner_email,
      NULL,
      v_message_text,
      v_reminder_time
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.schedule_day_before_reminders IS 'Schedules day-before reminders for crew and homeowner when job is scheduled';

-- ============================================================================
-- PART 13 — FUNCTION: Handle "On The Way" status update
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_crew_on_the_way(p_job_id uuid, p_crew_member_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job RECORD;
  v_workflow_id uuid;
BEGIN
  -- Get job details
  SELECT j.*, jca.crew_id
  INTO v_job
  FROM public.roofing_jobs j
  LEFT JOIN public.job_crew_assignments jca ON jca.job_id = j.id AND jca.unassigned_at IS NULL
  WHERE j.id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Create workflow entry
  INSERT INTO public.job_morning_workflow (
    job_id,
    workspace_id,
    crew_id,
    crew_member_id,
    status,
    check_in_time
  ) VALUES (
    p_job_id,
    v_job.workspace_id,
    v_job.crew_id,
    p_crew_member_id,
    'on_the_way',
    now()
  )
  RETURNING id INTO v_workflow_id;
  
  -- Notify roofer (create notification)
  INSERT INTO public.notifications (
    user_id,
    workspace_id,
    type,
    title,
    body,
    metadata
  )
  SELECT 
    wm.user_id,
    v_job.workspace_id,
    'crew_status_update',
    'Crew On The Way',
    format('Crew is on the way to %s', COALESCE(v_job.title, 'job')),
    jsonb_build_object('job_id', p_job_id, 'workflow_id', v_workflow_id)
  FROM public.workspace_members wm
  WHERE wm.workspace_id = v_job.workspace_id
    AND wm.role IN ('owner', 'admin');
  
  -- Notify homeowner (create reminder entry for immediate send)
  INSERT INTO public.crew_job_reminders (
    job_id,
    workspace_id,
    reminder_type,
    recipient_type,
    recipient_email,
    message_text,
    scheduled_send_at,
    message_sent
  )
  SELECT 
    p_job_id,
    v_job.workspace_id,
    'job_morning_homeowner',
    'homeowner',
    l.email,
    'Your roofing crew is on the way to your property. They should arrive shortly.',
    now(),
    false
  FROM public.leads l
  WHERE l.id = v_job.lead_id
    AND l.email IS NOT NULL;
  
  -- Update job pipeline status if needed
  UPDATE public.roofing_jobs
  SET status = 'in_progress'
  WHERE id = p_job_id
    AND status = 'scheduled';
END;
$$;

COMMENT ON FUNCTION public.handle_crew_on_the_way IS 'Handles crew "on the way" status update and sends notifications';

-- ============================================================================
-- PART 14 — FUNCTION: Handle "Arrived" status update
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_crew_arrived(p_job_id uuid, p_crew_member_id uuid, p_location jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job RECORD;
  v_workflow_id uuid;
BEGIN
  -- Get job details
  SELECT j.*, jca.crew_id
  INTO v_job
  FROM public.roofing_jobs j
  LEFT JOIN public.job_crew_assignments jca ON jca.job_id = j.id AND jca.unassigned_at IS NULL
  WHERE j.id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Create workflow entry
  INSERT INTO public.job_morning_workflow (
    job_id,
    workspace_id,
    crew_id,
    crew_member_id,
    status,
    check_in_location,
    check_in_time
  ) VALUES (
    p_job_id,
    v_job.workspace_id,
    v_job.crew_id,
    p_crew_member_id,
    'arrived',
    p_location,
    now()
  )
  RETURNING id INTO v_workflow_id;
  
  -- Notify roofer
  INSERT INTO public.notifications (
    user_id,
    workspace_id,
    type,
    title,
    body,
    metadata
  )
  SELECT 
    wm.user_id,
    v_job.workspace_id,
    'crew_status_update',
    'Crew Arrived',
    format('Crew has arrived at %s', COALESCE(v_job.title, 'job')),
    jsonb_build_object('job_id', p_job_id, 'workflow_id', v_workflow_id)
  FROM public.workspace_members wm
  WHERE wm.workspace_id = v_job.workspace_id
    AND wm.role IN ('owner', 'admin');
END;
$$;

COMMENT ON FUNCTION public.handle_crew_arrived IS 'Handles crew arrival and logs check-in time';

-- ============================================================================
-- PART 15 — FUNCTION: Handle job completion workflow
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_job_completion(p_job_id uuid, p_crew_member_id uuid, p_completion_notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job RECORD;
  v_completion_id uuid;
BEGIN
  -- Get job details
  SELECT j.*, jca.crew_id, l.email as homeowner_email
  INTO v_job
  FROM public.roofing_jobs j
  LEFT JOIN public.job_crew_assignments jca ON jca.job_id = j.id AND jca.unassigned_at IS NULL
  LEFT JOIN public.leads l ON l.id = j.lead_id
  WHERE j.id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Create completion workflow entry
  INSERT INTO public.crew_completion_workflow (
    job_id,
    workspace_id,
    crew_id,
    completed_by,
    status,
    completion_notes
  ) VALUES (
    p_job_id,
    v_job.workspace_id,
    v_job.crew_id,
    p_crew_member_id,
    'marked_complete',
    p_completion_notes
  )
  RETURNING id INTO v_completion_id;
  
  -- Update job status
  UPDATE public.roofing_jobs
  SET status = 'completed'
  WHERE id = p_job_id;
  
  -- Schedule homeowner completion message (immediate)
  IF v_job.homeowner_email IS NOT NULL THEN
    INSERT INTO public.crew_job_reminders (
      job_id,
      workspace_id,
      reminder_type,
      recipient_type,
      recipient_email,
      message_text,
      scheduled_send_at,
      message_sent
    ) VALUES (
      p_job_id,
      v_job.workspace_id,
      'job_morning_homeowner',
      'homeowner',
      v_job.homeowner_email,
      'Your roofing job has been completed! We''ll be in touch soon with warranty information and to request your review.',
      now(),
      false
    );
  END IF;
  
  -- Schedule review request (24 hours after completion)
  IF v_job.homeowner_email IS NOT NULL THEN
    INSERT INTO public.crew_job_reminders (
      job_id,
      workspace_id,
      reminder_type,
      recipient_type,
      recipient_email,
      message_text,
      scheduled_send_at,
      message_sent
    ) VALUES (
      p_job_id,
      v_job.workspace_id,
      'job_morning_homeowner',
      'homeowner',
      v_job.homeowner_email,
      'We hope you''re happy with your new roof! Would you mind leaving us a quick review? [Review Link]',
      now() + INTERVAL '24 hours',
      false
    );
  END IF;
  
  -- Schedule referral request (7 days after completion)
  IF v_job.homeowner_email IS NOT NULL THEN
    INSERT INTO public.crew_job_reminders (
      job_id,
      workspace_id,
      reminder_type,
      recipient_type,
      recipient_email,
      message_text,
      scheduled_send_at,
      message_sent
    ) VALUES (
      p_job_id,
      v_job.workspace_id,
      'job_morning_homeowner',
      'homeowner',
      v_job.homeowner_email,
      'Know anyone else who needs a new roof? We''d love to help them too! [Referral Link]',
      now() + INTERVAL '7 days',
      false
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.handle_job_completion IS 'Handles job completion workflow and triggers post-completion automations';

-- ============================================================================
-- PART 16 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- crew_readiness_checklists RLS
ALTER TABLE public.crew_readiness_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view readiness checklists in their workspace"
  ON public.crew_readiness_checklists FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage readiness checklists in their workspace"
  ON public.crew_readiness_checklists FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- crew_job_reminders RLS
ALTER TABLE public.crew_job_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view reminders in their workspace"
  ON public.crew_job_reminders FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "System can manage reminders"
  ON public.crew_job_reminders FOR ALL
  USING (true);

-- job_morning_workflow RLS
ALTER TABLE public.job_morning_workflow ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view workflow in their workspace"
  ON public.job_morning_workflow FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Crew can update workflow for their jobs"
  ON public.job_morning_workflow FOR INSERT, UPDATE
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR crew_member_id IN (
      SELECT id FROM public.crew_members
      WHERE workspace_id = job_morning_workflow.workspace_id
    )
  );

-- crew_job_chat RLS
ALTER TABLE public.crew_job_chat ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view chat in their workspace"
  ON public.crew_job_chat FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users and crew can send messages"
  ON public.crew_job_chat FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- job_issues RLS
ALTER TABLE public.job_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view issues in their workspace"
  ON public.job_issues FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Crew can report issues"
  ON public.job_issues FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR reported_by IN (
      SELECT id FROM public.crew_members
      WHERE workspace_id = job_issues.workspace_id
    )
  );

CREATE POLICY "Users can manage issues in their workspace"
  ON public.job_issues FOR UPDATE, DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- crew_completion_workflow RLS
ALTER TABLE public.crew_completion_workflow ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view completion workflow in their workspace"
  ON public.crew_completion_workflow FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Crew can mark jobs complete"
  ON public.crew_completion_workflow FOR INSERT, UPDATE
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR completed_by IN (
      SELECT id FROM public.crew_members
      WHERE workspace_id = crew_completion_workflow.workspace_id
    )
  );

-- crew_performance_scores RLS
ALTER TABLE public.crew_performance_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view performance scores in their workspace"
  ON public.crew_performance_scores FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage performance scores in their workspace"
  ON public.crew_performance_scores FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- PART 17 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crew_readiness_checklists TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.crew_job_reminders TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.job_morning_workflow TO authenticated;
GRANT SELECT, INSERT ON public.crew_job_chat TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.job_issues TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.crew_completion_workflow TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.crew_performance_scores TO authenticated;

GRANT EXECUTE ON FUNCTION public.schedule_day_before_reminders(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_crew_on_the_way(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_crew_arrived(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_job_completion(uuid, uuid, text) TO authenticated;

-- ============================================================================
-- PART 18 — TRIGGER: Auto-schedule reminders when job is scheduled
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_schedule_job_reminders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- If job just got scheduled and has a crew assignment, schedule reminders
  IF NEW.scheduled_start_date IS NOT NULL 
     AND (OLD.scheduled_start_date IS NULL OR OLD.scheduled_start_date != NEW.scheduled_start_date)
     AND EXISTS (
       SELECT 1 FROM public.job_crew_assignments jca
       WHERE jca.job_id = NEW.id AND jca.unassigned_at IS NULL
     ) THEN
    PERFORM public.schedule_day_before_reminders(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_schedule_job_reminders ON public.roofing_jobs;
CREATE TRIGGER trg_auto_schedule_job_reminders
AFTER UPDATE OF scheduled_start_date ON public.roofing_jobs
FOR EACH ROW
EXECUTE FUNCTION public.auto_schedule_job_reminders();

COMMENT ON TABLE public.crew_readiness_checklists IS 'Block 24380: Pre-job readiness checklist that crew must complete';
COMMENT ON TABLE public.crew_job_reminders IS 'Block 24380: Day-before and job-morning reminders for crew and homeowners';
COMMENT ON TABLE public.job_morning_workflow IS 'Block 24380: Track crew status on job morning (on the way, arrived, materials confirmed)';
COMMENT ON TABLE public.crew_job_chat IS 'Block 24380: In-app chat channel for crew ↔ roofer communication per job';
COMMENT ON TABLE public.job_issues IS 'Block 24380: Crew can report issues and material shortages';
COMMENT ON TABLE public.crew_completion_workflow IS 'Block 24380: Track crew completion workflow and trigger post-completion automations';
COMMENT ON TABLE public.crew_performance_scores IS 'Block 24380: Track crew performance metrics for scoring and comparison (Phase 2)';






































