-- =========================================================
-- Block 20930 — SmartSend Deliverability Engine v1
-- (Domain Authentication • SPF/DKIM/DMARC Checks • Bounce Tracking • Inbox Placement Protection • Warm-Up Logic)
-- =========================================================

-- ============================================
-- 1) Enhance email_events table for bounce/complaint tracking
-- ============================================

-- Add missing columns to email_events if they don't exist
DO $$
BEGIN
  -- Add organization_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'email_events' 
    AND column_name = 'organization_id'
  ) THEN
    ALTER TABLE public.email_events 
      ADD COLUMN organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
  END IF;

  -- Add email_id if missing (reference to email_logs or similar)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'email_events' 
    AND column_name = 'email_id'
  ) THEN
    ALTER TABLE public.email_events 
      ADD COLUMN email_id uuid;
  END IF;

  -- Expand event_type to include bounce/complaint types
  -- This will be handled by dropping and recreating the constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'email_events_event_type_check'
  ) THEN
    ALTER TABLE public.email_events 
      DROP CONSTRAINT IF EXISTS email_events_event_type_check;
  END IF;
END $$;

-- Update event_type constraint to include all deliverability events
ALTER TABLE public.email_events 
  ADD CONSTRAINT email_events_event_type_check 
  CHECK (event_type IN (
    'delivered', 'bounced', 'complained', 'opened', 'clicked',
    'hard_bounce', 'soft_bounce', 'spam_complaint', 'unsubscribed',
    'open', 'click' -- Legacy support
  ));

-- Add timestamp column if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'email_events' 
    AND column_name = 'timestamp'
  ) THEN
    ALTER TABLE public.email_events 
      ADD COLUMN timestamp timestamptz DEFAULT now();
  END IF;
END $$;

-- Add indexes for deliverability queries
CREATE INDEX IF NOT EXISTS idx_email_events_org ON public.email_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_email_events_email_id ON public.email_events(email_id);
CREATE INDEX IF NOT EXISTS idx_email_events_timestamp ON public.email_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_type_timestamp ON public.email_events(event_type, timestamp DESC);

-- ============================================
-- 2) Enhance domain_settings with DNS record details
-- ============================================

-- Add DNS record details columns
DO $$
BEGIN
  -- SPF record details
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'domain_settings' 
    AND column_name = 'spf_record'
  ) THEN
    ALTER TABLE public.domain_settings 
      ADD COLUMN spf_record text;
  END IF;

  -- DKIM record details
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'domain_settings' 
    AND column_name = 'dkim_record'
  ) THEN
    ALTER TABLE public.domain_settings 
      ADD COLUMN dkim_record text;
  END IF;

  -- DMARC record details
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'domain_settings' 
    AND column_name = 'dmarc_record'
  ) THEN
    ALTER TABLE public.domain_settings 
      ADD COLUMN dmarc_record text;
  END IF;

  -- DNS check status (pass/warn/fail)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'domain_settings' 
    AND column_name = 'spf_status'
  ) THEN
    ALTER TABLE public.domain_settings 
      ADD COLUMN spf_status text DEFAULT 'fail' CHECK (spf_status IN ('pass', 'warn', 'fail'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'domain_settings' 
    AND column_name = 'dkim_status'
  ) THEN
    ALTER TABLE public.domain_settings 
      ADD COLUMN dkim_status text DEFAULT 'fail' CHECK (dkim_status IN ('pass', 'warn', 'fail'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'domain_settings' 
    AND column_name = 'dmarc_status'
  ) THEN
    ALTER TABLE public.domain_settings 
      ADD COLUMN dmarc_status text DEFAULT 'fail' CHECK (dmarc_status IN ('pass', 'warn', 'fail'));
  END IF;
END $$;

-- ============================================
-- 3) Enhance warm-up logic with Block 20930 requirements
-- ============================================

-- Update domain_warmup_state with enhanced warm-up schedule
DO $$
BEGIN
  -- Update warmup_schedule column to support the new structure
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'domain_warmup_state' 
    AND column_name = 'warmup_schedule'
  ) THEN
    -- Column exists, we'll update via function
    NULL;
  ELSE
    ALTER TABLE public.domain_warmup_state 
      ADD COLUMN warmup_schedule jsonb DEFAULT '[]'::jsonb;
  END IF;

  -- Add plan-based limits
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'domain_warmup_state' 
    AND column_name = 'plan_type'
  ) THEN
    ALTER TABLE public.domain_warmup_state 
      ADD COLUMN plan_type text DEFAULT 'starter' CHECK (plan_type IN ('starter', 'growth', 'domination'));
  END IF;

  -- Add warm-up progress percentage
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'domain_warmup_state' 
    AND column_name = 'progress_percentage'
  ) THEN
    ALTER TABLE public.domain_warmup_state 
      ADD COLUMN progress_percentage numeric(5,2) DEFAULT 0.0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100);
  END IF;
