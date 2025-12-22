-- Block 237: SmartSend Deliverability Shield v1
-- Domain Warmup, Send Limits, Smart Rotation, Bounce Protection, Reputation Safety

-- 1. Add deliverability shield columns to mailboxes table
-- (Works with existing mailbox table structure)
DO $$
BEGIN
  -- Add columns if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'mailboxes' 
                 AND column_name = 'send_limit_daily') THEN
    ALTER TABLE public.mailboxes 
      ADD COLUMN send_limit_daily INTEGER DEFAULT 200,
      ADD COLUMN warmup_active BOOLEAN DEFAULT true,
      ADD COLUMN warmup_level INTEGER DEFAULT 1,
      ADD COLUMN reputation_score INTEGER DEFAULT 100 CHECK (reputation_score >= 0 AND reputation_score <= 100),
      ADD COLUMN bounces_today INTEGER DEFAULT 0,
      ADD COLUMN sends_today INTEGER DEFAULT 0,
      ADD COLUMN last_reset DATE DEFAULT CURRENT_DATE,
      ADD COLUMN paused BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Ensure email column exists (for some mailbox table variants)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables 
             WHERE table_schema = 'public' 
             AND table_name = 'mailboxes')
  AND NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_schema = 'public' 
                  AND table_name = 'mailboxes' 
                  AND column_name = 'email') THEN
    -- Try to use from_email if it exists, otherwise add email column
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_schema = 'public' 
               AND table_name = 'mailboxes' 
               AND column_name = 'from_email') THEN
      -- Create a view or use from_email as email
      NULL; -- from_email can be used as email
    ELSE
      ALTER TABLE public.mailboxes ADD COLUMN email TEXT;
    END IF;
  END IF;
END $$;

-- 2. Create template risk tracking table
CREATE TABLE IF NOT EXISTS public.template_risk_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID,
  campaign_id UUID,
  subject TEXT,
  body TEXT,
  risk_score INTEGER NOT NULL CHECK (risk_score >= 0 AND risk_score <= 100),
  high_risk_words TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_risk_template ON public.template_risk_scores(template_id);
CREATE INDEX IF NOT EXISTS idx_template_risk_campaign ON public.template_risk_scores(campaign_id);
CREATE INDEX IF NOT EXISTS idx_template_risk_score ON public.template_risk_scores(risk_score);

-- 3. Create bounce events tracking table (if not exists)
CREATE TABLE IF NOT EXISTS public.bounce_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id UUID REFERENCES public.mailboxes(id) ON DELETE CASCADE,
  lead_id UUID,
  campaign_id UUID,
  email TEXT NOT NULL,
  bounce_type TEXT CHECK (bounce_type IN ('hard', 'soft', 'complaint')),
  bounce_reason TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bounce_events_mailbox ON public.bounce_events(mailbox_id);
CREATE INDEX IF NOT EXISTS idx_bounce_events_date ON public.bounce_events(occurred_at DESC);

