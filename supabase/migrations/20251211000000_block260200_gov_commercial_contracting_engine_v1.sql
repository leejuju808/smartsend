-- ============================================================
-- Block 260200 — SmartSend Government & Commercial Contracting Engine v1
-- RFP Tracking, Compliance, Bid Docs, Prevailing Wage, Bonding, Submittals
-- ============================================================
-- 
-- This block turns SmartSend into a government & commercial bidding weapon —
-- the system that lets roofing companies move upmarket into:
-- schools, cities, counties, federal jobs, hospitals, warehouses, HOAs,
-- and large commercial portfolios.
--
-- Core database primitives:
--   1) RFP discovery & tracking
--   2) Compliance / certification checklists
--   3) Prevailing wage (Davis–Bacon) rate engine
--   4) Bid package generation & submission tracking
--
-- The rest of the engine (bid calendars, alerts, analytics, etc.)
-- is built on top of these tables.
-- ============================================================

-- ============================================================
-- 1.1 RFPs TABLE
-- ------------------------------------------------------------
-- "Never miss a bid again" — central record per RFP
-- Tracks source, deadlines, value, and current status.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rfps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Ownership / multi-tenant scoping
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,

  -- Core RFP metadata (from spec)
  agency text,                         -- Issuing agency (City of Plano, USACE, etc.)
  project_name text,
  project_type text,                   -- school, city, county, federal, commercial, HOA, hospital, warehouse, etc.
  location text,
  bid_due_at timestamptz,
  estimated_value numeric,             -- overall project value
  status text NOT NULL DEFAULT 'discovered' CHECK (status IN (
    'discovered',
    'bidding',
    'submitted',
    'awarded',
    'lost'
  )),

  -- Optional extra tracking fields (supporting discovery & audit trail)
  source text,                         -- sam.gov, state_portal, city_portal, manual, etc.
  rfp_number text,                     -- external RFP / solicitation number
  rfp_url text,                        -- link to original posting/portal
  notes text,

  -- Metadata
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for rfps
CREATE INDEX IF NOT EXISTS idx_rfps_team ON public.rfps(team_id);
CREATE INDEX IF NOT EXISTS idx_rfps_workspace ON public.rfps(workspace_id);
CREATE INDEX IF NOT EXISTS idx_rfps_company ON public.rfps(company_id);
CREATE INDEX IF NOT EXISTS idx_rfps_bid_due_at ON public.rfps(bid_due_at);
CREATE INDEX IF NOT EXISTS idx_rfps_status ON public.rfps(status);
CREATE INDEX IF NOT EXISTS idx_rfps_agency ON public.rfps(agency);
CREATE INDEX IF NOT EXISTS idx_rfps_project_type ON public.rfps(project_type);


-- ============================================================
-- 1.2 RFP COMPLIANCE ITEMS TABLE
-- ------------------------------------------------------------
-- "No more lost bids due to paperwork."
-- Each row is a specific requirement on an RFP (license, W-9, SAM,
-- minority cert, safety plan, insurance cert, bonding letter, etc.).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rfp_compliance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  rfp_id uuid NOT NULL REFERENCES public.rfps(id) ON DELETE CASCADE,

  requirement text NOT NULL,           -- Human readable requirement text
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'satisfied')),
  document_url text,                   -- Where the proof lives (storage path / external URL)

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rfp_compliance_items_rfp
  ON public.rfp_compliance_items(rfp_id);

CREATE INDEX IF NOT EXISTS idx_rfp_compliance_items_status
  ON public.rfp_compliance_items(status);


-- ============================================================
-- 1.3 PREVAILING WAGE RATES TABLE
-- ------------------------------------------------------------
-- "No more guessing labor cost."
-- Stores Davis–Bacon / local prevailing wage rates per region + labor class.
-- Engine-level logic can then:
--   - Apply correct wage by county/region
--   - Calculate fringe
--   - Drive certified payroll templates
-- ============================================================

CREATE TABLE IF NOT EXISTS public.prevailing_wage_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  region text NOT NULL,                -- e.g. "TX-Collin-County", "CA-LA-County"
  labor_class text NOT NULL,           -- e.g. "Roofer", "Laborer", "Foreman"

  hourly_rate numeric NOT NULL,        -- Base hourly rate
  fringe_rate numeric NOT NULL,        -- Fringe/benefits rate

  effective_date date,                 -- Optional: when this rate took effect
  source text,                         -- Optional: DOL determination, state bulletin, etc.

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ensure one active record per region + labor_class + effective_date
CREATE UNIQUE INDEX IF NOT EXISTS uq_prevailing_wage_region_class_effective
  ON public.prevailing_wage_rates(region, labor_class, COALESCE(effective_date, '1970-01-01'::date));

