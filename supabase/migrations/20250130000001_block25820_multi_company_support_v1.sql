-- =========================================================
-- Block 25820 — SmartSend Roofing Multi-Company Support v1
-- (Multiple Roofing Brands • Multi-Market Expansion • Separate Teams • Separate Pipelines • Shared Owner Dashboard)
-- =========================================================
-- 
-- THE MULTI-COMPANY / MULTI-BRANCH ENGINE — ZERO FLUFF.
-- 
-- This block enables roofing company owners to run:
-- - multiple roofing brands
-- - multiple locations
-- - multiple divisions (roofing, gutters, siding)
-- - storm teams in different states
-- - franchise-style branches
-- - seasonal storm-chasing companies
-- 
-- SmartSend Roofing Multi-Company Support v1 handles this cleanly.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE roofing_companies TABLE
-- ============================================================================
-- Each roofing company has its own branding, team, pipeline, dashboards, vault, automations, homeowner portal

CREATE TABLE IF NOT EXISTS public.roofing_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Company Identity
  name text NOT NULL,                    -- "ABC Roofing", "XYZ Storm Team", etc.
  legal_name text,                       -- Full legal name
  brand_color_primary text,              -- Hex color for branding
  brand_color_secondary text,
  logo_url text,
  
  -- Contact Information
  email_domain text,                     -- Company email domain (e.g., "abcroofing.com")
  phone_number text,
  website text,
  
  -- Address
  address text,
  city text,
  state text,
  zip_code text,
  country text DEFAULT 'USA',
  
  -- Company Settings
  is_active boolean DEFAULT true,
  is_storm_company boolean DEFAULT false, -- For temporary/storm-chasing companies
  company_type text CHECK (company_type IN ('retail', 'insurance', 'storm', 'hybrid', 'franchise', 'division')) DEFAULT 'hybrid',
  
  -- Branding & Messaging
  messaging_style text,                  -- 'professional', 'casual', 'friendly', 'urgent'
  homeowner_portal_enabled boolean DEFAULT true,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure unique company names per owner
  CONSTRAINT unique_company_name_per_owner UNIQUE (owner_id, name)
);

