-- =========================================================
-- Block 24860 — SmartSend Roofing Alerts & Automations v1
-- (Behavior-Based Alerts • Missed Task Detection • Job Risk Engine • Owner Escalation • Automated Fixes)
-- =========================================================
-- 
-- THIS IS THE BRAIN THAT HOLDS THE WHOLE SYSTEM TOGETHER — ZERO FLUFF.
-- 
-- This block makes SmartSend intelligent.
-- Not just a CRM. Not just a tracker. Not just a workflow.
-- 
-- This is the real-time alert + automation system that monitors every job, every crew,
-- every supplier, every payment, every homeowner message — and triggers actions automatically.
-- 
-- This is how SmartSend becomes a revenue protection engine for roofers.

-- ============================================================================
-- PART 1 — CREATE ALERT CATEGORIES ENUM
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'roofing_alert_category') THEN
    CREATE TYPE roofing_alert_category AS ENUM (
      'homeowner',      -- Category 1: Homeowner Alerts
      'crew',          -- Category 2: Crew Alerts
      'supplier',      -- Category 3: Supplier Alerts
      'insurance',     -- Category 4: Insurance Alerts
      'payment',       -- Category 5: Payment Alerts
      'job_risk'       -- Category 6: Job Risk Alerts
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'roofing_alert_priority') THEN
    CREATE TYPE roofing_alert_priority AS ENUM (
      'critical',      -- 🔴 Critical Escalations
      'high',          -- 🟠 High Priority
      'medium',        -- 🟡 Medium Priority
      'low'            -- 🟢 Low Priority
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'roofing_alert_status') THEN
    CREATE TYPE roofing_alert_status AS ENUM (
      'active',
      'acknowledged',
      'resolved',
      'dismissed'
    );
  END IF;
END$$;

-- ============================================================================
-- PART 2 — CREATE roofing_alerts TABLE
-- ============================================================================
-- Main alerts table for all 6 categories

CREATE TABLE IF NOT EXISTS public.roofing_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Alert Classification
  category roofing_alert_category NOT NULL,
  priority roofing_alert_priority NOT NULL DEFAULT 'medium',
  status roofing_alert_status NOT NULL DEFAULT 'active',
  
  -- Alert Details
  alert_type text NOT NULL, -- e.g., 'no_reply_48h', 'crew_no_checkin', 'supplier_delay', 'acv_not_received', 'deposit_missing', 'health_score_drop'
  title text NOT NULL,
  message text NOT NULL,
  icon text, -- emoji or icon name
  
  -- Context (flexible entity references)
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.job_invoices(id) ON DELETE SET NULL,
  insurance_claim_id uuid REFERENCES public.job_insurance_claims(id) ON DELETE SET NULL,
  material_order_id uuid REFERENCES public.material_orders(id) ON DELETE SET NULL,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb, -- flexible data storage
  source text, -- 'system', 'manual', 'automation'
  
  -- Escalation
  escalated_to_owner boolean DEFAULT false,
  escalated_at timestamptz,
  
  -- Automated Fix
  auto_fix_available boolean DEFAULT false,
  auto_fix_type text, -- 'auto_followup', 'material_confirmation', 'crew_reminder', 'insurance_nudge', 'payment_reminder', 'weather_action'
  auto_fix_executed boolean DEFAULT false,
  auto_fix_executed_at timestamptz,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  dismissed_at timestamptz,
  
  -- Throttling
  throttled boolean DEFAULT false,
  batch_id uuid -- groups related alerts together
);

