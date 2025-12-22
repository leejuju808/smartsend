-- =========================================================
-- Block 249000 — SmartSend Enterprise Mode v1
-- Multi-Branch, Franchise Support, Permissions, Roles, Regional Ops
-- =========================================================
-- 
-- ENTERPRISE MODE v1 — THE BIG LEAGUES.
-- 
-- This block transforms SmartSend from a company tool into an ENTERPRISE PLATFORM.
-- This is how SmartSend becomes the standard for multi-location roofing companies.
-- 
-- Right now bigger roofing companies (3+ branches, franchises, multi-state ops) suffer because:
-- ❌ CRMs don't scale
-- ❌ No clean branch separation
-- ❌ No regional reporting
-- ❌ No user role hierarchy
-- ❌ No staff permission tiers
-- ❌ No territory control
-- ❌ No franchise management tools
-- ❌ No consolidated corporate views
-- ❌ No multi-market scheduling intelligence
-- 
-- SmartSend Enterprise Mode FIXES ALL OF IT.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE branches TABLE
-- ============================================================================
-- Branches represent physical offices/locations within a roofing company
-- Different from markets: branches are physical locations, markets are service areas

CREATE TABLE IF NOT EXISTS public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Branch Identity
  name text NOT NULL,                    -- "Dallas Office", "Houston Branch", "Austin Location"
  address text,
  city text,
  state text,
  zip_code text,
  country text DEFAULT 'USA',
  
  -- Territory Management (GeoJSON polygons for lead routing)
  territory jsonb,                       -- GeoJSON polygon defining service area
  territory_zip_codes text[],             -- Array of ZIP codes for quick matching
  
  -- Contact Information
  phone text,
  email text,
  timezone text DEFAULT 'America/Chicago',
  
  -- Branch Operations
  is_active boolean DEFAULT true,
  branch_manager_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Branch Settings
  settings jsonb DEFAULT '{}'::jsonb,    -- Branch-specific settings
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure unique branch names per company
  CONSTRAINT unique_branch_name_per_company UNIQUE (roofing_company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_branches_company ON public.branches(roofing_company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_branches_state ON public.branches(state);
CREATE INDEX IF NOT EXISTS idx_branches_city ON public.branches(city) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_branches_zip_codes ON public.branches USING GIN(territory_zip_codes);
CREATE INDEX IF NOT EXISTS idx_branches_manager ON public.branches(branch_manager_user_id) WHERE branch_manager_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_branches_territory ON public.branches USING GIN(territory);

COMMENT ON TABLE public.branches IS 'Physical branch offices within roofing companies (Block 249000)';

-- ============================================================================
-- PART 2 — CREATE branch_users TABLE
-- ============================================================================
-- Links users to branches with roles and granular permissions

CREATE TABLE IF NOT EXISTS public.branch_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Role within this branch
  role text NOT NULL CHECK (role IN (
    'master_owner',      -- Access to every branch & every module
    'regional_manager',  -- Access only to assigned regions
    'branch_manager',    -- Controls crews, jobs, production, scheduling, customer accounts, reporting for their branch
    'sales_rep',         -- Access to their leads + jobs
    'production_team',  -- Access to jobs assigned to them
    'csr',               -- CSR / Office Admin: scheduling, leads, CX, inbox
    'finance',           -- Billing, payments, job profitability
    'viewer'             -- Read-only access
  )) DEFAULT 'viewer',
  
  -- Granular Permissions (JSONB for fine-grained control)
  -- Example: {"can_edit_invoices": true, "can_assign_crews": false, "can_see_jobs_outside_region": false}
  permissions jsonb DEFAULT '{}'::jsonb,
  
  -- Regional Access
  can_access_all_branches boolean DEFAULT false,  -- Master owner / regional manager override
  assigned_regions text[],                         -- Array of region identifiers (e.g., ['north_texas', 'dallas'])
  
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
CREATE INDEX IF NOT EXISTS idx_branch_users_permissions ON public.branch_users USING GIN(permissions);
CREATE INDEX IF NOT EXISTS idx_branch_users_regions ON public.branch_users USING GIN(assigned_regions);

COMMENT ON TABLE public.branch_users IS 'Users assigned to branches with roles and granular permissions (Block 249000)';

-- ============================================================================
-- PART 3 — CREATE branch_resources TABLE
-- ============================================================================
-- Tracks crews, equipment, materials, vehicles that belong to a branch
-- Supports shared resources across branches

CREATE TABLE IF NOT EXISTS public.branch_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  
  -- Resource Identity
  resource_type text NOT NULL CHECK (resource_type IN ('crew', 'equipment', 'vehicle', 'material_stock')),
  resource_id uuid NOT NULL,             -- References crews.id, equipment.id, etc.
  
  -- Sharing Configuration
  shared boolean DEFAULT false,           -- If true, can be used by other branches
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
CREATE INDEX IF NOT EXISTS idx_branch_resources_shared ON public.branch_resources(branch_id, shared) WHERE shared = true;
CREATE INDEX IF NOT EXISTS idx_branch_resources_shared_with ON public.branch_resources USING GIN(shared_with_branches);

COMMENT ON TABLE public.branch_resources IS 'Crews, equipment, materials, vehicles assigned to branches (Block 249000)';

-- ============================================================================
-- PART 4 — CREATE franchise_groups TABLE
-- ============================================================================
-- Franchise parent companies that manage multiple franchisee companies

CREATE TABLE IF NOT EXISTS public.franchise_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Franchise Group Identity
  name text NOT NULL,                    -- "ABC Roofing Franchise System"
  
  -- Franchise Terms
  royalty_rate numeric(5,2),             -- Royalty percentage (e.g., 5.00 for 5%)
  royalty_calculation_method text CHECK (royalty_calculation_method IN ('revenue', 'profit', 'jobs_completed')) DEFAULT 'revenue',
  
  -- Franchise Settings
  provides_templates boolean DEFAULT true,  -- Parent provides templates & automations
  provides_branding boolean DEFAULT true,  -- Parent provides branding assets
  provides_training boolean DEFAULT false,  -- Parent provides training materials
  
  -- Notes & Metadata
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure unique franchise group names per parent
  CONSTRAINT unique_franchise_group_name UNIQUE (parent_company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_franchise_groups_parent ON public.franchise_groups(parent_company_id);

COMMENT ON TABLE public.franchise_groups IS 'Franchise parent companies managing franchisees (Block 249000)';

-- ============================================================================
-- PART 5 — CREATE franchise_members TABLE
-- ============================================================================
-- Links franchisee companies to franchise groups

CREATE TABLE IF NOT EXISTS public.franchise_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  franchise_group_id uuid NOT NULL REFERENCES public.franchise_groups(id) ON DELETE CASCADE,
  member_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Membership Status
  is_active boolean DEFAULT true,
  joined_at timestamptz DEFAULT now(),
  
  -- Franchisee-Specific Settings
  custom_royalty_rate numeric(5,2),     -- Override group default if needed
  access_to_parent_templates boolean DEFAULT true,
  access_to_parent_automations boolean DEFAULT true,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- One membership per company per group
  CONSTRAINT unique_franchise_membership UNIQUE (franchise_group_id, member_company_id)
);

CREATE INDEX IF NOT EXISTS idx_franchise_members_group ON public.franchise_members(franchise_group_id, is_active);
CREATE INDEX IF NOT EXISTS idx_franchise_members_company ON public.franchise_members(member_company_id, is_active);

COMMENT ON TABLE public.franchise_members IS 'Franchisee companies linked to franchise groups (Block 249000)';

-- ============================================================================
-- PART 6 — ADD branch_id TO CORE TABLES
-- ============================================================================

-- Add branch_id to roofing_jobs
ALTER TABLE IF EXISTS public.roofing_jobs
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_roofing_jobs_branch ON public.roofing_jobs(branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_company_branch ON public.roofing_jobs(roofing_company_id, branch_id) WHERE roofing_company_id IS NOT NULL AND branch_id IS NOT NULL;

-- Add branch_id to leads
ALTER TABLE IF EXISTS public.leads
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_branch ON public.leads(branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_company_branch ON public.leads(roofing_company_id, branch_id) WHERE roofing_company_id IS NOT NULL AND branch_id IS NOT NULL;

-- Add branch_id to crews
ALTER TABLE IF EXISTS public.crews
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crews_branch ON public.crews(branch_id) WHERE branch_id IS NOT NULL;

-- Add branch_id to roofing_tasks
ALTER TABLE IF EXISTS public.roofing_tasks
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_roofing_tasks_branch ON public.roofing_tasks(branch_id) WHERE branch_id IS NOT NULL;

-- Add branch_id to contacts (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contacts') THEN
    ALTER TABLE public.contacts
      ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_contacts_branch ON public.contacts(branch_id) WHERE branch_id IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- PART 7 — CREATE ENTERPRISE DASHBOARD VIEWS
-- ============================================================================

-- View: Master Owner Dashboard - All Branches Summary
CREATE OR REPLACE VIEW public.v_enterprise_all_branches_summary AS
SELECT 
  rc.owner_id,
  rc.id AS company_id,
  rc.name AS company_name,
  COUNT(DISTINCT b.id) AS total_branches,
  COUNT(DISTINCT bu.user_id) AS total_staff,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status IN ('scheduled', 'in_progress', 'completed')) AS total_jobs,
  COUNT(DISTINCT l.id) AS total_leads,
  COUNT(DISTINCT l.id) FILTER (WHERE l.created_at >= date_trunc('month', now())) AS leads_this_month,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed'), 0) AS total_revenue,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed' AND rj.completed_at >= date_trunc('month', now())), 0) AS revenue_this_month,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status = 'in_progress') AS jobs_at_risk,
  COUNT(DISTINCT l.id) FILTER (WHERE l.roofing_pipeline_stage IN ('quote_sent', 'approved', 'scheduled')) AS leads_in_pipeline,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status IN ('scheduled', 'in_progress')), 0) AS total_backlog