END $$;

-- ============================================
-- 4) Create deliverability_score table for daily/weekly scores
-- ============================================

CREATE TABLE IF NOT EXISTS public.deliverability_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_settings_id uuid NOT NULL REFERENCES public.domain_settings(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Score (0-100)
  score numeric(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  
  -- Score components
  bounce_rate numeric(5,2) DEFAULT 0.0,
  complaint_rate numeric(5,2) DEFAULT 0.0,
  dkim_score numeric(5,2) DEFAULT 0.0, -- 0 or 1 (pass/fail)
  spf_score numeric(5,2) DEFAULT 0.0,   -- 0 or 1 (pass/fail)
  warmup_stage_score numeric(5,2) DEFAULT 0.0, -- 0-1 based on warmup completion
  
  -- Period type
  period_type text NOT NULL CHECK (period_type IN ('daily', 'weekly')),
  
  -- Period date (date for daily, start of week for weekly)
  period_date date NOT NULL,
  
  -- Timestamps
  calculated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  
  UNIQUE(domain_settings_id, period_type, period_date)
);

CREATE INDEX IF NOT EXISTS idx_deliverability_scores_domain ON public.deliverability_scores(domain_settings_id);
CREATE INDEX IF NOT EXISTS idx_deliverability_scores_org ON public.deliverability_scores(organization_id);
CREATE INDEX IF NOT EXISTS idx_deliverability_scores_period ON public.deliverability_scores(period_type, period_date DESC);

-- ============================================
-- 5) Function: Check DNS Records (SPF/DKIM/DMARC)
-- ============================================

CREATE OR REPLACE FUNCTION public.check_domain_dns(
  p_domain text,
  p_dkim_selector text DEFAULT 'smartsend'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_spf_status text := 'fail';
  v_dkim_status text := 'fail';
  v_dmarc_status text := 'fail';
  v_spf_record text;
  v_dkim_record text;
  v_dmarc_record text;
BEGIN
  -- This function will be called from API endpoint that performs actual DNS lookups
  -- For now, return structure that API will populate
  v_result := jsonb_build_object(
    'domain', p_domain,
    'spf', jsonb_build_object(
      'status', v_spf_status,
      'record', v_spf_record,
      'checked_at', now()
    ),
    'dkim', jsonb_build_object(
      'status', v_dkim_status,
      'record', v_dkim_record,
      'selector', p_dkim_selector,
      'checked_at', now()
    ),
    'dmarc', jsonb_build_object(
      'status', v_dmarc_status,
      'record', v_dmarc_record,
      'checked_at', now()
    )
  );
  
  RETURN v_result;
END;
$$;

-- ============================================
-- 6) Function: Calculate Deliverability Score (Block 20930 formula)
-- ============================================