CREATE INDEX IF NOT EXISTS idx_roofing_companies_owner ON public.roofing_companies(owner_id, is_active);
CREATE INDEX IF NOT EXISTS idx_roofing_companies_org ON public.roofing_companies(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_companies_workspace ON public.roofing_companies(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_companies_type ON public.roofing_companies(owner_id, company_type);
CREATE INDEX IF NOT EXISTS idx_roofing_companies_storm ON public.roofing_companies(owner_id, is_storm_company) WHERE is_storm_company = true;

COMMENT ON TABLE public.roofing_companies IS 'Separate roofing companies under one owner account (Block 25820)';

-- ============================================================================
-- PART 2 — CREATE roofing_markets TABLE
-- ============================================================================
-- Markets represent cities/states within a company (e.g., Dallas Market, Houston Market)

CREATE TABLE IF NOT EXISTS public.roofing_markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Market Identity
  name text NOT NULL,                    -- "Dallas Market", "Houston Market", "San Antonio Market"
  city text,
  state text NOT NULL,
  zip_codes text[],                      -- Array of ZIP codes this market covers
  service_area_radius_miles numeric,     -- Service radius in miles
  
  -- Market Operations
  ops_manager_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active boolean DEFAULT true,
  is_temporary boolean DEFAULT false,   -- For temporary storm markets
  
  -- Market-Specific Settings
  weather_rules jsonb DEFAULT '{}'::jsonb, -- Weather-based automation rules
  supplier_relationships jsonb DEFAULT '[]'::jsonb, -- Supplier info for this market
  pricing_config jsonb DEFAULT '{}'::jsonb, -- Market-specific pricing
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure unique market names per company
  CONSTRAINT unique_market_name_per_company UNIQUE (roofing_company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_roofing_markets_company ON public.roofing_markets(roofing_company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_roofing_markets_state ON public.roofing_markets(state);
CREATE INDEX IF NOT EXISTS idx_roofing_markets_city ON public.roofing_markets(city) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_markets_zip_codes ON public.roofing_markets USING GIN(zip_codes);
CREATE INDEX IF NOT EXISTS idx_roofing_markets_ops_manager ON public.roofing_markets(ops_manager_user_id) WHERE ops_manager_user_id IS NOT NULL;

COMMENT ON TABLE public.roofing_markets IS 'Markets (cities/states) within a roofing company (Block 25820)';

-- ============================================================================
-- PART 3 — ADD roofing_company_id AND market_id TO CORE TABLES
-- ============================================================================

-- Add to roofing_jobs
ALTER TABLE IF EXISTS public.roofing_jobs
  ADD COLUMN IF NOT EXISTS roofing_company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS market_id uuid REFERENCES public.roofing_markets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_roofing_jobs_company ON public.roofing_jobs(roofing_company_id) WHERE roofing_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_market ON public.roofing_jobs(market_id) WHERE market_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_company_market ON public.roofing_jobs(roofing_company_id, market_id) WHERE roofing_company_id IS NOT NULL;

-- Add to leads
ALTER TABLE IF EXISTS public.leads
  ADD COLUMN IF NOT EXISTS roofing_company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS market_id uuid REFERENCES public.roofing_markets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_roofing_company ON public.leads(roofing_company_id) WHERE roofing_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_market ON public.leads(market_id) WHERE market_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_company_market ON public.leads(roofing_company_id, market_id) WHERE roofing_company_id IS NOT NULL;

-- Add to crews
ALTER TABLE IF EXISTS public.crews
  ADD COLUMN IF NOT EXISTS roofing_company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS market_id uuid REFERENCES public.roofing_markets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crews_roofing_company ON public.crews(roofing_company_id) WHERE roofing_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_crews_market ON public.crews(market_id) WHERE market_id IS NOT NULL;

-- Add to roofing_tasks
ALTER TABLE IF EXISTS public.roofing_tasks
  ADD COLUMN IF NOT EXISTS roofing_company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS market_id uuid REFERENCES public.roofing_markets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_roofing_tasks_company ON public.roofing_tasks(roofing_company_id) WHERE roofing_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_tasks_market ON public.roofing_tasks(market_id) WHERE market_id IS NOT NULL;

-- Add to roofing_teams (link teams to companies)
ALTER TABLE IF EXISTS public.roofing_teams
  ADD COLUMN IF NOT EXISTS roofing_company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_roofing_teams_company ON public.roofing_teams(roofing_company_id) WHERE roofing_company_id IS NOT NULL;

-- Add to contacts (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contacts') THEN
    ALTER TABLE public.contacts
      ADD COLUMN IF NOT EXISTS roofing_company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS market_id uuid REFERENCES public.roofing_markets(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_contacts_roofing_company ON public.contacts(roofing_company_id) WHERE roofing_company_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_contacts_market ON public.contacts(market_id) WHERE market_id IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- PART 4 — CREATE COMPANY-SPECIFIC PIPELINES TABLE
-- ============================================================================
-- Each company/market can have its own pipeline stages

CREATE TABLE IF NOT EXISTS public.roofing_company_pipelines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  market_id uuid REFERENCES public.roofing_markets(id) ON DELETE SET NULL, -- null = company-wide pipeline
  
  -- Pipeline Identity
  name text NOT NULL,                    -- "Storm Pipeline", "Retail Pipeline", "Insurance Pipeline"
  pipeline_type text NOT NULL CHECK (pipeline_type IN ('lead', 'sales', 'insurance', 'production', 'scheduling')) DEFAULT 'lead',
  is_default boolean DEFAULT false,
  
  -- Pipeline Stages (JSONB array of stage objects)
  -- Example: [{"name": "New Lead", "order": 1}, {"name": "Inspection Set", "order": 2}, ...]
  stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  
  -- Pipeline Settings
  settings jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure unique pipeline names per company/market
  CONSTRAINT unique_pipeline_name_per_company_market UNIQUE (roofing_company_id, COALESCE(market_id, '00000000-0000-0000-0000-000000000000'::uuid), name)
);

CREATE INDEX IF NOT EXISTS idx_roofing_company_pipelines_company ON public.roofing_company_pipelines(roofing_company_id);
CREATE INDEX IF NOT EXISTS idx_roofing_company_pipelines_market ON public.roofing_company_pipelines(market_id) WHERE market_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_company_pipelines_type ON public.roofing_company_pipelines(roofing_company_id, pipeline_type);
CREATE INDEX IF NOT EXISTS idx_roofing_company_pipelines_default ON public.roofing_company_pipelines(roofing_company_id, is_default) WHERE is_default = true;

COMMENT ON TABLE public.roofing_company_pipelines IS 'Company and market-specific pipelines (Block 25820)';

-- ============================================================================
-- PART 5 — CREATE COMPANY-SPECIFIC TEMPLATES TABLE
-- ============================================================================
-- Each company has its own email templates, SMS templates, quotes templates, contracts, terms

CREATE TABLE IF NOT EXISTS public.roofing_company_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Template Identity
  name text NOT NULL,
  template_type text NOT NULL CHECK (template_type IN ('email', 'sms', 'quote', 'contract', 'terms', 'homeowner_message', 'automation_preset')) DEFAULT 'email',
  category text,                        -- 'storm', 'insurance', 'retail', 'follow_up', etc.
  
  -- Template Content
  subject text,                         -- For email templates
  body text NOT NULL,
  variables text[],                     -- Available variables like {{HOMEOWNER_NAME}}, {{ADDRESS}}, etc.
  
  -- Template Settings
  is_active boolean DEFAULT true,
  is_default boolean DEFAULT false,
  messaging_style text,                 -- Inherits from company or override
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure unique template names per company and type
  CONSTRAINT unique_template_name_per_company_type UNIQUE (roofing_company_id, template_type, name)
);

CREATE INDEX IF NOT EXISTS idx_roofing_company_templates_company ON public.roofing_company_templates(roofing_company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_roofing_company_templates_type ON public.roofing_company_templates(roofing_company_id, template_type);
CREATE INDEX IF NOT EXISTS idx_roofing_company_templates_category ON public.roofing_company_templates(roofing_company_id, category) WHERE category IS NOT NULL;

COMMENT ON TABLE public.roofing_company_templates IS 'Company-specific templates (email, SMS, quotes, contracts, terms) (Block 25820)';

-- ============================================================================
-- PART 6 — CREATE COMPANY-SPECIFIC DOCUMENT VAULT TABLE
-- ============================================================================
-- Each company has its own vault for contracts, warranties, invoices, job photos, supplements, scopes, permits, roofing manuals, brand assets

CREATE TABLE IF NOT EXISTS public.roofing_company_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  market_id uuid REFERENCES public.roofing_markets(id) ON DELETE SET NULL,
  
  -- Document Identity
  name text NOT NULL,
  document_type text NOT NULL CHECK (document_type IN ('contract', 'warranty', 'invoice', 'job_photo', 'supplement', 'scope', 'permit', 'roofing_manual', 'brand_asset', 'other')) DEFAULT 'other',
  
  -- Document Linking
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Document Storage
  file_url text NOT NULL,                -- URL to stored file (S3, Supabase Storage, etc.)
  file_size_bytes bigint,
  mime_type text,
  file_name text,
  
  -- Document Metadata
  description text,
  tags text[],
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Access Control
  is_private boolean DEFAULT false,      -- Private to company vs shared
  
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_company_documents_company ON public.roofing_company_documents(roofing_company_id);
CREATE INDEX IF NOT EXISTS idx_roofing_company_documents_market ON public.roofing_company_documents(market_id) WHERE market_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_company_documents_type ON public.roofing_company_documents(roofing_company_id, document_type);
CREATE INDEX IF NOT EXISTS idx_roofing_company_documents_job ON public.roofing_company_documents(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_company_documents_lead ON public.roofing_company_documents(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_company_documents_tags ON public.roofing_company_documents USING GIN(tags);

COMMENT ON TABLE public.roofing_company_documents IS 'Company-specific document vault (Block 25820)';

-- ============================================================================
-- PART 7 — CREATE COMPANY TEAM MEMBERSHIP TABLE
-- ============================================================================
-- Links users to companies with specific roles and permissions

CREATE TABLE IF NOT EXISTS public.roofing_company_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Role within this company
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'sales', 'ops', 'crew', 'insurance_specialist', 'viewer')) DEFAULT 'member',
  
  -- Market Assignment (optional - user can be assigned to specific markets)
  market_ids uuid[] DEFAULT '{}'::uuid[], -- Array of market IDs this user has access to (empty = all markets)
  
  -- Permissions
  can_view_all_markets boolean DEFAULT false, -- If true, can see all markets regardless of market_ids
  can_switch_companies boolean DEFAULT false,  -- Can switch between companies (for cross-company staff)
  
  -- Assignment Metadata
  assigned_at timestamptz DEFAULT now(),
  assigned_by_user_id uuid REFERENCES auth.users(id),
  
  is_active boolean DEFAULT true,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- One membership per user per company
  CONSTRAINT unique_user_company UNIQUE (roofing_company_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_roofing_company_members_company ON public.roofing_company_members(roofing_company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_roofing_company_members_user ON public.roofing_company_members(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_roofing_company_members_role ON public.roofing_company_members(roofing_company_id, role) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_roofing_company_members_markets ON public.roofing_company_members USING GIN(market_ids);

COMMENT ON TABLE public.roofing_company_members IS 'Users assigned to roofing companies with roles and market access (Block 25820)';

-- ============================================================================
-- PART 8 — CREATE COMPANY MATERIAL CATALOG TABLE
-- ============================================================================
-- Each company can have its own material catalog and pricing

CREATE TABLE IF NOT EXISTS public.roofing_company_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  market_id uuid REFERENCES public.roofing_markets(id) ON DELETE SET NULL, -- null = company-wide pricing
  
  -- Material Identity
  name text NOT NULL,
  material_type text NOT NULL CHECK (material_type IN ('shingle', 'metal', 'tile', 'flat', 'underlayment', 'flashing', 'vent', 'other')) DEFAULT 'other',
  sku text,
  manufacturer text,
  
  -- Pricing
  unit_price numeric(10,2),
  unit_type text,                        -- 'square', 'linear_foot', 'each', 'roll', etc.
  cost_per_square numeric(10,2),         -- Normalized cost per square
  
  -- Market-Specific Pricing
  is_market_specific boolean DEFAULT false,
  
  -- Availability
  is_active boolean DEFAULT true,
  supplier_info jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure unique material names per company/market
  CONSTRAINT unique_material_name_per_company_market UNIQUE (roofing_company_id, COALESCE(market_id, '00000000-0000-0000-0000-000000000000'::uuid), name)
);

CREATE INDEX IF NOT EXISTS idx_roofing_company_materials_company ON public.roofing_company_materials(roofing_company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_roofing_company_materials_market ON public.roofing_company_materials(market_id) WHERE market_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_company_materials_type ON public.roofing_company_materials(roofing_company_id, material_type);

COMMENT ON TABLE public.roofing_company_materials IS 'Company and market-specific material catalog and pricing (Block 25820)';

-- ============================================================================
-- PART 9 — CREATE MULTI-COMPANY OWNER DASHBOARD VIEWS
-- ============================================================================

-- View: Owner Dashboard - All Companies Summary
CREATE OR REPLACE VIEW public.v_owner_all_companies_summary AS
SELECT 
  rc.owner_id,
  COUNT(DISTINCT rc.id) AS total_companies,
  COUNT(DISTINCT rm.id) AS total_markets,
  COUNT(DISTINCT rcm.user_id) AS total_staff,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status IN ('scheduled', 'in_progress', 'completed')) AS total_jobs,
  COUNT(DISTINCT l.id) AS total_leads,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed'), 0) AS total_revenue,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed' AND rj.completed_at >= date_trunc('month', now())), 0) AS revenue_this_month,
  COUNT(DISTINCT l.id) FILTER (WHERE l.roofing_pipeline_stage IN ('quote_sent', 'approved', 'scheduled')) AS leads_in_pipeline,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status = 'in_progress') AS jobs_at_risk
FROM public.roofing_companies rc
LEFT JOIN public.roofing_markets rm ON rm.roofing_company_id = rc.id AND rm.is_active = true
LEFT JOIN public.roofing_company_members rcm ON rcm.roofing_company_id = rc.id AND rcm.is_active = true
LEFT JOIN public.roofing_jobs rj ON rj.roofing_company_id = rc.id
LEFT JOIN public.leads l ON l.roofing_company_id = rc.id
WHERE rc.is_active = true
GROUP BY rc.owner_id;

-- View: Company-by-Company Comparison
CREATE OR REPLACE VIEW public.v_owner_company_comparison AS
SELECT 
  rc.id AS company_id,
  rc.name AS company_name,
  rc.company_type,
  rc.owner_id,
  COUNT(DISTINCT rm.id) AS markets_count,
  COUNT(DISTINCT rcm.user_id) AS staff_count,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status = 'completed') AS completed_jobs,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status IN ('scheduled', 'in_progress')) AS active_jobs,
  COUNT(DISTINCT l.id) AS total_leads,
  COUNT(DISTINCT l.id) FILTER (WHERE l.roofing_pipeline_stage IN ('quote_sent', 'approved', 'scheduled')) AS leads_in_pipeline,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed'), 0) AS total_revenue,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed' AND rj.completed_at >= date_trunc('month', now())), 0) AS revenue_this_month,
  COALESCE(AVG(rj.job_value) FILTER (WHERE rj.status = 'completed'), 0) AS avg_job_value
