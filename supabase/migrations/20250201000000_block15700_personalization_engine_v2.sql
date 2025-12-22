-- =========================================================
-- Block 15700 — SmartSend Personalization Engine v2
-- (The Deep Roofing-Specific Personalization Layer: Local Weather, Neighborhood References, Past Quotes, Storm History, & Smart Insert Tokens)
-- =========================================================

-- ============================================================================
-- 1. ENHANCE personalization_cache TABLE (v2)
-- ============================================================================

-- Add new columns to existing personalization_cache table
ALTER TABLE IF EXISTS public.personalization_cache
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS last_storm_type text CHECK (last_storm_type IN ('hail', 'wind', 'heavy rain', 'snow load', 'hurricane', NULL)),
  ADD COLUMN IF NOT EXISTS last_storm_date date,
  ADD COLUMN IF NOT EXISTS storm_risk_level text CHECK (storm_risk_level IN ('low', 'medium', 'high', NULL)),
  ADD COLUMN IF NOT EXISTS claim_likelihood text CHECK (claim_likelihood IN ('low', 'medium', 'high', NULL)),
  ADD COLUMN IF NOT EXISTS home_value_class text CHECK (home_value_class IN ('premium', 'mid-range', 'economy', NULL)),
  ADD COLUMN IF NOT EXISTS job_type_guess text CHECK (job_type_guess IN ('repair', 'replacement', 'storm damage', 'insurance inspection', NULL)),
  ADD COLUMN IF NOT EXISTS past_quote_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS time_since_last_quote text,
  ADD COLUMN IF NOT EXISTS local_landmark text,
  ADD COLUMN IF NOT EXISTS roof_age_guess text,
  ADD COLUMN IF NOT EXISTS inspection_eta text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS roofer_name text,
  ADD COLUMN IF NOT EXISTS booking_link text,
  ADD COLUMN IF NOT EXISTS generated_opener text,
  ADD COLUMN IF NOT EXISTS personalization_score integer CHECK (personalization_score >= 0 AND personalization_score <= 100),
  ADD COLUMN IF NOT EXISTS tone text CHECK (tone IN ('urgent', 'helpful', 'advisory', 'friendly', 'conversational', 'confident', 'polished', 'simple', NULL)),
  ADD COLUMN IF NOT EXISTS token_map jsonb DEFAULT '{}'::jsonb; -- Store all token values for quick access

-- Update unique constraint to be contact_id only (one cache per contact, not per step)
-- First drop old constraint if it exists
ALTER TABLE IF EXISTS public.personalization_cache
  DROP CONSTRAINT IF EXISTS personalization_cache_contact_id_step_id_key;

-- Create new unique constraint on contact_id only
CREATE UNIQUE INDEX IF NOT EXISTS idx_personalization_cache_contact_unique
  ON public.personalization_cache(contact_id)
  WHERE contact_id IS NOT NULL;

-- Add indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_personalization_cache_neighborhood 
  ON public.personalization_cache(neighborhood) WHERE neighborhood IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_personalization_cache_storm_risk 
  ON public.personalization_cache(storm_risk_level) WHERE storm_risk_level IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_personalization_cache_claim_likelihood 
  ON public.personalization_cache(claim_likelihood) WHERE claim_likelihood IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_personalization_cache_score 
  ON public.personalization_cache(personalization_score) WHERE personalization_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_personalization_cache_updated_at 
  ON public.personalization_cache(updated_at DESC);

