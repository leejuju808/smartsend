-- =========================================================
-- Block 255600 — SmartSend Multi-Office & Franchise Engine v1
-- (Permissions, Branch Management, Shared Resources, Multi-Location Reporting, HQ Oversight)
-- =========================================================
-- 
-- This block transforms SmartSend from a single-company system 
-- into a multi-location empire platform — perfect for:
-- - Roofing companies with multiple branches
-- - Companies expanding into new cities
-- - Franchises
-- - Partners running shared operations
-- - Owners who want HQ-level control
--
-- NEW NUMBER. ZERO. BULLSHIT.

-- ============================================================================
-- PART 1 — ENSURE branches TABLE EXISTS (may already exist from Block 249000)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Support both roofing_companies and companies tables
  roofing_company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  
  -- Branch Identity
  name text NOT NULL,
  city text,
  state text,
  address text,
  phone text,
  zip_code text,
  
  -- Territory Management
  territory_zip_codes text[],             -- Array of ZIP codes for quick matching
  territory_counties text[],               -- Array of counties
  service_area_radius_miles numeric,       -- Service radius in miles from branch location
  
  -- Branch Settings
  is_active boolean DEFAULT true,
  branch_manager_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  settings jsonb DEFAULT '{}'::jsonb,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure at least one company reference exists
  CONSTRAINT branches_company_check CHECK (
    (roofing_company_id IS NOT NULL AND company_id IS NULL) OR
    (roofing_company_id IS NULL AND company_id IS NOT NULL)
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_branches_roofing_company ON public.branches(roofing_company_id, is_active) WHERE roofing_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_branches_company ON public.branches(company_id, is_active) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_branches_state ON public.branches(state);
CREATE INDEX IF NOT EXISTS idx_branches_city ON public.branches(city) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_branches_zip_codes ON public.branches USING GIN(territory_zip_codes);
CREATE INDEX IF NOT EXISTS idx_branches_counties ON public.branches USING GIN(territory_counties);
CREATE INDEX IF NOT EXISTS idx_branches_manager ON public.branches(branch_manager_user_id) WHERE branch_manager_user_id IS NOT NULL;

-- ============================================================================
-- PART 2 — ENSURE branch_users TABLE EXISTS (may already exist)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.branch_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Role within this branch
  role text NOT NULL CHECK (role IN (
    'hq_owner',        -- HQ Owner: sees all branches, edits all settings, moves resources
    'branch_manager', -- Branch Manager: sees ONLY their branch
    'sales_rep',      -- Sales Rep: only sees their leads + jobs
    'pm',             -- PM: sees jobs for their branch only
    'crew_lead',      -- Crew Lead: sees assigned jobs only
    'office',         -- Office staff: scheduling, leads, CX, inbox
    'viewer'          -- Read-only access
  )) DEFAULT 'viewer',
  
  -- Permissions (JSONB for granular control)
  permissions jsonb DEFAULT '{}'::jsonb,
  
  -- Assignment Metadata
  assigned_at timestamptz DEFAULT now(),
  assigned_by_user_id uuid REFERENCES auth.users(id),
  is_active boolean DEFAULT true,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- One membership per user per branch
  CONSTRAINT unique_user_branch UNIQUE (branch_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_users_branch ON public.branch_users(branch_id, is_active);
CREATE INDEX IF NOT EXISTS idx_branch_users_user ON public.branch_users(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_branch_users_role ON public.branch_users(branch_id, role) WHERE is_active = true;

-- ============================================================================
-- PART 3 — ENSURE branch_resources TABLE EXISTS (may already exist)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.branch_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  
  -- Resource Identity
  resource_type text NOT NULL CHECK (resource_type IN ('crew', 'vendor', 'equipment', 'storage', 'trailer', 'technician')),
  resource_id uuid NOT NULL,             -- References crews.id, vendors.id, etc.
  
  -- Sharing Configuration
  shareable boolean DEFAULT false,        -- If true, can be used by other branches
  shared_with_branches uuid[],           -- Array of branch IDs that can access this resource
  
  -- Resource Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure unique resource per branch
  CONSTRAINT unique_resource_per_branch UNIQUE (branch_id, resource_type, resource_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_resources_branch ON public.branch_resources(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_resources_type ON public.branch_resources(branch_id, resource_type);
CREATE INDEX IF NOT EXISTS idx_branch_resources_resource ON public.branch_resources(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_branch_resources_shareable ON public.branch_resources(branch_id, shareable) WHERE shareable = true;
CREATE INDEX IF NOT EXISTS idx_branch_resources_shared_with ON public.branch_resources USING GIN(shared_with_branches);

-- ============================================================================
-- PART 4 — CREATE branch_performance TABLE (NEW)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.branch_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  
  -- Date for this performance record
  date date NOT NULL,
  
  -- Lead Metrics
  leads int DEFAULT 0,
  leads_converted int DEFAULT 0,
  conversion_rate numeric(5,2),           -- Percentage
  
  -- Job Metrics
  jobs_sold int DEFAULT 0,
  jobs_completed int DEFAULT 0,
  jobs_in_progress int DEFAULT 0,
  
  -- Revenue Metrics
  revenue numeric(12,2) DEFAULT 0,
  avg_ticket numeric(12,2) DEFAULT 0,
  
  -- Efficiency Metrics
  cycle_time numeric(10,2),                -- Days to complete job (average)
  on_time_completion_rate numeric(5,2),   -- Percentage of jobs completed on time
  
  -- Quality Metrics
  customer_satisfaction_score numeric(5,2), -- 0-100
  rework_count int DEFAULT 0,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- One record per branch per date
  CONSTRAINT unique_branch_performance UNIQUE (branch_id, date)
);

CREATE INDEX IF NOT EXISTS idx_branch_performance_branch ON public.branch_performance(branch_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_branch_performance_date ON public.branch_performance(date DESC);

-- ============================================================================
-- PART 5 — CREATE franchise_templates TABLE (NEW)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.franchise_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Template Identity
  name text NOT NULL,                     -- "Standard Roofing Franchise Template"
  description text,
  
  -- Parent Company (who created the template)
  parent_company_id uuid,                 -- References roofing_companies or companies
  is_public boolean DEFAULT false,         -- If true, available to all franchises
  
  -- Template Configuration
  pricing_rules jsonb DEFAULT '{}'::jsonb,        -- Pricing rules and formulas
  workflow_templates jsonb DEFAULT '[]'::jsonb,  -- Workflow step templates
  contract_templates jsonb DEFAULT '[]'::jsonb,   -- Contract templates
  material_lists jsonb DEFAULT '[]'::jsonb,      -- Standard material lists
  sales_scripts jsonb DEFAULT '[]'::jsonb,        -- Sales script templates
  marketing_automation jsonb DEFAULT '[]'::jsonb, -- Marketing automation rules
  job_workflows jsonb DEFAULT '[]'::jsonb,       -- Job workflow templates
  permissions_config jsonb DEFAULT '{}'::jsonb,   -- Permission templates
  
  -- Template Metadata
  version int DEFAULT 1,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_franchise_templates_parent ON public.franchise_templates(parent_company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_franchise_templates_public ON public.franchise_templates(is_public, is_active) WHERE is_public = true;

-- ============================================================================
-- PART 6 — CREATE franchise_template_applications TABLE (NEW)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.franchise_template_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Template and Target
  template_id uuid NOT NULL REFERENCES public.franchise_templates(id) ON DELETE CASCADE,
  target_branch_id uuid REFERENCES public.branches(id) ON DELETE CASCADE,
  target_company_id uuid,                 -- If applying to entire company
  
  -- Application Status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applying', 'completed', 'failed')),
  applied_at timestamptz,
  applied_by_user_id uuid REFERENCES auth.users(id),
  
  -- Application Results
  applied_config jsonb DEFAULT '{}'::jsonb, -- What was actually applied
  errors jsonb DEFAULT '[]'::jsonb,          -- Any errors during application
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_franchise_template_applications_template ON public.franchise_template_applications(template_id);
CREATE INDEX IF NOT EXISTS idx_franchise_template_applications_branch ON public.franchise_template_applications(target_branch_id) WHERE target_branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_franchise_template_applications_status ON public.franchise_template_applications(status);

-- ============================================================================
-- PART 7 — ADD branch_id TO CORE TABLES (if not already added)
-- ============================================================================

-- Add branch_id to jobs (if jobs table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'jobs') THEN
    ALTER TABLE public.jobs
      ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_jobs_branch ON public.jobs(branch_id) WHERE branch_id IS NOT NULL;
  END IF;
  
  -- Add branch_id to roofing_jobs (if exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'roofing_jobs') THEN
    ALTER TABLE public.roofing_jobs
      ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_roofing_jobs_branch ON public.roofing_jobs(branch_id) WHERE branch_id IS NOT NULL;
  END IF;
END $$;

-- Add branch_id to leads (if not already added)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads') THEN
    ALTER TABLE public.leads
      ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_leads_branch ON public.leads(branch_id) WHERE branch_id IS NOT NULL;
  END IF;
END $$;

-- Add branch_id to crews (if not already added)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crews') THEN
    ALTER TABLE public.crews
      ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_crews_branch ON public.crews(branch_id) WHERE branch_id IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- PART 8 — ENHANCED LEAD ROUTING FUNCTIONS
-- ============================================================================

-- Function: Route lead to branch by ZIP code, county, or service area
CREATE OR REPLACE FUNCTION public.route_lead_to_branch_v2(
  p_company_id uuid,
  p_zip_code text DEFAULT NULL,
  p_county text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_latitude numeric DEFAULT NULL,
  p_longitude numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_branch_id uuid;
  v_branch_record record;
  v_distance numeric;
  v_best_branch_id uuid;
  v_best_distance numeric := NULL;
BEGIN
  -- Try ZIP code matching first (most reliable)
  IF p_zip_code IS NOT NULL THEN
    SELECT b.id INTO v_branch_id
    FROM public.branches b
    WHERE (b.roofing_company_id = p_company_id OR b.company_id = p_company_id)
      AND b.is_active = true
      AND (p_zip_code = ANY(b.territory_zip_codes) OR b.territory_zip_codes IS NULL)
    ORDER BY 
      CASE WHEN p_zip_code = ANY(b.territory_zip_codes) THEN 0 ELSE 1 END,
      b.created_at
    LIMIT 1;
    
    IF v_branch_id IS NOT NULL THEN
      RETURN v_branch_id;
    END IF;
  END IF;
  
  -- Try county matching
  IF p_county IS NOT NULL THEN
    SELECT b.id INTO v_branch_id
    FROM public.branches b
    WHERE (b.roofing_company_id = p_company_id OR b.company_id = p_company_id)
      AND b.is_active = true
      AND (p_county = ANY(b.territory_counties) OR b.territory_counties IS NULL)
    ORDER BY 
      CASE WHEN p_county = ANY(b.territory_counties) THEN 0 ELSE 1 END,
      b.created_at
    LIMIT 1;
    
    IF v_branch_id IS NOT NULL THEN
      RETURN v_branch_id;
    END IF;
  END IF;
  
  -- Try service area radius matching (if lat/long provided)
  IF p_latitude IS NOT NULL AND p_longitude IS NOT NULL THEN
    FOR v_branch_record IN
      SELECT 
        b.id,
        b.city,
        b.state,
        b.service_area_radius_miles,
        -- Simple distance calculation (Haversine would be better but this works)
        CASE 
          WHEN b.city = p_city AND b.state = p_state THEN 0
          ELSE NULL
        END as distance
      FROM public.branches b
      WHERE (b.roofing_company_id = p_company_id OR b.company_id = p_company_id)
        AND b.is_active = true
        AND (b.service_area_radius_miles IS NULL OR b.service_area_radius_miles > 0)
    LOOP
      -- If city/state match, use this branch
      IF v_branch_record.distance = 0 THEN
        RETURN v_branch_record.id;
      END IF;
      
      -- TODO: Add proper distance calculation using lat/long
      -- For now, if service area is defined, consider it
      IF v_branch_record.service_area_radius_miles IS NOT NULL THEN
        IF v_best_branch_id IS NULL THEN
          v_best_branch_id := v_branch_record.id;
        END IF;
      END IF;
    END LOOP;
    
    IF v_best_branch_id IS NOT NULL THEN
      RETURN v_best_branch_id;
    END IF;
  END IF;
  
  -- Fallback: city/state matching
  IF p_city IS NOT NULL AND p_state IS NOT NULL THEN
    SELECT b.id INTO v_branch_id
    FROM public.branches b
    WHERE (b.roofing_company_id = p_company_id OR b.company_id = p_company_id)
      AND b.is_active = true
      AND b.city = p_city
      AND b.state = p_state
    ORDER BY b.created_at
    LIMIT 1;
    
    IF v_branch_id IS NOT NULL THEN
      RETURN v_branch_id;
    END IF;
  END IF;
  
  -- Final fallback: first active branch for company
  SELECT b.id INTO v_branch_id
  FROM public.branches b
  WHERE (b.roofing_company_id = p_company_id OR b.company_id = p_company_id)
    AND b.is_active = true
  ORDER BY b.created_at
  LIMIT 1;
  
  RETURN v_branch_id;
END;
$$;

-- Function: Auto-route lead to branch on insert
CREATE OR REPLACE FUNCTION public.auto_route_lead_to_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_company_id uuid;
  v_branch_id uuid;
  v_zip_code text;
  v_county text;
  v_city text;
  v_state text;
BEGIN
  -- Only route if branch_id is not already set
  IF NEW.branch_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get company_id from lead
  IF NEW.roofing_company_id IS NOT NULL THEN
    v_company_id := NEW.roofing_company_id;
  ELSIF NEW.company_id IS NOT NULL THEN
    v_company_id := NEW.company_id;
  ELSIF NEW.workspace_id IS NOT NULL THEN
    -- Try to get company from workspace
    SELECT rc.id INTO v_company_id
    FROM public.roofing_companies rc
    WHERE rc.workspace_id = NEW.workspace_id
    LIMIT 1;
  END IF;
  
  IF v_company_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Extract location data from lead
  v_zip_code := COALESCE(NEW.zip_code, NEW.postal_code);
  v_county := NEW.county;
  v_city := NEW.city;
  v_state := NEW.state;
  
  -- Route to branch
  v_branch_id := public.route_lead_to_branch_v2(
    p_company_id := v_company_id,
    p_zip_code := v_zip_code,
    p_county := v_county,
    p_city := v_city,
    p_state := v_state
  );
  
  IF v_branch_id IS NOT NULL THEN
    NEW.branch_id := v_branch_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for auto-routing leads
DROP TRIGGER IF EXISTS trg_auto_route_lead_to_branch ON public.leads;
CREATE TRIGGER trg_auto_route_lead_to_branch
BEFORE INSERT ON public.leads
FOR EACH ROW
WHEN (NEW.branch_id IS NULL)
EXECUTE FUNCTION public.auto_route_lead_to_branch();

-- ============================================================================
-- PART 9 — HQ COMMAND CENTER DASHBOARD VIEWS
-- ============================================================================

-- View: HQ All Branches Summary
CREATE OR REPLACE VIEW public.v_hq_all_branches_summary AS
SELECT 
  COALESCE(b.roofing_company_id, b.company_id) AS company_id,
  COUNT(DISTINCT b.id) AS total_branches,
  COUNT(DISTINCT bu.user_id) AS total_staff,
  COUNT(DISTINCT l.id) FILTER (WHERE l.created_at >= CURRENT_DATE) AS leads_today,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status = 'completed' AND rj.completed_at >= CURRENT_DATE) AS jobs_sold_today,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.completed_at >= CURRENT_DATE), 0) AS revenue_today,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status IN ('scheduled', 'in_progress')) AS active_jobs,
  COALESCE(AVG(bp.cycle_time), 0) AS avg_cycle_time_days
FROM public.branches b
LEFT JOIN public.branch_users bu ON bu.branch_id = b.id AND bu.is_active = true
LEFT JOIN public.leads l ON l.branch_id = b.id
LEFT JOIN public.roofing_jobs rj ON rj.branch_id = b.id
LEFT JOIN public.branch_performance bp ON bp.branch_id = b.id AND bp.date >= CURRENT_DATE - INTERVAL '30 days'
WHERE b.is_active = true
GROUP BY COALESCE(b.roofing_company_id, b.company_id);

-- View: Branch Performance Comparison
CREATE OR REPLACE VIEW public.v_hq_branch_performance AS
SELECT 
  b.id AS branch_id,
  b.name AS branch_name,
  b.city,
  b.state,
  COALESCE(b.roofing_company_id, b.company_id) AS company_id,
  
  -- Today's Metrics
  COUNT(DISTINCT l.id) FILTER (WHERE l.created_at >= CURRENT_DATE) AS leads_today,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status = 'completed' AND rj.completed_at >= CURRENT_DATE) AS jobs_sold_today,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.completed_at >= CURRENT_DATE), 0) AS revenue_today,
  
  -- This Month's Metrics
  COUNT(DISTINCT l.id) FILTER (WHERE l.created_at >= date_trunc('month', CURRENT_DATE)) AS leads_this_month,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status = 'completed' AND rj.completed_at >= date_trunc('month', CURRENT_DATE)) AS jobs_sold_this_month,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.completed_at >= date_trunc('month', CURRENT_DATE)), 0) AS revenue_this_month,
  COALESCE(AVG(rj.job_value) FILTER (WHERE rj.status = 'completed'), 0) AS avg_ticket,
  
  -- Performance Metrics
  COALESCE(AVG(bp.cycle_time), 0) AS avg_cycle_time_days,
  COALESCE(AVG(bp.on_time_completion_rate), 0) AS on_time_completion_rate,
  COALESCE(AVG(bp.customer_satisfaction_score), 0) AS customer_satisfaction_score,
  
  -- Active Metrics
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status IN ('scheduled', 'in_progress')) AS active_jobs,
  COUNT(DISTINCT c.id) AS crews_count,
  COUNT(DISTINCT bu.user_id) AS staff_count