FROM public.roofing_companies rc
LEFT JOIN public.roofing_markets rm ON rm.roofing_company_id = rc.id AND rm.is_active = true
LEFT JOIN public.roofing_company_members rcm ON rcm.roofing_company_id = rc.id AND rcm.is_active = true
LEFT JOIN public.roofing_jobs rj ON rj.roofing_company_id = rc.id
LEFT JOIN public.leads l ON l.roofing_company_id = rc.id
WHERE rc.is_active = true
GROUP BY rc.id, rc.name, rc.company_type, rc.owner_id;

-- View: Market-by-Market Performance
CREATE OR REPLACE VIEW public.v_owner_market_performance AS
SELECT 
  rm.id AS market_id,
  rm.name AS market_name,
  rm.city,
  rm.state,
  rc.id AS company_id,
  rc.name AS company_name,
  rc.owner_id,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status = 'completed') AS completed_jobs,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status IN ('scheduled', 'in_progress')) AS active_jobs,
  COUNT(DISTINCT l.id) AS total_leads,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed'), 0) AS total_revenue,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed' AND rj.completed_at >= date_trunc('month', now())), 0) AS revenue_this_month,
  COUNT(DISTINCT c.id) AS crews_count
FROM public.roofing_markets rm
JOIN public.roofing_companies rc ON rc.id = rm.roofing_company_id
LEFT JOIN public.roofing_jobs rj ON rj.market_id = rm.id
LEFT JOIN public.leads l ON l.market_id = rm.id
LEFT JOIN public.crews c ON c.market_id = rm.id
WHERE rm.is_active = true AND rc.is_active = true
GROUP BY rm.id, rm.name, rm.city, rm.state, rc.id, rc.name, rc.owner_id;

