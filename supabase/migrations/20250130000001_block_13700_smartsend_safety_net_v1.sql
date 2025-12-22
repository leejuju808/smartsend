-- =========================================================
-- Block 13700 — SmartSend Safety Net v1
-- (The Hard Bounce, Unsubscribe & Complaint Shield That Protects Roofer Domains From Getting Burned)
-- =========================================================

-- ============================================
-- 1) Core Safety Event Tables
-- ============================================

-- Bounce Events Table
CREATE TABLE IF NOT EXISTS public.bounce_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  email text NOT NULL,
  bounce_type text NOT NULL CHECK (bounce_type IN ('hard', 'soft')),
  bounce_reason text,
  smtp_code text,
  dsn_code text,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  send_id uuid, -- reference to email send/log
  provider text, -- 'sendgrid', 'mailgun', 'resend', etc.
  raw_payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bounce_events_workspace_email 
  ON public.bounce_events(workspace_id, lower(email));

CREATE INDEX IF NOT EXISTS idx_bounce_events_bounce_type 
  ON public.bounce_events(bounce_type);

CREATE INDEX IF NOT EXISTS idx_bounce_events_campaign 
  ON public.bounce_events(campaign_id) WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bounce_events_created_at 
  ON public.bounce_events(created_at DESC);

-- Complaint Events Table (Spam Complaints)
CREATE TABLE IF NOT EXISTS public.complaint_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  email text NOT NULL,
  complaint_type text DEFAULT 'spam', -- 'spam', 'phishing', etc.
  feedback text, -- user feedback if available
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  send_id uuid,
  provider text,
  raw_payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_complaint_events_workspace_email 
  ON public.complaint_events(workspace_id, lower(email));

CREATE INDEX IF NOT EXISTS idx_complaint_events_campaign 
  ON public.complaint_events(campaign_id) WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_complaint_events_created_at 
  ON public.complaint_events(created_at DESC);

-- Unsubscribe Events Table
CREATE TABLE IF NOT EXISTS public.unsubscribe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  email text NOT NULL,
  unsubscribe_method text DEFAULT 'link', -- 'link', 'reply', 'manual', 'webhook'
  reason text, -- user-provided reason if available
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  send_id uuid,
  ip_address inet,
  user_agent text,
  raw_payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_unsubscribe_events_workspace_email 
  ON public.unsubscribe_events(workspace_id, lower(email));

CREATE INDEX IF NOT EXISTS idx_unsubscribe_events_campaign 
  ON public.unsubscribe_events(campaign_id) WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_unsubscribe_events_created_at 
  ON public.unsubscribe_events(created_at DESC);

-- ============================================
-- 2) Enhanced Global Suppression List
-- ============================================

-- Add additional fields to suppression_list if they don't exist
DO $$
BEGIN
  -- Add source_campaign_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'suppression_list' 
    AND column_name = 'source_campaign_id'
  ) THEN
    ALTER TABLE public.suppression_list 
      ADD COLUMN source_campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL;
  END IF;

  -- Add suppression_type if missing (more granular than reason)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'suppression_list' 
    AND column_name = 'suppression_type'
  ) THEN
    ALTER TABLE public.suppression_list 
      ADD COLUMN suppression_type text CHECK (suppression_type IN ('unsubscribe', 'complaint', 'bounce', 'manual', 'invalid_domain', 'disposable', 'role_account'));
  END IF;

  -- Add system_note if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'suppression_list' 
    AND column_name = 'system_note'
  ) THEN
    ALTER TABLE public.suppression_list 
      ADD COLUMN system_note text;
  END IF;
END $$;

-- ============================================
-- 3) Disposable Email Domain Detection
-- ============================================

-- Table to track known disposable email domains
CREATE TABLE IF NOT EXISTS public.disposable_email_domains (
  domain text PRIMARY KEY,
  is_active boolean DEFAULT true,
  detected_at timestamptz DEFAULT now(),
  source text DEFAULT 'system' -- 'system', 'user_reported', 'provider'
);

