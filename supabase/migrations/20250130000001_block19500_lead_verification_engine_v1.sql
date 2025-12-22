-- =========================================================
-- Block 19500 — SmartSend Initial Lead Verification Engine v1
-- (The First 5 Seconds Brain: Detect Lead Quality, Spam, Fake Homeowners, Bad Emails, Bad Phones, Wrong Roofing Leads & Auto-Clean the CRM Before Anything Starts)
-- =========================================================

-- ============================================
-- 1) Lead Verification Table (Main Verification Results)
-- ============================================
CREATE TABLE IF NOT EXISTS public.lead_verification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  -- Email Verification
  email_valid boolean DEFAULT NULL,
  email_format_valid boolean DEFAULT NULL,
  email_mailbox_exists boolean DEFAULT NULL,
  email_domain_reputation text CHECK (email_domain_reputation IN ('good', 'neutral', 'poor', 'unknown')) DEFAULT 'unknown',
  email_spam_markers text[] DEFAULT '{}',
  email_disposable boolean DEFAULT NULL,
  email_verification_status text CHECK (email_verification_status IN ('valid', 'risky', 'invalid', 'unknown')) DEFAULT 'unknown',
  email_verification_reasons text[] DEFAULT '{}',
  -- Phone Verification
  phone_valid boolean DEFAULT NULL,
  phone_type text CHECK (phone_type IN ('mobile', 'landline', 'voip', 'toll_free', 'unknown')) DEFAULT 'unknown',
  phone_carrier text,
  phone_spam_level text CHECK (phone_spam_level IN ('low', 'medium', 'high', 'unknown')) DEFAULT 'unknown',
  phone_verification_status text CHECK (phone_verification_status IN ('valid', 'risky', 'invalid', 'unknown')) DEFAULT 'unknown',
  phone_verification_reasons text[] DEFAULT '{}',
  -- Address Verification
  address_valid boolean DEFAULT NULL,
  address_formatted text,
  address_in_territory boolean DEFAULT NULL,
  address_is_po_box boolean DEFAULT NULL,
  address_is_commercial boolean DEFAULT NULL,
  address_is_multi_family boolean DEFAULT NULL,
  address_verification_status text CHECK (address_verification_status IN ('valid', 'risky', 'invalid', 'unknown')) DEFAULT 'unknown',
  address_verification_reasons text[] DEFAULT '{}',
  -- Homeowner Verification
  homeowner_verified boolean DEFAULT NULL,
  homeowner_match_score numeric(3,2) DEFAULT 0.0 CHECK (homeowner_match_score >= 0.0 AND homeowner_match_score <= 1.0),
  homeowner_match_sources text[] DEFAULT '{}', -- e.g., ['zillow', 'redfin', 'tax_records']
  homeowner_verification_status text CHECK (homeowner_verification_status IN ('verified', 'likely', 'unlikely', 'unknown')) DEFAULT 'unknown',
  homeowner_verification_reasons text[] DEFAULT '{}',
  -- Intent Verification
  intent_roofing_relevant boolean DEFAULT NULL,
  intent_score numeric(3,2) DEFAULT 0.0 CHECK (intent_score >= 0.0 AND intent_score <= 1.0),
  intent_keywords text[] DEFAULT '{}',
  intent_verification_status text CHECK (intent_verification_status IN ('relevant', 'maybe', 'irrelevant', 'unknown')) DEFAULT 'unknown',
  intent_verification_reasons text[] DEFAULT '{}',
  -- Territory Compliance
  territory_compliant boolean DEFAULT NULL,
  territory_match_zip boolean DEFAULT NULL,
  territory_match_neighborhood boolean DEFAULT NULL,
  territory_match_county boolean DEFAULT NULL,
  territory_status text CHECK (territory_status IN ('in_territory', 'out_of_area', 'unknown')) DEFAULT 'unknown',
  territory_reasons text[] DEFAULT '{}',
  -- Spam Detection
  spam_detected boolean DEFAULT NULL,
  spam_score numeric(3,2) DEFAULT 0.0 CHECK (spam_score >= 0.0 AND spam_score <= 1.0),
  spam_patterns text[] DEFAULT '{}',
  spam_type text CHECK (spam_type IN ('vendor', 'bot', 'foreign_spam', 'link_spam', 'sales_pitch', 'none')) DEFAULT 'none',
  spam_verification_status text CHECK (spam_verification_status IN ('clean', 'suspicious', 'spam', 'unknown')) DEFAULT 'unknown',
  spam_verification_reasons text[] DEFAULT '{}',
  -- Duplicate Detection
  is_duplicate boolean DEFAULT NULL,
  duplicate_matches uuid[] DEFAULT '{}', -- Array of contact/lead IDs that match
  duplicate_match_fields text[] DEFAULT '{}', -- e.g., ['email', 'phone', 'address']
  duplicate_status text CHECK (duplicate_status IN ('unique', 'duplicate', 'possible_duplicate', 'unknown')) DEFAULT 'unknown',
  -- Overall Quality Score (0-100)
  quality_score integer DEFAULT 0 CHECK (quality_score >= 0 AND quality_score <= 100),
  quality_category text CHECK (quality_category IN ('high', 'medium', 'low', 'junk')) DEFAULT 'junk',
  -- Red Alerts (Array of alert types)
  red_alerts text[] DEFAULT '{}', -- e.g., ['voip_phone', 'spam_message', 'not_homeowner', 'territory_mismatch']
  -- Verification Metadata
  verification_timestamp timestamptz DEFAULT now(),
  verification_version text DEFAULT 'v1',
  verification_metadata jsonb DEFAULT '{}'::jsonb,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  -- Constraints
  CONSTRAINT lead_verification_contact_or_lead CHECK (
    (contact_id IS NOT NULL AND lead_id IS NULL) OR 
    (contact_id IS NULL AND lead_id IS NOT NULL) OR
    (contact_id IS NOT NULL AND lead_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lead_verification_workspace ON public.lead_verification(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_verification_contact ON public.lead_verification(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_verification_lead ON public.lead_verification(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_verification_quality_score ON public.lead_verification(quality_score);
CREATE INDEX IF NOT EXISTS idx_lead_verification_quality_category ON public.lead_verification(quality_category);
CREATE INDEX IF NOT EXISTS idx_lead_verification_spam ON public.lead_verification(spam_detected) WHERE spam_detected = true;
CREATE INDEX IF NOT EXISTS idx_lead_verification_duplicate ON public.lead_verification(is_duplicate) WHERE is_duplicate = true;
CREATE INDEX IF NOT EXISTS idx_lead_verification_territory ON public.lead_verification(territory_compliant) WHERE territory_compliant = false;

-- ============================================
-- 2) Lead Quality Scores Table (Historical Tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS public.lead_quality_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  verification_id uuid REFERENCES public.lead_verification(id) ON DELETE SET NULL,
  -- Score Breakdown
  quality_score integer NOT NULL CHECK (quality_score >= 0 AND quality_score <= 100),
  quality_category text NOT NULL CHECK (quality_category IN ('high', 'medium', 'low', 'junk')),
  -- Component Scores
  email_score integer DEFAULT 0 CHECK (email_score >= 0 AND email_score <= 100),
  phone_score integer DEFAULT 0 CHECK (phone_score >= 0 AND phone_score <= 100),
  address_score integer DEFAULT 0 CHECK (address_score >= 0 AND address_score <= 100),
  homeowner_score integer DEFAULT 0 CHECK (homeowner_score >= 0 AND homeowner_score <= 100),
  intent_score integer DEFAULT 0 CHECK (intent_score >= 0 AND intent_score <= 100),
  territory_score integer DEFAULT 0 CHECK (territory_score >= 0 AND territory_score <= 100),
  spam_score integer DEFAULT 0 CHECK (spam_score >= 0 AND spam_score <= 100), -- Lower is better (0 = no spam)
  duplicate_score integer DEFAULT 0 CHECK (duplicate_score >= 0 AND duplicate_score <= 100), -- Lower is better (0 = unique)
  -- Score Factors
  score_factors jsonb DEFAULT '{}'::jsonb, -- Detailed breakdown of scoring logic
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  CONSTRAINT lead_quality_scores_contact_or_lead CHECK (
    (contact_id IS NOT NULL AND lead_id IS NULL) OR 
    (contact_id IS NULL AND lead_id IS NOT NULL) OR
    (contact_id IS NOT NULL AND lead_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lead_quality_scores_workspace ON public.lead_quality_scores(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_quality_scores_contact ON public.lead_quality_scores(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_quality_scores_lead ON public.lead_quality_scores(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_quality_scores_quality ON public.lead_quality_scores(quality_score, quality_category);
CREATE INDEX IF NOT EXISTS idx_lead_quality_scores_created ON public.lead_quality_scores(created_at DESC);

-- ============================================
-- 3) Lead Intent Types Table (Roofing Intent Classification)
-- ============================================
CREATE TABLE IF NOT EXISTS public.lead_intent_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  verification_id uuid REFERENCES public.lead_verification(id) ON DELETE SET NULL,
  -- Intent Classification
  intent_type text CHECK (intent_type IN ('roofing', 'solar', 'hvac', 'landscaping', 'painting', 'driveway', 'handyman', 'generic_spam', 'vendor', 'unknown')) DEFAULT 'unknown',
  intent_confidence numeric(3,2) DEFAULT 0.0 CHECK (intent_confidence >= 0.0 AND intent_confidence <= 1.0),
  -- Roofing Sub-types
  roofing_subtype text CHECK (roofing_subtype IN ('leak', 'missing_shingles', 'hail_damage', 'storm_damage', 'need_quote', 'repair', 'replacement', 'inspection', 'general_inquiry')) DEFAULT NULL,
  -- Keywords Found
  keywords_found text[] DEFAULT '{}',
  keywords_negative text[] DEFAULT '{}', -- Keywords that suggest NOT roofing
  -- Message Analysis
  message_text text,
  message_analysis jsonb DEFAULT '{}'::jsonb,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT lead_intent_types_contact_or_lead CHECK (
    (contact_id IS NOT NULL AND lead_id IS NULL) OR 
    (contact_id IS NULL AND lead_id IS NOT NULL) OR
    (contact_id IS NOT NULL AND lead_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lead_intent_types_workspace ON public.lead_intent_types(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_intent_types_contact ON public.lead_intent_types(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_intent_types_lead ON public.lead_intent_types(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_intent_types_intent ON public.lead_intent_types(intent_type);
CREATE INDEX IF NOT EXISTS idx_lead_intent_types_roofing ON public.lead_intent_types(roofing_subtype) WHERE roofing_subtype IS NOT NULL;

-- ============================================
-- 4) Lead Duplicates Table (Duplicate Detection & Merging)
-- ============================================
CREATE TABLE IF NOT EXISTS public.lead_duplicates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Primary Contact/Lead
  primary_contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  primary_lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  -- Duplicate Contact/Lead
  duplicate_contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  duplicate_lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  -- Match Details
  match_confidence numeric(3,2) DEFAULT 0.0 CHECK (match_confidence >= 0.0 AND match_confidence <= 1.0),
  match_fields text[] DEFAULT '{}', -- e.g., ['email', 'phone', 'address', 'name']
  match_score integer DEFAULT 0 CHECK (match_score >= 0 AND match_score <= 100),
  -- Status
  status text CHECK (status IN ('detected', 'confirmed', 'merged', 'ignored')) DEFAULT 'detected',
  -- Metadata
  detection_method text CHECK (detection_method IN ('email', 'phone', 'address', 'name', 'combined', 'manual')) DEFAULT 'combined',
  detection_metadata jsonb DEFAULT '{}'::jsonb,
  -- Timestamps
  detected_at timestamptz DEFAULT now(),
  confirmed_at timestamptz,
  merged_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  -- Constraints
  CONSTRAINT lead_duplicates_primary_check CHECK (
    (primary_contact_id IS NOT NULL AND primary_lead_id IS NULL) OR 
    (primary_contact_id IS NULL AND primary_lead_id IS NOT NULL) OR
    (primary_contact_id IS NOT NULL AND primary_lead_id IS NOT NULL)
  ),
  CONSTRAINT lead_duplicates_duplicate_check CHECK (
    (duplicate_contact_id IS NOT NULL AND duplicate_lead_id IS NULL) OR 
    (duplicate_contact_id IS NULL AND duplicate_lead_id IS NOT NULL) OR
    (duplicate_contact_id IS NOT NULL AND duplicate_lead_id IS NOT NULL)
  ),
  CONSTRAINT lead_duplicates_not_same CHECK (
    (primary_contact_id IS DISTINCT FROM duplicate_contact_id) OR
    (primary_lead_id IS DISTINCT FROM duplicate_lead_id)
  )
);

CREATE INDEX IF NOT EXISTS idx_lead_duplicates_workspace ON public.lead_duplicates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_duplicates_primary_contact ON public.lead_duplicates(primary_contact_id) WHERE primary_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_duplicates_primary_lead ON public.lead_duplicates(primary_lead_id) WHERE primary_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_duplicates_duplicate_contact ON public.lead_duplicates(duplicate_contact_id) WHERE duplicate_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_duplicates_duplicate_lead ON public.lead_duplicates(duplicate_lead_id) WHERE duplicate_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_duplicates_status ON public.lead_duplicates(status);
CREATE INDEX IF NOT EXISTS idx_lead_duplicates_detected ON public.lead_duplicates(detected_at DESC);

-- ============================================
-- 5) Lead Spam Results Table (Spam Detection Details)
-- ============================================
CREATE TABLE IF NOT EXISTS public.lead_spam_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  verification_id uuid REFERENCES public.lead_verification(id) ON DELETE SET NULL,
  -- Spam Detection
  spam_detected boolean NOT NULL DEFAULT false,
  spam_score numeric(3,2) NOT NULL DEFAULT 0.0 CHECK (spam_score >= 0.0 AND spam_score <= 1.0),
  spam_type text CHECK (spam_type IN ('vendor', 'bot', 'foreign_spam', 'link_spam', 'sales_pitch', 'seo_marketing', 'none')) DEFAULT 'none',
  -- Pattern Detection
  patterns_detected text[] DEFAULT '{}', -- e.g., ['partner_offer', 'seo_services', 'product_review', 'link_only']
  pattern_matches jsonb DEFAULT '{}'::jsonb, -- Detailed pattern match data
  -- Message Analysis
  message_text text,
  message_analysis jsonb DEFAULT '{}'::jsonb,
  -- Keywords
  spam_keywords text[] DEFAULT '{}',
  -- Status
  status text CHECK (status IN ('clean', 'suspicious', 'spam', 'unknown')) DEFAULT 'unknown',
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT lead_spam_results_contact_or_lead CHECK (
    (contact_id IS NOT NULL AND lead_id IS NULL) OR 
    (contact_id IS NULL AND lead_id IS NOT NULL) OR
    (contact_id IS NOT NULL AND lead_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lead_spam_results_workspace ON public.lead_spam_results(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_spam_results_contact ON public.lead_spam_results(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_spam_results_lead ON public.lead_spam_results(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_spam_results_detected ON public.lead_spam_results(spam_detected) WHERE spam_detected = true;
CREATE INDEX IF NOT EXISTS idx_lead_spam_results_type ON public.lead_spam_results(spam_type) WHERE spam_type != 'none';

-- ============================================
-- 6) Lead Verification Timeline Table (Audit Log)
-- ============================================
CREATE TABLE IF NOT EXISTS public.lead_verification_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  verification_id uuid REFERENCES public.lead_verification(id) ON DELETE SET NULL,
  -- Check Type
  check_type text NOT NULL CHECK (check_type IN ('email', 'phone', 'address', 'homeowner', 'intent', 'spam', 'territory', 'duplicate', 'full_verification')),
  -- Check Result
  check_status text CHECK (check_status IN ('passed', 'failed', 'warning', 'unknown')) DEFAULT 'unknown',
  check_result jsonb DEFAULT '{}'::jsonb,
  -- Details
  details text,
  -- Timestamps
  checked_at timestamptz DEFAULT now(),
  CONSTRAINT lead_verification_timeline_contact_or_lead CHECK (
    (contact_id IS NOT NULL AND lead_id IS NULL) OR 
    (contact_id IS NULL AND lead_id IS NOT NULL) OR
    (contact_id IS NOT NULL AND lead_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_lead_verification_timeline_workspace ON public.lead_verification_timeline(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_verification_timeline_contact ON public.lead_verification_timeline(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_verification_timeline_lead ON public.lead_verification_timeline(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_verification_timeline_verification ON public.lead_verification_timeline(verification_id) WHERE verification_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_verification_timeline_check_type ON public.lead_verification_timeline(check_type);
CREATE INDEX IF NOT EXISTS idx_lead_verification_timeline_checked_at ON public.lead_verification_timeline(checked_at DESC);

-- ============================================
-- 7) Updated_at Triggers
-- ============================================
CREATE OR REPLACE FUNCTION public.set_lead_verification_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_verification_updated_at ON public.lead_verification;
CREATE TRIGGER trg_lead_verification_updated_at
BEFORE UPDATE ON public.lead_verification
FOR EACH ROW
EXECUTE FUNCTION public.set_lead_verification_updated_at();

DROP TRIGGER IF EXISTS trg_lead_intent_types_updated_at ON public.lead_intent_types;
CREATE TRIGGER trg_lead_intent_types_updated_at
BEFORE UPDATE ON public.lead_intent_types
FOR EACH ROW
EXECUTE FUNCTION public.set_lead_verification_updated_at();

DROP TRIGGER IF EXISTS trg_lead_duplicates_updated_at ON public.lead_duplicates;
CREATE TRIGGER trg_lead_duplicates_updated_at
BEFORE UPDATE ON public.lead_duplicates
FOR EACH ROW
EXECUTE FUNCTION public.set_lead_verification_updated_at();

DROP TRIGGER IF EXISTS trg_lead_spam_results_updated_at ON public.lead_spam_results;
CREATE TRIGGER trg_lead_spam_results_updated_at
BEFORE UPDATE ON public.lead_spam_results
FOR EACH ROW
EXECUTE FUNCTION public.set_lead_verification_updated_at();

-- ============================================
-- 8) Function: Calculate Lead Quality Score (0-100)
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_lead_quality_score(
  p_email_score integer DEFAULT 0,
  p_phone_score integer DEFAULT 0,
  p_address_score integer DEFAULT 0,
  p_homeowner_score integer DEFAULT 0,
  p_intent_score integer DEFAULT 0,
  p_territory_score integer DEFAULT 0,
  p_spam_penalty integer DEFAULT 0, -- Penalty for spam (0-100, subtracted)
  p_duplicate_penalty integer DEFAULT 0 -- Penalty for duplicates (0-100, subtracted)
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_weighted_score numeric;
  v_final_score integer;
BEGIN
  -- Weighted scoring (weights sum to 1.0)
  -- Email: 15%, Phone: 15%, Address: 10%, Homeowner: 25%, Intent: 20%, Territory: 15%
  v_weighted_score := 
    (p_email_score * 0.15) +
    (p_phone_score * 0.15) +
    (p_address_score * 0.10) +
    (p_homeowner_score * 0.25) +
    (p_intent_score * 0.20) +
    (p_territory_score * 0.15);
  
  -- Apply penalties (spam and duplicate reduce score)
  v_weighted_score := v_weighted_score - (p_spam_penalty * 0.5); -- Spam penalty is harsh
  v_weighted_score := v_weighted_score - (p_duplicate_penalty * 0.3); -- Duplicate penalty is moderate
  
  -- Ensure score is between 0 and 100
  v_final_score := GREATEST(0, LEAST(100, ROUND(v_weighted_score)::integer));
  
  RETURN v_final_score;
END;
$$;

-- ============================================
-- 9) Function: Determine Quality Category
-- ============================================
CREATE OR REPLACE FUNCTION public.determine_quality_category(
  p_quality_score integer
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_quality_score >= 90 THEN
    RETURN 'high';
  ELSIF p_quality_score >= 70 THEN
    RETURN 'medium';
  ELSIF p_quality_score >= 40 THEN
    RETURN 'low';
  ELSE
    RETURN 'junk';
  END IF;
END;
$$;

-- ============================================
-- 10) Function: Generate Red Alerts
-- ============================================
CREATE OR REPLACE FUNCTION public.generate_red_alerts(
  p_email_verification_status text,
  p_phone_type text,
  p_phone_verification_status text,
  p_homeowner_verified boolean,
  p_address_in_territory boolean,
  p_spam_detected boolean,
  p_is_duplicate boolean,
  p_intent_roofing_relevant boolean
)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_alerts text[] := '{}';
BEGIN
  -- Email alerts
  IF p_email_verification_status = 'invalid' THEN
    v_alerts := array_append(v_alerts, 'invalid_email');
  END IF;
  
  -- Phone alerts
  IF p_phone_type = 'voip' THEN
    v_alerts := array_append(v_alerts, 'voip_phone');
  END IF;
  IF p_phone_verification_status = 'invalid' THEN
    v_alerts := array_append(v_alerts, 'invalid_phone');
  END IF;
  
  -- Homeowner alerts
  IF p_homeowner_verified = false THEN
    v_alerts := array_append(v_alerts, 'not_homeowner');
  END IF;
  
  -- Territory alerts
  IF p_address_in_territory = false THEN
    v_alerts := array_append(v_alerts, 'territory_mismatch');
  END IF;
  
  -- Spam alerts
  IF p_spam_detected = true THEN
    v_alerts := array_append(v_alerts, 'spam_detected');
  END IF;
  
  -- Duplicate alerts
  IF p_is_duplicate = true THEN
    v_alerts := array_append(v_alerts, 'duplicate_lead');
  END IF;
  
  -- Intent alerts
  IF p_intent_roofing_relevant = false THEN
    v_alerts := array_append(v_alerts, 'not_roofing_lead');
  END IF;
  
  RETURN v_alerts;
END;
$$;

-- ============================================
-- 11) RLS Policies
-- ============================================
ALTER TABLE public.lead_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_quality_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_intent_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_duplicates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_spam_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_verification_timeline ENABLE ROW LEVEL SECURITY;

-- RLS: Lead Verification
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'lead_verification'
      AND policyname = 'Lead verification scoped to workspace'
  ) THEN
    CREATE POLICY "Lead verification scoped to workspace"
    ON public.lead_verification
    FOR ALL
    USING (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    );
  END IF;
END;
$$;

-- RLS: Lead Quality Scores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'lead_quality_scores'
      AND policyname = 'Lead quality scores scoped to workspace'
  ) THEN
    CREATE POLICY "Lead quality scores scoped to workspace"
    ON public.lead_quality_scores
    FOR ALL
    USING (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    );
  END IF;
END;
$$;

-- RLS: Lead Intent Types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'lead_intent_types'
      AND policyname = 'Lead intent types scoped to workspace'
  ) THEN
    CREATE POLICY "Lead intent types scoped to workspace"
    ON public.lead_intent_types
    FOR ALL
    USING (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    );
  END IF;
END;
$$;

-- RLS: Lead Duplicates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'lead_duplicates'
      AND policyname = 'Lead duplicates scoped to workspace'
  ) THEN
    CREATE POLICY "Lead duplicates scoped to workspace"
    ON public.lead_duplicates
    FOR ALL
    USING (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    );
  END IF;
END;
$$;

-- RLS: Lead Spam Results
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'lead_spam_results'
      AND policyname = 'Lead spam results scoped to workspace'
  ) THEN
    CREATE POLICY "Lead spam results scoped to workspace"
    ON public.lead_spam_results
    FOR ALL
    USING (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    );
  END IF;
END;
$$;

-- RLS: Lead Verification Timeline
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'lead_verification_timeline'
      AND policyname = 'Lead verification timeline scoped to workspace'
  ) THEN
    CREATE POLICY "Lead verification timeline scoped to workspace"
    ON public.lead_verification_timeline
    FOR ALL
    USING (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    );
  END IF;
END;
$$;

-- ============================================
-- 12) Comments
-- ============================================
COMMENT ON TABLE public.lead_verification IS 'Main table storing comprehensive lead verification results across all 9 categories';
COMMENT ON TABLE public.lead_quality_scores IS 'Historical tracking of lead quality scores with component breakdowns';
COMMENT ON TABLE public.lead_intent_types IS 'Roofing intent classification and keyword analysis';
COMMENT ON TABLE public.lead_duplicates IS 'Duplicate detection and merge tracking';
COMMENT ON TABLE public.lead_spam_results IS 'Detailed spam detection results and pattern analysis';
COMMENT ON TABLE public.lead_verification_timeline IS 'Audit log of all verification checks performed';

COMMENT ON FUNCTION public.calculate_lead_quality_score IS 'Calculates overall lead quality score (0-100) based on component scores and penalties';
COMMENT ON FUNCTION public.determine_quality_category IS 'Determines quality category (high/medium/low/junk) based on score';
COMMENT ON FUNCTION public.generate_red_alerts IS 'Generates array of red alert types based on verification results';





















