CREATE INDEX IF NOT EXISTS idx_prevailing_wage_region ON public.prevailing_wage_rates(region);
CREATE INDEX IF NOT EXISTS idx_prevailing_wage_labor_class ON public.prevailing_wage_rates(labor_class);


-- ============================================================
-- 1.4 BID PACKAGES TABLE
-- ------------------------------------------------------------
-- "Professional bids, every time" — one-click bid package output.
-- Each row represents a bid package prepared for a specific RFP,
-- with status tracking for draft → submitted → awarded.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bid_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  rfp_id uuid NOT NULL REFERENCES public.rfps(id) ON DELETE CASCADE,

  total_price numeric,                 -- Total bid price for this package
  bond_required boolean DEFAULT false,

  -- Document bundle locations (generated proposal PDFs, checklists, etc.)
  package_url text,                    -- URL to combined bid package
  package_path text,                   -- Storage path if using object storage

  submitted_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'submitted',
    'awarded'
  )),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bid_packages_rfp
  ON public.bid_packages(rfp_id);

CREATE INDEX IF NOT EXISTS idx_bid_packages_status
  ON public.bid_packages(status);


-- ============================================================
-- 2. ROW LEVEL SECURITY (RLS)
-- ------------------------------------------------------------
-- Match existing patterns:
--   - rfps are team/workspace scoped
--   - children tables hang off rfps
--   - prevailing_wage_rates is global reference data (readable to all
--     authenticated users, fully writable by service_role).
-- ============================================================

-- Enable RLS
ALTER TABLE public.rfps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfp_compliance_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bid_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prevailing_wage_rates ENABLE ROW LEVEL SECURITY;


-- ------------------------------------------------------------
-- 2.1 RLS FOR RFPS
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "rfps_team_member" ON public.rfps;
CREATE POLICY "rfps_team_member" ON public.rfps
  FOR ALL
  USING (
    team_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.team_id = rfps.team_id
        AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    team_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.team_id = rfps.team_id
        AND tm.user_id = auth.uid()
    )
  );


-- ------------------------------------------------------------
-- 2.2 RLS FOR RFP COMPLIANCE ITEMS
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "rfp_compliance_items_team_member" ON public.rfp_compliance_items;
CREATE POLICY "rfp_compliance_items_team_member" ON public.rfp_compliance_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.rfps r
      JOIN public.team_members tm ON tm.team_id = r.team_id
      WHERE r.id = rfp_compliance_items.rfp_id
        AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.rfps r
      JOIN public.team_members tm ON tm.team_id = r.team_id
      WHERE r.id = rfp_compliance_items.rfp_id
        AND tm.user_id = auth.uid()
    )
  );


-- ------------------------------------------------------------
-- 2.3 RLS FOR BID PACKAGES
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "bid_packages_team_member" ON public.bid_packages;
CREATE POLICY "bid_packages_team_member" ON public.bid_packages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.rfps r
      JOIN public.team_members tm ON tm.team_id = r.team_id
      WHERE r.id = bid_packages.rfp_id
        AND tm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.rfps r
      JOIN public.team_members tm ON tm.team_id = r.team_id
      WHERE r.id = bid_packages.rfp_id
        AND tm.user_id = auth.uid()
    )
  );


-- ------------------------------------------------------------
-- 2.4 RLS FOR PREVAILING WAGE RATES
-- ------------------------------------------------------------
-- Global reference data:
--   - Any authenticated user can read
--   - Service role can do anything (for sync/import jobs)
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "prevailing_wage_rates_read" ON public.prevailing_wage_rates;
CREATE POLICY "prevailing_wage_rates_read" ON public.prevailing_wage_rates
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "prevailing_wage_rates_service_role_all" ON public.prevailing_wage_rates;
CREATE POLICY "prevailing_wage_rates_service_role_all" ON public.prevailing_wage_rates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ------------------------------------------------------------
-- 2.5 SERVICE ROLE BYPASS FOR RFPS + CHILD TABLES
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "rfps_service_role_all" ON public.rfps;
CREATE POLICY "rfps_service_role_all" ON public.rfps
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "rfp_compliance_items_service_role_all" ON public.rfp_compliance_items;
CREATE POLICY "rfp_compliance_items_service_role_all" ON public.rfp_compliance_items
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "bid_packages_service_role_all" ON public.bid_packages;
CREATE POLICY "bid_packages_service_role_all" ON public.bid_packages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);


-- ============================================================
-- END OF BLOCK 260200 MIGRATION
-- ============================================================