FROM public.roofing_companies rc
LEFT JOIN public.branches b ON b.roofing_company_id = rc.id AND b.is_active = true
LEFT JOIN public.branch_users bu ON bu.branch_id = b.id AND bu.is_active = true
LEFT JOIN public.roofing_jobs rj ON rj.roofing_company_id = rc.id
LEFT JOIN public.leads l ON l.roofing_company_id = rc.id
WHERE rc.is_active = true
GROUP BY rc.owner_id, rc.id, rc.name;

-- View: Branch-by-Branch Performance Comparison
CREATE OR REPLACE VIEW public.v_enterprise_branch_comparison AS
SELECT 
  b.id AS branch_id,
  b.name AS branch_name,
  b.city,
  b.state,
  rc.id AS company_id,
  rc.name AS company_name,
  rc.owner_id,
  COUNT(DISTINCT bu.user_id) AS staff_count,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status = 'completed') AS completed_jobs,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status IN ('scheduled', 'in_progress')) AS active_jobs,
  COUNT(DISTINCT l.id) AS total_leads,
  COUNT(DISTINCT l.id) FILTER (WHERE l.created_at >= date_trunc('month', now())) AS leads_this_month,
  COUNT(DISTINCT l.id) FILTER (WHERE l.roofing_pipeline_stage IN ('quote_sent', 'approved', 'scheduled')) AS leads_in_pipeline,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed'), 0) AS total_revenue,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed' AND rj.completed_at >= date_trunc('month', now())), 0) AS revenue_this_month,
  COALESCE(AVG(rj.job_value) FILTER (WHERE rj.status = 'completed'), 0) AS avg_job_value,
  COUNT(DISTINCT c.id) AS crews_count,
  COUNT(DISTINCT br.id) FILTER (WHERE br.resource_type = 'equipment') AS equipment_count
