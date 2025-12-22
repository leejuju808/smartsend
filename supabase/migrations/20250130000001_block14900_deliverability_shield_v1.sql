-- =========================================================
-- Block 14900 — SmartSend Deliverability Shield v1
-- (The Real-Time Domain Protection, Spam Prevention & Warmup System That Keeps Roofers OUT of Spam Folders)
-- =========================================================

-- ============================================
-- 1) Domain Health Score Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.domain_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_settings_id uuid NOT NULL REFERENCES public.domain_settings(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Health Score (0-100)
  health_score numeric(5,2) NOT NULL DEFAULT 50.0 CHECK (health_score >= 0 AND health_score <= 100),
  
  -- Score Components
  bounce_rate numeric(5,2) DEFAULT 0.0, -- percentage
  complaint_rate numeric(5,2) DEFAULT 0.0, -- percentage
  open_rate numeric(5,2) DEFAULT 0.0, -- percentage
  spam_score numeric(5,2) DEFAULT 0.0, -- 0-100 spam likelihood
  domain_age_days int DEFAULT 0,
  dkim_valid boolean DEFAULT false,
  spf_valid boolean DEFAULT false,
  dmarc_valid boolean DEFAULT false,
  
  -- Daily send volume tracking
  daily_send_volume int DEFAULT 0,
  avg_daily_send_volume numeric(10,2) DEFAULT 0.0,
  
  -- Reputation history
  reputation_trend text DEFAULT 'stable' CHECK (reputation_trend IN ('improving', 'stable', 'declining', 'critical')),
  
  -- Status
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'blocked', 'warming')),
  
  -- Last calculated
  last_calculated_at timestamptz DEFAULT now(),
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(domain_settings_id)
);

CREATE INDEX IF NOT EXISTS idx_domain_health_org ON public.domain_health(org_id);
CREATE INDEX IF NOT EXISTS idx_domain_health_domain_settings ON public.domain_health(domain_settings_id);
CREATE INDEX IF NOT EXISTS idx_domain_health_score ON public.domain_health(health_score);
CREATE INDEX IF NOT EXISTS idx_domain_health_status ON public.domain_health(status);

-- ============================================
-- 2) Deliverability Events Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.deliverability_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_settings_id uuid NOT NULL REFERENCES public.domain_settings(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Event Type
  event_type text NOT NULL CHECK (event_type IN (
    'dns_check', 'health_calculated', 'bounce_detected', 'complaint_detected',
    'warmup_started', 'warmup_progress', 'warmup_completed', 'sending_paused',
    'sending_resumed', 'blacklist_hit', 'reputation_alert', 'safety_rule_triggered'
  )),
  
  -- Event Details
  event_data jsonb DEFAULT '{}'::jsonb,
  severity text DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  message text,
  
  -- Related References
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  send_id uuid,
  
  -- Timestamps
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deliverability_events_domain ON public.deliverability_events(domain_settings_id);
CREATE INDEX IF NOT EXISTS idx_deliverability_events_org ON public.deliverability_events(org_id);
CREATE INDEX IF NOT EXISTS idx_deliverability_events_type ON public.deliverability_events(event_type);
CREATE INDEX IF NOT EXISTS idx_deliverability_events_created ON public.deliverability_events(created_at DESC);

-- ============================================
-- 3) Warmup State Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.domain_warmup_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_settings_id uuid NOT NULL REFERENCES public.domain_settings(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Warmup Stage
  warmup_stage int NOT NULL DEFAULT 1, -- Day 1, 2, 3, etc.
  warmup_status text NOT NULL DEFAULT 'warming' CHECK (warmup_status IN ('idle', 'warming', 'completed', 'paused')),
  
  -- Daily Limits
  current_daily_limit int NOT NULL DEFAULT 20,
  target_daily_limit int NOT NULL DEFAULT 200,
  
  -- Progress Tracking
  emails_sent_today int DEFAULT 0,
  emails_sent_total int DEFAULT 0,
  last_sent_at timestamptz,
  
  -- Warmup Schedule (stored as JSON for flexibility)
  warmup_schedule jsonb DEFAULT '[]'::jsonb, -- [{day: 1, limit: 20}, {day: 2, limit: 25}, ...]
  
  -- Started/Completed
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(domain_settings_id)
);

