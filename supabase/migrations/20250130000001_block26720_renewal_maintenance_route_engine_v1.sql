-- =========================================================
-- Block 26720 — SmartSend Roofing Renewal & Maintenance Route Engine v1
-- (Turn past jobs into future money • Auto-flag re-roofs • Seasonal inspections • Maintenance routes)
-- =========================================================
-- 
-- This block unlocks a MASSIVE hidden gold mine for roofers:
-- Past customers are the highest-converting, highest-profit leads — and most roofers never follow up with them.
--
-- SmartSend will automatically:
-- - Detect when an old customer is due for a re-roof
-- - Create seasonal inspection routes
-- - Trigger maintenance reminders
-- - Build repeat revenue automatically
--
-- This turns SmartSend into the roofer's lifetime value engine, not just a lead generator.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE roofing_customers TABLE
-- ============================================================================
-- Links contacts to roofing-specific customer data
-- This creates a roofing-specific customer entity that can track lifetime value

CREATE TABLE IF NOT EXISTS public.roofing_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Customer identification
  customer_name text,
  email text,
  phone text,
  address text,
  city text,
  state text,
  zip_code text,
  
  -- Lifetime value tracking
  total_jobs_count integer DEFAULT 0,
  total_revenue numeric(12,2) DEFAULT 0,
  first_job_date date,
  last_job_date date,
  
  -- Maintenance contract status
  has_maintenance_contract boolean DEFAULT false,
  maintenance_contract_start_date date,
  maintenance_contract_end_date date,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Unique constraint: one customer per contact per workspace
  CONSTRAINT unique_customer_per_contact_workspace UNIQUE (contact_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_roofing_customers_contact ON public.roofing_customers(contact_id);
CREATE INDEX IF NOT EXISTS idx_roofing_customers_workspace ON public.roofing_customers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_roofing_customers_email ON public.roofing_customers(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_customers_zip ON public.roofing_customers(zip_code) WHERE zip_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_customers_last_job ON public.roofing_customers(last_job_date DESC NULLS LAST);

COMMENT ON TABLE public.roofing_customers IS 'Roofing-specific customer records that track lifetime value and repeat business';

-- ============================================================================
-- PART 2 — CREATE roofing_customer_roof_profile TABLE
-- ============================================================================
-- Tracks roof details for each customer property
-- Populated automatically from job completion data

CREATE TABLE IF NOT EXISTS public.roofing_customer_roof_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.roofing_customers(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Roof details
  last_roof_date date NOT NULL,
  roof_material text, -- '3_tab', 'architectural', 'metal', 'tile', 'slate', 'tpo', 'epdm', etc.
  estimated_lifespan_years integer, -- Based on material type
  roof_square_footage numeric(10,2),
  roof_pitch text, -- 'low', 'medium', 'steep'
  
  -- Replacement prediction
  next_estimated_replacement date,
  replacement_probability integer CHECK (replacement_probability >= 0 AND replacement_probability <= 100), -- 0-100%
  
  -- Maintenance tracking
  maintenance_due date,
  last_maintenance_date date,
  maintenance_frequency_months integer DEFAULT 6, -- How often maintenance is recommended
  
  -- Property address (in case customer has multiple properties)
  property_address text,
  property_city text,
  property_state text,
  property_zip_code text,
  
  -- Metadata
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roof_profile_customer ON public.roofing_customer_roof_profile(customer_id);
CREATE INDEX IF NOT EXISTS idx_roof_profile_job ON public.roofing_customer_roof_profile(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roof_profile_workspace ON public.roofing_customer_roof_profile(workspace_id);
CREATE INDEX IF NOT EXISTS idx_roof_profile_replacement_due ON public.roofing_customer_roof_profile(next_estimated_replacement) WHERE next_estimated_replacement IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roof_profile_maintenance_due ON public.roofing_customer_roof_profile(maintenance_due) WHERE maintenance_due IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roof_profile_zip ON public.roofing_customer_roof_profile(property_zip_code) WHERE property_zip_code IS NOT NULL;

-- Unique constraint: one roof profile per customer per job (if job_id is provided)
-- Allow multiple profiles per customer for different properties
CREATE UNIQUE INDEX IF NOT EXISTS idx_roof_profile_customer_job_unique 
  ON public.roofing_customer_roof_profile(customer_id, job_id) 
  WHERE job_id IS NOT NULL;

COMMENT ON TABLE public.roofing_customer_roof_profile IS 'Tracks roof details and replacement/maintenance predictions for each customer property';

-- ============================================================================
-- PART 3 — CREATE roofing_renewal_opportunities TABLE
-- ============================================================================
-- Tracks renewal, inspection, and maintenance opportunities

CREATE TABLE IF NOT EXISTS public.roofing_renewal_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.roofing_customers(id) ON DELETE CASCADE,
  roof_profile_id uuid REFERENCES public.roofing_customer_roof_profile(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Opportunity details
  opportunity_type text NOT NULL CHECK (opportunity_type IN ('reroof', 'inspection', 'maintenance')),
  recommended_date date NOT NULL,
  priority text CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  
  -- Reason/context
  reason text NOT NULL, -- e.g., "Roof lifespan reached for 3-tab", "Seasonal gutter cleaning", "Storm damage inspection"
  storm_event_id uuid, -- Reference to weather event if storm-related
  
  -- Status tracking
  status text NOT NULL CHECK (status IN ('pending', 'scheduled', 'contacted', 'completed', 'declined', 'cancelled')) DEFAULT 'pending',
  scheduled_date date,
  contacted_at timestamptz,
  completed_at timestamptz,
  declined_reason text,
  
  -- Estimated value
  estimated_value numeric(12,2), -- Estimated job value for this opportunity
  
  -- Metadata
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_renewal_opportunities_customer ON public.roofing_renewal_opportunities(customer_id);
CREATE INDEX IF NOT EXISTS idx_renewal_opportunities_workspace ON public.roofing_renewal_opportunities(workspace_id);
CREATE INDEX IF NOT EXISTS idx_renewal_opportunities_type ON public.roofing_renewal_opportunities(opportunity_type);
CREATE INDEX IF NOT EXISTS idx_renewal_opportunities_status ON public.roofing_renewal_opportunities(status);
CREATE INDEX IF NOT EXISTS idx_renewal_opportunities_recommended_date ON public.roofing_renewal_opportunities(recommended_date);
CREATE INDEX IF NOT EXISTS idx_renewal_opportunities_pending ON public.roofing_renewal_opportunities(workspace_id, status, recommended_date) WHERE status = 'pending';

COMMENT ON TABLE public.roofing_renewal_opportunities IS 'Tracks renewal, inspection, and maintenance opportunities for past customers';

-- ============================================================================
-- PART 4 — CREATE VIEW: roofing_reroof_due
-- ============================================================================
-- Calculates which roofs are due for replacement based on age and material

CREATE OR REPLACE VIEW public.roofing_reroof_due AS
SELECT
  rcp.id as roof_profile_id,
  rc.id as customer_id,
  rj.id as job_id,
  rc.workspace_id,
  rc.customer_name,
  rc.email,
  rc.phone,
  rcp.property_address,
  rcp.property_city,
  rcp.property_state,
  rcp.property_zip_code,
  rcp.last_roof_date,
  rcp.roof_material,
  rcp.estimated_lifespan_years,
  rcp.next_estimated_replacement,
  (rcp.last_roof_date + (COALESCE(rcp.estimated_lifespan_years, 20) || ' years')::interval)::date as calculated_due_date,
  current_date > (rcp.last_roof_date + (COALESCE(rcp.estimated_lifespan_years, 20) || ' years')::interval)::date as is_due,
  EXTRACT(YEAR FROM age(current_date, rcp.last_roof_date)) as roof_age_years,
  CASE
    WHEN current_date > (rcp.last_roof_date + (COALESCE(rcp.estimated_lifespan_years, 20) || ' years')::interval)::date THEN 'overdue'
    WHEN current_date >= (rcp.last_roof_date + ((COALESCE(rcp.estimated_lifespan_years, 20) - 2) || ' years')::interval)::date THEN 'due_soon'
    ELSE 'future'
  END as urgency_status
FROM public.roofing_customer_roof_profile rcp
JOIN public.roofing_customers rc ON rc.id = rcp.customer_id
LEFT JOIN public.roofing_jobs rj ON rj.id = rcp.job_id
WHERE rcp.last_roof_date IS NOT NULL;

COMMENT ON VIEW public.roofing_reroof_due IS 'View showing roofs that are due or approaching due date for replacement';

-- ============================================================================
-- PART 5 — FUNCTION: Get Material Lifespan
-- ============================================================================
-- Returns estimated lifespan in years based on roof material type

CREATE OR REPLACE FUNCTION public.get_roof_material_lifespan(p_material text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE LOWER(COALESCE(p_material, ''))
    WHEN '3_tab' THEN 15
    WHEN 'architectural' THEN 30
    WHEN 'metal' THEN 50
    WHEN 'tile' THEN 50
    WHEN 'slate' THEN 100
    WHEN 'tpo' THEN 20
    WHEN 'epdm' THEN 25
    WHEN 'modified_bitumen' THEN 20
    WHEN 'built_up' THEN 20
    WHEN 'wood_shake' THEN 30
    WHEN 'cedar' THEN 30
    ELSE 20 -- Default to 20 years if unknown
  END;
END;
$$;

COMMENT ON FUNCTION public.get_roof_material_lifespan IS 'Returns estimated lifespan in years for a given roof material type';

-- ============================================================================
-- PART 6 — FUNCTION: Populate Roof Profile from Completed Job
-- ============================================================================
-- Automatically creates/updates roof profile when a job is completed

CREATE OR REPLACE FUNCTION public.populate_roof_profile_from_job(
  p_job_id uuid,
  p_roof_material text DEFAULT NULL,
  p_square_footage numeric DEFAULT NULL,
  p_roof_pitch text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_id uuid;
  v_contact_id uuid;
  v_workspace_id uuid;
  v_job record;
  v_roof_profile_id uuid;
  v_lifespan_years integer;
  v_completion_date date;
BEGIN
  -- Get job details
  SELECT 
    j.*,
    j.contact_id,
    COALESCE(j.workspace_id, (SELECT workspace_id FROM public.workspaces LIMIT 1)) as workspace_id,
    CASE 
      WHEN j.current_stage = 'COMPLETED' OR j.status = 'completed' THEN 
        COALESCE(j.scheduled_end_date, j.updated_at::date, CURRENT_DATE)
      ELSE NULL
    END as completion_date
  INTO v_job
  FROM public.roofing_jobs j
  WHERE j.id = p_job_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found: %', p_job_id;
  END IF;
  
  -- Only process completed jobs (check both status and current_stage)
  IF COALESCE(v_job.current_stage, '') != 'COMPLETED' AND COALESCE(v_job.status, '') != 'completed' THEN
    RETURN NULL;
  END IF;
  
  v_workspace_id := v_job.workspace_id;
  v_contact_id := v_job.contact_id;
  v_completion_date := COALESCE(v_job.completion_date, CURRENT_DATE);
  
  -- Get or create customer record
  IF v_contact_id IS NOT NULL THEN
    SELECT id INTO v_customer_id
    FROM public.roofing_customers
    WHERE contact_id = v_contact_id AND workspace_id = v_workspace_id;
    
    IF NOT FOUND THEN
      -- Create customer record from contact
      INSERT INTO public.roofing_customers (
        contact_id,
        workspace_id,
        customer_name,
        email,
        phone,
        address,
        city,
        state,
        zip_code,
        first_job_date,
        last_job_date,
        total_jobs_count,
        total_revenue
      )
      SELECT 
        c.id,
        v_workspace_id,
        COALESCE(c.first_name || ' ' || c.last_name, c.name),
        c.email,
        c.phone,
        c.street,
        c.city,
        c.state,
        c.zip,
        v_completion_date,
        v_completion_date,
        1,
        COALESCE(v_job.job_value, v_job.projected_job_value, 0)
      FROM public.contacts c
      WHERE c.id = v_contact_id
      RETURNING id INTO v_customer_id;
    ELSE
      -- Update existing customer
      UPDATE public.roofing_customers
      SET
        last_job_date = v_completion_date,
        total_jobs_count = total_jobs_count + 1,
        total_revenue = total_revenue + COALESCE(v_job.job_value, v_job.projected_job_value, 0),
        updated_at = now()
      WHERE id = v_customer_id;
    END IF;
  END IF;
  
  -- If no customer created, can't create roof profile
  IF v_customer_id IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Calculate lifespan
  v_lifespan_years := public.get_roof_material_lifespan(p_roof_material);
  
  -- Create or update roof profile
  INSERT INTO public.roofing_customer_roof_profile (
    customer_id,
    job_id,
    workspace_id,
    last_roof_date,
    roof_material,
    estimated_lifespan_years,
    next_estimated_replacement,
    maintenance_due,
    roof_square_footage,
    roof_pitch,
    property_address,
    property_city,
    property_state,
    property_zip_code
  )
  VALUES (
    v_customer_id,
    p_job_id,
    v_workspace_id,
    v_completion_date,
    p_roof_material,
    v_lifespan_years,
    (v_completion_date + (v_lifespan_years || ' years')::interval)::date,
    (v_completion_date + '6 months'::interval)::date,
    p_square_footage,
    p_roof_pitch,
    v_job.address,
    NULL, -- Will be populated from customer if needed
    NULL,
    NULL
  )
  ON CONFLICT (customer_id, job_id) WHERE job_id IS NOT NULL DO UPDATE SET
    last_roof_date = v_completion_date,
    roof_material = COALESCE(p_roof_material, roofing_customer_roof_profile.roof_material),
    estimated_lifespan_years = COALESCE(v_lifespan_years, roofing_customer_roof_profile.estimated_lifespan_years),
    next_estimated_replacement = (v_completion_date + (COALESCE(v_lifespan_years, roofing_customer_roof_profile.estimated_lifespan_years) || ' years')::interval)::date,
    roof_square_footage = COALESCE(p_square_footage, roofing_customer_roof_profile.roof_square_footage),
    roof_pitch = COALESCE(p_roof_pitch, roofing_customer_roof_profile.roof_pitch),
    updated_at = now()
  RETURNING id INTO v_roof_profile_id;
  
  RETURN v_roof_profile_id;
END;
$$;

COMMENT ON FUNCTION public.populate_roof_profile_from_job IS 'Automatically creates or updates roof profile when a roofing job is completed';

-- ============================================================================
-- PART 7 — FUNCTION: Generate Renewal Opportunities
-- ============================================================================
-- Creates renewal opportunities for roofs that are due or approaching due date

CREATE OR REPLACE FUNCTION public.generate_renewal_opportunities(
  p_workspace_id uuid DEFAULT NULL,
  p_lookback_years integer DEFAULT 2
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_opportunity_count integer := 0;
  v_due_record record;
BEGIN
  -- Find roofs that are due or will be due within lookback period
  FOR v_due_record IN
    SELECT DISTINCT
      rcp.id as roof_profile_id,
      rc.id as customer_id,
      rcp.job_id,
      rc.workspace_id,
      rcp.roof_material,
      rcp.next_estimated_replacement,
      rcp.last_roof_date
    FROM public.roofing_reroof_due rrd
    JOIN public.roofing_customer_roof_profile rcp ON rcp.id = rrd.roof_profile_id
    JOIN public.roofing_customers rc ON rc.id = rrd.customer_id
    WHERE 
      (p_workspace_id IS NULL OR rc.workspace_id = p_workspace_id)
      AND rrd.is_due = true
      AND rrd.roof_age_years >= (COALESCE(rcp.estimated_lifespan_years, 20) - p_lookback_years)
      AND NOT EXISTS (
        SELECT 1 FROM public.roofing_renewal_opportunities rro
        WHERE rro.roof_profile_id = rcp.id
        AND rro.opportunity_type = 'reroof'
        AND rro.status IN ('pending', 'scheduled', 'contacted')
      )
  LOOP
    -- Create renewal opportunity
    INSERT INTO public.roofing_renewal_opportunities (
      customer_id,
      roof_profile_id,
      job_id,
      workspace_id,
      opportunity_type,
      recommended_date,
      priority,
      reason,
      status
    )
    VALUES (
      v_due_record.customer_id,
      v_due_record.roof_profile_id,
      v_due_record.job_id,
      v_due_record.workspace_id,
      'reroof',
      v_due_record.next_estimated_replacement,
      CASE
        WHEN current_date > v_due_record.next_estimated_replacement THEN 'urgent'
        WHEN current_date >= (v_due_record.next_estimated_replacement - '6 months'::interval) THEN 'high'
        ELSE 'medium'
      END,
      format('Roof lifespan reached for %s (installed %s)', 
        COALESCE(v_due_record.roof_material, 'unknown material'),
        v_due_record.last_roof_date
      ),
      'pending'
    );
    
    v_opportunity_count := v_opportunity_count + 1;
  END LOOP;
  
  RETURN v_opportunity_count;
END;
$$;

COMMENT ON FUNCTION public.generate_renewal_opportunities IS 'Generates renewal opportunities for roofs that are due or approaching due date';

-- ============================================================================
-- PART 8 — FUNCTION: Generate Seasonal Maintenance Opportunities
-- ============================================================================
-- Creates maintenance opportunities for spring (March) and fall (September)

CREATE OR REPLACE FUNCTION public.generate_seasonal_maintenance_opportunities(
  p_workspace_id uuid DEFAULT NULL,
  p_season text DEFAULT NULL -- 'spring' or 'fall', NULL for current season
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_opportunity_count integer := 0;
  v_target_month integer;
  v_target_year integer;
  v_target_date date;
  v_customer_record record;
BEGIN
  -- Determine target date based on season
  IF p_season IS NULL THEN
    -- Auto-detect: March for spring, September for fall
    IF EXTRACT(MONTH FROM current_date) BETWEEN 1 AND 5 THEN
      v_target_month := 3; -- March
    ELSE
      v_target_month := 9; -- September
    END IF;
  ELSIF LOWER(p_season) = 'spring' THEN
    v_target_month := 3;
  ELSIF LOWER(p_season) = 'fall' THEN
    v_target_month := 9;
  ELSE
    RAISE EXCEPTION 'Invalid season: %. Must be "spring" or "fall"', p_season;
  END IF;
  
  v_target_year := EXTRACT(YEAR FROM current_date);
  v_target_date := make_date(v_target_year, v_target_month, 15); -- Mid-month
  
  -- Find customers with roofs that need maintenance
  FOR v_customer_record IN
    SELECT DISTINCT
      rc.id as customer_id,
      rcp.id as roof_profile_id,
      rcp.job_id,
      rc.workspace_id,
      rcp.property_address,
      rcp.property_city,
      rcp.property_state,
      rcp.property_zip_code
    FROM public.roofing_customers rc
    JOIN public.roofing_customer_roof_profile rcp ON rcp.customer_id = rc.id
    WHERE 
      (p_workspace_id IS NULL OR rc.workspace_id = p_workspace_id)
      AND rcp.last_roof_date IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.roofing_renewal_opportunities rro
        WHERE rro.customer_id = rc.id
        AND rro.opportunity_type = 'maintenance'
        AND rro.recommended_date = v_target_date
        AND rro.status IN ('pending', 'scheduled', 'contacted')
      )
  LOOP
    -- Create maintenance opportunity
    INSERT INTO public.roofing_renewal_opportunities (
      customer_id,
      roof_profile_id,
      job_id,
      workspace_id,
      opportunity_type,
      recommended_date,
      priority,
      reason,
      status
    )
    VALUES (
      v_customer_record.customer_id,
      v_customer_record.roof_profile_id,
      v_customer_record.job_id,
      v_customer_record.workspace_id,
      'maintenance',
      v_target_date,
      'medium',
      format('Seasonal %s maintenance - Gutter cleaning and roof tune-up', 
        CASE WHEN v_target_month = 3 THEN 'spring' ELSE 'fall' END
      ),
      'pending'
    );
    
    v_opportunity_count := v_opportunity_count + 1;
  END LOOP;
  
  RETURN v_opportunity_count;
END;
$$;

COMMENT ON FUNCTION public.generate_seasonal_maintenance_opportunities IS 'Generates seasonal maintenance opportunities for spring (March) and fall (September)';

-- ============================================================================
-- PART 9 — TRIGGERS: Auto-update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_roofing_customers_updated_at
BEFORE UPDATE ON public.roofing_customers
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_roof_profile_updated_at
BEFORE UPDATE ON public.roofing_customer_roof_profile
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_renewal_opportunities_updated_at
BEFORE UPDATE ON public.roofing_renewal_opportunities
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- PART 10 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.roofing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_customer_roof_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_renewal_opportunities ENABLE ROW LEVEL SECURITY;

-- Policy: Users can access customers in their workspace
CREATE POLICY "Users can access customers in their workspace"
  ON public.roofing_customers FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can access roof profiles in their workspace"
  ON public.roofing_customer_roof_profile FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can access renewal opportunities in their workspace"
  ON public.roofing_renewal_opportunities FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Service role has full access
CREATE POLICY "Service role full access to roofing_customers"
  ON public.roofing_customers FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to roof_profile"
  ON public.roofing_customer_roof_profile FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to renewal_opportunities"
  ON public.roofing_renewal_opportunities FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 11 — TRIGGER: Auto-populate roof profile on job completion
-- ============================================================================
-- Automatically creates roof profile when a roofing job is marked as completed

CREATE OR REPLACE FUNCTION public.handle_job_completion_for_renewals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_roof_material text;
  v_square_footage numeric;
BEGIN
  -- Only process when job status changes to 'completed' or stage changes to 'COMPLETED'
  IF (OLD.status = NEW.status AND OLD.current_stage = NEW.current_stage) THEN
    RETURN NEW;
  END IF;
  
  -- Check if job is completed (either via status='completed' or current_stage='COMPLETED')
  IF (NEW.status = 'completed' OR NEW.current_stage = 'COMPLETED') THEN
    -- Try to extract roof material from job metadata or notes
    -- This can be enhanced to pull from job details, proposals, etc.
    v_roof_material := NULL; -- Will default to 20 years if not provided
    v_square_footage := NULL;
    
    -- Call function to populate roof profile
    PERFORM public.populate_roof_profile_from_job(
      p_job_id := NEW.id,
      p_roof_material := v_roof_material,
      p_square_footage := v_square_footage,
      p_roof_pitch := NULL
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on roofing_jobs table
-- Note: This assumes roofing_jobs has both 'status' and 'current_stage' columns
-- If only one exists, adjust the trigger accordingly

DROP TRIGGER IF EXISTS trg_job_completion_renewals ON public.roofing_jobs;
CREATE TRIGGER trg_job_completion_renewals
AFTER UPDATE OF status, current_stage ON public.roofing_jobs
FOR EACH ROW
WHEN (
  (NEW.status = 'completed' OR NEW.current_stage = 'COMPLETED')
  AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.current_stage IS DISTINCT FROM NEW.current_stage)
)
EXECUTE FUNCTION public.handle_job_completion_for_renewals();

COMMENT ON FUNCTION public.handle_job_completion_for_renewals IS 'Trigger function that automatically creates roof profile when a job is completed';

-- ============================================================================
-- PART 12 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_customers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_customer_roof_profile TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_renewal_opportunities TO authenticated;
GRANT SELECT ON public.roofing_reroof_due TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_roof_material_lifespan(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.populate_roof_profile_from_job(uuid, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_renewal_opportunities(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_seasonal_maintenance_opportunities(uuid, text) TO authenticated;



































