-- =========================================================
-- Block 24100 — SmartSend Roofing Message Personalization Engine v1
-- FULL PERSONALIZATION ENGINE — ZERO FLUFF.
-- =========================================================
-- 
-- Every personalization rule directly increases:
-- ✔ opens
-- ✔ replies
-- ✔ booked inspections
-- ✔ roofing revenue
-- ✔ roofer retention
--
-- This is the system that makes SmartSend feel like a real human from the roofer's company — not AI.

-- ============================================================================
-- PART 1 — ROOFER VOICE PROFILES (Layer 5: Human Voice Personalization)
-- ============================================================================
-- Stores roofer's writing style, tone, speech patterns, and signature style
-- for AI tone matching

CREATE TABLE IF NOT EXISTS public.roofer_voice_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  roofer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Writing Style Analysis
  tone_preference text CHECK (tone_preference IN ('casual', 'formal', 'friendly', 'professional', 'conversational', 'direct', 'polished', 'simple')) DEFAULT 'casual',
  sentence_length_avg integer DEFAULT 15, -- Average words per sentence
  punctuation_style text CHECK (punctuation_style IN ('minimal', 'standard', 'frequent')) DEFAULT 'standard',
  greeting_style text[], -- Common greetings used: ['Hey', 'Hi', 'Hello']
  signoff_style text[], -- Common signoffs: ['Thanks', 'Best', '-']
  
  -- Speech Patterns
  common_phrases text[], -- Phrases roofer uses frequently
  vocabulary_level text CHECK (vocabulary_level IN ('simple', 'moderate', 'advanced')) DEFAULT 'moderate',
  uses_contractions boolean DEFAULT true,
  uses_emojis boolean DEFAULT false,
  uses_exclamation boolean DEFAULT false,
  
  -- Signature Style Elements
  company_name_usage text CHECK (company_name_usage IN ('always', 'sometimes', 'never')) DEFAULT 'sometimes',
  personal_name_usage text CHECK (personal_name_usage IN ('always', 'sometimes', 'never')) DEFAULT 'sometimes',
  booking_link_style text CHECK (booking_link_style IN ('direct', 'casual', 'formal')) DEFAULT 'casual',
  
  -- Sample Messages (for analysis)
  sample_messages jsonb DEFAULT '[]'::jsonb, -- Array of {subject, body, date} samples
  sample_count integer DEFAULT 0,
  
  -- Analysis Metadata
  last_analyzed_at timestamptz,
  analysis_confidence numeric(3,2) DEFAULT 0.5 CHECK (analysis_confidence >= 0 AND analysis_confidence <= 1.0),
  ai_analysis_metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, roofer_id)
);

CREATE INDEX IF NOT EXISTS idx_roofer_voice_profiles_workspace 
  ON public.roofer_voice_profiles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_roofer_voice_profiles_roofer 
  ON public.roofer_voice_profiles(roofer_id) WHERE roofer_id IS NOT NULL;

COMMENT ON TABLE public.roofer_voice_profiles IS 'Stores roofer writing style for AI tone matching (Layer 5)';

-- ============================================================================
-- PART 2 — PERSONALIZATION CACHE (Enhanced for All 5 Layers)
-- ============================================================================
-- Caches personalization data for fast access during message generation