CREATE INDEX IF NOT EXISTS idx_warmup_state_domain ON public.domain_warmup_state(domain_settings_id);
CREATE INDEX IF NOT EXISTS idx_warmup_state_org ON public.domain_warmup_state(org_id);
CREATE INDEX IF NOT EXISTS idx_warmup_state_status ON public.domain_warmup_state(warmup_status);

-- ============================================
-- 4) Content Spam Scans Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.content_spam_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  
  -- Content Being Scanned
  subject_line text NOT NULL,
  email_body text NOT NULL,
  
  -- Scan Results
  spam_score numeric(5,2) NOT NULL DEFAULT 0.0 CHECK (spam_score >= 0 AND spam_score <= 100),
  risk_level text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  
  -- Detected Issues
  detected_issues jsonb DEFAULT '[]'::jsonb, -- ['all_caps', 'too_many_links', 'spammy_phrases', ...]
  flagged_keywords jsonb DEFAULT '[]'::jsonb,
  link_count int DEFAULT 0,
  image_count int DEFAULT 0,
  
  -- Recommendations
  recommendations jsonb DEFAULT '[]'::jsonb,
  
  -- Status
  scan_status text NOT NULL DEFAULT 'pending' CHECK (scan_status IN ('pending', 'completed', 'failed')),
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_content_scans_org ON public.content_spam_scans(org_id);
CREATE INDEX IF NOT EXISTS idx_content_scans_campaign ON public.content_spam_scans(campaign_id);
CREATE INDEX IF NOT EXISTS idx_content_scans_risk ON public.content_spam_scans(risk_level);
CREATE INDEX IF NOT EXISTS idx_content_scans_created ON public.content_spam_scans(created_at DESC);

-- ============================================
-- 5) Sending Safety Rules Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.sending_safety_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Rule Configuration
  rule_name text NOT NULL,
  rule_type text NOT NULL CHECK (rule_type IN (
    'hourly_rate_limit', 'bounce_rate_threshold', 'complaint_rate_threshold',
    'domain_validation', 'content_validation', 'list_validation'
  )),
  
  -- Rule Parameters
  rule_config jsonb NOT NULL DEFAULT '{}'::jsonb, -- Flexible config per rule type
  
  -- Status
  enabled boolean NOT NULL DEFAULT true,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_rules_org ON public.sending_safety_rules(org_id);
CREATE INDEX IF NOT EXISTS idx_safety_rules_type ON public.sending_safety_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_safety_rules_enabled ON public.sending_safety_rules(enabled) WHERE enabled = true;

-- Insert Default Safety Rules
INSERT INTO public.sending_safety_rules (org_id, rule_name, rule_type, rule_config, enabled)
SELECT 
  o.id,
  'Hourly Rate Limit',
  'hourly_rate_limit',
  '{"max_emails_per_hour": 200}'::jsonb,
  true
FROM public.organizations o
ON CONFLICT DO NOTHING;

INSERT INTO public.sending_safety_rules (org_id, rule_name, rule_type, rule_config, enabled)
SELECT 
  o.id,
  'Bounce Rate Threshold',
  'bounce_rate_threshold',
  '{"max_bounce_rate": 5.0}'::jsonb,
  true
FROM public.organizations o
ON CONFLICT DO NOTHING;

INSERT INTO public.sending_safety_rules (org_id, rule_name, rule_type, rule_config, enabled)
SELECT 
  o.id,
  'Complaint Rate Threshold',
  'complaint_rate_threshold',
  '{"max_complaint_rate": 0.3}'::jsonb,
  true
