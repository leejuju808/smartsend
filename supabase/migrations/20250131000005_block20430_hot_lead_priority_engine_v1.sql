-- =========================================================
-- Block 20430 — SmartSend Hot Lead Priority Engine v1
-- (Insurance Readiness Score + Job Value Score + Urgency Ranking)
-- =========================================================
--
-- This block turns SmartSend into a roofing lead commander — it tells contractors EXACTLY:
-- - Which homeowner to call first
-- - Which leads are worth money
-- - Which claims are ready to close
-- - Which jobs are high-value because of RCV
-- - Which ones need follow-up instead of focus
--
-- This is the block that makes SmartSend sticky and essential for roofers.
-- =========================================================

-- ============================================================================
-- PART 1 — Add Hot Lead Priority Fields to inbox_threads
-- ============================================================================

ALTER TABLE IF EXISTS public.inbox_threads
  -- Hot Lead Score (0-100)
  ADD COLUMN IF NOT EXISTS hot_lead_score integer DEFAULT NULL CHECK (hot_lead_score >= 0 AND hot_lead_score <= 100),
  
  -- Score breakdown (for debugging and transparency)
  ADD COLUMN IF NOT EXISTS hot_lead_score_breakdown jsonb DEFAULT '{}'::jsonb,
  
  -- Lead Tier Classification (1-5)
  ADD COLUMN IF NOT EXISTS hot_lead_tier integer DEFAULT NULL CHECK (hot_lead_tier >= 1 AND hot_lead_tier <= 5),
  
  -- Next Action Recommendation
  ADD COLUMN IF NOT EXISTS hot_lead_next_action text DEFAULT NULL,
  
  -- Score calculation metadata
  ADD COLUMN IF NOT EXISTS hot_lead_score_calculated_at timestamptz DEFAULT NULL,
  
  -- Score version (for future algorithm updates)
  ADD COLUMN IF NOT EXISTS hot_lead_score_version integer DEFAULT 1;

-- Indexes for hot lead queries
CREATE INDEX IF NOT EXISTS idx_threads_hot_lead_score ON public.inbox_threads(hot_lead_score DESC NULLS LAST) WHERE hot_lead_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_hot_lead_tier ON public.inbox_threads(hot_lead_tier, hot_lead_score DESC NULLS LAST) WHERE hot_lead_tier IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_hot_lead_tier_campaign ON public.inbox_threads(campaign_id, hot_lead_tier, hot_lead_score DESC NULLS LAST) WHERE hot_lead_tier IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_hot_lead_score_breakdown ON public.inbox_threads USING GIN(hot_lead_score_breakdown) WHERE hot_lead_score_breakdown != '{}'::jsonb;

-- Composite index for inbox sorting (most common query)
CREATE INDEX IF NOT EXISTS idx_threads_hot_lead_inbox_sort ON public.inbox_threads(campaign_id, hot_lead_tier, hot_lead_score DESC NULLS LAST, last_message_at DESC);

-- ============================================================================
-- PART 2 — Comments for Documentation
-- ============================================================================

COMMENT ON COLUMN public.inbox_threads.hot_lead_score IS 'Hot Lead Score (0-100): Insurance Readiness (0-40) + Job Value (0-30) + Homeowner Intent (0-20) + Timing/Urgency (0-10)';
COMMENT ON COLUMN public.inbox_threads.hot_lead_score_breakdown IS 'JSONB: {insurance_readiness: number, job_value: number, homeowner_intent: number, timing_urgency: number, details: {...}}';
COMMENT ON COLUMN public.inbox_threads.hot_lead_tier IS 'Lead Tier: 1=HOT (80-100), 2=WARM (60-79), 3=NURTURE (40-59), 4=COLD (20-39), 5=NOT_A_FIT (0-19)';
COMMENT ON COLUMN public.inbox_threads.hot_lead_next_action IS 'Recommended next action: CALL NOW, Send Install-Ready Script, Book install this week, Engage with follow-up sequence, etc.';
COMMENT ON COLUMN public.inbox_threads.hot_lead_score_calculated_at IS 'Timestamp when hot lead score was last calculated';
COMMENT ON COLUMN public.inbox_threads.hot_lead_score_version IS 'Algorithm version for score calculation (for future updates)';