FROM public.branches b
LEFT JOIN public.leads l ON l.branch_id = b.id
LEFT JOIN public.roofing_jobs rj ON rj.branch_id = b.id
LEFT JOIN public.branch_performance bp ON bp.branch_id = b.id AND bp.date >= CURRENT_DATE - INTERVAL '30 days'
LEFT JOIN public.crews c ON c.branch_id = b.id
LEFT JOIN public.branch_users bu ON bu.branch_id = b.id AND bu.is_active = true
WHERE b.is_active = true
GROUP BY b.id, b.name, b.city, b.state, COALESCE(b.roofing_company_id, b.company_id);

-- View: Cross-Office Calendar Summary
CREATE OR REPLACE VIEW public.v_hq_cross_office_calendar AS
SELECT 
  b.id AS branch_id,
  b.name AS branch_name,
  b.city,
  b.state,
  DATE(rj.scheduled_start_date) AS schedule_date,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status = 'scheduled') AS scheduled_jobs,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status = 'in_progress') AS in_progress_jobs,
  COUNT(DISTINCT c.id) AS crews_booked,
  COUNT(DISTINCT c.id) FILTER (WHERE c.id NOT IN (
    SELECT DISTINCT c2.id 
    FROM public.crews c2
    JOIN public.roofing_jobs rj2 ON rj2.crew_id = c2.id
    WHERE rj2.scheduled_start_date = DATE(rj.scheduled_start_date)
      AND rj2.status IN ('scheduled', 'in_progress')
  )) AS crews_available
