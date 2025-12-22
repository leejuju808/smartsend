-- ============================================================
-- Block 256100 — SmartSend Warranty & Long-Term Customer Care Engine v1
-- ============================================================
-- 
-- This block turns SmartSend into the long-term customer relationship machine roofers have NEVER had.
-- 
-- Features:
-- - Digital Warranty Vault (Customer Portal)
-- - Warranty Expiration Tracking + Alerts
-- - Annual & Seasonal Auto Check-Ins
-- - AI Roof Health Monitoring (Photo Upload Checker)
-- - Warranty Claim Intake + Automation
-- - Customer Lifetime Value (LTV) Tracker
-- - Referral Triggers Based on Customer Happiness
-- 
-- ============================================================

-- ============================================================================
-- PART 1 — WARRANTIES TABLE (Enhanced)
-- ============================================================================
-- Tracks all warranties for completed jobs with comprehensive coverage details

CREATE TABLE IF NOT EXISTS public.warranties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  
  -- Warranty classification
  warranty_type text NOT NULL CHECK (warranty_type IN (
    'workmanship',
    'manufacturer',
    'extended',
    'lifetime',
    'limited',
    'other'
  )),
  
  -- Coverage details (JSONB for flexibility)
  coverage_details jsonb DEFAULT '{}'::jsonb, -- {
  --   "coverage_items": ["leaks", "installation_defects", "material_defects"],
  --   "exclusions": ["storm_damage", "normal_wear"],
  --   "transferable": true,
  --   "registration_number": "W-12345",
  --   "manufacturer": "GAF",
  --   "material_details": {...}
  -- }
  
  -- Dates
  start_date date NOT NULL,
  end_date date,
  
  -- Transferability
  transferable boolean DEFAULT false,
  
  -- Status
  is_active boolean DEFAULT true,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for warranties