-- Insert common disposable email domains
INSERT INTO public.disposable_email_domains (domain, source) VALUES
  ('tempmail.com', 'system'),
  ('guerrillamail.com', 'system'),
  ('mailinator.com', 'system'),
  ('10minutemail.com', 'system'),
  ('throwaway.email', 'system'),
  ('temp-mail.org', 'system'),
  ('yopmail.com', 'system'),
  ('getnada.com', 'system'),
  ('mohmal.com', 'system'),
  ('fakeinbox.com', 'system')
ON CONFLICT (domain) DO NOTHING;

-- Function to check if domain is disposable
CREATE OR REPLACE FUNCTION public.is_disposable_email(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.disposable_email_domains
    WHERE domain = lower(split_part(p_email, '@', 2))
    AND is_active = true
  );
$$;

-- ============================================
-- 4) Safety Check Functions
-- ============================================

-- Comprehensive shouldSend() function
CREATE OR REPLACE FUNCTION public.should_send_email(
  p_workspace_id uuid,
  p_email text,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_email_normalized text;
  v_domain text;
  v_is_suppressed boolean;
  v_suppression_reason text;
  v_has_hard_bounce boolean;
  v_has_complaint boolean;
  v_is_unsubscribed boolean;
  v_is_disposable boolean;
  v_bounce_count int;
  v_result jsonb;
BEGIN
  -- Normalize email
  v_email_normalized := lower(trim(p_email));
  v_domain := split_part(v_email_normalized, '@', 2);
  
  -- Check 1: Basic email validation
  IF v_email_normalized !~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$' THEN
    RETURN jsonb_build_object(
      'should_send', false,
      'reason', 'invalid_email_format',
      'message', 'Invalid email format'
    );
  END IF;
  
  -- Check 2: Disposable email
  v_is_disposable := public.is_disposable_email(v_email_normalized);
  IF v_is_disposable THEN
    RETURN jsonb_build_object(
      'should_send', false,
      'reason', 'disposable_email',
      'message', 'Disposable email addresses are not allowed'
    );
  END IF;
  
  -- Check 3: Global suppression
  SELECT EXISTS(
    SELECT 1 FROM public.suppression_list
    WHERE workspace_id = p_workspace_id
    AND lower(email) = v_email_normalized
  ) INTO v_is_suppressed;
  
  IF v_is_suppressed THEN
    SELECT reason INTO v_suppression_reason
    FROM public.suppression_list
    WHERE workspace_id = p_workspace_id
    AND lower(email) = v_email_normalized
    LIMIT 1;
    
    RETURN jsonb_build_object(
      'should_send', false,
      'reason', 'suppressed',
      'suppression_reason', v_suppression_reason,
      'message', format('Email is suppressed: %s', v_suppression_reason)
    );
  END IF;
  
  -- Check 4: Hard bounce history (last 30 days)
  SELECT EXISTS(
    SELECT 1 FROM public.bounce_events
    WHERE workspace_id = p_workspace_id
    AND lower(email) = v_email_normalized
    AND bounce_type = 'hard'
    AND created_at > now() - interval '30 days'
  ) INTO v_has_hard_bounce;
  
  IF v_has_hard_bounce THEN
    RETURN jsonb_build_object(
      'should_send', false,
      'reason', 'hard_bounce_history',
      'message', 'Email has hard bounce history'
    );
  END IF;
  
  -- Check 5: Complaint history (last 90 days)
  SELECT EXISTS(
    SELECT 1 FROM public.complaint_events
    WHERE workspace_id = p_workspace_id
    AND lower(email) = v_email_normalized
    AND created_at > now() - interval '90 days'
  ) INTO v_has_complaint;
  
  IF v_has_complaint THEN
    RETURN jsonb_build_object(
      'should_send', false,
      'reason', 'complaint_history',
      'message', 'Email has spam complaint history'
    );
  END IF;
  
  -- Check 6: Unsubscribe history
  SELECT EXISTS(
    SELECT 1 FROM public.unsubscribe_events
    WHERE workspace_id = p_workspace_id
    AND lower(email) = v_email_normalized
  ) INTO v_is_unsubscribed;
  
  IF v_is_unsubscribed THEN
    RETURN jsonb_build_object(
      'should_send', false,
      'reason', 'unsubscribed',
      'message', 'Email has unsubscribed'
    );
  END IF;
  
  -- Check 7: Soft bounce count (3+ soft bounces = suppress)
  SELECT COUNT(*) INTO v_bounce_count
  FROM public.bounce_events
  WHERE workspace_id = p_workspace_id
  AND lower(email) = v_email_normalized
  AND bounce_type = 'soft'
  AND created_at > now() - interval '7 days';
  
  IF v_bounce_count >= 3 THEN
    RETURN jsonb_build_object(
      'should_send', false,
      'reason', 'too_many_soft_bounces',
      'message', format('Too many soft bounces (%s)', v_bounce_count)
    );
  END IF;
  
  -- All checks passed
  RETURN jsonb_build_object(
    'should_send', true,
    'reason', 'safe_to_send',
    'message', 'Email passed all safety checks'
  );
END;
$$;

-- ============================================
-- 5) Event Processing Functions
-- ============================================

