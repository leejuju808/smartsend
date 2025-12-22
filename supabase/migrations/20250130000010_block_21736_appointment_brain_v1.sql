-- =========================================================
-- Block 21736 — SmartSend Roofing Appointment Brain v1
-- (Auto-Creation of Appointments From Calls, Replies, and AI Intent)
-- =========================================================
-- 
-- This is where SmartSend stops just feeding roofers leads…
-- and starts setting appointments for them automatically.
--
-- If SmartSend books just 1–2 extra appointments a week, the roofer stays for LIFE.
-- This is a revenue engine.

-- ============================================================================
-- STEP 1: APPOINTMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  created_by UUID, -- future estimator ID
  source TEXT NOT NULL CHECK (source IN ('ai_hot_reply', 'estimator_call', 'manual')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast queries by scheduled date
CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_for
ON public.appointments (scheduled_for ASC);

-- Index for lead lookups
CREATE INDEX IF NOT EXISTS idx_appointments_lead_id
ON public.appointments (lead_id);

-- Index for upcoming appointments queries
CREATE INDEX IF NOT EXISTS idx_appointments_upcoming
ON public.appointments (scheduled_for ASC)
WHERE scheduled_for >= now();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view appointments for leads in their workspace
CREATE POLICY "Users can view appointments in their workspace"
ON public.appointments
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
    WHERE l.id = appointments.lead_id
      AND wm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = appointments.lead_id
      AND l.owner_id = auth.uid()
  )
);

-- Policy: Service role can insert appointments (for auto-creation)
CREATE POLICY "Service role can insert appointments"
ON public.appointments
FOR INSERT
TO service_role
WITH CHECK (true);

-- Policy: Service role can update appointments
CREATE POLICY "Service role can update appointments"
ON public.appointments
FOR UPDATE
TO service_role
USING (true) WITH CHECK (true);

-- Policy: Authenticated users can insert appointments (for manual creation)
CREATE POLICY "Users can insert appointments in their workspace"
ON public.appointments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
    WHERE l.id = appointments.lead_id
      AND wm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.leads l
    WHERE l.id = appointments.lead_id
      AND l.owner_id = auth.uid()
  )
);

-- ============================================================================
-- STEP 2: CREATE APPOINTMENT FUNCTION
-- ============================================================================
-- This function handles appointment creation and all related updates:
-- - Creates appointment record
-- - Updates lead status to 'hot'
-- - Cancels outstanding call tasks
-- - Logs to timeline
-- - Pauses follow-ups (via status update)

CREATE OR REPLACE FUNCTION public.create_appointment(
  p_lead_id UUID,
  p_datetime TIMESTAMPTZ,
  p_source TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_appointment_id UUID;
BEGIN
  -- Validate source
  IF p_source NOT IN ('ai_hot_reply', 'estimator_call', 'manual') THEN
    RAISE EXCEPTION 'Invalid source: %', p_source;
  END IF;

  -- Insert appointment
  INSERT INTO public.appointments (lead_id, scheduled_for, source, notes)
  VALUES (p_lead_id, p_datetime, p_source, p_notes)
  RETURNING id INTO v_appointment_id;

  -- Update lead status to hot
  UPDATE public.leads
  SET status = 'hot',
      last_activity_at = now()
  WHERE id = p_lead_id;

  -- Cancel outstanding call tasks
  UPDATE public.call_tasks
  SET status = 'cancelled'
  WHERE lead_id = p_lead_id
    AND status IN ('pending', 'in_progress');

  -- Log to timeline
  INSERT INTO public.lead_timeline_events (
    lead_id,
    event_type,
    event_subtype,
    message,
    metadata
  )
  VALUES (
    p_lead_id,
    'appointment_created',
    p_source,
    'Appointment scheduled',
    jsonb_build_object(
      'scheduled_for', p_datetime,
      'notes', p_notes,
      'appointment_id', v_appointment_id
    )
  );

  RETURN v_appointment_id;
END;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.appointments IS 'Appointments automatically created from AI-detected scheduling intent, call outcomes, or manual booking';
COMMENT ON COLUMN public.appointments.source IS 'How appointment was created: ai_hot_reply (AI detected scheduling in reply), estimator_call (call outcome completed), manual (user booked)';
COMMENT ON FUNCTION public.create_appointment IS 'Creates an appointment and updates lead status, cancels call tasks, and logs to timeline';










