CREATE INDEX IF NOT EXISTS idx_warranties_team ON public.warranties(team_id);
CREATE INDEX IF NOT EXISTS idx_warranties_job ON public.warranties(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warranties_customer ON public.warranties(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warranties_type ON public.warranties(team_id, warranty_type);
CREATE INDEX IF NOT EXISTS idx_warranties_active ON public.warranties(team_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_warranties_end_date ON public.warranties(end_date) WHERE end_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warranties_expiring ON public.warranties(team_id, end_date) 
  WHERE end_date IS NOT NULL AND end_date >= CURRENT_DATE AND is_active = true;

-- ============================================================================
-- PART 2 — WARRANTY CLAIMS TABLE
-- ============================================================================
-- Tracks all warranty claims submitted by customers

CREATE TABLE IF NOT EXISTS public.warranty_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warranty_id uuid NOT NULL REFERENCES public.warranties(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  
  -- Claim details
  description text NOT NULL,
  photos text[], -- Array of photo URLs
  issue_started_date date, -- Approximate date issue started
  
  -- AI analysis
  ai_coverage_likelihood numeric(5,2) DEFAULT 0 CHECK (ai_coverage_likelihood >= 0 AND ai_coverage_likelihood <= 100),
  ai_coverage_reason text, -- Why AI thinks it's covered/not covered
  ai_detected_issues jsonb DEFAULT '[]'::jsonb, -- [{"issue": "lifted_shingles", "confidence": 0.86}, ...]
  
  -- Status workflow
  status text DEFAULT 'submitted' CHECK (status IN (
    'submitted',
    'in_review',
    'approved',
    'denied',
    'scheduled',
    'in_progress',
    'completed',
    'cancelled'
  )),
  
  -- Assignment
  assigned_to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to_pm_id uuid, -- Project manager reference
  
  -- Resolution
  resolution_notes text,
  resolution_cost numeric(12,2),
  is_covered boolean,
  coverage_determination_date date,
  
  -- Inspection scheduling
  inspection_scheduled_date date,
  inspection_completed_date date,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for warranty_claims
CREATE INDEX IF NOT EXISTS idx_warranty_claims_warranty ON public.warranty_claims(warranty_id);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_customer ON public.warranty_claims(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warranty_claims_job ON public.warranty_claims(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warranty_claims_team ON public.warranty_claims(team_id);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_status ON public.warranty_claims(team_id, status);
CREATE INDEX IF NOT EXISTS idx_warranty_claims_submitted ON public.warranty_claims(team_id, created_at DESC) WHERE status = 'submitted';
CREATE INDEX IF NOT EXISTS idx_warranty_claims_assigned ON public.warranty_claims(assigned_to_user_id) WHERE assigned_to_user_id IS NOT NULL;

-- ============================================================================
-- PART 3 — CUSTOMER CHECKINS TABLE
-- ============================================================================
-- Tracks all automated check-ins sent to customers (annual, seasonal, storm follow-up)

CREATE TABLE IF NOT EXISTS public.customer_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  
  -- Check-in type
  checkin_type text NOT NULL CHECK (checkin_type IN (
    'annual',
    'seasonal_spring',
    'seasonal_fall',
    'seasonal_winter',
    'storm_followup',
    'warranty_check',
    'maintenance_reminder',
    'roof_age_check'
  )),
  
  -- Scheduling
  scheduled_date date NOT NULL,
  sent_date date,
  message_sent boolean DEFAULT false,
  message_sent_at timestamptz,
  
  -- Response tracking
  customer_responded boolean DEFAULT false,
  response_type text CHECK (response_type IN ('interested', 'not_interested', 'scheduled', 'declined', 'no_response')),
  response_date date,
  
  -- Conversion tracking
  converted_to_inspection boolean DEFAULT false,
  converted_to_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  converted_value numeric(12,2),
  
  -- Message details
  message_content jsonb DEFAULT '{}'::jsonb, -- Store the actual message sent
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for customer_checkins
CREATE INDEX IF NOT EXISTS idx_customer_checkins_customer ON public.customer_checkins(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_checkins_job ON public.customer_checkins(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_checkins_team ON public.customer_checkins(team_id);
CREATE INDEX IF NOT EXISTS idx_customer_checkins_type ON public.customer_checkins(team_id, checkin_type);
CREATE INDEX IF NOT EXISTS idx_customer_checkins_scheduled ON public.customer_checkins(team_id, scheduled_date) WHERE message_sent = false;
CREATE INDEX IF NOT EXISTS idx_customer_checkins_sent ON public.customer_checkins(team_id, sent_date DESC);

-- ============================================================================
-- PART 4 — ROOF HEALTH PHOTOS TABLE
-- ============================================================================
-- Stores customer-uploaded roof photos for AI health monitoring

CREATE TABLE IF NOT EXISTS public.roof_health_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  warranty_id uuid REFERENCES public.warranties(id) ON DELETE SET NULL,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  
  -- Photo info
  photo_url text NOT NULL,
  uploaded_at timestamptz DEFAULT now(),
  uploaded_by_customer boolean DEFAULT true,
  
  -- AI analysis results
  ai_analysis_complete boolean DEFAULT false,
  ai_analysis_date timestamptz,
  ai_detected_issues jsonb DEFAULT '[]'::jsonb, -- [
  --   {"issue": "lifted_shingles", "confidence": 0.86, "location": "north_side"},
  --   {"issue": "pipe_boot_wearing", "confidence": 0.92, "location": "chimney"},
  --   {"issue": "missing_granules", "confidence": 0.75, "location": "south_side"}
  -- ]
  ai_health_score numeric(5,2) CHECK (ai_health_score >= 0 AND ai_health_score <= 100),
  ai_recommendations jsonb DEFAULT '[]'::jsonb, -- [
  --   {"action": "repair", "priority": "medium", "estimated_cost": 275, "description": "Fix 2 lifted shingles"}
  -- ]
  
  -- Auto-job creation
  auto_created_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  auto_created_repair_job_id uuid, -- References repair jobs if created
  
  -- Timestamps
  created_at timestamptz DEFAULT now()
);

-- Indexes for roof_health_photos
CREATE INDEX IF NOT EXISTS idx_roof_health_photos_customer ON public.roof_health_photos(customer_id);
CREATE INDEX IF NOT EXISTS idx_roof_health_photos_job ON public.roof_health_photos(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roof_health_photos_warranty ON public.roof_health_photos(warranty_id) WHERE warranty_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roof_health_photos_team ON public.roof_health_photos(team_id);
CREATE INDEX IF NOT EXISTS idx_roof_health_photos_analysis ON public.roof_health_photos(team_id, ai_analysis_complete) WHERE ai_analysis_complete = false;
CREATE INDEX IF NOT EXISTS idx_roof_health_photos_uploaded ON public.roof_health_photos(team_id, uploaded_at DESC);

-- ============================================================================
-- PART 5 — CUSTOMER LIFETIME VALUE ENHANCEMENTS
-- ============================================================================
-- Extended tracking for customer lifetime value (extends existing customers table)

-- Add columns to customers table if they don't exist
DO $$ 
BEGIN
  -- Warranty tracking enhancements
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'customers' 
                 AND column_name = 'total_warranties') THEN
    ALTER TABLE public.customers ADD COLUMN total_warranties int DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'customers' 
                 AND column_name = 'active_warranties') THEN
    ALTER TABLE public.customers ADD COLUMN active_warranties int DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'customers' 
                 AND column_name = 'warranty_claims_count') THEN
    ALTER TABLE public.customers ADD COLUMN warranty_claims_count int DEFAULT 0;
  END IF;
  
  -- LTV breakdown
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'customers' 
                 AND column_name = 'ltv_breakdown') THEN
    ALTER TABLE public.customers ADD COLUMN ltv_breakdown jsonb DEFAULT '{}'::jsonb;
    -- {
    --   "original_roof": 15000,
    --   "repairs": 1200,
    --   "maintenance": 450,
    --   "replacements": 0,
    --   "referrals": 500,
    --   "financing_revenue": 200,
    --   "service_calls": 350
    -- }
  END IF;
  
  -- Check-in tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'customers' 
                 AND column_name = 'last_checkin_date') THEN
    ALTER TABLE public.customers ADD COLUMN last_checkin_date date;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'customers' 
                 AND column_name = 'next_checkin_date') THEN
    ALTER TABLE public.customers ADD COLUMN next_checkin_date date;
  END IF;
  
  -- Referral trigger tracking
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'customers' 
                 AND column_name = 'referral_triggers_sent') THEN
    ALTER TABLE public.customers ADD COLUMN referral_triggers_sent int DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'customers' 
                 AND column_name = 'last_referral_trigger_date') THEN
    ALTER TABLE public.customers ADD COLUMN last_referral_trigger_date date;
  END IF;
  
  -- Happiness score (for referral triggers)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'customers' 
                 AND column_name = 'happiness_score') THEN
    ALTER TABLE public.customers ADD COLUMN happiness_score numeric(5,2) DEFAULT 0 CHECK (happiness_score >= 0 AND happiness_score <= 100);
  END IF;