FROM public.branches b
LEFT JOIN public.roofing_jobs rj ON rj.branch_id = b.id
LEFT JOIN public.crews c ON c.branch_id = b.id
WHERE b.is_active = true
  AND rj.scheduled_start_date IS NOT NULL
GROUP BY b.id, b.name, b.city, b.state, DATE(rj.scheduled_start_date)
ORDER BY schedule_date, branch_name;

-- ============================================================================
-- PART 10 — HELPER FUNCTIONS
-- ============================================================================

-- Function: Get available shared resources for a branch
CREATE OR REPLACE FUNCTION public.get_available_shared_resources(
  p_branch_id uuid,
  p_resource_type text DEFAULT NULL,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  resource_id uuid,
  resource_type text,
  branch_id uuid,
  branch_name text,
  distance_miles numeric,
  available boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    br.resource_id,
    br.resource_type,
    b.id AS branch_id,
    b.name AS branch_name,
    NULL::numeric AS distance_miles, -- TODO: Calculate distance
    true AS available -- TODO: Check actual availability
  FROM public.branch_resources br
  JOIN public.branches b ON b.id = br.branch_id
  WHERE br.shareable = true
    AND (br.shared_with_branches IS NULL OR p_branch_id = ANY(br.shared_with_branches))
    AND (p_resource_type IS NULL OR br.resource_type = p_resource_type)
    AND b.is_active = true
    AND br.branch_id != p_branch_id
  ORDER BY b.name;
$$;

-- Function: Apply franchise template to branch
CREATE OR REPLACE FUNCTION public.apply_franchise_template(
  p_template_id uuid,
  p_branch_id uuid,
  p_applied_by_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_template_record record;
  v_application_id uuid;
  v_applied_config jsonb := '{}'::jsonb;
  v_errors jsonb := '[]'::jsonb;
BEGIN
  -- Get template
  SELECT * INTO v_template_record
  FROM public.franchise_templates
  WHERE id = p_template_id
    AND is_active = true;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found or inactive';
  END IF;
  
  -- Create application record
  INSERT INTO public.franchise_template_applications (
    template_id,
    target_branch_id,
    status,
    applied_by_user_id
  ) VALUES (
    p_template_id,
    p_branch_id,
    'applying',
    p_applied_by_user_id
  ) RETURNING id INTO v_application_id;
  
  -- Apply template configuration
  -- This is a simplified version - in production, you'd apply each config section
  v_applied_config := jsonb_build_object(
    'pricing_rules', v_template_record.pricing_rules,
    'workflow_templates', v_template_record.workflow_templates,
    'contract_templates', v_template_record.contract_templates,
    'material_lists', v_template_record.material_lists,
    'sales_scripts', v_template_record.sales_scripts,
    'marketing_automation', v_template_record.marketing_automation,
    'job_workflows', v_template_record.job_workflows,
    'permissions_config', v_template_record.permissions_config,
    'applied_at', now()
  );
  
  -- Update branch settings with template config
  UPDATE public.branches
  SET settings = COALESCE(settings, '{}'::jsonb) || v_applied_config
  WHERE id = p_branch_id;
  
  -- Mark application as completed
  UPDATE public.franchise_template_applications
  SET 
    status = 'completed',
    applied_at = now(),
    applied_config = v_applied_config
  WHERE id = v_application_id;
  
  RETURN v_application_id;
END;
$$;

-- ============================================================================
-- PART 11 — TRIGGERS
-- ============================================================================

-- Updated_at triggers
CREATE OR REPLACE FUNCTION public.set_branches_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_branches_updated_at ON public.branches;
CREATE TRIGGER trg_branches_updated_at
BEFORE UPDATE ON public.branches
FOR EACH ROW
EXECUTE FUNCTION public.set_branches_updated_at();

CREATE OR REPLACE FUNCTION public.set_branch_users_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_branch_users_updated_at ON public.branch_users;
CREATE TRIGGER trg_branch_users_updated_at
BEFORE UPDATE ON public.branch_users
FOR EACH ROW
EXECUTE FUNCTION public.set_branch_users_updated_at();

CREATE OR REPLACE FUNCTION public.set_branch_performance_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_branch_performance_updated_at ON public.branch_performance;
CREATE TRIGGER trg_branch_performance_updated_at
BEFORE UPDATE ON public.branch_performance
FOR EACH ROW
EXECUTE FUNCTION public.set_branch_performance_updated_at();

-- ============================================================================
-- PART 12 — ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.franchise_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.franchise_template_applications ENABLE ROW LEVEL SECURITY;

-- Helper function to check branch access
CREATE OR REPLACE FUNCTION public.has_branch_access_v2(check_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.branch_users
    WHERE branch_id = check_branch_id 
      AND user_id = auth.uid() 
      AND is_active = true
  ) OR EXISTS(
    -- HQ owners can access all branches in their company
    SELECT 1 FROM public.branch_users bu
    JOIN public.branches b ON b.id = bu.branch_id
    WHERE bu.user_id = auth.uid()
      AND bu.role = 'hq_owner'
      AND bu.is_active = true
      AND b.is_active = true
      AND (
        (b.roofing_company_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.branches b2
          WHERE b2.id = check_branch_id
            AND b2.roofing_company_id = b.roofing_company_id
        ))
        OR (b.company_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.branches b2
          WHERE b2.id = check_branch_id
            AND b2.company_id = b.company_id
        ))
      )
  );