-- Process Hard Bounce
CREATE OR REPLACE FUNCTION public.process_hard_bounce(
  p_workspace_id uuid,
  p_email text,
  p_bounce_reason text DEFAULT NULL,
  p_smtp_code text DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_send_id uuid DEFAULT NULL,
  p_provider text DEFAULT NULL,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bounce_id uuid;
BEGIN
  -- Insert bounce event
  INSERT INTO public.bounce_events (
    workspace_id, email, bounce_type, bounce_reason, smtp_code,
    campaign_id, send_id, provider, raw_payload
  )
  VALUES (
    p_workspace_id, lower(trim(p_email)), 'hard', p_bounce_reason,
    p_smtp_code, p_campaign_id, p_send_id, p_provider, p_raw_payload
  )
  RETURNING id INTO v_bounce_id;
  
  -- Auto-suppress contact
  PERFORM public.suppress_contact(
    p_workspace_id,
    lower(trim(p_email)),
    'bounce',
    'system',
    NULL,
    format('Hard bounce: %s', COALESCE(p_bounce_reason, 'Unknown'))
  );
  
  RETURN v_bounce_id;
END;
$$;

-- Process Soft Bounce
CREATE OR REPLACE FUNCTION public.process_soft_bounce(
  p_workspace_id uuid,
  p_email text,
  p_bounce_reason text DEFAULT NULL,
  p_smtp_code text DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_send_id uuid DEFAULT NULL,
  p_provider text DEFAULT NULL,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bounce_id uuid;
  v_soft_bounce_count int;
BEGIN
  -- Insert bounce event
  INSERT INTO public.bounce_events (
    workspace_id, email, bounce_type, bounce_reason, smtp_code,
    campaign_id, send_id, provider, raw_payload
  )
  VALUES (
    p_workspace_id, lower(trim(p_email)), 'soft', p_bounce_reason,
    p_smtp_code, p_campaign_id, p_send_id, p_provider, p_raw_payload
  )
  RETURNING id INTO v_bounce_id;
  
  -- Check if 3+ soft bounces in last 7 days
  SELECT COUNT(*) INTO v_soft_bounce_count
  FROM public.bounce_events
  WHERE workspace_id = p_workspace_id
  AND lower(email) = lower(trim(p_email))
  AND bounce_type = 'soft'
  AND created_at > now() - interval '7 days';
  
  -- Auto-suppress after 3 soft bounces
  IF v_soft_bounce_count >= 3 THEN
    PERFORM public.suppress_contact(
      p_workspace_id,
      lower(trim(p_email)),
      'bounce',
      'system',
      NULL,
      format('Too many soft bounces (%s)', v_soft_bounce_count)
    );
  END IF;
  
  RETURN v_bounce_id;
END;
$$;

-- Process Complaint
CREATE OR REPLACE FUNCTION public.process_complaint(
  p_workspace_id uuid,
  p_email text,
  p_complaint_type text DEFAULT 'spam',
  p_feedback text DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_send_id uuid DEFAULT NULL,
  p_provider text DEFAULT NULL,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_complaint_id uuid;
BEGIN
  -- Insert complaint event
  INSERT INTO public.complaint_events (
    workspace_id, email, complaint_type, feedback,
    campaign_id, send_id, provider, raw_payload
  )
  VALUES (
    p_workspace_id, lower(trim(p_email)), p_complaint_type, p_feedback,
    p_campaign_id, p_send_id, p_provider, p_raw_payload
  )
  RETURNING id INTO v_complaint_id;
  
  -- Auto-suppress contact
  PERFORM public.suppress_contact(
    p_workspace_id,
    lower(trim(p_email)),
    'complaint',
    'system',
    NULL,
    format('Spam complaint: %s', COALESCE(p_feedback, 'No feedback'))
  );
  
  RETURN v_complaint_id;
END;
$$;

-- Process Unsubscribe
CREATE OR REPLACE FUNCTION public.process_unsubscribe(
  p_workspace_id uuid,
  p_email text,
  p_unsubscribe_method text DEFAULT 'link',
  p_reason text DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_send_id uuid DEFAULT NULL,
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_unsubscribe_id uuid;
BEGIN
  -- Insert unsubscribe event
  INSERT INTO public.unsubscribe_events (
    workspace_id, email, unsubscribe_method, reason,
    campaign_id, send_id, ip_address, user_agent, raw_payload
  )
  VALUES (
    p_workspace_id, lower(trim(p_email)), p_unsubscribe_method, p_reason,
    p_campaign_id, p_send_id, p_ip_address, p_user_agent, p_raw_payload
  )
  RETURNING id INTO v_unsubscribe_id;
  
  -- Auto-suppress contact globally
  PERFORM public.suppress_contact(
    p_workspace_id,
    lower(trim(p_email)),
    'unsubscribed',
    'system',
    NULL,
    format('Unsubscribed via %s', p_unsubscribe_method)
  );
  
  RETURN v_unsubscribe_id;
END;
$$;

-- ============================================
-- 6) Campaign Safety & Auto-Pause Rules
-- ============================================

-- Function to check campaign safety metrics
CREATE OR REPLACE FUNCTION public.check_campaign_safety(
  p_campaign_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_total_sent int;
  v_hard_bounces int;
  v_soft_bounces int;
  v_complaints int;
  v_bounce_rate float;
  v_complaint_rate float;
  v_safety_status text;
  v_result jsonb;
BEGIN
  -- Get workspace_id from campaign
  SELECT workspace_id INTO v_workspace_id
  FROM public.campaigns
  WHERE id = p_campaign_id;
  
  IF v_workspace_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Campaign not found');
  END IF;
  
  -- Calculate metrics (last 24 hours)
  SELECT 
    COUNT(*) FILTER (WHERE status IN ('sent', 'delivered')),
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.bounce_events be
      WHERE be.campaign_id = p_campaign_id
      AND be.bounce_type = 'hard'
      AND be.created_at > now() - interval '24 hours'
    )),
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.bounce_events be
      WHERE be.campaign_id = p_campaign_id
      AND be.bounce_type = 'soft'
      AND be.created_at > now() - interval '24 hours'
    )),
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.complaint_events ce
      WHERE ce.campaign_id = p_campaign_id
      AND ce.created_at > now() - interval '24 hours'
    ))
  INTO v_total_sent, v_hard_bounces, v_soft_bounces, v_complaints
  FROM public.campaign_recipients
  WHERE campaign_id = p_campaign_id;
  
  -- Calculate rates
  v_bounce_rate := CASE 
    WHEN v_total_sent > 0 THEN (v_hard_bounces + v_soft_bounces)::float / v_total_sent
    ELSE 0
  END;
  
  v_complaint_rate := CASE
    WHEN v_total_sent > 0 THEN v_complaints::float / v_total_sent
    ELSE 0
  END;
  
  -- Determine safety status
  IF v_bounce_rate >= 0.05 OR v_complaint_rate >= 0.005 THEN
    v_safety_status := 'critical';
  ELSIF v_bounce_rate >= 0.03 OR v_complaint_rate >= 0.003 THEN
    v_safety_status := 'risky';
  ELSIF v_bounce_rate >= 0.01 OR v_complaint_rate >= 0.001 THEN
    v_safety_status := 'caution';
  ELSE
    v_safety_status := 'safe';
  END IF;
  
  RETURN jsonb_build_object(
    'campaign_id', p_campaign_id,
    'safety_status', v_safety_status,
    'total_sent', v_total_sent,
    'hard_bounces', v_hard_bounces,
    'soft_bounces', v_soft_bounces,
    'complaints', v_complaints,
    'bounce_rate', v_bounce_rate,
    'complaint_rate', v_complaint_rate,
    'should_pause', v_bounce_rate >= 0.03 OR v_complaint_rate >= 0.003
  );
