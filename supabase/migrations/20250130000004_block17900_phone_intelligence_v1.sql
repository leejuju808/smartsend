-- =========================================================
-- Block 17900 — SmartSend Phone Number Intelligence v1
-- (Phone Validation, Carrier Lookup, Line-Type Detection, SMS Readiness, Quality Scoring)
-- =========================================================

-- 1. Phone Line Types Enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'phone_line_type') THEN
    CREATE TYPE phone_line_type AS ENUM (
      'mobile',
      'landline',
      'voip',
      'business',
      'google_voice',
      'burner',
      'temporary',
      'unknown'
    );
  END IF;
END$$;

-- 2. SMS Readiness Status Enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sms_readiness_status') THEN
    CREATE TYPE sms_readiness_status AS ENUM (
      'sms_ready',
      'landline_no_sms',
      'voip_unreliable',
      'carrier_blocks_unknown',
      'unknown'
    );
  END IF;
END$$;

-- 3. Phone Intelligence Table
-- Stores comprehensive phone number intelligence data
CREATE TABLE IF NOT EXISTS public.phone_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL, -- Normalized E.164 format
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  
  -- Validation
  is_valid boolean DEFAULT false,
  is_active boolean DEFAULT NULL,
  is_reachable boolean DEFAULT NULL,
  is_disconnected boolean DEFAULT false,
  is_temporary boolean DEFAULT false,
  
  -- Line Type Detection
  line_type phone_line_type DEFAULT 'unknown',
  line_type_confidence numeric(3,2) DEFAULT 0.0, -- 0.00 to 1.00
  
  -- Carrier Information
  carrier_name text,
  carrier_type text, -- 'wireless', 'landline', 'voip'
  carrier_country text DEFAULT 'US',
  
  -- SMS Readiness
  sms_readiness sms_readiness_status DEFAULT 'unknown',
  sms_capable boolean DEFAULT false,
  
  -- Homeowner Identity Signals
  homeowner_likelihood text DEFAULT 'unknown', -- 'high', 'medium', 'low', 'unlikely', 'unknown'
  homeowner_signals jsonb DEFAULT '{}'::jsonb, -- Store signals like "Frontier landline - possible older homeowner"
  is_business_line boolean DEFAULT false,
  is_spam_risk boolean DEFAULT false,
  is_wrong_number_risk boolean DEFAULT false,
  
  -- Quality Scoring
  quality_score integer DEFAULT 0, -- 0-100
  spam_risk_score integer DEFAULT 0, -- 0-100
  
  -- Metadata
  validation_source text, -- 'twilio', 'numverify', 'manual', etc.
  last_validated_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Unique constraint: one intelligence record per phone per org
  UNIQUE(phone_number, org_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_phone_intelligence_phone ON public.phone_intelligence(phone_number);
CREATE INDEX IF NOT EXISTS idx_phone_intelligence_org ON public.phone_intelligence(org_id);
CREATE INDEX IF NOT EXISTS idx_phone_intelligence_contact ON public.phone_intelligence(contact_id);
CREATE INDEX IF NOT EXISTS idx_phone_intelligence_line_type ON public.phone_intelligence(line_type);
CREATE INDEX IF NOT EXISTS idx_phone_intelligence_sms_readiness ON public.phone_intelligence(sms_readiness);
CREATE INDEX IF NOT EXISTS idx_phone_intelligence_quality_score ON public.phone_intelligence(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_phone_intelligence_is_valid ON public.phone_intelligence(is_valid);
CREATE INDEX IF NOT EXISTS idx_phone_intelligence_carrier ON public.phone_intelligence(carrier_name);

-- 4. Phone Quality Scores Table
-- Tracks quality score history and factors
CREATE TABLE IF NOT EXISTS public.phone_quality_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_intelligence_id uuid NOT NULL REFERENCES public.phone_intelligence(id) ON DELETE CASCADE,
  phone_number text NOT NULL,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Score Components (0-100 each)
  line_type_score integer DEFAULT 0,
  carrier_score integer DEFAULT 0,
  connection_score integer DEFAULT 0,
  address_match_score integer DEFAULT 0,
  spam_probability_score integer DEFAULT 0, -- Lower is better (inverted)
  usage_history_score integer DEFAULT 0,
  sms_readiness_score integer DEFAULT 0,
  
  -- Final Scores
  quality_score integer DEFAULT 0, -- 0-100
  spam_risk_score integer DEFAULT 0, -- 0-100
  
  -- Score Breakdown Metadata
  score_factors jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phone_quality_scores_intelligence ON public.phone_quality_scores(phone_intelligence_id);
CREATE INDEX IF NOT EXISTS idx_phone_quality_scores_phone ON public.phone_quality_scores(phone_number);
CREATE INDEX IF NOT EXISTS idx_phone_quality_scores_org ON public.phone_quality_scores(org_id);
CREATE INDEX IF NOT EXISTS idx_phone_quality_scores_quality ON public.phone_quality_scores(quality_score DESC);

-- 5. Phone Carriers Lookup Table
-- Reference table for carrier information
CREATE TABLE IF NOT EXISTS public.phone_carriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_name text NOT NULL UNIQUE,
  carrier_type text NOT NULL, -- 'wireless', 'landline', 'voip'
  country text DEFAULT 'US',
  sms_supported boolean DEFAULT true,
  sms_reliable boolean DEFAULT true, -- For VOIP carriers
  blocks_unknown_senders boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phone_carriers_name ON public.phone_carriers(carrier_name);
CREATE INDEX IF NOT EXISTS idx_phone_carriers_type ON public.phone_carriers(carrier_type);

-- Insert common US carriers
INSERT INTO public.phone_carriers (carrier_name, carrier_type, sms_supported, sms_reliable, blocks_unknown_senders) VALUES
  ('Verizon', 'wireless', true, true, false),
  ('AT&T', 'wireless', true, true, false),
  ('T-Mobile', 'wireless', true, true, false),
  ('Sprint', 'wireless', true, true, false),
  ('Comcast', 'landline', false, false, false),
  ('Spectrum', 'landline', false, false, false),
  ('Frontier', 'landline', false, false, false),
  ('Google Voice', 'voip', true, false, false),
  ('Vonage', 'voip', true, false, false),
  ('RingCentral', 'voip', true, false, false)
ON CONFLICT (carrier_name) DO NOTHING;

-- 6. Phone Line Types Reference Table
-- Reference table for line type information
CREATE TABLE IF NOT EXISTS public.phone_line_types (
  line_type phone_line_type PRIMARY KEY,
  display_name text NOT NULL,
  description text,
  quality_weight numeric(3,2) DEFAULT 0.5, -- Weight for quality scoring (0.0 to 1.0)
  homeowner_likelihood text DEFAULT 'medium', -- 'high', 'medium', 'low'
  sms_capable boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Insert line type definitions
INSERT INTO public.phone_line_types (line_type, display_name, description, quality_weight, homeowner_likelihood, sms_capable) VALUES
  ('mobile', 'Mobile', 'Mobile phone number - best for booking', 1.0, 'high', true),
  ('landline', 'Landline', 'Traditional landline - lower quality lead', 0.4, 'medium', false),
  ('voip', 'VOIP', 'Voice over IP - risky lead', 0.3, 'low', true),
  ('business', 'Business', 'Business phone number - non-homeowner', 0.2, 'unlikely', true),
  ('google_voice', 'Google Voice', 'Google Voice number - possible renter', 0.3, 'low', true),
  ('burner', 'Burner', 'Temporary/burner number - spam risk', 0.1, 'unlikely', true),
  ('temporary', 'Temporary', 'Temporary number - low quality', 0.2, 'low', true),
  ('unknown', 'Unknown', 'Line type not detected', 0.5, 'unknown', false)
ON CONFLICT (line_type) DO NOTHING;

-- 7. Add phone intelligence columns to contacts table
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS phone_valid boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS phone_line_type phone_line_type DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS phone_carrier text,
  ADD COLUMN IF NOT EXISTS phone_sms_readiness sms_readiness_status DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS phone_quality_score integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS phone_intelligence_id uuid REFERENCES public.phone_intelligence(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_phone_intelligence ON public.contacts(phone_intelligence_id);
CREATE INDEX IF NOT EXISTS idx_contacts_phone_valid ON public.contacts(phone_valid);
CREATE INDEX IF NOT EXISTS idx_contacts_phone_quality_score ON public.contacts(phone_quality_score DESC);

-- 8. Function: Update phone intelligence updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_phone_intelligence_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_phone_intelligence_updated_at
  BEFORE UPDATE ON public.phone_intelligence
  FOR EACH ROW
  EXECUTE FUNCTION public.update_phone_intelligence_updated_at();

CREATE TRIGGER trg_phone_quality_scores_updated_at
  BEFORE UPDATE ON public.phone_quality_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.update_phone_intelligence_updated_at();

-- 9. Function: Calculate Phone Quality Score
CREATE OR REPLACE FUNCTION public.calculate_phone_quality_score(
  p_line_type phone_line_type,
  p_carrier_name text,
  p_is_valid boolean,
  p_is_active boolean,
  p_is_disconnected boolean,
  p_sms_readiness sms_readiness_status,
  p_homeowner_likelihood text,
  p_is_spam_risk boolean,
  p_is_business_line boolean
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_score integer := 50; -- Start at neutral
  v_line_type_weight numeric;
BEGIN
  -- Line Type Score (0-40 points)
  SELECT quality_weight INTO v_line_type_weight
  FROM public.phone_line_types
  WHERE line_type = p_line_type;
  
  IF v_line_type_weight IS NOT NULL THEN
    v_score := v_score + (v_line_type_weight * 40)::integer;
  END IF;
  
  -- Carrier Score (0-20 points)
  IF p_carrier_name IN ('Verizon', 'AT&T', 'T-Mobile', 'Sprint') THEN
    v_score := v_score + 20;
  ELSIF p_carrier_name IN ('Comcast', 'Spectrum', 'Frontier') THEN
    v_score := v_score + 5; -- Landline carriers
  ELSIF p_carrier_name LIKE '%VOIP%' OR p_carrier_name IN ('Google Voice', 'Vonage') THEN
    v_score := v_score - 10;
  END IF;
  
  -- Connection Status (0-20 points)
  IF p_is_valid = true AND p_is_active = true AND p_is_disconnected = false THEN
    v_score := v_score + 20;
  ELSIF p_is_disconnected = true THEN
    v_score := v_score - 40;
  ELSIF p_is_valid = false THEN
    v_score := v_score - 30;
  END IF;
  
  -- SMS Readiness (0-10 points)
  IF p_sms_readiness = 'sms_ready' THEN
    v_score := v_score + 10;
  ELSIF p_sms_readiness = 'landline_no_sms' THEN
    v_score := v_score - 5;
  ELSIF p_sms_readiness = 'voip_unreliable' THEN
    v_score := v_score - 5;
  END IF;
  
  -- Homeowner Likelihood (0-10 points)
  IF p_homeowner_likelihood = 'high' THEN
    v_score := v_score + 10;
  ELSIF p_homeowner_likelihood = 'medium' THEN
    v_score := v_score + 5;
  ELSIF p_homeowner_likelihood = 'low' THEN
    v_score := v_score - 5;
  ELSIF p_homeowner_likelihood = 'unlikely' THEN
    v_score := v_score - 15;
  END IF;
  
  -- Spam Risk Penalty
  IF p_is_spam_risk = true THEN
    v_score := v_score - 30;
  END IF;
  
  -- Business Line Penalty
  IF p_is_business_line = true THEN
    v_score := v_score - 20;
  END IF;
  
  -- Clamp to 0-100 range
  v_score := GREATEST(0, LEAST(100, v_score));
  
  RETURN v_score;
END;
$$;

-- 10. Function: Auto-tag phone based on intelligence
CREATE OR REPLACE FUNCTION public.get_phone_intelligence_tags(
  p_line_type phone_line_type,
  p_sms_readiness sms_readiness_status,
  p_is_disconnected boolean,
  p_is_spam_risk boolean,
  p_homeowner_likelihood text,
  p_carrier_name text
)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_tags text[] := ARRAY[]::text[];
BEGIN
  -- Line type tags
  IF p_line_type = 'mobile' THEN
    v_tags := array_append(v_tags, 'Mobile — High Quality');
  ELSIF p_line_type = 'landline' THEN
    v_tags := array_append(v_tags, 'Landline — OK');
  ELSIF p_line_type = 'voip' THEN
    v_tags := array_append(v_tags, 'VOIP — Low Intent');
  END IF;
  
  -- SMS readiness tags
  IF p_sms_readiness = 'sms_ready' THEN
    v_tags := array_append(v_tags, 'SMS Ready');
  ELSIF p_sms_readiness = 'landline_no_sms' THEN
    v_tags := array_append(v_tags, 'SMS Not Supported');
  END IF;
  
  -- Status tags
  IF p_is_disconnected = true THEN
    v_tags := array_append(v_tags, 'Disconnected Number');
  END IF;
  
  IF p_is_spam_risk = true THEN
    v_tags := array_append(v_tags, 'Spam Risk');
  END IF;
  
  IF p_homeowner_likelihood = 'unlikely' THEN
    v_tags := array_append(v_tags, 'Possibly Wrong Number');
  END IF;
  
  -- Carrier risk tags
  IF p_carrier_name IN ('Google Voice', 'Vonage') AND p_homeowner_likelihood IN ('low', 'unlikely') THEN
    v_tags := array_append(v_tags, 'Carrier Risk');
  END IF;
  
  RETURN v_tags;
END;
$$;

-- 11. RLS Policies
ALTER TABLE public.phone_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_quality_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_carriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_line_types ENABLE ROW LEVEL SECURITY;

-- Phone intelligence: users can view/update their org's data
CREATE POLICY "Users can view phone intelligence for their org"
  ON public.phone_intelligence FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.org_id = phone_intelligence.org_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert phone intelligence for their org"
  ON public.phone_intelligence FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.org_id = phone_intelligence.org_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update phone intelligence for their org"
  ON public.phone_intelligence FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.org_id = phone_intelligence.org_id
      AND org_members.user_id = auth.uid()
    )
  );

-- Phone quality scores: same org-based access
CREATE POLICY "Users can view phone quality scores for their org"
  ON public.phone_quality_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.org_id = phone_quality_scores.org_id
      AND org_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert phone quality scores for their org"
  ON public.phone_quality_scores FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members
      WHERE org_members.org_id = phone_quality_scores.org_id
      AND org_members.user_id = auth.uid()
    )
  );

-- Carriers and line types: read-only for all authenticated users
CREATE POLICY "Authenticated users can view carriers"
  ON public.phone_carriers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view line types"
  ON public.phone_line_types FOR SELECT
  TO authenticated
  USING (true);

-- 12. Comments
COMMENT ON TABLE public.phone_intelligence IS 'Comprehensive phone number intelligence data including validation, carrier, line type, SMS readiness, and quality scores';
COMMENT ON TABLE public.phone_quality_scores IS 'Detailed phone quality score breakdowns and history';
COMMENT ON TABLE public.phone_carriers IS 'Reference table for phone carrier information';
COMMENT ON TABLE public.phone_line_types IS 'Reference table for phone line type definitions';
COMMENT ON COLUMN public.phone_intelligence.quality_score IS 'Overall phone quality score 0-100 (90+ = High Quality, 70-89 = Normal, 50-69 = Low-quality, <50 = Suspect/spam)';
COMMENT ON COLUMN public.phone_intelligence.homeowner_likelihood IS 'Likelihood this is a homeowner: high, medium, low, unlikely, unknown';
COMMENT ON COLUMN public.phone_intelligence.sms_readiness IS 'SMS capability status: sms_ready, landline_no_sms, voip_unreliable, carrier_blocks_unknown, unknown';





















