-- View: Sales Rep Rankings Across All Companies
CREATE OR REPLACE VIEW public.v_owner_sales_rep_rankings AS
SELECT 
  rcm.user_id,
  au.email,
  rc.id AS company_id,
  rc.name AS company_name,
  COUNT(DISTINCT l.id) FILTER (WHERE l.roofing_pipeline_stage IN ('quote_sent', 'approved', 'scheduled', 'installed')) AS leads_closed,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status = 'completed') AS jobs_completed,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed'), 0) AS total_revenue,
  COALESCE(AVG(rj.job_value) FILTER (WHERE rj.status = 'completed'), 0) AS avg_job_value,
  COUNT(DISTINCT l.id) FILTER (WHERE l.roofing_pipeline_stage = 'installed')::numeric / 
    NULLIF(COUNT(DISTINCT l.id) FILTER (WHERE l.roofing_pipeline_stage IN ('quote_sent', 'approved', 'scheduled', 'installed')), 0) * 100 AS close_rate_percent
FROM public.roofing_company_members rcm
JOIN public.roofing_companies rc ON rc.id = rcm.roofing_company_id
JOIN auth.users au ON au.id = rcm.user_id
LEFT JOIN public.leads l ON l.roofing_company_id = rc.id AND l.assigned_user_id = rcm.user_id
LEFT JOIN public.roofing_jobs rj ON rj.roofing_company_id = rc.id AND rj.assigned_user_id = rcm.user_id
WHERE rcm.role IN ('sales', 'admin', 'owner') AND rcm.is_active = true AND rc.is_active = true
GROUP BY rcm.user_id, au.email, rc.id, rc.name;

