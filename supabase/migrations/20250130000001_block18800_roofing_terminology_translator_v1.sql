-- =========================================================
-- Block 18800 — SmartSend Roofing Terminology Translator v1
-- (AI Engine That Translates Homeowner Language → Exact Roofing Terms,
--  Damage Types, Insurance Categories & Sales-Friendly Definitions)
-- =========================================================

-- ============================================================================
-- 1. TERMINOLOGY TRANSLATIONS TABLE
-- ============================================================================
-- Stores AI translations from homeowner language to roofing terminology

CREATE TABLE IF NOT EXISTS public.terminology_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Source Message
  homeowner_message text NOT NULL,
  message_source text NOT NULL CHECK (message_source IN (
    'email', 'sms', 'phone_call', 'form_submission', 'chat', 'note', 'manual'
  )),
  message_timestamp timestamptz NOT NULL DEFAULT now(),
  
  -- Translation Results
  roofing_term text NOT NULL, -- e.g., "wind uplift on ridge cap"
  material_type text, -- 'asphalt_shingle', 'metal', 'tile', 'flat', 'slate', 'wood_shake'
  damage_type text, -- 'structural', 'shingle', 'flashing', 'ventilation', 'interior_leak'
  repair_category text, -- 'emergency', 'urgent', 'routine', 'maintenance', 'replacement'
  storm_category text, -- 'hail', 'wind', 'storm', 'wear_tear', 'aging', 'manufacturer_defect', 'improper_installation'
  insurance_category text, -- 'storm', 'wear_tear', 'manufacturer_defect', 'improper_installation', 'aging', 'emergency_leak'
  
  -- Classification Details
  urgency_level text NOT NULL CHECK (urgency_level IN ('emergency', 'high', 'medium', 'low', 'uncertain')) DEFAULT 'uncertain',
  severity_score integer NOT NULL DEFAULT 0 CHECK (severity_score >= 0 AND severity_score <= 100),
  
  -- AI-Generated Insights
  ai_explanation text, -- "What the homeowner REALLY means" explanation
  detected_keywords jsonb DEFAULT '[]'::jsonb, -- ['leak', 'missing', 'hail', 'wind', 'insurance']
  keyword_explanations jsonb DEFAULT '{}'::jsonb, -- {'leak': 'Indicates active water intrusion'}
  
  -- Material Detection
  detected_material text, -- Material detected from message
  material_confidence numeric(5,2) DEFAULT 0 CHECK (material_confidence >= 0 AND material_confidence <= 100),
  
  -- Storm Impact
  storm_impact_score integer DEFAULT 0 CHECK (storm_impact_score >= 0 AND storm_impact_score <= 100),
  storm_connected boolean DEFAULT false,
  storm_event_id uuid REFERENCES public.contact_storm_impacts(id) ON DELETE SET NULL,
  
  -- Replacement Probability
  replacement_probability text CHECK (replacement_probability IN ('high', 'medium', 'low', 'uncertain')) DEFAULT 'uncertain',
  replacement_likelihood_score integer DEFAULT 0 CHECK (replacement_likelihood_score >= 0 AND replacement_likelihood_score <= 100),
  
  -- Recommended Actions
  recommended_action text,
  recommended_tasks jsonb DEFAULT '[]'::jsonb, -- ['emergency_call', 'schedule_asap', 'prepare_inspection']
  repair_cost_range jsonb DEFAULT '{"min": null, "max": null}'::jsonb,
  
  -- Metadata
  translation_confidence numeric(5,2) DEFAULT 0 CHECK (translation_confidence >= 0 AND translation_confidence <= 100),
  ai_model text DEFAULT 'gpt-4o-mini',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_terminology_translations_contact 
  ON public.terminology_translations(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_terminology_translations_workspace 
  ON public.terminology_translations(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_terminology_translations_severity 
  ON public.terminology_translations(severity_score DESC);
CREATE INDEX IF NOT EXISTS idx_terminology_translations_urgency 
  ON public.terminology_translations(urgency_level);
CREATE INDEX IF NOT EXISTS idx_terminology_translations_damage_type 
  ON public.terminology_translations(damage_type);
CREATE INDEX IF NOT EXISTS idx_terminology_translations_insurance 
  ON public.terminology_translations(insurance_category);
CREATE INDEX IF NOT EXISTS idx_terminology_translations_storm 
  ON public.terminology_translations(storm_connected, storm_event_id);

-- GIN index for keyword search
CREATE INDEX IF NOT EXISTS idx_terminology_translations_keywords 
  ON public.terminology_translations USING gin(detected_keywords);

-- ============================================================================
-- 2. TERMINOLOGY SCORES TABLE
-- ============================================================================
-- Stores calculated scores and metrics for terminology translations

CREATE TABLE IF NOT EXISTS public.terminology_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  translation_id uuid NOT NULL REFERENCES public.terminology_translations(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Score Breakdown
  severity_score integer NOT NULL DEFAULT 0 CHECK (severity_score >= 0 AND severity_score <= 100),
  urgency_score integer NOT NULL DEFAULT 0 CHECK (urgency_score >= 0 AND urgency_score <= 100),
  storm_score integer DEFAULT 0 CHECK (storm_score >= 0 AND storm_score <= 100),
  replacement_score integer DEFAULT 0 CHECK (replacement_score >= 0 AND replacement_score <= 100),
  insurance_score integer DEFAULT 0 CHECK (insurance_score >= 0 AND insurance_score <= 100),
  
  -- Score Components (for transparency)
  score_breakdown jsonb DEFAULT '{}'::jsonb, -- Detailed breakdown of how scores were calculated
  
  -- Timestamps
  calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_terminology_scores_translation 
  ON public.terminology_scores(translation_id);
CREATE INDEX IF NOT EXISTS idx_terminology_scores_contact 
  ON public.terminology_scores(contact_id);
CREATE INDEX IF NOT EXISTS idx_terminology_scores_severity 
  ON public.terminology_scores(severity_score DESC);

-- ============================================================================
-- 3. HOMEOWNER PHRASES TABLE
-- ============================================================================
-- Stores common homeowner phrases and their translations (for learning/improvement)

CREATE TABLE IF NOT EXISTS public.homeowner_phrases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Phrase Data
  homeowner_phrase text NOT NULL, -- e.g., "shingles fell off"
  roofing_term text NOT NULL, -- e.g., "wind uplift on ridge cap"
  category text NOT NULL CHECK (category IN (
    'structural', 'shingle', 'flashing', 'ventilation', 'interior_leak', 'general'
  )),
  
  -- Usage Tracking
  usage_count integer DEFAULT 1,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  
  -- Validation
  verified boolean DEFAULT false, -- Manually verified by contractor
  verified_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_homeowner_phrases_workspace 
  ON public.homeowner_phrases(workspace_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_phrases_category 
  ON public.homeowner_phrases(category);
CREATE INDEX IF NOT EXISTS idx_homeowner_phrases_usage 
  ON public.homeowner_phrases(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_homeowner_phrases_verified 
  ON public.homeowner_phrases(verified);

-- Unique constraint: one phrase per workspace
CREATE UNIQUE INDEX IF NOT EXISTS idx_homeowner_phrases_unique 
  ON public.homeowner_phrases(workspace_id, lower(homeowner_phrase));

-- ============================================================================
-- 4. RLS POLICIES
-- ============================================================================

ALTER TABLE public.terminology_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminology_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homeowner_phrases ENABLE ROW LEVEL SECURITY;

-- Terminology Translations Policies
CREATE POLICY "Users can view terminology translations in their workspace"
  ON public.terminology_translations FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE id = workspace_id 
      AND (owner_user_id = auth.uid() OR id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Service role can manage terminology translations"
  ON public.terminology_translations FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Terminology Scores Policies
CREATE POLICY "Users can view terminology scores in their workspace"
  ON public.terminology_scores FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE id = workspace_id 
      AND (owner_user_id = auth.uid() OR id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Service role can manage terminology scores"
  ON public.terminology_scores FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Homeowner Phrases Policies
CREATE POLICY "Users can view homeowner phrases in their workspace"
  ON public.homeowner_phrases FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE id = workspace_id 
      AND (owner_user_id = auth.uid() OR id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      ))
    )
  );

CREATE POLICY "Service role can manage homeowner phrases"
  ON public.homeowner_phrases FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- 5. FUNCTIONS
-- ============================================================================

-- Function to update last_seen_at and increment usage_count for homeowner phrases
CREATE OR REPLACE FUNCTION public.increment_homeowner_phrase_usage(
  p_workspace_id uuid,
  p_phrase text,
  p_roofing_term text,
  p_category text
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_phrase_id uuid;
BEGIN
  INSERT INTO public.homeowner_phrases (
    workspace_id,
    homeowner_phrase,
    roofing_term,
    category,
    usage_count,
    last_seen_at
  )
  VALUES (
    p_workspace_id,
    p_phrase,
    p_roofing_term,
    p_category,
    1,
    now()
  )
  ON CONFLICT (workspace_id, lower(homeowner_phrase))
  DO UPDATE SET
    usage_count = homeowner_phrases.usage_count + 1,
    last_seen_at = now(),
    roofing_term = EXCLUDED.roofing_term -- Update if better translation found
  RETURNING id INTO v_phrase_id;
  
  RETURN v_phrase_id;
END;
$$;

-- Function to calculate severity score from translation
CREATE OR REPLACE FUNCTION public.calculate_terminology_severity_score(
  p_translation_id uuid
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_translation public.terminology_translations%ROWTYPE;
  v_score integer := 0;
  v_breakdown jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v_translation
  FROM public.terminology_translations
  WHERE id = p_translation_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- Base score from urgency level
  CASE v_translation.urgency_level
    WHEN 'emergency' THEN v_score := v_score + 50;
    WHEN 'high' THEN v_score := v_score + 35;
    WHEN 'medium' THEN v_score := v_score + 20;
    WHEN 'low' THEN v_score := v_score + 10;
    ELSE v_score := v_score + 5;
  END CASE;
  
  v_breakdown := jsonb_set(v_breakdown, '{urgency}', to_jsonb(v_score));
  
  -- Add score based on damage type
  CASE v_translation.damage_type
    WHEN 'interior_leak' THEN v_score := v_score + 30;
    WHEN 'structural' THEN v_score := v_score + 25;
    WHEN 'shingle' THEN v_score := v_score + 15;
    WHEN 'flashing' THEN v_score := v_score + 10;
    WHEN 'ventilation' THEN v_score := v_score + 5;
    ELSE NULL;
  END CASE;
  
  v_breakdown := jsonb_set(v_breakdown, '{damage_type}', to_jsonb(v_score));
  
  -- Add score if storm connected
  IF v_translation.storm_connected THEN
    v_score := v_score + 15;
    v_breakdown := jsonb_set(v_breakdown, '{storm_bonus}', to_jsonb(15));
  END IF;
  
  -- Cap at 100
  IF v_score > 100 THEN
    v_score := 100;
  END IF;
  
  v_breakdown := jsonb_set(v_breakdown, '{final_score}', to_jsonb(v_score));
  
  -- Update translation with calculated score
  UPDATE public.terminology_translations
  SET severity_score = v_score,
      updated_at = now()
  WHERE id = p_translation_id;
  
  -- Store score breakdown
  INSERT INTO public.terminology_scores (
    translation_id,
    contact_id,
    workspace_id,
    severity_score,
    score_breakdown
  )
  VALUES (
    p_translation_id,
    v_translation.contact_id,
    v_translation.workspace_id,
    v_score,
    v_breakdown
  )
  ON CONFLICT DO NOTHING;
  
  RETURN v_score;
END;
$$;

-- Function to get latest translation for a contact
CREATE OR REPLACE FUNCTION public.get_latest_terminology_translation(
  p_contact_id uuid
)
RETURNS TABLE (
  id uuid,
  homeowner_message text,
  roofing_term text,
  damage_type text,
  urgency_level text,
  severity_score integer,
  ai_explanation text,
  detected_keywords jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.homeowner_message,
    t.roofing_term,
    t.damage_type,
    t.urgency_level,
    t.severity_score,
    t.ai_explanation,
    t.detected_keywords,
    t.created_at
  FROM public.terminology_translations t
  WHERE t.contact_id = p_contact_id
  ORDER BY t.created_at DESC
  LIMIT 1;
END;
$$;

-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_terminology_translations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_terminology_translations_updated_at
  BEFORE UPDATE ON public.terminology_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_terminology_translations_updated_at();

-- Trigger to auto-calculate severity score when translation is created
CREATE OR REPLACE FUNCTION public.auto_calculate_terminology_severity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Calculate severity score
  PERFORM public.calculate_terminology_severity_score(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_calculate_terminology_severity
  AFTER INSERT ON public.terminology_translations
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_calculate_terminology_severity();

-- ============================================================================
-- 7. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.terminology_translations IS 'AI translations from homeowner language to roofing terminology';
COMMENT ON TABLE public.terminology_scores IS 'Calculated scores and metrics for terminology translations';
COMMENT ON TABLE public.homeowner_phrases IS 'Common homeowner phrases and their translations (for learning)';
COMMENT ON COLUMN public.terminology_translations.ai_explanation IS 'AI-generated explanation of what the homeowner REALLY means';
COMMENT ON COLUMN public.terminology_translations.detected_keywords IS 'Array of industry keywords found in homeowner message';
COMMENT ON COLUMN public.terminology_translations.recommended_tasks IS 'Array of suggested tasks based on translation';





















