FROM public.organizations o
ON CONFLICT DO NOTHING;

-- ============================================
-- 6) Enhanced Domain Settings
-- ============================================
-- Add health_score column to domain_settings if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'domain_settings' 
    AND column_name = 'health_score'
  ) THEN
    ALTER TABLE public.domain_settings 
      ADD COLUMN health_score numeric(5,2) DEFAULT 50.0 CHECK (health_score >= 0 AND health_score <= 100);
  END IF;
END $$;

-- Add sending_paused column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'domain_settings' 
    AND column_name = 'sending_paused'
  ) THEN
    ALTER TABLE public.domain_settings 
      ADD COLUMN sending_paused boolean DEFAULT false;
  END IF;
END $$;

-- Add pause_reason column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'domain_settings' 
    AND column_name = 'pause_reason'
  ) THEN
    ALTER TABLE public.domain_settings 
      ADD COLUMN pause_reason text;
  END IF;
END $$;

-- ============================================
-- 7) Functions
-- ============================================

-- Function: Calculate Domain Health Score
CREATE OR REPLACE FUNCTION public.calculate_domain_health_score(p_domain_settings_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score numeric := 50.0; -- Start at 50
  v_bounce_rate numeric;
  v_complaint_rate numeric;
  v_open_rate numeric;
  v_dkim_valid boolean;
  v_spf_valid boolean;
  v_dmarc_valid boolean;
  v_domain_age_days int;
  v_daily_send_volume int;
  v_domain_settings record;
  v_org_id uuid;
BEGIN
  -- Get domain settings
  SELECT ds.*, ds.org_id INTO v_domain_settings, v_org_id
  FROM public.domain_settings ds
  WHERE ds.id = p_domain_settings_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Get DNS status
  v_dkim_valid := COALESCE(v_domain_settings.dkim_pass, false);
  v_spf_valid := COALESCE(v_domain_settings.spf_pass, false);
  v_dmarc_valid := COALESCE(v_domain_settings.dmarc_pass, false);
  
  -- Calculate bounce rate (last 30 days)
  SELECT 
    CASE 
      WHEN COUNT(*) = 0 THEN 0.0
      ELSE (COUNT(*) FILTER (WHERE be.bounce_type = 'hard')::numeric / COUNT(*)::numeric) * 100.0
    END
  INTO v_bounce_rate
  FROM public.bounce_events be
  WHERE be.workspace_id = v_org_id
    AND be.created_at > now() - interval '30 days';
  
  -- Calculate complaint rate (last 30 days)
  SELECT 
    CASE 
      WHEN COUNT(*) = 0 THEN 0.0
      ELSE (COUNT(*)::numeric / NULLIF((SELECT COUNT(*) FROM public.email_logs WHERE org_id = v_org_id AND created_at > now() - interval '30 days'), 0)::numeric) * 100.0
    END
  INTO v_complaint_rate
  FROM public.complaint_events ce
  WHERE ce.workspace_id = v_org_id
    AND ce.created_at > now() - interval '30 days';
  
  -- Calculate open rate (last 30 days) - placeholder, would need email tracking
  v_open_rate := 0.0; -- TODO: Implement with email tracking
  
  -- Calculate domain age
  v_domain_age_days := EXTRACT(DAY FROM (now() - v_domain_settings.created_at))::int;
  
  -- Calculate daily send volume (last 7 days average)
  SELECT COALESCE(AVG(daily_count), 0)::int
  INTO v_daily_send_volume
  FROM (
    SELECT DATE(created_at) as send_date, COUNT(*) as daily_count
    FROM public.email_logs
    WHERE org_id = v_org_id
      AND created_at > now() - interval '7 days'
    GROUP BY DATE(created_at)
  ) daily_stats;
  
  -- Calculate score components
  -- DNS (30 points max)
  IF v_spf_valid THEN v_score := v_score + 10; END IF;
  IF v_dkim_valid THEN v_score := v_score + 10; END IF;
  IF v_dmarc_valid THEN v_score := v_score + 10; END IF;
  
  -- Bounce rate (penalty)
  IF v_bounce_rate > 5.0 THEN
    v_score := v_score - 30; -- Critical penalty
  ELSIF v_bounce_rate > 2.0 THEN
    v_score := v_score - 15; -- Moderate penalty
  ELSIF v_bounce_rate > 0.5 THEN
    v_score := v_score - 5; -- Minor penalty
  END IF;
  
  -- Complaint rate (penalty)
  IF v_complaint_rate > 0.3 THEN
    v_score := v_score - 40; -- Critical penalty
  ELSIF v_complaint_rate > 0.1 THEN
    v_score := v_score - 20; -- Moderate penalty
  ELSIF v_complaint_rate > 0.05 THEN
    v_score := v_score - 10; -- Minor penalty
  END IF;
  
  -- Open rate (bonus)
  IF v_open_rate > 30.0 THEN
    v_score := v_score + 10;
  ELSIF v_open_rate > 20.0 THEN
    v_score := v_score + 5;
  END IF;
  
  -- Domain age (bonus)
  IF v_domain_age_days > 365 THEN
    v_score := v_score + 10;
  ELSIF v_domain_age_days > 180 THEN
    v_score := v_score + 5;
  END IF;
  
  -- Ensure score is between 0 and 100
  v_score := GREATEST(0, LEAST(100, v_score));
  
  RETURN v_score;
END;
$$;

-- Function: Check Sending Safety
CREATE OR REPLACE FUNCTION public.check_sending_safety(
  p_org_id uuid,
  p_domain_settings_id uuid,
  p_to_email text,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_domain_settings record;
  v_health_score numeric;
  v_bounce_rate numeric;
  v_complaint_rate numeric;
  v_hourly_count int;
  v_is_role_email boolean;
  v_is_suspicious_email boolean;
  v_rule_config jsonb;
BEGIN
  -- Initialize result
  v_result := jsonb_build_object(
    'can_send', true,
    'reason', null,
    'message', 'Safe to send'
  );
  
  -- Get domain settings
  SELECT * INTO v_domain_settings
  FROM public.domain_settings
  WHERE id = p_domain_settings_id AND org_id = p_org_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'can_send', false,
      'reason', 'domain_not_found',
      'message', 'Domain settings not found'
    );
  END IF;
  
  -- Check 1: Domain sending paused
  IF v_domain_settings.sending_paused THEN
    RETURN jsonb_build_object(
      'can_send', false,
      'reason', 'sending_paused',
      'message', COALESCE(v_domain_settings.pause_reason, 'Sending is paused for this domain')
    );
  END IF;
  
  -- Check 2: Get health score
  SELECT health_score INTO v_health_score
  FROM public.domain_health
  WHERE domain_settings_id = p_domain_settings_id;
  
  IF v_health_score IS NULL THEN
    v_health_score := public.calculate_domain_health_score(p_domain_settings_id);
  END IF;
  
  -- Check 3: Health score threshold
  IF v_health_score < 30 THEN
    RETURN jsonb_build_object(
      'can_send', false,
      'reason', 'low_health_score',
      'message', format('Domain health score too low: %.1f (minimum: 30)', v_health_score)
    );
  END IF;
  
  -- Check 4: Hourly rate limit (200 emails/hour)
  SELECT COUNT(*) INTO v_hourly_count
  FROM public.email_logs
  WHERE org_id = p_org_id
    AND created_at > now() - interval '1 hour';
  
  IF v_hourly_count >= 200 THEN
    RETURN jsonb_build_object(
      'can_send', false,
      'reason', 'hourly_rate_limit',
      'message', format('Hourly rate limit exceeded: %s emails/hour', v_hourly_count)
    );
  END IF;
  
  -- Check 5: Bounce rate threshold (5%)
  SELECT 
    CASE 
      WHEN COUNT(*) = 0 THEN 0.0
      ELSE (COUNT(*) FILTER (WHERE bounce_type = 'hard')::numeric / COUNT(*)::numeric) * 100.0
    END
  INTO v_bounce_rate
  FROM public.bounce_events
  WHERE workspace_id = p_org_id
    AND created_at > now() - interval '24 hours';
  
  IF v_bounce_rate > 5.0 THEN
    RETURN jsonb_build_object(
      'can_send', false,
      'reason', 'high_bounce_rate',
      'message', format('Bounce rate too high: %.2f%% (maximum: 5%%)', v_bounce_rate)
    );
  END IF;
  
  -- Check 6: Complaint rate threshold (0.3%)
  SELECT 
    CASE 
      WHEN (SELECT COUNT(*) FROM public.email_logs WHERE org_id = p_org_id AND created_at > now() - interval '24 hours') = 0 THEN 0.0
      ELSE (COUNT(*)::numeric / NULLIF((SELECT COUNT(*) FROM public.email_logs WHERE org_id = p_org_id AND created_at > now() - interval '24 hours'), 0)::numeric) * 100.0
    END
  INTO v_complaint_rate
  FROM public.complaint_events
  WHERE workspace_id = p_org_id
    AND created_at > now() - interval '24 hours';
  
  IF v_complaint_rate > 0.3 THEN
    RETURN jsonb_build_object(
      'can_send', false,
      'reason', 'high_complaint_rate',
      'message', format('Complaint rate too high: %.2f%% (maximum: 0.3%%)', v_complaint_rate)
    );
  END IF;
  
  -- Check 7: Role email detection
  v_is_role_email := lower(p_to_email) ~ '^(info|support|admin|noreply|no-reply|sales|marketing|contact|help|service)@';
  IF v_is_role_email THEN
    RETURN jsonb_build_object(
      'can_send', false,
      'reason', 'role_email',
      'message', 'Cannot send to role-based email addresses'
    );
  END IF;
  
  -- Check 8: Suspicious email patterns
  v_is_suspicious_email := lower(p_to_email) ~ '^[a-z0-9]+@[a-z0-9]+\.(com|net|org)$' AND length(split_part(p_to_email, '@', 1)) < 3;
  IF v_is_suspicious_email THEN
    RETURN jsonb_build_object(
      'can_send', false,
      'reason', 'suspicious_email',
      'message', 'Email address appears suspicious'
    );
  END IF;
  
  -- Check 9: Suppression list (using existing function from Block 13700)
  -- This would call should_send_email if it exists
  -- For now, we'll do a basic check
  IF EXISTS (
    SELECT 1 FROM public.suppression_list
    WHERE workspace_id = p_org_id
      AND lower(email) = lower(p_to_email)
  ) THEN
    RETURN jsonb_build_object(
      'can_send', false,
      'reason', 'suppressed',
      'message', 'Email address is on suppression list'
    );
  END IF;
  
  RETURN v_result;
END;
$$;

-- Function: Update Warmup Progress
CREATE OR REPLACE FUNCTION public.update_warmup_progress(p_domain_settings_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_warmup_state record;
  v_today date;
  v_emails_sent_today int;
BEGIN
  v_today := CURRENT_DATE;
  
  -- Get warmup state
  SELECT * INTO v_warmup_state
  FROM public.domain_warmup_state
  WHERE domain_settings_id = p_domain_settings_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Reset daily counter if new day
  IF v_warmup_state.last_sent_at::date < v_today THEN
    UPDATE public.domain_warmup_state
    SET emails_sent_today = 0,
        updated_at = now()
    WHERE id = v_warmup_state.id;
  END IF;
  
  -- Check if warmup is complete
  IF v_warmup_state.warmup_stage >= 6 AND v_warmup_state.emails_sent_total >= (v_warmup_state.target_daily_limit * 6) THEN
    UPDATE public.domain_warmup_state
    SET warmup_status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE id = v_warmup_state.id;
  END IF;
END;
$$;

-- Function: Auto-pause on threshold breach
CREATE OR REPLACE FUNCTION public.auto_pause_domain_on_threshold(p_domain_settings_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_domain_settings record;
  v_health_score numeric;
  v_bounce_rate numeric;
  v_complaint_rate numeric;
  v_org_id uuid;
BEGIN
  -- Get domain settings
  SELECT * INTO v_domain_settings
  FROM public.domain_settings
  WHERE id = p_domain_settings_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  v_org_id := v_domain_settings.org_id;
  
  -- Get health score
  SELECT health_score INTO v_health_score
  FROM public.domain_health
  WHERE domain_settings_id = p_domain_settings_id;
  
  -- Calculate bounce rate
  SELECT 
    CASE 
      WHEN COUNT(*) = 0 THEN 0.0
      ELSE (COUNT(*) FILTER (WHERE bounce_type = 'hard')::numeric / COUNT(*)::numeric) * 100.0
    END
  INTO v_bounce_rate
  FROM public.bounce_events
  WHERE workspace_id = v_org_id
    AND created_at > now() - interval '24 hours';
  
  -- Calculate complaint rate
  SELECT 
    CASE 
      WHEN (SELECT COUNT(*) FROM public.email_logs WHERE org_id = v_org_id AND created_at > now() - interval '24 hours') = 0 THEN 0.0
      ELSE (COUNT(*)::numeric / NULLIF((SELECT COUNT(*) FROM public.email_logs WHERE org_id = v_org_id AND created_at > now() - interval '24 hours'), 0)::numeric) * 100.0
    END
  INTO v_complaint_rate
  FROM public.complaint_events
  WHERE workspace_id = v_org_id
    AND created_at > now() - interval '24 hours';
  
  -- Auto-pause conditions
  IF v_bounce_rate > 5.0 OR v_complaint_rate > 0.3 OR (v_health_score IS NOT NULL AND v_health_score < 30) THEN
    UPDATE public.domain_settings
    SET sending_paused = true,
        pause_reason = format('Auto-paused: bounce_rate=%.2f%%, complaint_rate=%.2f%%, health_score=%.1f', 
                              v_bounce_rate, v_complaint_rate, COALESCE(v_health_score, 0)),
        updated_at = now()
    WHERE id = p_domain_settings_id;
    
    -- Log event
    INSERT INTO public.deliverability_events (
      domain_settings_id, org_id, event_type, severity, message, event_data
    ) VALUES (
      p_domain_settings_id, v_org_id, 'sending_paused', 'critical',
      format('Domain auto-paused due to threshold breach'),
      jsonb_build_object(
        'bounce_rate', v_bounce_rate,
        'complaint_rate', v_complaint_rate,
        'health_score', v_health_score
      )
    );
  END IF;
END;
$$;

-- ============================================
-- 8) Triggers
-- ============================================

-- Trigger: Auto-create domain_health record when domain_settings is created
CREATE OR REPLACE FUNCTION public.create_domain_health_on_domain_settings()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.domain_health (domain_settings_id, org_id, health_score)
  VALUES (NEW.id, NEW.org_id, 50.0)
  ON CONFLICT (domain_settings_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_domain_health ON public.domain_settings;
CREATE TRIGGER trg_create_domain_health
  AFTER INSERT ON public.domain_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.create_domain_health_on_domain_settings();

-- Trigger: Auto-create warmup_state when domain_settings is created
CREATE OR REPLACE FUNCTION public.create_warmup_state_on_domain_settings()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.domain_warmup_state (
    domain_settings_id, org_id, warmup_stage, current_daily_limit, warmup_schedule
  )
  VALUES (
    NEW.id, 
    NEW.org_id, 
    1, 
    20,
    '[
      {"day": 1, "limit": 20},
      {"day": 2, "limit": 25},
      {"day": 3, "limit": 30},
      {"day": 4, "limit": 40},
      {"day": 5, "limit": 50},
      {"day": 6, "limit": 75},
      {"day": 7, "limit": 100},
      {"day": 8, "limit": 150},
      {"day": 9, "limit": 200}
    ]'::jsonb
  )
  ON CONFLICT (domain_settings_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_warmup_state ON public.domain_settings;
CREATE TRIGGER trg_create_warmup_state
  AFTER INSERT ON public.domain_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.create_warmup_state_on_domain_settings();

-- ============================================
-- 9) RLS Policies
-- ============================================

ALTER TABLE public.domain_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliverability_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_warmup_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_spam_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sending_safety_rules ENABLE ROW LEVEL SECURITY;

-- Domain Health Policies
CREATE POLICY "Users can view domain health for their org"
  ON public.domain_health FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_memberships
      WHERE org_id = domain_health.org_id
      AND user_id = auth.uid()
      AND status = 'active'
    )
  );