-- View: Crew Performance Across All Markets
CREATE OR REPLACE VIEW public.v_owner_crew_performance AS
SELECT 
  c.id AS crew_id,
  c.name AS crew_name,
  rm.id AS market_id,
  rm.name AS market_name,
  rc.id AS company_id,
  rc.name AS company_name,
  rc.owner_id,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status = 'completed') AS jobs_completed,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed'), 0) AS total_revenue,
  COALESCE(AVG(rj.actual_hours) FILTER (WHERE rj.status = 'completed' AND rj.actual_hours IS NOT NULL), 0) AS avg_hours_per_job,
  COALESCE(AVG(rj.calculated_labor_cost) FILTER (WHERE rj.status = 'completed' AND rj.calculated_labor_cost IS NOT NULL), 0) AS avg_labor_cost_per_job
FROM public.crews c
JOIN public.roofing_markets rm ON rm.id = c.market_id
JOIN public.roofing_companies rc ON rc.id = rm.roofing_company_id
LEFT JOIN public.roofing_jobs rj ON rj.crew_id = c.id
WHERE c.is_active = true AND rm.is_active = true AND rc.is_active = true
GROUP BY c.id, c.name, rm.id, rm.name, rc.id, rc.name, rc.owner_id;

-- View: Material Spend by Region
CREATE OR REPLACE VIEW public.v_owner_material_spend_by_region AS
SELECT 
  rm.state,
  rm.city,
  rm.id AS market_id,
  rm.name AS market_name,
  rc.id AS company_id,
  rc.name AS company_name,
  rc.owner_id,
  COUNT(DISTINCT rcm.id) AS materials_used,
  COALESCE(SUM(rcm.unit_price * rcm.quantity) FILTER (WHERE rcm.unit_price IS NOT NULL), 0) AS total_material_spend,
  COALESCE(SUM(rcm.unit_price * rcm.quantity) FILTER (WHERE rcm.unit_price IS NOT NULL AND rcm.created_at >= date_trunc('month', now())), 0) AS material_spend_this_month