-- ============================================================================
-- PART 3 — Function to Calculate Hot Lead Score
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_hot_lead_score(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread record;
  v_score_insurance_readiness integer := 0;
  v_score_job_value integer := 0;
  v_score_homeowner_intent integer := 0;
  v_score_timing_urgency integer := 0;
  v_total_score integer := 0;
  v_tier integer;
  v_next_action text;
  v_breakdown jsonb;
  v_rcv_total numeric;
  v_acv_total numeric;
  v_roof_squares numeric;
  v_stories integer;
  v_steep_charge boolean;
  v_supplement_opportunity boolean;
  v_o_and_p_included boolean;
  v_missing_items_count integer;
  v_recent_messages jsonb;
  v_intent_keywords text[];
  v_storm_keywords text[];
  v_followup_count integer;
BEGIN
  -- Get thread data
  SELECT 
    t.*,
    -- Get recent inbound messages for intent analysis
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('body', body, 'sent_at', sent_at))
      FROM public.inbox_messages
      WHERE thread_id = t.id
        AND direction = 'in'
        AND sent_at >= NOW() - INTERVAL '30 days'
      ORDER BY sent_at DESC
      LIMIT 10
    ), '[]'::jsonb) as recent_messages,
    -- Count follow-ups generated
    (SELECT COUNT(*) FROM public.followup_schedule WHERE contact_id = t.contact_id AND status = 'sent') as followup_count
  INTO v_thread
  FROM public.inbox_threads t
  WHERE t.id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Thread not found');
  END IF;
  
  -- Extract financial and scope data
  v_rcv_total := COALESCE((v_thread.claim_financials->>'rcv_total')::numeric, 0);
  v_acv_total := COALESCE((v_thread.claim_financials->>'acv_total')::numeric, 0);
  v_roof_squares := COALESCE((v_thread.roof_scope->>'total_squares')::numeric, 0);
  v_stories := COALESCE((v_thread.roof_scope->>'stories')::integer, 1);
  v_steep_charge := COALESCE((v_thread.roof_scope->>'steep_charge')::boolean, false);
  v_supplement_opportunity := COALESCE((v_thread.profitability_signals->>'supplement_opportunity')::boolean, false);
  v_o_and_p_included := COALESCE((v_thread.profitability_signals->>'o_and_p_included')::boolean, false);
  v_missing_items_count := COALESCE(jsonb_array_length(COALESCE(v_thread.profitability_signals->'missing_items', '[]'::jsonb)), 0);
  v_recent_messages := COALESCE(v_thread.recent_messages, '[]'::jsonb);
  v_followup_count := COALESCE(v_thread.followup_count, 0);
  
  -- ============================================================================
  -- A) Insurance Readiness Score (0-40 pts)
  -- ============================================================================
  
  CASE v_thread.insurance_claim_status
    WHEN 'approved' THEN
      -- Claim Approved (RCV)
      IF v_thread.insurance_payout_type = 'RCV' THEN
        v_score_insurance_readiness := 40;
      -- Claim Approved (ACV)
      ELSIF v_thread.insurance_payout_type = 'ACV' THEN
        v_score_insurance_readiness := 30;
      ELSE
        v_score_insurance_readiness := 35; -- Approved but payout type unknown
      END IF;
    WHEN 'approved_acv_only' THEN
      v_score_insurance_readiness := 30;
    WHEN 'adjuster_visit_scheduled' THEN
      v_score_insurance_readiness := 20;
    WHEN 'claim_filed_awaiting_adjuster', 'under_review' THEN
      v_score_insurance_readiness := 10;
    WHEN 'no_claim_filed' THEN
      -- Check for damage keywords in messages
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_recent_messages) msg
        WHERE (msg->>'body') ILIKE ANY(ARRAY['%hail%', '%wind%', '%storm%', '%damage%', '%leak%', '%roof%'])
      ) THEN
        v_score_insurance_readiness := 5;
      ELSE
        v_score_insurance_readiness := 0;
      END IF;
    WHEN 'denied' THEN
      v_score_insurance_readiness := 0;
    ELSE
      v_score_insurance_readiness := 0;
  END CASE;
  
  -- ============================================================================
  -- B) Job Value Score (0-30 pts)
  -- ============================================================================
  
  -- Use RCV if available, otherwise ACV, otherwise estimated value
  IF v_rcv_total > 0 THEN
    -- RCV > $20k → +25 pts
    IF v_rcv_total >= 20000 THEN
      v_score_job_value := 25;
    -- RCV $12–20k → +15 pts
    ELSIF v_rcv_total >= 12000 THEN
      v_score_job_value := 15;
    -- RCV < $12k → +5 pts
    ELSE
      v_score_job_value := 5;
    END IF;
  ELSIF v_acv_total > 0 THEN
    -- ACV scoring (slightly lower than RCV)
    IF v_acv_total >= 20000 THEN
      v_score_job_value := 20;
    ELSIF v_acv_total >= 12000 THEN
      v_score_job_value := 12;
    ELSE
      v_score_job_value := 3;
    END IF;
  ELSIF v_thread.thread_estimated_value IS NOT NULL AND v_thread.thread_estimated_value > 0 THEN
    -- Use estimated value as fallback
    IF v_thread.thread_estimated_value >= 20000 THEN
      v_score_job_value := 20;
    ELSIF v_thread.thread_estimated_value >= 12000 THEN
      v_score_job_value := 12;
    ELSE
      v_score_job_value := 3;
    END IF;
  ELSE
    v_score_job_value := 0;
  END IF;
  
  -- Add-ons for job value
  -- Steep/2-story → +3–5 pts
  IF v_stories >= 2 OR v_steep_charge = true THEN
    v_score_job_value := v_score_job_value + 5;
  ELSIF v_stories = 1 AND v_steep_charge = true THEN
    v_score_job_value := v_score_job_value + 3;
  END IF;
  
  -- Supplement opportunity → +3–7 pts
  IF v_supplement_opportunity = true THEN
    v_score_job_value := v_score_job_value + 7;
  ELSIF NOT v_o_and_p_included THEN
    -- Missing O&P is a supplement opportunity
    v_score_job_value := v_score_job_value + 5;
  END IF;
  
  -- Missing code items → +2 pts
  IF v_missing_items_count > 0 THEN
    v_score_job_value := v_score_job_value + 2;
  END IF;
  
  -- Cap job value at 30
  v_score_job_value := LEAST(v_score_job_value, 30);
  
  -- ============================================================================
  -- C) Homeowner Intent Score (0-20 pts)
  -- ============================================================================
  
  -- High-intent keywords
  v_intent_keywords := ARRAY[
    'can you come give me an estimate',
    'when can we schedule',
    'what''s the next step',
    'we''re ready to go',
    'ready to move forward',
    'let''s get started',
    'when can you start',
    'i want to proceed',
    'schedule an appointment',
    'book the job'
  ];
  
  -- Check recent messages for high-intent signals
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_recent_messages) msg
    WHERE EXISTS (
      SELECT 1 FROM unnest(v_intent_keywords) keyword
      WHERE (msg->>'body') ILIKE '%' || keyword || '%'
    )
  ) THEN
    v_score_homeowner_intent := 20;
  -- Medium intent keywords
  ELSIF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_recent_messages) msg
    WHERE (msg->>'body') ILIKE ANY(ARRAY['%we''re deciding%', '%looking for a quote%', '%comparing%', '%getting estimates%', '%interested%'])
  ) THEN
    v_score_homeowner_intent := 10;
  -- Low intent or minimal replies
  ELSIF jsonb_array_length(v_recent_messages) > 0 THEN
    v_score_homeowner_intent := 5;
  ELSE
    v_score_homeowner_intent := 0;
  END IF;
  
  -- ============================================================================
  -- D) Timing/Urgency Score (0-10 pts)
  -- ============================================================================
  
  -- Storm just hit (keyword detection)
  v_storm_keywords := ARRAY['hail', 'windstorm', 'insurance coming out', 'adjuster', 'storm damage'];
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_recent_messages) msg
    WHERE EXISTS (
      SELECT 1 FROM unnest(v_storm_keywords) keyword
      WHERE (msg->>'body') ILIKE '%' || keyword || '%'
    )
    AND (msg->>'sent_at')::timestamptz >= NOW() - INTERVAL '7 days'
  ) THEN
    v_score_timing_urgency := v_score_timing_urgency + 5;
  END IF;
  
  -- Homeowner followed up twice → +3
  IF v_followup_count >= 2 THEN
    v_score_timing_urgency := v_score_timing_urgency + 3;
  END IF;
  
  -- Carrier asked for contractor estimate within 48 hrs → +2
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_recent_messages) msg
    WHERE (msg->>'body') ILIKE ANY(ARRAY['%estimate within%', '%48 hours%', '%2 days%', '%deadline%'])
    AND (msg->>'sent_at')::timestamptz >= NOW() - INTERVAL '48 hours'
  ) THEN
    v_score_timing_urgency := v_score_timing_urgency + 2;
  END IF;
  
  -- Cap timing urgency at 10
  v_score_timing_urgency := LEAST(v_score_timing_urgency, 10);
  
  -- ============================================================================
  -- Calculate Total Score and Tier
  -- ============================================================================
  
  v_total_score := v_score_insurance_readiness + v_score_job_value + v_score_homeowner_intent + v_score_timing_urgency;
  
  -- Determine tier
  IF v_total_score >= 80 THEN
    v_tier := 1; -- HOT
    v_next_action := 'CALL NOW';
  ELSIF v_total_score >= 60 THEN
    v_tier := 2; -- WARM
    v_next_action := 'Engage with follow-up sequence';
  ELSIF v_total_score >= 40 THEN
    v_tier := 3; -- NURTURE
    v_next_action := 'Wait for adjuster results or provide estimate';
  ELSIF v_total_score >= 20 THEN
    v_tier := 4; -- COLD
    v_next_action := 'Monthly check-in';
  ELSE
    v_tier := 5; -- NOT A FIT
    v_next_action := 'Archive or categorize as non-roofing';
  END IF;
  
  -- Build breakdown JSON
  v_breakdown := jsonb_build_object(
    'insurance_readiness', v_score_insurance_readiness,
    'job_value', v_score_job_value,
    'homeowner_intent', v_score_homeowner_intent,
    'timing_urgency', v_score_timing_urgency,
    'total', v_total_score,
    'details', jsonb_build_object(
      'claim_status', v_thread.insurance_claim_status,
      'payout_type', v_thread.insurance_payout_type,
      'rcv_total', v_rcv_total,
      'acv_total', v_acv_total,
      'roof_squares', v_roof_squares,
      'stories', v_stories,
      'steep_charge', v_steep_charge,
      'supplement_opportunity', v_supplement_opportunity,
      'o_and_p_included', v_o_and_p_included,
      'missing_items_count', v_missing_items_count,
      'recent_messages_count', jsonb_array_length(v_recent_messages),
      'followup_count', v_followup_count
    )
  );
  
  -- Update thread with calculated score
  UPDATE public.inbox_threads
  SET 
    hot_lead_score = v_total_score,
    hot_lead_score_breakdown = v_breakdown,
    hot_lead_tier = v_tier,
    hot_lead_next_action = v_next_action,
    hot_lead_score_calculated_at = NOW(),
    updated_at = NOW()
  WHERE id = p_thread_id;
  
  -- Return result
  RETURN jsonb_build_object(
    'thread_id', p_thread_id,
    'hot_lead_score', v_total_score,
    'hot_lead_tier', v_tier,
    'hot_lead_next_action', v_next_action,
    'breakdown', v_breakdown
  );