CREATE OR REPLACE FUNCTION public.calculate_deliverability_score_v2(
  p_domain_settings_id uuid,
  p_period_type text DEFAULT 'daily'
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score numeric := 0.0;
  v_bounce_rate numeric := 0.0;
  v_complaint_rate numeric := 0.0;
  v_dkim_score numeric := 0.0;
  v_spf_score numeric := 0.0;
  v_warmup_stage_score numeric := 0.0;
  v_domain_settings record;
  v_org_id uuid;
  v_period_start timestamptz;
  v_total_sent bigint := 0;
  v_total_bounced bigint := 0;
  v_total_complained bigint := 0;
BEGIN
  -- Get domain settings
  SELECT * INTO v_domain_settings
  FROM public.domain_settings
  WHERE id = p_domain_settings_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  v_org_id := v_domain_settings.org_id;
  
  -- Determine period start
  IF p_period_type = 'daily' THEN
    v_period_start := date_trunc('day', now());
  ELSE
    v_period_start := date_trunc('week', now());
  END IF;
  
  -- Calculate bounce rate
  SELECT 
    COUNT(*) FILTER (WHERE event_type IN ('bounced', 'hard_bounce', 'soft_bounce')),
    COUNT(*) FILTER (WHERE event_type = 'delivered')
  INTO v_total_bounced, v_total_sent
  FROM public.email_events
  WHERE organization_id = v_org_id
    AND timestamp >= v_period_start;
  
  v_total_sent := GREATEST(v_total_sent + v_total_bounced, 1); -- Avoid division by zero
  v_bounce_rate := (v_total_bounced::numeric / v_total_sent::numeric) * 100.0;
  
  -- Calculate complaint rate
  SELECT COUNT(*)
  INTO v_total_complained
  FROM public.email_events
  WHERE organization_id = v_org_id
    AND event_type IN ('complained', 'spam_complaint')
    AND timestamp >= v_period_start;
  
  v_complaint_rate := (v_total_complained::numeric / v_total_sent::numeric) * 100.0;
  
  -- DNS scores (0 or 1)
  v_spf_score := CASE WHEN v_domain_settings.spf_pass THEN 1.0 ELSE 0.0 END;
  v_dkim_score := CASE WHEN v_domain_settings.dkim_pass THEN 1.0 ELSE 0.0 END;
  
  -- Warmup stage score (0-1, based on completion)
  SELECT 
    CASE 
      WHEN warmup_status = 'completed' THEN 1.0
      WHEN warmup_status = 'warming' THEN (warmup_stage::numeric / 15.0) -- 15 days = complete
      ELSE 0.0
    END
  INTO v_warmup_stage_score
  FROM public.domain_warmup_state
  WHERE domain_settings_id = p_domain_settings_id;
  
  -- Block 20930 formula:
  -- deliverability_score = (1 - bounce_rate*4) * (1 - complaint_rate*10) * dkim_score * spf_score * warmup_stage
  v_score := 
    (1.0 - LEAST(v_bounce_rate * 0.04, 0.99)) *  -- bounce_rate*4 means 25% bounce = 0 score
    (1.0 - LEAST(v_complaint_rate * 0.10, 0.99)) * -- complaint_rate*10 means 10% complaint = 0 score
    GREATEST(v_dkim_score, 0.5) * -- Minimum 0.5 if DKIM fails (partial penalty)
    GREATEST(v_spf_score, 0.5) *   -- Minimum 0.5 if SPF fails (partial penalty)
    GREATEST(v_warmup_stage_score, 0.3); -- Minimum 0.3 if not warmed up
  
  -- Convert to 0-100 scale
  v_score := v_score * 100.0;
  
  -- Ensure score is between 0 and 100
  v_score := GREATEST(0, LEAST(100, v_score));
  
  RETURN v_score;
END;
$$;

-- ============================================
-- 7) Function: Update Warm-Up Progress (Enhanced)
-- ============================================

