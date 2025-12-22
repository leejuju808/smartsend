-- =========================================================
-- Block 19600 — SmartSend Owner Inbox v1
-- (The Unified Roofing Inbox: All Replies, All Channels, AI Sorting, Lead Ranking & Action Buttons)
-- =========================================================

-- ============================================================================
-- 1. ENHANCE INBOX_MESSAGES WITH AI CLASSIFICATION & LEAD RANKING
-- ============================================================================

-- Add AI intent classification fields
ALTER TABLE IF EXISTS public.inbox_messages
  ADD COLUMN IF NOT EXISTS ai_intent_tag text CHECK (ai_intent_tag IN ('hot_lead', 'warm_lead', 'cold_lead', 'dead_lead', 'follow_up_needed')),
  ADD COLUMN IF NOT EXISTS ai_intent_confidence numeric(3,2) CHECK (ai_intent_confidence >= 0 AND ai_intent_confidence <= 1),
  ADD COLUMN IF NOT EXISTS ai_classified_at timestamptz,
  ADD COLUMN IF NOT EXISTS ai_summary text, -- AI-generated summary of the reply
  ADD COLUMN IF NOT EXISTS ai_recommended_response text; -- AI-generated recommended response

-- Add lead ranking score (0-100)
ALTER TABLE IF EXISTS public.inbox_threads
  ADD COLUMN IF NOT EXISTS lead_ranking_score integer CHECK (lead_ranking_score >= 0 AND lead_ranking_score <= 100) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lead_ranking_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS urgency_alert_sent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS homeowner_name text,
  ADD COLUMN IF NOT EXISTS homeowner_email text,
  ADD COLUMN IF NOT EXISTS lead_value_range text, -- e.g., "$5K-$15K", "TBD"
  ADD COLUMN IF NOT EXISTS follow_up_timer_hours integer; -- Hours until recommended follow-up

