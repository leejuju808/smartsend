-- =========================================================
-- Block 15500 — SmartSend Outbound Engine v2
-- (The Smarter, Safer, Faster Email Sending Core)
-- =========================================================

-- ============================================
-- 1) Enhance campaign_send_queue with v2 fields
-- ============================================

-- Add priority column (1-5, where 1 is highest priority)
ALTER TABLE public.campaign_send_queue
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 3
    CHECK (priority >= 1 AND priority <= 5);

-- Add step_number for sequence tracking
ALTER TABLE public.campaign_send_queue
  ADD COLUMN IF NOT EXISTS step_number integer;

-- Add contact_id if not exists (for bounce-aware rerouting)
ALTER TABLE public.campaign_send_queue
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

-- Add retry_count (separate from attempts for tracking retry attempts)
ALTER TABLE public.campaign_send_queue
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

-- Add next_retry_at for scheduled retries
ALTER TABLE public.campaign_send_queue
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

-- Add suppressed flag for bounce-aware rerouting
ALTER TABLE public.campaign_send_queue
  ADD COLUMN IF NOT EXISTS suppressed boolean NOT NULL DEFAULT false;

-- Add suppression_reason
ALTER TABLE public.campaign_send_queue
  ADD COLUMN IF NOT EXISTS suppression_reason text;

-- Add provider_account_id for account tracking
ALTER TABLE public.campaign_send_queue
  ADD COLUMN IF NOT EXISTS provider_account_id uuid;

-- Create indexes for priority queueing
CREATE INDEX IF NOT EXISTS idx_campaign_send_queue_priority 
  ON public.campaign_send_queue(priority, scheduled_at, status)
  WHERE status IN ('pending', 'retry', 'queued', 'scheduled', 'throttled');

CREATE INDEX IF NOT EXISTS idx_campaign_send_queue_retry 
  ON public.campaign_send_queue(next_retry_at, status)
  WHERE status = 'retry' AND next_retry_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_send_queue_contact 
  ON public.campaign_send_queue(contact_id, suppressed)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_send_queue_step 
  ON public.campaign_send_queue(campaign_id, contact_id, step_number)
  WHERE step_number IS NOT NULL;

-- ============================================
-- 2) Add warmup and send rate fields to company_settings
-- ============================================

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS max_send_rate integer DEFAULT 200, -- emails per hour
  ADD COLUMN IF NOT EXISTS warmup_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS warmup_stage integer NOT NULL DEFAULT 0, -- 0-8 (0 = not warming, 1-8 = day number)
  ADD COLUMN IF NOT EXISTS warmup_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS domain_health_score numeric(5,2) DEFAULT 85.0 CHECK (domain_health_score >= 0 AND domain_health_score <= 100);

CREATE INDEX IF NOT EXISTS idx_company_settings_warmup 
  ON public.company_settings(workspace_id, warmup_active, warmup_stage);

-- ============================================
-- 3) Create contact suppression tracking table
-- ============================================

CREATE TABLE IF NOT EXISTS public.contact_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  email text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('bounce', 'complaint', 'temp_block', 'deliverability_warning')),
  suppressed_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz, -- NULL = permanent suppression
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, contact_id, reason)
);

CREATE INDEX IF NOT EXISTS idx_contact_suppressions_lookup 
  ON public.contact_suppressions(workspace_id, contact_id, suppressed_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_suppressions_email 
  ON public.contact_suppressions(workspace_id, email, suppressed_at DESC);

-- ============================================
-- 4) Create deliverability_events table for logging
-- ============================================

CREATE TABLE IF NOT EXISTS public.deliverability_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('throttle_slow', 'throttle_pause', 'warmup_limit_reached', 'bounce_detected', 'complaint_detected', 'domain_health_warning', 'retry_scheduled', 'suppression_added')),
  event_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deliverability_events_workspace 
  ON public.deliverability_events(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_deliverability_events_campaign 
  ON public.deliverability_events(campaign_id, created_at DESC);

-- ============================================
-- 5) Enhanced priority queue function (v2)
-- ============================================

CREATE OR REPLACE FUNCTION public.lock_send_queue_batch_v2(
  p_worker_id uuid,
  p_limit integer DEFAULT 25,
  p_workspace_id uuid DEFAULT NULL
)
RETURNS SETOF public.campaign_send_queue
LANGUAGE plpgsql
AS $$
DECLARE
  v_domain_health numeric(5,2);
  v_warmup_active boolean;
  v_warmup_stage integer;
  v_max_send_rate integer;
  v_sent_today integer;
  v_warmup_limit integer;
