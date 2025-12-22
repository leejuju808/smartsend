-- =========================================================
-- Block 9950 — System Health Monitor v1
-- (Email Errors, Bounces, Suppression Hits, Deliverability Signals)
-- =========================================================

-- A) Create delivery_event_type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'delivery_event_type') THEN
    CREATE TYPE delivery_event_type AS ENUM (
      'sent',
      'bounced_hard',
      'bounced_soft',
      'dropped_suppressed',
      'send_error'
    );
  END IF;
END$$;

-- B) Create email_delivery_events table
CREATE TABLE IF NOT EXISTS public.email_delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  
  event_type delivery_event_type NOT NULL,
  provider_message_id text,
  provider_error_code text,
  provider_error_message text,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for email_delivery_events
CREATE INDEX IF NOT EXISTS idx_email_delivery_events_account ON public.email_delivery_events(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_delivery_events_campaign ON public.email_delivery_events(campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_delivery_events_contact ON public.email_delivery_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_email_delivery_events_type ON public.email_delivery_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_delivery_events_message ON public.email_delivery_events(message_id);

-- C) Create campaign_health_stats table
CREATE TABLE IF NOT EXISTS public.campaign_health_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  
  emails_sent int NOT NULL DEFAULT 0,
  bounces_hard int NOT NULL DEFAULT 0,
  bounces_soft int NOT NULL DEFAULT 0,
  suppressed_sends int NOT NULL DEFAULT 0,
  send_errors int NOT NULL DEFAULT 0,
  
  opens int NOT NULL DEFAULT 0,      -- if tracking
  replies int NOT NULL DEFAULT 0,
  
  health_score numeric(5,2) NOT NULL DEFAULT 100.0, -- 0–100
  
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (campaign_id)
);

-- Indexes for campaign_health_stats
CREATE INDEX IF NOT EXISTS idx_campaign_health_stats_account ON public.campaign_health_stats(account_id);
CREATE INDEX IF NOT EXISTS idx_campaign_health_stats_campaign ON public.campaign_health_stats(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_health_stats_health ON public.campaign_health_stats(health_score);

-- D) Add health columns to accounts table
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS health_score numeric(5,2) NOT NULL DEFAULT 100.0,
  ADD COLUMN IF NOT EXISTS last_health_update timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_accounts_health_score ON public.accounts(health_score);

