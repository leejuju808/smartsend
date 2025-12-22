-- =========================================================
-- Block 14400 — SmartSend Revenue Engine v1
-- (The System That Tracks Estimated Job Value, Detects Big Jobs, and Shows Roofers Their Real Revenue Pipeline)
-- =========================================================

-- ============================================================================
-- 1. ADD REVENUE FIELDS TO CONTACTS TABLE
-- ============================================================================

ALTER TABLE IF EXISTS public.contacts
  ADD COLUMN IF NOT EXISTS job_type text CHECK (job_type IN ('repair', 'replacement', 'insurance_claim', 'storm_damage', 'unknown')),
  ADD COLUMN IF NOT EXISTS estimated_value_min numeric(12,2),
  ADD COLUMN IF NOT EXISTS estimated_value_max numeric(12,2),
  ADD COLUMN IF NOT EXISTS estimated_value_confidence numeric(3,2) CHECK (estimated_value_confidence >= 0.0 AND estimated_value_confidence <= 1.0),
  ADD COLUMN IF NOT EXISTS revenue_category text CHECK (revenue_category IN ('repair', 'replacement', 'insurance', 'storm'));

-- Indexes for revenue queries
CREATE INDEX IF NOT EXISTS idx_contacts_revenue_category 
  ON public.contacts(workspace_id, revenue_category) 
  WHERE revenue_category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_job_type 
  ON public.contacts(workspace_id, job_type) 
  WHERE job_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_estimated_value 
  ON public.contacts(workspace_id, estimated_value_min, estimated_value_max) 
  WHERE estimated_value_min IS NOT NULL;

-- ============================================================================
-- 2. CREATE revenue_events TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.revenue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Value change tracking
  old_value_min numeric(12,2),
  old_value_max numeric(12,2),
  new_value_min numeric(12,2),
  new_value_max numeric(12,2),
  
  old_job_type text,
  new_job_type text,
  
  old_revenue_category text,
  new_revenue_category text,
  
  -- Reason and source
  reason text NOT NULL, -- e.g., 'message_intelligence', 'roofer_update', 'enrichment', 'manual'
  source text NOT NULL, -- e.g., 'auto_detection', 'user_input', 'enrichment_update'
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb, -- Additional context about the change
  
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for revenue events
CREATE INDEX IF NOT EXISTS idx_revenue_events_contact 
  ON public.revenue_events(contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_revenue_events_workspace 
  ON public.revenue_events(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_revenue_events_reason 
  ON public.revenue_events(reason);

-- RLS for revenue_events
ALTER TABLE public.revenue_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view revenue events for contacts in their workspace
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'revenue_events'
      AND policyname = 'Users can view revenue events for their workspace contacts'
  ) THEN
    CREATE POLICY "Users can view revenue events for their workspace contacts"
      ON public.revenue_events
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

-- Policy: Service role can insert revenue events
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'revenue_events'
      AND policyname = 'Service role can insert revenue events'
  ) THEN
    CREATE POLICY "Service role can insert revenue events"
      ON public.revenue_events
      FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.revenue_events IS 'Tracks all revenue estimate changes for contacts (Block 14400)';
COMMENT ON COLUMN public.revenue_events.reason IS 'Reason for the change: message_intelligence, roofer_update, enrichment, manual';
COMMENT ON COLUMN public.revenue_events.source IS 'Source of the change: auto_detection, user_input, enrichment_update';