BEGIN
  -- Get workspace settings if workspace_id provided
  IF p_workspace_id IS NOT NULL THEN
    SELECT 
      cs.domain_health_score,
      cs.warmup_active,
      cs.warmup_stage,
      cs.max_send_rate,
      -- Count sends today (approximate)
      (SELECT COUNT(*) FROM public.campaign_send_queue 
       WHERE workspace_id = p_workspace_id 
       AND status = 'sent' 
       AND sent_at::date = CURRENT_DATE)
    INTO v_domain_health, v_warmup_active, v_warmup_stage, v_max_send_rate, v_sent_today
    FROM public.company_settings cs
    WHERE cs.workspace_id = p_workspace_id;
  END IF;

  -- Calculate warmup limit if active
  IF v_warmup_active AND v_warmup_stage > 0 AND v_warmup_stage <= 8 THEN
    v_warmup_limit := CASE v_warmup_stage
      WHEN 1 THEN 20
      WHEN 2 THEN 30
      WHEN 3 THEN 40
      WHEN 4 THEN 50
      WHEN 5 THEN 75
      WHEN 6 THEN 100
      WHEN 7 THEN 150
      ELSE NULL -- Day 8+ = no limit
    END;
  END IF;

  -- Update and return batch with priority ordering
  RETURN QUERY
  UPDATE public.campaign_send_queue q
  SET
    status = 'processing',
    locked_at = now(),
    worker_id = p_worker_id,
    attempts = COALESCE(q.attempts, 0) + 1
  WHERE q.id IN (
    SELECT id
    FROM public.campaign_send_queue
    WHERE status IN ('pending', 'retry', 'queued', 'scheduled', 'throttled')
      AND (scheduled_at IS NULL OR scheduled_at <= now())
      AND (next_retry_at IS NULL OR next_retry_at <= now())
      AND COALESCE(attempts, 0) < COALESCE(max_attempts, 3)
      AND suppressed = false
      AND (p_workspace_id IS NULL OR workspace_id = p_workspace_id)
      -- Warmup limit check
      AND (
        v_warmup_limit IS NULL 
        OR v_sent_today < v_warmup_limit
      )
    ORDER BY 
      priority ASC, -- Priority 1 (follow-ups) first
      scheduled_at NULLS FIRST,
      created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  RETURNING *;
END;
$$;

-- ============================================
-- 6) Function to calculate adaptive throttle rate
-- ============================================

CREATE OR REPLACE FUNCTION public.calculate_send_rate(
  p_workspace_id uuid
)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_domain_health numeric(5,2);
  v_max_rate integer;
  v_warmup_active boolean;
  v_warmup_stage integer;
  v_sent_today integer;
  v_warmup_limit integer;
BEGIN
  -- Get workspace settings
  SELECT 
    cs.domain_health_score,
    cs.max_send_rate,
    cs.warmup_active,
    cs.warmup_stage
  INTO v_domain_health, v_max_rate, v_warmup_active, v_warmup_stage
  FROM public.company_settings cs
  WHERE cs.workspace_id = p_workspace_id;

  -- Default values if not found
  v_domain_health := COALESCE(v_domain_health, 85.0);
  v_max_rate := COALESCE(v_max_rate, 200);

  -- Adaptive throttling based on domain health
  IF v_domain_health < 60 THEN
    -- Slow mode: 50 emails/hour
    RETURN 50;
  ELSIF v_domain_health < 70 THEN
    -- Reduced mode: 100 emails/hour
    RETURN 100;
  ELSIF v_domain_health < 85 THEN
    -- Normal mode: 150 emails/hour
    RETURN 150;
  ELSE
    -- Full mode: max_send_rate
    RETURN v_max_rate;
  END IF;
END;
$$;

-- ============================================
-- 7) Function to suppress contact (bounce-aware rerouting)
-- ============================================

CREATE OR REPLACE FUNCTION public.suppress_contact(
  p_workspace_id uuid,
  p_contact_id uuid,
  p_email text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Add to suppression table
  INSERT INTO public.contact_suppressions (
    workspace_id,
    contact_id,
    email,
    reason,
    suppressed_at
  )
  VALUES (
    p_workspace_id,
    p_contact_id,
    p_email,
    p_reason,
    now()
  )
  ON CONFLICT (workspace_id, contact_id, reason) DO NOTHING;

  -- Mark all pending queue items for this contact as suppressed
  UPDATE public.campaign_send_queue
  SET 
    suppressed = true,
    suppression_reason = p_reason,
    status = 'failed'
  WHERE workspace_id = p_workspace_id
    AND contact_id = p_contact_id
    AND status IN ('pending', 'retry', 'queued', 'scheduled', 'throttled');

  -- Log deliverability event
  INSERT INTO public.deliverability_events (
    workspace_id,
    contact_id,
    event_type,
    event_data
  )
  VALUES (
    p_workspace_id,
    p_contact_id,
    'suppression_added',
    jsonb_build_object('reason', p_reason, 'email', p_email)
  );
END;
$$;

-- ============================================
-- 8) Function to check if contact is suppressed
-- ============================================

