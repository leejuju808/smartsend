-- =========================================================
-- Block 13800 — SmartSend Lead Score Engine v1
-- (The Automatic HOT/WARM/COLD Scoring System That Shows Roofers EXACTLY Who to Focus On)
-- =========================================================

-- 1) Add lead_score columns to contacts table
ALTER TABLE IF EXISTS public.contacts
  ADD COLUMN IF NOT EXISTS lead_score integer NOT NULL DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
  ADD COLUMN IF NOT EXISTS lead_score_last_updated timestamptz;

-- Add index for fast sorting by score
CREATE INDEX IF NOT EXISTS idx_contacts_lead_score_desc 
  ON public.contacts(lead_score DESC, lead_score_last_updated DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_contacts_workspace_score 
  ON public.contacts(workspace_id, lead_score DESC);

-- 2) Create lead_score_events table to log all score changes
CREATE TABLE IF NOT EXISTS public.lead_score_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  old_score integer NOT NULL,
  new_score integer NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL, -- e.g., 'reply_received', 'intent_classified', 'storm_detected', 'enrichment_updated'
  event_id uuid, -- Optional: link to specific event (message_id, enrichment_id, etc.)
  metadata jsonb DEFAULT '{}'::jsonb, -- Additional context
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_lead_score_events_contact 
  ON public.lead_score_events(contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_score_events_workspace 
  ON public.lead_score_events(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_score_events_reason 
  ON public.lead_score_events(reason);

-- RLS for lead_score_events
ALTER TABLE public.lead_score_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view score events for contacts in their workspace
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'lead_score_events'
      AND policyname = 'Users can view score events for their workspace contacts'
  ) THEN
    CREATE POLICY "Users can view score events for their workspace contacts"
      ON public.lead_score_events
      FOR SELECT
      USING (
        workspace_id IN (
          SELECT workspace_id
          FROM public.workspace_members
          WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Policy: Service role can insert score events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'lead_score_events'
      AND policyname = 'Service role can insert score events'
  ) THEN
    CREATE POLICY "Service role can insert score events"
      ON public.lead_score_events
      FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- 3) Function: Calculate lead score based on all factors
CREATE OR REPLACE FUNCTION public.calculate_lead_score(
  p_contact_id uuid,
  p_latest_messages jsonb DEFAULT '[]'::jsonb, -- Array of message objects with text, subject, intent
  p_tags text[] DEFAULT '{}', -- Contact tags
  p_enrichment jsonb DEFAULT '{}'::jsonb, -- Enrichment data
  p_engagement jsonb DEFAULT '{}'::jsonb -- Engagement stats: opens, clicks, replies
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score integer := 0;
  v_message jsonb;
  v_message_text text;
  v_message_subject text;
  v_intent text;
  v_lower_text text;
  v_reply_count integer := 0;
  v_has_reply boolean := false;
  v_storm_risk text;
  v_insurance_interest boolean;
  v_property_type text;
  v_homeowner_likelihood text;
  v_has_old_quote boolean := false;
  v_opens integer := 0;
  v_clicks integer := 0;
BEGIN
  -- Initialize from engagement data
  v_opens := COALESCE((p_engagement->>'opens')::integer, 0);
  v_clicks := COALESCE((p_engagement->>'clicks')::integer, 0);
  v_reply_count := COALESCE((p_engagement->>'replies')::integer, 0);
  v_has_reply := v_reply_count > 0;

  -- Initialize from enrichment data
  v_storm_risk := COALESCE(p_enrichment->>'storm_risk_level', 'low');
  v_insurance_interest := COALESCE((p_enrichment->>'insurance_interest')::boolean, false);
  v_property_type := COALESCE(p_enrichment->>'property_type', 'unknown');
  v_homeowner_likelihood := COALESCE(p_enrichment->>'homeowner_likelihood', 'unknown');

  -- Check for old_quote tag
  v_has_old_quote := 'old_quote' = ANY(p_tags);

  -- =========================================================
  -- 1️⃣ REPLY SIGNALS (+25 to +75)
  -- =========================================================
  IF v_has_reply THEN
    -- Analyze latest messages for reply content
    FOR v_message IN SELECT * FROM jsonb_array_elements(p_latest_messages)
    LOOP
      v_message_text := COALESCE(v_message->>'text', '');
      v_message_subject := COALESCE(v_message->>'subject', '');
      v_lower_text := lower(COALESCE(v_message_text || ' ' || v_message_subject, ''));
      
      -- Strong positive reply signals
      IF v_lower_text ~* '(yes|sure|absolutely|definitely|let.*do.*it|book|schedule|appointment)' THEN
        v_score := v_score + 70;
        EXIT; -- Highest score, exit early
      END IF;
      
      -- Price checking (moderate interest)
      IF v_lower_text ~* '(what.*price|how.*much|cost|pricing|quote|estimate)' THEN
        v_score := v_score + 55;
      END IF;
      
      -- Urgent requests
      IF v_lower_text ~* '(can you come.*week|this week|asap|urgent|soon|today|tomorrow)' THEN
        v_score := v_score + 80; -- Auto-HOT
        EXIT;
      END IF;
      
      -- Insurance questions
      IF v_lower_text ~* '(insurance|covered.*insurance|claim|adjuster)' THEN
        v_score := v_score + 65;
      END IF;
      
      -- General reply (minimum boost)
      IF v_message_text IS NOT NULL AND length(trim(v_message_text)) > 10 THEN
        v_score := v_score + 25;
      END IF;
    END LOOP;
  END IF;

  -- =========================================================
  -- 2️⃣ INTENT CLASSIFIER (Block 8340) → Score Mapping
  -- =========================================================
  FOR v_message IN SELECT * FROM jsonb_array_elements(p_latest_messages)
  LOOP
    v_intent := COALESCE(v_message->>'intent', '');
    
    CASE UPPER(v_intent)
      WHEN 'HOT' THEN
        v_score := v_score + 80; -- HOT = 80-100 range
      WHEN 'WARM' THEN
        v_score := v_score + 50; -- WARM = 40-60 range
      WHEN 'FOLLOW_UP' THEN
        v_score := v_score + 35; -- FOLLOW-UP = 25-45 range
      WHEN 'NOT_INTERESTED' THEN
        v_score := v_score - 20; -- Negative signal
      WHEN 'OUT_OF_SCOPE' THEN
        v_score := v_score - 40; -- Strong negative signal
    END CASE;
  END LOOP;

  -- =========================================================
  -- 3️⃣ STORM RISK (+20 to +40)
  -- =========================================================
  CASE v_storm_risk
    WHEN 'hail' THEN
      v_score := v_score + 30;
    WHEN 'wind' THEN
      v_score := v_score + 20;
    WHEN 'hurricane' THEN
      v_score := v_score + 35;
    WHEN 'high' THEN
      v_score := v_score + 25;
    ELSE
      -- Check for recent heavy rain indicator
      IF p_enrichment->>'recent_heavy_rain' = 'true' THEN
        v_score := v_score + 15;
      END IF;
  END CASE;

  -- =========================================================
  -- 4️⃣ INSURANCE INDICATORS (+30 to +60)
  -- =========================================================
  IF v_insurance_interest THEN
    v_score := v_score + 30;
  END IF;
  
  -- Check messages for insurance keywords
  FOR v_message IN SELECT * FROM jsonb_array_elements(p_latest_messages)
  LOOP
    v_message_text := COALESCE(v_message->>'text', '');
    v_lower_text := lower(v_message_text);
    
    IF v_lower_text ~* '(adjuster|claim|inspection|payout|insurance.*claim|filing.*claim)' THEN
      v_score := v_score + 60;
      EXIT; -- Highest insurance boost
    ELSIF v_lower_text ~* '(insurance|covered|coverage)' THEN
      v_score := v_score + 30;
    END IF;
  END LOOP;

  -- =========================================================
  -- 5️⃣ REPAIR SIGNALS (+20 to +50)
  -- =========================================================
  FOR v_message IN SELECT * FROM jsonb_array_elements(p_latest_messages)
  LOOP
    v_message_text := COALESCE(v_message->>'text', '');
    v_lower_text := lower(v_message_text);
    
    IF v_lower_text ~* '(leak|leaking|water|drip|damage|problem|issue)' THEN
      v_score := v_score + 50;
    ELSIF v_lower_text ~* '(missing.*shingle|shingles.*missing|flashing|vent|skylight)' THEN
      v_score := v_score + 30;
    ELSIF v_lower_text ~* '(repair|fix|needs.*fix)' THEN
      v_score := v_score + 20;
    END IF;
  END LOOP;

  -- =========================================================
  -- 6️⃣ REPLACEMENT SIGNALS (+40 to +70)
  -- =========================================================
  FOR v_message IN SELECT * FROM jsonb_array_elements(p_latest_messages)
  LOOP
    v_message_text := COALESCE(v_message->>'text', '');
    v_lower_text := lower(v_message_text);
    
    IF v_lower_text ~* '(full.*roof|replace.*roof|new.*roof|roof.*replacement)' THEN
      v_score := v_score + 70;
    ELSIF v_lower_text ~* '(shingles.*worn|roof.*old|roof.*age|need.*new)' THEN
      v_score := v_score + 50;
    ELSIF v_lower_text ~* '(quote.*new|estimate.*replacement)' THEN
      v_score := v_score + 40;
    END IF;
  END LOOP;

  -- =========================================================
  -- 7️⃣ PAST QUOTE HISTORY (+30)
  -- =========================================================
  IF v_has_old_quote THEN
    v_score := v_score + 30;
  END IF;

  -- =========================================================
  -- 8️⃣ ENGAGEMENT BEHAVIOR (+10 to +30)
  -- =========================================================
  IF v_clicks > 0 THEN
    v_score := v_score + 30; -- Clicked link = high engagement
  ELSIF v_opens >= 3 THEN
    v_score := v_score + 15; -- Multiple opens = consistent engagement
  ELSIF v_opens >= 1 THEN
    v_score := v_score + 10; -- At least opened
  END IF;

  -- =========================================================
  -- 9️⃣ HIGH-VALUE HOME INDICATORS (+20 to +40)
  -- =========================================================
  IF v_homeowner_likelihood = 'high' THEN
    v_score := v_score + 20;
  END IF;
  
  -- Check enrichment for premium indicators
  IF p_enrichment->>'premium_zip' = 'true' THEN
    v_score := v_score + 25;
  END IF;
  
  IF p_enrichment->>'multi_property_owner' = 'true' THEN
    v_score := v_score + 30;
  END IF;
  
  IF p_enrichment->>'large_home' = 'true' THEN
    v_score := v_score + 20;
  END IF;

  -- =========================================================
  -- 🔟 LOW QUALITY SIGNALS (-30 to -80)
  -- =========================================================
  -- Check tags for low quality indicators
  IF 'spam' = ANY(p_tags) OR 'invalid' = ANY(p_tags) THEN
    v_score := v_score - 80;
  END IF;
  
  IF 'auto_responder' = ANY(p_tags) OR 'disposable' = ANY(p_tags) THEN
    v_score := v_score - 50;
  END IF;
  
  IF 'commercial' = ANY(p_tags) OR 'wrong_person' = ANY(p_tags) THEN
    v_score := v_score - 40;
  END IF;
  
  IF 'bounced' = ANY(p_tags) THEN
    v_score := v_score - 60;
  END IF;

  -- =========================================================
  -- Clamp score to 0-100 range
  -- =========================================================
  v_score := GREATEST(0, LEAST(100, v_score));

  RETURN v_score;
END;
$$;

-- 4) Function: Update contact lead score and log event
CREATE OR REPLACE FUNCTION public.update_contact_lead_score(
  p_contact_id uuid,
  p_reason text,
  p_event_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_record public.contacts%ROWTYPE;
  v_old_score integer;
  v_new_score integer;
  v_delta integer;
  v_workspace_id uuid;
  v_latest_messages jsonb := '[]'::jsonb;
  v_enrichment jsonb := '{}'::jsonb;
  v_engagement jsonb := '{}'::jsonb;
  v_message_record record;
BEGIN
  -- Get contact data
  SELECT * INTO v_contact_record
  FROM public.contacts
  WHERE id = p_contact_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact not found: %', p_contact_id;
  END IF;
  
  v_workspace_id := v_contact_record.workspace_id;
  v_old_score := COALESCE(v_contact_record.lead_score, 0);

  -- Gather latest messages from inbox_messages
  -- Handle different schema variations
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'text', COALESCE(body_text, LEFT(body_html, 500), ''),
        'subject', COALESCE(subject, ''),
        'intent', COALESCE(reply_label::text, ai_label::text, '')
      )
      ORDER BY COALESCE(received_at, created_at) DESC NULLS LAST
    ) FILTER (WHERE body_text IS NOT NULL OR body_html IS NOT NULL),
    '[]'::jsonb
  ) INTO v_latest_messages
  FROM (
    SELECT DISTINCT ON (COALESCE(received_at, created_at))
      body_text,
      body_html,
      subject,
      reply_label,
      ai_label,
      COALESCE(received_at, created_at) as received_at,
      created_at
    FROM public.inbox_messages
    WHERE from_email = v_contact_record.email
      AND direction IN ('in', 'inbound')
    ORDER BY COALESCE(received_at, created_at) DESC NULLS LAST
    LIMIT 5
  ) msg_data;

  -- Get enrichment data (if exists)
  SELECT jsonb_build_object(
    'storm_risk_level', COALESCE(storm_risk_level, 'low'),
    'insurance_interest', COALESCE(insurance_interest, false),
    'property_type', COALESCE(property_type, 'unknown'),
    'homeowner_likelihood', COALESCE(homeowner_likelihood, 'unknown'),
    'premium_zip', false, -- TODO: Add logic to determine premium zip
    'multi_property_owner', false, -- TODO: Add logic
    'large_home', false, -- TODO: Add logic
    'recent_heavy_rain', false -- TODO: Add logic
  ) INTO v_enrichment
  FROM public.contact_enrichment
  WHERE contact_id = p_contact_id
  LIMIT 1;
  
  -- Default to empty object if no enrichment found
  IF v_enrichment IS NULL THEN
    v_enrichment := '{}'::jsonb;
  END IF;

  -- Get engagement stats from campaign_contacts and send tracking
  -- Handle case where tables might not exist or have different schemas
  BEGIN
    SELECT jsonb_build_object(
      'opens', COALESCE((
        SELECT COUNT(*)::integer 
        FROM public.send_logs sl
        JOIN public.campaign_contacts cc ON cc.campaign_id = sl.campaign_id AND cc.contact_id = p_contact_id
        WHERE sl.opened_at IS NOT NULL
      ), 0),
      'clicks', COALESCE((
        SELECT COUNT(*)::integer 
        FROM public.send_logs sl
        JOIN public.campaign_contacts cc ON cc.campaign_id = sl.campaign_id AND cc.contact_id = p_contact_id
        WHERE sl.clicked_at IS NOT NULL
      ), 0),
      'replies', COALESCE((
        SELECT COUNT(*)::integer 
        FROM public.inbox_messages
        WHERE from_email = v_contact_record.email
          AND direction IN ('in', 'inbound')
      ), 0)
    ) INTO v_engagement;
  EXCEPTION WHEN OTHERS THEN
    -- Fallback if tables don't exist or schema differs
    v_engagement := jsonb_build_object('opens', 0, 'clicks', 0, 'replies', 0);
  END;
  
  -- Default to empty object if no engagement data found
  IF v_engagement IS NULL THEN
    v_engagement := jsonb_build_object('opens', 0, 'clicks', 0, 'replies', 0);
  END IF;

  -- Calculate new score
  v_new_score := public.calculate_lead_score(
    p_contact_id,
    COALESCE(v_latest_messages, '[]'::jsonb),
    COALESCE(v_contact_record.tags, '{}'),
    COALESCE(v_enrichment, '{}'::jsonb),
    COALESCE(v_engagement, '{}'::jsonb)
  );

  v_delta := v_new_score - v_old_score;

  -- Update contact score
  UPDATE public.contacts
  SET 
    lead_score = v_new_score,
    lead_score_last_updated = now()
  WHERE id = p_contact_id;

  -- Log score event (only if score changed)
  IF v_delta != 0 THEN
    INSERT INTO public.lead_score_events (
      contact_id,
      workspace_id,
      old_score,
      new_score,
      delta,
      reason,
      event_id,
      metadata
    ) VALUES (
      p_contact_id,
      v_workspace_id,
      v_old_score,
      v_new_score,
      v_delta,
      p_reason,
      p_event_id,
      p_metadata
    );
  END IF;

  RETURN v_new_score;