FROM public.branches b
JOIN public.roofing_companies rc ON rc.id = b.roofing_company_id
LEFT JOIN public.branch_users bu ON bu.branch_id = b.id AND bu.is_active = true
LEFT JOIN public.roofing_jobs rj ON rj.branch_id = b.id
LEFT JOIN public.leads l ON l.branch_id = b.id
LEFT JOIN public.crews c ON c.branch_id = b.id
LEFT JOIN public.branch_resources br ON br.branch_id = b.id
WHERE b.is_active = true AND rc.is_active = true
GROUP BY b.id, b.name, b.city, b.state, rc.id, rc.name, rc.owner_id;

-- View: Regional Performance Heatmap
CREATE OR REPLACE VIEW public.v_enterprise_regional_performance AS
SELECT 
  b.state,
  b.city,
  COUNT(DISTINCT b.id) AS branches_count,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status = 'completed') AS completed_jobs,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status IN ('scheduled', 'in_progress')) AS active_jobs,
  COUNT(DISTINCT l.id) AS total_leads,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed'), 0) AS total_revenue,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed' AND rj.completed_at >= date_trunc('month', now())), 0) AS revenue_this_month,
  COUNT(DISTINCT c.id) AS crews_count,
  COUNT(DISTINCT bu.user_id) AS staff_count