$$;

-- RLS Policies for branches
DROP POLICY IF EXISTS "branches_select" ON public.branches;
CREATE POLICY "branches_select" ON public.branches
  FOR SELECT
  USING (public.has_branch_access_v2(id));

DROP POLICY IF EXISTS "branches_insert" ON public.branches;
CREATE POLICY "branches_insert" ON public.branches
  FOR INSERT
  WITH CHECK (
    -- HQ owners can create branches
    EXISTS (
      SELECT 1 FROM public.branch_users bu
      JOIN public.branches b ON b.id = bu.branch_id
      WHERE bu.user_id = auth.uid()
        AND bu.role = 'hq_owner'
        AND bu.is_active = true
        AND (
          (b.roofing_company_id IS NOT NULL AND branches.roofing_company_id = b.roofing_company_id)
          OR (b.company_id IS NOT NULL AND branches.company_id = b.company_id)
        )
    )
  );

-- RLS Policies for branch_users
DROP POLICY IF EXISTS "branch_users_select" ON public.branch_users;
CREATE POLICY "branch_users_select" ON public.branch_users
  FOR SELECT
  USING (public.has_branch_access_v2(branch_id));

-- RLS Policies for branch_resources
DROP POLICY IF EXISTS "branch_resources_select" ON public.branch_resources;
CREATE POLICY "branch_resources_select" ON public.branch_resources
  FOR SELECT
  USING (public.has_branch_access_v2(branch_id));