CREATE OR REPLACE FUNCTION public.is_contact_suppressed(
  p_workspace_id uuid,
  p_contact_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contact_suppressions
    WHERE workspace_id = p_workspace_id
      AND contact_id = p_contact_id
      AND (expires_at IS NULL OR expires_at > now())
  );
$$;

-- ============================================
-- 9) Function to schedule retry with exponential backoff
-- ============================================

CREATE OR REPLACE FUNCTION public.schedule_retry(
  p_queue_id uuid,
  p_retry_count integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_next_retry timestamptz;
BEGIN
  -- Calculate next retry time based on retry count
  -- Retry #1 → after 5 minutes
  -- Retry #2 → after 15 minutes
  -- Retry #3 → after 1 hour
  -- Retry #4 → after 6 hours
  CASE p_retry_count
    WHEN 1 THEN v_next_retry := now() + interval '5 minutes';
    WHEN 2 THEN v_next_retry := now() + interval '15 minutes';
    WHEN 3 THEN v_next_retry := now() + interval '1 hour';
    WHEN 4 THEN v_next_retry := now() + interval '6 hours';
    ELSE v_next_retry := NULL; -- Max retries reached
  END CASE;

  IF v_next_retry IS NOT NULL THEN
    UPDATE public.campaign_send_queue
    SET
      status = 'retry',
      next_retry_at = v_next_retry,
      retry_count = p_retry_count,
      locked_at = NULL,
      worker_id = NULL
    WHERE id = p_queue_id;
  ELSE
    -- Max retries reached, mark as failed
    UPDATE public.campaign_send_queue
    SET
      status = 'failed',
      last_error = 'Max retries exceeded',
      locked_at = NULL,
      worker_id = NULL
    WHERE id = p_queue_id;
  END IF;
END;
$$;

-- ============================================
-- 10) Function to check sequence chaining (prevent Step 2 if Step 1 failed)
-- ============================================

CREATE OR REPLACE FUNCTION public.can_send_sequence_step(
  p_campaign_id uuid,
  p_contact_id uuid,
  p_step_number integer
)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  -- If step_number is 1, always allow
  -- If step_number > 1, check that previous step was sent successfully
  SELECT CASE
    WHEN p_step_number <= 1 THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.campaign_send_queue
      WHERE campaign_id = p_campaign_id
        AND contact_id = p_contact_id
        AND step_number = p_step_number - 1
        AND status = 'sent'
    )
  END;
$$;

-- ============================================
-- 11) RLS Policies
-- ============================================

ALTER TABLE public.contact_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliverability_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "contact_suppressions_read"
ON public.contact_suppressions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = contact_suppressions.workspace_id
      AND user_id = auth.uid()
  )
);

CREATE POLICY IF NOT EXISTS "deliverability_events_read"
ON public.deliverability_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = deliverability_events.workspace_id
      AND user_id = auth.uid()
  )
);

-- ============================================
-- 12) Comments
-- ============================================

COMMENT ON COLUMN public.campaign_send_queue.priority IS 'Priority level: 1=Follow-Ups (HOT), 2=Replies Requiring Next Step, 3=New Campaign Sends, 4=Secondary Campaign Steps, 5=Low-Quality Follow-Ups';
COMMENT ON COLUMN public.campaign_send_queue.step_number IS 'Sequence step number (1, 2, 3, etc.) for chaining logic';
COMMENT ON COLUMN public.campaign_send_queue.retry_count IS 'Number of retry attempts (separate from attempts which includes initial attempt)';
COMMENT ON COLUMN public.campaign_send_queue.next_retry_at IS 'When to retry this job (exponential backoff)';
COMMENT ON COLUMN public.campaign_send_queue.suppressed IS 'True if contact is suppressed due to bounce/complaint';
COMMENT ON COLUMN public.company_settings.max_send_rate IS 'Maximum emails per hour when domain health is excellent';
COMMENT ON COLUMN public.company_settings.warmup_active IS 'True if domain is currently in warmup phase';
COMMENT ON COLUMN public.company_settings.warmup_stage IS 'Warmup day number (1-8, 0 = not warming)';
COMMENT ON COLUMN public.company_settings.domain_health_score IS 'Domain health score (0-100) used for adaptive throttling';