FROM public.branches b
JOIN public.roofing_companies rc ON rc.id = b.roofing_company_id
LEFT JOIN public.roofing_jobs rj ON rj.branch_id = b.id
LEFT JOIN public.leads l ON l.branch_id = b.id
LEFT JOIN public.crews c ON c.branch_id = b.id
LEFT JOIN public.branch_users bu ON bu.branch_id = b.id AND bu.is_active = true
WHERE b.is_active = true AND rc.is_active = true
GROUP BY b.state, b.city;

-- View: Franchise Group Performance
CREATE OR REPLACE VIEW public.v_enterprise_franchise_performance AS
SELECT 
  fg.id AS franchise_group_id,
  fg.name AS franchise_group_name,
  rc_parent.id AS parent_company_id,
  rc_parent.name AS parent_company_name,
  COUNT(DISTINCT fm.member_company_id) AS franchisee_count,
  COUNT(DISTINCT b.id) AS total_branches,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status = 'completed') AS total_jobs_completed,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed'), 0) AS total_revenue,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed' AND rj.completed_at >= date_trunc('month', now())), 0) AS revenue_this_month,
  COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed'), 0) * (fg.royalty_rate / 100.0) AS royalties_owed
FROM public.franchise_groups fg
JOIN public.roofing_companies rc_parent ON rc_parent.id = fg.parent_company_id
LEFT JOIN public.franchise_members fm ON fm.franchise_group_id = fg.id AND fm.is_active = true
LEFT JOIN public.roofing_companies rc_member ON rc_member.id = fm.member_company_id
LEFT JOIN public.branches b ON b.roofing_company_id = rc_member.id AND b.is_active = true
LEFT JOIN public.roofing_jobs rj ON rj.roofing_company_id = rc_member.id
WHERE rc_parent.is_active = true
GROUP BY fg.id, fg.name, rc_parent.id, rc_parent.name, fg.royalty_rate;

-- ============================================================================
-- PART 8 — HELPER FUNCTIONS
-- ============================================================================