-- ============================================================================
-- 3. FUNCTION: Detect job type from message intelligence
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_job_type_from_intelligence(
  p_message_insights jsonb DEFAULT '[]'::jsonb,
  p_tags text[] DEFAULT '{}',
  p_enrichment jsonb DEFAULT '{}'::jsonb
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_categories jsonb;
  v_category text;
  v_has_insurance boolean := false;
  v_has_storm boolean := false;
  v_has_repair boolean := false;
  v_has_replacement boolean := false;
BEGIN
  -- Check message insights categories
  FOR v_category IN SELECT jsonb_array_elements_text(p_message_insights)
  LOOP
    IF v_category = 'insurance_interest' THEN
      v_has_insurance := true;
    END IF;
    IF v_category = 'storm_damage' THEN
      v_has_storm := true;
    END IF;
    IF v_category = 'leak_repair' THEN
      v_has_repair := true;
    END IF;
  END LOOP;
  
  -- Check tags
  IF 'insurance' = ANY(p_tags) OR 'insurance_claim' = ANY(p_tags) THEN
    v_has_insurance := true;
  END IF;
  IF 'storm' = ANY(p_tags) OR 'storm_damage' = ANY(p_tags) THEN
    v_has_storm := true;
  END IF;
  IF 'repair' = ANY(p_tags) OR 'leak' = ANY(p_tags) THEN
    v_has_repair := true;
  END IF;
  IF 'replacement' = ANY(p_tags) OR 'full_roof' = ANY(p_tags) THEN
    v_has_replacement := true;
  END IF;
  
  -- Check enrichment
  IF (p_enrichment->>'insurance_interest')::boolean = true THEN
    v_has_insurance := true;
  END IF;
  IF p_enrichment->>'storm_risk_level' IN ('high', 'medium') THEN
    v_has_storm := true;
  END IF;
  
  -- Determine job type priority
  IF v_has_insurance THEN
    RETURN 'insurance_claim';
  ELSIF v_has_storm THEN
    RETURN 'storm_damage';
  ELSIF v_has_replacement THEN
    RETURN 'replacement';
  ELSIF v_has_repair THEN
    RETURN 'repair';
  ELSE
    RETURN 'unknown';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.detect_job_type_from_intelligence IS 'Detects job type from message intelligence, tags, and enrichment data';

-- ============================================================================
-- 4. FUNCTION: Calculate estimated value based on job type and factors
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_estimated_value(
  p_job_type text,
  p_zip_code text DEFAULT NULL,
  p_neighborhood text DEFAULT NULL,
  p_lead_score integer DEFAULT 50,
  p_enrichment jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_value_min numeric(12,2);
  v_value_max numeric(12,2);
  v_confidence numeric(3,2);
  v_zip_factor numeric(3,2) := 1.0; -- Default: no adjustment
  v_lead_score_factor numeric(3,2) := 1.0;
  v_result jsonb;
BEGIN
  -- Base value ranges by job type
  CASE p_job_type
    WHEN 'repair' THEN
      v_value_min := 250;
      v_value_max := 1500;
      v_confidence := 0.70;
    WHEN 'replacement' THEN
      v_value_min := 9000;
      v_value_max := 28000;
      v_confidence := 0.75;
    WHEN 'insurance_claim' THEN
      v_value_min := 12000;
      v_value_max := 35000;
      v_confidence := 0.80;
    WHEN 'storm_damage' THEN
      v_value_min := 1000;
      v_value_max := 30000;
      v_confidence := 0.65;
    ELSE
      -- Unknown job type
      v_value_min := NULL;
      v_value_max := NULL;
      v_confidence := 0.0;
      RETURN jsonb_build_object(
        'value_min', NULL,
        'value_max', NULL,
        'confidence', 0.0,
        'zip_factor', 1.0,
        'lead_score_factor', 1.0
      );
  END CASE;
  
  -- Apply zip code / neighborhood factor
  -- Premium neighborhoods: +20-30%
  -- Low-cost neighborhoods: -10-20%
  -- This is simplified - in production, you'd have a lookup table
  IF p_neighborhood IS NOT NULL THEN
    IF p_neighborhood ~* '(premium|upscale|luxury|estate|hills|heights)' THEN
      v_zip_factor := 1.25; -- +25%
    ELSIF p_neighborhood ~* '(low|affordable|budget|economy)' THEN
      v_zip_factor := 0.85; -- -15%
    END IF;
  END IF;
  
  -- Apply lead score factor
  -- HOT (80-100): +40% confidence
  -- WARM (40-79): baseline
  -- COLD (0-39): -70% confidence
  IF p_lead_score >= 80 THEN
    v_lead_score_factor := 1.40; -- HOT: +40%
    v_confidence := LEAST(1.0, v_confidence * 1.40);
  ELSIF p_lead_score >= 40 THEN
    v_lead_score_factor := 1.0; -- WARM: baseline
  ELSE
    v_lead_score_factor := 0.30; -- COLD: -70%
    v_confidence := v_confidence * 0.30;
  END IF;
  
  -- Apply factors to value ranges
  v_value_min := v_value_min * v_zip_factor;
  v_value_max := v_value_max * v_zip_factor;
  
  -- Adjust confidence based on lead score
  -- Confidence already adjusted above
  
  RETURN jsonb_build_object(
    'value_min', ROUND(v_value_min, 2),
    'value_max', ROUND(v_value_max, 2),
    'confidence', ROUND(v_confidence, 2),
    'zip_factor', v_zip_factor,
    'lead_score_factor', v_lead_score_factor
  );
END;
$$;

COMMENT ON FUNCTION public.calculate_estimated_value IS 'Calculates estimated job value based on job type, zip code, neighborhood, and lead score';

-- ============================================================================
-- 5. FUNCTION: Main revenue calculation function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_contact_revenue(
  p_contact_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact record;
  v_enrichment record;
  v_message_insights jsonb := '[]'::jsonb;
  v_categories jsonb;
  v_job_type text;
  v_revenue_category text;
  v_value_result jsonb;
  v_old_value_min numeric(12,2);
  v_old_value_max numeric(12,2);
  v_old_job_type text;
  v_old_revenue_category text;
  v_result jsonb;
BEGIN
  -- Get contact data
  SELECT 
    c.*,
    ce.inferred_zip,
    ce.inferred_neighborhood,
    ce.storm_risk_level,
    ce.insurance_interest,
    ce.enrichment_sources
  INTO v_contact
  FROM public.contacts c
  LEFT JOIN public.contact_enrichment ce ON ce.contact_id = c.id
  WHERE c.id = p_contact_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact not found: %', p_contact_id;
  END IF;
  
  -- Get latest message insights
  SELECT jsonb_agg(categories)
  INTO v_categories
  FROM (
    SELECT categories
    FROM public.message_insights
    WHERE contact_id = p_contact_id
    ORDER BY created_at DESC
    LIMIT 5
  ) mi;
  
  IF v_categories IS NOT NULL THEN
    -- Flatten array of arrays into single array
    SELECT jsonb_agg(DISTINCT value)
    INTO v_message_insights
    FROM (
      SELECT jsonb_array_elements_text(categories) as value
      FROM jsonb_array_elements(v_categories)
    ) t;
  END IF;
  
  -- Build enrichment jsonb
  v_enrichment := jsonb_build_object(
    'insurance_interest', COALESCE(v_contact.insurance_interest, false),
    'storm_risk_level', COALESCE(v_contact.storm_risk_level, 'unknown'),
    'zip_code', v_contact.inferred_zip,
    'neighborhood', v_contact.inferred_neighborhood
  );
  
  -- Detect job type
  v_job_type := public.detect_job_type_from_intelligence(
    v_message_insights,
    COALESCE(v_contact.tags, '{}'),
    v_enrichment
  );
  
  -- Determine revenue category
  CASE v_job_type
    WHEN 'insurance_claim' THEN
      v_revenue_category := 'insurance';
    WHEN 'storm_damage' THEN
      v_revenue_category := 'storm';
    WHEN 'replacement' THEN
      v_revenue_category := 'replacement';
    WHEN 'repair' THEN
      v_revenue_category := 'repair';
    ELSE
      v_revenue_category := NULL;
  END CASE;
  
  -- Calculate estimated value
  v_value_result := public.calculate_estimated_value(
    v_job_type,
    v_contact.inferred_zip,
    v_contact.inferred_neighborhood,
    COALESCE(v_contact.lead_score, 50),
    v_enrichment
  );
  
  -- Store old values for event logging
  v_old_value_min := v_contact.estimated_value_min;
  v_old_value_max := v_contact.estimated_value_max;
  v_old_job_type := v_contact.job_type;
  v_old_revenue_category := v_contact.revenue_category;
  
  -- Update contact with new revenue estimates
  UPDATE public.contacts
  SET
    job_type = v_job_type,
    estimated_value_min = (v_value_result->>'value_min')::numeric(12,2),
    estimated_value_max = (v_value_result->>'value_max')::numeric(12,2),
    estimated_value_confidence = (v_value_result->>'confidence')::numeric(3,2),
    revenue_category = v_revenue_category,
    updated_at = now()
  WHERE id = p_contact_id;
  
  -- Log revenue event if values changed
  IF v_old_value_min IS DISTINCT FROM (v_value_result->>'value_min')::numeric(12,2)
     OR v_old_value_max IS DISTINCT FROM (v_value_result->>'value_max')::numeric(12,2)
     OR v_old_job_type IS DISTINCT FROM v_job_type
     OR v_old_revenue_category IS DISTINCT FROM v_revenue_category THEN
    
    INSERT INTO public.revenue_events (
      contact_id,
      workspace_id,
      old_value_min,
      old_value_max,
      new_value_min,
      new_value_max,
      old_job_type,
      new_job_type,
      old_revenue_category,
      new_revenue_category,
      reason,
      source,
      metadata
    ) VALUES (
      p_contact_id,
      v_contact.workspace_id,
      v_old_value_min,
      v_old_value_max,
      (v_value_result->>'value_min')::numeric(12,2),
      (v_value_result->>'value_max')::numeric(12,2),
      v_old_job_type,
      v_job_type,
      v_old_revenue_category,
      v_revenue_category,
      'message_intelligence',
      'auto_detection',
      jsonb_build_object(
        'message_insights', v_message_insights,
        'tags', v_contact.tags,
        'enrichment', v_enrichment,
        'lead_score', v_contact.lead_score
      )
    );
  END IF;
  
  -- Return result
  RETURN jsonb_build_object(
    'contact_id', p_contact_id,
    'job_type', v_job_type,
    'revenue_category', v_revenue_category,
    'value_min', v_value_result->>'value_min',
    'value_max', v_value_result->>'value_max',
    'confidence', v_value_result->>'confidence',
    'zip_factor', v_value_result->>'zip_factor',
    'lead_score_factor', v_value_result->>'lead_score_factor'
  );
END;
$$;

COMMENT ON FUNCTION public.calculate_contact_revenue IS 'Main function to calculate and update revenue estimates for a contact (Block 14400)';

-- ============================================================================
-- 6. FUNCTION: Recalculate revenue for all contacts in workspace
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recalculate_workspace_revenue(
  p_workspace_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_id uuid;
  v_count integer := 0;
BEGIN
  -- Recalculate revenue for all contacts in workspace
  FOR v_contact_id IN 
    SELECT id FROM public.contacts WHERE workspace_id = p_workspace_id
  LOOP
    BEGIN
      PERFORM public.calculate_contact_revenue(v_contact_id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Log error but continue with other contacts
      RAISE WARNING 'Error calculating revenue for contact %: %', v_contact_id, SQLERRM;
    END;
  END LOOP;
  
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.recalculate_workspace_revenue IS 'Recalculates revenue estimates for all contacts in a workspace (Block 14400)';

-- ============================================================================
-- 7. GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.revenue_events TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_job_type_from_intelligence(jsonb, text[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_estimated_value(text, text, text, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_contact_revenue(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_workspace_revenue(uuid) TO service_role;

-- ============================================================================
-- 8. TRIGGER: Auto-calculate revenue when message intelligence is created
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_revenue_recalculation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Trigger revenue recalculation when new message insight is created
  IF NEW.contact_id IS NOT NULL THEN
    -- Use pg_notify to trigger async recalculation (or call directly)
    -- For now, we'll call it directly but it could be async
    BEGIN
      PERFORM public.calculate_contact_revenue(NEW.contact_id);
    EXCEPTION WHEN OTHERS THEN
      -- Log error but don't fail the insert
      RAISE WARNING 'Error recalculating revenue for contact %: %', NEW.contact_id, SQLERRM;
    END;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on message_insights
DROP TRIGGER IF EXISTS trg_revenue_recalculation ON public.message_insights;
CREATE TRIGGER trg_revenue_recalculation
  AFTER INSERT ON public.message_insights
  FOR EACH ROW
  WHEN (NEW.contact_id IS NOT NULL)
  EXECUTE FUNCTION public.trigger_revenue_recalculation();

COMMENT ON FUNCTION public.trigger_revenue_recalculation IS 'Auto-triggers revenue recalculation when new message intelligence is detected (Block 14400)';





















