CREATE OR REPLACE FUNCTION public.update_warmup_progress_v2(p_domain_settings_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_warmup_state record;
  v_today date;
  v_emails_sent_today int;
  v_current_stage int;
  v_progress_percentage numeric;
  v_days_since_start int;
  v_result jsonb;
BEGIN
  v_today := CURRENT_DATE;
  
  -- Get warmup state
  SELECT * INTO v_warmup_state
  FROM public.domain_warmup_state
  WHERE domain_settings_id = p_domain_settings_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'warmup_state_not_found');
  END IF;
  
  -- Calculate days since warmup started
  v_days_since_start := EXTRACT(DAY FROM (v_today - v_warmup_state.started_at::date))::int + 1;
  
  -- Reset daily counter if new day
  IF v_warmup_state.last_sent_at::date < v_today THEN
    UPDATE public.domain_warmup_state
    SET emails_sent_today = 0,
        updated_at = now()
    WHERE id = v_warmup_state.id;
  END IF;
  
  -- Block 20930 Warm-Up Schedule:
  -- DAY 1-3: 15-25 emails/day
  -- DAY 4-7: 30-50/day
  -- DAY 8-14: 75-150/day
  -- DAY 15+: Unlimited per plan
  
  -- Determine current daily limit based on stage
  IF v_days_since_start <= 3 THEN
    v_current_stage := v_days_since_start;
    v_warmup_state.current_daily_limit := 20; -- Start at 20, ramp to 25
  ELSIF v_days_since_start <= 7 THEN
    v_current_stage := v_days_since_start;
    v_warmup_state.current_daily_limit := 40; -- Ramp to 50
  ELSIF v_days_since_start <= 14 THEN
    v_current_stage := v_days_since_start;
    v_warmup_state.current_daily_limit := 100; -- Ramp to 150
  ELSE
    -- Day 15+: Apply plan limits
    v_current_stage := 15;
    CASE v_warmup_state.plan_type
      WHEN 'starter' THEN v_warmup_state.current_daily_limit := 150;
      WHEN 'growth' THEN v_warmup_state.current_daily_limit := 300;
      WHEN 'domination' THEN v_warmup_state.current_daily_limit := 500;
      ELSE v_warmup_state.current_daily_limit := 150;
    END CASE;
  END IF;
  
  -- Calculate progress percentage
  IF v_days_since_start >= 15 THEN
    v_progress_percentage := 100.0;
  ELSE
    v_progress_percentage := (v_days_since_start::numeric / 15.0) * 100.0;
  END IF;
  
  -- Update warmup state
  UPDATE public.domain_warmup_state
  SET 
    warmup_stage = v_current_stage,
    current_daily_limit = v_warmup_state.current_daily_limit,
    progress_percentage = v_progress_percentage,
    warmup_status = CASE 
      WHEN v_days_since_start >= 15 THEN 'completed'
      WHEN v_warmup_state.warmup_status = 'idle' THEN 'warming'
      ELSE v_warmup_state.warmup_status
    END,
    completed_at = CASE 
      WHEN v_days_since_start >= 15 AND v_warmup_state.completed_at IS NULL THEN now()
      ELSE v_warmup_state.completed_at
    END,
    updated_at = now()
  WHERE id = v_warmup_state.id;
  
  v_result := jsonb_build_object(
    'warmup_stage', v_current_stage,
    'current_daily_limit', v_warmup_state.current_daily_limit,
    'progress_percentage', v_progress_percentage,
    'days_since_start', v_days_since_start,
    'status', CASE WHEN v_days_since_start >= 15 THEN 'completed' ELSE 'warming' END
  );
  
  RETURN v_result;
END;
$$;

-- ============================================
-- 8) Function: Auto-Pause Domain (Enhanced)
-- ============================================