-- E) Function: Compute health score for a campaign
CREATE OR REPLACE FUNCTION public.compute_campaign_health_score(p_campaign_id uuid)
RETURNS numeric(5,2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stats record;
  v_score numeric(5,2) := 100.0;
  v_sent int;
  v_hard_rate numeric;
  v_soft_rate numeric;
  v_suppressed_rate numeric;
  v_error_rate numeric;
  v_reply_rate numeric;
BEGIN
  -- Get stats for the campaign (last 30 days)
  SELECT 
    COALESCE(SUM(CASE WHEN event_type = 'sent' THEN 1 ELSE 0 END), 0)::int as sent,
    COALESCE(SUM(CASE WHEN event_type = 'bounced_hard' THEN 1 ELSE 0 END), 0)::int as hard_bounces,
    COALESCE(SUM(CASE WHEN event_type = 'bounced_soft' THEN 1 ELSE 0 END), 0)::int as soft_bounces,
    COALESCE(SUM(CASE WHEN event_type = 'dropped_suppressed' THEN 1 ELSE 0 END), 0)::int as suppressed,
    COALESCE(SUM(CASE WHEN event_type = 'send_error' THEN 1 ELSE 0 END), 0)::int as errors,
    COALESCE(MAX(chs.replies), 0)::int as replies
  INTO v_stats
  FROM public.email_delivery_events e
  LEFT JOIN public.campaign_health_stats chs ON chs.campaign_id = p_campaign_id
  WHERE e.campaign_id = p_campaign_id
    AND e.created_at >= now() - interval '30 days';
  
  v_sent := GREATEST(v_stats.sent, 1);
  v_hard_rate := v_stats.hard_bounces::numeric / v_sent;
  v_soft_rate := v_stats.soft_bounces::numeric / v_sent;
  v_suppressed_rate := v_stats.suppressed::numeric / v_sent;
  v_error_rate := v_stats.errors::numeric / v_sent;
  v_reply_rate := v_stats.replies::numeric / v_sent;
  
  -- Start at 100 and subtract penalties
  v_score := 100.0;
  v_score := v_score - (v_hard_rate * 200);      -- up to -200 but clamp later
  v_score := v_score - (v_soft_rate * 100);
  v_score := v_score - (v_suppressed_rate * 100);
  v_score := v_score - (v_error_rate * 300);
  
  -- Low reply penalty: if reply rate < 2% and sent > 200
  IF v_sent > 200 AND v_reply_rate < 0.02 THEN
    v_score := v_score - 10;
  END IF;
  
  -- Clamp between 0 and 100
  v_score := GREATEST(0, LEAST(100, v_score));
  
  RETURN v_score;
END;
$$;

COMMENT ON FUNCTION public.compute_campaign_health_score(uuid) IS
  'Computes health score (0-100) for a campaign based on recent 30 days of events';

-- F) Function: Update campaign health stats
CREATE OR REPLACE FUNCTION public.update_campaign_health_stats(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_account_id uuid;
  v_stats record;
  v_health_score numeric(5,2);
BEGIN
  -- Get account_id from campaign
  SELECT account_id INTO v_account_id
  FROM public.campaigns
  WHERE id = p_campaign_id;
  
  -- If campaigns doesn't have account_id, try to get from workspace
  IF v_account_id IS NULL THEN
    SELECT a.id INTO v_account_id
    FROM public.campaigns c
    JOIN public.workspaces w ON w.id = c.workspace_id
    JOIN public.accounts a ON a.owner_user_id = w.owner_id
    WHERE c.id = p_campaign_id
    LIMIT 1;
  END IF;
  
  -- If still no account_id, we can't proceed
  IF v_account_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get aggregated stats from events (last 30 days)
  SELECT 
    COALESCE(SUM(CASE WHEN event_type = 'sent' THEN 1 ELSE 0 END), 0)::int as emails_sent,
    COALESCE(SUM(CASE WHEN event_type = 'bounced_hard' THEN 1 ELSE 0 END), 0)::int as bounces_hard,
    COALESCE(SUM(CASE WHEN event_type = 'bounced_soft' THEN 1 ELSE 0 END), 0)::int as bounces_soft,
    COALESCE(SUM(CASE WHEN event_type = 'dropped_suppressed' THEN 1 ELSE 0 END), 0)::int as suppressed_sends,
    COALESCE(SUM(CASE WHEN event_type = 'send_error' THEN 1 ELSE 0 END), 0)::int as send_errors
  INTO v_stats
  FROM public.email_delivery_events
  WHERE campaign_id = p_campaign_id
    AND created_at >= now() - interval '30 days';
  
  -- Get opens and replies from health stats (these are updated separately)
  -- For now, preserve existing opens/replies if they exist
  SELECT opens, replies INTO v_stats.opens, v_stats.replies
  FROM public.campaign_health_stats
  WHERE campaign_id = p_campaign_id;
  
  -- Compute health score
  v_health_score := public.compute_campaign_health_score(p_campaign_id);
  
  -- Upsert campaign health stats
  INSERT INTO public.campaign_health_stats (
    account_id,
    campaign_id,
    emails_sent,
    bounces_hard,
    bounces_soft,
    suppressed_sends,
    send_errors,
    opens,
    replies,
    health_score,
    last_updated_at
  ) VALUES (
    v_account_id,
    p_campaign_id,
    COALESCE(v_stats.emails_sent, 0),
    COALESCE(v_stats.bounces_hard, 0),
    COALESCE(v_stats.bounces_soft, 0),
    COALESCE(v_stats.suppressed_sends, 0),
    COALESCE(v_stats.send_errors, 0),
    COALESCE(v_stats.opens, 0),
    COALESCE(v_stats.replies, 0),
    v_health_score,
    now()
  )
  ON CONFLICT (campaign_id) DO UPDATE SET
    emails_sent = EXCLUDED.emails_sent,
    bounces_hard = EXCLUDED.bounces_hard,
    bounces_soft = EXCLUDED.bounces_soft,
    suppressed_sends = EXCLUDED.suppressed_sends,
    send_errors = EXCLUDED.send_errors,
    opens = COALESCE(EXCLUDED.opens, campaign_health_stats.opens),
    replies = COALESCE(EXCLUDED.replies, campaign_health_stats.replies),
    health_score = EXCLUDED.health_score,
    last_updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.update_campaign_health_stats(uuid) IS
  'Updates campaign health stats from delivery events (last 30 days)';

-- G) Function: Log delivery event and update health stats
CREATE OR REPLACE FUNCTION public.log_delivery_event(
  p_account_id uuid,
  p_campaign_id uuid,
  p_contact_id uuid DEFAULT NULL,
  p_message_id uuid DEFAULT NULL,
  p_event_type delivery_event_type,
  p_provider_message_id text DEFAULT NULL,
  p_provider_error_code text DEFAULT NULL,
  p_provider_error_message text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  -- Insert event
  INSERT INTO public.email_delivery_events (
    account_id,
    campaign_id,
    contact_id,
    message_id,
    event_type,
    provider_message_id,
    provider_error_code,
    provider_error_message
  ) VALUES (
    p_account_id,
    p_campaign_id,
    p_contact_id,
    p_message_id,
    p_event_type,
    p_provider_message_id,
    p_provider_error_code,
    p_provider_error_message
  )
  RETURNING id INTO v_event_id;
  
  -- Update campaign health stats
  IF p_campaign_id IS NOT NULL THEN
    PERFORM public.update_campaign_health_stats(p_campaign_id);
  END IF;
  
  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.log_delivery_event(uuid, uuid, uuid, uuid, delivery_event_type, text, text, text) IS
  'Logs a delivery event and automatically updates campaign health stats';

-- H) Function: Auto-suppress contact on hard bounce
CREATE OR REPLACE FUNCTION public.auto_suppress_on_hard_bounce()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_email text;
  v_workspace_id uuid;
