-- ============================================================================
-- Block 260000 — SmartSend Enterprise Infrastructure Engine v1
-- Fleet Tracking • Asset Management • Multi-Brand Support • Insurance Vault
-- Heavy Ops Scaling for Large Roofing Organizations
-- ============================================================================
--
-- This block does NOT re-invent earlier fleet / equipment systems
-- (Blocks 17400, 252400, 252900, 255800, 256800, 55000, 70000, 259600).
-- Instead, it makes them ENTERPRISE-GRADE by:
--   - Tightening links between incidents and fleet/equipment
--   - Adding GPS device identity at the vehicle level
--   - Creating a clean, company-level insurance policy vault
--   - Re‑using multi-company (roofing_companies) membership and RLS
--
-- Result: owners get one backbone for trucks, tools, incidents, and
-- insurance compliance across brands, branches, and large fleets.
-- ============================================================================


-- ============================================================================
-- PART 1 — Extend vehicles with GPS device identity
-- ============================================================================
-- Map physical GPS trackers / telematics devices to trucks so we can
-- join live GPS streams and vehicle records cleanly.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'vehicles'
      AND column_name  = 'gps_device_id'
  ) THEN
    ALTER TABLE public.vehicles
      ADD COLUMN gps_device_id text;
  END IF;
END $$;

-- Helpful index for lookups by hardware ID
CREATE INDEX IF NOT EXISTS idx_vehicles_gps_device_id
  ON public.vehicles(gps_device_id);

COMMENT ON COLUMN public.vehicles.gps_device_id IS 'Hardware/device identifier for GPS / telematics tracker (Block 260000).';


-- ============================================================================
-- PART 2 — Link safety/ops incidents to vehicles, equipment, and users
-- ============================================================================
-- Block 255800 already created public.incidents for OSHA / safety.
-- Enterprise Infrastructure needs those same incidents tied back to
-- specific fleet vehicles, equipment, and users for:
--   - vehicle damage tracking
--   - tool loss / equipment incidents
--   - driver accountability
--   - insurance + DOT documentation
--
-- We extend public.incidents instead of creating a second table.

DO $$
BEGIN
  -- Related fleet vehicle (trucks, trailers, vans, etc.)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'incidents'
      AND column_name  = 'related_vehicle_id'
  ) THEN
    ALTER TABLE public.incidents
      ADD COLUMN related_vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL;
  END IF;

  -- Related equipment item from equipment tracking system (Block 70000)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'incidents'
      AND column_name  = 'related_equipment_id'
  ) THEN
    ALTER TABLE public.incidents
      ADD COLUMN related_equipment_id uuid REFERENCES public.equipment(id) ON DELETE SET NULL;
  END IF;

  -- Related auth user (driver / crew lead / PM)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'incidents'
      AND column_name  = 'related_user_id'
  ) THEN
    ALTER TABLE public.incidents
      ADD COLUMN related_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes for enterprise dashboards and filtering
CREATE INDEX IF NOT EXISTS idx_incidents_related_vehicle
  ON public.incidents(related_vehicle_id);

CREATE INDEX IF NOT EXISTS idx_incidents_related_equipment
  ON public.incidents(related_equipment_id);

CREATE INDEX IF NOT EXISTS idx_incidents_related_user
  ON public.incidents(related_user_id);

COMMENT ON COLUMN public.incidents.related_vehicle_id IS 'Enterprise link: specific fleet vehicle involved in this incident (Block 260000).';
COMMENT ON COLUMN public.incidents.related_equipment_id IS 'Enterprise link: specific equipment/tool involved in this incident (Block 260000).';
COMMENT ON COLUMN public.incidents.related_user_id IS 'Enterprise link: auth user (driver / crew lead / PM) associated with this incident (Block 260000).';


-- ============================================================================
-- PART 3 — Company-Level Insurance Policy Vault
-- ============================================================================
-- Block 17400 created insurance_documents for per-contact insurance
-- paperwork (claim forms, scopes, checks, etc.).
--
-- Enterprise owners also need a SIMPLE VAULT for company-level policies:
--   - General Liability
--   - Workers Comp
--   - Commercial Auto
--   - Umbrella
--   - Equipment Coverage
--
-- This table is scoped by roofing_company_id and reuses the
-- multi-company membership model from Block 25820.

CREATE TABLE IF NOT EXISTS public.roofing_company_insurance_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,

  -- Policy category (high-level, opinionated)
  category text NOT NULL CHECK (category IN (
    'liability',       -- General Liability
    'workers_comp',    -- Workers Compensation
    'auto',            -- Commercial Auto
    'umbrella',        -- Umbrella / Excess
    'equipment',       -- Equipment / Inland Marine
    'other'
  )),

  -- Storage + core metadata
  document_url text NOT NULL,              -- Link to policy PDF / document
  expiration_date date,                    -- When coverage expires
  policy_number text,
  carrier text,

  -- Optional structured coverage details
  coverage_limits jsonb DEFAULT '{}'::jsonb,  -- { per_occurrence: 1000000, aggregate: 2000000, ... }
  metadata        jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_company_insurance_policies_company
  ON public.roofing_company_insurance_policies(roofing_company_id, category);

CREATE INDEX IF NOT EXISTS idx_roofing_company_insurance_policies_expiration
  ON public.roofing_company_insurance_policies(expiration_date);

COMMENT ON TABLE public.roofing_company_insurance_policies IS 'Company-level insurance policy vault (GL, Workers Comp, Auto, Umbrella, Equipment) per roofing company (Block 260000).';
COMMENT ON COLUMN public.roofing_company_insurance_policies.category IS 'Policy category: liability, workers_comp, auto, umbrella, equipment, other.';


-- ============================================================================
-- PART 4 — Row Level Security & Grants (Enterprise-Grade Access Control)
-- ============================================================================
-- We reuse the multi-company membership model from Block 25820:
--   - public.roofing_company_members
--   - public.is_company_member(check_company_id uuid)
--
-- Only members of a roofing company can see/manage that company's
-- insurance policies.

ALTER TABLE public.roofing_company_insurance_policies ENABLE ROW LEVEL SECURITY;

-- Company members can view policies for their companies
CREATE POLICY "roofing_company_insurance_policies_select_members"
  ON public.roofing_company_insurance_policies
  FOR SELECT
  USING (public.is_company_member(roofing_company_id));

-- Company owners/admins can manage policies
CREATE POLICY "roofing_company_insurance_policies_manage_admins"
  ON public.roofing_company_insurance_policies
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.roofing_company_members rcm
      WHERE rcm.roofing_company_id = roofing_company_insurance_policies.roofing_company_id
        AND rcm.user_id = auth.uid()
        AND rcm.role IN ('owner', 'admin')
        AND rcm.is_active = true
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.roofing_company_insurance_policies
  TO authenticated;

-- ============================================================================
-- Block 260000 schema layer complete.
-- Higher-level analytics views and AI recommendations will be built
-- on top of these tables in subsequent application/BI layers.
-- ============================================================================