-- 4. Function to get warmup limit based on warmup_level
CREATE OR REPLACE FUNCTION public.get_warmup_limit(p_warmup_level INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  warmup_curve INTEGER[] := ARRAY[10, 20, 30, 40, 60, 80, 100, 120, 150, 200];
BEGIN
  IF p_warmup_level < 1 THEN
    RETURN 10;
  ELSIF p_warmup_level > array_length(warmup_curve, 1) THEN
    RETURN 200;
  ELSE
    RETURN warmup_curve[p_warmup_level];
  END IF;
END;
$$;

-- 5. Function to check if mailbox can send
CREATE OR REPLACE FUNCTION public.can_mailbox_send(p_mailbox_id UUID)
RETURNS TABLE(
  can_send BOOLEAN,
  reason TEXT,
  current_limit INTEGER,
  sends_used INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_mailbox RECORD;
  v_warmup_limit INTEGER;
  v_daily_limit INTEGER;
BEGIN
  SELECT 
    m.send_limit_daily,
    m.warmup_active,
    m.warmup_level,
    m.sends_today,
    m.bounces_today,
    m.paused,
    m.reputation_score
  INTO v_mailbox
  FROM public.mailboxes m
  WHERE m.id = p_mailbox_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'mailbox_not_found'::TEXT, 0, 0;
    RETURN;
  END IF;

  -- Check if paused
  IF v_mailbox.paused THEN
    RETURN QUERY SELECT false, 'mailbox_paused'::TEXT, 0, v_mailbox.sends_today;
    RETURN;
  END IF;

  -- Check bounce rate (5% threshold)
  IF v_mailbox.sends_today > 0 AND (v_mailbox.bounces_today::FLOAT / v_mailbox.sends_today) > 0.05 THEN
    RETURN QUERY SELECT false, 'bounce_rate_too_high'::TEXT, 0, v_mailbox.sends_today;
    RETURN;
  END IF;

  -- Determine daily limit
  v_daily_limit := v_mailbox.send_limit_daily;
  
  IF v_mailbox.warmup_active THEN
    v_warmup_limit := public.get_warmup_limit(v_mailbox.warmup_level);
    v_daily_limit := LEAST(v_daily_limit, v_warmup_limit);
  END IF;

  -- Check if limit reached
  IF v_mailbox.sends_today >= v_daily_limit THEN
    RETURN QUERY SELECT false, 'daily_limit_reached'::TEXT, v_daily_limit, v_mailbox.sends_today;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'ok'::TEXT, v_daily_limit, v_mailbox.sends_today;
END;
$$;

-- 6. Function to increment mailbox sends
CREATE OR REPLACE FUNCTION public.increment_mailbox_sends(
  p_mailbox_id UUID,
  p_increment INTEGER DEFAULT 1
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  UPDATE public.mailboxes
  SET sends_today = sends_today + p_increment,
      updated_at = NOW()
  WHERE id = p_mailbox_id
  RETURNING sends_today INTO v_new_count;
  
  RETURN COALESCE(v_new_count, 0);
END;
$$;

-- 7. Function to increment mailbox bounces
CREATE OR REPLACE FUNCTION public.increment_mailbox_bounces(
  p_mailbox_id UUID,
  p_increment INTEGER DEFAULT 1
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  UPDATE public.mailboxes
  SET bounces_today = bounces_today + p_increment,
      updated_at = NOW()
  WHERE id = p_mailbox_id
  RETURNING bounces_today INTO v_new_count;
  
  RETURN COALESCE(v_new_count, 0);
END;
$$;

-- 8. Function to pause mailbox if bounce rate too high
CREATE OR REPLACE FUNCTION public.check_and_pause_mailbox(p_mailbox_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_mailbox RECORD;
  v_bounce_rate FLOAT;
BEGIN
  SELECT sends_today, bounces_today, paused
  INTO v_mailbox
  FROM public.mailboxes
  WHERE id = p_mailbox_id;

  IF NOT FOUND OR v_mailbox.paused THEN
    RETURN false;
  END IF;

  IF v_mailbox.sends_today > 0 THEN
    v_bounce_rate := v_mailbox.bounces_today::FLOAT / v_mailbox.sends_today;
    
    IF v_bounce_rate > 0.05 THEN
      UPDATE public.mailboxes
      SET paused = true,
          updated_at = NOW()
      WHERE id = p_mailbox_id;
      
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$$;

-- 9. Function to reset daily counters and progress warmup
CREATE OR REPLACE FUNCTION public.reset_mailbox_daily()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_reset_count INTEGER := 0;
  v_warmup_curve INTEGER[] := ARRAY[10, 20, 30, 40, 60, 80, 100, 120, 150, 200];
  v_max_level INTEGER := array_length(v_warmup_curve, 1);
BEGIN
  -- Reset counters and progress warmup for all mailboxes
  UPDATE public.mailboxes
  SET 
    sends_today = 0,
    bounces_today = 0,
    last_reset = CURRENT_DATE,
    warmup_level = CASE 
      WHEN warmup_active AND warmup_level < v_max_level 
      THEN warmup_level + 1
      ELSE warmup_level
    END,
    paused = CASE
      WHEN paused AND sends_today = 0 AND bounces_today = 0
      THEN false  -- Auto-resume if no activity
      ELSE paused
    END,
    updated_at = NOW()
  WHERE last_reset < CURRENT_DATE;
  
  GET DIAGNOSTICS v_reset_count = ROW_COUNT;
  
  RETURN v_reset_count;
END;
$$;

-- 10. Function to get least used mailbox for rotation
CREATE OR REPLACE FUNCTION public.get_least_used_mailbox(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_mailbox_id UUID;
BEGIN
  SELECT m.id INTO v_mailbox_id
  FROM public.mailboxes m
  WHERE m.user_id = p_user_id
    AND m.is_active = true
    AND (m.paused IS NULL OR m.paused = false)
    AND EXISTS (
      SELECT 1 FROM public.can_mailbox_send(m.id) cms
      WHERE cms.can_send = true
    )
  ORDER BY m.sends_today ASC, m.created_at ASC
  LIMIT 1;
  
  RETURN v_mailbox_id;
END;
$$;

-- 11. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_mailboxes_user_active 
  ON public.mailboxes(user_id, is_active) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_mailboxes_warmup 
  ON public.mailboxes(warmup_active, warmup_level) 
  WHERE warmup_active = true;

CREATE INDEX IF NOT EXISTS idx_mailboxes_sends_today 
  ON public.mailboxes(sends_today, send_limit_daily);

CREATE INDEX IF NOT EXISTS idx_mailboxes_reputation 
  ON public.mailboxes(reputation_score);

-- 12. Grant permissions
GRANT EXECUTE ON FUNCTION public.get_warmup_limit(INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_mailbox_send(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_mailbox_sends(UUID, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_mailbox_bounces(UUID, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_and_pause_mailbox(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_mailbox_daily() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_least_used_mailbox(UUID) TO authenticated, service_role;

-- 13. Schedule daily reset cron job (runs at 1 AM UTC)
SELECT cron.schedule(
  'reset-mailbox-daily',
  '0 1 * * *',  -- 1 AM UTC daily
  $$
  SELECT public.reset_mailbox_daily();
  $$
);

COMMENT ON FUNCTION public.get_warmup_limit(INTEGER) IS 'Returns warmup limit based on warmup level (10, 20, 30, 40, 60, 80, 100, 120, 150, 200)';
COMMENT ON FUNCTION public.can_mailbox_send(UUID) IS 'Checks if mailbox can send based on limits, warmup, bounce rate';
COMMENT ON FUNCTION public.reset_mailbox_daily() IS 'Resets daily counters and progresses warmup level (called by cron)';
COMMENT ON FUNCTION public.get_least_used_mailbox(UUID) IS 'Returns least used mailbox for smart rotation';










