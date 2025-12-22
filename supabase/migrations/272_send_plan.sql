-- Block 255 — Daily Send Planner v1
-- Send Plan Table + Warmup Support

-- 1. Add warmup_started_at column to mailboxes table
ALTER TABLE public.mailboxes
  ADD COLUMN IF NOT EXISTS warmup_started_at timestamptz;

-- 2. Add daily_cap column if it doesn't exist (for user-configured max)
ALTER TABLE public.mailboxes
  ADD COLUMN IF NOT EXISTS daily_cap int DEFAULT 200;

-- 3. Create send_plan table
CREATE TABLE IF NOT EXISTS public.send_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  date date NOT NULL,
  plan jsonb NOT NULL,   -- array of { mailbox_id, max_sends, status }
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id, date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_send_plan_workspace ON public.send_plan(workspace_id);
CREATE INDEX IF NOT EXISTS idx_send_plan_date ON public.send_plan(date DESC);
CREATE INDEX IF NOT EXISTS idx_send_plan_workspace_date ON public.send_plan(workspace_id, date DESC);

-- Enable RLS
ALTER TABLE public.send_plan ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view plans for their workspace
CREATE POLICY "send_plan_select_workspace" ON public.send_plan
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid() AND status = 'active'
    )
    OR workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Service role can insert/update plans
CREATE POLICY "send_plan_insert_service" ON public.send_plan
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "send_plan_update_service" ON public.send_plan
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Function to get warmup day for a mailbox
CREATE OR REPLACE FUNCTION public.get_warmup_day(p_mailbox_id uuid)
RETURNS int
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_warmup_started_at timestamptz;
  v_days int;
BEGIN
  SELECT warmup_started_at INTO v_warmup_started_at
  FROM public.mailboxes
  WHERE id = p_mailbox_id;
  
  IF v_warmup_started_at IS NULL THEN
    RETURN 0; -- Not started yet
  END IF;
  
  v_days := EXTRACT(EPOCH FROM (CURRENT_DATE - v_warmup_started_at::date)) / 86400;
  RETURN GREATEST(0, v_days::int);
END;
$$;

-- Function to get warmup limit for a mailbox based on day
CREATE OR REPLACE FUNCTION public.get_warmup_limit(p_mailbox_id uuid)
RETURNS int
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_day int;
  v_warmup_curve int[] := ARRAY[10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140, 145, 150];
  v_max_day int;
BEGIN
  v_day := public.get_warmup_day(p_mailbox_id);
  
  IF v_day = 0 THEN
    RETURN 0; -- Not started
  END IF;
  
  v_max_day := array_length(v_warmup_curve, 1);
  
  IF v_day > 0 AND v_day <= v_max_day THEN
    RETURN v_warmup_curve[v_day];
  ELSIF v_day > v_max_day THEN
    -- After warmup period, return max from curve
    RETURN v_warmup_curve[v_max_day];
  ELSE
    -- Day 0 or negative, not started
    RETURN 0;
  END IF;
END;
$$;