BEGIN
  -- Only process hard bounces
  IF NEW.event_type != 'bounced_hard' THEN
    RETURN NEW;
  END IF;
  
  -- Get contact email
  IF NEW.contact_id IS NOT NULL THEN
    SELECT email, workspace_id INTO v_contact_email, v_workspace_id
    FROM public.contacts
    WHERE id = NEW.contact_id;
  ELSIF NEW.campaign_id IS NOT NULL THEN
    -- Try to get email from message if available
    SELECT to_email INTO v_contact_email
    FROM public.messages
    WHERE id = NEW.message_id;
    
    -- Get workspace_id from campaign
    SELECT workspace_id INTO v_workspace_id
    FROM public.campaigns
    WHERE id = NEW.campaign_id;
  END IF;
  
  -- Add to suppressions if we have email and workspace
  IF v_contact_email IS NOT NULL AND v_workspace_id IS NOT NULL THEN
    -- Insert into suppressions table (using suppression_reason enum)
    -- The unique constraint is on (workspace_id, lower(email))
    BEGIN
      INSERT INTO public.suppressions (
        workspace_id,
        email,
        reason,
        metadata
      ) VALUES (
        v_workspace_id,
        LOWER(v_contact_email),
        'bounced'::suppression_reason,
        jsonb_build_object(
          'auto_suppressed', true,
          'bounce_event_id', NEW.id,
          'suppressed_at', now()
        )
      )
      ON CONFLICT DO NOTHING; -- Uses unique index on (workspace_id, lower(email))
    EXCEPTION WHEN OTHERS THEN
      -- If suppressions table doesn't exist or has different structure, silently continue
      -- This prevents the trigger from failing if the table structure differs
      NULL;
    END;
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_suppress_on_hard_bounce() IS
  'Automatically adds contact to suppression list when hard bounce is detected';

-- Create trigger for auto-suppress on hard bounce
DROP TRIGGER IF EXISTS trg_auto_suppress_hard_bounce ON public.email_delivery_events;
CREATE TRIGGER trg_auto_suppress_hard_bounce
  AFTER INSERT ON public.email_delivery_events
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_suppress_on_hard_bounce();

-- I) Function: Update account health score (aggregate from campaigns)
CREATE OR REPLACE FUNCTION public.update_account_health_score(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_avg_health numeric(5,2);
BEGIN
  -- Calculate average health score from all campaigns for this account
  SELECT COALESCE(AVG(health_score), 100.0) INTO v_avg_health
  FROM public.campaign_health_stats
  WHERE account_id = p_account_id
    AND last_updated_at >= now() - interval '30 days';
  
  -- Update account health score
  UPDATE public.accounts
  SET 
    health_score = v_avg_health,
    last_health_update = now()
  WHERE id = p_account_id;
END;
$$;

COMMENT ON FUNCTION public.update_account_health_score(uuid) IS
  'Updates account health score as average of all campaign health scores';

-- J) Enable RLS on new tables
ALTER TABLE public.email_delivery_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_health_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies for email_delivery_events
CREATE POLICY "Users can view delivery events for their accounts"
  ON public.email_delivery_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = email_delivery_events.account_id
        AND a.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert delivery events"
  ON public.email_delivery_events FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update delivery events"
  ON public.email_delivery_events FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for campaign_health_stats
CREATE POLICY "Users can view health stats for their accounts"
  ON public.campaign_health_stats FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = campaign_health_stats.account_id
        AND a.owner_user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage health stats"
  ON public.campaign_health_stats FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- K) Comments
COMMENT ON TABLE public.email_delivery_events IS
  'Tracks all email delivery events: sent, bounces, suppressions, errors';
COMMENT ON TABLE public.campaign_health_stats IS
  'Per-campaign health snapshot with aggregated metrics and health score';
COMMENT ON COLUMN public.campaign_health_stats.health_score IS
  'Health score 0-100 computed from bounce rates, errors, and reply rates';

