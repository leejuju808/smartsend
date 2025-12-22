-- =========================================================
-- Block 29572 — SmartSend Roofing "Smart Lead Scoring + Priority Engine" v1
-- Score every lead • Detect high-value jobs • Auto-sort the pipeline • Make roofers focus ONLY on money-ready homeowners
-- =========================================================

-- ============================================================================
-- 1. CREATE lead_scores TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lead_scores (
  lead_id uuid PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  score int DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  last_updated timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_scores_score ON public.lead_scores(score DESC);
CREATE INDEX IF NOT EXISTS idx_lead_scores_last_updated ON public.lead_scores(last_updated DESC);

-- ============================================================================
-- 2. CREATE lead_score_logs TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lead_score_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  signal text NOT NULL,
  value int NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_score_logs_lead_id ON public.lead_score_logs(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_score_logs_signal ON public.lead_score_logs(signal);

-- ============================================================================
-- 3. ENSURE pg_net EXTENSION (for edge function calls)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================================
-- 4. FUNCTION — UPDATE LEAD SCORE
-- ============================================================================
-- This central RPC recalculates score anytime something changes

CREATE OR REPLACE FUNCTION public.update_lead_score(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total_score int := 0;
  signal_value int;
  signal_name text;
  v_last_message_time timestamptz;
  v_reply_time_minutes int;
  prev_score int;
  score_changed boolean := false;
BEGIN
  -- Initialize score
  total_score := 0;

  -- HOT INTENT (+40 points per occurrence)
  SELECT COUNT(*) * 40 INTO signal_value
  FROM public.inbox_messages im
  WHERE im.lead_id = p_lead_id 
    AND (im.ai_intent = 'hot_lead' 
         OR im.ai_intent_label = 'hot_lead'
         OR im.intent = 'hot_lead'
         OR im.ai_label = 'positive');
  
  IF signal_value > 0 THEN
    total_score := total_score + signal_value;
    INSERT INTO public.lead_score_logs (lead_id, signal, value)
    VALUES (p_lead_id, 'Hot Intent', signal_value);
  END IF;

  -- WARM INTENT (+20 points per occurrence)
  SELECT COUNT(*) * 20 INTO signal_value
  FROM public.inbox_messages im
  WHERE im.lead_id = p_lead_id 
    AND (im.ai_intent = 'warm_lead' 
         OR im.ai_intent_label = 'warm_lead'
         OR im.intent = 'warm_lead');
  
  IF signal_value > 0 THEN
    total_score := total_score + signal_value;
    INSERT INTO public.lead_score_logs (lead_id, signal, value)
    VALUES (p_lead_id, 'Warm Intent', signal_value);
  END IF;

  -- PRICE QUESTIONS (+10 points per occurrence)
  SELECT COUNT(*) * 10 INTO signal_value
  FROM public.inbox_messages im
  WHERE im.lead_id = p_lead_id 
    AND (im.ai_intent = 'price_question'
         OR im.ai_intent_label = 'price_question'
         OR im.intent = 'price_question'
         OR im.ai_intent_label LIKE '%price%'
         OR im.intent LIKE '%price%');
  
  IF signal_value > 0 THEN
    total_score := total_score + signal_value;
    INSERT INTO public.lead_score_logs (lead_id, signal, value)
    VALUES (p_lead_id, 'Price Question', signal_value);
  END IF;

  -- REPLIES WITHIN 5 MINUTES (+10 points)
  -- Check if there's a reply within 5 minutes of a sent message
  SELECT 
    CASE 
      WHEN EXISTS (
        SELECT 1
        FROM public.inbox_messages im
        WHERE im.lead_id = p_lead_id
          AND im.direction = 'inbound'
          AND im.received_at IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.send_logs sl
            WHERE sl.lead_id = p_lead_id
              AND im.received_at <= sl.sent_at + interval '5 minutes'
              AND im.received_at > sl.sent_at
          )
      ) THEN 10
      ELSE 0
    END INTO signal_value;
  
  IF signal_value > 0 THEN
    total_score := total_score + signal_value;
    INSERT INTO public.lead_score_logs (lead_id, signal, value)
    VALUES (p_lead_id, 'Fast Reply (5min)', signal_value);
  END IF;

  -- REFERRAL LEAD (+20 points)
  IF EXISTS (
    SELECT 1 FROM public.leads 
    WHERE id = p_lead_id 
    AND (source = 'referral' OR source ILIKE '%referral%')
  ) THEN
    signal_value := 20;
    total_score := total_score + signal_value;
    INSERT INTO public.lead_score_logs (lead_id, signal, value)
    VALUES (p_lead_id, 'Referral Lead', signal_value);
  END IF;

  -- HIGH VALUE QUOTE ($15k+) (+10 points)
  SELECT 
    CASE 
      WHEN EXISTS (
        SELECT 1 
        FROM public.quotes q
        WHERE q.lead_id = p_lead_id 
        AND q.total >= 15000
      ) THEN 10
      ELSE 0
    END INTO signal_value;
  
  IF signal_value > 0 THEN
    total_score := total_score + signal_value;
    INSERT INTO public.lead_score_logs (lead_id, signal, value)
    VALUES (p_lead_id, 'High Value Quote ($15k+)', signal_value);
  END IF;

  -- INSURANCE JOB (+10 points)
  -- Check multiple sources for insurance indicators
  SELECT 
    CASE 
      WHEN EXISTS (
        SELECT 1 
        FROM public.inbox_threads it
        WHERE it.lead_id = p_lead_id 
        AND (it.is_insurance_claim = true 
             OR it.insurance_claim_status IS NOT NULL
             OR it.insurance_carrier IS NOT NULL)
      ) 
      OR EXISTS (
        SELECT 1
        FROM public.insurance_metadata im
        JOIN public.contacts c ON c.id = im.contact_id
        JOIN public.leads l ON l.email = c.email
        WHERE l.id = p_lead_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.insurance_claims ic
        JOIN public.contacts c ON c.id = ic.contact_id
        JOIN public.leads l ON l.email = c.email
        WHERE l.id = p_lead_id
      ) THEN 10
      ELSE 0
    END INTO signal_value;
  
  IF signal_value > 0 THEN
    total_score := total_score + signal_value;
    INSERT INTO public.lead_score_logs (lead_id, signal, value)
    VALUES (p_lead_id, 'Insurance Job', signal_value);
  END IF;

  -- EMAIL ENGAGEMENT: Opens (+5 points per open, max 10 points)
  SELECT LEAST(COUNT(*) * 5, 10) INTO signal_value
  FROM public.email_events ee
  WHERE ee.lead_id = p_lead_id 
    AND (ee.event_type = 'open' OR ee.event_type = 'opened');
  
  IF signal_value > 0 THEN
    total_score := total_score + signal_value;
    INSERT INTO public.lead_score_logs (lead_id, signal, value)
    VALUES (p_lead_id, 'Email Opens', signal_value);
  END IF;

  -- EMAIL ENGAGEMENT: Clicks (+5 points per click, max 10 points)
  SELECT LEAST(COUNT(*) * 5, 10) INTO signal_value
  FROM public.email_events ee
  WHERE ee.lead_id = p_lead_id 
    AND (ee.event_type = 'click' OR ee.event_type = 'clicked');
  
  IF signal_value > 0 THEN
    total_score := total_score + signal_value;
    INSERT INTO public.lead_score_logs (lead_id, signal, value)
    VALUES (p_lead_id, 'Email Clicks', signal_value);
  END IF;

  -- NO RESPONSE PENALTY (-10 points if no reply in 7 days)
  SELECT MAX(im.received_at) INTO v_last_message_time
  FROM public.inbox_messages im
  WHERE im.lead_id = p_lead_id 
    AND im.direction = 'inbound';
  
  IF v_last_message_time IS NULL THEN
    -- Check last activity from leads table
    SELECT MAX(created_at) INTO v_last_message_time
    FROM public.leads
    WHERE id = p_lead_id;
  END IF;

  IF v_last_message_time IS NOT NULL AND v_last_message_time < now() - interval '7 days' THEN
    signal_value := -10;
    total_score := total_score + signal_value;
    INSERT INTO public.lead_score_logs (lead_id, signal, value)
    VALUES (p_lead_id, 'No Response 7 Days', signal_value);
  END IF;

  -- NOT INTERESTED DROP (-40 points per occurrence)
  SELECT COUNT(*) * 40 INTO signal_value
  FROM public.inbox_messages im
  WHERE im.lead_id = p_lead_id 
    AND (im.ai_intent = 'not_interested' 
         OR im.ai_intent_label = 'not_interested'
         OR im.intent = 'not_interested'
         OR im.ai_label = 'negative'
         OR LOWER(im.body_clean) LIKE '%not interested%'
         OR LOWER(im.body_clean) LIKE '%stop%contact%'
         OR LOWER(im.body_raw) LIKE '%not interested%'
         OR LOWER(im.body_raw) LIKE '%stop%contact%');
  
  IF signal_value > 0 THEN
    total_score := total_score - signal_value;
    INSERT INTO public.lead_score_logs (lead_id, signal, value)
    VALUES (p_lead_id, 'Not Interested', -signal_value);
  END IF;

  -- Clamp score between 0 and 100
  total_score := GREATEST(0, LEAST(100, total_score));

  -- Get previous score to check if it changed
  SELECT score INTO prev_score
  FROM public.lead_scores
  WHERE lead_id = p_lead_id;

  -- Check if score changed
  IF prev_score IS NULL OR prev_score != total_score THEN
    score_changed := true;
  END IF;

  -- Upsert score
  INSERT INTO public.lead_scores (lead_id, score, last_updated)
  VALUES (p_lead_id, total_score, now())
  ON CONFLICT (lead_id)
  DO UPDATE SET 
    score = total_score,
    last_updated = now();

  -- Call edge function if score changed and pg_net is available
  IF score_changed AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    DECLARE
      func_url text;
      payload jsonb;
    BEGIN
      func_url := COALESCE(
        current_setting('app.supabase_url', true),
        current_setting('app.public_supabase_url', true),
        'https://' || current_setting('app.project_ref', true) || '.supabase.co'
      ) || '/functions/v1/score-router';

      payload := jsonb_build_object(
        'lead_id', p_lead_id,
        'score', total_score
      );

      -- Fire and forget - don't wait for response
      PERFORM net.http_post(
        url := func_url,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(
            current_setting('app.supabase_service_role_key', true),
            current_setting('app.service_role_key', true)
          )
        ),
        body := payload
      );
    EXCEPTION
      WHEN OTHERS THEN
        -- Log warning but don't fail the function
        RAISE WARNING 'Failed to call score-router edge function: %', SQLERRM;
    END;
  END IF;

END;
$$;

-- ============================================================================
-- 5. TRIGGERS — Auto-update score on events
-- ============================================================================

-- Trigger function for inbox_messages
CREATE OR REPLACE FUNCTION public.trigger_update_lead_score_from_message()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL THEN
    PERFORM public.update_lead_score(NEW.lead_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS score_after_reply ON public.inbox_messages;
CREATE TRIGGER score_after_reply
AFTER INSERT OR UPDATE ON public.inbox_messages
FOR EACH ROW
WHEN (NEW.lead_id IS NOT NULL)
EXECUTE FUNCTION public.trigger_update_lead_score_from_message();

-- Trigger function for quotes
CREATE OR REPLACE FUNCTION public.trigger_update_lead_score_from_quote()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL THEN
    PERFORM public.update_lead_score(NEW.lead_id);
  ELSIF OLD.lead_id IS NOT NULL THEN
    PERFORM public.update_lead_score(OLD.lead_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS score_after_quote ON public.quotes;
CREATE TRIGGER score_after_quote
AFTER INSERT OR UPDATE ON public.quotes
FOR EACH ROW
WHEN (NEW.lead_id IS NOT NULL)
EXECUTE FUNCTION public.trigger_update_lead_score_from_quote();

-- Trigger function for leads
CREATE OR REPLACE FUNCTION public.trigger_update_lead_score_from_lead()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.update_lead_score(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS score_after_lead_update ON public.leads;
CREATE TRIGGER score_after_lead_update
AFTER UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.trigger_update_lead_score_from_lead();

-- Trigger for email_events
CREATE OR REPLACE FUNCTION public.trigger_update_lead_score_from_email_event()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL THEN
    PERFORM public.update_lead_score(NEW.lead_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS score_after_email_event ON public.email_events;
CREATE TRIGGER score_after_email_event
AFTER INSERT OR UPDATE ON public.email_events
FOR EACH ROW
WHEN (NEW.lead_id IS NOT NULL)
EXECUTE FUNCTION public.trigger_update_lead_score_from_email_event();

-- ============================================================================
-- 6. HELPER FUNCTION — Get score breakdown
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_lead_score_breakdown(p_lead_id uuid)
RETURNS TABLE (
  signal text,
  value int,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    lsl.signal,
    lsl.value,
    lsl.created_at
  FROM public.lead_score_logs lsl
  WHERE lsl.lead_id = p_lead_id
  ORDER BY lsl.created_at DESC;
END;
$$;

-- ============================================================================
-- 7. HELPER FUNCTION — Get priority bucket
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_lead_priority_bucket(p_score int)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE
    WHEN p_score >= 70 THEN '🔥 Priority'
    WHEN p_score >= 40 THEN '⚠️ Warm'
    WHEN p_score >= 10 THEN '🌥️ Low'
    ELSE '🧊 Cold'
  END;
END;
$$;

-- ============================================================================
-- 8. RLS POLICIES
-- ============================================================================

ALTER TABLE public.lead_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_score_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view scores for leads in their workspace
CREATE POLICY "Users can view scores for workspace leads"
ON public.lead_scores
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
    WHERE l.id = lead_scores.lead_id
      AND wm.user_id = auth.uid()
  )
);

-- Policy: Service role can manage scores
CREATE POLICY "Service role can manage scores"
ON public.lead_scores
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy: Users can view score logs for leads in their workspace
CREATE POLICY "Users can view score logs for workspace leads"
ON public.lead_score_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.leads l
    JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
    WHERE l.id = lead_score_logs.lead_id
      AND wm.user_id = auth.uid()
  )
);

-- Policy: Service role can manage score logs
CREATE POLICY "Service role can manage score logs"
ON public.lead_score_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- 9. INITIALIZE SCORES FOR EXISTING LEADS
-- ============================================================================

-- Note: This will run on migration but can be slow for large datasets
-- Consider running it separately if you have many leads
-- DO $$
-- DECLARE
--   lead_record RECORD;
-- BEGIN
--   FOR lead_record IN SELECT id FROM public.leads LOOP
--     PERFORM public.update_lead_score(lead_record.id);
--   END LOOP;
-- END $$;

COMMENT ON TABLE public.lead_scores IS 'Block 29572: Smart Lead Scoring - Stores 0-100 score for each lead';
COMMENT ON TABLE public.lead_score_logs IS 'Block 29572: Smart Lead Scoring - Logs all score changes with signals';
COMMENT ON FUNCTION public.update_lead_score IS 'Block 29572: Recalculates lead score based on all signals';
COMMENT ON FUNCTION public.get_lead_score_breakdown IS 'Block 29572: Returns detailed score breakdown for a lead';
COMMENT ON FUNCTION public.get_lead_priority_bucket IS 'Block 29572: Returns priority bucket emoji+label for a score';


