-- ============================================================================
-- 2. FUNCTION: Calculate personalization score (0-100)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_personalization_score(
  p_token_map jsonb,
  p_neighborhood text,
  p_storm_data jsonb DEFAULT NULL,
  p_has_opener boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_score integer := 0;
  v_token_count integer := 0;
  v_has_storm boolean := false;
  v_has_local_ref boolean := false;
BEGIN
  -- Count tokens used (basic tokens = 5 points each, advanced tokens = 10 points each)
  IF p_token_map ? 'first_name' AND (p_token_map->>'first_name') IS NOT NULL AND (p_token_map->>'first_name') != '' THEN
    v_token_count := v_token_count + 1;
    v_score := v_score + 5;
  END IF;
  
  IF p_token_map ? 'city' AND (p_token_map->>'city') IS NOT NULL AND (p_token_map->>'city') != '' THEN
    v_token_count := v_token_count + 1;
    v_score := v_score + 5;
  END IF;
  
  IF p_token_map ? 'zip' AND (p_token_map->>'zip') IS NOT NULL AND (p_token_map->>'zip') != '' THEN
    v_token_count := v_token_count + 1;
    v_score := v_score + 5;
  END IF;
  
  -- Advanced tokens (10 points each)
  IF p_token_map ? 'neighborhood' AND (p_token_map->>'neighborhood') IS NOT NULL AND (p_token_map->>'neighborhood') != '' THEN
    v_token_count := v_token_count + 1;
    v_score := v_score + 10;
    v_has_local_ref := true;
  END IF;
  
  IF p_token_map ? 'last_storm_type' AND (p_token_map->>'last_storm_type') IS NOT NULL AND (p_token_map->>'last_storm_type') != '' THEN
    v_token_count := v_token_count + 1;
    v_score := v_score + 10;
    v_has_storm := true;
  END IF;
  
  IF p_token_map ? 'last_storm_date' AND (p_token_map->>'last_storm_date') IS NOT NULL AND (p_token_map->>'last_storm_date') != '' THEN
    v_token_count := v_token_count + 1;
    v_score := v_score + 10;
  END IF;
  
  IF p_token_map ? 'local_landmark' AND (p_token_map->>'local_landmark') IS NOT NULL AND (p_token_map->>'local_landmark') != '' THEN
    v_token_count := v_token_count + 1;
    v_score := v_score + 15;
    v_has_local_ref := true;
  END IF;
  
  IF p_token_map ? 'past_quote_amount' AND (p_token_map->>'past_quote_amount') IS NOT NULL AND (p_token_map->>'past_quote_amount') != '' THEN
    v_token_count := v_token_count + 1;
    v_score := v_score + 10;
  END IF;
  
  IF p_token_map ? 'roof_age_guess' AND (p_token_map->>'roof_age_guess') IS NOT NULL AND (p_token_map->>'roof_age_guess') != '' THEN
    v_token_count := v_token_count + 1;
    v_score := v_score + 10;
  END IF;
  
  -- Quality bonuses
  IF v_has_local_ref THEN
    v_score := v_score + 10; -- Local reference bonus
  END IF;
  
  IF v_has_storm THEN
    v_score := v_score + 10; -- Storm context bonus
  END IF;
  
  IF p_has_opener THEN
    v_score := v_score + 15; -- Personalized opener bonus
  END IF;
  
  -- Cap at 100
  RETURN LEAST(v_score, 100);
END;
$$;

COMMENT ON FUNCTION public.calculate_personalization_score IS 'Calculates personalization score (0-100) based on tokens used and quality of context';

-- ============================================================================
-- 3. FUNCTION: Humanize date (e.g., "2 weeks ago", "last month")
-- ============================================================================

CREATE OR REPLACE FUNCTION public.humanize_date(p_date date)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_days integer;
BEGIN
  IF p_date IS NULL THEN
    RETURN NULL;
  END IF;
  
  v_days := EXTRACT(EPOCH FROM (CURRENT_DATE - p_date)) / 86400;
  
  IF v_days < 0 THEN
    RETURN 'in the future';
  ELSIF v_days = 0 THEN
    RETURN 'today';
  ELSIF v_days = 1 THEN
    RETURN 'yesterday';
  ELSIF v_days < 7 THEN
    RETURN v_days::text || ' days ago';
  ELSIF v_days < 14 THEN
    RETURN 'last week';
  ELSIF v_days < 21 THEN
    RETURN '2 weeks ago';
  ELSIF v_days < 30 THEN
    RETURN '3 weeks ago';
  ELSIF v_days < 60 THEN
    RETURN 'last month';
  ELSIF v_days < 90 THEN
    RETURN '2 months ago';
  ELSIF v_days < 180 THEN
    RETURN '3 months ago';
  ELSIF v_days < 365 THEN
    RETURN EXTRACT(MONTH FROM (CURRENT_DATE - p_date))::text || ' months ago';
  ELSE
    RETURN EXTRACT(YEAR FROM (CURRENT_DATE - p_date))::text || ' year' || 
           CASE WHEN EXTRACT(YEAR FROM (CURRENT_DATE - p_date)) > 1 THEN 's' ELSE '' END || ' ago';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.humanize_date IS 'Converts a date to human-readable format (e.g., "2 weeks ago", "last month")';

-- ============================================================================
-- 4. FUNCTION: Format storm date humanly
-- ============================================================================

CREATE OR REPLACE FUNCTION public.format_storm_date(p_storm_date date)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_days integer;
  v_day_name text;
BEGIN
  IF p_storm_date IS NULL THEN
    RETURN NULL;
  END IF;
  
  v_days := EXTRACT(EPOCH FROM (CURRENT_DATE - p_storm_date)) / 86400;
  
  -- If within last 7 days, use day name
  IF v_days >= 0 AND v_days < 7 THEN
    v_day_name := TO_CHAR(p_storm_date, 'Day');
    v_day_name := TRIM(v_day_name);
    
    IF v_days = 0 THEN
      RETURN 'today';
    ELSIF v_days = 1 THEN
      RETURN 'yesterday';
    ELSIF v_days = 2 THEN
      RETURN '2 days ago';
    ELSIF v_days < 7 THEN
      RETURN v_days::text || ' days ago';
    END IF;
  END IF;
  
  -- Otherwise use humanize_date
  RETURN public.humanize_date(p_storm_date);
END;
$$;

COMMENT ON FUNCTION public.format_storm_date IS 'Formats storm date in human-readable format with special handling for recent dates';

-- ============================================================================
-- 5. FUNCTION: Rebuild personalization cache for a contact
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rebuild_personalization_cache(
  p_contact_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cache_id uuid;
  v_contact record;
  v_enrichment record;
  v_local_context record;
  v_account_profile record;
  v_storm_data jsonb;
  v_token_map jsonb := '{}'::jsonb;
  v_opener text;
  v_tone text;
  v_score integer;
BEGIN
  -- Get contact data
  SELECT c.* INTO v_contact
  FROM public.contacts c
  WHERE c.id = p_contact_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contact not found: %', p_contact_id;
  END IF;
  
  -- Get enrichment data
  SELECT ce.inferred_neighborhood, ce.storm_risk_level, ce.property_type
  INTO v_enrichment
  FROM public.contact_enrichment ce
  WHERE ce.contact_id = p_contact_id;
  
  -- Get local context (weather/storm data)
  SELECT * INTO v_local_context
  FROM public.local_context
  WHERE city = LOWER(COALESCE(v_contact.city, ''))
    AND (state IS NULL OR state = UPPER(COALESCE(v_contact.state, '')))
    AND (zip IS NULL OR zip = COALESCE(v_contact.zip, ''))
  LIMIT 1;
  
  -- Get account profile (workspace-level settings)
  SELECT wp.* INTO v_account_profile
  FROM public.workspace_profile wp
  INNER JOIN public.contacts c ON c.workspace_id = wp.workspace_id
  WHERE c.id = p_contact_id
  LIMIT 1;
  
  -- Build token map
  v_token_map := jsonb_build_object(
    'first_name', COALESCE(v_contact.first_name, 'there'),
    'city', COALESCE(v_contact.city, ''),
    'zip', COALESCE(v_contact.zip, ''),
    'neighborhood', COALESCE(v_enrichment.inferred_neighborhood, v_local_context.neighborhood, ''),
    'last_storm_type', COALESCE(v_local_context.storm_type, ''),
    'last_storm_date', public.format_storm_date(v_local_context.storm_date),
    'storm_risk_level', COALESCE(v_enrichment.storm_risk_level, 
      CASE 
        WHEN v_local_context.storm_flag THEN 'high'
        ELSE 'low'
      END, 'low'),
    'claim_likelihood', COALESCE(v_enrichment.storm_risk_level, 'low'),
    'home_value_class', 'mid-range', -- TODO: Calculate from property data
    'job_type_guess', CASE 
      WHEN v_local_context.storm_flag THEN 'storm damage'
      WHEN v_enrichment.storm_risk_level = 'high' THEN 'insurance inspection'
      ELSE 'replacement'
    END,
    'past_quote_amount', COALESCE(v_contact.past_quote_amount::text, ''),
    'time_since_last_quote', NULL, -- TODO: Calculate from quote history
    'local_landmark', NULL, -- TODO: Generate from neighborhood data
    'roof_age_guess', NULL, -- TODO: Calculate from property age
    'inspection_eta', 'later this week', -- TODO: Calculate from scheduler
    'company_name', COALESCE(v_account_profile.company_name, ''),
    'roofer_name', COALESCE(v_account_profile.owner_name, ''),
    'booking_link', NULL -- TODO: Generate booking link
  );
  
  -- Generate opener (simplified for now, will be enhanced in engine)
  v_opener := COALESCE(v_contact.first_name, 'there') || ', ';
  
  IF v_local_context.storm_flag AND v_local_context.storm_type IS NOT NULL THEN
    v_opener := v_opener || 'saw your neighborhood got hit with ' || v_local_context.storm_type || 
                ' ' || COALESCE(public.format_storm_date(v_local_context.storm_date), 'recently') || 
                ' — want me to take a quick look?';
  ELSIF v_contact.past_quote_amount IS NOT NULL THEN
    v_opener := v_opener || 'we gave you a quote before — want me to recheck the roof or pricing?';
  ELSIF v_enrichment.inferred_neighborhood IS NOT NULL THEN
    v_opener := v_opener || 'I''ve been working with a lot of homeowners around ' || v_enrichment.inferred_neighborhood || ' lately.';
  ELSE
    v_opener := v_opener || 'quick question about your roof — mind if I take a look?';
  END IF;
  
  -- Determine tone
  v_tone := CASE
    WHEN v_local_context.storm_flag THEN 'urgent'
    WHEN v_contact.past_quote_amount IS NOT NULL THEN 'helpful'
    WHEN v_enrichment.storm_risk_level = 'high' THEN 'advisory'
    WHEN v_enrichment.inferred_neighborhood IS NOT NULL THEN 'friendly'
    ELSE 'conversational'
  END;
  
  -- Calculate score
  v_score := public.calculate_personalization_score(
    v_token_map,
    COALESCE(v_enrichment.inferred_neighborhood, ''),
    jsonb_build_object('storm_flag', v_local_context.storm_flag, 'storm_type', v_local_context.storm_type),
    v_opener IS NOT NULL AND v_opener != ''
  );
  
  -- Upsert cache
  INSERT INTO public.personalization_cache (
    contact_id,
    neighborhood,
    last_storm_type,
    last_storm_date,
    storm_risk_level,
    claim_likelihood,
    home_value_class,
    job_type_guess,
    past_quote_amount,
    time_since_last_quote,
    local_landmark,
    roof_age_guess,
    inspection_eta,
    company_name,
    roofer_name,
    booking_link,
    generated_opener,
    personalization_score,
    tone,
    token_map
  )
  VALUES (
    p_contact_id,
    COALESCE(v_enrichment.inferred_neighborhood, v_local_context.neighborhood),
    v_local_context.storm_type,
    v_local_context.storm_date,
    COALESCE(v_enrichment.storm_risk_level, CASE WHEN v_local_context.storm_flag THEN 'high' ELSE 'low' END),
    COALESCE(v_enrichment.storm_risk_level, 'low'),
    'mid-range',
    CASE 
      WHEN v_local_context.storm_flag THEN 'storm damage'
      WHEN v_enrichment.storm_risk_level = 'high' THEN 'insurance inspection'
      ELSE 'replacement'
    END,
    v_contact.past_quote_amount,
    NULL,
    NULL,
    NULL,
    'later this week',
    COALESCE(v_account_profile.company_name, ''),
    COALESCE(v_account_profile.owner_name, ''),
    NULL,
    v_opener,
    v_score,
    v_tone,
    v_token_map
  )
  ON CONFLICT (contact_id) 
  DO UPDATE SET
    neighborhood = EXCLUDED.neighborhood,
    last_storm_type = EXCLUDED.last_storm_type,
    last_storm_date = EXCLUDED.last_storm_date,
    storm_risk_level = EXCLUDED.storm_risk_level,
    claim_likelihood = EXCLUDED.claim_likelihood,
    home_value_class = EXCLUDED.home_value_class,
    job_type_guess = EXCLUDED.job_type_guess,
    past_quote_amount = EXCLUDED.past_quote_amount,
    time_since_last_quote = EXCLUDED.time_since_last_quote,
    local_landmark = EXCLUDED.local_landmark,
    roof_age_guess = EXCLUDED.roof_age_guess,
    inspection_eta = EXCLUDED.inspection_eta,
    company_name = EXCLUDED.company_name,
    roofer_name = EXCLUDED.roofer_name,
    booking_link = EXCLUDED.booking_link,
    generated_opener = EXCLUDED.generated_opener,
    personalization_score = EXCLUDED.personalization_score,
    tone = EXCLUDED.tone,
    token_map = EXCLUDED.token_map,
    updated_at = now()
  RETURNING id INTO v_cache_id;
  
  RETURN v_cache_id;
END;
$$;

COMMENT ON FUNCTION public.rebuild_personalization_cache IS 'Rebuilds personalization cache for a contact with all v2 tokens and context';

-- ============================================================================
-- 6. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.calculate_personalization_score(jsonb, text, jsonb, boolean) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.humanize_date(date) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.format_storm_date(date) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_personalization_cache(uuid) TO service_role, authenticated;

