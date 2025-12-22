-- =========================================================
-- Block 19980 — SmartSend Inbox Smart Reminders v1
-- (Automatic Reminders for Appointments, Tasks, No-Responses, Storm Follow-Ups, and Roofing-Specific Timing Rules)
-- =========================================================

-- ============================================================================
-- PART 1 — REMINDER LOGS TABLE
-- ============================================================================
-- Tracks all reminder sends (SMS, Email, In-App) for audit and analytics

CREATE TABLE IF NOT EXISTS public.reminder_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Reminder Type
  reminder_type text NOT NULL CHECK (reminder_type IN (
    'appointment_24h',
    'appointment_2h',
    'appointment_10min',
    'appointment_missed',
    'no_response_24h',
    'no_response_72h',
    'no_response_7d',
    'owner_followup',
    'task_morning',
    'task_2h_before',
    'task_overdue',
    'task_escalating',
    'storm_day1',
    'storm_day3',
    'storm_day5',
    'storm_day7',
    'critical_followup_daily'
  )),
  
  -- Target Entity
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  task_id uuid REFERENCES public.tasks_v3(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  storm_event_id uuid REFERENCES public.storm_events(id) ON DELETE SET NULL,
  
  -- Delivery Details
  channel text NOT NULL CHECK (channel IN ('sms', 'email', 'push', 'in_app', 'desktop')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  
  -- Message Content
  message_subject text,
  message_body text NOT NULL,
  message_metadata jsonb DEFAULT '{}'::jsonb, -- Stores template used, personalization, etc.
  
  -- Status
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced', 'opened', 'clicked')),
  error_message text,
  
  -- Recipient Info
  recipient_email text,
  recipient_phone text,
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL, -- For internal reminders
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for reminder logs
CREATE INDEX IF NOT EXISTS idx_reminder_logs_workspace ON public.reminder_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_type ON public.reminder_logs(reminder_type);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_appointment ON public.reminder_logs(appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reminder_logs_task ON public.reminder_logs(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reminder_logs_thread ON public.reminder_logs(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reminder_logs_contact ON public.reminder_logs(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reminder_logs_sent_at ON public.reminder_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_reminder_logs_status ON public.reminder_logs(status);

-- ============================================================================
-- PART 2 — REMINDER SETTINGS TABLE
-- ============================================================================
-- Per-workspace reminder configuration

CREATE TABLE IF NOT EXISTS public.reminder_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Appointment Reminders
  appointment_reminders_enabled boolean DEFAULT true,
  appointment_24h_enabled boolean DEFAULT true,
  appointment_2h_enabled boolean DEFAULT true,
  appointment_10min_enabled boolean DEFAULT true,
  appointment_confirmation_required boolean DEFAULT false,
  appointment_sms_enabled boolean DEFAULT true,
  appointment_email_enabled boolean DEFAULT true,
  
  -- No-Response Reminders
  no_response_reminders_enabled boolean DEFAULT true,
  no_response_24h_enabled boolean DEFAULT true,
  no_response_72h_enabled boolean DEFAULT true,
  no_response_7d_enabled boolean DEFAULT true,
  no_response_sms_enabled boolean DEFAULT true,
  no_response_email_enabled boolean DEFAULT true,
  
  -- Owner Follow-Up Reminders
  owner_followup_enabled boolean DEFAULT true,
  owner_followup_threshold_hours integer DEFAULT 24, -- Alert if no reply in X hours
  owner_followup_notification_channels text[] DEFAULT ARRAY['in_app', 'push'],
  
  -- Task Reminders
  task_reminders_enabled boolean DEFAULT true,
  task_morning_enabled boolean DEFAULT true,
  task_2h_before_enabled boolean DEFAULT true,
  task_overdue_enabled boolean DEFAULT true,
  task_escalating_enabled boolean DEFAULT true,
  task_escalation_threshold_hours integer DEFAULT 4, -- Escalate if overdue X hours
  
  -- Storm Follow-Up Reminders
  storm_followup_enabled boolean DEFAULT true,
  storm_day1_enabled boolean DEFAULT true,
  storm_day3_enabled boolean DEFAULT true,
  storm_day5_enabled boolean DEFAULT true,
  storm_day7_enabled boolean DEFAULT true,
  
  -- Daily Critical Follow-Ups
  daily_critical_enabled boolean DEFAULT true,
  daily_critical_time time DEFAULT '08:00:00', -- 8 AM default
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for reminder settings
CREATE INDEX IF NOT EXISTS idx_reminder_settings_workspace ON public.reminder_settings(workspace_id);

-- ============================================================================
-- PART 3 — REMINDER QUEUE TABLE
-- ============================================================================
-- Queue for scheduled reminders (processed by cron)

CREATE TABLE IF NOT EXISTS public.reminder_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Reminder Type
  reminder_type text NOT NULL CHECK (reminder_type IN (
    'appointment_24h',
    'appointment_2h',
    'appointment_10min',
    'appointment_missed',
    'no_response_24h',
    'no_response_72h',
    'no_response_7d',
    'owner_followup',
    'task_morning',
    'task_2h_before',
    'task_overdue',
    'task_escalating',
    'storm_day1',
    'storm_day3',
    'storm_day5',
    'storm_day7',
    'critical_followup_daily'
  )),
  
  -- Target Entity
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.tasks_v3(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  storm_event_id uuid REFERENCES public.storm_events(id) ON DELETE CASCADE,
  
  -- Scheduling
  scheduled_for timestamptz NOT NULL,
  processed_at timestamptz,
  processed boolean DEFAULT false,
  retry_count integer DEFAULT 0,
  max_retries integer DEFAULT 3,
  
  -- Message Template
  message_template text,
  message_metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Channels
  channels text[] DEFAULT ARRAY['sms', 'email'], -- Which channels to send on
  
  -- Status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  error_message text,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for reminder queue
CREATE INDEX IF NOT EXISTS idx_reminder_queue_workspace ON public.reminder_queue(workspace_id);
CREATE INDEX IF NOT EXISTS idx_reminder_queue_scheduled ON public.reminder_queue(scheduled_for, processed) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_reminder_queue_type ON public.reminder_queue(reminder_type);
CREATE INDEX IF NOT EXISTS idx_reminder_queue_appointment ON public.reminder_queue(appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reminder_queue_task ON public.reminder_queue(task_id) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reminder_queue_thread ON public.reminder_queue(thread_id) WHERE thread_id IS NOT NULL;

-- ============================================================================
-- PART 4 — APPOINTMENT REMINDER FUNCTIONS
-- ============================================================================

-- Function: Schedule appointment reminders (24h, 2h, 10min before)
CREATE OR REPLACE FUNCTION public.schedule_appointment_reminders(p_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_appointment RECORD;
  v_settings RECORD;
  v_appointment_datetime timestamptz;
  v_24h_before timestamptz;
  v_2h_before timestamptz;
  v_10min_before timestamptz;
  v_channels text[];
BEGIN
  -- Get appointment details
  SELECT a.*, c.email, c.phone, a.workspace_id
  INTO v_appointment
  FROM public.appointments a
  LEFT JOIN public.contacts c ON a.contact_id = c.id
  WHERE a.id = p_appointment_id;
  
  IF v_appointment.id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get reminder settings
  SELECT * INTO v_settings
  FROM public.reminder_settings
  WHERE workspace_id = v_appointment.workspace_id;
  
  -- Use defaults if no settings
  IF v_settings.id IS NULL THEN
    v_settings.appointment_24h_enabled := true;
    v_settings.appointment_2h_enabled := true;
    v_settings.appointment_10min_enabled := true;
    v_settings.appointment_sms_enabled := true;
    v_settings.appointment_email_enabled := true;
  END IF;
  
  -- Calculate appointment datetime
  v_appointment_datetime := (v_appointment.date + v_appointment.time)::timestamptz;
  
  -- Calculate reminder times
  v_24h_before := v_appointment_datetime - INTERVAL '24 hours';
  v_2h_before := v_appointment_datetime - INTERVAL '2 hours';
  v_10min_before := v_appointment_datetime - INTERVAL '10 minutes';
  
  -- Determine channels
  v_channels := ARRAY[]::text[];
  IF v_settings.appointment_sms_enabled AND v_appointment.phone IS NOT NULL THEN
    v_channels := array_append(v_channels, 'sms');
  END IF;
  IF v_settings.appointment_email_enabled AND v_appointment.email IS NOT NULL THEN
    v_channels := array_append(v_channels, 'email');
  END IF;
  
  -- Schedule 24h reminder
  IF v_settings.appointment_24h_enabled AND v_24h_before > NOW() THEN
    INSERT INTO public.reminder_queue (
      workspace_id,
      reminder_type,
      appointment_id,
      contact_id,
      scheduled_for,
      channels,
      message_template,
      message_metadata
    ) VALUES (
      v_appointment.workspace_id,
      'appointment_24h',
      p_appointment_id,
      v_appointment.contact_id,
      v_24h_before,
      v_channels,
      'appointment_24h_template',
      jsonb_build_object(
        'appointment_date', v_appointment.date,
        'appointment_time', v_appointment.time,
        'confirmation_required', v_settings.appointment_confirmation_required
      )
    )
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Schedule 2h reminder
  IF v_settings.appointment_2h_enabled AND v_2h_before > NOW() THEN
    INSERT INTO public.reminder_queue (
      workspace_id,
      reminder_type,
      appointment_id,
      contact_id,
      scheduled_for,
      channels,
      message_template,
      message_metadata
    ) VALUES (
      v_appointment.workspace_id,
      'appointment_2h',
      p_appointment_id,
      v_appointment.contact_id,
      v_2h_before,
      v_channels,
      'appointment_2h_template',
      jsonb_build_object(
        'appointment_date', v_appointment.date,
        'appointment_time', v_appointment.time
      )
    )
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Schedule 10min reminder
  IF v_settings.appointment_10min_enabled AND v_10min_before > NOW() THEN
    INSERT INTO public.reminder_queue (
      workspace_id,
      reminder_type,
      appointment_id,
      contact_id,
      scheduled_for,
      channels,
      message_template,
      message_metadata
    ) VALUES (
      v_appointment.workspace_id,
      'appointment_10min',
      p_appointment_id,
      v_appointment.contact_id,
      v_10min_before,
      v_channels,
      'appointment_10min_template',
      jsonb_build_object(
        'appointment_date', v_appointment.date,
        'appointment_time', v_appointment.time,
        'address', v_appointment.address
      )
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- Trigger: Auto-schedule reminders when appointment is created
CREATE OR REPLACE FUNCTION public.trigger_schedule_appointment_reminders()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'scheduled' THEN
    PERFORM public.schedule_appointment_reminders(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schedule_appointment_reminders ON public.appointments;
CREATE TRIGGER trg_schedule_appointment_reminders
AFTER INSERT OR UPDATE ON public.appointments
FOR EACH ROW
WHEN (NEW.status = 'scheduled')
EXECUTE FUNCTION public.trigger_schedule_appointment_reminders();

-- ============================================================================
-- PART 5 — NO-RESPONSE REMINDER FUNCTIONS
-- ============================================================================

-- Function: Check and schedule no-response reminders
CREATE OR REPLACE FUNCTION public.check_no_response_reminders()
RETURNS TABLE(processed_count int)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread RECORD;
  v_settings RECORD;
  v_last_message_at timestamptz;
  v_hours_since_message numeric;
  v_channels text[];
  v_processed_count int := 0;
BEGIN
  -- Process each workspace
  FOR v_settings IN
    SELECT * FROM public.reminder_settings
    WHERE no_response_reminders_enabled = true
  LOOP
    -- Find threads with no response
    FOR v_thread IN
      SELECT 
        t.id as thread_id,
        t.contact_id,
        t.campaign_id,
        t.last_message_at,
        t.last_direction,
        c.email,
        c.phone,
        w.id as workspace_id
      FROM public.inbox_threads t
      JOIN public.campaigns cam ON t.campaign_id = cam.id
      JOIN public.workspaces w ON cam.workspace_id = w.id
      LEFT JOIN public.contacts c ON t.contact_id = c.id
      WHERE w.id = v_settings.workspace_id
        AND t.status = 'open'
        AND t.last_direction = 'out' -- Last message was from owner
        AND t.last_message_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.reminder_queue rq
          WHERE rq.thread_id = t.id
          AND rq.reminder_type IN ('no_response_24h', 'no_response_72h', 'no_response_7d')
          AND rq.processed = false
        )
    LOOP
      v_hours_since_message := EXTRACT(EPOCH FROM (NOW() - v_thread.last_message_at)) / 3600;
      
      -- Determine channels
      v_channels := ARRAY[]::text[];
      IF v_settings.no_response_sms_enabled AND v_thread.phone IS NOT NULL THEN
        v_channels := array_append(v_channels, 'sms');
      END IF;
      IF v_settings.no_response_email_enabled AND v_thread.email IS NOT NULL THEN
        v_channels := array_append(v_channels, 'email');
      END IF;
      
      -- Schedule 24h reminder
      IF v_settings.no_response_24h_enabled 
         AND v_hours_since_message >= 24 
         AND v_hours_since_message < 48 THEN
        INSERT INTO public.reminder_queue (
          workspace_id,
          reminder_type,
          thread_id,
          contact_id,
          scheduled_for,
          channels,
          message_template,
          message_metadata
        ) VALUES (
          v_thread.workspace_id,
          'no_response_24h',
          v_thread.thread_id,
          v_thread.contact_id,
          NOW(),
          v_channels,
          'no_response_24h_template',
          jsonb_build_object('hours_since', v_hours_since_message)
        )
        ON CONFLICT DO NOTHING;
        v_processed_count := v_processed_count + 1;
      END IF;
      
      -- Schedule 72h reminder
      IF v_settings.no_response_72h_enabled 
         AND v_hours_since_message >= 72 
         AND v_hours_since_message < 96 THEN
        INSERT INTO public.reminder_queue (
          workspace_id,
          reminder_type,
          thread_id,
          contact_id,
          scheduled_for,
          channels,
          message_template,
          message_metadata
        ) VALUES (
          v_thread.workspace_id,
          'no_response_72h',
          v_thread.thread_id,
          v_thread.contact_id,
          NOW(),
          v_channels,
          'no_response_72h_template',
          jsonb_build_object('hours_since', v_hours_since_message)
        )
        ON CONFLICT DO NOTHING;
        v_processed_count := v_processed_count + 1;
      END IF;
      
      -- Schedule 7d reminder
      IF v_settings.no_response_7d_enabled 
         AND v_hours_since_message >= 168 
         AND v_hours_since_message < 192 THEN
        INSERT INTO public.reminder_queue (
          workspace_id,
          reminder_type,
          thread_id,
          contact_id,
          scheduled_for,
          channels,
          message_template,
          message_metadata
        ) VALUES (
          v_thread.workspace_id,
          'no_response_7d',
          v_thread.thread_id,
          v_thread.contact_id,
          NOW(),
          v_channels,
          'no_response_7d_template',
          jsonb_build_object('hours_since', v_hours_since_message)
        )
        ON CONFLICT DO NOTHING;
        v_processed_count := v_processed_count + 1;
      END IF;
    END LOOP;
  END LOOP;
  
  RETURN QUERY SELECT v_processed_count;
END;
$$;

-- ============================================================================
-- PART 6 — OWNER FOLLOW-UP REMINDER FUNCTIONS
-- ============================================================================

-- Function: Check and create owner follow-up reminders
CREATE OR REPLACE FUNCTION public.check_owner_followup_reminders()
RETURNS TABLE(processed_count int)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread RECORD;
  v_settings RECORD;
  v_hours_since_message numeric;
  v_processed_count int := 0;
BEGIN
  FOR v_settings IN
    SELECT * FROM public.reminder_settings
    WHERE owner_followup_enabled = true
  LOOP
    FOR v_thread IN
      SELECT 
        t.id as thread_id,
        t.contact_id,
        t.campaign_id,
        t.last_message_at,
        t.last_direction,
        cam.workspace_id,
        wm.user_id
      FROM public.inbox_threads t
      JOIN public.campaigns cam ON t.campaign_id = cam.id
      CROSS JOIN public.workspace_members wm
      WHERE cam.workspace_id = v_settings.workspace_id
        AND wm.workspace_id = cam.workspace_id
        AND t.status = 'open'
        AND t.last_direction = 'in' -- Last message was from homeowner
        AND t.last_message_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.inbox_messages m
          WHERE m.thread_id = t.id
          AND m.direction = 'out'
          AND m.sent_at > t.last_message_at
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.reminder_queue rq
          WHERE rq.thread_id = t.id
          AND rq.reminder_type = 'owner_followup'
          AND rq.processed = false
        )
    LOOP
      v_hours_since_message := EXTRACT(EPOCH FROM (NOW() - v_thread.last_message_at)) / 3600;
      
      IF v_hours_since_message >= v_settings.owner_followup_threshold_hours THEN
        INSERT INTO public.reminder_queue (
          workspace_id,
          reminder_type,
          thread_id,
          contact_id,
          scheduled_for,
          channels,
          message_template,
          message_metadata,
          recipient_user_id
        ) VALUES (
          v_thread.workspace_id,
          'owner_followup',
          v_thread.thread_id,
          v_thread.contact_id,
          NOW(),
          v_settings.owner_followup_notification_channels,
          'owner_followup_template',
          jsonb_build_object(
            'hours_since', v_hours_since_message,
            'thread_id', v_thread.thread_id
          ),
          v_thread.user_id
        )
        ON CONFLICT DO NOTHING;
        v_processed_count := v_processed_count + 1;
      END IF;
    END LOOP;
  END LOOP;
  
  RETURN QUERY SELECT v_processed_count;
END;
$$;

-- ============================================================================
-- PART 7 — TASK REMINDER ENGINE
-- ============================================================================

-- Function: Schedule task reminders
CREATE OR REPLACE FUNCTION public.schedule_task_reminders(p_task_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task RECORD;
  v_settings RECORD;
  v_due_datetime timestamptz;
  v_morning_reminder timestamptz;
  v_2h_before timestamptz;
BEGIN
  -- Get task details
  SELECT * INTO v_task
  FROM public.tasks_v3
  WHERE id = p_task_id;
  
  IF v_task.id IS NULL OR v_task.status != 'open' THEN
    RETURN;
  END IF;
  
  -- Get reminder settings
  SELECT * INTO v_settings
  FROM public.reminder_settings
  WHERE workspace_id = v_task.workspace_id;
  
  IF v_settings.id IS NULL THEN
    v_settings.task_morning_enabled := true;
    v_settings.task_2h_before_enabled := true;
    v_settings.task_overdue_enabled := true;
  END IF;
  
  v_due_datetime := v_task.due_at;
  v_morning_reminder := DATE_TRUNC('day', v_due_datetime) + INTERVAL '8 hours'; -- 8 AM on due date
  v_2h_before := v_due_datetime - INTERVAL '2 hours';
  
  -- Schedule morning reminder
  IF v_settings.task_morning_enabled 
     AND v_morning_reminder > NOW() 
     AND DATE(v_due_datetime) = CURRENT_DATE THEN
    INSERT INTO public.reminder_queue (
      workspace_id,
      reminder_type,
      task_id,
      contact_id,
      lead_id,
      scheduled_for,
      channels,
      message_template,
      message_metadata
    ) VALUES (
      v_task.workspace_id,
      'task_morning',
      p_task_id,
      v_task.contact_id,
      v_task.lead_id,
      v_morning_reminder,
      ARRAY['in_app', 'push'],
      'task_morning_template',
      jsonb_build_object(
        'task_title', v_task.title,
        'due_at', v_task.due_at,
        'priority', v_task.priority
      )
    )
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Schedule 2h before reminder
  IF v_settings.task_2h_before_enabled AND v_2h_before > NOW() THEN
    INSERT INTO public.reminder_queue (
      workspace_id,
      reminder_type,
      task_id,
      contact_id,
      lead_id,
      scheduled_for,
      channels,
      message_template,
      message_metadata
    ) VALUES (
      v_task.workspace_id,
      'task_2h_before',
      p_task_id,
      v_task.contact_id,
      v_task.lead_id,
      v_2h_before,
      ARRAY['in_app', 'push'],
      'task_2h_before_template',
      jsonb_build_object(
        'task_title', v_task.title,
        'due_at', v_task.due_at
      )
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- Function: Check overdue and escalating task reminders
CREATE OR REPLACE FUNCTION public.check_task_overdue_reminders()
RETURNS TABLE(processed_count int)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_task RECORD;
  v_settings RECORD;
  v_hours_overdue numeric;
  v_processed_count int := 0;
BEGIN
  FOR v_settings IN
    SELECT * FROM public.reminder_settings
    WHERE task_reminders_enabled = true
  LOOP
    -- Overdue tasks
    IF v_settings.task_overdue_enabled THEN
      FOR v_task IN
        SELECT *
        FROM public.tasks_v3
        WHERE workspace_id = v_settings.workspace_id
          AND status = 'open'
          AND due_at < NOW()
          AND NOT EXISTS (
            SELECT 1 FROM public.reminder_queue rq
            WHERE rq.task_id = tasks_v3.id
            AND rq.reminder_type = 'task_overdue'
            AND rq.processed = false
          )
      LOOP
        v_hours_overdue := EXTRACT(EPOCH FROM (NOW() - v_task.due_at)) / 3600;
        
        -- Send overdue reminder at end of day
        IF v_hours_overdue >= 8 AND v_hours_overdue < 12 THEN
          INSERT INTO public.reminder_queue (
            workspace_id,
            reminder_type,
            task_id,
            contact_id,
            lead_id,
            scheduled_for,
            channels,
            message_template,
            message_metadata
          ) VALUES (
            v_task.workspace_id,
            'task_overdue',
            v_task.id,
            v_task.contact_id,
            v_task.lead_id,
            NOW(),
            ARRAY['in_app', 'push'],
            'task_overdue_template',
            jsonb_build_object(
              'task_title', v_task.title,
              'hours_overdue', v_hours_overdue,
              'priority', v_task.priority
            )
          )
          ON CONFLICT DO NOTHING;
          v_processed_count := v_processed_count + 1;
        END IF;
      END LOOP;
    END IF;
    
    -- Escalating reminders for high-value/hot tasks
    IF v_settings.task_escalating_enabled THEN
      FOR v_task IN
        SELECT *
        FROM public.tasks_v3
        WHERE workspace_id = v_settings.workspace_id
          AND status = 'open'
          AND due_at < NOW()
          AND (
            v_task.priority = 'high'
            OR (v_task.metadata->>'insurance_value')::numeric > 5000
            OR (v_task.metadata->>'storm_risk')::text = 'high'
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.reminder_queue rq
            WHERE rq.task_id = tasks_v3.id
            AND rq.reminder_type = 'task_escalating'
            AND rq.processed = false
          )
      LOOP
        v_hours_overdue := EXTRACT(EPOCH FROM (NOW() - v_task.due_at)) / 3600;
        
        IF v_hours_overdue >= v_settings.task_escalation_threshold_hours THEN
          INSERT INTO public.reminder_queue (
            workspace_id,
            reminder_type,
            task_id,
            contact_id,
            lead_id,
            scheduled_for,
            channels,
            message_template,
            message_metadata
          ) VALUES (
            v_task.workspace_id,
            'task_escalating',
            v_task.id,
            v_task.contact_id,
            v_task.lead_id,
            NOW(),
            ARRAY['in_app', 'push', 'email'],
            'task_escalating_template',
            jsonb_build_object(
              'task_title', v_task.title,
              'hours_overdue', v_hours_overdue,
              'priority', v_task.priority,
              'is_high_value', true
            )
          )
          ON CONFLICT DO NOTHING;
          v_processed_count := v_processed_count + 1;
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT v_processed_count;
END;
$$;

-- Trigger: Auto-schedule reminders when task is created/updated
CREATE OR REPLACE FUNCTION public.trigger_schedule_task_reminders()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'open' AND NEW.due_at IS NOT NULL THEN
    PERFORM public.schedule_task_reminders(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schedule_task_reminders ON public.tasks_v3;
CREATE TRIGGER trg_schedule_task_reminders
AFTER INSERT OR UPDATE ON public.tasks_v3
FOR EACH ROW
WHEN (NEW.status = 'open' AND NEW.due_at IS NOT NULL)
EXECUTE FUNCTION public.trigger_schedule_task_reminders();

-- ============================================================================
-- PART 8 — STORM FOLLOW-UP REMINDER WORKFLOW
-- ============================================================================

-- Function: Schedule storm follow-up reminders
CREATE OR REPLACE FUNCTION public.schedule_storm_followup_reminders(p_storm_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_storm_event RECORD;
  v_match RECORD;
  v_settings RECORD;
  v_storm_date date;
  v_day1_date timestamptz;
  v_day3_date timestamptz;
  v_day5_date timestamptz;
  v_day7_date timestamptz;
BEGIN
  -- Get storm event details
  SELECT * INTO v_storm_event
  FROM public.storm_events
  WHERE id = p_storm_event_id;
  
  IF v_storm_event.id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get reminder settings
  SELECT * INTO v_settings
  FROM public.reminder_settings
  WHERE workspace_id = v_storm_event.workspace_id;
  
  IF v_settings.id IS NULL THEN
    v_settings.storm_day1_enabled := true;
    v_settings.storm_day3_enabled := true;
    v_settings.storm_day5_enabled := true;
    v_settings.storm_day7_enabled := true;
  END IF;
  
  v_storm_date := DATE(v_storm_event.event_started_at);
  v_day1_date := (v_storm_date + INTERVAL '1 day')::timestamptz + INTERVAL '10 hours'; -- 10 AM next day
  v_day3_date := (v_storm_date + INTERVAL '3 days')::timestamptz + INTERVAL '10 hours';
  v_day5_date := (v_storm_date + INTERVAL '5 days')::timestamptz + INTERVAL '10 hours';
  v_day7_date := (v_storm_date + INTERVAL '7 days')::timestamptz + INTERVAL '10 hours';
  
  -- Schedule reminders for all matched leads
  FOR v_match IN
    SELECT slm.*, c.email, c.phone
    FROM public.storm_lead_matches slm
    LEFT JOIN public.contacts c ON slm.contact_id = c.id
    WHERE slm.storm_event_id = p_storm_event_id
  LOOP
    -- Day 1: Quick check-in
    IF v_settings.storm_day1_enabled AND v_day1_date > NOW() THEN
      INSERT INTO public.reminder_queue (
        workspace_id,
        reminder_type,
        storm_event_id,
        lead_id,
        thread_id,
        contact_id,
        scheduled_for,
        channels,
        message_template,
        message_metadata
      ) VALUES (
        v_storm_event.workspace_id,
        'storm_day1',
        p_storm_event_id,
        v_match.lead_id,
        v_match.thread_id,
        v_match.contact_id,
        v_day1_date,
        CASE 
          WHEN v_match.phone IS NOT NULL THEN ARRAY['sms', 'email']
          ELSE ARRAY['email']
        END,
        'storm_day1_template',
        jsonb_build_object(
          'storm_type', v_storm_event.event_type,
          'storm_intensity', v_storm_event.intensity
        )
      )
      ON CONFLICT DO NOTHING;
    END IF;
    
    -- Day 3: Insurance info request
    IF v_settings.storm_day3_enabled AND v_day3_date > NOW() THEN
      INSERT INTO public.reminder_queue (
        workspace_id,
        reminder_type,
        storm_event_id,
        lead_id,
        thread_id,
        contact_id,
        scheduled_for,
        channels,
        message_template,
        message_metadata
      ) VALUES (
        v_storm_event.workspace_id,
        'storm_day3',
        p_storm_event_id,
        v_match.lead_id,
        v_match.thread_id,
        v_match.contact_id,
        v_day3_date,
        CASE 
          WHEN v_match.phone IS NOT NULL THEN ARRAY['sms', 'email']
          ELSE ARRAY['email']
        END,
        'storm_day3_template',
        jsonb_build_object(
          'storm_type', v_storm_event.event_type,
          'focus', 'insurance_info'
        )
      )
      ON CONFLICT DO NOTHING;
    END IF;
    
    -- Day 5: "We're in your area" message
    IF v_settings.storm_day5_enabled AND v_day5_date > NOW() THEN
      INSERT INTO public.reminder_queue (
        workspace_id,
        reminder_type,
        storm_event_id,
        lead_id,
        thread_id,
        contact_id,
        scheduled_for,
        channels,
        message_template,
        message_metadata
      ) VALUES (
        v_storm_event.workspace_id,
        'storm_day5',
        p_storm_event_id,
        v_match.lead_id,
        v_match.thread_id,
        v_match.contact_id,
        v_day5_date,
        CASE 
          WHEN v_match.phone IS NOT NULL THEN ARRAY['sms', 'email']
          ELSE ARRAY['email']
        END,
        'storm_day5_template',
        jsonb_build_object(
          'storm_type', v_storm_event.event_type,
          'focus', 'area_availability'
        )
      )
      ON CONFLICT DO NOTHING;
    END IF;
    
    -- Day 7: "Final check — need help?"
    IF v_settings.storm_day7_enabled AND v_day7_date > NOW() THEN
      INSERT INTO public.reminder_queue (
        workspace_id,
        reminder_type,
        storm_event_id,
        lead_id,
        thread_id,
        contact_id,
        scheduled_for,
        channels,
        message_template,
        message_metadata
      ) VALUES (
        v_storm_event.workspace_id,
        'storm_day7',
        p_storm_event_id,
        v_match.lead_id,
        v_match.thread_id,
        v_match.contact_id,
        v_day7_date,
        CASE 
          WHEN v_match.phone IS NOT NULL THEN ARRAY['sms', 'email']
          ELSE ARRAY['email']
        END,
        'storm_day7_template',
        jsonb_build_object(
          'storm_type', v_storm_event.event_type,
          'focus', 'final_check'
        )
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- Trigger: Auto-schedule storm reminders when storm event is processed
CREATE OR REPLACE FUNCTION public.trigger_schedule_storm_reminders()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.processed = true AND (OLD.processed IS NULL OR OLD.processed = false) THEN
    PERFORM public.schedule_storm_followup_reminders(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_schedule_storm_reminders ON public.storm_events;
CREATE TRIGGER trg_schedule_storm_reminders
AFTER UPDATE ON public.storm_events
FOR EACH ROW
WHEN (NEW.processed = true AND (OLD.processed IS NULL OR OLD.processed = false))
EXECUTE FUNCTION public.trigger_schedule_storm_reminders();

-- ============================================================================
-- PART 9 — MISSED APPOINTMENT REMINDERS
-- ============================================================================

-- Function: Check for missed appointments and schedule reminders
CREATE OR REPLACE FUNCTION public.check_missed_appointments()
RETURNS TABLE(processed_count int)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_appointment RECORD;
  v_settings RECORD;
  v_appointment_datetime timestamptz;
  v_hours_since_appointment numeric;
  v_processed_count int := 0;
BEGIN
  FOR v_settings IN
    SELECT * FROM public.reminder_settings
    WHERE appointment_reminders_enabled = true
  LOOP
    FOR v_appointment IN
      SELECT a.*, c.email, c.phone
      FROM public.appointments a
      LEFT JOIN public.contacts c ON a.contact_id = c.id
      WHERE a.workspace_id = v_settings.workspace_id
        AND a.status = 'scheduled'
        AND NOT EXISTS (
          SELECT 1 FROM public.reminder_queue rq
          WHERE rq.appointment_id = a.id
          AND rq.reminder_type = 'appointment_missed'
          AND rq.processed = false
        )
    LOOP
      v_appointment_datetime := (v_appointment.date + v_appointment.time)::timestamptz;
      v_hours_since_appointment := EXTRACT(EPOCH FROM (NOW() - v_appointment_datetime)) / 3600;
      
      -- If appointment was 2+ hours ago and still scheduled, it's likely missed
      IF v_hours_since_appointment >= 2 AND v_hours_since_appointment < 24 THEN
        INSERT INTO public.reminder_queue (
          workspace_id,
          reminder_type,
          appointment_id,
          contact_id,
          scheduled_for,
          channels,
          message_template,
          message_metadata
        ) VALUES (
          v_settings.workspace_id,
          'appointment_missed',
          v_appointment.id,
          v_appointment.contact_id,
          NOW(),
          CASE 
            WHEN v_appointment.phone IS NOT NULL THEN ARRAY['sms', 'email']
            ELSE ARRAY['email']
          END,
          'appointment_missed_template',
          jsonb_build_object(
            'appointment_date', v_appointment.date,
            'appointment_time', v_appointment.time,
            'hours_since', v_hours_since_appointment
          )
        )
        ON CONFLICT DO NOTHING;
        v_processed_count := v_processed_count + 1;
      END IF;
    END LOOP;
  END LOOP;
  
  RETURN QUERY SELECT v_processed_count;
END;
$$;

-- ============================================================================
-- PART 10 — DAILY CRITICAL FOLLOW-UPS LIST
-- ============================================================================

-- Function: Generate daily critical follow-ups list (runs at 8 AM)
CREATE OR REPLACE FUNCTION public.generate_daily_critical_followups(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_leads_going_cold jsonb;
  v_high_value_leads jsonb;
  v_storm_leads jsonb;
  v_insurance_leads jsonb;
  v_appointment_confirmations jsonb;
  v_tasks_due_today jsonb;
  v_overdue_tasks jsonb;
BEGIN
  -- Leads going cold (no response in 48+ hours)
  SELECT jsonb_agg(
    jsonb_build_object(
      'thread_id', t.id,
      'contact_id', t.contact_id,
      'last_message_at', t.last_message_at,
      'hours_since', EXTRACT(EPOCH FROM (NOW() - t.last_message_at)) / 3600,
      'estimated_value', t.thread_estimated_value
    )
  ) INTO v_leads_going_cold
  FROM public.inbox_threads t
  JOIN public.campaigns cam ON t.campaign_id = cam.id
  WHERE cam.workspace_id = p_workspace_id
    AND t.status = 'open'
    AND t.last_message_at < NOW() - INTERVAL '48 hours'
    AND t.pipeline_stage NOT IN ('won', 'lost');
  
  -- High-value leads untouched (no owner reply in 24+ hours)
  SELECT jsonb_agg(
    jsonb_build_object(
      'thread_id', t.id,
      'contact_id', t.contact_id,
      'last_message_at', t.last_message_at,
      'estimated_value', t.thread_estimated_value,
      'probability_score', t.close_probability_score
    )
  ) INTO v_high_value_leads
  FROM public.inbox_threads t
  JOIN public.campaigns cam ON t.campaign_id = cam.id
  WHERE cam.workspace_id = p_workspace_id
    AND t.status = 'open'
    AND t.last_direction = 'in'
    AND t.last_message_at < NOW() - INTERVAL '24 hours'
    AND t.thread_estimated_value >= 5000
    AND t.pipeline_stage NOT IN ('won', 'lost')
    AND NOT EXISTS (
      SELECT 1 FROM public.inbox_messages m
      WHERE m.thread_id = t.id
      AND m.direction = 'out'
      AND m.sent_at > t.last_message_at
    );
  
  -- Storm leads expiring (storm hit 7+ days ago, no conversion)
  SELECT jsonb_agg(
    jsonb_build_object(
      'thread_id', t.id,
      'contact_id', t.contact_id,
      'storm_boosted_at', t.storm_boosted_at,
      'days_since_storm', EXTRACT(EPOCH FROM (NOW() - t.storm_boosted_at)) / 86400,
      'estimated_value', t.thread_estimated_value
    )
  ) INTO v_storm_leads
  FROM public.inbox_threads t
  JOIN public.campaigns cam ON t.campaign_id = cam.id
  WHERE cam.workspace_id = p_workspace_id
    AND t.storm_hit = true
    AND t.storm_boosted_at < NOW() - INTERVAL '7 days'
    AND t.pipeline_stage NOT IN ('won', 'lost');
  
  -- Insurance leads needing action
  SELECT jsonb_agg(
    jsonb_build_object(
      'thread_id', t.id,
      'contact_id', t.contact_id,
      'estimated_value', t.thread_estimated_value,
      'insurance_metadata', t.revenue_metadata->'insurance_probability'
    )
  ) INTO v_insurance_leads
  FROM public.inbox_threads t
  JOIN public.campaigns cam ON t.campaign_id = cam.id
  WHERE cam.workspace_id = p_workspace_id
    AND t.status = 'open'
    AND (t.revenue_metadata->>'insurance_probability')::integer >= 70
    AND t.pipeline_stage NOT IN ('won', 'lost')
    AND t.last_message_at < NOW() - INTERVAL '24 hours';
  
  -- Appointment confirmations needed (appointments today without confirmation)
  SELECT jsonb_agg(
    jsonb_build_object(
      'appointment_id', a.id,
      'contact_id', a.contact_id,
      'date', a.date,
      'time', a.time,
      'status', a.status
    )
  ) INTO v_appointment_confirmations
  FROM public.appointments a
  WHERE a.workspace_id = p_workspace_id
    AND a.date = CURRENT_DATE
    AND a.status = 'scheduled'
    AND NOT EXISTS (
      SELECT 1 FROM public.reminder_logs rl
      WHERE rl.appointment_id = a.id
      AND rl.reminder_type IN ('appointment_24h', 'appointment_2h')
      AND rl.status = 'delivered'
    );
  
  -- Tasks due today
  SELECT jsonb_agg(
    jsonb_build_object(
      'task_id', t.id,
      'title', t.title,
      'due_at', t.due_at,
      'priority', t.priority,
      'contact_id', t.contact_id
    )
  ) INTO v_tasks_due_today
  FROM public.tasks_v3 t
  WHERE t.workspace_id = p_workspace_id
    AND t.status = 'open'
    AND DATE(t.due_at) = CURRENT_DATE;
  
  -- Overdue tasks
  SELECT jsonb_agg(
    jsonb_build_object(
      'task_id', t.id,
      'title', t.title,
      'due_at', t.due_at,
      'hours_overdue', EXTRACT(EPOCH FROM (NOW() - t.due_at)) / 3600,
      'priority', t.priority,
      'contact_id', t.contact_id
    )
  ) INTO v_overdue_tasks
  FROM public.tasks_v3 t
  WHERE t.workspace_id = p_workspace_id
    AND t.status = 'open'
    AND t.due_at < NOW();
  
  -- Build result
  v_result := jsonb_build_object(
    'date', CURRENT_DATE,
    'workspace_id', p_workspace_id,
    'leads_going_cold', COALESCE(v_leads_going_cold, '[]'::jsonb),
    'high_value_leads', COALESCE(v_high_value_leads, '[]'::jsonb),
    'storm_leads', COALESCE(v_storm_leads, '[]'::jsonb),
    'insurance_leads', COALESCE(v_insurance_leads, '[]'::jsonb),
    'appointment_confirmations', COALESCE(v_appointment_confirmations, '[]'::jsonb),
    'tasks_due_today', COALESCE(v_tasks_due_today, '[]'::jsonb),
    'overdue_tasks', COALESCE(v_overdue_tasks, '[]'::jsonb),
    'total_critical_items', 
      jsonb_array_length(COALESCE(v_leads_going_cold, '[]'::jsonb)) +
      jsonb_array_length(COALESCE(v_high_value_leads, '[]'::jsonb)) +
      jsonb_array_length(COALESCE(v_storm_leads, '[]'::jsonb)) +
      jsonb_array_length(COALESCE(v_insurance_leads, '[]'::jsonb)) +
      jsonb_array_length(COALESCE(v_appointment_confirmations, '[]'::jsonb)) +
      jsonb_array_length(COALESCE(v_tasks_due_today, '[]'::jsonb)) +
      jsonb_array_length(COALESCE(v_overdue_tasks, '[]'::jsonb))
  );
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- PART 11 — SMART BUCKETING VIEWS
-- ============================================================================

-- View: Hot Leads (Respond ASAP)
CREATE OR REPLACE VIEW public.reminder_hot_leads AS
SELECT 
  t.id as thread_id,
  t.contact_id,
  t.campaign_id,
  cam.workspace_id,
  t.last_message_at,
  t.thread_estimated_value,
  t.close_probability_score,
  t.pipeline_stage,
  CASE 
    WHEN t.last_direction = 'in' AND t.last_message_at > NOW() - INTERVAL '2 hours' THEN 'urgent'
    WHEN t.close_probability_score >= 80 THEN 'hot'
    WHEN t.thread_estimated_value >= 10000 THEN 'high_value'
    ELSE 'warm'
  END as heat_level,
  EXTRACT(EPOCH FROM (NOW() - t.last_message_at)) / 3600 as hours_since_message
FROM public.inbox_threads t
JOIN public.campaigns cam ON t.campaign_id = cam.id
WHERE t.status = 'open'
  AND t.pipeline_stage NOT IN ('won', 'lost')
  AND (
    (t.last_direction = 'in' AND t.last_message_at > NOW() - INTERVAL '2 hours')
    OR t.close_probability_score >= 80
    OR t.thread_estimated_value >= 10000
  );

-- View: Storm Leads (Act Today)
CREATE OR REPLACE VIEW public.reminder_storm_leads AS
SELECT 
  t.id as thread_id,
  t.contact_id,
  t.campaign_id,
  cam.workspace_id,
  t.storm_boosted_at,
  t.storm_severity,
  t.thread_estimated_value,
  EXTRACT(EPOCH FROM (NOW() - t.storm_boosted_at)) / 86400 as days_since_storm,
  CASE 
    WHEN t.storm_boosted_at > NOW() - INTERVAL '3 days' THEN 'fresh'
    WHEN t.storm_boosted_at > NOW() - INTERVAL '7 days' THEN 'warm'
    ELSE 'expiring'
  END as storm_status
FROM public.inbox_threads t
JOIN public.campaigns cam ON t.campaign_id = cam.id
WHERE t.storm_hit = true
  AND t.pipeline_stage NOT IN ('won', 'lost');

-- View: Insurance Jobs (High Value)
CREATE OR REPLACE VIEW public.reminder_insurance_jobs AS
SELECT 
  t.id as thread_id,
  t.contact_id,
  t.campaign_id,
  cam.workspace_id,
  t.thread_estimated_value,
  (t.revenue_metadata->>'insurance_probability')::integer as insurance_probability,
  t.pipeline_stage,
  t.last_message_at
FROM public.inbox_threads t
JOIN public.campaigns cam ON t.campaign_id = cam.id
WHERE t.status = 'open'
  AND (t.revenue_metadata->>'insurance_probability')::integer >= 70
  AND t.pipeline_stage NOT IN ('won', 'lost');

-- View: Follow-Up Needed
CREATE OR REPLACE VIEW public.reminder_followup_needed AS
SELECT 
  t.id as thread_id,
  t.contact_id,
  t.campaign_id,
  cam.workspace_id,
  t.last_message_at,
  t.last_direction,
  t.thread_estimated_value,
  EXTRACT(EPOCH FROM (NOW() - t.last_message_at)) / 3600 as hours_since_message,
  CASE 
    WHEN t.last_direction = 'out' THEN 'no_response'
    WHEN t.last_direction = 'in' THEN 'needs_reply'
    ELSE 'unknown'
  END as followup_type
FROM public.inbox_threads t
JOIN public.campaigns cam ON t.campaign_id = cam.id
WHERE t.status = 'open'
  AND t.pipeline_stage NOT IN ('won', 'lost')
  AND (
    (t.last_direction = 'out' AND t.last_message_at < NOW() - INTERVAL '24 hours')
    OR (t.last_direction = 'in' AND t.last_message_at < NOW() - INTERVAL '24 hours'
        AND NOT EXISTS (
          SELECT 1 FROM public.inbox_messages m
          WHERE m.thread_id = t.id
          AND m.direction = 'out'
          AND m.sent_at > t.last_message_at
        ))
  );

-- View: No Response Leads
CREATE OR REPLACE VIEW public.reminder_no_response_leads AS
SELECT 
  t.id as thread_id,
  t.contact_id,
  t.campaign_id,
  cam.workspace_id,
  t.last_message_at,
  t.thread_estimated_value,
  EXTRACT(EPOCH FROM (NOW() - t.last_message_at)) / 3600 as hours_since_message,
  CASE 
    WHEN EXTRACT(EPOCH FROM (NOW() - t.last_message_at)) / 3600 >= 168 THEN '7d_plus'
    WHEN EXTRACT(EPOCH FROM (NOW() - t.last_message_at)) / 3600 >= 72 THEN '3d_plus'
    WHEN EXTRACT(EPOCH FROM (NOW() - t.last_message_at)) / 3600 >= 24 THEN '1d_plus'
    ELSE 'recent'
  END as no_response_category
FROM public.inbox_threads t
JOIN public.campaigns cam ON t.campaign_id = cam.id
WHERE t.status = 'open'
  AND t.last_direction = 'out'
  AND t.last_message_at < NOW() - INTERVAL '24 hours'
  AND t.pipeline_stage NOT IN ('won', 'lost');

-- View: Upcoming Appointments
CREATE OR REPLACE VIEW public.reminder_upcoming_appointments AS
SELECT 
  a.id as appointment_id,
  a.contact_id,
  a.thread_id,
  a.workspace_id,
  a.date,
  a.time,
  a.status,
  (a.date + a.time)::timestamptz as appointment_datetime,
  EXTRACT(EPOCH FROM ((a.date + a.time)::timestamptz - NOW())) / 3600 as hours_until_appointment,
  CASE 
    WHEN (a.date + a.time)::timestamptz < NOW() + INTERVAL '2 hours' THEN 'imminent'
    WHEN (a.date + a.time)::timestamptz < NOW() + INTERVAL '24 hours' THEN 'today'
    WHEN a.date = CURRENT_DATE + INTERVAL '1 day' THEN 'tomorrow'
    ELSE 'upcoming'
  END as appointment_status
FROM public.appointments a
WHERE a.status = 'scheduled'
  AND a.date >= CURRENT_DATE;

-- View: Overdue Tasks
CREATE OR REPLACE VIEW public.reminder_overdue_tasks AS
SELECT 
  t.id as task_id,
  t.workspace_id,
  t.contact_id,
  t.lead_id,
  t.title,
  t.due_at,
  t.priority,
  EXTRACT(EPOCH FROM (NOW() - t.due_at)) / 3600 as hours_overdue,
  CASE 
    WHEN t.priority = 'high' OR (t.metadata->>'insurance_value')::numeric > 5000 THEN 'critical'
    WHEN EXTRACT(EPOCH FROM (NOW() - t.due_at)) / 3600 >= 24 THEN 'severely_overdue'
    ELSE 'overdue'
  END as overdue_severity
FROM public.tasks_v3 t
WHERE t.status = 'open'
  AND t.due_at < NOW();

-- View: At Risk Revenue
CREATE OR REPLACE VIEW public.reminder_at_risk_revenue AS
SELECT 
  t.id as thread_id,
  t.contact_id,
  t.campaign_id,
  cam.workspace_id,
  t.thread_estimated_value,
  t.close_probability_score,
  t.pipeline_stage,
  t.last_message_at,
  t.last_contacted_at,
  CASE 
    WHEN t.last_contacted_at IS NULL THEN 'never_contacted'
    WHEN t.last_direction = 'in' AND t.last_message_at < NOW() - INTERVAL '24 hours' THEN 'unanswered_question'
    WHEN t.last_message_at < NOW() - INTERVAL '48 hours' THEN 'cooling_trend'
    ELSE 'other'
  END as risk_reason,
  (t.thread_estimated_value * (t.close_probability_score::numeric / 100.0)) as at_risk_amount
FROM public.inbox_threads t
JOIN public.campaigns cam ON t.campaign_id = cam.id
WHERE t.status = 'open'
  AND t.pipeline_stage NOT IN ('won', 'lost')
  AND t.thread_estimated_value IS NOT NULL
  AND (
    (t.thread_estimated_value >= 5000 AND t.last_contacted_at IS NULL)
    OR (t.last_direction = 'in' AND t.last_message_at < NOW() - INTERVAL '24 hours')
    OR (t.last_message_at < NOW() - INTERVAL '48 hours')
  );

-- ============================================================================
-- PART 12 — REMINDER PROCESSING FUNCTION (Main Worker)
-- ============================================================================

-- Function: Process reminder queue (called by cron)
CREATE OR REPLACE FUNCTION public.process_reminder_queue()
RETURNS TABLE(processed_count int, error_count int)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reminder RECORD;
  v_contact RECORD;
  v_message_body text;
  v_message_subject text;
  v_log_id uuid;
  v_channel text;
  v_processed_count int := 0;
  v_error_count int := 0;
BEGIN
  -- Process pending reminders that are due
  FOR v_reminder IN
    SELECT *
    FROM public.reminder_queue
    WHERE processed = false
      AND scheduled_for <= NOW()
      AND status = 'pending'
    ORDER BY scheduled_for ASC
    LIMIT 100 -- Process in batches
  LOOP
    BEGIN
      -- Get contact info if needed
      IF v_reminder.contact_id IS NOT NULL THEN
        SELECT email, phone INTO v_contact
        FROM public.contacts
        WHERE id = v_reminder.contact_id;
      END IF;
      
      -- Generate message based on template type
      -- This is a placeholder - actual message generation would call AI/template system
      v_message_subject := CASE v_reminder.reminder_type
        WHEN 'appointment_24h' THEN 'Reminder: Your roofing estimate is tomorrow'
        WHEN 'appointment_2h' THEN 'Reminder: Your roofing estimate is in 2 hours'
        WHEN 'appointment_10min' THEN 'We''re on our way!'
        WHEN 'appointment_missed' THEN 'Looks like we missed you earlier'
        WHEN 'no_response_24h' THEN 'Just checking back in'
        WHEN 'no_response_72h' THEN 'Following up again'
        WHEN 'no_response_7d' THEN 'Final check — need help?'
        WHEN 'storm_day1' THEN 'Quick check-in after the storm'
        WHEN 'storm_day3' THEN 'Insurance info request'
        WHEN 'storm_day5' THEN 'We''re in your area'
        WHEN 'storm_day7' THEN 'Final check — need help?'
        ELSE 'Reminder from SmartSend'
      END;
      
      v_message_body := CASE v_reminder.reminder_type
        WHEN 'appointment_24h' THEN 'Reminder: Your roofing estimate is tomorrow at ' || 
          (v_reminder.message_metadata->>'appointment_time')::text || '. Reply YES to confirm.'
        WHEN 'appointment_2h' THEN 'Reminder: Your roofing estimate is in 2 hours at ' ||
          (v_reminder.message_metadata->>'appointment_time')::text || '.'
        WHEN 'appointment_10min' THEN 'We''re on our way! See you in about 10 minutes.'
        WHEN 'appointment_missed' THEN 'Looks like we missed you earlier. Want to reschedule for today or tomorrow?'
        WHEN 'no_response_24h' THEN 'Hi! Just checking back in — want me to help you schedule your roof estimate?'
        WHEN 'no_response_72h' THEN 'Following up again — happy to help with repair, inspection, or replacement.'
        WHEN 'no_response_7d' THEN 'Final check — need help with your roof?'
        WHEN 'storm_day1' THEN 'Quick check-in after the storm — need a free inspection?'
        WHEN 'storm_day3' THEN 'Do you have insurance info? We can help with your claim.'
        WHEN 'storm_day5' THEN 'We''re in your area — want us to take a look?'
        WHEN 'storm_day7' THEN 'Final check — need help with storm damage?'
        ELSE 'You have a reminder from SmartSend.'
      END;
      
      -- Send via each channel
      FOREACH v_channel IN ARRAY v_reminder.channels
      LOOP
        -- Log reminder send
        INSERT INTO public.reminder_logs (
          workspace_id,
          reminder_type,
          appointment_id,
          task_id,
          thread_id,
          contact_id,
          lead_id,
          storm_event_id,
          channel,
          message_subject,
          message_body,
          message_metadata,
          recipient_email,
          recipient_phone,
          status
        ) VALUES (
          v_reminder.workspace_id,
          v_reminder.reminder_type,
          v_reminder.appointment_id,
          v_reminder.task_id,
          v_reminder.thread_id,
          v_reminder.contact_id,
          v_reminder.lead_id,
          v_reminder.storm_event_id,
          v_channel,
          v_message_subject,
          v_message_body,
          v_reminder.message_metadata,
          CASE WHEN v_channel = 'email' THEN v_contact.email ELSE NULL END,
          CASE WHEN v_channel = 'sms' THEN v_contact.phone ELSE NULL END,
          'sent'
        )
        RETURNING id INTO v_log_id;
        
        -- TODO: Actually send SMS/Email via your messaging service
        -- This would call your SMS/Email API here
        
      END LOOP;
      
      -- Mark as processed
      UPDATE public.reminder_queue
      SET processed = true,
          processed_at = NOW(),
          status = 'sent'
      WHERE id = v_reminder.id;
      
      v_processed_count := v_processed_count + 1;
      
    EXCEPTION WHEN OTHERS THEN
      -- Log error and retry
      UPDATE public.reminder_queue
      SET retry_count = retry_count + 1,
          error_message = SQLERRM,
          status = CASE 
            WHEN retry_count + 1 >= max_retries THEN 'failed'
            ELSE 'pending'
          END
      WHERE id = v_reminder.id;
      
      v_error_count := v_error_count + 1;
    END;
  END LOOP;
  
  RETURN QUERY SELECT v_processed_count, v_error_count;
END;
$$;

-- ============================================================================
-- PART 13 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.reminder_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminder_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies for reminder_logs
DROP POLICY IF EXISTS "reminder_logs_select" ON public.reminder_logs;
CREATE POLICY "reminder_logs_select"
  ON public.reminder_logs
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "reminder_logs_insert" ON public.reminder_logs;
CREATE POLICY "reminder_logs_insert"
  ON public.reminder_logs
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for reminder_settings
DROP POLICY IF EXISTS "reminder_settings_select" ON public.reminder_settings;
CREATE POLICY "reminder_settings_select"
  ON public.reminder_settings
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "reminder_settings_insert" ON public.reminder_settings;
CREATE POLICY "reminder_settings_insert"
  ON public.reminder_settings
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "reminder_settings_update" ON public.reminder_settings;
CREATE POLICY "reminder_settings_update"
  ON public.reminder_settings
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- RLS Policies for reminder_queue
DROP POLICY IF EXISTS "reminder_queue_select" ON public.reminder_queue;
CREATE POLICY "reminder_queue_select"
  ON public.reminder_queue
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "reminder_queue_insert" ON public.reminder_queue;
CREATE POLICY "reminder_queue_insert"
  ON public.reminder_queue
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 14 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.reminder_logs IS 'Tracks all reminder sends (SMS, Email, In-App) for audit and analytics. Foundation for Smart Reminders v1.';
COMMENT ON TABLE public.reminder_settings IS 'Per-workspace reminder configuration. Owners can customize timing, tone, and channels.';
COMMENT ON TABLE public.reminder_queue IS 'Queue for scheduled reminders (processed by cron). Ensures reminders are sent at the right time.';

COMMENT ON FUNCTION public.schedule_appointment_reminders IS 'Schedules appointment reminders (24h, 2h, 10min before). Called automatically when appointments are created.';
COMMENT ON FUNCTION public.check_no_response_reminders IS 'Checks for no-response leads and schedules reminders (24h, 72h, 7d). Runs periodically via cron.';
COMMENT ON FUNCTION public.check_owner_followup_reminders IS 'Checks for threads where owner needs to reply. Creates in-app notifications.';
COMMENT ON FUNCTION public.schedule_task_reminders IS 'Schedules task reminders (morning, 2h before). Called automatically when tasks are created.';
COMMENT ON FUNCTION public.check_task_overdue_reminders IS 'Checks for overdue tasks and sends escalating reminders. Runs periodically via cron.';
COMMENT ON FUNCTION public.schedule_storm_followup_reminders IS 'Schedules storm follow-up workflow (Day 1, 3, 5, 7). Called when storm events are processed.';
COMMENT ON FUNCTION public.check_missed_appointments IS 'Checks for missed appointments and schedules re-engagement reminders.';
COMMENT ON FUNCTION public.generate_daily_critical_followups IS 'Generates daily critical follow-ups list (runs at 8 AM). Powers the daily battle board.';
COMMENT ON FUNCTION public.process_reminder_queue IS 'Main worker function that processes reminder queue. Called by cron every minute.';

COMMENT ON VIEW public.reminder_hot_leads IS 'Hot Leads (Respond ASAP) - High-value leads needing immediate attention.';
COMMENT ON VIEW public.reminder_storm_leads IS 'Storm Leads (Act Today) - Storm-tagged leads that need follow-up.';
COMMENT ON VIEW public.reminder_insurance_jobs IS 'Insurance Jobs (High Value) - Leads with high insurance probability.';
COMMENT ON VIEW public.reminder_followup_needed IS 'Follow-Up Needed - Threads requiring owner action.';
COMMENT ON VIEW public.reminder_no_response_leads IS 'No Response Leads - Leads that haven''t replied.';
COMMENT ON VIEW public.reminder_upcoming_appointments IS 'Upcoming Appointments - Scheduled appointments needing attention.';
COMMENT ON VIEW public.reminder_overdue_tasks IS 'Overdue Tasks - Tasks past their due date.';
COMMENT ON VIEW public.reminder_at_risk_revenue IS 'At Risk Revenue - High-value leads at risk of going cold.';