END;
$$;

-- 5) Trigger: Auto-update score when contact tags change
CREATE OR REPLACE FUNCTION public.trigger_update_lead_score_on_tags()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only update if tags actually changed
  IF OLD.tags IS DISTINCT FROM NEW.tags THEN
    PERFORM public.update_contact_lead_score(
      NEW.id,
      'tags_updated',
      NULL,
      jsonb_build_object('old_tags', OLD.tags, 'new_tags', NEW.tags)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_lead_score_on_tags ON public.contacts;
CREATE TRIGGER trg_update_lead_score_on_tags
  AFTER UPDATE OF tags ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_update_lead_score_on_tags();

-- 6) Comments for documentation
COMMENT ON COLUMN public.contacts.lead_score IS 'Lead score 0-100: 0-20=COLD, 21-60=WARM, 61-100=HOT';
COMMENT ON COLUMN public.contacts.lead_score_last_updated IS 'Timestamp when lead score was last recalculated';
COMMENT ON TABLE public.lead_score_events IS 'Audit log of all lead score changes';
COMMENT ON FUNCTION public.calculate_lead_score IS 'Calculates lead score based on replies, intent, storm risk, insurance, repairs, replacement signals, engagement, and enrichment data';
COMMENT ON FUNCTION public.update_contact_lead_score IS 'Updates contact lead score and logs the change event';

