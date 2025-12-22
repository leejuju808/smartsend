-- =========================================================
-- Block 14300 — SmartSend Message Intelligence v1
-- (The System That Reads Homeowner Replies & Auto-Identifies Questions, Pricing Interest, Urgency, Repairs, Insurance & More)
-- =========================================================

-- ============================================================================
-- 1. CREATE message_insights TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.message_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  reply_id uuid, -- Flexible: can reference inbox_messages.id, reply_messages.id, or messages.id
  reply_table text, -- 'inbox_messages', 'reply_messages', 'messages', etc.
  
  -- Detected categories (JSON array of category strings)
  categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  
  -- Confidence score (0.0 to 1.0)
  confidence numeric(3,2) NOT NULL DEFAULT 0.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  
  -- Score delta applied to lead score
  score_delta integer NOT NULL DEFAULT 0,
  
  -- Raw detection results for debugging
  detection_results jsonb DEFAULT '{}'::jsonb,
  
  -- Processing metadata
  processed_at timestamptz NOT NULL DEFAULT now(),
  processor_version text DEFAULT 'v1',
  
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_message_insights_contact 
  ON public.message_insights(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_insights_lead 
  ON public.message_insights(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_insights_reply 
  ON public.message_insights(reply_id, reply_table);
CREATE INDEX IF NOT EXISTS idx_message_insights_categories 
  ON public.message_insights USING GIN(categories);
CREATE INDEX IF NOT EXISTS idx_message_insights_processed_at 
  ON public.message_insights(processed_at DESC);

-- RLS Policies
ALTER TABLE public.message_insights ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view insights for contacts in their workspace
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'message_insights'
      AND policyname = 'Users can view insights for their workspace contacts'
  ) THEN
    CREATE POLICY "Users can view insights for their workspace contacts"
      ON public.message_insights
      FOR SELECT
      USING (
        contact_id IN (
          SELECT id FROM public.contacts
          WHERE workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
          )
        )
        OR lead_id IN (
          SELECT id FROM public.leads
          WHERE workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
          )
        )
      );
  END IF;
END $$;

-- Policy: Service role can insert/update insights
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'message_insights'
      AND policyname = 'Service role can manage insights'
  ) THEN
    CREATE POLICY "Service role can manage insights"
      ON public.message_insights
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.message_insights IS 'Message intelligence insights detected from homeowner replies (Block 14300)';
COMMENT ON COLUMN public.message_insights.categories IS 'JSON array of detected categories: price_interest, availability_question, appointment_request, storm_damage, leak_repair, insurance_interest, urgency, follow_up, not_interested, confusion, wrong_person, out_of_scope';
COMMENT ON COLUMN public.message_insights.score_delta IS 'Lead score change applied based on detected categories';

-- ============================================================================
-- 2. FUNCTION: Normalize message text for analysis
-- ============================================================================