END;
$$;

-- Function to auto-pause campaigns based on safety thresholds
CREATE OR REPLACE FUNCTION public.auto_pause_unsafe_campaigns()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_campaign record;
  v_safety_check jsonb;
  v_paused_count int := 0;
BEGIN
  -- Check all active campaigns
  FOR v_campaign IN
    SELECT id FROM public.campaigns
    WHERE status IN ('sending', 'running', 'active')
  LOOP
    v_safety_check := public.check_campaign_safety(v_campaign.id);
    
    -- Pause if should_pause is true
    IF (v_safety_check->>'should_pause')::boolean THEN
      UPDATE public.campaigns
      SET 
        status = 'paused',
        updated_at = now()
      WHERE id = v_campaign.id;
      
      v_paused_count := v_paused_count + 1;
    END IF;
  END LOOP;
  
  RETURN v_paused_count;
END;
$$;

-- ============================================
-- 7) List Quality Analysis
-- ============================================

-- Function to analyze list quality before sending
CREATE OR REPLACE FUNCTION public.analyze_list_quality(
  p_workspace_id uuid,
  p_email_list text[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_total int;
  v_invalid_format int;
  v_disposable int;
  v_suppressed int;
  v_hard_bounce_history int;
  v_complaint_history int;
  v_unsubscribed int;
  v_valid int;
  v_bounce_rate_estimate float;
  v_quality_score int;
  v_recommendation text;
BEGIN
  v_total := array_length(p_email_list, 1);
  
  IF v_total IS NULL OR v_total = 0 THEN
    RETURN jsonb_build_object('error', 'Empty email list');
  END IF;
  
  -- Count issues
  SELECT 
    COUNT(*) FILTER (WHERE email !~ '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'),
    COUNT(*) FILTER (WHERE public.is_disposable_email(email)),
    COUNT(*) FILTER (WHERE public.is_suppressed(p_workspace_id, email)),
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.bounce_events be
      WHERE be.workspace_id = p_workspace_id
      AND be.email = lower(email)
      AND be.bounce_type = 'hard'
      AND be.created_at > now() - interval '30 days'
    )),
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.complaint_events ce
      WHERE ce.workspace_id = p_workspace_id
      AND ce.email = lower(email)
      AND ce.created_at > now() - interval '90 days'
    )),
    COUNT(*) FILTER (WHERE EXISTS (
      SELECT 1 FROM public.unsubscribe_events ue
      WHERE ue.workspace_id = p_workspace_id
      AND ue.email = lower(email)
    ))
  INTO v_invalid_format, v_disposable, v_suppressed, 
       v_hard_bounce_history, v_complaint_history, v_unsubscribed
  FROM unnest(p_email_list) AS email;
  
  -- Calculate valid count
  v_valid := v_total - v_invalid_format - v_disposable - v_suppressed 
             - v_hard_bounce_history - v_complaint_history - v_unsubscribed;
  
  -- Estimate bounce rate
  v_bounce_rate_estimate := CASE
    WHEN v_total > 0 THEN 
      (v_invalid_format + v_disposable + v_hard_bounce_history)::float / v_total
    ELSE 0
  END;
  
  -- Calculate quality score (0-100)
  v_quality_score := GREATEST(0, LEAST(100, 
    ROUND((v_valid::float / v_total * 100)::numeric, 0)
  ));
  
  -- Determine recommendation
  IF v_bounce_rate_estimate >= 0.03 OR v_quality_score < 70 THEN
    v_recommendation := 'clean_required';
  ELSIF v_bounce_rate_estimate >= 0.01 OR v_quality_score < 85 THEN
    v_recommendation := 'caution';
  ELSE
    v_recommendation := 'safe';
  END IF;
  
  RETURN jsonb_build_object(
    'total', v_total,
    'valid', v_valid,
    'invalid_format', v_invalid_format,
    'disposable', v_disposable,
    'suppressed', v_suppressed,
    'hard_bounce_history', v_hard_bounce_history,
    'complaint_history', v_complaint_history,
    'unsubscribed', v_unsubscribed,
    'bounce_rate_estimate', v_bounce_rate_estimate,
    'quality_score', v_quality_score,
    'recommendation', v_recommendation,
    'should_block', v_bounce_rate_estimate >= 0.03 OR v_quality_score < 70
  );