-- Function: Get user's branches
CREATE OR REPLACE FUNCTION public.get_user_branches(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE (
  branch_id uuid,
  branch_name text,
  company_id uuid,
  company_name text,
  role text,
  can_access_all_branches boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    b.id as branch_id,
    b.name as branch_name,
    rc.id as company_id,
    rc.name as company_name,
    bu.role,
    bu.can_access_all_branches
  FROM public.branches b
  JOIN public.roofing_companies rc ON rc.id = b.roofing_company_id
  JOIN public.branch_users bu ON bu.branch_id = b.id
  WHERE bu.user_id = p_user_id
    AND b.is_active = true
    AND bu.is_active = true
    AND rc.is_active = true
  ORDER BY b.created_at;
$$;

-- Function: Check if user has access to branch
CREATE OR REPLACE FUNCTION public.has_branch_access(p_branch_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.branch_users bu
    JOIN public.branches b ON b.id = bu.branch_id
    WHERE bu.branch_id = p_branch_id
      AND bu.user_id = p_user_id
      AND bu.is_active = true
      AND b.is_active = true
  ) OR EXISTS(
    SELECT 1
    FROM public.branch_users bu
    JOIN public.branches b ON b.id = bu.branch_id
    JOIN public.roofing_companies rc ON rc.id = b.roofing_company_id
    WHERE bu.user_id = p_user_id
      AND bu.can_access_all_branches = true
      AND bu.is_active = true
      AND b.roofing_company_id = (SELECT roofing_company_id FROM public.branches WHERE id = p_branch_id)
      AND b.is_active = true
  );
$$;

-- Function: Route lead to branch by territory (ZIP code matching)
CREATE OR REPLACE FUNCTION public.route_lead_to_branch(
  p_company_id uuid,
  p_zip_code text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_branch_id uuid;
BEGIN
  -- Find branch with matching ZIP code in territory
  SELECT b.id INTO v_branch_id
  FROM public.branches b
  WHERE b.roofing_company_id = p_company_id
    AND b.is_active = true
    AND (p_zip_code = ANY(b.territory_zip_codes) OR b.territory_zip_codes IS NULL)
  ORDER BY b.created_at
  LIMIT 1;
  
  RETURN v_branch_id;
END;
$$;

-- Function: Get branch permissions for user
CREATE OR REPLACE FUNCTION public.get_branch_permissions(
  p_branch_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT bu.permissions
  FROM public.branch_users bu
  WHERE bu.branch_id = p_branch_id
    AND bu.user_id = p_user_id
    AND bu.is_active = true
  LIMIT 1;
$$;

-- ============================================================================
-- PART 9 — TRIGGERS
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

CREATE TRIGGER trg_branch_users_updated_at
BEFORE UPDATE ON public.branch_users
FOR EACH ROW
EXECUTE FUNCTION public.set_branch_users_updated_at();

CREATE OR REPLACE FUNCTION public.set_franchise_groups_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_franchise_groups_updated_at
BEFORE UPDATE ON public.franchise_groups
FOR EACH ROW
EXECUTE FUNCTION public.set_franchise_groups_updated_at();

CREATE OR REPLACE FUNCTION public.set_franchise_members_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_franchise_members_updated_at
BEFORE UPDATE ON public.franchise_members
FOR EACH ROW
EXECUTE FUNCTION public.set_franchise_members_updated_at();

-- ============================================================================
-- PART 10 — ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.franchise_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.franchise_members ENABLE ROW LEVEL SECURITY;

-- Helper function to check branch membership
CREATE OR REPLACE FUNCTION public.is_branch_member(check_branch_id uuid)
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
    SELECT 1 FROM public.branch_users bu
    JOIN public.branches b ON b.id = bu.branch_id
    WHERE bu.user_id = auth.uid()
      AND bu.can_access_all_branches = true
      AND bu.is_active = true
      AND b.roofing_company_id = (SELECT roofing_company_id FROM public.branches WHERE id = check_branch_id)
      AND b.is_active = true
  );
$$;

-- RLS Policies for branches
CREATE POLICY "Users can view branches they're members of"
  ON public.branches FOR SELECT
  USING (public.is_branch_member(id));

CREATE POLICY "Company owners/admins can create branches"
  ON public.branches FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roofing_company_members
      WHERE roofing_company_id = branches.roofing_company_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND is_active = true
    )
  );

CREATE POLICY "Branch managers and owners can update branches"
  ON public.branches FOR UPDATE
  USING (
    public.is_branch_member(id) AND
    (
      EXISTS (
        SELECT 1 FROM public.branch_users
        WHERE branch_id = branches.id
          AND user_id = auth.uid()
          AND role IN ('master_owner', 'branch_manager')
          AND is_active = true
      )
      OR EXISTS (
        SELECT 1 FROM public.roofing_company_members
        WHERE roofing_company_id = branches.roofing_company_id
          AND user_id = auth.uid()
          AND role = 'owner'
          AND is_active = true
      )
    )
  );

-- RLS Policies for branch_users
CREATE POLICY "Users can view branch users in their branches"
  ON public.branch_users FOR SELECT
  USING (public.is_branch_member(branch_id));

CREATE POLICY "Branch managers and owners can manage branch users"
  ON public.branch_users FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.branch_users
      WHERE branch_id = branch_users.branch_id
        AND user_id = auth.uid()
        AND role IN ('master_owner', 'branch_manager')
        AND is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM public.roofing_company_members
      WHERE roofing_company_id = (SELECT roofing_company_id FROM public.branches WHERE id = branch_users.branch_id)
        AND user_id = auth.uid()
        AND role = 'owner'
        AND is_active = true
    )
  );