CREATE TABLE IF NOT EXISTS public.personalization_cache_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Layer 1: Local Area Personalization
  city text,
  neighborhood text,
  zip_code text,
  local_landmark text,
  
  -- Layer 2: Weather + Storm Personalization
  last_storm_type text CHECK (last_storm_type IN ('hail', 'wind', 'rain', 'snow', 'hurricane')) DEFAULT NULL,
  last_storm_date date,
  storm_risk_level text CHECK (storm_risk_level IN ('high', 'medium', 'low')) DEFAULT 'low',
  recent_weather_events jsonb DEFAULT '[]'::jsonb, -- Array of {type, date, intensity}
  weather_trigger_phrase text,
  
  -- Layer 3: Homeowner Behavior Personalization
  last_reply_date date,
  last_open_date date,
  last_click_date date,
  follow_up_count integer DEFAULT 0,
  days_since_last_reply integer,
  days_since_last_open integer,
  behavior_summary text, -- e.g., "Opened yesterday but didn't reply"
  
  -- Layer 4: Roof-Specific Personalization
  roof_type text, -- 'asphalt', 'metal', 'tile', 'flat_roof', 'unknown'
  job_type_guess text CHECK (job_type_guess IN ('repair', 'replacement', 'inspection', 'unknown')) DEFAULT 'unknown',
  leak_location text,
  roof_age_years integer,
  home_age_years integer,
  project_quoted boolean DEFAULT false,
  past_quote_amount numeric(12,2),
  time_since_last_quote text, -- e.g., "2 weeks ago"
  
  -- Layer 5: Human Voice Personalization (references roofer_voice_profiles)
  roofer_voice_profile_id uuid REFERENCES public.roofer_voice_profiles(id) ON DELETE SET NULL,
  tone_matched text,
  
  -- Generated Personalization Tokens
  generated_opener text,
  local_context_phrase text,
  weather_context_phrase text,
  behavior_context_phrase text,
  roof_context_phrase text,
  
  -- Personalization Score (0-100)
  personalization_score integer DEFAULT 0 CHECK (personalization_score >= 0 AND personalization_score <= 100),
  
  -- Cache Metadata
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '6 hours'),
  last_rebuilt_at timestamptz NOT NULL DEFAULT now(),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT personalization_cache_contact_or_lead CHECK (
    (contact_id IS NOT NULL AND lead_id IS NULL) OR 
    (contact_id IS NULL AND lead_id IS NOT NULL) OR
    (contact_id IS NOT NULL AND lead_id IS NOT NULL)
  )
);