-- Indexes for fast filtering and sorting
CREATE INDEX IF NOT EXISTS idx_inbox_messages_ai_intent ON public.inbox_messages(ai_intent_tag) WHERE ai_intent_tag IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_threads_lead_ranking ON public.inbox_threads(lead_ranking_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_urgency ON public.inbox_threads(urgency_alert_sent, lead_ranking_score DESC) WHERE urgency_alert_sent = false AND lead_ranking_score >= 80;

-- ============================================================================
-- 2. AI INTENT CLASSIFICATION FUNCTION
-- ============================================================================
-- Auto-tags replies as Hot/Warm/Cold/Dead/Follow-Up based on content

CREATE OR REPLACE FUNCTION public.classify_reply_intent(
  p_message_id uuid,
  p_body_text text,
  p_subject text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_intent_tag text;
  v_confidence numeric(3,2);
  v_lower_text text;
  v_keywords_hot text[] := ARRAY[
    'leak', 'leaking', 'water', 'damage', 'urgent', 'asap', 'today', 'tomorrow',
    'need quote', 'need estimate', 'ready', 'yes', 'schedule', 'book', 'appointment',
    'missing shingles', 'shingles missing', 'roof damage', 'storm damage',
    'insurance claim', 'adjuster', 'claim number'
  ];
  v_keywords_warm text[] := ARRAY[
    'interested', 'maybe', 'thinking', 'considering', 'price', 'cost', 'how much',
    'questions', 'more info', 'information', 'tell me', 'explain'
  ];
  v_keywords_cold text[] := ARRAY[
    'not interested', 'no thanks', 'not now', 'maybe later', 'checking around',
    'already got quotes', 'decided', 'went with'
  ];
  v_keywords_dead text[] := ARRAY[
    'unsubscribe', 'remove', 'stop', 'don''t contact', 'wrong person',
    'not homeowner', 'sold house', 'moved'
  ];
  v_keywords_followup text[] := ARRAY[
    '?', 'question', 'what', 'how', 'when', 'where', 'why', 'can you',
    'do you', 'will you', 'please explain', 'need help'
  ];
  v_hot_count integer := 0;
  v_warm_count integer := 0;
  v_cold_count integer := 0;
  v_dead_count integer := 0;
  v_followup_count integer := 0;
  v_total_score integer := 0;
BEGIN
  -- Combine body and subject for analysis
  v_lower_text := lower(COALESCE(p_body_text, '') || ' ' || COALESCE(p_subject, ''));
  
  -- Count keyword matches
  SELECT COUNT(*) INTO v_hot_count
  FROM unnest(v_keywords_hot) AS keyword
  WHERE v_lower_text LIKE '%' || keyword || '%';
  
  SELECT COUNT(*) INTO v_warm_count
  FROM unnest(v_keywords_warm) AS keyword
  WHERE v_lower_text LIKE '%' || keyword || '%';
  
  SELECT COUNT(*) INTO v_cold_count
  FROM unnest(v_keywords_cold) AS keyword
  WHERE v_lower_text LIKE '%' || keyword || '%';
  
  SELECT COUNT(*) INTO v_dead_count
  FROM unnest(v_keywords_dead) AS keyword
  WHERE v_lower_text LIKE '%' || keyword || '%';
  
  SELECT COUNT(*) INTO v_followup_count
  FROM unnest(v_keywords_followup) AS keyword
  WHERE v_lower_text LIKE '%' || keyword || '%';
  
  -- Determine intent based on keyword counts and patterns
  IF v_dead_count > 0 THEN
    v_intent_tag := 'dead_lead';
    v_confidence := LEAST(0.9, 0.5 + (v_dead_count * 0.1));
  ELSIF v_hot_count >= 2 OR (v_hot_count >= 1 AND v_lower_text ~* '(urgent|asap|today|tomorrow)') THEN
    v_intent_tag := 'hot_lead';
    v_confidence := LEAST(0.95, 0.7 + (v_hot_count * 0.1));
  ELSIF v_cold_count >= 1 THEN
    v_intent_tag := 'cold_lead';
    v_confidence := LEAST(0.85, 0.6 + (v_cold_count * 0.1));
  ELSIF v_warm_count >= 1 OR v_followup_count >= 2 THEN
    v_intent_tag := 'warm_lead';
    v_confidence := LEAST(0.8, 0.5 + (v_warm_count * 0.1) + (v_followup_count * 0.05));
  ELSIF v_followup_count >= 1 THEN
    v_intent_tag := 'follow_up_needed';
    v_confidence := LEAST(0.75, 0.5 + (v_followup_count * 0.1));
  ELSE
    -- Default to warm if we have any text
    IF length(trim(v_lower_text)) > 10 THEN
      v_intent_tag := 'warm_lead';
      v_confidence := 0.4;
    ELSE
      v_intent_tag := 'cold_lead';
      v_confidence := 0.3;
    END IF;
  END IF;
  
  -- Update the message with classification
  UPDATE public.inbox_messages
  SET 
    ai_intent_tag = v_intent_tag,
    ai_intent_confidence = v_confidence,
    ai_classified_at = now()
  WHERE id = p_message_id;
  
  RETURN jsonb_build_object(
    'intent_tag', v_intent_tag,
    'confidence', v_confidence,
    'hot_count', v_hot_count,
    'warm_count', v_warm_count,
    'cold_count', v_cold_count,
    'dead_count', v_dead_count,
    'followup_count', v_followup_count
  );
END;
$$;

-- ============================================================================
-- 3. LEAD RANKING SCORE FUNCTION (0-100)
-- ============================================================================
-- Calculates lead ranking based on keywords, tone, urgency, location, damage severity

CREATE OR REPLACE FUNCTION public.calculate_lead_ranking_score(
  p_thread_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score integer := 0;
  v_thread_record record;
  v_message_record record;
  v_lower_text text;
  v_keyword_score integer := 0;
  v_urgency_score integer := 0;
  v_tone_score integer := 0;
  v_location_match boolean := false;
  v_damage_severity_score integer := 0;
  v_lead_record record;
BEGIN
  -- Get thread info
  SELECT * INTO v_thread_record
  FROM public.inbox_threads
  WHERE id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Get latest inbound message
  SELECT * INTO v_message_record
  FROM public.inbox_messages
  WHERE thread_id = p_thread_id
    AND direction = 'in'
  ORDER BY sent_at DESC
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  v_lower_text := lower(COALESCE(v_message_record.body, '') || ' ' || COALESCE(v_message_record.subject, ''));
  
  -- 1. KEYWORD SCORING (0-40 points)
  -- High-value keywords
  IF v_lower_text ~* '(leak|leaking|water|damage|urgent|asap|today|tomorrow)' THEN
    v_keyword_score := v_keyword_score + 20;
  END IF;
  
  IF v_lower_text ~* '(need quote|need estimate|ready|yes|schedule|book|appointment)' THEN
    v_keyword_score := v_keyword_score + 20;
  END IF;
  
  IF v_lower_text ~* '(missing shingles|shingles missing|roof damage|storm damage)' THEN
    v_keyword_score := v_keyword_score + 15;
  END IF;
  
  IF v_lower_text ~* '(insurance claim|adjuster|claim number)' THEN
    v_keyword_score := v_keyword_score + 25;
  END IF;
  
  v_keyword_score := LEAST(v_keyword_score, 40);
  
  -- 2. POSITIVE TONE SCORING (0-15 points)
  IF v_lower_text ~* '(yes|sure|absolutely|definitely|let.*do|great|perfect|sounds good)' THEN
    v_tone_score := 15;
  ELSIF v_lower_text ~* '(interested|maybe|thinking|considering)' THEN
    v_tone_score := 8;
  ELSIF v_lower_text ~* '(not interested|no thanks|not now)' THEN
    v_tone_score := -10;
  END IF;
  
  -- 3. TIME URGENCY SCORING (0-20 points)
  IF v_lower_text ~* '(today|asap|immediately|right away|urgent)' THEN
    v_urgency_score := 20;
  ELSIF v_lower_text ~* '(tomorrow|this week|soon|as soon as)' THEN
    v_urgency_score := 15;
  ELSIF v_lower_text ~* '(next week|sometime|when.*available)' THEN
    v_urgency_score := 5;
  END IF;
  
  -- 4. DAMAGE SEVERITY SCORING (0-15 points)
  IF v_lower_text ~* '(leak|leaking|water.*coming|flood|major damage)' THEN
    v_damage_severity_score := 15;
  ELSIF v_lower_text ~* '(missing shingles|damage|problem|issue)' THEN
    v_damage_severity_score := 10;
  ELSIF v_lower_text ~* '(inspection|check|look|evaluate)' THEN
    v_damage_severity_score := 5;
  END IF;
  
  -- 5. LOCATION MATCH (0-10 points)
  -- TODO: Add location matching logic based on lead location vs service area
  -- For now, assume match if lead exists
  SELECT * INTO v_lead_record
  FROM public.leads
  WHERE id = v_thread_record.lead_id;
  
  IF FOUND THEN
    v_location_match := true;
    v_score := v_score + 10;
  END IF;
  
  -- Calculate total score
  v_score := v_keyword_score + v_tone_score + v_urgency_score + v_damage_severity_score + 
             CASE WHEN v_location_match THEN 10 ELSE 0 END;
  
  -- Clamp to 0-100
  v_score := GREATEST(0, LEAST(100, v_score));
  
  -- Update thread with score
  UPDATE public.inbox_threads
  SET 
    lead_ranking_score = v_score,
    lead_ranking_updated_at = now()
  WHERE id = p_thread_id;
  
  RETURN v_score;
END;
$$;

-- ============================================================================
-- 4. TRIGGER: AUTO-CLASSIFY ON REPLY INSERT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_auto_classify_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only classify inbound messages
  IF NEW.direction = 'in' THEN
    -- Classify intent
    PERFORM public.classify_reply_intent(
      NEW.id,
      NEW.body,
      NEW.subject
    );
    
    -- Calculate lead ranking score
    PERFORM public.calculate_lead_ranking_score(NEW.thread_id);
    
    -- Update thread with homeowner info from first inbound message
    IF NEW.sender_email IS NOT NULL THEN
      UPDATE public.inbox_threads
      SET 
        homeowner_email = NEW.sender_email,
        homeowner_name = COALESCE(
          (SELECT name FROM public.leads WHERE id = NEW.lead_id LIMIT 1),
          split_part(NEW.sender_email, '@', 1)
        )
      WHERE id = NEW.thread_id
        AND homeowner_email IS NULL;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_classify_reply ON public.inbox_messages;
CREATE TRIGGER trg_auto_classify_reply
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_auto_classify_reply();

-- ============================================================================
-- 5. NOTIFICATION SYSTEM FOR HOT LEADS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inbox_urgency_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.inbox_messages(id) ON DELETE SET NULL,
  alert_type text NOT NULL CHECK (alert_type IN ('push', 'email', 'dashboard')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbox_urgency_alerts_thread ON public.inbox_urgency_alerts(thread_id);
CREATE INDEX IF NOT EXISTS idx_inbox_urgency_alerts_sent ON public.inbox_urgency_alerts(sent_at DESC);

ALTER TABLE public.inbox_urgency_alerts ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view alerts for threads they can view
CREATE POLICY "inbox_urgency_alerts_read"
  ON public.inbox_urgency_alerts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.inbox_threads it
      WHERE it.id = thread_id
        AND public.can_view_campaign(it.campaign_id)
    )
  );

-- Function to send urgency alerts for HOT leads
CREATE OR REPLACE FUNCTION public.send_hot_lead_alerts(
  p_thread_id uuid,
  p_message_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread_record record;
  v_message_record record;
  v_campaign_record record;
  v_alert_message text;
BEGIN
  -- Get thread info
  SELECT * INTO v_thread_record
  FROM public.inbox_threads
  WHERE id = p_thread_id;
  
  IF NOT FOUND OR v_thread_record.urgency_alert_sent THEN
    RETURN;
  END IF;
  
  -- Check if this is a HOT lead (score >= 80 or intent = hot_lead)
  SELECT * INTO v_message_record
  FROM public.inbox_messages
  WHERE id = p_message_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Only send if HOT
  IF (v_thread_record.lead_ranking_score >= 80 OR v_message_record.ai_intent_tag = 'hot_lead') 
     AND NOT v_thread_record.urgency_alert_sent THEN
    
    -- Get campaign info
    SELECT * INTO v_campaign_record
    FROM public.campaigns
    WHERE id = v_thread_record.campaign_id;
    
    v_alert_message := format(
      'HOT LEAD: %s replied - Respond within 10 min → 80%% win rate',
      COALESCE(v_thread_record.homeowner_name, 'Homeowner')
    );
    
    -- Create dashboard alert
    INSERT INTO public.inbox_urgency_alerts (
      thread_id,
      message_id,
      alert_type,
      message,
      metadata
    ) VALUES (
      p_thread_id,
      p_message_id,
      'dashboard',
      v_alert_message,
      jsonb_build_object(
        'lead_ranking_score', v_thread_record.lead_ranking_score,
        'intent_tag', v_message_record.ai_intent_tag,
        'campaign_name', COALESCE(v_campaign_record.name, 'Campaign')
      )
    );
    
    -- Mark thread as alert sent
    UPDATE public.inbox_threads
    SET urgency_alert_sent = true
    WHERE id = p_thread_id;
    
    -- TODO: Send push notification via service
    -- TODO: Send email notification via service
  END IF;
END;
$$;

-- Trigger to send alerts when HOT lead is detected
CREATE OR REPLACE FUNCTION public.trigger_send_hot_lead_alerts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.direction = 'in' AND NEW.ai_intent_tag = 'hot_lead' THEN
    PERFORM public.send_hot_lead_alerts(NEW.thread_id, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_send_hot_lead_alerts ON public.inbox_messages;
CREATE TRIGGER trg_send_hot_lead_alerts
  AFTER UPDATE OF ai_intent_tag ON public.inbox_messages
  FOR EACH ROW
  WHEN (NEW.ai_intent_tag = 'hot_lead' AND (OLD.ai_intent_tag IS NULL OR OLD.ai_intent_tag != 'hot_lead'))
  EXECUTE FUNCTION public.trigger_send_hot_lead_alerts();

-- ============================================================================
-- 6. HELPER FUNCTION: GET INBOX REPLIES WITH FILTERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_inbox_replies(
  p_campaign_id uuid DEFAULT NULL,
  p_intent_filter text DEFAULT NULL, -- 'hot_lead', 'warm_lead', 'cold_lead', 'dead_lead', 'follow_up_needed'
  p_min_score integer DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  thread_id uuid,
  message_id uuid,
  campaign_id uuid,
  lead_id uuid,
  homeowner_name text,
  homeowner_email text,
  subject text,
  last_message_preview text,
  last_message_at timestamptz,
  ai_intent_tag text,
  ai_intent_confidence numeric,
  lead_ranking_score integer,
  unread_count integer,
  lead_value_range text,
  follow_up_timer_hours integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (it.id)
    it.id AS thread_id,
    im.id AS message_id,
    it.campaign_id,
    it.lead_id,
    it.homeowner_name,
    it.homeowner_email,
    it.subject,
    LEFT(im.body, 150) AS last_message_preview,
    it.last_message_at,
    im.ai_intent_tag,
    im.ai_intent_confidence,
    it.lead_ranking_score,
    it.unread_count,
    it.lead_value_range,
    it.follow_up_timer_hours
  FROM public.inbox_threads it
  INNER JOIN public.inbox_messages im ON im.thread_id = it.id
  WHERE 
    (p_campaign_id IS NULL OR it.campaign_id = p_campaign_id)
    AND (p_intent_filter IS NULL OR im.ai_intent_tag = p_intent_filter)
    AND (p_min_score IS NULL OR it.lead_ranking_score >= p_min_score)
    AND im.direction = 'in'
    AND public.can_view_campaign(it.campaign_id)
  ORDER BY it.id, im.sent_at DESC
  LIMIT p_limit;
END;
$$;

-- ============================================================================
-- 7. COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.inbox_messages.ai_intent_tag IS 'AI classification: hot_lead (ready for estimate), warm_lead (interested but asks Qs), cold_lead (not interested), dead_lead (not interested), follow_up_needed (didn''t answer question)';
COMMENT ON COLUMN public.inbox_threads.lead_ranking_score IS 'Lead ranking score 0-100 based on keywords, tone, urgency, location, damage severity';
COMMENT ON FUNCTION public.classify_reply_intent IS 'Auto-tags replies with intent classification (Hot/Warm/Cold/Dead/Follow-Up)';
COMMENT ON FUNCTION public.calculate_lead_ranking_score IS 'Calculates 0-100 lead ranking score based on keywords, positive tone, time urgency, location match, damage severity';
COMMENT ON FUNCTION public.send_hot_lead_alerts IS 'Sends push/email/dashboard alerts when HOT lead (score >= 80) arrives';



















































