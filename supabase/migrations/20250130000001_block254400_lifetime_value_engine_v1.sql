-- ============================================================
-- Block 254400 — SmartSend Lifetime Value Engine v1
-- Customer Database, Referral Tracking, Repeat Jobs, Warranty Expiration Alerts, Upsell Recommendations
-- ============================================================
-- 
-- This block turns SmartSend into the customer lifetime value machine that roofing companies have NEVER had.
-- 
-- Every roofer loses money because they:
-- - never follow up with past customers
-- - forget warranties
-- - forget to offer annual tune-ups
-- - don't track referrals
-- - don't build a customer database
-- - don't know who will need a roof soon
-- - don't do gutter cleaning reminders
-- - don't upsell attic ventilation
-- - don't offer upgrades at the right time
-- - never collect repeat revenue
-- 
-- SmartSend FIXES ALL OF THIS. Automatically.
-- ============================================================

-- ============================================================================
-- PART 1 — CUSTOMERS TABLE (Homeowner Master Database)
-- ============================================================================
-- Auto-built from leads, jobs, proposals, warranty claims, service requests, referrals
-- Each homeowner gets a deep history

CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  
  -- Contact info (normalized from multiple sources)
  name text,
  phone text,
  email text,
  address text,
  city text,
  state text,
  zip_code text,
  
  -- Customer metrics (auto-calculated)
  total_jobs int DEFAULT 0,
  lifetime_value numeric(12,2) DEFAULT 0,
  first_job_date date,
  last_job_date date,
  last_contact_date timestamptz,
  
  -- Referral tracking
  referral_count int DEFAULT 0,
  referral_revenue numeric(12,2) DEFAULT 0,
  
  -- Warranty info (denormalized for quick access)
  active_warranties_count int DEFAULT 0,
  warranty_expiring_soon boolean DEFAULT false,
  next_warranty_expiration date,
  
  -- Maintenance tracking
  last_maintenance_date date,
  next_maintenance_due date,
  maintenance_frequency_days int DEFAULT 365, -- Default: yearly
  
  -- Roof info (for age-based alerts)
  roof_install_date date,
  roof_age_years int GENERATED ALWAYS AS (
    CASE 
      WHEN roof_install_date IS NOT NULL 
      THEN EXTRACT(YEAR FROM age(current_date, roof_install_date))
      ELSE NULL
    END
  ) STORED,
  roof_material text,
  roof_squares numeric(10,2),
  
  -- Property info (for storm alerts)
  property_latitude numeric(10,8),
  property_longitude numeric(11,8),
  
  -- Engagement status
  engagement_status text DEFAULT 'active' CHECK (engagement_status IN (
    'active',
    'inactive',
    'do_not_contact',
    'lost'
  )),
  
  -- Metadata
  notes text,
  tags text[],
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for customers
CREATE INDEX IF NOT EXISTS idx_customers_team ON public.customers(team_id);
CREATE INDEX IF NOT EXISTS idx_customers_company ON public.customers(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_address ON public.customers(address) WHERE address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_lifetime_value ON public.customers(team_id, lifetime_value DESC);
CREATE INDEX IF NOT EXISTS idx_customers_warranty_expiring ON public.customers(team_id, next_warranty_expiration) WHERE warranty_expiring_soon = true;
CREATE INDEX IF NOT EXISTS idx_customers_maintenance_due ON public.customers(team_id, next_maintenance_due) WHERE next_maintenance_due IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_roof_age ON public.customers(team_id, roof_age_years) WHERE roof_install_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_location ON public.customers(property_latitude, property_longitude) WHERE property_latitude IS NOT NULL AND property_longitude IS NOT NULL;

-- Unique constraint: one customer per team per email/phone/address
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_team_email ON public.customers(team_id, lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_team_phone ON public.customers(team_id, phone) WHERE phone IS NOT NULL;

-- ============================================================================
-- PART 2 — REFERRALS TABLE
-- ============================================================================
-- Tracks every referral from customers

CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  
  -- Referred person info
  referred_name text NOT NULL,
  referred_phone text,
  referred_email text,
  referred_address text,
  
  -- Referral tracking
  status text DEFAULT 'new' CHECK (status IN (
    'new',
    'contacted',
    'qualified',
    'won',
    'lost',
    'closed'
  )),
  
  -- Conversion tracking
  converted_to_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  converted_to_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  converted_to_roofing_job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  
  -- Reward tracking (future version)
  reward_earned numeric(12,2) DEFAULT 0,
  reward_paid boolean DEFAULT false,
  reward_paid_date date,
  
  -- Metadata
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for referrals
CREATE INDEX IF NOT EXISTS idx_referrals_customer ON public.referrals(customer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_team ON public.referrals(team_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON public.referrals(team_id, status);
CREATE INDEX IF NOT EXISTS idx_referrals_converted_lead ON public.referrals(converted_to_lead_id) WHERE converted_to_lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_referrals_converted_job ON public.referrals(converted_to_job_id) WHERE converted_to_job_id IS NOT NULL;

-- ============================================================================
-- PART 3 — CUSTOMER EVENTS TABLE
-- ============================================================================
-- Tracks all customer lifecycle events (warranty expiring, storm alerts, maintenance due, etc.)

CREATE TABLE IF NOT EXISTS public.customer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  
  -- Event classification
  event_type text NOT NULL CHECK (event_type IN (
    'warranty_expiring',
    'warranty_expired',
    'storm_alert',
    'maintenance_due',
    'roof_age_alert',
    'upsell_opportunity',
    're_engagement',
    'referral_request',
    'anniversary',
    'custom'
  )),
  
  -- Event details
  title text NOT NULL,
  description text,
  details jsonb DEFAULT '{}'::jsonb,
  
  -- Action tracking
  action_required boolean DEFAULT true,
  action_taken boolean DEFAULT false,
  action_taken_at timestamptz,
  action_taken_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Priority and timing
  priority text DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  event_date date,
  due_date date,
  
  -- Related entities
  related_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  related_roofing_job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  related_warranty_id uuid, -- References warranties table if exists
  
  -- Status
  status text DEFAULT 'pending' CHECK (status IN (
    'pending',
    'in_progress',
    'completed',
    'dismissed',
    'expired'
  )),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for customer_events
CREATE INDEX IF NOT EXISTS idx_customer_events_customer ON public.customer_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_events_team ON public.customer_events(team_id);
CREATE INDEX IF NOT EXISTS idx_customer_events_type ON public.customer_events(team_id, event_type);
CREATE INDEX IF NOT EXISTS idx_customer_events_status ON public.customer_events(team_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_customer_events_due_date ON public.customer_events(team_id, due_date) WHERE due_date IS NOT NULL AND status = 'pending';
CREATE INDEX IF NOT EXISTS idx_customer_events_priority ON public.customer_events(team_id, priority, due_date) WHERE status = 'pending';

-- ============================================================================
-- PART 4 — UPSELL RECOMMENDATIONS TABLE
-- ============================================================================
-- AI-powered upsell recommendations based on customer data

CREATE TABLE IF NOT EXISTS public.upsell_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  
  -- Recommendation details
  recommendation text NOT NULL, -- e.g., "Ridge vent upgrade"
  reason text NOT NULL, -- e.g., "Improves energy efficiency"
  category text CHECK (category IN (
    'ventilation',
    'gutter_system',
    'underlayment',
    'material_upgrade',
    'maintenance',
    'warranty_extension',
    'other'
  )),
  
  -- AI scoring
  confidence_score numeric(5,2) DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  estimated_value numeric(12,2),
  estimated_profit_margin numeric(5,2),
  
  -- Context data (what AI used to make recommendation)
  context_data jsonb DEFAULT '{}'::jsonb, -- {house_age, roof_material, regional_weather, attic_type, roof_pitch, home_value, etc.}
  
  -- Status tracking
  status text DEFAULT 'pending' CHECK (status IN (
    'pending',
    'presented',
    'accepted',
    'declined',
    'scheduled',
    'completed'
  )),
  
  -- Conversion tracking
  converted_to_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  converted_to_roofing_job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  converted_value numeric(12,2),
  
  -- Timestamps
  presented_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for upsell_recommendations
CREATE INDEX IF NOT EXISTS idx_upsell_recommendations_customer ON public.upsell_recommendations(customer_id);
CREATE INDEX IF NOT EXISTS idx_upsell_recommendations_team ON public.upsell_recommendations(team_id);
CREATE INDEX IF NOT EXISTS idx_upsell_recommendations_status ON public.upsell_recommendations(team_id, status);
CREATE INDEX IF NOT EXISTS idx_upsell_recommendations_confidence ON public.upsell_recommendations(team_id, confidence_score DESC) WHERE status = 'pending';

-- ============================================================================
-- PART 5 — CUSTOMER-JOB LINKING TABLE
-- ============================================================================
-- Links customers to all their jobs (for easy querying)

CREATE TABLE IF NOT EXISTS public.customer_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  
  -- Job references (flexible - can link to either jobs or roofing_jobs)
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  roofing_job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  proposal_id uuid, -- References proposals if exists
  
  -- Job summary (denormalized for quick access)
  job_type text,
  job_value numeric(12,2),
  job_status text,
  job_completed_date date,
  
  -- Ensure at least one job reference
  CONSTRAINT customer_job_has_reference CHECK (
    job_id IS NOT NULL OR roofing_job_id IS NOT NULL OR lead_id IS NOT NULL
  ),
  
  created_at timestamptz DEFAULT now()
);

-- Indexes for customer_jobs
CREATE INDEX IF NOT EXISTS idx_customer_jobs_customer ON public.customer_jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_jobs_team ON public.customer_jobs(team_id);
CREATE INDEX IF NOT EXISTS idx_customer_jobs_job ON public.customer_jobs(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_jobs_roofing_job ON public.customer_jobs(roofing_job_id) WHERE roofing_job_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_jobs_job ON public.customer_jobs(customer_id, job_id) WHERE job_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_jobs_roofing_job ON public.customer_jobs(customer_id, roofing_job_id) WHERE roofing_job_id IS NOT NULL;

-- ============================================================================
-- PART 6 — FUNCTIONS: Auto-Build Customer Database
-- ============================================================================

-- Function: Find or create customer from contact info
CREATE OR REPLACE FUNCTION public.find_or_create_customer(
  p_team_id uuid,
  p_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_company_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_customer_id uuid;
BEGIN
  -- Try to find existing customer by email, phone, or address
  SELECT id INTO v_customer_id
  FROM public.customers
  WHERE team_id = p_team_id
    AND (
      (p_email IS NOT NULL AND lower(email) = lower(p_email))
      OR (p_phone IS NOT NULL AND phone = p_phone)
      OR (p_address IS NOT NULL AND address = p_address)
    )
  LIMIT 1;
  
  -- If not found, create new customer
  IF v_customer_id IS NULL THEN
    INSERT INTO public.customers (
      team_id,
      company_id,
      name,
      email,
      phone,
      address
    )
    VALUES (
      p_team_id,
      p_company_id,
      p_name,
      p_email,
      p_phone,
      p_address
    )
    RETURNING id INTO v_customer_id;
  ELSE
    -- Update existing customer with any new info
    UPDATE public.customers
    SET
      name = COALESCE(p_name, name),
      email = COALESCE(p_email, email),
      phone = COALESCE(p_phone, phone),
      address = COALESCE(p_address, address),
      company_id = COALESCE(p_company_id, company_id),
      updated_at = now()
    WHERE id = v_customer_id;
  END IF;
  
  RETURN v_customer_id;
END;
$$;

-- Function: Sync customer from lead
CREATE OR REPLACE FUNCTION public.sync_customer_from_lead(p_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_lead_record RECORD;
  v_customer_id uuid;
  v_team_id uuid;
BEGIN
  -- Get lead info
  SELECT 
    l.*,
    COALESCE(l.workspace_id, t.team_id) as team_id
  INTO v_lead_record
  FROM public.leads l
  LEFT JOIN public.teams t ON t.id = l.team_id
  WHERE l.id = p_lead_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Find or create customer
  v_customer_id := public.find_or_create_customer(
    p_team_id := v_lead_record.team_id,
    p_name := COALESCE(
      CONCAT(v_lead_record.first_name, ' ', v_lead_record.last_name),
      v_lead_record.first_name,
      v_lead_record.last_name
    ),
    p_email := v_lead_record.email,
    p_phone := v_lead_record.phone
  );
  
  -- Link lead to customer
  INSERT INTO public.customer_jobs (customer_id, team_id, lead_id)
  VALUES (v_customer_id, v_lead_record.team_id, p_lead_id)
  ON CONFLICT DO NOTHING;
  
  RETURN v_customer_id;
END;
$$;

-- Function: Sync customer from job
CREATE OR REPLACE FUNCTION public.sync_customer_from_job(p_job_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_record RECORD;
  v_customer_id uuid;
BEGIN
  -- Get job info (try both jobs and roofing_jobs)
  SELECT 
    j.id,
    j.team_id,
    j.lead_id,
    j.contract_value as job_value,
    j.stage as job_status,
    l.email,
    l.phone,
    l.first_name,
    l.last_name
  INTO v_job_record
  FROM public.jobs j
  LEFT JOIN public.leads l ON l.id = j.lead_id
  WHERE j.id = p_job_id;
  
  -- If not found in jobs, try roofing_jobs
  IF NOT FOUND THEN
    SELECT 
      rj.id,
      rj.workspace_id as team_id,
      rj.lead_id,
      rj.job_value,
      rj.status as job_status,
      l.email,
      l.phone,
      l.first_name,
      l.last_name
    INTO v_job_record
    FROM public.roofing_jobs rj
    LEFT JOIN public.leads l ON l.id = rj.lead_id
    WHERE rj.id = p_job_id;
  END IF;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Find or create customer
  v_customer_id := public.find_or_create_customer(
    p_team_id := v_job_record.team_id,
    p_name := COALESCE(
      CONCAT(v_job_record.first_name, ' ', v_job_record.last_name),
      v_job_record.first_name,
      v_job_record.last_name
    ),
    p_email := v_job_record.email,
    p_phone := v_job_record.phone
  );
  
  -- Link job to customer
  IF EXISTS (SELECT 1 FROM public.jobs WHERE id = p_job_id) THEN
    INSERT INTO public.customer_jobs (customer_id, team_id, job_id, job_value, job_status)
    VALUES (v_customer_id, v_job_record.team_id, p_job_id, v_job_record.job_value, v_job_record.job_status)
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.customer_jobs (customer_id, team_id, roofing_job_id, job_value, job_status)
    VALUES (v_customer_id, v_job_record.team_id, p_job_id, v_job_record.job_value, v_job_record.job_status)
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Update customer metrics
  UPDATE public.customers
  SET
    total_jobs = (
      SELECT COUNT(*) 
      FROM public.customer_jobs 
      WHERE customer_id = v_customer_id
    ),
    lifetime_value = (
      SELECT COALESCE(SUM(job_value), 0)
      FROM public.customer_jobs
      WHERE customer_id = v_customer_id AND job_value IS NOT NULL
    ),
    last_job_date = (
      SELECT MAX(created_at::date)
      FROM public.customer_jobs
      WHERE customer_id = v_customer_id
    ),
    updated_at = now()
  WHERE id = v_customer_id;
  
  RETURN v_customer_id;
END;
$$;

-- ============================================================================
-- PART 7 — FUNCTIONS: Referral Tracking
-- ============================================================================

-- Function: Create referral
CREATE OR REPLACE FUNCTION public.create_referral(
  p_customer_id uuid,
  p_referred_name text,
  p_referred_phone text DEFAULT NULL,
  p_referred_email text DEFAULT NULL,
  p_referred_address text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_referral_id uuid;
  v_team_id uuid;
BEGIN
  -- Get team_id from customer
  SELECT team_id INTO v_team_id
  FROM public.customers
  WHERE id = p_customer_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;
  
  -- Create referral
  INSERT INTO public.referrals (
    customer_id,
    team_id,
    referred_name,
    referred_phone,
    referred_email,
    referred_address
  )
  VALUES (
    p_customer_id,
    v_team_id,
    p_referred_name,
    p_referred_phone,
    p_referred_email,
    p_referred_address
  )
  RETURNING id INTO v_referral_id;
  
  -- Update customer referral count
  UPDATE public.customers
  SET referral_count = referral_count + 1
  WHERE id = p_customer_id;
  
  RETURN v_referral_id;
END;
$$;

-- Function: Mark referral as converted
CREATE OR REPLACE FUNCTION public.mark_referral_converted(
  p_referral_id uuid,
  p_lead_id uuid DEFAULT NULL,
  p_job_id uuid DEFAULT NULL,
  p_roofing_job_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_customer_id uuid;
  v_job_value numeric;
BEGIN
  -- Update referral
  UPDATE public.referrals
  SET
    status = 'won',
    converted_to_lead_id = COALESCE(p_lead_id, converted_to_lead_id),
    converted_to_job_id = COALESCE(p_job_id, converted_to_job_id),
    converted_to_roofing_job_id = COALESCE(p_roofing_job_id, converted_to_roofing_job_id),
    updated_at = now()
  WHERE id = p_referral_id
  RETURNING customer_id INTO v_customer_id;
  
  -- Get job value if job provided
  IF p_job_id IS NOT NULL THEN
    SELECT contract_value INTO v_job_value
    FROM public.jobs
    WHERE id = p_job_id;
  ELSIF p_roofing_job_id IS NOT NULL THEN
    SELECT job_value INTO v_job_value
    FROM public.roofing_jobs
    WHERE id = p_roofing_job_id;
  END IF;
  
  -- Update customer referral revenue
  IF v_job_value IS NOT NULL THEN
    UPDATE public.customers
    SET referral_revenue = referral_revenue + v_job_value
    WHERE id = v_customer_id;
  END IF;
END;
$$;

-- ============================================================================
-- PART 8 — FUNCTIONS: Repeat Job Automation
-- ============================================================================

-- Function: Check for roof age alerts (10-20 years)
CREATE OR REPLACE FUNCTION public.check_roof_age_alerts(p_team_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Create events for roofs that are 10+ years old
  INSERT INTO public.customer_events (
    customer_id,
    team_id,
    event_type,
    title,
    description,
    priority,
    event_date,
    due_date,
    details
  )
  SELECT
    c.id,
    c.team_id,
    'roof_age_alert',
    'Roof Age Alert: ' || c.roof_age_years || ' years old',
    'Customer roof installed ' || c.roof_install_date || ' — now ' || c.roof_age_years || ' years old. Recommend inspection + maintenance.',
    CASE 
      WHEN c.roof_age_years >= 18 THEN 'urgent'
      WHEN c.roof_age_years >= 15 THEN 'high'
      WHEN c.roof_age_years >= 10 THEN 'medium'
      ELSE 'low'
    END,
    current_date,
    current_date + interval '30 days',
    jsonb_build_object(
      'roof_age_years', c.roof_age_years,
      'roof_install_date', c.roof_install_date,
      'roof_material', c.roof_material
    )
  FROM public.customers c
  WHERE c.team_id = p_team_id
    AND c.roof_install_date IS NOT NULL
    AND c.roof_age_years >= 10
    AND c.roof_age_years <= 20
    AND c.engagement_status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.customer_events ce
      WHERE ce.customer_id = c.id
        AND ce.event_type = 'roof_age_alert'
        AND ce.status = 'pending'
        AND ce.created_at > current_date - interval '90 days'
    );
END;
$$;

-- Function: Check for warranty expiration (30 days before)
CREATE OR REPLACE FUNCTION public.check_warranty_expiration_alerts(p_team_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Create events for warranties expiring in 30 days
  INSERT INTO public.customer_events (
    customer_id,
    team_id,
    event_type,
    title,
    description,
    priority,
    event_date,
    due_date,
    details
  )
  SELECT
    c.id,
    c.team_id,
    'warranty_expiring',
    'Warranty Expiring in 30 Days',
    'Warranty for customer expires on ' || c.next_warranty_expiration || '. Offer extended warranty upsell.',
    'high',
    current_date,
    c.next_warranty_expiration,
    jsonb_build_object(
      'warranty_expiration_date', c.next_warranty_expiration,
      'active_warranties_count', c.active_warranties_count
    )
  FROM public.customers c
  WHERE c.team_id = p_team_id
    AND c.next_warranty_expiration IS NOT NULL
    AND c.next_warranty_expiration BETWEEN current_date AND current_date + interval '30 days'
    AND c.engagement_status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.customer_events ce
      WHERE ce.customer_id = c.id
        AND ce.event_type = 'warranty_expiring'
        AND ce.status = 'pending'
        AND ce.details->>'warranty_expiration_date' = c.next_warranty_expiration::text
    );
  
  -- Update warranty_expiring_soon flag
  UPDATE public.customers
  SET warranty_expiring_soon = true
  WHERE team_id = p_team_id
    AND next_warranty_expiration IS NOT NULL
    AND next_warranty_expiration BETWEEN current_date AND current_date + interval '30 days';
END;
$$;

-- Function: Check for maintenance due
CREATE OR REPLACE FUNCTION public.check_maintenance_due(p_team_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Create events for maintenance due
  INSERT INTO public.customer_events (
    customer_id,
    team_id,
    event_type,
    title,
    description,
    priority,
    event_date,
    due_date,
    details
  )
  SELECT
    c.id,
    c.team_id,
    'maintenance_due',
    'Annual Maintenance Due',
    'It''s time for annual roof tune-up. This includes: sealing exposed nails, resecuring vents, clearing debris, minor repairs.',
    'medium',
    current_date,
    c.next_maintenance_due,
    jsonb_build_object(
      'last_maintenance_date', c.last_maintenance_date,
      'next_maintenance_due', c.next_maintenance_due,
      'maintenance_frequency_days', c.maintenance_frequency_days
    )
  FROM public.customers c
  WHERE c.team_id = p_team_id
    AND c.next_maintenance_due IS NOT NULL
    AND c.next_maintenance_due <= current_date + interval '14 days'
    AND c.engagement_status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.customer_events ce
      WHERE ce.customer_id = c.id
        AND ce.event_type = 'maintenance_due'
        AND ce.status = 'pending'
        AND ce.created_at > current_date - interval '30 days'
    );
END;
$$;

-- ============================================================================
-- PART 9 — FUNCTIONS: AI Upsell Recommendations
-- ============================================================================

-- Function: Generate upsell recommendations (simplified - can be enhanced with AI)
CREATE OR REPLACE FUNCTION public.generate_upsell_recommendations(p_team_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_customer RECORD;
  v_recommendations text[];
  v_reason text;
  v_category text;
  v_confidence numeric;
  v_estimated_value numeric;
BEGIN
  -- Loop through active customers
  FOR v_customer IN
    SELECT *
    FROM public.customers
    WHERE team_id = p_team_id
      AND engagement_status = 'active'
  LOOP
    v_recommendations := ARRAY[]::text[];
    
    -- Recommendation 1: Ridge vent upgrade (if no recent ventilation work)
    IF v_customer.roof_age_years IS NOT NULL AND v_customer.roof_age_years > 5 THEN
      v_recommendations := array_append(v_recommendations, 'ridge_vent_upgrade');
    END IF;
    
    -- Recommendation 2: Gutter guards (if heavy tree coverage - would need metadata)
    IF v_customer.metadata->>'tree_coverage' = 'heavy' THEN
      v_recommendations := array_append(v_recommendations, 'gutter_guards');
    END IF;
    
    -- Recommendation 3: Underlayment upgrade (if region has heavy rain - would need metadata)
    IF v_customer.metadata->>'regional_weather' = 'heavy_rain' THEN
      v_recommendations := array_append(v_recommendations, 'underlayment_upgrade');
    END IF;
    
    -- Recommendation 4: Metal roof upgrade (if roof is old and high value home)
    IF v_customer.roof_age_years >= 15 AND (v_customer.metadata->>'home_value')::numeric > 300000 THEN
      v_recommendations := array_append(v_recommendations, 'metal_roof_upgrade');
    END IF;
    
    -- Create recommendations
    FOREACH v_reason IN ARRAY v_recommendations
    LOOP
      -- Set category and details based on recommendation type
      CASE v_reason
        WHEN 'ridge_vent_upgrade' THEN
          v_category := 'ventilation';
          v_reason := 'Improves energy efficiency and extends roof life';
          v_confidence := 75.0;
          v_estimated_value := 1500.00;
        WHEN 'gutter_guards' THEN
          v_category := 'gutter_system';
          v_reason := 'Customer has heavy tree coverage';
          v_confidence := 80.0;
          v_estimated_value := 800.00;
        WHEN 'underlayment_upgrade' THEN
          v_category := 'underlayment';
          v_reason := 'Region has heavy rain';
          v_confidence := 70.0;
          v_estimated_value := 2000.00;
        WHEN 'metal_roof_upgrade' THEN
          v_category := 'material_upgrade';
          v_reason := 'Long-term savings for homeowner';
          v_confidence := 65.0;
          v_estimated_value := 15000.00;
        ELSE
          v_category := 'other';
          v_reason := 'General upgrade opportunity';
          v_confidence := 50.0;
          v_estimated_value := 1000.00;
      END CASE;
      
      -- Insert recommendation if not exists
      INSERT INTO public.upsell_recommendations (
        customer_id,
        team_id,
        recommendation,
        reason,
        category,
        confidence_score,
        estimated_value,
        context_data
      )
      VALUES (
        v_customer.id,
        p_team_id,
        v_reason,
        v_reason,
        v_category,
        v_confidence,
        v_estimated_value,
        jsonb_build_object(
          'roof_age_years', v_customer.roof_age_years,
          'roof_material', v_customer.roof_material,
          'home_value', v_customer.metadata->>'home_value'
        )
      )
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;

-- ============================================================================
-- PART 10 — FUNCTIONS: Past Customer Re-Engagement
-- ============================================================================

-- Function: Create re-engagement events
CREATE OR REPLACE FUNCTION public.create_reengagement_events(p_team_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- 30-Day Check-In
  INSERT INTO public.customer_events (
    customer_id,
    team_id,
    event_type,
    title,
    description,
    priority,
    event_date,
    due_date,
    details
  )
  SELECT
    c.id,
    c.team_id,
    're_engagement',
    '30-Day Check-In',
    'How is your new roof performing? Would you like a free check-up after the first month?',
    'medium',
    c.last_job_date + interval '30 days',
    c.last_job_date + interval '45 days',
    jsonb_build_object(
      'reengagement_type', '30_day_checkin',
      'last_job_date', c.last_job_date
    )
  FROM public.customers c
  WHERE c.team_id = p_team_id
    AND c.last_job_date IS NOT NULL
    AND c.last_job_date BETWEEN current_date - interval '45 days' AND current_date - interval '30 days'
    AND c.engagement_status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.customer_events ce
      WHERE ce.customer_id = c.id
        AND ce.event_type = 're_engagement'
        AND ce.details->>'reengagement_type' = '30_day_checkin'
    );
  
  -- 1-Year Anniversary
  INSERT INTO public.customer_events (
    customer_id,
    team_id,
    event_type,
    title,
    description,
    priority,
    event_date,
    due_date,
    details
  )
  SELECT
    c.id,
    c.team_id,
    'anniversary',
    '1-Year Anniversary',
    'Happy 1-year anniversary of your new roof! We recommend a quick yearly inspection.',
    'medium',
    c.last_job_date + interval '1 year',
    c.last_job_date + interval '1 year' + interval '30 days',
    jsonb_build_object(
      'reengagement_type', '1_year_anniversary',
      'last_job_date', c.last_job_date
    )
  FROM public.customers c
  WHERE c.team_id = p_team_id
    AND c.last_job_date IS NOT NULL
    AND c.last_job_date BETWEEN current_date - interval '395 days' AND current_date - interval '365 days'
    AND c.engagement_status = 'active'
    AND NOT EXISTS (
      SELECT 1
      FROM public.customer_events ce
      WHERE ce.customer_id = c.id
        AND ce.event_type = 'anniversary'
        AND ce.details->>'reengagement_type' = '1_year_anniversary'
    );
  
  -- Referral Request (after job completion)
  INSERT INTO public.customer_events (
    customer_id,
    team_id,
    event_type,
    title,
    description,
    priority,
    event_date,
    due_date,
    details
  )
  SELECT
    c.id,
    c.team_id,
    'referral_request',
    'Referral Request',
    'Do you know anyone needing roof work? We offer rewards for referrals!',
    'low',
    c.last_job_date + interval '7 days',
    c.last_job_date + interval '30 days',
    jsonb_build_object(
      'reengagement_type', 'referral_request',
      'last_job_date', c.last_job_date
    )
  FROM public.customers c
  WHERE c.team_id = p_team_id
    AND c.last_job_date IS NOT NULL
    AND c.last_job_date BETWEEN current_date - interval '30 days' AND current_date - interval '7 days'
    AND c.engagement_status = 'active'
    AND c.referral_count = 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.customer_events ce
      WHERE ce.customer_id = c.id
        AND ce.event_type = 'referral_request'
        AND ce.status = 'pending'
    );
END;
$$;

-- ============================================================================
-- PART 11 — VIEWS: Customer Value Dashboard
-- ============================================================================

-- View: Customer Lifetime Value Summary
CREATE OR REPLACE VIEW public.v_customer_lifetime_value_summary AS
SELECT
  team_id,
  COUNT(*) as total_customers,
  COUNT(*) FILTER (WHERE lifetime_value > 0) as customers_with_revenue,
  AVG(lifetime_value) as avg_lifetime_value,
  SUM(lifetime_value) as total_lifetime_value,
  AVG(total_jobs) as avg_jobs_per_customer,
  COUNT(*) FILTER (WHERE referral_count > 0) as customers_with_referrals,
  SUM(referral_count) as total_referrals,
  SUM(referral_revenue) as total_referral_revenue,
  COUNT(*) FILTER (WHERE warranty_expiring_soon = true) as warranties_expiring_soon,
  COUNT(*) FILTER (WHERE next_maintenance_due IS NOT NULL AND next_maintenance_due <= current_date + interval '30 days') as maintenance_due_soon
FROM public.customers
GROUP BY team_id;

-- View: Customer Events Dashboard
CREATE OR REPLACE VIEW public.v_customer_events_dashboard AS
SELECT
  ce.team_id,
  ce.event_type,
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE ce.status = 'pending') as pending_events,
  COUNT(*) FILTER (WHERE ce.status = 'completed') as completed_events,
  COUNT(*) FILTER (WHERE ce.priority = 'urgent') as urgent_events,
  COUNT(*) FILTER (WHERE ce.priority = 'high') as high_priority_events,
  COUNT(*) FILTER (WHERE ce.due_date <= current_date AND ce.status = 'pending') as overdue_events
FROM public.customer_events ce
GROUP BY ce.team_id, ce.event_type;

-- View: Upsell Recommendations Summary
CREATE OR REPLACE VIEW public.v_upsell_recommendations_summary AS
SELECT
  ur.team_id,
  ur.category,
  COUNT(*) as total_recommendations,
  COUNT(*) FILTER (WHERE ur.status = 'pending') as pending_recommendations,
  COUNT(*) FILTER (WHERE ur.status = 'accepted') as accepted_recommendations,
  AVG(ur.confidence_score) as avg_confidence_score,
  SUM(ur.estimated_value) FILTER (WHERE ur.status = 'pending') as pending_estimated_value,
  SUM(ur.converted_value) FILTER (WHERE ur.status = 'completed') as converted_revenue
FROM public.upsell_recommendations ur
GROUP BY ur.team_id, ur.category;

-- View: Referral Performance
CREATE OR REPLACE VIEW public.v_referral_performance AS
SELECT
  r.team_id,
  COUNT(*) as total_referrals,
  COUNT(*) FILTER (WHERE r.status = 'new') as new_referrals,
  COUNT(*) FILTER (WHERE r.status = 'contacted') as contacted_referrals,
  COUNT(*) FILTER (WHERE r.status = 'won') as won_referrals,
  COUNT(*) FILTER (WHERE r.status = 'lost') as lost_referrals,
  SUM(r.reward_earned) as total_rewards_earned,
  SUM(r.reward_earned) FILTER (WHERE r.reward_paid = true) as total_rewards_paid,
  COUNT(*) FILTER (WHERE r.converted_to_job_id IS NOT NULL OR r.converted_to_roofing_job_id IS NOT NULL) as converted_referrals
FROM public.referrals r
GROUP BY r.team_id;

-- ============================================================================
-- PART 12 — TRIGGERS: Auto-Update Customer Metrics
-- ============================================================================

-- Trigger function: Update customer metrics when job is completed
CREATE OR REPLACE FUNCTION public.update_customer_metrics_on_job_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_customer_id uuid;
BEGIN
  -- Only trigger on job completion
  IF NEW.stage = 'completed' AND (OLD.stage IS NULL OR OLD.stage != 'completed') THEN
    -- Find customer from job
    SELECT customer_id INTO v_customer_id
    FROM public.customer_jobs
    WHERE job_id = NEW.id OR roofing_job_id = NEW.id
    LIMIT 1;
    
    IF v_customer_id IS NOT NULL THEN
      -- Update customer metrics
      UPDATE public.customers
      SET
        total_jobs = (
          SELECT COUNT(*)
          FROM public.customer_jobs
          WHERE customer_id = v_customer_id
        ),
        lifetime_value = (
          SELECT COALESCE(SUM(job_value), 0)
          FROM public.customer_jobs
          WHERE customer_id = v_customer_id AND job_value IS NOT NULL
        ),
        last_job_date = current_date,
        updated_at = now()
      WHERE id = v_customer_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Apply trigger to jobs table (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    DROP TRIGGER IF EXISTS trg_update_customer_metrics_jobs ON public.jobs;
    CREATE TRIGGER trg_update_customer_metrics_jobs
    AFTER UPDATE ON public.jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_customer_metrics_on_job_completion();
  END IF;
END $$;

-- Apply trigger to roofing_jobs table (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    DROP TRIGGER IF EXISTS trg_update_customer_metrics_roofing_jobs ON public.roofing_jobs;
    CREATE TRIGGER trg_update_customer_metrics_roofing_jobs
    AFTER UPDATE ON public.roofing_jobs
    FOR EACH ROW
    WHEN (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed'))
    EXECUTE FUNCTION public.update_customer_metrics_on_job_completion();
  END IF;
END $$;

-- ============================================================================
-- PART 13 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upsell_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Team members can access their team's data
CREATE POLICY "customers_team_access" ON public.customers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.team_id = customers.team_id
        AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "referrals_team_access" ON public.referrals
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.team_id = referrals.team_id
        AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "customer_events_team_access" ON public.customer_events
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.team_id = customer_events.team_id
        AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "upsell_recommendations_team_access" ON public.upsell_recommendations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.team_id = upsell_recommendations.team_id
        AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "customer_jobs_team_access" ON public.customer_jobs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.team_id = customer_jobs.team_id
        AND tm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 14 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.customers IS 'Block 254400: Homeowner Master Database - Auto-built from leads, jobs, proposals, warranties';
COMMENT ON TABLE public.referrals IS 'Block 254400: Referral Tracking System - Tracks every referral from customers';
COMMENT ON TABLE public.customer_events IS 'Block 254400: Customer Lifecycle Events - Warranty expiring, storm alerts, maintenance due, etc.';
COMMENT ON TABLE public.upsell_recommendations IS 'Block 254400: AI Upsell Recommendations - Automated upsell opportunities';
COMMENT ON TABLE public.customer_jobs IS 'Block 254400: Customer-Job Linking - Links customers to all their jobs';

COMMENT ON FUNCTION public.find_or_create_customer IS 'Block 254400: Find or create customer from contact info';
COMMENT ON FUNCTION public.sync_customer_from_lead IS 'Block 254400: Sync customer from lead';
COMMENT ON FUNCTION public.sync_customer_from_job IS 'Block 254400: Sync customer from job';
COMMENT ON FUNCTION public.create_referral IS 'Block 254400: Create referral record';
COMMENT ON FUNCTION public.mark_referral_converted IS 'Block 254400: Mark referral as converted to job';
COMMENT ON FUNCTION public.check_roof_age_alerts IS 'Block 254400: Check for roof age alerts (10-20 years)';
COMMENT ON FUNCTION public.check_warranty_expiration_alerts IS 'Block 254400: Check for warranty expiration alerts (30 days before)';
COMMENT ON FUNCTION public.check_maintenance_due IS 'Block 254400: Check for maintenance due';
COMMENT ON FUNCTION public.generate_upsell_recommendations IS 'Block 254400: Generate AI upsell recommendations';
COMMENT ON FUNCTION public.create_reengagement_events IS 'Block 254400: Create past customer re-engagement events';






