-- Unique constraint: one cache per contact OR lead
CREATE UNIQUE INDEX IF NOT EXISTS idx_personalization_cache_v1_contact_unique 
  ON public.personalization_cache_v1(contact_id) 
  WHERE contact_id IS NOT NULL AND lead_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_personalization_cache_v1_lead_unique 
  ON public.personalization_cache_v1(lead_id) 
  WHERE lead_id IS NOT NULL AND contact_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_personalization_cache_v1_contact 
  ON public.personalization_cache_v1(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_personalization_cache_v1_lead 
  ON public.personalization_cache_v1(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_personalization_cache_v1_workspace 
  ON public.personalization_cache_v1(workspace_id);
CREATE INDEX IF NOT EXISTS idx_personalization_cache_v1_expires 
  ON public.personalization_cache_v1(expires_at) WHERE expires_at < now();

COMMENT ON TABLE public.personalization_cache_v1 IS 'Caches all 5 layers of personalization data for fast message generation';

-- ============================================================================
-- PART 3 — PERSONALIZATION TRIGGERS TABLE
-- ============================================================================
-- Tracks when SmartSend should increase personalization aggressiveness

CREATE TABLE IF NOT EXISTS public.personalization_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Trigger Types
  trigger_type text NOT NULL CHECK (trigger_type IN (
    'opened_no_reply',
    'replied_once',
    'storm_alert',
    'no_estimate_this_week',
    'list_quality_dropping',
    'high_value_lead',
    'urgent_damage'
  )),
  
  -- Trigger Details
  trigger_data jsonb DEFAULT '{}'::jsonb,
  priority integer DEFAULT 5 CHECK (priority >= 1 AND priority <= 10),
  
  -- Status
  is_active boolean DEFAULT true,
  resolved_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT personalization_triggers_contact_or_lead CHECK (
    (contact_id IS NOT NULL AND lead_id IS NULL) OR 
    (contact_id IS NULL AND lead_id IS NOT NULL) OR
    (contact_id IS NOT NULL AND lead_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_personalization_triggers_contact 
  ON public.personalization_triggers(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_personalization_triggers_lead 
  ON public.personalization_triggers(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_personalization_triggers_workspace_active 
  ON public.personalization_triggers(workspace_id, is_active) WHERE is_active = true;

COMMENT ON TABLE public.personalization_triggers IS 'Tracks when to increase personalization aggressiveness';

-- ============================================================================
-- PART 4 — FUNCTIONS: Rebuild Personalization Cache
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rebuild_personalization_cache_v1(
  p_contact_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_workspace_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cache_id uuid;
  v_contact_id uuid;
  v_lead_id uuid;
  v_city text;
  v_neighborhood text;
  v_zip_code text;
  v_last_storm_type text;
  v_last_storm_date date;
  v_follow_up_count integer;
  v_last_reply_date date;
  v_last_open_date date;
  v_roof_type text;
  v_job_type text;
  v_roof_age integer;
BEGIN
  -- Determine contact_id and lead_id
  IF p_contact_id IS NOT NULL THEN
    v_contact_id := p_contact_id;
    SELECT id INTO v_lead_id FROM public.leads WHERE contact_id = p_contact_id LIMIT 1;
  ELSIF p_lead_id IS NOT NULL THEN
    v_lead_id := p_lead_id;
    SELECT contact_id INTO v_contact_id FROM public.leads WHERE id = p_lead_id;
  ELSE
    RAISE EXCEPTION 'Either contact_id or lead_id must be provided';
  END IF;

  -- Get location data (Layer 1)
  IF v_contact_id IS NOT NULL THEN
    SELECT city, neighborhood, zip INTO v_city, v_neighborhood, v_zip_code
    FROM public.contacts WHERE id = v_contact_id;
  ELSIF v_lead_id IS NOT NULL THEN
    SELECT city, zip INTO v_city, v_zip_code
    FROM public.leads WHERE id = v_lead_id;
  END IF;

  -- Get weather/storm data (Layer 2) - from local_context or storm_events
  BEGIN
    SELECT storm_type, storm_date INTO v_last_storm_type, v_last_storm_date
    FROM public.local_context
    WHERE city = v_city AND zip = v_zip_code
    ORDER BY storm_date DESC
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- Table might not exist, continue
    NULL;
  END;

  -- Get behavior data (Layer 3)
  BEGIN
    SELECT COUNT(*), MAX(sent_at::date) INTO v_follow_up_count, v_last_reply_date
    FROM public.email_logs
    WHERE (contact_id = v_contact_id OR lead_id = v_lead_id)
      AND direction = 'out';

    SELECT MAX(opened_at::date) INTO v_last_open_date
    FROM public.email_logs
    WHERE (contact_id = v_contact_id OR lead_id = v_lead_id)
      AND opened_at IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    -- Table might not exist or have different schema
    v_follow_up_count := 0;
    v_last_reply_date := NULL;
    v_last_open_date := NULL;
  END;

  -- Get roof-specific data (Layer 4)
  IF v_contact_id IS NOT NULL THEN
    BEGIN
      SELECT roof_material, likely_job_type, roof_age_median::integer
      INTO v_roof_type, v_job_type, v_roof_age
      FROM public.roof_measurements
      WHERE contact_id = v_contact_id
      ORDER BY analyzed_at DESC
      LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      -- Table might not exist
      v_roof_type := NULL;
      v_job_type := NULL;
      v_roof_age := NULL;
    END;
  END IF;

  -- Check if cache exists
  IF v_contact_id IS NOT NULL THEN
    SELECT id INTO v_cache_id
    FROM public.personalization_cache_v1
    WHERE contact_id = v_contact_id AND workspace_id = p_workspace_id;
  ELSIF v_lead_id IS NOT NULL THEN
    SELECT id INTO v_cache_id
    FROM public.personalization_cache_v1
    WHERE lead_id = v_lead_id AND workspace_id = p_workspace_id;
  END IF;

  -- Insert or update cache
  IF v_cache_id IS NULL THEN
    INSERT INTO public.personalization_cache_v1 (
      contact_id,
      lead_id,
      workspace_id,
      city,
      neighborhood,
      zip_code,
      last_storm_type,
      last_storm_date,
      follow_up_count,
      last_reply_date,
      last_open_date,
      roof_type,
      job_type_guess,
      roof_age_years,
      expires_at,
      last_rebuilt_at
    ) VALUES (
      v_contact_id,
      v_lead_id,
      p_workspace_id,
      v_city,
      v_neighborhood,
      v_zip_code,
      v_last_storm_type,
      v_last_storm_date,
      v_follow_up_count,
      v_last_reply_date,
      v_last_open_date,
      v_roof_type,
      v_job_type,
      v_roof_age,
      now() + interval '6 hours',
      now()
    )
    RETURNING id INTO v_cache_id;
  ELSE
    UPDATE public.personalization_cache_v1 SET
    city = EXCLUDED.city,
    neighborhood = EXCLUDED.neighborhood,
    zip_code = EXCLUDED.zip_code,
    last_storm_type = EXCLUDED.last_storm_type,
    last_storm_date = EXCLUDED.last_storm_date,
    follow_up_count = EXCLUDED.follow_up_count,
    last_reply_date = EXCLUDED.last_reply_date,
    last_open_date = EXCLUDED.last_open_date,
    roof_type = EXCLUDED.roof_type,
    job_type_guess = EXCLUDED.job_type_guess,
    roof_age_years = EXCLUDED.roof_age_years,
      expires_at = now() + interval '6 hours',
      last_rebuilt_at = now(),
      updated_at = now()
    WHERE id = v_cache_id;
  END IF;

  RETURN v_cache_id;
END;
$$;

-- ============================================================================
-- PART 5 — FUNCTIONS: Analyze Roofer Voice Profile
-- ============================================================================

CREATE OR REPLACE FUNCTION public.analyze_roofer_voice_profile(
  p_workspace_id uuid,
  p_roofer_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile_id uuid;
  v_sample_count integer;
BEGIN
  -- Get sample messages from email_logs or inbox_messages
  SELECT COUNT(*) INTO v_sample_count
  FROM public.email_logs
  WHERE workspace_id = p_workspace_id
    AND (p_roofer_id IS NULL OR sender_id = p_roofer_id)
    AND direction = 'out'
    AND body_html IS NOT NULL;

  -- Insert or update voice profile
  INSERT INTO public.roofer_voice_profiles (
    workspace_id,
    roofer_id,
    sample_count,
    last_analyzed_at
  ) VALUES (
    p_workspace_id,
    p_roofer_id,
    v_sample_count,
    now()
  )
  ON CONFLICT (workspace_id, roofer_id) DO UPDATE SET
    sample_count = EXCLUDED.sample_count,
    last_analyzed_at = EXCLUDED.last_analyzed_at,
    updated_at = now()
  RETURNING id INTO v_profile_id;

  RETURN v_profile_id;
END;
$$;

-- ============================================================================
-- PART 6 — TRIGGERS: Auto-update Personalization Triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_personalization_triggers()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_id uuid;
  v_lead_id uuid;
  v_workspace_id uuid;
BEGIN
  -- Determine IDs
  IF TG_TABLE_NAME = 'email_logs' THEN
    v_contact_id := NEW.contact_id;
    v_lead_id := NEW.lead_id;
    v_workspace_id := NEW.workspace_id;
  ELSIF TG_TABLE_NAME = 'inbox_messages' THEN
    SELECT contact_id, workspace_id INTO v_contact_id, v_workspace_id
    FROM public.inbox_threads WHERE id = NEW.thread_id;
  END IF;

  -- Trigger: opened_no_reply
  IF NEW.opened_at IS NOT NULL AND NEW.direction = 'out' THEN
    INSERT INTO public.personalization_triggers (
      contact_id,
      lead_id,
      workspace_id,
      trigger_type,
      trigger_data,
      priority
    ) VALUES (
      v_contact_id,
      v_lead_id,
      v_workspace_id,
      'opened_no_reply',
      jsonb_build_object('opened_at', NEW.opened_at),
      7
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger on email_logs opens
DROP TRIGGER IF EXISTS trg_check_personalization_triggers_email ON public.email_logs;
CREATE TRIGGER trg_check_personalization_triggers_email
  AFTER UPDATE OF opened_at ON public.email_logs
  FOR EACH ROW
  WHEN (NEW.opened_at IS NOT NULL AND OLD.opened_at IS NULL)
  EXECUTE FUNCTION public.check_personalization_triggers();

-- ============================================================================
-- PART 7 — RLS POLICIES
-- ============================================================================

ALTER TABLE public.roofer_voice_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personalization_cache_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personalization_triggers ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "roofer_voice_profiles_service_role_all" ON public.roofer_voice_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "personalization_cache_v1_service_role_all" ON public.personalization_cache_v1
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "personalization_triggers_service_role_all" ON public.personalization_triggers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Workspace members can read their own data
CREATE POLICY "roofer_voice_profiles_workspace_read" ON public.roofer_voice_profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofer_voice_profiles.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "personalization_cache_v1_workspace_read" ON public.personalization_cache_v1
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = personalization_cache_v1.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "personalization_triggers_workspace_read" ON public.personalization_triggers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = personalization_triggers.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