END;
$$;

-- ============================================
-- 8) RLS Policies
-- ============================================

ALTER TABLE public.bounce_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.complaint_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unsubscribe_events ENABLE ROW LEVEL SECURITY;

-- Bounce Events RLS
DROP POLICY IF EXISTS bounce_events_select ON public.bounce_events;
CREATE POLICY bounce_events_select ON public.bounce_events
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Complaint Events RLS
DROP POLICY IF EXISTS complaint_events_select ON public.complaint_events;
CREATE POLICY complaint_events_select ON public.complaint_events
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Unsubscribe Events RLS
DROP POLICY IF EXISTS unsubscribe_events_select ON public.unsubscribe_events;
CREATE POLICY unsubscribe_events_select ON public.unsubscribe_events
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================
-- 9) Grants
-- ============================================

GRANT EXECUTE ON FUNCTION public.should_send_email(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_hard_bounce(uuid, text, text, text, uuid, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_soft_bounce(uuid, text, text, text, uuid, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_complaint(uuid, text, text, text, uuid, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_unsubscribe(uuid, text, text, text, uuid, uuid, inet, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_campaign_safety(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_pause_unsafe_campaigns() TO authenticated;
GRANT EXECUTE ON FUNCTION public.analyze_list_quality(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_disposable_email(text) TO authenticated;

-- ============================================
-- 10) Comments
-- ============================================

COMMENT ON TABLE public.bounce_events IS 'Tracks all bounce events (hard and soft) for safety monitoring';
COMMENT ON TABLE public.complaint_events IS 'Tracks spam complaints to protect domain reputation';
COMMENT ON TABLE public.unsubscribe_events IS 'Tracks unsubscribe requests and methods';
COMMENT ON FUNCTION public.should_send_email IS 'Comprehensive safety check before sending any email';
COMMENT ON FUNCTION public.process_hard_bounce IS 'Process hard bounce and auto-suppress contact';
COMMENT ON FUNCTION public.process_soft_bounce IS 'Process soft bounce and suppress after 3 occurrences';
COMMENT ON FUNCTION public.process_complaint IS 'Process spam complaint and auto-suppress contact';
COMMENT ON FUNCTION public.process_unsubscribe IS 'Process unsubscribe request and auto-suppress contact';
COMMENT ON FUNCTION public.check_campaign_safety IS 'Check campaign safety metrics and determine if pause is needed';
COMMENT ON FUNCTION public.auto_pause_unsafe_campaigns IS 'Automatically pause campaigns that exceed safety thresholds';
COMMENT ON FUNCTION public.analyze_list_quality IS 'Analyze email list quality before sending to prevent domain burn';