-- 7) Trigger: Auto-update score when enrichment data changes
CREATE OR REPLACE FUNCTION public.trigger_update_lead_score_on_enrichment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_contact_id uuid;
BEGIN
  v_contact_id := NEW.contact_id;
  
  -- Update score when enrichment changes
  PERFORM public.update_contact_lead_score(
    v_contact_id,
    'enrichment_updated',
    NEW.id,
    jsonb_build_object(
      'enrichment_version', NEW.enrichment_version,
      'last_enriched_at', NEW.last_enriched_at
    )
  );
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_lead_score_on_enrichment ON public.contact_enrichment;
CREATE TRIGGER trg_update_lead_score_on_enrichment
  AFTER INSERT OR UPDATE ON public.contact_enrichment
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_update_lead_score_on_enrichment();

-- 8) Trigger: Auto-update score when inbox message (reply) is received
-- Note: This requires finding the contact by email
CREATE OR REPLACE FUNCTION public.trigger_update_lead_score_on_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_contact_id uuid;
BEGIN
  -- Only process inbound messages
  IF NEW.direction NOT IN ('in', 'inbound') THEN
    RETURN NEW;
  END IF;
  
  -- Find contact by email
  SELECT id INTO v_contact_id
  FROM public.contacts
  WHERE lower(email) = lower(NEW.from_email)
  LIMIT 1;
  
  IF v_contact_id IS NOT NULL THEN
    -- Update score when reply received
    PERFORM public.update_contact_lead_score(
      v_contact_id,
      'reply_received',
      NEW.id,
      jsonb_build_object(
        'message_id', NEW.id,
        'subject', NEW.subject,
        'has_intent', NEW.reply_label IS NOT NULL OR NEW.ai_label IS NOT NULL
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Only create trigger if inbox_messages table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'inbox_messages'
  ) THEN
    DROP TRIGGER IF EXISTS trg_update_lead_score_on_reply ON public.inbox_messages;
    CREATE TRIGGER trg_update_lead_score_on_reply
      AFTER INSERT ON public.inbox_messages
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_update_lead_score_on_reply();
  END IF;
END $$;

-- 9) Trigger: Auto-update score when reply intent is classified/updated
CREATE OR REPLACE FUNCTION public.trigger_update_lead_score_on_intent()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_contact_id uuid;
BEGIN
  -- Only process if intent actually changed
  IF OLD.reply_label IS NOT DISTINCT FROM NEW.reply_label 
     AND OLD.ai_label IS NOT DISTINCT FROM NEW.ai_label THEN
    RETURN NEW;
  END IF;
  
  -- Find contact by email
  SELECT id INTO v_contact_id
  FROM public.contacts
  WHERE lower(email) = lower(NEW.from_email)
  LIMIT 1;
  
  IF v_contact_id IS NOT NULL THEN
    -- Update score when intent classified
    PERFORM public.update_contact_lead_score(
      v_contact_id,
      'intent_classified',
      NEW.id,
      jsonb_build_object(
        'old_intent', COALESCE(OLD.reply_label, OLD.ai_label),
        'new_intent', COALESCE(NEW.reply_label, NEW.ai_label),
        'confidence', NEW.ai_confidence
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Only create trigger if inbox_messages table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'inbox_messages'
  ) THEN
    DROP TRIGGER IF EXISTS trg_update_lead_score_on_intent ON public.inbox_messages;
    CREATE TRIGGER trg_update_lead_score_on_intent
      AFTER UPDATE OF reply_label, ai_label ON public.inbox_messages
      FOR EACH ROW
      EXECUTE FUNCTION public.trigger_update_lead_score_on_intent();
  END IF;
END $$;

-- 10) Function: Recalculate all contact scores in a workspace (for nightly job)
CREATE OR REPLACE FUNCTION public.recalculate_workspace_lead_scores(
  p_workspace_id uuid,
  p_limit integer DEFAULT 100
)
RETURNS TABLE(contact_id uuid, new_score integer, processed integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_record record;
  v_processed integer := 0;
BEGIN
  FOR v_contact_record IN 
    SELECT id 
    FROM public.contacts
    WHERE workspace_id = p_workspace_id
    ORDER BY lead_score_last_updated NULLS FIRST, created_at DESC
    LIMIT p_limit
  LOOP
    BEGIN
      PERFORM public.update_contact_lead_score(
        v_contact_record.id,
        'nightly_recalculation',
        NULL,
        jsonb_build_object('workspace_id', p_workspace_id)
      );
      
      v_processed := v_processed + 1;
      
      -- Return result
      contact_id := v_contact_record.id;
      SELECT lead_score INTO new_score
      FROM public.contacts
      WHERE id = v_contact_record.id;
      
      processed := v_processed;
      
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      -- Log error but continue processing
      RAISE WARNING 'Error recalculating score for contact %: %', v_contact_record.id, SQLERRM;
    END;
  END LOOP;
  
  RETURN;
END;
$$;

-- 11) Grant execute permissions
GRANT EXECUTE ON FUNCTION public.update_contact_lead_score(uuid, text, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_workspace_lead_scores(uuid, integer) TO authenticated, service_role;