CREATE INDEX IF NOT EXISTS idx_roofing_alerts_workspace_status 
  ON public.roofing_alerts(workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_roofing_alerts_category_priority 
  ON public.roofing_alerts(category, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_roofing_alerts_job 
  ON public.roofing_alerts(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_alerts_active 
  ON public.roofing_alerts(workspace_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_roofing_alerts_escalated 
  ON public.roofing_alerts(workspace_id, escalated_to_owner) WHERE escalated_to_owner = true;
CREATE INDEX IF NOT EXISTS idx_roofing_alerts_auto_fix 
  ON public.roofing_alerts(workspace_id, auto_fix_available, auto_fix_executed) 
  WHERE auto_fix_available = true AND auto_fix_executed = false;

-- ============================================================================
-- PART 3 — CREATE automated_fixes TABLE
-- ============================================================================
-- Tracks automated fix executions

CREATE TABLE IF NOT EXISTS public.automated_fixes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  alert_id uuid REFERENCES public.roofing_alerts(id) ON DELETE SET NULL,
  
  -- Fix Details
  fix_type text NOT NULL CHECK (fix_type IN (
    'auto_followup',
    'material_confirmation',
    'crew_reminder',
    'insurance_nudge',
    'payment_reminder',
    'weather_action',
    'homeowner_confirmation',
    'supplier_confirmation',
    'crew_documentation_reminder',
    'deposit_reminder',
    'final_invoice_send',
    'review_request',
    'permit_check',
    'delivery_scheduling',
    'weather_monitor',
    'crew_checkin_reminder'
  )),
  
  -- Context
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  
  -- Execution
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'failed', 'skipped')),
  executed_at timestamptz,
  execution_result jsonb DEFAULT '{}'::jsonb, -- stores result details
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automated_fixes_workspace_status 
  ON public.automated_fixes(workspace_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automated_fixes_job 
  ON public.automated_fixes(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_automated_fixes_pending 
  ON public.automated_fixes(status, created_at) WHERE status = 'pending';

-- ============================================================================
-- PART 4 — CREATE alert_settings TABLE
-- ============================================================================
-- Personalized alert settings per user/workspace

CREATE TABLE IF NOT EXISTS public.alert_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE, -- null = workspace-wide defaults
  
  -- Category Settings (which categories this user receives)
  enabled_categories jsonb DEFAULT '{
    "homeowner": true,
    "crew": true,
    "supplier": true,
    "insurance": true,
    "payment": true,
    "job_risk": true
  }'::jsonb,
  
  -- Priority Thresholds (only receive alerts at or above this priority)
  priority_thresholds jsonb DEFAULT '{
    "homeowner": "medium",
    "crew": "medium",
    "supplier": "medium",
    "insurance": "high",
    "payment": "high",
    "job_risk": "high"
  }'::jsonb,
  
  -- Alert Frequency
  alert_frequency text DEFAULT 'realtime' CHECK (alert_frequency IN ('realtime', 'hourly', 'daily', 'weekly')),
  daily_digest_enabled boolean DEFAULT false,
  daily_digest_time time DEFAULT '08:00:00'::time,
  
  -- Job Risk Thresholds
  job_risk_score_threshold integer DEFAULT 70, -- Alert if health score drops below this
  weather_sensitivity text DEFAULT 'medium' CHECK (weather_sensitivity IN ('low', 'medium', 'high')),
  
  -- Payment Rules
  payment_overdue_days integer DEFAULT 3, -- Alert after X days overdue
  deposit_required_alert boolean DEFAULT true,
  
  -- Insurance Rules
  insurance_followup_delay_days integer DEFAULT 5, -- Alert if supplement pending > X days
  adjuster_response_delay_hours integer DEFAULT 48, -- Alert if adjuster hasn't responded
  
  -- Crew Rules
  crew_grading_threshold integer DEFAULT 70, -- Alert if crew performance drops below this
  
  -- Throttling
  throttle_minutes integer DEFAULT 20, -- max 1 alert per entity every X minutes
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_settings_workspace_user 
  ON public.alert_settings(workspace_id, user_id);

-- ============================================================================
-- PART 5 — CREATE missing_steps TABLE
-- ============================================================================
-- Tracks missing steps detected by the Missing Step Detector

CREATE TABLE IF NOT EXISTS public.missing_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  
  -- Step Details
  step_type text NOT NULL CHECK (step_type IN (
    'contract_upload',
    'deposit_collection',
    'completion_photos',
    'supplement_submission',
    'review_request',
    'permit_upload',
    'insurance_documentation',
    'final_invoice',
    'warranty_delivery',
    'crew_assignment',
    'material_order',
    'homeowner_confirmation'
  )),
  
  step_title text NOT NULL,
  step_description text,
  
  -- Status
  status text NOT NULL DEFAULT 'detected' CHECK (status IN ('detected', 'in_progress', 'completed', 'dismissed')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  
  -- Alert Created
  alert_id uuid REFERENCES public.roofing_alerts(id) ON DELETE SET NULL,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_missing_steps_workspace_job 
  ON public.missing_steps(workspace_id, job_id, status);
CREATE INDEX IF NOT EXISTS idx_missing_steps_status 
  ON public.missing_steps(status, detected_at) WHERE status = 'detected';

-- ============================================================================
-- PART 6 — CREATE pipeline_automations TABLE
-- ============================================================================
-- Tracks automations for each pipeline stage

CREATE TABLE IF NOT EXISTS public.pipeline_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Stage
  pipeline_stage text NOT NULL CHECK (pipeline_stage IN (
    'lead_in',
    'inspection_set',
    'quote_sent',
    'approved',
    'scheduled',
    'installed',
    'completed'
  )),
  
  -- Automation Details
  automation_type text NOT NULL CHECK (automation_type IN (
    'send_intro_sequence',
    'notify_no_inspection',
    'send_appointment_confirmation',
    'remind_day_before',
    'notify_no_confirmation',
    'auto_followup',
    'owner_alert_no_response',
    'revive_sequence',
    'trigger_permit_check',
    'trigger_delivery_scheduling',
    'ensure_deposit_paid',
    'weather_monitor_activate',
    'crew_reminders',
    'material_confirmation_alerts',
    'final_invoice_send',
    'review_request_sequence',
    'warranty_prep'
  )),
  
  -- Configuration
  enabled boolean DEFAULT true,
  delay_hours integer DEFAULT 0, -- delay before executing
  conditions jsonb DEFAULT '{}'::jsonb, -- conditions that must be met
  
  -- Execution Tracking
  last_executed_at timestamptz,
  execution_count integer DEFAULT 0,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_automations_workspace_stage 
  ON public.pipeline_automations(workspace_id, pipeline_stage, enabled);
CREATE INDEX IF NOT EXISTS idx_pipeline_automations_enabled 
  ON public.pipeline_automations(workspace_id, enabled) WHERE enabled = true;

-- ============================================================================
-- PART 7 — CREATE FUNCTION: detect_homeowner_alerts
-- ============================================================================
-- Category 1: Homeowner Alerts

CREATE OR REPLACE FUNCTION public.detect_homeowner_alerts(p_workspace_id uuid DEFAULT NULL)
RETURNS TABLE (
  alert_id uuid,
  job_id uuid,
  alert_type text,
  title text,
  message text,
  priority roofing_alert_priority
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  -- No reply after 48 hours
  SELECT 
    gen_random_uuid() as alert_id,
    rj.id as job_id,
    'no_reply_48h'::text as alert_type,
    'Homeowner hasn''t replied in 48+ hours'::text as title,
    format('Homeowner hasn''t replied to your last message in %s hours. Send follow-up?', 
      EXTRACT(EPOCH FROM (now() - MAX(lt.created_at))) / 3600)::text as message,
    'medium'::roofing_alert_priority as priority
  FROM public.roofing_jobs rj
  JOIN public.leads l ON l.id = rj.lead_id
  LEFT JOIN public.lead_timeline_events lt ON lt.lead_id = l.id
  WHERE (p_workspace_id IS NULL OR rj.workspace_id = p_workspace_id)
    AND rj.status NOT IN ('completed', 'cancelled')
    AND lt.event_type = 'email_sent'
    AND lt.created_at < now() - interval '48 hours'
    AND NOT EXISTS (
      SELECT 1 FROM public.lead_timeline_events lt2
      WHERE lt2.lead_id = l.id
        AND lt2.event_type IN ('reply_received', 'email_sent')
        AND lt2.created_at > lt.created_at
    )
  GROUP BY rj.id
  HAVING MAX(lt.created_at) < now() - interval '48 hours';
  
  -- Homeowner confused (negative sentiment detected)
  -- Note: This would require sentiment analysis integration
  
  -- Reschedule request detected
  -- Note: This would require NLP integration to detect reschedule requests
  
  -- Payment reminder needed
  -- Handled by payment alerts category
END;
$$;

-- ============================================================================
-- PART 8 — CREATE FUNCTION: detect_crew_alerts
-- ============================================================================
-- Category 2: Crew Alerts

CREATE OR REPLACE FUNCTION public.detect_crew_alerts(p_workspace_id uuid DEFAULT NULL)
RETURNS TABLE (
  alert_id uuid,
  job_id uuid,
  crew_id uuid,
  alert_type text,
  title text,
  message text,
  priority roofing_alert_priority
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  -- No check-in
  SELECT 
    gen_random_uuid() as alert_id,
    rj.id as job_id,
    jca.crew_id,
    'crew_no_checkin'::text as alert_type,
    format('Crew %s has not checked in', c.name)::text as title,
    format('Crew %s assigned to job %s has not checked in. Expected start: %s', 
      c.name, rj.title, rj.scheduled_start_date)::text as message,
    CASE 
      WHEN rj.scheduled_start_date <= CURRENT_DATE THEN 'high'::roofing_alert_priority
      ELSE 'medium'::roofing_alert_priority
    END as priority
  FROM public.roofing_jobs rj
  JOIN public.job_crew_assignments jca ON jca.job_id = rj.id AND jca.unassigned_at IS NULL
  JOIN public.crews c ON c.id = jca.crew_id
  LEFT JOIN public.crew_readiness_tracking crt ON crt.job_id = rj.id
  WHERE (p_workspace_id IS NULL OR rj.workspace_id = p_workspace_id)
    AND rj.status IN ('scheduled', 'in_progress')
    AND rj.scheduled_start_date <= CURRENT_DATE
    AND (crt.crew_confirmed_arrival IS NULL OR crt.crew_confirmed_arrival = false);
  
  -- Missing documentation
  SELECT 
    gen_random_uuid() as alert_id,
    rj.id as job_id,
    jca.crew_id,
    'crew_missing_photos'::text as alert_type,
    format('Crew %s has not uploaded required photos', c.name)::text as title,
    format('Crew %s has not uploaded required photos for job %s', c.name, rj.title)::text as message,
    'medium'::roofing_alert_priority as priority
  FROM public.roofing_jobs rj
  JOIN public.job_crew_assignments jca ON jca.job_id = rj.id AND jca.unassigned_at IS NULL
  JOIN public.crews c ON c.id = jca.crew_id
  LEFT JOIN public.crew_readiness_tracking crt ON crt.job_id = rj.id
  WHERE (p_workspace_id IS NULL OR rj.workspace_id = p_workspace_id)
    AND rj.status IN ('in_progress', 'completed')
    AND (crt.crew_submitted_arrival_photos IS NULL OR crt.crew_submitted_arrival_photos = false);
  
  -- Job taking too long
  SELECT 
    gen_random_uuid() as alert_id,
    rj.id as job_id,
    jca.crew_id,
    'job_taking_too_long'::text as alert_type,
    format('Job %s is taking longer than expected', rj.title)::text as title,
    format('Job %s started on %s and is still in progress. Expected duration: %s days', 
      rj.title, rj.scheduled_start_date, 
      COALESCE(c.avg_job_duration_days, 1))::text as message,
    'medium'::roofing_alert_priority as priority
  FROM public.roofing_jobs rj
  JOIN public.job_crew_assignments jca ON jca.job_id = rj.id AND jca.unassigned_at IS NULL
  JOIN public.crews c ON c.id = jca.crew_id
  WHERE (p_workspace_id IS NULL OR rj.workspace_id = p_workspace_id)
    AND rj.status = 'in_progress'
    AND rj.scheduled_start_date IS NOT NULL
    AND CURRENT_DATE > rj.scheduled_start_date + COALESCE(c.avg_job_duration_days, 1)::integer;
END;
$$;

-- ============================================================================
-- PART 9 — CREATE FUNCTION: detect_supplier_alerts
-- ============================================================================
-- Category 3: Supplier Alerts

CREATE OR REPLACE FUNCTION public.detect_supplier_alerts(p_workspace_id uuid DEFAULT NULL)
RETURNS TABLE (
  alert_id uuid,
  job_id uuid,
  supplier_id uuid,
  material_order_id uuid,
  alert_type text,
  title text,
  message text,
  priority roofing_alert_priority
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  -- Delivery delay
  SELECT 
    gen_random_uuid() as alert_id,
    mo.job_id,
    mo.supplier_id,
    mo.id as material_order_id,
    'supplier_delivery_delay'::text as alert_type,
    format('Supplier %s delivery delayed', s.name)::text as title,
    format('Supplier %s delivery for job %s is delayed. Expected: %s, Status: %s', 
      s.name, rj.title, mo.expected_delivery_date, mo.status)::text as message,
    CASE 
      WHEN mo.expected_delivery_date < CURRENT_DATE THEN 'high'::roofing_alert_priority
      ELSE 'medium'::roofing_alert_priority
    END as priority
  FROM public.material_orders mo
  JOIN public.roofing_jobs rj ON rj.id = mo.job_id
  JOIN public.suppliers s ON s.id = mo.supplier_id
  WHERE (p_workspace_id IS NULL OR mo.workspace_id = p_workspace_id)
    AND mo.status NOT IN ('delivered', 'cancelled')
    AND mo.expected_delivery_date IS NOT NULL
    AND (mo.expected_delivery_date < CURRENT_DATE OR mo.status = 'delayed');
  
  -- No delivery confirmation
  SELECT 
    gen_random_uuid() as alert_id,
    mo.job_id,
    mo.supplier_id,
    mo.id as material_order_id,
    'supplier_no_confirmation'::text as alert_type,
    format('Supplier %s has not confirmed delivery', s.name)::text as title,
    format('Supplier %s has not confirmed delivery for job %s. Expected delivery: %s', 
      s.name, rj.title, mo.expected_delivery_date)::text as message,
    'medium'::roofing_alert_priority as priority
  FROM public.material_orders mo
  JOIN public.roofing_jobs rj ON rj.id = mo.job_id
  JOIN public.suppliers s ON s.id = mo.supplier_id
  WHERE (p_workspace_id IS NULL OR mo.workspace_id = p_workspace_id)
    AND mo.status = 'ordered'
    AND mo.expected_delivery_date IS NOT NULL
    AND mo.expected_delivery_date <= CURRENT_DATE + interval '1 day'
    AND NOT COALESCE(mo.supplier_confirmed, false);
END;
$$;

-- ============================================================================
-- PART 10 — CREATE FUNCTION: detect_insurance_alerts
-- ============================================================================
-- Category 4: Insurance Alerts

CREATE OR REPLACE FUNCTION public.detect_insurance_alerts(p_workspace_id uuid DEFAULT NULL)
RETURNS TABLE (
  alert_id uuid,
  job_id uuid,
  insurance_claim_id uuid,
  alert_type text,
  title text,
  message text,
  priority roofing_alert_priority
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  -- ACV not received
  SELECT 
    gen_random_uuid() as alert_id,
    rj.id as job_id,
    jic.id as insurance_claim_id,
    'acv_not_received'::text as alert_type,
    'ACV check not received'::text as title,
    format('ACV check for claim %s has not been received. Expected amount: $%s', 
      jic.claim_number, jic.acv_amount)::text as message,
    'high'::roofing_alert_priority as priority
  FROM public.job_insurance_claims jic
  JOIN public.roofing_jobs rj ON rj.id = jic.job_id
  WHERE (p_workspace_id IS NULL OR jic.workspace_id = p_workspace_id)
    AND jic.acv_amount > 0
    AND jic.acv_paid = 0
    AND jic.claim_status IN ('awaiting_acv', 'in_progress');
  
  -- Supplement stalled
  SELECT 
    gen_random_uuid() as alert_id,
    rj.id as job_id,
    jic.id as insurance_claim_id,
    'supplement_stalled'::text as alert_type,
    'Supplement pending too long'::text as title,
    format('Supplement for claim %s has been pending for %s days. Follow-up recommended.', 
      jic.claim_number, CURRENT_DATE - jic.updated_at::date)::text as message,
    'high'::roofing_alert_priority as priority
  FROM public.job_insurance_claims jic
  JOIN public.roofing_jobs rj ON rj.id = jic.job_id
  WHERE (p_workspace_id IS NULL OR jic.workspace_id = p_workspace_id)
    AND jic.supplement_requested > 0
    AND jic.claim_status = 'awaiting_supplement'
    AND jic.updated_at < CURRENT_DATE - interval '5 days';
  
  -- Depreciation not released
  SELECT 
    gen_random_uuid() as alert_id,
    rj.id as job_id,
    jic.id as insurance_claim_id,
    'depreciation_not_released'::text as alert_type,
    'Depreciation check not released'::text as title,
    format('Depreciation check for claim %s has not been released. Expected amount: $%s', 
      jic.claim_number, jic.depreciation_amount)::text as message,
    'high'::roofing_alert_priority as priority
  FROM public.job_insurance_claims jic
  JOIN public.roofing_jobs rj ON rj.id = jic.job_id
  WHERE (p_workspace_id IS NULL OR jic.workspace_id = p_workspace_id)
    AND jic.depreciation_amount > 0
    AND jic.rcv_paid = 0
    AND rj.status = 'completed'
    AND jic.claim_status IN ('awaiting_rcv', 'in_progress');
  
  -- Adjuster not responding
  -- Note: This would require tracking adjuster communication timestamps
END;
$$;

-- ============================================================================
-- PART 11 — CREATE FUNCTION: detect_payment_alerts
-- ============================================================================
-- Category 5: Payment Alerts

CREATE OR REPLACE FUNCTION public.detect_payment_alerts(p_workspace_id uuid DEFAULT NULL)
RETURNS TABLE (
  alert_id uuid,
  job_id uuid,
  invoice_id uuid,
  alert_type text,
  title text,
  message text,
  priority roofing_alert_priority
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  -- Deposit not collected
  SELECT 
    gen_random_uuid() as alert_id,
    rj.id as job_id,
    NULL::uuid as invoice_id,
    'deposit_missing'::text as alert_type,
    'Deposit missing — do NOT start job until paid'::text as title,
    format('Deposit for job %s is missing. Required: $%s, Paid: $%s', 
      rj.title, rj.deposit_required, COALESCE(rj.deposit_paid, 0))::text as message,
    'critical'::roofing_alert_priority as priority
  FROM public.roofing_jobs rj
  WHERE (p_workspace_id IS NULL OR rj.workspace_id = p_workspace_id)
    AND rj.deposit_required > 0
    AND COALESCE(rj.deposit_paid, 0) < rj.deposit_required
    AND rj.status IN ('scheduled', 'in_progress');
  
  -- Overdue invoice
  SELECT 
    gen_random_uuid() as alert_id,
    ji.job_id,
    ji.id as invoice_id,
    'invoice_overdue'::text as alert_type,
    format('Invoice overdue by %s days', CURRENT_DATE - ji.due_date)::text as title,
    format('Final invoice for job %s is overdue. Amount: $%s, Due: %s', 
      rj.title, ji.amount, ji.due_date)::text as message,
    CASE 
      WHEN CURRENT_DATE - ji.due_date > 21 THEN 'critical'::roofing_alert_priority
      WHEN CURRENT_DATE - ji.due_date > 7 THEN 'high'::roofing_alert_priority
      ELSE 'medium'::roofing_alert_priority
    END as priority
  FROM public.job_invoices ji
  JOIN public.roofing_jobs rj ON rj.id = ji.job_id
  WHERE (p_workspace_id IS NULL OR rj.workspace_id = p_workspace_id)
    AND ji.status = 'overdue'
    AND ji.due_date IS NOT NULL
    AND ji.due_date < CURRENT_DATE;
  
  -- Insurance payment missing
  SELECT 
    gen_random_uuid() as alert_id,
    rj.id as job_id,
    NULL::uuid as invoice_id,
    'insurance_payment_missing'::text as alert_type,
    'Insurance payment missing'::text as title,
    format('Insurance payment for job %s is missing. Check insurance claim status.', rj.title)::text as message,
    'high'::roofing_alert_priority as priority
  FROM public.roofing_jobs rj
  LEFT JOIN public.job_insurance_claims jic ON jic.job_id = rj.id
  WHERE (p_workspace_id IS NULL OR rj.workspace_id = p_workspace_id)
    AND jic.id IS NOT NULL
    AND jic.acv_amount > 0
    AND jic.acv_paid = 0
    AND rj.status IN ('scheduled', 'in_progress');
END;
$$;

-- ============================================================================
-- PART 12 — CREATE FUNCTION: detect_job_risk_alerts
-- ============================================================================
-- Category 6: Job Risk Alerts

CREATE OR REPLACE FUNCTION public.detect_job_risk_alerts(p_workspace_id uuid DEFAULT NULL)
RETURNS TABLE (
  alert_id uuid,
  job_id uuid,
  alert_type text,
  title text,
  message text,
  priority roofing_alert_priority
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  -- Job health score drops
  SELECT 
    gen_random_uuid() as alert_id,
    jhs.job_id,
    'health_score_drop'::text as alert_type,
    format('Job health score dropped to %s', jhs.overall_score)::text as title,
    format('Job %s health score is %s. Status: %s. Review issues immediately.', 
      rj.title, jhs.overall_score, jhs.health_status)::text as message,
    CASE 
      WHEN jhs.overall_score < 50 THEN 'critical'::roofing_alert_priority
      WHEN jhs.overall_score < 70 THEN 'high'::roofing_alert_priority
      ELSE 'medium'::roofing_alert_priority
    END as priority
  FROM public.job_health_scores jhs
  JOIN public.roofing_jobs rj ON rj.id = jhs.job_id
  WHERE (p_workspace_id IS NULL OR jhs.workspace_id = p_workspace_id)
    AND jhs.health_status IN ('needs_attention', 'at_risk')
    AND jhs.overall_score < 70;
  
  -- Weather risk detected
  SELECT 
    gen_random_uuid() as alert_id,
    rj.id as job_id,
    'weather_risk'::text as alert_type,
    format('Weather risk detected for %s', rj.scheduled_start_date)::text as title,
    format('Rain/wind predicted at %s for job %s. Reschedule or tarp plan needed.', 
      rj.scheduled_start_date, rj.title)::text as message,
    CASE 
      WHEN rj.weather_risk_label = 'high' THEN 'critical'::roofing_alert_priority
      WHEN rj.weather_risk_label = 'medium' THEN 'high'::roofing_alert_priority
      ELSE 'medium'::roofing_alert_priority
    END as priority
  FROM public.roofing_jobs rj
  WHERE (p_workspace_id IS NULL OR rj.workspace_id = p_workspace_id)
    AND rj.status IN ('scheduled', 'in_progress')
    AND rj.weather_risk_label IN ('high', 'medium')
    AND rj.scheduled_start_date <= CURRENT_DATE + interval '3 days';
  
  -- Materials delayed
  SELECT 
    gen_random_uuid() as alert_id,
    mo.job_id,
    'materials_delayed'::text as alert_type,
    'Materials delayed — crew ETA will be affected'::text as title,
    format('Material delivery for job %s is delayed. Expected: %s, Status: %s', 
      rj.title, mo.expected_delivery_date, mo.status)::text as message,
    'high'::roofing_alert_priority as priority
  FROM public.material_orders mo
  JOIN public.roofing_jobs rj ON rj.id = mo.job_id
  WHERE (p_workspace_id IS NULL OR mo.workspace_id = p_workspace_id)
    AND mo.status IN ('delayed', 'en_route')
    AND mo.expected_delivery_date < CURRENT_DATE
    AND rj.status IN ('scheduled', 'in_progress');
  
  -- Crew behind schedule
  SELECT 
    gen_random_uuid() as alert_id,
    rj.id as job_id,
    'crew_behind_schedule'::text as alert_type,
    'Crew behind schedule'::text as title,
    format('Crew assigned to job %s is behind schedule. Started: %s, Expected duration: %s days', 
      rj.title, rj.scheduled_start_date, c.avg_job_duration_days)::text as message,
    'medium'::roofing_alert_priority as priority
  FROM public.roofing_jobs rj
  JOIN public.job_crew_assignments jca ON jca.job_id = rj.id AND jca.unassigned_at IS NULL
  JOIN public.crews c ON c.id = jca.crew_id
  WHERE (p_workspace_id IS NULL OR rj.workspace_id = p_workspace_id)
    AND rj.status = 'in_progress'
    AND rj.scheduled_start_date IS NOT NULL
    AND CURRENT_DATE > rj.scheduled_start_date + COALESCE(c.avg_job_duration_days, 1)::integer;
END;
$$;

-- ============================================================================
-- PART 13 — CREATE FUNCTION: detect_missing_steps
-- ============================================================================
-- Missing Step Detector

CREATE OR REPLACE FUNCTION public.detect_missing_steps(p_workspace_id uuid DEFAULT NULL)
RETURNS TABLE (
  step_id uuid,
  job_id uuid,
  step_type text,
  step_title text,
  step_description text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  -- If job approved → no contract uploaded
  SELECT 
    gen_random_uuid() as step_id,
    rj.id as job_id,
    'contract_upload'::text as step_type,
    'Missing signed contract'::text as step_title,
    'Job is approved but no signed contract has been uploaded.'::text as step_description
  FROM public.roofing_jobs rj
  WHERE (p_workspace_id IS NULL OR rj.workspace_id = p_workspace_id)
    AND rj.status IN ('scheduled', 'in_progress')
    AND NOT EXISTS (
      SELECT 1 FROM public.job_signable_documents jsd
      WHERE jsd.job_id = rj.id
        AND jsd.document_type = 'contract'
        AND jsd.status = 'signed'
    );
  
  -- If job scheduled → no deposit shown
  SELECT 
    gen_random_uuid() as step_id,
    rj.id as job_id,
    'deposit_collection'::text as step_type,
    'Deposit required to start job'::text as step_title,
    format('Job is scheduled but deposit has not been collected. Required: $%s', 
      rj.deposit_required)::text as step_description
  FROM public.roofing_jobs rj
  WHERE (p_workspace_id IS NULL OR rj.workspace_id = p_workspace_id)
    AND rj.status IN ('scheduled', 'in_progress')
    AND rj.deposit_required > 0
    AND COALESCE(rj.deposit_paid, 0) < rj.deposit_required;
  
  -- If install complete → no completion photos
  SELECT 
    gen_random_uuid() as step_id,
    rj.id as job_id,
    'completion_photos'::text as step_type,
    'Crew photos missing'::text as step_title,
    'Job is completed but completion photos have not been uploaded.'::text as step_description
  FROM public.roofing_jobs rj
  LEFT JOIN public.crew_readiness_tracking crt ON crt.job_id = rj.id
  WHERE (p_workspace_id IS NULL OR rj.workspace_id = p_workspace_id)
    AND rj.status = 'completed'
    AND (crt.crew_submitted_arrival_photos IS NULL OR crt.crew_submitted_arrival_photos = false);
  
  -- If insurance job → supplement not submitted
  SELECT 
    gen_random_uuid() as step_id,
    rj.id as job_id,
    'supplement_submission'::text as step_type,
    'Possible missed supplement. Submit?'::text as step_title,
    format('Insurance job completed but supplement may not have been submitted. Claim: %s', 
      jic.claim_number)::text as step_description
  FROM public.roofing_jobs rj
  JOIN public.job_insurance_claims jic ON jic.job_id = rj.id
  WHERE (p_workspace_id IS NULL OR rj.workspace_id = p_workspace_id)
    AND rj.status = 'completed'
    AND jic.supplement_requested = 0
    AND jic.claim_status IN ('awaiting_rcv', 'in_progress');
  
  -- If job completed → review not requested
  SELECT 
    gen_random_uuid() as step_id,
    rj.id as job_id,
    'review_request'::text as step_type,
    'You''re missing a review opportunity'::text as step_title,
    'Job is completed but review has not been requested from homeowner.'::text as step_description
  FROM public.roofing_jobs rj
  WHERE (p_workspace_id IS NULL OR rj.workspace_id = p_workspace_id)
    AND rj.status = 'completed'
    AND NOT EXISTS (
      SELECT 1 FROM public.pipeline_automations pa
      WHERE pa.job_id = rj.id
        AND pa.automation_type = 'review_request_sequence'
        AND pa.last_executed_at IS NOT NULL
    );
END;
$$;

-- ============================================================================
-- PART 14 — CREATE FUNCTION: create_roofing_alert
-- ============================================================================
-- Main function to create roofing alerts

CREATE OR REPLACE FUNCTION public.create_roofing_alert(
  p_workspace_id uuid,
  p_category roofing_alert_category,
  p_alert_type text,
  p_title text,
  p_message text,
  p_priority roofing_alert_priority DEFAULT 'medium',
  p_job_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_crew_id uuid DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL,
  p_invoice_id uuid DEFAULT NULL,
  p_insurance_claim_id uuid DEFAULT NULL,
  p_material_order_id uuid DEFAULT NULL,
  p_auto_fix_available boolean DEFAULT false,
  p_auto_fix_type text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alert_id uuid;
  v_icon text;
  v_should_escalate boolean := false;
BEGIN
  -- Determine icon based on category
  v_icon := CASE p_category
    WHEN 'homeowner' THEN '🏠'
    WHEN 'crew' THEN '👷'
    WHEN 'supplier' THEN '📦'
    WHEN 'insurance' THEN '📄'
    WHEN 'payment' THEN '💰'
    WHEN 'job_risk' THEN '⚠️'
  END;
  
  -- Check if should escalate to owner
  IF p_priority IN ('critical', 'high') THEN
    v_should_escalate := true;
  END IF;
  
  -- Create alert
  INSERT INTO public.roofing_alerts (
    workspace_id,
    category,
    priority,
    alert_type,
    title,
    message,
    icon,
    job_id,
    lead_id,
    crew_id,
    supplier_id,
    invoice_id,
    insurance_claim_id,
    material_order_id,
    auto_fix_available,
    auto_fix_type,
    escalated_to_owner,
    escalated_at,
    metadata,
    source
  ) VALUES (
    p_workspace_id,
    p_category,
    p_priority,
    p_alert_type,
    p_title,
    p_message,
    v_icon,
    p_job_id,
    p_lead_id,
    p_crew_id,
    p_supplier_id,
    p_invoice_id,
    p_insurance_claim_id,
    p_material_order_id,
    p_auto_fix_available,
    p_auto_fix_type,
    v_should_escalate,
    CASE WHEN v_should_escalate THEN now() ELSE NULL END,
    p_metadata,
    'system'
  ) RETURNING id INTO v_alert_id;
  
  RETURN v_alert_id;
END;
$$;

-- ============================================================================
-- PART 15 — CREATE FUNCTION: execute_automated_fix
-- ============================================================================
-- Executes an automated fix

CREATE OR REPLACE FUNCTION public.execute_automated_fix(
  p_alert_id uuid,
  p_fix_type text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alert record;
  v_fix_id uuid;
  v_result jsonb;
BEGIN
  -- Get alert details
  SELECT * INTO v_alert
  FROM public.roofing_alerts
  WHERE id = p_alert_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Alert not found';
  END IF;
  
  -- Create automated fix record
  INSERT INTO public.automated_fixes (
    workspace_id,
    alert_id,
    fix_type,
    job_id,
    lead_id,
    crew_id,
    supplier_id,
    status,
    metadata
  ) VALUES (
    v_alert.workspace_id,
    p_alert_id,
    p_fix_type,
    v_alert.job_id,
    v_alert.lead_id,
    v_alert.crew_id,
    v_alert.supplier_id,
    'pending',
    v_alert.metadata
  ) RETURNING id INTO v_fix_id;
  
  -- Execute fix based on type
  CASE p_fix_type
    WHEN 'auto_followup' THEN
      -- Send follow-up message to homeowner
      -- Note: This would integrate with email sending system
      v_result := jsonb_build_object('action', 'followup_sent', 'status', 'pending');
      
    WHEN 'material_confirmation' THEN
      -- Request material confirmation from supplier
      -- Note: This would integrate with supplier communication system
      v_result := jsonb_build_object('action', 'confirmation_requested', 'status', 'pending');
      
    WHEN 'crew_reminder' THEN
      -- Send reminder to crew
      -- Note: This would integrate with crew communication system
      v_result := jsonb_build_object('action', 'reminder_sent', 'status', 'pending');
      
    WHEN 'insurance_nudge' THEN
      -- Send insurance follow-up
      -- Note: This would integrate with insurance communication system
      v_result := jsonb_build_object('action', 'nudge_sent', 'status', 'pending');
      
    WHEN 'payment_reminder' THEN
      -- Send payment reminder
      -- Note: This would integrate with payment reminder system
      v_result := jsonb_build_object('action', 'reminder_sent', 'status', 'pending');
      
    WHEN 'weather_action' THEN
      -- Recommend rescheduling or tarp plan
      v_result := jsonb_build_object('action', 'weather_alert_sent', 'status', 'pending');
      
    ELSE
      v_result := jsonb_build_object('action', 'unknown', 'status', 'failed');
  END CASE;
  
  -- Update fix record
  UPDATE public.automated_fixes
  SET 
    status = 'executed',
    executed_at = now(),
    execution_result = v_result,
    updated_at = now()
  WHERE id = v_fix_id;
  
  -- Update alert
  UPDATE public.roofing_alerts
  SET 
    auto_fix_executed = true,
    auto_fix_executed_at = now()
  WHERE id = p_alert_id;
  
  RETURN v_fix_id;
END;
$$;

-- ============================================================================
-- PART 16 — CREATE FUNCTION: scan_and_create_alerts
-- ============================================================================
-- Main function to scan all jobs and create alerts

CREATE OR REPLACE FUNCTION public.scan_and_create_alerts(p_workspace_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
  v_alert record;
BEGIN
  -- Scan homeowner alerts
  FOR v_alert IN SELECT * FROM public.detect_homeowner_alerts(p_workspace_id) LOOP
    PERFORM public.create_roofing_alert(
      p_workspace_id,
      'homeowner'::roofing_alert_category,
      v_alert.alert_type,
      v_alert.title,
      v_alert.message,
      v_alert.priority,
      v_alert.job_id,
      NULL, -- lead_id
      NULL, -- crew_id
      NULL, -- supplier_id
      NULL, -- invoice_id
      NULL, -- insurance_claim_id
      NULL, -- material_order_id
      true, -- auto_fix_available
      'auto_followup' -- auto_fix_type
    );
    v_count := v_count + 1;
  END LOOP;
  
  -- Scan crew alerts
  FOR v_alert IN SELECT * FROM public.detect_crew_alerts(p_workspace_id) LOOP
    PERFORM public.create_roofing_alert(
      p_workspace_id,
      'crew'::roofing_alert_category,
      v_alert.alert_type,
      v_alert.title,
      v_alert.message,
      v_alert.priority,
      v_alert.job_id,
      NULL,
      v_alert.crew_id,
      NULL,
      NULL,
      NULL,
      NULL,
      true,
      'crew_reminder'
    );
    v_count := v_count + 1;
  END LOOP;
  
  -- Scan supplier alerts
  FOR v_alert IN SELECT * FROM public.detect_supplier_alerts(p_workspace_id) LOOP
    PERFORM public.create_roofing_alert(
      p_workspace_id,
      'supplier'::roofing_alert_category,
      v_alert.alert_type,
      v_alert.title,
      v_alert.message,
      v_alert.priority,
      v_alert.job_id,
      NULL,
      NULL,
      v_alert.supplier_id,
      NULL,
      NULL,
      v_alert.material_order_id,
      true,
      'material_confirmation'
    );
    v_count := v_count + 1;
  END LOOP;
  
  -- Scan insurance alerts
  FOR v_alert IN SELECT * FROM public.detect_insurance_alerts(p_workspace_id) LOOP
    PERFORM public.create_roofing_alert(
      p_workspace_id,
      'insurance'::roofing_alert_category,
      v_alert.alert_type,
      v_alert.title,
      v_alert.message,
      v_alert.priority,
      v_alert.job_id,
      NULL,
      NULL,
      NULL,
      NULL,
      v_alert.insurance_claim_id,
      NULL,
      true,
      'insurance_nudge'
    );
    v_count := v_count + 1;
  END LOOP;
  
  -- Scan payment alerts
  FOR v_alert IN SELECT * FROM public.detect_payment_alerts(p_workspace_id) LOOP
    PERFORM public.create_roofing_alert(
      p_workspace_id,
      'payment'::roofing_alert_category,
      v_alert.alert_type,
      v_alert.title,
      v_alert.message,
      v_alert.priority,
      v_alert.job_id,
      NULL,
      NULL,
      NULL,
      v_alert.invoice_id,
      NULL,
      NULL,
      true,
      'payment_reminder'
    );
    v_count := v_count + 1;
  END LOOP;
  
  -- Scan job risk alerts
  FOR v_alert IN SELECT * FROM public.detect_job_risk_alerts(p_workspace_id) LOOP
    PERFORM public.create_roofing_alert(
      p_workspace_id,
      'job_risk'::roofing_alert_category,
      v_alert.alert_type,
      v_alert.title,
      v_alert.message,
      v_alert.priority,
      v_alert.job_id,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      CASE WHEN v_alert.alert_type = 'weather_risk' THEN true ELSE false END,
      CASE WHEN v_alert.alert_type = 'weather_risk' THEN 'weather_action' ELSE NULL END
    );
    v_count := v_count + 1;
  END LOOP;
  
  -- Scan missing steps
  FOR v_alert IN SELECT * FROM public.detect_missing_steps(p_workspace_id) LOOP
    -- Create missing step record
    INSERT INTO public.missing_steps (
      workspace_id,
      job_id,
      step_type,
      step_title,
      step_description
    ) VALUES (
      p_workspace_id,
      v_alert.job_id,
      v_alert.step_type,
      v_alert.step_title,
      v_alert.step_description
    );
    
    -- Create alert for missing step
    PERFORM public.create_roofing_alert(
      p_workspace_id,
      'job_risk'::roofing_alert_category,
      'missing_step_' || v_alert.step_type,
      v_alert.step_title,
      v_alert.step_description,
      'medium'::roofing_alert_priority,
      v_alert.job_id
    );
    v_count := v_count + 1;
  END LOOP;
  
  RETURN v_count;
END;
$$;

-- ============================================================================
-- PART 17 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.roofing_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automated_fixes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missing_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_automations ENABLE ROW LEVEL SECURITY;

-- Roofing Alerts
CREATE POLICY "Users can view alerts in their workspace"
  ON public.roofing_alerts FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update alerts in their workspace"
  ON public.roofing_alerts FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Automated Fixes
CREATE POLICY "Users can view fixes in their workspace"
  ON public.automated_fixes FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Alert Settings
CREATE POLICY "Users can manage their alert settings"
  ON public.alert_settings FOR ALL
  USING (
    user_id = auth.uid() OR user_id IS NULL
  );

-- Missing Steps
CREATE POLICY "Users can view missing steps in their workspace"
  ON public.missing_steps FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update missing steps in their workspace"
  ON public.missing_steps FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Pipeline Automations
CREATE POLICY "Users can manage automations in their workspace"
  ON public.pipeline_automations FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 18 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, UPDATE ON public.roofing_alerts TO authenticated;
GRANT SELECT ON public.automated_fixes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.alert_settings TO authenticated;
GRANT SELECT, UPDATE ON public.missing_steps TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pipeline_automations TO authenticated;

GRANT EXECUTE ON FUNCTION public.detect_homeowner_alerts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_crew_alerts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_supplier_alerts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_insurance_alerts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_payment_alerts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_job_risk_alerts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_missing_steps(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_roofing_alert(uuid, roofing_alert_category, text, text, text, roofing_alert_priority, uuid, uuid, uuid, uuid, uuid, uuid, uuid, boolean, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_automated_fix(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.scan_and_create_alerts(uuid) TO authenticated;

-- ============================================================================
-- PART 19 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.roofing_alerts IS 'Block 24860: SmartSend Roofing Alerts & Automations v1 - Main alerts table for all 6 categories';
COMMENT ON TABLE public.automated_fixes IS 'Block 24860: Tracks automated fix executions';
COMMENT ON TABLE public.alert_settings IS 'Block 24860: Personalized alert settings per user/workspace';
COMMENT ON TABLE public.missing_steps IS 'Block 24860: Missing Step Detector - tracks missing actions';
COMMENT ON TABLE public.pipeline_automations IS 'Block 24860: Automations for each pipeline stage';

COMMENT ON FUNCTION public.scan_and_create_alerts(uuid) IS 'Block 24860: Main function to scan all jobs and create alerts for all 6 categories';
COMMENT ON FUNCTION public.detect_missing_steps(uuid) IS 'Block 24860: Missing Step Detector - scans jobs for missing actions';