END;
$$;

COMMENT ON FUNCTION public.calculate_hot_lead_score IS 'Calculates Hot Lead Score (0-100) and tier classification for a thread based on insurance readiness, job value, homeowner intent, and timing signals';

-- ============================================================================
-- PART 4 — Trigger Logic to Recalculate Score on Data Changes
-- ============================================================================

-- Function to trigger score recalculation
CREATE OR REPLACE FUNCTION public.trigger_hot_lead_score_recalculation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Recalculate score when relevant fields change
  IF (
    -- Insurance fields changed
    (OLD.insurance_claim_status IS DISTINCT FROM NEW.insurance_claim_status) OR
    (OLD.insurance_payout_type IS DISTINCT FROM NEW.insurance_payout_type) OR
    (OLD.insurance_install_ready IS DISTINCT FROM NEW.insurance_install_ready) OR
    -- Financial/scope fields changed
    (OLD.claim_financials IS DISTINCT FROM NEW.claim_financials) OR
    (OLD.roof_scope IS DISTINCT FROM NEW.roof_scope) OR
    (OLD.profitability_signals IS DISTINCT FROM NEW.profitability_signals) OR
    (OLD.thread_estimated_value IS DISTINCT FROM NEW.thread_estimated_value) OR
    -- New attachment parsed
    (OLD.has_parsed_scope IS DISTINCT FROM NEW.has_parsed_scope)
  ) THEN
    -- Recalculate score (async via pg_net if available, otherwise sync)
    PERFORM public.calculate_hot_lead_score(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trigger_hot_lead_score_recalculation ON public.inbox_threads;
CREATE TRIGGER trg_trigger_hot_lead_score_recalculation
  AFTER UPDATE ON public.inbox_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_hot_lead_score_recalculation();

-- Trigger on new message (for intent analysis)
CREATE OR REPLACE FUNCTION public.trigger_hot_lead_score_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Recalculate score when new inbound message arrives (for intent analysis)
  IF NEW.direction = 'in' AND NEW.thread_id IS NOT NULL THEN
    PERFORM public.calculate_hot_lead_score(NEW.thread_id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trigger_hot_lead_score_on_message ON public.inbox_messages;
CREATE TRIGGER trg_trigger_hot_lead_score_on_message
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  WHEN (NEW.direction = 'in')
  EXECUTE FUNCTION public.trigger_hot_lead_score_on_message();

-- Trigger on follow-up generation (for timing signals)
CREATE OR REPLACE FUNCTION public.trigger_hot_lead_score_on_followup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread_id uuid;
BEGIN
  -- Only trigger when status changes to 'sent' (follow-up was actually sent)
  IF NEW.status = 'sent' AND (OLD.status IS NULL OR OLD.status != 'sent') THEN
    -- Get thread_id from contact_id
    SELECT id INTO v_thread_id
    FROM public.inbox_threads
    WHERE contact_id = NEW.contact_id
    ORDER BY last_message_at DESC
    LIMIT 1;
    
    -- Recalculate score if thread found
    IF v_thread_id IS NOT NULL THEN
      PERFORM public.calculate_hot_lead_score(v_thread_id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trigger_hot_lead_score_on_followup ON public.followup_schedule;
CREATE TRIGGER trg_trigger_hot_lead_score_on_followup
  AFTER UPDATE ON public.followup_schedule
  FOR EACH ROW
  WHEN (NEW.status = 'sent' AND (OLD.status IS NULL OR OLD.status != 'sent'))
  EXECUTE FUNCTION public.trigger_hot_lead_score_on_followup();

COMMENT ON FUNCTION public.trigger_hot_lead_score_recalculation IS 'Trigger that recalculates hot lead score when insurance, financial, or scope data changes';
COMMENT ON FUNCTION public.trigger_hot_lead_score_on_message IS 'Trigger that recalculates hot lead score when new inbound message arrives';
COMMENT ON FUNCTION public.trigger_hot_lead_score_on_followup IS 'Trigger that recalculates hot lead score when follow-up is generated';

-- ============================================================================
-- PART 5 — Views and Helper Functions for UI Display
-- ============================================================================

-- View for HOT leads (Tier 1)
CREATE OR REPLACE VIEW public.inbox_hot_leads AS
SELECT 
  t.id as thread_id,
  t.campaign_id,
  t.contact_id,
  t.hot_lead_score,
  t.hot_lead_tier,
  t.hot_lead_next_action,
  t.hot_lead_score_breakdown,
  t.insurance_carrier,
  t.insurance_claim_status,
  t.insurance_payout_type,
  t.insurance_install_ready,
  t.claim_financials,
  t.roof_scope,
  t.thread_estimated_value,
  t.last_message_at,
  t.hot_lead_score_calculated_at
FROM public.inbox_threads t
WHERE t.hot_lead_tier = 1
  AND t.hot_lead_score IS NOT NULL
ORDER BY t.hot_lead_score DESC, t.last_message_at DESC;

COMMENT ON VIEW public.inbox_hot_leads IS 'View of all HOT leads (Tier 1, score 80-100) sorted by score';

-- View for all leads with tier classification
CREATE OR REPLACE VIEW public.inbox_leads_by_tier AS
SELECT 
  t.id as thread_id,
  t.campaign_id,
  t.contact_id,
  t.hot_lead_score,
  t.hot_lead_tier,
  t.hot_lead_next_action,
  t.insurance_carrier,
  t.insurance_claim_status,
  t.insurance_payout_type,
  t.thread_estimated_value,
  t.last_message_at,
  CASE t.hot_lead_tier
    WHEN 1 THEN '🔥 HOT'
    WHEN 2 THEN '⚡ WARM'
    WHEN 3 THEN '📩 NURTURE'
    WHEN 4 THEN '🧊 COLD'
    WHEN 5 THEN '❌ NOT A FIT'
    ELSE 'UNKNOWN'
  END as tier_label
FROM public.inbox_threads t
WHERE t.hot_lead_score IS NOT NULL
ORDER BY t.hot_lead_tier ASC, t.hot_lead_score DESC, t.last_message_at DESC;

COMMENT ON VIEW public.inbox_leads_by_tier IS 'View of all leads with tier classification and labels';

-- Function to get hot lead summary for UI display
CREATE OR REPLACE FUNCTION public.get_hot_lead_summary(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result jsonb;
  v_rcv_total numeric;
  v_roof_squares numeric;
  v_stories integer;
BEGIN
  SELECT 
    jsonb_build_object(
      'thread_id', t.id,
      'hot_lead_score', t.hot_lead_score,
      'hot_lead_tier', t.hot_lead_tier,
      'hot_lead_next_action', t.hot_lead_next_action,
      'tier_label', CASE t.hot_lead_tier
        WHEN 1 THEN '🔥 HOT'
        WHEN 2 THEN '⚡ WARM'
        WHEN 3 THEN '📩 NURTURE'
        WHEN 4 THEN '🧊 COLD'
        WHEN 5 THEN '❌ NOT A FIT'
        ELSE 'UNKNOWN'
      END,
      'score_breakdown', t.hot_lead_score_breakdown,
      'insurance', jsonb_build_object(
        'carrier', t.insurance_carrier,
        'claim_status', t.insurance_claim_status,
        'payout_type', t.insurance_payout_type,
        'install_ready', t.insurance_install_ready
      ),
      'scope', jsonb_build_object(
        'rcv_total', (t.claim_financials->>'rcv_total')::numeric,
        'roof_squares', (t.roof_scope->>'total_squares')::numeric,
        'stories', (t.roof_scope->>'stories')::integer,
        'steep_charge', (t.roof_scope->>'steep_charge')::boolean
      ),
      'intent', jsonb_build_object(
        'score', t.hot_lead_score_breakdown->>'homeowner_intent',
        'details', t.hot_lead_score_breakdown->'details'
      ),
      'calculated_at', t.hot_lead_score_calculated_at
    )
  INTO v_result
  FROM public.inbox_threads t
  WHERE t.id = p_thread_id;
  
  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_hot_lead_summary IS 'Returns hot lead summary for UI display with formatted tier labels and score breakdown';

-- Function to get inbox view with hot lead scores
CREATE OR REPLACE FUNCTION public.get_inbox_with_hot_lead_scores(p_campaign_id uuid, p_limit integer DEFAULT 50)
RETURNS TABLE (
  thread_id uuid,
  contact_id uuid,
  hot_lead_score integer,
  hot_lead_tier integer,
  tier_label text,
  hot_lead_next_action text,
  insurance_carrier text,
  insurance_claim_status text,
  insurance_payout_type text,
  rcv_total numeric,
  roof_squares numeric,
  intent_score integer,
  last_message_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id as thread_id,
    t.contact_id,
    t.hot_lead_score,
    t.hot_lead_tier,
    CASE t.hot_lead_tier
      WHEN 1 THEN '🔥 HOT'
      WHEN 2 THEN '⚡ WARM'
      WHEN 3 THEN '📩 NURTURE'
      WHEN 4 THEN '🧊 COLD'
      WHEN 5 THEN '❌ NOT A FIT'
      ELSE 'UNKNOWN'
    END as tier_label,
    t.hot_lead_next_action,
    t.insurance_carrier,
    t.insurance_claim_status,
    t.insurance_payout_type,
    (t.claim_financials->>'rcv_total')::numeric as rcv_total,
    (t.roof_scope->>'total_squares')::numeric as roof_squares,
    (t.hot_lead_score_breakdown->>'homeowner_intent')::integer as intent_score,
    t.last_message_at
  FROM public.inbox_threads t
  WHERE t.campaign_id = p_campaign_id
    AND t.hot_lead_score IS NOT NULL
  ORDER BY 
    t.hot_lead_tier ASC,
    t.hot_lead_score DESC NULLS LAST,
    t.last_message_at DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_inbox_with_hot_lead_scores IS 'Returns inbox threads with hot lead scores for UI display, sorted by tier and score';

-- ============================================================================
-- PART 6 — Batch Recalculation Function
-- ============================================================================

-- Function to recalculate scores for all threads in a campaign
CREATE OR REPLACE FUNCTION public.recalculate_hot_lead_scores_for_campaign(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread_id uuid;
  v_count integer := 0;
  v_errors integer := 0;
BEGIN
  -- Loop through all threads in campaign
  FOR v_thread_id IN 
    SELECT id FROM public.inbox_threads WHERE campaign_id = p_campaign_id
  LOOP
    BEGIN
      PERFORM public.calculate_hot_lead_score(v_thread_id);
      v_count := v_count + 1;
    EXCEPTION
      WHEN OTHERS THEN
        v_errors := v_errors + 1;
        -- Log error but continue
        RAISE WARNING 'Error calculating score for thread %: %', v_thread_id, SQLERRM;
    END;
  END LOOP;
  
  RETURN jsonb_build_object(
    'campaign_id', p_campaign_id,
    'threads_processed', v_count,
    'errors', v_errors,
    'completed_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.recalculate_hot_lead_scores_for_campaign IS 'Recalculates hot lead scores for all threads in a campaign (useful for initial setup or algorithm updates)';

-- ============================================================================
-- PART 7 — Initial Score Calculation for Existing Threads
-- ============================================================================

-- Note: This can be run manually after migration to calculate scores for existing threads
-- Example: SELECT public.recalculate_hot_lead_scores_for_campaign('campaign-uuid-here');