END $$;

-- ============================================================================
-- PART 6 — REFERRAL TRIGGERS TABLE
-- ============================================================================
-- Tracks when referral requests are triggered based on customer happiness events

CREATE TABLE IF NOT EXISTS public.referral_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  
  -- Trigger reason
  trigger_reason text NOT NULL CHECK (trigger_reason IN (
    'five_star_review',
    'job_completed',
    'warranty_check_passed',
    'positive_annual_checkin',
    'high_happiness_score',
    'repeat_customer',
    'successful_warranty_claim_resolution'
  )),
  
  -- Context
  related_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  related_review_id uuid, -- References reviews if exists
  happiness_score_at_trigger numeric(5,2),
  
  -- Message sent
  referral_message_sent boolean DEFAULT false,
  referral_message_sent_at timestamptz,
  referral_message_content jsonb DEFAULT '{}'::jsonb,
  
  -- Response tracking
  customer_responded boolean DEFAULT false,
  referral_provided boolean DEFAULT false,
  referred_contact_id uuid, -- References the referred person if provided
  
  -- Reward tracking
  reward_earned numeric(12,2) DEFAULT 0,
  reward_paid boolean DEFAULT false,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for referral_triggers
CREATE INDEX IF NOT EXISTS idx_referral_triggers_customer ON public.referral_triggers(customer_id);
CREATE INDEX IF NOT EXISTS idx_referral_triggers_team ON public.referral_triggers(team_id);
CREATE INDEX IF NOT EXISTS idx_referral_triggers_reason ON public.referral_triggers(team_id, trigger_reason);
CREATE INDEX IF NOT EXISTS idx_referral_triggers_sent ON public.referral_triggers(team_id, referral_message_sent) WHERE referral_message_sent = false;