CREATE OR REPLACE FUNCTION public.normalize_message_text(
  p_body_text text,
  p_body_html text,
  p_subject text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text text;
BEGIN
  -- Use body_text if available, otherwise extract from HTML
  v_text := COALESCE(p_body_text, '');
  
  -- If we only have HTML, try to extract text (basic strip)
  IF v_text = '' AND p_body_html IS NOT NULL THEN
    -- Remove HTML tags (basic approach)
    v_text := regexp_replace(p_body_html, '<[^>]+>', '', 'g');
    v_text := regexp_replace(v_text, '&nbsp;', ' ', 'g');
    v_text := regexp_replace(v_text, '&amp;', '&', 'g');
    v_text := regexp_replace(v_text, '&lt;', '<', 'g');
    v_text := regexp_replace(v_text, '&gt;', '>', 'g');
    v_text := regexp_replace(v_text, '&quot;', '"', 'g');
  END IF;
  
  -- Combine with subject
  IF p_subject IS NOT NULL THEN
    v_text := p_subject || ' ' || v_text;
  END IF;
  
  -- Convert to lowercase
  v_text := lower(v_text);
  
  -- Remove email signatures (basic pattern: lines starting with "On", "From:", "Sent from", etc.)
  v_text := regexp_replace(v_text, '\n\s*(on|from|sent from|sent via|get outlook|get gmail).*', '', 'gi');
  
  -- Remove quoted previous messages (lines starting with ">")
  v_text := regexp_replace(v_text, '\n\s*>.*', '', 'g');
  
  -- Remove excessive whitespace
  v_text := regexp_replace(v_text, '\s+', ' ', 'g');
  v_text := trim(v_text);
  
  RETURN v_text;
END;
$$;

COMMENT ON FUNCTION public.normalize_message_text IS 'Normalizes message text for intelligence analysis by removing signatures, quotes, and HTML';

-- ============================================================================
-- 3. FUNCTION: Detect message intelligence categories
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_message_intelligence(
  p_normalized_text text
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_categories jsonb := '[]'::jsonb;
  v_text text;
  v_confidence numeric(3,2) := 0.0;
  v_detections jsonb := '{}'::jsonb;
BEGIN
  v_text := COALESCE(p_normalized_text, '');
  
  IF v_text = '' THEN
    RETURN jsonb_build_object(
      'categories', '[]'::jsonb,
      'confidence', 0.0,
      'detections', '{}'::jsonb
    );
  END IF;
  
  -- 1️⃣ PRICING INTEREST
  IF v_text ~* '(how much|price|quote|estimate|cost|pricing|what.*cost|how.*much)' THEN
    v_categories := v_categories || '["price_interest"]'::jsonb;
    v_confidence := GREATEST(v_confidence, 0.85);
    v_detections := v_detections || jsonb_build_object('price_interest', true);
  END IF;
  
  -- 2️⃣ AVAILABILITY QUESTION
  IF v_text ~* '(when can you|what.*availability|how soon|this week|next week|when.*available|what.*schedule)' THEN
    v_categories := v_categories || '["availability_question"]'::jsonb;
    v_confidence := GREATEST(v_confidence, 0.80);
    v_detections := v_detections || jsonb_build_object('availability_question', true);
  END IF;
  
  -- 3️⃣ APPOINTMENT REQUEST
  IF v_text ~* '(come out|visit|inspection|swing by|check.*roof|look at|friday|saturday|sunday|monday|tuesday|wednesday|thursday|tomorrow|today|schedule.*visit)' THEN
    v_categories := v_categories || '["appointment_request"]'::jsonb;
    v_confidence := GREATEST(v_confidence, 0.90);
    v_detections := v_detections || jsonb_build_object('appointment_request', true);
  END IF;
  
  -- 4️⃣ STORM DAMAGE INDICATORS
  IF v_text ~* '(hail|wind|storm|heavy rain|trees fell|shingles.*blew|shingles.*off|damage.*storm|storm.*damage)' THEN
    v_categories := v_categories || '["storm_damage"]'::jsonb;
    v_confidence := GREATEST(v_confidence, 0.85);
    v_detections := v_detections || jsonb_build_object('storm_damage', true);
  END IF;
  
  -- 5️⃣ LEAK / REPAIR SIGNALS
  IF v_text ~* '(leak|leaking|dripping|wet ceiling|missing shingles|vent.*issue|patch|flashing|repair|fix|broken|damaged)' THEN
    v_categories := v_categories || '["leak_repair"]'::jsonb;
    v_confidence := GREATEST(v_confidence, 0.80);
    v_detections := v_detections || jsonb_build_object('leak_repair', true);
  END IF;
  
  -- 6️⃣ INSURANCE CLAIM INDICATORS
  IF v_text ~* '(insurance|claim|adjuster|coverage|payout|approved|insurance.*claim|file.*claim|insurance.*cover)' THEN
    v_categories := v_categories || '["insurance_interest"]'::jsonb;
    v_confidence := GREATEST(v_confidence, 0.90);
    v_detections := v_detections || jsonb_build_object('insurance_interest', true);
  END IF;
  
  -- 7️⃣ URGENCY SIGNALS
  IF v_text ~* '(asap|as soon as|urgent|immediately|right away|today|emergency|urgent.*need)' THEN
    v_categories := v_categories || '["urgency"]'::jsonb;
    v_confidence := GREATEST(v_confidence, 0.95);
    v_detections := v_detections || jsonb_build_object('urgency', true);
  END IF;
  
  -- 8️⃣ FOLLOW-UP REQUEST
  IF v_text ~* '(let me check|get back to me|i.*ll talk|i.*ll discuss|follow up|call me back|reach out)' THEN
    v_categories := v_categories || '["follow_up"]'::jsonb;
    v_confidence := GREATEST(v_confidence, 0.75);
    v_detections := v_detections || jsonb_build_object('follow_up', true);
  END IF;
  
  -- 9️⃣ NOT INTERESTED SIGNALS
  IF v_text ~* '(no thanks|not right now|already handled|don.*t need|not interested|not.*interested|no.*interest)' THEN
    v_categories := v_categories || '["not_interested"]'::jsonb;
    v_confidence := GREATEST(v_confidence, 0.85);
    v_detections := v_detections || jsonb_build_object('not_interested', true);
  END IF;
  
  -- 🔟 CONFUSION / WRONG PERSON
  IF v_text ~* '(who is this|who.*this|i don.*t own|wrong number|wrong email|wrong person|not.*owner|don.*t know.*you)' THEN
    v_categories := v_categories || '["confusion"]'::jsonb;
    v_confidence := GREATEST(v_confidence, 0.90);
    v_detections := v_detections || jsonb_build_object('confusion', true);
  END IF;
  
  -- Remove duplicates from categories array
  v_categories := (
    SELECT jsonb_agg(DISTINCT value)
    FROM jsonb_array_elements_text(v_categories)
  );
  
  -- If no categories detected, return empty
  IF v_categories IS NULL OR jsonb_array_length(v_categories) = 0 THEN
    v_categories := '[]'::jsonb;
    v_confidence := 0.0;
  END IF;
  
  RETURN jsonb_build_object(
    'categories', v_categories,
    'confidence', v_confidence,
    'detections', v_detections
  );
END;
$$;

COMMENT ON FUNCTION public.detect_message_intelligence IS 'Detects message intelligence categories from normalized text (Block 14300)';

-- ============================================================================
-- 4. FUNCTION: Calculate score delta based on categories
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_intelligence_score_delta(
  p_categories jsonb
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_delta integer := 0;
  v_category text;
BEGIN
  -- Loop through categories and apply score changes
  FOR v_category IN SELECT jsonb_array_elements_text(p_categories)
  LOOP
    CASE v_category
      WHEN 'price_interest' THEN
        v_delta := v_delta + 40; -- HIGH interest
      WHEN 'availability_question' THEN
        v_delta := v_delta + 50; -- HOT lead
      WHEN 'appointment_request' THEN
        v_delta := v_delta + 40; -- Auto-score boost
      WHEN 'storm_damage' THEN
        v_delta := v_delta + 30; -- WARM or HOT
      WHEN 'leak_repair' THEN
        v_delta := v_delta + 25; -- Needs attention
      WHEN 'insurance_interest' THEN
        v_delta := v_delta + 50; -- High-value job
      WHEN 'urgency' THEN
        v_delta := v_delta + 50; -- HOT, needs immediate attention
      WHEN 'follow_up' THEN
        v_delta := v_delta + 15; -- Moderate interest
      WHEN 'not_interested' THEN
        v_delta := v_delta - 30; -- Negative signal
      WHEN 'confusion' THEN
        v_delta := v_delta - 40; -- Wrong person/out of scope
      WHEN 'wrong_person' THEN
        v_delta := v_delta - 40; -- Out of scope
      WHEN 'out_of_scope' THEN
        v_delta := v_delta - 40; -- Not applicable
      ELSE
        NULL; -- Unknown category, no change
    END CASE;
  END LOOP;
  
  RETURN v_delta;
END;
$$;

COMMENT ON FUNCTION public.calculate_intelligence_score_delta IS 'Calculates lead score delta based on detected message intelligence categories';

-- ============================================================================
-- 5. FUNCTION: Process message intelligence (main processing function)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_message_intelligence(
  p_reply_id uuid,
  p_reply_table text DEFAULT 'inbox_messages',
  p_contact_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_insight_id uuid;
  v_body_text text;
  v_body_html text;
  v_subject text;
  v_normalized_text text;
  v_detection_result jsonb;
  v_categories jsonb;
  v_confidence numeric(3,2);
  v_score_delta integer;
  v_detections jsonb;
  v_workspace_id uuid;
  v_contact_record record;
BEGIN
  -- Get message content based on reply_table
  CASE p_reply_table
    WHEN 'inbox_messages' THEN
      SELECT body_text, body_html, subject, lead_id, contact_id
      INTO v_body_text, v_body_html, v_subject, p_lead_id, p_contact_id
      FROM public.inbox_messages
      WHERE id = p_reply_id;
    WHEN 'reply_messages' THEN
      SELECT body, NULL::text, NULL::text
      INTO v_body_text, v_body_html, v_subject
      FROM public.reply_messages
      WHERE id = p_reply_id;
    WHEN 'messages' THEN
      SELECT body_text, body_html, subject
      INTO v_body_text, v_body_html, v_subject
      FROM public.messages
      WHERE id = p_reply_id;
    ELSE
      RAISE EXCEPTION 'Unknown reply_table: %', p_reply_table;
  END CASE;
  
  -- Get contact_id or lead_id if not provided
  IF p_contact_id IS NULL AND p_lead_id IS NULL THEN
    -- Try to find contact by email
    IF p_reply_table = 'inbox_messages' THEN
      SELECT c.id, c.workspace_id INTO v_contact_record
      FROM public.inbox_messages im
      JOIN public.contacts c ON c.email = im.from_email
      WHERE im.id = p_reply_id
      LIMIT 1;
      
      IF v_contact_record.id IS NOT NULL THEN
        p_contact_id := v_contact_record.id;
        v_workspace_id := v_contact_record.workspace_id;
      END IF;
    END IF;
  ELSE
    -- Get workspace_id from contact or lead
    IF p_contact_id IS NOT NULL THEN
      SELECT workspace_id INTO v_workspace_id
      FROM public.contacts
      WHERE id = p_contact_id;
    ELSIF p_lead_id IS NOT NULL THEN
      SELECT workspace_id INTO v_workspace_id
      FROM public.leads
      WHERE id = p_lead_id;
    END IF;
  END IF;
  
  -- Normalize message text
  v_normalized_text := public.normalize_message_text(v_body_text, v_body_html, v_subject);
  
  -- Detect intelligence categories
  v_detection_result := public.detect_message_intelligence(v_normalized_text);
  v_categories := v_detection_result->'categories';
  v_confidence := (v_detection_result->>'confidence')::numeric(3,2);
  v_detections := v_detection_result->'detections';
  
  -- Calculate score delta
  v_score_delta := public.calculate_intelligence_score_delta(v_categories);
  
  -- Insert insight record
  INSERT INTO public.message_insights (
    contact_id,
    lead_id,
    reply_id,
    reply_table,
    categories,
    confidence,
    score_delta,
    detection_results
  ) VALUES (
    p_contact_id,
    p_lead_id,
    p_reply_id,
    p_reply_table,
    v_categories,
    v_confidence,
    v_score_delta,
    v_detection_result
  )
  RETURNING id INTO v_insight_id;
  
  -- Apply side effects (tags, status updates, tasks, score updates)
  IF p_contact_id IS NOT NULL OR p_lead_id IS NOT NULL THEN
    PERFORM public.apply_message_intelligence_actions(
      v_insight_id,
      p_contact_id,
      p_lead_id,
      v_categories,
      v_score_delta,
      v_workspace_id
    );
  END IF;
  
  RETURN v_insight_id;
END;
$$;

COMMENT ON FUNCTION public.process_message_intelligence IS 'Main function to process message intelligence for a reply (Block 14300)';

-- ============================================================================
-- 6. FUNCTION: Apply intelligence actions (tags, status, tasks, score)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.apply_message_intelligence_actions(
  p_insight_id uuid,
  p_contact_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_categories jsonb DEFAULT '[]'::jsonb,
  p_score_delta integer DEFAULT 0,
  p_workspace_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_category text;
  v_contact_record record;
  v_lead_record record;
  v_workspace_id uuid;
  v_current_score integer;
  v_new_score integer;
  v_task_title text;
  v_task_due_date timestamptz;
BEGIN
  -- Get workspace_id if not provided
  IF p_workspace_id IS NULL THEN
    IF p_contact_id IS NOT NULL THEN
      SELECT workspace_id INTO v_workspace_id FROM public.contacts WHERE id = p_contact_id;
    ELSIF p_lead_id IS NOT NULL THEN
      SELECT workspace_id INTO v_workspace_id FROM public.leads WHERE id = p_lead_id;
    END IF;
  ELSE
    v_workspace_id := p_workspace_id;
  END IF;
  
  IF v_workspace_id IS NULL THEN
    RETURN; -- Cannot proceed without workspace_id
  END IF;
  
  -- Process each category
  FOR v_category IN SELECT jsonb_array_elements_text(p_categories)
  LOOP
    -- Apply tags
    IF p_contact_id IS NOT NULL THEN
      -- Add tag to contact
      BEGIN
        PERFORM public.add_contact_tag(
          v_workspace_id,
          p_contact_id,
          v_category,
          true, -- auto_tagged
          NULL  -- created_by (system)
        );
      EXCEPTION WHEN OTHERS THEN
        -- Tag might already exist or function doesn't exist, continue
        NULL;
      END;
    END IF;
    
    -- Apply status updates
    CASE v_category
      WHEN 'availability_question', 'appointment_request', 'urgency', 'insurance_interest' THEN
        -- Set to HOT
        IF p_contact_id IS NOT NULL THEN
          UPDATE public.contacts
          SET lead_status = 'hot'
          WHERE id = p_contact_id AND (lead_status IS NULL OR lead_status NOT IN ('hot', 'won'));
        END IF;
        IF p_lead_id IS NOT NULL THEN
          UPDATE public.leads
          SET status = 'HOT'
          WHERE id = p_lead_id AND (status IS NULL OR status NOT IN ('HOT', 'WON'));
        END IF;
      WHEN 'storm_damage', 'leak_repair', 'price_interest' THEN
        -- Set to WARM
        IF p_contact_id IS NOT NULL THEN
          UPDATE public.contacts
          SET lead_status = 'warm'
          WHERE id = p_contact_id AND (lead_status IS NULL OR lead_status NOT IN ('hot', 'warm', 'won'));
        END IF;
        IF p_lead_id IS NOT NULL THEN
          UPDATE public.leads
          SET status = 'WARM'
          WHERE id = p_lead_id AND (status IS NULL OR status NOT IN ('HOT', 'WARM', 'WON'));
        END IF;
      WHEN 'not_interested' THEN
        -- Set to NOT_INTERESTED
        IF p_contact_id IS NOT NULL THEN
          UPDATE public.contacts
          SET lead_status = 'not_interested'
          WHERE id = p_contact_id;
        END IF;
        IF p_lead_id IS NOT NULL THEN
          UPDATE public.leads
          SET status = 'NOT_INTERESTED'
          WHERE id = p_lead_id;
        END IF;
      WHEN 'confusion', 'wrong_person', 'out_of_scope' THEN
        -- Set to OUT_OF_SCOPE
        IF p_contact_id IS NOT NULL THEN
          UPDATE public.contacts
          SET lead_status = 'out_of_scope'
          WHERE id = p_contact_id;
        END IF;
        IF p_lead_id IS NOT NULL THEN
          UPDATE public.leads
          SET status = 'OUT_OF_SCOPE'
          WHERE id = p_lead_id;
        END IF;
      WHEN 'follow_up' THEN
        -- Set to FOLLOW_UP
        IF p_contact_id IS NOT NULL THEN
          UPDATE public.contacts
          SET lead_status = 'follow_up'
          WHERE id = p_contact_id AND (lead_status IS NULL OR lead_status NOT IN ('hot', 'warm', 'follow_up', 'won'));
        END IF;
        IF p_lead_id IS NOT NULL THEN
          UPDATE public.leads
          SET status = 'FOLLOW_UP'
          WHERE id = p_lead_id AND (status IS NULL OR status NOT IN ('HOT', 'WARM', 'FOLLOW_UP', 'WON'));
        END IF;
    END CASE;
    
    -- Create tasks
    CASE v_category
      WHEN 'price_interest' THEN
        v_task_title := 'Send pricing info';
        v_task_due_date := now() + interval '1 day';
      WHEN 'availability_question', 'appointment_request' THEN
        v_task_title := 'Schedule inspection/call';
        v_task_due_date := now() + interval '1 day';
      WHEN 'appointment_request' THEN
        v_task_title := 'Book inspection';
        v_task_due_date := now() + interval '1 day';
      WHEN 'leak_repair' THEN
        v_task_title := 'Offer repair visit';
        v_task_due_date := now() + interval '2 days';
      WHEN 'insurance_interest' THEN
        v_task_title := 'Follow up on insurance job';
        v_task_due_date := now() + interval '1 day';
      WHEN 'urgency' THEN
        v_task_title := 'Urgent: Contact immediately';
        v_task_due_date := now(); -- TODAY
      WHEN 'follow_up' THEN
        v_task_title := 'Follow up in 2-3 days';
        v_task_due_date := now() + interval '2 days';
      ELSE
        v_task_title := NULL;
        v_task_due_date := NULL;
    END CASE;
    
    -- Create task if title is set
    -- Note: Task creation is optional and will fail gracefully if tasks table doesn't exist or has different structure
    IF v_task_title IS NOT NULL AND v_workspace_id IS NOT NULL THEN
      BEGIN
        -- Try to create task with minimal required fields
        -- This will work with most common task table structures
        IF p_contact_id IS NOT NULL THEN
          -- Try with contact_id (most common structure)
          INSERT INTO public.tasks (workspace_id, contact_id, title, notes, due_at, auto_generated)
          VALUES (
            v_workspace_id,
            p_contact_id,
            v_task_title,
            'Auto-generated from message intelligence: ' || v_category,
            v_task_due_date,
            true
          );
        ELSIF p_lead_id IS NOT NULL THEN
          -- Try with lead_id
          INSERT INTO public.tasks (workspace_id, lead_id, title, notes, due_at, auto_generated)
          VALUES (
            v_workspace_id,
            p_lead_id,
            v_task_title,
            'Auto-generated from message intelligence: ' || v_category,
            v_task_due_date,
            true
          );
        END IF;
      EXCEPTION 
        WHEN undefined_table THEN
          -- Tasks table doesn't exist, skip
          NULL;
        WHEN undefined_column THEN
          -- Tasks table has different structure, skip
          NULL;
        WHEN OTHERS THEN
          -- Other errors (e.g., constraint violations), skip silently
          NULL;
      END;
    END IF;
  END LOOP;
  
  -- Apply score delta
  IF p_score_delta != 0 THEN
    -- Update contact score
    IF p_contact_id IS NOT NULL THEN
      SELECT COALESCE(lead_score, 0) INTO v_current_score
      FROM public.contacts
      WHERE id = p_contact_id;
      
      v_new_score := GREATEST(0, LEAST(100, v_current_score + p_score_delta));
      
      UPDATE public.contacts
      SET 
        lead_score = v_new_score,
        lead_score_last_updated = now()
      WHERE id = p_contact_id;
      
      -- Log score event
      BEGIN
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
          v_current_score,
          v_new_score,
          p_score_delta,
          'message_intelligence',
          p_insight_id,
          jsonb_build_object('categories', p_categories)
        );
      EXCEPTION WHEN OTHERS THEN
        -- Score event logging failed, continue
        NULL;
      END;
    END IF;
    
    -- Update lead score (if using leads table)
    IF p_lead_id IS NOT NULL THEN
      -- Similar logic for leads table if it has score column
      BEGIN
        UPDATE public.leads
        SET score = GREATEST(0, LEAST(100, COALESCE(score, 0) + p_score_delta))
        WHERE id = p_lead_id;
      EXCEPTION WHEN OTHERS THEN
        -- Leads table might not have score column, continue
        NULL;
      END;
    END IF;
  END IF;
  
  -- Log timeline events
  IF p_contact_id IS NOT NULL THEN
    BEGIN
      -- Log message intelligence detection event
      PERFORM public.log_timeline_event(
        p_contact_id,
        'reply_received',
        jsonb_build_object(
          'message_intelligence', true,
          'categories', p_categories,
          'confidence', (SELECT confidence FROM public.message_insights WHERE id = p_insight_id),
          'insight_id', p_insight_id
        ),
        NULL, -- user_id (system)
        NULL, -- message_id
        NULL, -- task_id
        NULL, -- campaign_id
        NULL, -- thread_id
        NULL  -- note_id
      );
      
      -- Log score change event if score changed
      IF p_score_delta != 0 THEN
        PERFORM public.log_timeline_event(
          p_contact_id,
          'score_changed',
          jsonb_build_object(
            'old_score', v_current_score,
            'new_score', v_new_score,
            'delta', p_score_delta,
            'reason', 'message_intelligence',
            'categories', p_categories,
            'insight_id', p_insight_id
          ),
          NULL, -- user_id (system)
          NULL, -- message_id
          NULL, -- task_id
          NULL, -- campaign_id
          NULL, -- thread_id
          NULL  -- note_id
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Timeline logging failed, continue
      NULL;
    END;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.apply_message_intelligence_actions IS 'Applies side effects from message intelligence: tags, status updates, tasks, score changes (Block 14300)';

-- ============================================================================
-- 7. GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.message_insights TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_message_text(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_message_intelligence(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_intelligence_score_delta(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_message_intelligence(uuid, text, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_message_intelligence_actions(uuid, uuid, uuid, jsonb, integer, uuid) TO service_role;

-- ============================================================================
-- 8. TRIGGER: Auto-process message intelligence for new inbound messages
-- ============================================================================

-- Function to trigger message intelligence processing
CREATE OR REPLACE FUNCTION public.trigger_message_intelligence_processing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_id uuid;
  v_lead_id uuid;
BEGIN
  -- Only process inbound messages
  IF NEW.direction = 'inbound' OR NEW.direction = 'in' THEN
    -- Try to find contact_id or lead_id
    IF NEW.lead_id IS NOT NULL THEN
      v_lead_id := NEW.lead_id;
    ELSIF NEW.from_email IS NOT NULL THEN
      -- Try to find contact by email
      SELECT id INTO v_contact_id
      FROM public.contacts
      WHERE email = NEW.from_email
      LIMIT 1;
    END IF;
    
    -- Process message intelligence asynchronously (fire and forget)
    -- Note: This uses pg_notify or can be called via edge function webhook
    -- For now, we'll create a database trigger that can be called
    -- The actual processing should be done via edge function for better error handling
    PERFORM pg_notify('message_intelligence_process', json_build_object(
      'reply_id', NEW.id,
      'reply_table', TG_TABLE_NAME,
      'contact_id', v_contact_id,
      'lead_id', v_lead_id
    )::text);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on inbox_messages (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inbox_messages') THEN
    DROP TRIGGER IF EXISTS trg_process_message_intelligence_inbox ON public.inbox_messages;
    CREATE TRIGGER trg_process_message_intelligence_inbox
      AFTER INSERT ON public.inbox_messages
      FOR EACH ROW
      WHEN (NEW.direction = 'in' OR NEW.direction = 'inbound')
      EXECUTE FUNCTION public.trigger_message_intelligence_processing();
  END IF;
END $$;

COMMENT ON FUNCTION public.trigger_message_intelligence_processing IS 'Trigger function to auto-process message intelligence for new inbound messages (Block 14300)';