FROM public.roofing_markets rm
JOIN public.roofing_companies rc ON rc.id = rm.roofing_company_id
LEFT JOIN public.roofing_company_materials rcm ON rcm.market_id = rm.id OR (rcm.market_id IS NULL AND rcm.roofing_company_id = rc.id)
WHERE rm.is_active = true AND rc.is_active = true
GROUP BY rm.state, rm.city, rm.id, rm.name, rc.id, rc.name, rc.owner_id;

-- View: Insurance vs Retail Ratios
CREATE OR REPLACE VIEW public.v_owner_insurance_vs_retail_ratios AS
SELECT 
  rc.id AS company_id,
  rc.name AS company_name,
  rc.owner_id,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.payment_type = 'insurance' AND rj.status = 'completed') AS insurance_jobs,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.payment_type = 'cash' AND rj.status = 'completed') AS retail_jobs,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status = 'completed') AS total_jobs,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.payment_type = 'insurance' AND rj.status = 'completed'), 0) AS insurance_revenue,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.payment_type = 'cash' AND rj.status = 'completed'), 0) AS retail_revenue,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed'), 0) AS total_revenue,
  CASE 
    WHEN COUNT(DISTINCT rj.id) FILTER (WHERE rj.status = 'completed') > 0 
    THEN COUNT(DISTINCT rj.id) FILTER (WHERE rj.payment_type = 'insurance' AND rj.status = 'completed')::numeric / 
         COUNT(DISTINCT rj.id) FILTER (WHERE rj.status = 'completed') * 100
    ELSE 0
  END AS insurance_job_percentage,
  CASE 
    WHEN COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed'), 0) > 0
    THEN COALESCE(SUM(rj.job_value) FILTER (WHERE rj.payment_type = 'insurance' AND rj.status = 'completed'), 0) / 
         COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed'), 1) * 100
    ELSE 0
  END AS insurance_revenue_percentage
FROM public.roofing_companies rc
LEFT JOIN public.roofing_jobs rj ON rj.roofing_company_id = rc.id
WHERE rc.is_active = true
GROUP BY rc.id, rc.name, rc.owner_id;

-- ============================================================================
-- PART 10 — HELPER FUNCTIONS
-- ============================================================================