CREATE OR REPLACE FUNCTION public.auto_pause_domain_v2(p_domain_settings_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_domain_settings record;
  v_bounce_rate numeric;
  v_complaint_rate numeric;
  v_spf_pass boolean;
  v_dkim_pass boolean;
  v_dmarc_pass boolean;
  v_org_id uuid;
  v_total_sent bigint;
  v_total_bounced bigint;
  v_total_complained bigint;
  v_pause_reason text;
  v_should_pause boolean := false;
BEGIN
  -- Get domain settings
  SELECT * INTO v_domain_settings
  FROM public.domain_settings
  WHERE id = p_domain_settings_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'domain_not_found');
  END IF;
  
  v_org_id := v_domain_settings.org_id;
  v_spf_pass := COALESCE(v_domain_settings.spf_pass, false);
  v_dkim_pass := COALESCE(v_domain_settings.dkim_pass, false);
  v_dmarc_pass := COALESCE(v_domain_settings.dmarc_pass, false);
  
  -- Calculate bounce rate (last 24 hours)
  SELECT 
    COUNT(*) FILTER (WHERE event_type IN ('bounced', 'hard_bounce', 'soft_bounce')),
    COUNT(*) FILTER (WHERE event_type = 'delivered')
  INTO v_total_bounced, v_total_sent
  FROM public.email_events
  WHERE organization_id = v_org_id
    AND timestamp >= now() - interval '24 hours';
  
  IF v_total_sent > 0 THEN
    v_bounce_rate := (v_total_bounced::numeric / (v_total_sent + v_total_bounced)::numeric) * 100.0;
  ELSE
    v_bounce_rate := 0.0;
  END IF;
  
  -- Calculate complaint rate (last 24 hours)
  SELECT COUNT(*)
  INTO v_total_complained
  FROM public.email_events
  WHERE organization_id = v_org_id
    AND event_type IN ('complained', 'spam_complaint')
    AND timestamp >= now() - interval '24 hours';
  
  IF v_total_sent > 0 THEN
    v_complaint_rate := (v_total_complained::numeric / (v_total_sent + v_total_complained)::numeric) * 100.0;
  ELSE
    v_complaint_rate := 0.0;
  END IF;
  
  -- Block 20930 Auto-Pause Rules:
  -- 1. Bounce rate > 5%
  -- 2. Complaint rate > 0.3%
  -- 3. SPF/DKIM fail
  -- 4. DMARC missing AND bounce rate rising
  
  IF v_bounce_rate > 5.0 THEN
    v_should_pause := true;
    v_pause_reason := format('Bounce rate exceeded safety limit: %.2f%% (limit: 5%%)', v_bounce_rate);
  ELSIF v_complaint_rate > 0.3 THEN
    v_should_pause := true;
    v_pause_reason := format('Complaint rate exceeded safety limit: %.2f%% (limit: 0.3%%)', v_complaint_rate);
  ELSIF NOT v_spf_pass OR NOT v_dkim_pass THEN
    v_should_pause := true;
    v_pause_reason := format('Domain authentication failed: SPF=%s, DKIM=%s', 
      CASE WHEN v_spf_pass THEN 'PASS' ELSE 'FAIL' END,
      CASE WHEN v_dkim_pass THEN 'PASS' ELSE 'FAIL' END);
  ELSIF NOT v_dmarc_pass AND v_bounce_rate > 2.0 THEN
    v_should_pause := true;
    v_pause_reason := format('DMARC missing and bounce rate rising: %.2f%%', v_bounce_rate);
  END IF;
  
  -- Update domain_settings if should pause
  IF v_should_pause AND NOT v_domain_settings.sending_paused THEN
    UPDATE public.domain_settings
    SET 
      sending_paused = true,
      pause_reason = v_pause_reason,
      updated_at = now()
    WHERE id = p_domain_settings_id;
    
    -- Log event
    INSERT INTO public.deliverability_events (
      domain_settings_id, org_id, event_type, severity, message, event_data
    ) VALUES (
      p_domain_settings_id, v_org_id, 'sending_paused', 'critical',
      v_pause_reason,
      jsonb_build_object(
        'bounce_rate', v_bounce_rate,
        'complaint_rate', v_complaint_rate,
        'spf_pass', v_spf_pass,
        'dkim_pass', v_dkim_pass,
        'dmarc_pass', v_dmarc_pass
      )
    );
  END IF;
  
  RETURN jsonb_build_object(
    'paused', v_should_pause,
    'reason', v_pause_reason,
    'bounce_rate', v_bounce_rate,
    'complaint_rate', v_complaint_rate,
    'spf_pass', v_spf_pass,
    'dkim_pass', v_dkim_pass,
    'dmarc_pass', v_dmarc_pass
  );
END;
$$;

-- ============================================
-- 9) Function: Increment Warmup Sent Count
-- ============================================

CREATE OR REPLACE FUNCTION public.increment_warmup_sent(p_domain_settings_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_warmup_state record;
  v_today date;
BEGIN
  v_today := CURRENT_DATE;
  
  -- Get warmup state
  SELECT * INTO v_warmup_state
  FROM public.domain_warmup_state
  WHERE domain_settings_id = p_domain_settings_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Reset if new day
  IF v_warmup_state.last_sent_at::date < v_today THEN
    UPDATE public.domain_warmup_state
    SET 
      emails_sent_today = 1,
      last_sent_at = now(),
      updated_at = now()
    WHERE id = v_warmup_state.id;
  ELSE
    -- Increment counter
    UPDATE public.domain_warmup_state
    SET 
      emails_sent_today = emails_sent_today + 1,
      emails_sent_total = emails_sent_total + 1,
      last_sent_at = now(),
      updated_at = now()
    WHERE id = v_warmup_state.id;
  END IF;
END;
$$;

-- ============================================
-- 10) Function: Get Deliverability Status for UI
-- ============================================