-- RLS Policies for branch_resources
CREATE POLICY "Users can view resources in their branches"
  ON public.branch_resources FOR SELECT
  USING (public.is_branch_member(branch_id));

CREATE POLICY "Branch managers and owners can manage branch resources"
  ON public.branch_resources FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.branch_users
      WHERE branch_id = branch_resources.branch_id
        AND user_id = auth.uid()
        AND role IN ('master_owner', 'branch_manager')
        AND is_active = true
    )
  );

-- RLS Policies for franchise_groups
CREATE POLICY "Users can view franchise groups for their companies"
  ON public.franchise_groups FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_company_members
      WHERE roofing_company_id = franchise_groups.parent_company_id
        AND user_id = auth.uid()
        AND is_active = true
    )
  );

CREATE POLICY "Company owners can manage franchise groups"
  ON public.franchise_groups FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_company_members
      WHERE roofing_company_id = franchise_groups.parent_company_id
        AND user_id = auth.uid()
        AND role = 'owner'
        AND is_active = true
    )
  );

-- RLS Policies for franchise_members
CREATE POLICY "Users can view franchise members for their groups"
  ON public.franchise_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.franchise_groups fg
      JOIN public.roofing_company_members rcm ON rcm.roofing_company_id = fg.parent_company_id
      WHERE fg.id = franchise_members.franchise_group_id
        AND rcm.user_id = auth.uid()
        AND rcm.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM public.roofing_company_members
      WHERE roofing_company_id = franchise_members.member_company_id
        AND user_id = auth.uid()
        AND is_active = true
    )
  );

CREATE POLICY "Franchise group owners can manage franchise members"
  ON public.franchise_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.franchise_groups fg
      JOIN public.roofing_company_members rcm ON rcm.roofing_company_id = fg.parent_company_id
      WHERE fg.id = franchise_members.franchise_group_id
        AND rcm.user_id = auth.uid()
        AND rcm.role = 'owner'
        AND rcm.is_active = true
    )
  );

-- ============================================================================
-- PART 11 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.branches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_resources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.franchise_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.franchise_members TO authenticated;

GRANT SELECT ON public.v_enterprise_all_branches_summary TO authenticated;
GRANT SELECT ON public.v_enterprise_branch_comparison TO authenticated;
GRANT SELECT ON public.v_enterprise_regional_performance TO authenticated;
GRANT SELECT ON public.v_enterprise_franchise_performance TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_user_branches(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_branch_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.route_lead_to_branch(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_branch_permissions(uuid, uuid) TO authenticated;

-- ============================================================================
-- PART 12 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.branches IS 'Physical branch offices within roofing companies (Block 249000)';
COMMENT ON TABLE public.branch_users IS 'Users assigned to branches with roles and granular permissions (Block 249000)';
COMMENT ON TABLE public.branch_resources IS 'Crews, equipment, materials, vehicles assigned to branches (Block 249000)';
COMMENT ON TABLE public.franchise_groups IS 'Franchise parent companies managing franchisees (Block 249000)';
COMMENT ON TABLE public.franchise_members IS 'Franchisee companies linked to franchise groups (Block 249000)';

COMMENT ON VIEW public.v_enterprise_all_branches_summary IS 'Enterprise dashboard: Summary across all branches (Block 249000)';
COMMENT ON VIEW public.v_enterprise_branch_comparison IS 'Enterprise dashboard: Branch-by-branch comparison (Block 249000)';
COMMENT ON VIEW public.v_enterprise_regional_performance IS 'Enterprise dashboard: Regional performance heatmap (Block 249000)';
COMMENT ON VIEW public.v_enterprise_franchise_performance IS 'Enterprise dashboard: Franchise group performance (Block 249000)';

























