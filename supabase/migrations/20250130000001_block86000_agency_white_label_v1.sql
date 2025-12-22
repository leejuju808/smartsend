-- =========================================================
-- Block 86000 — SmartSend Roofing Agency Mode + White-Label System v1
-- (Full Multi-Company Agency Mode + White-Label System)
-- =========================================================
-- 
-- This block enables:
-- - Agencies to manage multiple roofing companies
-- - White-label branding for agencies
-- - Hard data isolation between companies
-- - Agency master dashboard
-- - Company switching (like Slack)
-- 
-- This turns SmartSend from "a tool" into "the backbone of the roofing lead-gen industry"
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE agencies TABLE
-- ============================================================================
-- Agencies are organizations that manage multiple roofing companies

CREATE TABLE IF NOT EXISTS public.agencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Agency Identity
  name text NOT NULL,                      -- "ABC Marketing Agency", "Roofing Pro Partners", etc.
  logo_url text,
  
  -- White-Label Domain
  custom_domain text,                      -- e.g., "portal.abcagency.com", "app.abcagency.com"
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure unique agency names per owner
  CONSTRAINT unique_agency_name_per_owner UNIQUE (owner_user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_agencies_owner ON public.agencies(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_agencies_custom_domain ON public.agencies(custom_domain) WHERE custom_domain IS NOT NULL;

COMMENT ON TABLE public.agencies IS 'Marketing agencies that manage multiple roofing companies (Block 86000)';

-- ============================================================================
-- PART 2 — CREATE agency_users TABLE
-- ============================================================================
-- Agency staff members with roles

CREATE TABLE IF NOT EXISTS public.agency_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Role within agency
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'manager', 'viewer')),
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One membership per user per agency
  CONSTRAINT unique_user_agency UNIQUE (agency_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_agency_users_agency ON public.agency_users(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_users_user ON public.agency_users(user_id);
CREATE INDEX IF NOT EXISTS idx_agency_users_role ON public.agency_users(agency_id, role);

COMMENT ON TABLE public.agency_users IS 'Agency staff members with roles (Block 86000)';

-- ============================================================================
-- PART 3 — CREATE agency_companies TABLE
-- ============================================================================
-- Links agencies to roofing companies they manage

CREATE TABLE IF NOT EXISTS public.agency_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- One mapping per agency-company pair
  CONSTRAINT unique_agency_company UNIQUE (agency_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_agency_companies_agency ON public.agency_companies(agency_id);
CREATE INDEX IF NOT EXISTS idx_agency_companies_company ON public.agency_companies(company_id);

COMMENT ON TABLE public.agency_companies IS 'Links agencies to roofing companies they manage (Block 86000)';

-- ============================================================================
-- PART 4 — CREATE white_label_settings TABLE
-- ============================================================================
-- White-label branding settings per agency

CREATE TABLE IF NOT EXISTS public.white_label_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  
  -- Brand Colors
  primary_color text,                      -- Hex color, e.g., "#FF5733"
  secondary_color text,                    -- Hex color, e.g., "#33C3F0"
  
  -- Branding Assets
  portal_logo_url text,                    -- Logo for portal header
  email_logo_url text,                    -- Logo for email templates
  
  -- Email Branding
  email_from_name text,                   -- "ABC Agency" or "Roofing Pro"
  email_from_address text,                -- "noreply@abcagency.com"
  support_email text,                     -- "support@abcagency.com"
  
  -- Custom Styling
  custom_css text,                        -- Custom CSS for portal (pros only)
  
  -- Portal Settings
  portal_title text,                      -- Custom portal title
  portal_favicon_url text,                -- Custom favicon
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One settings record per agency
  CONSTRAINT unique_agency_settings UNIQUE (agency_id)
);

CREATE INDEX IF NOT EXISTS idx_white_label_settings_agency ON public.white_label_settings(agency_id);

COMMENT ON TABLE public.white_label_settings IS 'White-label branding settings per agency (Block 86000)';

-- ============================================================================
-- PART 5 — ADD agency_id TO roofing_companies (optional, for direct linking)
-- ============================================================================
-- This allows roofing companies to optionally be directly linked to an agency

ALTER TABLE IF EXISTS public.roofing_companies
  ADD COLUMN IF NOT EXISTS agency_id uuid REFERENCES public.agencies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_roofing_companies_agency ON public.roofing_companies(agency_id) WHERE agency_id IS NOT NULL;

-- ============================================================================
-- PART 6 — HELPER FUNCTIONS
-- ============================================================================

-- Function: Get user's agencies
CREATE OR REPLACE FUNCTION public.get_user_agencies(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE (
  agency_id uuid,
  agency_name text,
  role text,
  total_companies bigint,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    a.id as agency_id,
    a.name as agency_name,
    au.role,
    COUNT(DISTINCT ac.company_id) as total_companies,
    a.created_at
  FROM public.agencies a
  JOIN public.agency_users au ON au.agency_id = a.id
  LEFT JOIN public.agency_companies ac ON ac.agency_id = a.id
  WHERE au.user_id = p_user_id
  GROUP BY a.id, a.name, au.role, a.created_at
  ORDER BY a.created_at;
$$;

-- Function: Get agency's companies
CREATE OR REPLACE FUNCTION public.get_agency_companies(p_agency_id uuid)
RETURNS TABLE (
  company_id uuid,
  company_name text,
  company_type text,
  leads_this_week bigint,
  hot_leads bigint,
  jobs_won bigint,
  revenue numeric,
  domain_health_score numeric,
  deliverability_score numeric,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    rc.id as company_id,
    rc.name as company_name,
    rc.company_type,
    COUNT(DISTINCT l.id) FILTER (WHERE l.created_at >= date_trunc('week', now())) as leads_this_week,
    COUNT(DISTINCT l.id) FILTER (WHERE l.intent_score >= 0.7) as hot_leads,
    COUNT(DISTINCT rj.id) FILTER (WHERE rj.status = 'completed') as jobs_won,
    COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed'), 0) as revenue,
    NULL::numeric as domain_health_score,  -- TODO: Calculate from domain health data
    NULL::numeric as deliverability_score,  -- TODO: Calculate from deliverability data
    rc.created_at
  FROM public.agency_companies ac
  JOIN public.roofing_companies rc ON rc.id = ac.company_id
  LEFT JOIN public.leads l ON l.roofing_company_id = rc.id
  LEFT JOIN public.roofing_jobs rj ON rj.roofing_company_id = rc.id
  WHERE ac.agency_id = p_agency_id
    AND rc.is_active = true
  GROUP BY rc.id, rc.name, rc.company_type, rc.created_at
  ORDER BY rc.created_at;
$$;

-- Function: Check if user has agency access
CREATE OR REPLACE FUNCTION public.has_agency_access(p_agency_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.agency_users au
    WHERE au.agency_id = p_agency_id
      AND au.user_id = p_user_id
  );
$$;

-- Function: Check if user has access to company via agency
CREATE OR REPLACE FUNCTION public.has_agency_company_access(p_company_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.agency_companies ac
    JOIN public.agency_users au ON au.agency_id = ac.agency_id
    WHERE ac.company_id = p_company_id
      AND au.user_id = p_user_id
  );
$$;

-- Function: Get agency master dashboard stats
CREATE OR REPLACE FUNCTION public.get_agency_dashboard_stats(p_agency_id uuid)
RETURNS TABLE (
  total_clients bigint,
  total_leads_30d bigint,
  total_booked_estimates bigint,
  revenue_generated numeric,
  avg_domain_deliverability numeric,
  at_risk_domains bigint,
  at_risk_campaigns bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    COUNT(DISTINCT ac.company_id) as total_clients,
    COUNT(DISTINCT l.id) FILTER (WHERE l.created_at >= now() - interval '30 days') as total_leads_30d,
    COUNT(DISTINCT l.id) FILTER (WHERE l.roofing_pipeline_stage IN ('quote_sent', 'approved', 'scheduled')) as total_booked_estimates,
    COALESCE(SUM(rj.job_value) FILTER (WHERE rj.status = 'completed'), 0) as revenue_generated,
    NULL::numeric as avg_domain_deliverability,  -- TODO: Calculate from deliverability data
    NULL::bigint as at_risk_domains,  -- TODO: Calculate from domain health data
    NULL::bigint as at_risk_campaigns  -- TODO: Calculate from campaign health data
  FROM public.agency_companies ac
  LEFT JOIN public.roofing_companies rc ON rc.id = ac.company_id
  LEFT JOIN public.leads l ON l.roofing_company_id = rc.id
  LEFT JOIN public.roofing_jobs rj ON rj.roofing_company_id = rc.id
  WHERE ac.agency_id = p_agency_id
    AND rc.is_active = true;
$$;

-- ============================================================================
-- PART 7 — TRIGGERS
-- ============================================================================

-- Updated_at triggers
CREATE OR REPLACE FUNCTION public.set_agencies_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_agencies_updated_at
BEFORE UPDATE ON public.agencies
FOR EACH ROW
EXECUTE FUNCTION public.set_agencies_updated_at();

CREATE OR REPLACE FUNCTION public.set_agency_users_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_agency_users_updated_at
BEFORE UPDATE ON public.agency_users
FOR EACH ROW
EXECUTE FUNCTION public.set_agency_users_updated_at();

CREATE OR REPLACE FUNCTION public.set_white_label_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_white_label_settings_updated_at
BEFORE UPDATE ON public.white_label_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_white_label_settings_updated_at();

-- Auto-add owner as agency user when agency is created
CREATE OR REPLACE FUNCTION public.auto_add_owner_to_agency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.agency_users (
    agency_id,
    user_id,
    role
  )
  VALUES (
    NEW.id,
    NEW.owner_user_id,
    'owner'
  )
  ON CONFLICT (agency_id, user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_add_owner_to_agency
AFTER INSERT ON public.agencies
FOR EACH ROW
EXECUTE FUNCTION public.auto_add_owner_to_agency();

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.white_label_settings ENABLE ROW LEVEL SECURITY;

-- Helper function to check agency membership
CREATE OR REPLACE FUNCTION public.is_agency_member(check_agency_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.agency_users
    WHERE agency_id = check_agency_id 
      AND user_id = auth.uid()
  );
$$;

-- RLS Policies for agencies
CREATE POLICY "Users can view agencies they're members of"
  ON public.agencies FOR SELECT
  USING (public.is_agency_member(id));

CREATE POLICY "Users can create agencies"
  ON public.agencies FOR INSERT
  WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Agency owners/managers can update agencies"
  ON public.agencies FOR UPDATE
  USING (
    public.is_agency_member(id) AND
    EXISTS (
      SELECT 1 FROM public.agency_users
      WHERE agency_id = agencies.id
        AND user_id = auth.uid()
        AND role IN ('owner', 'manager')
    )
  );

-- RLS Policies for agency_users
CREATE POLICY "Users can view agency users in their agencies"
  ON public.agency_users FOR SELECT
  USING (public.is_agency_member(agency_id));

CREATE POLICY "Agency owners/managers can manage agency users"
  ON public.agency_users FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_users
      WHERE agency_id = agency_users.agency_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'manager')
    )
  );

-- RLS Policies for agency_companies
CREATE POLICY "Users can view agency companies in their agencies"
  ON public.agency_companies FOR SELECT
  USING (public.is_agency_member(agency_id));

CREATE POLICY "Agency owners/managers can manage agency companies"
  ON public.agency_companies FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_users
      WHERE agency_id = agency_companies.agency_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'manager')
    )
  );

-- RLS Policies for white_label_settings
CREATE POLICY "Users can view white label settings in their agencies"
  ON public.white_label_settings FOR SELECT
  USING (public.is_agency_member(agency_id));

CREATE POLICY "Agency owners/managers can manage white label settings"
  ON public.white_label_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_users
      WHERE agency_id = white_label_settings.agency_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'manager')
    )
  );