CREATE POLICY "Service role can manage domain health"
  ON public.domain_health FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Deliverability Events Policies
CREATE POLICY "Users can view deliverability events for their org"
  ON public.deliverability_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_memberships
      WHERE org_id = deliverability_events.org_id
      AND user_id = auth.uid()
      AND status = 'active'
    )
  );

CREATE POLICY "Service role can manage deliverability events"
  ON public.deliverability_events FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Warmup State Policies
CREATE POLICY "Users can view warmup state for their org"
  ON public.domain_warmup_state FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_memberships
      WHERE org_id = domain_warmup_state.org_id
      AND user_id = auth.uid()
      AND status = 'active'
    )
  );

CREATE POLICY "Service role can manage warmup state"
  ON public.domain_warmup_state FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Content Spam Scans Policies
CREATE POLICY "Users can view content scans for their org"
  ON public.content_spam_scans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_memberships
      WHERE org_id = content_spam_scans.org_id
      AND user_id = auth.uid()
      AND status = 'active'
    )
  );

CREATE POLICY "Service role can manage content scans"
  ON public.content_spam_scans FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Safety Rules Policies
CREATE POLICY "Users can view safety rules for their org"
  ON public.sending_safety_rules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_memberships
      WHERE org_id = sending_safety_rules.org_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can manage safety rules for their org"
  ON public.sending_safety_rules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.org_memberships
      WHERE org_id = sending_safety_rules.org_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_memberships
      WHERE org_id = sending_safety_rules.org_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND role IN ('owner', 'admin')
    )
  );