CREATE OR REPLACE FUNCTION public.get_deliverability_status(p_domain_settings_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_domain_settings record;
  v_domain_health record;
  v_warmup_state record;
  v_score numeric;
  v_bounce_rate numeric;
  v_complaint_rate numeric;
  v_result jsonb;
BEGIN
  -- Get domain settings
  SELECT * INTO v_domain_settings
  FROM public.domain_settings
  WHERE id = p_domain_settings_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'domain_not_found');
  END IF;
  
  -- Get domain health
  SELECT * INTO v_domain_health
  FROM public.domain_health
  WHERE domain_settings_id = p_domain_settings_id;
  
  -- Get warmup state
  SELECT * INTO v_warmup_state
  FROM public.domain_warmup_state
  WHERE domain_settings_id = p_domain_settings_id;
  
  -- Calculate current score
  v_score := public.calculate_deliverability_score_v2(p_domain_settings_id, 'daily');
  
  -- Get bounce/complaint rates (30 days)
  SELECT 
    COUNT(*) FILTER (WHERE event_type IN ('bounced', 'hard_bounce', 'soft_bounce')),
    COUNT(*) FILTER (WHERE event_type = 'delivered')
  INTO v_bounce_rate, v_result
  FROM public.email_events
  WHERE organization_id = v_domain_settings.org_id
    AND timestamp >= now() - interval '30 days';
  
  -- Build result
  v_result := jsonb_build_object(
    'domain', v_domain_settings.domain,
    'score', v_score,
    'score_label', CASE
      WHEN v_score >= 85 THEN 'Excellent'
      WHEN v_score >= 70 THEN 'Good'
      WHEN v_score >= 55 THEN 'Caution'
      ELSE 'Danger'
    END,
    'spf', jsonb_build_object(
      'status', COALESCE(v_domain_settings.spf_status, CASE WHEN v_domain_settings.spf_pass THEN 'pass' ELSE 'fail' END),
      'pass', v_domain_settings.spf_pass,
      'record', v_domain_settings.spf_record
    ),
    'dkim', jsonb_build_object(
      'status', COALESCE(v_domain_settings.dkim_status, CASE WHEN v_domain_settings.dkim_pass THEN 'pass' ELSE 'fail' END),
      'pass', v_domain_settings.dkim_pass,
      'record', v_domain_settings.dkim_record
    ),
    'dmarc', jsonb_build_object(
      'status', COALESCE(v_domain_settings.dmarc_status, CASE WHEN v_domain_settings.dmarc_pass THEN 'pass' ELSE 'warn' END),
      'pass', v_domain_settings.dmarc_pass,
      'record', v_domain_settings.dmarc_record
    ),
    'warmup', jsonb_build_object(
      'status', COALESCE(v_warmup_state.warmup_status, 'idle'),
      'progress', COALESCE(v_warmup_state.progress_percentage, 0),
      'current_limit', COALESCE(v_warmup_state.current_daily_limit, 0),
      'stage', COALESCE(v_warmup_state.warmup_stage, 0)
    ),
    'bounce_rate_30d', v_bounce_rate,
    'complaint_rate_30d', v_complaint_rate,
    'sending_paused', COALESCE(v_domain_settings.sending_paused, false),
    'pause_reason', v_domain_settings.pause_reason
  );
  
  RETURN v_result;
END;
$$;

-- ============================================
-- 10) RLS Policies
-- ============================================

ALTER TABLE public.deliverability_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view deliverability scores for their org"
  ON public.deliverability_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_memberships
      WHERE org_id = deliverability_scores.organization_id
      AND user_id = auth.uid()
      AND status = 'active'
    )
  );

CREATE POLICY "Service role can manage deliverability scores"
  ON public.deliverability_scores FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ============================================
-- 11) Comments
-- ============================================

COMMENT ON FUNCTION public.check_domain_dns IS 'DNS checker for SPF/DKIM/DMARC records. Called from API endpoint that performs actual DNS lookups.';
COMMENT ON FUNCTION public.calculate_deliverability_score_v2 IS 'Block 20930 deliverability score formula: (1 - bounce_rate*4) * (1 - complaint_rate*10) * dkim_score * spf_score * warmup_stage';
COMMENT ON FUNCTION public.update_warmup_progress_v2 IS 'Enhanced warm-up logic: DAY 1-3 (15-25/day), DAY 4-7 (30-50/day), DAY 8-14 (75-150/day), DAY 15+ (plan limits)';
COMMENT ON FUNCTION public.auto_pause_domain_v2 IS 'Auto-pause domain when bounce > 5%, complaint > 0.3%, SPF/DKIM fail, or DMARC missing with rising bounce rate';
COMMENT ON FUNCTION public.get_deliverability_status IS 'Returns comprehensive deliverability status for UI display';