-- ============================================================================
-- PART 7 — TRIGGERS & FUNCTIONS
-- ============================================================================

-- Update updated_at timestamps
CREATE OR REPLACE FUNCTION update_warranties_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_warranties_updated_at
BEFORE UPDATE ON public.warranties
FOR EACH ROW
EXECUTE FUNCTION update_warranties_updated_at();

CREATE OR REPLACE FUNCTION update_warranty_claims_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_warranty_claims_updated_at
BEFORE UPDATE ON public.warranty_claims
FOR EACH ROW
EXECUTE FUNCTION update_warranty_claims_updated_at();

CREATE OR REPLACE FUNCTION update_customer_checkins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_customer_checkins_updated_at
BEFORE UPDATE ON public.customer_checkins
FOR EACH ROW
EXECUTE FUNCTION update_customer_checkins_updated_at();

CREATE OR REPLACE FUNCTION update_referral_triggers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_referral_triggers_updated_at
BEFORE UPDATE ON public.referral_triggers
FOR EACH ROW
EXECUTE FUNCTION update_referral_triggers_updated_at();

-- ============================================================================
-- PART 8 — WARRANTY EXPIRATION ALERT FUNCTION
-- ============================================================================
-- Finds warranties expiring within specified days and creates alerts

CREATE OR REPLACE FUNCTION get_warranties_expiring_soon(
  p_team_id uuid,
  p_days_ahead int DEFAULT 90
)
RETURNS TABLE (
  warranty_id uuid,
  customer_id uuid,
  customer_name text,
  customer_email text,
  warranty_type text,
  end_date date,
  days_until_expiration int,
  alert_type text -- '90_days', '30_days', '7_days'
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    w.id,
    w.customer_id,
    c.name,
    c.email,
    w.warranty_type,
    w.end_date,
    EXTRACT(DAY FROM (w.end_date - CURRENT_DATE))::int as days_until_expiration,
    CASE 
      WHEN EXTRACT(DAY FROM (w.end_date - CURRENT_DATE)) BETWEEN 85 AND 95 THEN '90_days'
      WHEN EXTRACT(DAY FROM (w.end_date - CURRENT_DATE)) BETWEEN 25 AND 35 THEN '30_days'
      WHEN EXTRACT(DAY FROM (w.end_date - CURRENT_DATE)) BETWEEN 1 AND 10 THEN '7_days'
      ELSE 'other'
    END as alert_type
  FROM public.warranties w
  LEFT JOIN public.customers c ON w.customer_id = c.id
  WHERE w.team_id = p_team_id
    AND w.is_active = true
    AND w.end_date IS NOT NULL
    AND w.end_date >= CURRENT_DATE
    AND w.end_date <= CURRENT_DATE + (p_days_ahead || ' days')::interval
  ORDER BY w.end_date ASC;
END;
$$;

COMMENT ON FUNCTION get_warranties_expiring_soon IS 'Block 256100: Returns warranties expiring within specified days for alert generation';

-- ============================================================================
-- PART 9 — SCHEDULE CUSTOMER CHECK-IN FUNCTION
-- ============================================================================
-- Schedules automated check-ins for customers

CREATE OR REPLACE FUNCTION schedule_customer_checkin(
  p_customer_id uuid,
  p_checkin_type text,
  p_scheduled_date date,
  p_team_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_checkin_id uuid;
  v_job_id uuid;
BEGIN
  -- Get most recent job for this customer
  SELECT id INTO v_job_id
  FROM public.jobs
  WHERE customer_id = p_customer_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Create check-in record
  INSERT INTO public.customer_checkins (
    customer_id,
    job_id,
    team_id,
    checkin_type,
    scheduled_date
  ) VALUES (
    p_customer_id,
    v_job_id,
    p_team_id,
    p_checkin_type,
    p_scheduled_date
  )
  RETURNING id INTO v_checkin_id;
  
  -- Update customer's next check-in date
  UPDATE public.customers
  SET next_checkin_date = p_scheduled_date
  WHERE id = p_customer_id;
  
  RETURN v_checkin_id;
END;
$$;

COMMENT ON FUNCTION schedule_customer_checkin IS 'Block 256100: Schedules an automated customer check-in';

-- ============================================================================
-- PART 10 — GET DUE CHECK-INS FUNCTION
-- ============================================================================
-- Returns check-ins that are due to be sent

CREATE OR REPLACE FUNCTION get_due_checkins(
  p_team_id uuid DEFAULT NULL
)
RETURNS TABLE (
  checkin_id uuid,
  customer_id uuid,
  customer_name text,
  customer_email text,
  customer_phone text,
  job_id uuid,
  checkin_type text,
  scheduled_date date,
  message_template_key text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cc.id,
    cc.customer_id,
    c.name,
    c.email,
    c.phone,
    cc.job_id,
    cc.checkin_type,
    cc.scheduled_date,
    CASE cc.checkin_type
      WHEN 'annual' THEN 'customer_checkin_annual'
      WHEN 'seasonal_spring' THEN 'customer_checkin_spring'
      WHEN 'seasonal_fall' THEN 'customer_checkin_fall'
      WHEN 'seasonal_winter' THEN 'customer_checkin_winter'
      WHEN 'storm_followup' THEN 'customer_checkin_storm'
      ELSE 'customer_checkin_general'
    END as message_template_key
  FROM public.customer_checkins cc
  JOIN public.customers c ON cc.customer_id = c.id
  WHERE cc.message_sent = false
    AND cc.scheduled_date <= CURRENT_DATE
    AND (p_team_id IS NULL OR cc.team_id = p_team_id)
  ORDER BY cc.scheduled_date ASC;
END;
$$;

COMMENT ON FUNCTION get_due_checkins IS 'Block 256100: Returns check-ins that are due to be sent';

-- ============================================================================
-- PART 11 — AI ROOF HEALTH ANALYSIS FUNCTION
-- ============================================================================
-- Processes roof health photos and returns AI analysis (integration point)

CREATE OR REPLACE FUNCTION analyze_roof_health_photo(
  p_photo_id uuid,
  p_photo_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_analysis_result jsonb;
BEGIN
  -- This is an integration point for AI analysis
  -- In production, this would call an AI service (OpenAI, Vertex AI, etc.)
  -- For now, returns a placeholder structure
  
  -- TODO: Integrate with AI service for roof health analysis
  -- Example AI service call:
  -- SELECT ai_analyze_roof_photo(p_photo_url) INTO v_analysis_result;
  
  -- Placeholder response structure
  v_analysis_result := jsonb_build_object(
    'detected_issues', jsonb_build_array(
      jsonb_build_object(
        'issue', 'lifted_shingles',
        'confidence', 0.86,
        'location', 'north_side',
        'severity', 'medium'
      )
    ),
    'health_score', 85.0,
    'recommendations', jsonb_build_array(
      jsonb_build_object(
        'action', 'repair',
        'priority', 'medium',
        'estimated_cost', 275.00,
        'description', 'Fix 2 lifted shingles on north side'
      )
    )
  );
  
  -- Update photo record with analysis
  UPDATE public.roof_health_photos
  SET 
    ai_analysis_complete = true,
    ai_analysis_date = now(),
    ai_detected_issues = v_analysis_result->'detected_issues',
    ai_health_score = (v_analysis_result->>'health_score')::numeric,
    ai_recommendations = v_analysis_result->'recommendations'
  WHERE id = p_photo_id;
  
  RETURN v_analysis_result;
END;
$$;

COMMENT ON FUNCTION analyze_roof_health_photo IS 'Block 256100: Analyzes roof health photo using AI (integration point)';

-- ============================================================================
-- PART 12 — CREATE WARRANTY CLAIM FUNCTION
-- ============================================================================
-- Creates a warranty claim with automated initial processing

CREATE OR REPLACE FUNCTION create_warranty_claim(
  p_warranty_id uuid,
  p_description text,
  p_photos text[] DEFAULT ARRAY[]::text[],
  p_issue_started_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_claim_id uuid;
  v_warranty RECORD;
  v_customer_id uuid;
  v_job_id uuid;
  v_team_id uuid;
BEGIN
  -- Get warranty info
  SELECT customer_id, job_id, team_id INTO v_customer_id, v_job_id, v_team_id
  FROM public.warranties
  WHERE id = p_warranty_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Warranty not found';
  END IF;
  
  -- Create claim
  INSERT INTO public.warranty_claims (
    warranty_id,
    customer_id,
    job_id,
    team_id,
    description,
    photos,
    issue_started_date,
    status
  ) VALUES (
    p_warranty_id,
    v_customer_id,
    v_job_id,
    v_team_id,
    p_description,
    p_photos,
    p_issue_started_date,
    'submitted'
  )
  RETURNING id INTO v_claim_id;
  
  -- TODO: Trigger AI analysis of claim for coverage likelihood
  -- TODO: Auto-assign to PM if rules match
  
  -- Update customer warranty claims count
  UPDATE public.customers
  SET warranty_claims_count = warranty_claims_count + 1
  WHERE id = v_customer_id;
  
  RETURN v_claim_id;
END;
$$;

COMMENT ON FUNCTION create_warranty_claim IS 'Block 256100: Creates a warranty claim with automated processing';

-- ============================================================================
-- PART 13 — UPDATE CUSTOMER LTV FUNCTION
-- ============================================================================
-- Updates customer lifetime value breakdown

CREATE OR REPLACE FUNCTION update_customer_ltv(
  p_customer_id uuid,
  p_category text, -- 'original_roof', 'repairs', 'maintenance', 'replacements', 'referrals', 'financing_revenue', 'service_calls'
  p_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_ltv numeric;
  v_current_breakdown jsonb;
  v_category_total numeric;
BEGIN
  -- Get current values
  SELECT lifetime_value, ltv_breakdown INTO v_current_ltv, v_current_breakdown
  FROM public.customers
  WHERE id = p_customer_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;
  
  -- Initialize breakdown if null
  IF v_current_breakdown IS NULL THEN
    v_current_breakdown := '{}'::jsonb;
  END IF;
  
  -- Get current category total
  v_category_total := COALESCE((v_current_breakdown->>p_category)::numeric, 0);
  
  -- Update category total
  v_current_breakdown := jsonb_set(
    v_current_breakdown,
    ARRAY[p_category],
    to_jsonb(v_category_total + p_amount)
  );
  
  -- Recalculate total LTV
  v_current_ltv := 
    COALESCE((v_current_breakdown->>'original_roof')::numeric, 0) +
    COALESCE((v_current_breakdown->>'repairs')::numeric, 0) +
    COALESCE((v_current_breakdown->>'maintenance')::numeric, 0) +
    COALESCE((v_current_breakdown->>'replacements')::numeric, 0) +
    COALESCE((v_current_breakdown->>'referrals')::numeric, 0) +
    COALESCE((v_current_breakdown->>'financing_revenue')::numeric, 0) +
    COALESCE((v_current_breakdown->>'service_calls')::numeric, 0);
  
  -- Update customer
  UPDATE public.customers
  SET 
    lifetime_value = v_current_ltv,
    ltv_breakdown = v_current_breakdown
  WHERE id = p_customer_id;
END;
$$;

COMMENT ON FUNCTION update_customer_ltv IS 'Block 256100: Updates customer lifetime value breakdown';

-- ============================================================================
-- PART 14 — TRIGGER REFERRAL REQUEST FUNCTION
-- ============================================================================
-- Creates a referral trigger based on customer happiness event

CREATE OR REPLACE FUNCTION trigger_referral_request(
  p_customer_id uuid,
  p_trigger_reason text,
  p_related_job_id uuid DEFAULT NULL,
  p_happiness_score numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_trigger_id uuid;
  v_team_id uuid;
  v_current_happiness numeric;
BEGIN
  -- Get customer team
  SELECT team_id, COALESCE(happiness_score, 0) INTO v_team_id, v_current_happiness
  FROM public.customers
  WHERE id = p_customer_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;
  
  -- Use provided happiness score or current
  v_current_happiness := COALESCE(p_happiness_score, v_current_happiness);
  
  -- Only trigger if happiness is high enough (threshold: 70)
  IF v_current_happiness < 70 THEN
    RETURN NULL;
  END IF;
  
  -- Create referral trigger
  INSERT INTO public.referral_triggers (
    customer_id,
    team_id,
    trigger_reason,
    related_job_id,
    happiness_score_at_trigger
  ) VALUES (
    p_customer_id,
    v_team_id,
    p_trigger_reason,
    p_related_job_id,
    v_current_happiness
  )
  RETURNING id INTO v_trigger_id;
  
  -- Update customer
  UPDATE public.customers
  SET 
    referral_triggers_sent = referral_triggers_sent + 1,
    last_referral_trigger_date = CURRENT_DATE
  WHERE id = p_customer_id;
  
  RETURN v_trigger_id;
END;
$$;

COMMENT ON FUNCTION trigger_referral_request IS 'Block 256100: Triggers a referral request based on customer happiness event';

-- ============================================================================
-- PART 15 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.warranties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranty_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roof_health_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_triggers ENABLE ROW LEVEL SECURITY;

-- Warranties policies
CREATE POLICY "warranties_select_team"
  ON public.warranties FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM public.teams t
      JOIN public.team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "warranties_insert_team"
  ON public.warranties FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM public.teams t
      JOIN public.team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "warranties_update_team"
  ON public.warranties FOR UPDATE
  USING (
    team_id IN (
      SELECT team_id FROM public.teams t
      JOIN public.team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- Warranty claims policies
CREATE POLICY "warranty_claims_select_team"
  ON public.warranty_claims FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM public.teams t
      JOIN public.team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "warranty_claims_insert_team"
  ON public.warranty_claims FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM public.teams t
      JOIN public.team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "warranty_claims_update_team"
  ON public.warranty_claims FOR UPDATE
  USING (
    team_id IN (
      SELECT team_id FROM public.teams t
      JOIN public.team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- Customer check-ins policies
CREATE POLICY "customer_checkins_select_team"
  ON public.customer_checkins FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM public.teams t
      JOIN public.team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "customer_checkins_insert_team"
  ON public.customer_checkins FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM public.teams t
      JOIN public.team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "customer_checkins_update_team"
  ON public.customer_checkins FOR UPDATE
  USING (
    team_id IN (
      SELECT team_id FROM public.teams t
      JOIN public.team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- Roof health photos policies
CREATE POLICY "roof_health_photos_select_team"
  ON public.roof_health_photos FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM public.teams t
      JOIN public.team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "roof_health_photos_insert_team"
  ON public.roof_health_photos FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM public.teams t
      JOIN public.team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- Referral triggers policies
CREATE POLICY "referral_triggers_select_team"
  ON public.referral_triggers FOR SELECT
  USING (
    team_id IN (
      SELECT team_id FROM public.teams t
      JOIN public.team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "referral_triggers_insert_team"
  ON public.referral_triggers FOR INSERT
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM public.teams t
      JOIN public.team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = auth.uid()
    )
  );

-- Service role full access
CREATE POLICY "warranties_service_role_all"
  ON public.warranties FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "warranty_claims_service_role_all"
  ON public.warranty_claims FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "customer_checkins_service_role_all"
  ON public.customer_checkins FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "roof_health_photos_service_role_all"
  ON public.roof_health_photos FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "referral_triggers_service_role_all"
  ON public.referral_triggers FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 16 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.warranties IS 'Block 256100: Comprehensive warranty tracking with coverage details';
COMMENT ON TABLE public.warranty_claims IS 'Block 256100: Warranty claim intake and automation workflow';
COMMENT ON TABLE public.customer_checkins IS 'Block 256100: Automated annual and seasonal customer check-ins';
COMMENT ON TABLE public.roof_health_photos IS 'Block 256100: AI-powered roof health monitoring via photo analysis';
COMMENT ON TABLE public.referral_triggers IS 'Block 256100: Referral request triggers based on customer happiness events';

COMMENT ON COLUMN public.warranties.coverage_details IS 'Block 256100: JSONB containing coverage items, exclusions, registration numbers, etc.';
COMMENT ON COLUMN public.warranty_claims.ai_coverage_likelihood IS 'Block 256100: AI-determined likelihood (0-100) that claim is covered';
COMMENT ON COLUMN public.roof_health_photos.ai_detected_issues IS 'Block 256100: AI-detected issues like lifted shingles, pipe boot wear, etc.';
COMMENT ON COLUMN public.customers.ltv_breakdown IS 'Block 256100: Detailed breakdown of customer lifetime value by category';





