-- RLS Policies for branch_performance
DROP POLICY IF EXISTS "branch_performance_select" ON public.branch_performance;
CREATE POLICY "branch_performance_select" ON public.branch_performance
  FOR SELECT
  USING (public.has_branch_access_v2(branch_id));

-- ============================================================================
-- PART 13 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_resources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_performance TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.franchise_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.franchise_template_applications TO authenticated;

GRANT SELECT ON public.v_hq_all_branches_summary TO authenticated;
GRANT SELECT ON public.v_hq_branch_performance TO authenticated;
GRANT SELECT ON public.v_hq_cross_office_calendar TO authenticated;

GRANT EXECUTE ON FUNCTION public.route_lead_to_branch_v2(uuid, text, text, text, text, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_shared_resources(uuid, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_franchise_template(uuid, uuid, uuid) TO authenticated;

-- ============================================================================
-- PART 14 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.branches IS 'Physical branch offices within companies (Block 255600)';
COMMENT ON TABLE public.branch_users IS 'Users assigned to branches with roles (Block 255600)';
COMMENT ON TABLE public.branch_resources IS 'Crews, vendors, equipment assigned to branches (Block 255600)';
COMMENT ON TABLE public.branch_performance IS 'Daily performance metrics per branch (Block 255600)';
COMMENT ON TABLE public.franchise_templates IS 'Franchise configuration templates (Block 255600)';
COMMENT ON TABLE public.franchise_template_applications IS 'Applications of franchise templates to branches (Block 255600)';

COMMENT ON VIEW public.v_hq_all_branches_summary IS 'HQ Command Center: Summary across all branches (Block 255600)';
COMMENT ON VIEW public.v_hq_branch_performance IS 'HQ Command Center: Branch-by-branch performance comparison (Block 255600)';
COMMENT ON VIEW public.v_hq_cross_office_calendar IS 'HQ Command Center: Cross-office calendar visibility (Block 255600)';





