-- ============================================================================
-- PART 9 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agencies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agency_companies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.white_label_settings TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_user_agencies(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agency_companies(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_agency_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_agency_company_access(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agency_dashboard_stats(uuid) TO authenticated;

-- ============================================================================
-- PART 10 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.agencies IS 'Marketing agencies that manage multiple roofing companies (Block 86000)';
COMMENT ON TABLE public.agency_users IS 'Agency staff members with roles (Block 86000)';
COMMENT ON TABLE public.agency_companies IS 'Links agencies to roofing companies they manage (Block 86000)';
COMMENT ON TABLE public.white_label_settings IS 'White-label branding settings per agency (Block 86000)';

COMMENT ON FUNCTION public.get_user_agencies(uuid) IS 'Get all agencies a user belongs to (Block 86000)';
COMMENT ON FUNCTION public.get_agency_companies(uuid) IS 'Get all companies managed by an agency with stats (Block 86000)';
COMMENT ON FUNCTION public.has_agency_access(uuid, uuid) IS 'Check if user has access to an agency (Block 86000)';
COMMENT ON FUNCTION public.has_agency_company_access(uuid, uuid) IS 'Check if user has access to a company via agency (Block 86000)';
COMMENT ON FUNCTION public.get_agency_dashboard_stats(uuid) IS 'Get master dashboard stats for an agency (Block 86000)';



