-- Function to compute 7-day bounce rate for a mailbox
CREATE OR REPLACE FUNCTION public.compute_7d_bounce_rate(p_mailbox_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total_sent int;
  v_total_bounces int;
  v_bounce_rate numeric;
BEGIN
  -- Get total sent in last 7 days from mailbox_stats
  SELECT COALESCE(SUM(sent), 0) INTO v_total_sent
  FROM public.mailbox_stats
  WHERE mailbox_id = p_mailbox_id
    AND date >= CURRENT_DATE - INTERVAL '7 days';
  
  -- Get total bounces in last 7 days from bounces table
  SELECT COUNT(*) INTO v_total_bounces
  FROM public.bounces
  WHERE mailbox_id = p_mailbox_id
    AND created_at >= CURRENT_DATE - INTERVAL '7 days';
  
  IF v_total_sent = 0 THEN
    RETURN 0;
  END IF;
  
  v_bounce_rate := (v_total_bounces::numeric / v_total_sent::numeric) * 100;
  RETURN v_bounce_rate;
END;
$$;

-- Function to compute safe limit for a mailbox
CREATE OR REPLACE FUNCTION public.compute_safe_limit(p_mailbox_id uuid)
RETURNS int
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_warmup_limit int;
  v_user_limit int;
  v_health_score int;
  v_bounce_rate numeric;
  v_safe_limit numeric;
BEGIN
  -- Get warmup limit
  v_warmup_limit := public.get_warmup_limit(p_mailbox_id);
  
  -- Get user-configured daily cap
  SELECT COALESCE(daily_cap, 200), COALESCE(health_score, 100)
  INTO v_user_limit, v_health_score
  FROM public.mailboxes
  WHERE id = p_mailbox_id;
  
  -- Get 7-day bounce rate
  v_bounce_rate := public.compute_7d_bounce_rate(p_mailbox_id);
  
  -- If bounce rate > 10%, pause mailbox (return 0)
  IF v_bounce_rate > 10 THEN
    RETURN 0;
  END IF;
  
  -- Calculate base safe limit
  v_safe_limit := LEAST(v_warmup_limit, v_user_limit) * (v_health_score::numeric / 100);
  
  -- Apply bounce rate penalty
  IF v_bounce_rate > 5 THEN
    v_safe_limit := v_safe_limit * 0.5;
  END IF;
  
  RETURN GREATEST(0, FLOOR(v_safe_limit));
END;
$$;

-- Function to get today's plan for a workspace
CREATE OR REPLACE FUNCTION public.get_today_plan(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_plan jsonb;
BEGIN
  SELECT plan INTO v_plan
  FROM public.send_plan
  WHERE workspace_id = p_workspace_id
    AND date = CURRENT_DATE;
  
  RETURN COALESCE(v_plan, '[]'::jsonb);
END;
$$;

-- Function to get remaining budget for a mailbox today
CREATE OR REPLACE FUNCTION public.get_remaining_budget(p_mailbox_id uuid)
RETURNS int
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_workspace_id uuid;
  v_plan jsonb;
  v_max_sends int;
  v_sent_today int;
  v_entry jsonb;
BEGIN
  -- Get workspace_id from mailbox
  SELECT workspace_id INTO v_workspace_id
  FROM public.mailboxes
  WHERE id = p_mailbox_id;
  
  IF v_workspace_id IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Get today's plan
  v_plan := public.get_today_plan(v_workspace_id);
  
  -- Find mailbox entry in plan
  FOR v_entry IN SELECT * FROM jsonb_array_elements(v_plan)
  LOOP
    IF (v_entry->>'mailbox_id')::uuid = p_mailbox_id THEN
      v_max_sends := (v_entry->>'max_sends')::int;
      EXIT;
    END IF;
  END LOOP;
  
  IF v_max_sends IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Get sent count today from mailbox_stats
  SELECT COALESCE(sent, 0) INTO v_sent_today
  FROM public.mailbox_stats
  WHERE mailbox_id = p_mailbox_id
    AND date = CURRENT_DATE;
  
  RETURN GREATEST(0, v_max_sends - v_sent_today);
END;
$$;

-- Function to sync mailbox_stats from send logs and bounces
CREATE OR REPLACE FUNCTION public.sync_mailbox_stats(p_date date DEFAULT CURRENT_DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mailbox_record RECORD;
BEGIN
  -- Loop through all mailboxes
  FOR v_mailbox_record IN SELECT id FROM public.mailboxes
  LOOP
    -- Upsert mailbox_stats for this date
    INSERT INTO public.mailbox_stats (
      mailbox_id,
      date,
      sent,
      bounces
    )
    SELECT
      v_mailbox_record.id,
      p_date,
      COALESCE(COUNT(DISTINCT sl.id), 0) as sent,
      COALESCE(COUNT(DISTINCT b.id), 0) as bounces
    FROM public.mailboxes m
    LEFT JOIN public.send_logs sl ON (
      sl.mailbox_id = m.id 
      AND sl.sent_at::date = p_date
      AND sl.status = 'sent'
    )
    LEFT JOIN public.bounces b ON (
      b.mailbox_id = m.id
      AND b.created_at::date = p_date
    )
    WHERE m.id = v_mailbox_record.id
    GROUP BY m.id
    ON CONFLICT (mailbox_id, date) DO UPDATE SET
      sent = EXCLUDED.sent,
      bounces = EXCLUDED.bounces,
      updated_at = now();
    
    -- Also try email_logs if send_logs doesn't have mailbox_id
    -- This is a fallback for older schemas
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'send_logs' 
      AND column_name = 'mailbox_id'
    ) THEN
      -- Try to match by from_email if email_logs exists
      IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'email_logs'
      ) THEN
        UPDATE public.mailbox_stats ms
        SET sent = (
          SELECT COUNT(*)
          FROM public.email_logs el
          WHERE el.from_email = (SELECT from_email FROM public.mailboxes WHERE id = ms.mailbox_id)
            AND el.sent_at::date = p_date
            AND el.status = 'sent'
        )
        WHERE ms.mailbox_id = v_mailbox_record.id
          AND ms.date = p_date;
      END IF;
    END IF;
  END LOOP;
END;
$$;

-- Function to increment mailbox_stats when a send happens
CREATE OR REPLACE FUNCTION public.increment_mailbox_sent(p_mailbox_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.mailbox_stats (
    mailbox_id,
    date,
    sent
  )
  VALUES (
    p_mailbox_id,
    CURRENT_DATE,
    1
  )
  ON CONFLICT (mailbox_id, date) DO UPDATE SET
    sent = mailbox_stats.sent + 1;
END;
$$;

-- Function to increment mailbox_stats bounce count
CREATE OR REPLACE FUNCTION public.increment_mailbox_bounce(p_mailbox_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.mailbox_stats (
    mailbox_id,
    date,
    bounces
  )
  VALUES (
    p_mailbox_id,
    CURRENT_DATE,
    1
  )
  ON CONFLICT (mailbox_id, date) DO UPDATE SET
    bounces = mailbox_stats.bounces + 1;
END;
$$;

-- Trigger to auto-increment mailbox_stats when send_logs is created with status='sent'
-- Note: This assumes send_logs has mailbox_id column
CREATE OR REPLACE FUNCTION public.trigger_increment_mailbox_sent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'sent' AND NEW.mailbox_id IS NOT NULL THEN
    PERFORM public.increment_mailbox_sent(NEW.mailbox_id);
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger if send_logs table exists and has mailbox_id column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'send_logs'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'send_logs' 
    AND column_name = 'mailbox_id'
  ) THEN
    DROP TRIGGER IF EXISTS trg_increment_mailbox_sent ON public.send_logs;
    CREATE TRIGGER trg_increment_mailbox_sent
      AFTER INSERT OR UPDATE ON public.send_logs
      FOR EACH ROW
      WHEN (NEW.status = 'sent' AND NEW.mailbox_id IS NOT NULL)
      EXECUTE FUNCTION public.trigger_increment_mailbox_sent();
  END IF;
END $$;

-- Trigger to auto-increment mailbox_stats when bounces are created
CREATE OR REPLACE FUNCTION public.trigger_increment_mailbox_bounce()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.mailbox_id IS NOT NULL THEN
    PERFORM public.increment_mailbox_bounce(NEW.mailbox_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_increment_mailbox_bounce ON public.bounces;
CREATE TRIGGER trg_increment_mailbox_bounce
  AFTER INSERT ON public.bounces
  FOR EACH ROW
  WHEN (NEW.mailbox_id IS NOT NULL)
  EXECUTE FUNCTION public.trigger_increment_mailbox_bounce();