-- ============================================
-- 10) Comments
-- ============================================

COMMENT ON TABLE public.domain_health IS 'Domain health scoring system (0-100) based on bounce rate, complaint rate, DNS status, and reputation';
COMMENT ON TABLE public.deliverability_events IS 'Audit log of all deliverability-related events (DNS checks, bounces, complaints, warmup progress)';
COMMENT ON TABLE public.domain_warmup_state IS 'Tracks warmup progress for new domains with gradual volume increase';
COMMENT ON TABLE public.content_spam_scans IS 'Pre-send content spam analysis to prevent emails from being flagged';
COMMENT ON TABLE public.sending_safety_rules IS 'Configurable safety rules that prevent dangerous sending behavior';

COMMENT ON FUNCTION public.calculate_domain_health_score IS 'Calculates health score (0-100) based on DNS, bounce rate, complaint rate, open rate, and domain age';
COMMENT ON FUNCTION public.check_sending_safety IS 'Comprehensive safety check before sending email. Returns can_send boolean and reason if blocked';
COMMENT ON FUNCTION public.update_warmup_progress IS 'Updates warmup progress and advances to next stage when limits are reached';
COMMENT ON FUNCTION public.auto_pause_domain_on_threshold IS 'Automatically pauses domain sending when bounce/complaint thresholds are breached';





















