-- Function: Get user's companies
CREATE OR REPLACE FUNCTION public.get_user_roofing_companies(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE (
  company_id uuid,
  company_name text,
  company_type text,
  role text,
  can_switch_companies boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    rc.id as company_id,
    rc.name as company_name,
    rc.company_type,
    rcm.role,
    rcm.can_switch_companies
  FROM public.roofing_companies rc
  JOIN public.roofing_company_members rcm ON rcm.roofing_company_id = rc.id
  WHERE rcm.user_id = p_user_id
    AND rc.is_active = true
    AND rcm.is_active = true
  ORDER BY rc.created_at;
$$;

-- Function: Check if user has access to company
CREATE OR REPLACE FUNCTION public.has_company_access(p_company_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.roofing_company_members rcm
    JOIN public.roofing_companies rc ON rc.id = rcm.roofing_company_id
    WHERE rcm.roofing_company_id = p_company_id
      AND rcm.user_id = p_user_id
      AND rcm.is_active = true
      AND rc.is_active = true
  );
$$;

-- Function: Check if user has access to market
CREATE OR REPLACE FUNCTION public.has_market_access(p_market_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.roofing_company_members rcm
    JOIN public.roofing_markets rm ON rm.roofing_company_id = rcm.roofing_company_id
    WHERE rm.id = p_market_id
      AND rcm.user_id = p_user_id
      AND rcm.is_active = true
      AND (
        rcm.can_view_all_markets = true
        OR p_market_id = ANY(rcm.market_ids)
        OR array_length(rcm.market_ids, 1) IS NULL
      )
  );
$$;

-- Function: Get company members
CREATE OR REPLACE FUNCTION public.get_company_members(p_company_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  role text,
  market_ids uuid[],
  can_view_all_markets boolean,
  assigned_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    rcm.user_id,
    au.email,
    rcm.role,
    rcm.market_ids,
    rcm.can_view_all_markets,
    rcm.assigned_at
  FROM public.roofing_company_members rcm
  JOIN auth.users au ON au.id = rcm.user_id
  WHERE rcm.roofing_company_id = p_company_id
    AND rcm.is_active = true;
$$;

-- ============================================================================
-- PART 11 — TRIGGERS
-- ============================================================================

-- Updated_at triggers
CREATE OR REPLACE FUNCTION public.set_roofing_companies_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_roofing_companies_updated_at
BEFORE UPDATE ON public.roofing_companies
FOR EACH ROW
EXECUTE FUNCTION public.set_roofing_companies_updated_at();

CREATE OR REPLACE FUNCTION public.set_roofing_markets_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_roofing_markets_updated_at
BEFORE UPDATE ON public.roofing_markets
FOR EACH ROW
EXECUTE FUNCTION public.set_roofing_markets_updated_at();

CREATE OR REPLACE FUNCTION public.set_roofing_company_members_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_roofing_company_members_updated_at
BEFORE UPDATE ON public.roofing_company_members
FOR EACH ROW
EXECUTE FUNCTION public.set_roofing_company_members_updated_at();

-- Auto-add owner as company member when company is created
CREATE OR REPLACE FUNCTION public.auto_add_owner_to_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.roofing_company_members (
    roofing_company_id,
    user_id,
    role,
    can_view_all_markets,
    can_switch_companies,
    assigned_by_user_id
  )
  VALUES (
    NEW.id,
    NEW.owner_id,
    'owner',
    true,
    true,
    NEW.owner_id
  )
  ON CONFLICT (roofing_company_id, user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_add_owner_to_company
AFTER INSERT ON public.roofing_companies
FOR EACH ROW
EXECUTE FUNCTION public.auto_add_owner_to_company();

-- ============================================================================
-- PART 12 — ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS
ALTER TABLE public.roofing_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_company_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_company_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_company_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_company_materials ENABLE ROW LEVEL SECURITY;

-- Helper function to check company membership
CREATE OR REPLACE FUNCTION public.is_company_member(check_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.roofing_company_members
    WHERE roofing_company_id = check_company_id 
      AND user_id = auth.uid() 
      AND is_active = true
  );
$$;

-- RLS Policies for roofing_companies
CREATE POLICY "Users can view companies they're members of"
  ON public.roofing_companies FOR SELECT
  USING (public.is_company_member(id));

CREATE POLICY "Owners can create companies"
  ON public.roofing_companies FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Company owners/admins can update companies"
  ON public.roofing_companies FOR UPDATE
  USING (
    public.is_company_member(id) AND
    EXISTS (
      SELECT 1 FROM public.roofing_company_members
      WHERE roofing_company_id = roofing_companies.id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND is_active = true
    )
  );

-- RLS Policies for roofing_markets
CREATE POLICY "Users can view markets in their companies"
  ON public.roofing_markets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_company_members
      WHERE roofing_company_id = roofing_markets.roofing_company_id
        AND user_id = auth.uid()
        AND is_active = true
    )
  );

CREATE POLICY "Company owners/admins can create markets"
  ON public.roofing_markets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roofing_company_members
      WHERE roofing_company_id = roofing_markets.roofing_company_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND is_active = true
    )
  );

CREATE POLICY "Company owners/admins can update markets"
  ON public.roofing_markets FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_company_members
      WHERE roofing_company_id = roofing_markets.roofing_company_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND is_active = true
    )
  );

-- RLS Policies for roofing_company_pipelines
CREATE POLICY "Users can view pipelines in their companies"
  ON public.roofing_company_pipelines FOR SELECT
  USING (public.is_company_member(roofing_company_id));

CREATE POLICY "Company owners/admins can manage pipelines"
  ON public.roofing_company_pipelines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_company_members
      WHERE roofing_company_id = roofing_company_pipelines.roofing_company_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND is_active = true
    )
  );

-- RLS Policies for roofing_company_templates
CREATE POLICY "Users can view templates in their companies"
  ON public.roofing_company_templates FOR SELECT
  USING (public.is_company_member(roofing_company_id));

CREATE POLICY "Company members can manage templates"
  ON public.roofing_company_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_company_members
      WHERE roofing_company_id = roofing_company_templates.roofing_company_id
        AND user_id = auth.uid()
        AND is_active = true
    )
  );

-- RLS Policies for roofing_company_documents
CREATE POLICY "Users can view documents in their companies"
  ON public.roofing_company_documents FOR SELECT
  USING (
    public.is_company_member(roofing_company_id) AND
    (
      is_private = false
      OR EXISTS (
        SELECT 1 FROM public.roofing_company_members
        WHERE roofing_company_id = roofing_company_documents.roofing_company_id
          AND user_id = auth.uid()
          AND is_active = true
      )
    )
  );

CREATE POLICY "Company members can manage documents"
  ON public.roofing_company_documents FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_company_members
      WHERE roofing_company_id = roofing_company_documents.roofing_company_id
        AND user_id = auth.uid()
        AND is_active = true
    )
  );

-- RLS Policies for roofing_company_members
CREATE POLICY "Users can view members in their companies"
  ON public.roofing_company_members FOR SELECT
  USING (public.is_company_member(roofing_company_id));

CREATE POLICY "Company owners/admins can manage members"
  ON public.roofing_company_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_company_members
      WHERE roofing_company_id = roofing_company_members.roofing_company_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND is_active = true
    )
  );

-- RLS Policies for roofing_company_materials
CREATE POLICY "Users can view materials in their companies"
  ON public.roofing_company_materials FOR SELECT
  USING (public.is_company_member(roofing_company_id));

CREATE POLICY "Company owners/admins can manage materials"
  ON public.roofing_company_materials FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_company_members
      WHERE roofing_company_id = roofing_company_materials.roofing_company_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND is_active = true
    )
  );

-- ============================================================================
-- PART 13 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_companies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_markets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_company_pipelines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_company_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_company_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_company_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_company_materials TO authenticated;

GRANT SELECT ON public.v_owner_all_companies_summary TO authenticated;
GRANT SELECT ON public.v_owner_company_comparison TO authenticated;
GRANT SELECT ON public.v_owner_market_performance TO authenticated;
GRANT SELECT ON public.v_owner_sales_rep_rankings TO authenticated;
GRANT SELECT ON public.v_owner_crew_performance TO authenticated;
GRANT SELECT ON public.v_owner_material_spend_by_region TO authenticated;
GRANT SELECT ON public.v_owner_insurance_vs_retail_ratios TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_user_roofing_companies(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_company_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_market_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_members(uuid) TO authenticated;

-- ============================================================================
-- PART 14 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.roofing_companies IS 'Multiple roofing companies under one owner account (Block 25820)';
COMMENT ON TABLE public.roofing_markets IS 'Markets (cities/states) within roofing companies (Block 25820)';
COMMENT ON TABLE public.roofing_company_pipelines IS 'Company and market-specific pipelines (Block 25820)';
COMMENT ON TABLE public.roofing_company_templates IS 'Company-specific templates (email, SMS, quotes, contracts, terms) (Block 25820)';
COMMENT ON TABLE public.roofing_company_documents IS 'Company-specific document vault (Block 25820)';
COMMENT ON TABLE public.roofing_company_members IS 'Users assigned to roofing companies with roles and market access (Block 25820)';
COMMENT ON TABLE public.roofing_company_materials IS 'Company and market-specific material catalog and pricing (Block 25820)';

COMMENT ON VIEW public.v_owner_all_companies_summary IS 'Owner dashboard: Summary across all companies (Block 25820)';
COMMENT ON VIEW public.v_owner_company_comparison IS 'Owner dashboard: Company-by-company comparison (Block 25820)';
COMMENT ON VIEW public.v_owner_market_performance IS 'Owner dashboard: Market-by-market performance (Block 25820)';
COMMENT ON VIEW public.v_owner_sales_rep_rankings IS 'Owner dashboard: Sales rep rankings across all companies (Block 25820)';
COMMENT ON VIEW public.v_owner_crew_performance IS 'Owner dashboard: Crew performance across all markets (Block 25820)';
COMMENT ON VIEW public.v_owner_material_spend_by_region IS 'Owner dashboard: Material spend by region (Block 25820)';
COMMENT ON VIEW public.v_owner_insurance_vs_retail_ratios IS 'Owner dashboard: Insurance vs retail ratios (Block 25820)';




































