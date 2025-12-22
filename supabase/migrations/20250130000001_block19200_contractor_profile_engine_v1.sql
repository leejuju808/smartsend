-- =========================================================
-- Block 19200 — SmartSend Contractor Profile Engine v1
-- (The Business Intelligence Core: Company Defaults, Services, Team Roles, Region Data, Pricing Levels, Scheduling Rules & Insurance Preferences)
-- =========================================================

-- ============================================
-- 1) Contractor Profile Table (Main Section)
-- ============================================
CREATE TABLE IF NOT EXISTS public.contractor_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Company Identity
  company_name text,
  logo_url text,
  -- Business Focus
  repair_vs_replacement_focus text CHECK (repair_vs_replacement_focus IN ('replacement_focused', 'repair_focused', 'balanced')) DEFAULT 'balanced',
  -- Emergency & Storm Response
  emergency_hours_enabled boolean DEFAULT false,
  emergency_hours_start time,
  emergency_hours_end time,
  storm_response_mode text CHECK (storm_response_mode IN ('aggressive_storm_pursuit', 'insurance_only_storm_pursuit', 'repair_focused_storm_pursuit', 'none')) DEFAULT 'none',
  -- Office Workflow Preferences
  follow_up_count integer DEFAULT 3 CHECK (follow_up_count >= 0 AND follow_up_count <= 10),
  message_style text CHECK (message_style IN ('formal', 'casual', 'friendly', 'premium')) DEFAULT 'friendly',
  formality_level text CHECK (formality_level IN ('very_formal', 'formal', 'casual', 'very_casual')) DEFAULT 'casual',
  preferred_cta_style text CHECK (preferred_cta_style IN ('direct', 'soft', 'question', 'value_proposition')) DEFAULT 'direct',
  booking_aggressiveness text CHECK (booking_aggressiveness IN ('very_aggressive', 'aggressive', 'moderate', 'gentle')) DEFAULT 'moderate',
  -- Business Health Metrics (v1 - tracked, displayed in Dashboard v2)
  avg_job_value numeric(12,2),
  repair_replacement_split jsonb DEFAULT '{"repair_percent": 50, "replacement_percent": 50}'::jsonb,
  insurance_vs_cash_split jsonb DEFAULT '{"insurance_percent": 60, "cash_percent": 40}'::jsonb,
  booking_rate numeric(5,2),
  avg_response_speed_hours numeric(5,2),
  territory_performance jsonb DEFAULT '{}'::jsonb,
  rep_performance jsonb DEFAULT '{}'::jsonb,
  storm_conversion_rate numeric(5,2),
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_contractor_profile_workspace ON public.contractor_profile(workspace_id);

-- ============================================
-- 2) Contractor Services Table (AI-Driven)
-- ============================================
CREATE TABLE IF NOT EXISTS public.contractor_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Services Offered
  full_replacements boolean DEFAULT true,
  repairs_only boolean DEFAULT false,
  metal_roofing boolean DEFAULT false,
  tile_roofing boolean DEFAULT false,
  flat_roofs boolean DEFAULT false,
  commercial_roofing boolean DEFAULT false,
  gutter_repairs boolean DEFAULT true,
  skylight_repairs boolean DEFAULT false,
  tune_ups boolean DEFAULT false,
  inspections boolean DEFAULT true,
  -- Service Priorities (for lead filtering)
  service_priorities jsonb DEFAULT '{}'::jsonb,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_contractor_services_workspace ON public.contractor_services(workspace_id);

-- ============================================
-- 3) Contractor Territory Table (Service Territory Engine)
-- ============================================
CREATE TABLE IF NOT EXISTS public.contractor_territory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Territory Definition
  zip_codes text[], -- Array of ZIP codes served
  neighborhoods text[], -- Array of neighborhood names
  counties text[], -- Array of county names
  travel_radius_miles integer CHECK (travel_radius_miles >= 0 AND travel_radius_miles <= 100),
  excluded_zones text[], -- Array of excluded ZIP codes or areas
  -- Territory Usage Flags
  target_campaigns boolean DEFAULT true,
  restrict_booking boolean DEFAULT true,
  personalize_messages boolean DEFAULT true,
  calculate_travel_time boolean DEFAULT true,
  show_storm_intel boolean DEFAULT true,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_contractor_territory_workspace ON public.contractor_territory(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contractor_territory_zip_codes ON public.contractor_territory USING GIN(zip_codes);

-- ============================================
-- 4) Contractor Schedule Rules Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.contractor_schedule_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Business Hours
  business_hours_start time DEFAULT '09:00:00',
  business_hours_end time DEFAULT '17:00:00',
  lunch_break_start time DEFAULT '12:00:00',
  lunch_break_end time DEFAULT '13:00:00',
  -- Travel & Buffers
  travel_time_buffer_minutes integer DEFAULT 15 CHECK (travel_time_buffer_minutes >= 0),
  -- Appointment Configuration
  appointment_types_allowed text[] DEFAULT ARRAY['inspection', 'estimate', 'repair', 'replacement']::text[],
  max_daily_appointments integer DEFAULT 8 CHECK (max_daily_appointments > 0),
  -- Weekend Rules
  weekend_enabled boolean DEFAULT false,
  weekend_hours_start time,
  weekend_hours_end time,
  -- Emergency Slots
  emergency_slots_enabled boolean DEFAULT false,
  emergency_slots_per_day integer DEFAULT 2 CHECK (emergency_slots_per_day >= 0),
  -- Daylight Restrictions
  daylight_restrictions_enabled boolean DEFAULT true,
  earliest_appointment_time time DEFAULT '08:00:00',
  latest_appointment_time time DEFAULT '18:00:00',
  -- Preferred Appointment Windows
  preferred_windows jsonb DEFAULT '[
    {"day": "monday", "start": "09:00", "end": "12:00", "enabled": true},
    {"day": "monday", "start": "14:00", "end": "17:00", "enabled": true},
    {"day": "tuesday", "start": "09:00", "end": "12:00", "enabled": true},
    {"day": "tuesday", "start": "14:00", "end": "17:00", "enabled": true},
    {"day": "wednesday", "start": "09:00", "end": "12:00", "enabled": true},
    {"day": "wednesday", "start": "14:00", "end": "17:00", "enabled": true},
    {"day": "thursday", "start": "09:00", "end": "12:00", "enabled": true},
    {"day": "thursday", "start": "14:00", "end": "17:00", "enabled": true},
    {"day": "friday", "start": "09:00", "end": "12:00", "enabled": true},
    {"day": "friday", "start": "14:00", "end": "17:00", "enabled": true}
  ]'::jsonb,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_contractor_schedule_rules_workspace ON public.contractor_schedule_rules(workspace_id);

-- ============================================
-- 5) Contractor Pricing Table (v1)
-- ============================================
CREATE TABLE IF NOT EXISTS public.contractor_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Pricing Level
  pricing_level text CHECK (pricing_level IN ('low_pricing', 'market_average', 'premium_pricing')) DEFAULT 'market_average',
  -- Replacement Cost Ranges
  replacement_cost_min numeric(12,2),
  replacement_cost_max numeric(12,2),
  -- Repair Ranges
  repair_cost_min numeric(12,2),
  repair_cost_max numeric(12,2),
  -- Insurance Supplement Expectations
  insurance_supplement_expectation_percent numeric(5,2) DEFAULT 0.00,
  -- Pricing Adjustments
  pricing_adjustments jsonb DEFAULT '{}'::jsonb,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_contractor_pricing_workspace ON public.contractor_pricing(workspace_id);

-- ============================================
-- 6) Contractor Material Preferences Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.contractor_material_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Preferred Materials
  preferred_shingle_brand text,
  preferred_metal_panels text,
  preferred_underlayment text,
  ventilation_style text,
  gutter_preferences text,
  skylight_brands text[],
  -- Material Usage Flags
  use_in_appointment_prep boolean DEFAULT true,
  use_in_summary_panel boolean DEFAULT true,
  use_in_recommended_upgrades boolean DEFAULT true,
  use_in_sequencing_language boolean DEFAULT true,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_contractor_material_preferences_workspace ON public.contractor_material_preferences(workspace_id);

-- ============================================
-- 7) Contractor Insurance Preferences Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.contractor_insurance_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Claims Strategy
  pursue_insurance_claims boolean DEFAULT true,
  deductible_flexibility text CHECK (deductible_flexibility IN ('strict', 'flexible', 'very_flexible')) DEFAULT 'flexible',
  supplement_strategy text CHECK (supplement_strategy IN ('aggressive', 'moderate', 'conservative', 'none')) DEFAULT 'moderate',
  approval_threshold numeric(12,2), -- Minimum claim amount to pursue
  -- State Rules
  state_rules jsonb DEFAULT '{}'::jsonb,
  -- Adjuster Approach Style
  adjuster_approach_style text CHECK (adjuster_approach_style IN ('aggressive', 'collaborative', 'professional', 'friendly')) DEFAULT 'professional',
  -- Insurance Messaging Tone
  insurance_messaging_tone text CHECK (insurance_messaging_tone IN ('formal', 'professional', 'friendly', 'educational')) DEFAULT 'professional',
  -- Usage Flags
  use_in_insurance_brain boolean DEFAULT true,
  use_in_tasking boolean DEFAULT true,
  use_in_sequences boolean DEFAULT true,
  use_in_summary boolean DEFAULT true,
  use_in_storm_intel boolean DEFAULT true,
  use_in_scripts boolean DEFAULT true,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_contractor_insurance_preferences_workspace ON public.contractor_insurance_preferences(workspace_id);

-- ============================================
-- 8) Contractor Roles Table (Crew Structure & Roles)
-- ============================================
CREATE TABLE IF NOT EXISTS public.contractor_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Role Type
  role_type text NOT NULL CHECK (role_type IN ('owner_operator', 'sales_rep', 'repair_tech', 'storm_rep', 'office_manager', 'insurance_specialist', 'metal_specialist', 'tile_specialist')),
  -- Role Configuration
  scheduling_rules jsonb DEFAULT '{}'::jsonb,
  assignment_preferences jsonb DEFAULT '{}'::jsonb,
  availability jsonb DEFAULT '{}'::jsonb,
  skill_focus text[],
  -- Auto-Assignment Rules
  auto_assign_metal_leads boolean DEFAULT false,
  auto_assign_tile_leads boolean DEFAULT false,
  auto_assign_storm_leads boolean DEFAULT false,
  auto_assign_insurance_leads boolean DEFAULT false,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contractor_roles_workspace ON public.contractor_roles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_contractor_roles_user ON public.contractor_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_contractor_roles_type ON public.contractor_roles(role_type);

-- ============================================
-- 9) Contractor Quote & Estimate Preferences Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.contractor_quote_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Quote Template
  quote_template_id uuid,
  -- Deposit Rules
  deposit_required boolean DEFAULT true,
  deposit_percent numeric(5,2) DEFAULT 20.00 CHECK (deposit_percent >= 0 AND deposit_percent <= 100),
  deposit_min_amount numeric(12,2),
  -- Financing Options
  financing_options_enabled boolean DEFAULT false,
  financing_providers text[],
  -- Insurance Supplement Layout
  insurance_supplement_layout text CHECK (insurance_supplement_layout IN ('detailed', 'summary', 'line_items', 'none')) DEFAULT 'detailed',
  -- Pricing Format
  pricing_format text CHECK (pricing_format IN ('itemized', 'non_itemized', 'hybrid')) DEFAULT 'itemized',
  -- Usage Flags
  use_in_summary boolean DEFAULT true,
  use_in_appointment_prep boolean DEFAULT true,
  use_in_value_estimator boolean DEFAULT true,
  use_in_insurance_recommendations boolean DEFAULT true,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_contractor_quote_preferences_workspace ON public.contractor_quote_preferences(workspace_id);

-- ============================================
-- 10) Regional Adjustment Engine Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.contractor_regional_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Region Data (JSONB for flexibility)
  region_data jsonb DEFAULT '{
    "local_labor_cost": null,
    "material_cost": null,
    "insurance_claim_patterns": {},
    "hail_wind_severity": null,
    "code_requirements": {},
    "season_timing": {},
    "roof_type_commonality": {}
  }'::jsonb,
  -- Primary Region
  primary_region text,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_contractor_regional_data_workspace ON public.contractor_regional_data(workspace_id);

-- ============================================
-- 11) Updated_at Triggers
-- ============================================
CREATE OR REPLACE FUNCTION public.set_contractor_profile_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contractor_profile_updated_at ON public.contractor_profile;
CREATE TRIGGER trg_contractor_profile_updated_at
BEFORE UPDATE ON public.contractor_profile
FOR EACH ROW
EXECUTE FUNCTION public.set_contractor_profile_updated_at();

DROP TRIGGER IF EXISTS trg_contractor_services_updated_at ON public.contractor_services;
CREATE TRIGGER trg_contractor_services_updated_at
BEFORE UPDATE ON public.contractor_services
FOR EACH ROW
EXECUTE FUNCTION public.set_contractor_profile_updated_at();

DROP TRIGGER IF EXISTS trg_contractor_territory_updated_at ON public.contractor_territory;
CREATE TRIGGER trg_contractor_territory_updated_at
BEFORE UPDATE ON public.contractor_territory
FOR EACH ROW
EXECUTE FUNCTION public.set_contractor_profile_updated_at();

DROP TRIGGER IF EXISTS trg_contractor_schedule_rules_updated_at ON public.contractor_schedule_rules;
CREATE TRIGGER trg_contractor_schedule_rules_updated_at
BEFORE UPDATE ON public.contractor_schedule_rules
FOR EACH ROW
EXECUTE FUNCTION public.set_contractor_profile_updated_at();

DROP TRIGGER IF EXISTS trg_contractor_pricing_updated_at ON public.contractor_pricing;
CREATE TRIGGER trg_contractor_pricing_updated_at
BEFORE UPDATE ON public.contractor_pricing
FOR EACH ROW
EXECUTE FUNCTION public.set_contractor_profile_updated_at();

DROP TRIGGER IF EXISTS trg_contractor_material_preferences_updated_at ON public.contractor_material_preferences;
CREATE TRIGGER trg_contractor_material_preferences_updated_at
BEFORE UPDATE ON public.contractor_material_preferences
FOR EACH ROW
EXECUTE FUNCTION public.set_contractor_profile_updated_at();

DROP TRIGGER IF EXISTS trg_contractor_insurance_preferences_updated_at ON public.contractor_insurance_preferences;
CREATE TRIGGER trg_contractor_insurance_preferences_updated_at
BEFORE UPDATE ON public.contractor_insurance_preferences
FOR EACH ROW
EXECUTE FUNCTION public.set_contractor_profile_updated_at();

DROP TRIGGER IF EXISTS trg_contractor_roles_updated_at ON public.contractor_roles;
CREATE TRIGGER trg_contractor_roles_updated_at
BEFORE UPDATE ON public.contractor_roles
FOR EACH ROW
EXECUTE FUNCTION public.set_contractor_profile_updated_at();

DROP TRIGGER IF EXISTS trg_contractor_quote_preferences_updated_at ON public.contractor_quote_preferences;
CREATE TRIGGER trg_contractor_quote_preferences_updated_at
BEFORE UPDATE ON public.contractor_quote_preferences
FOR EACH ROW
EXECUTE FUNCTION public.set_contractor_profile_updated_at();

DROP TRIGGER IF EXISTS trg_contractor_regional_data_updated_at ON public.contractor_regional_data;
CREATE TRIGGER trg_contractor_regional_data_updated_at
BEFORE UPDATE ON public.contractor_regional_data
FOR EACH ROW
EXECUTE FUNCTION public.set_contractor_profile_updated_at();

-- ============================================
-- 12) RLS Policies
-- ============================================
ALTER TABLE public.contractor_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_territory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_schedule_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_material_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_insurance_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_quote_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_regional_data ENABLE ROW LEVEL SECURITY;

-- Helper function to check workspace membership
CREATE OR REPLACE FUNCTION public.is_contractor_profile_member(
  p_workspace_id uuid,
  p_user_id uuid,
  p_required_role text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = p_user_id
      AND (p_required_role IS NULL OR role::text = p_required_role)
  );
$$;

-- Contractor Profile: Owners/Admins can read/write, others can read
CREATE POLICY IF NOT EXISTS "contractor_profile_read"
ON public.contractor_profile
FOR SELECT
USING (
  is_contractor_profile_member(workspace_id, auth.uid(), NULL)
);

CREATE POLICY IF NOT EXISTS "contractor_profile_write"
ON public.contractor_profile
FOR ALL
USING (
  is_contractor_profile_member(workspace_id, auth.uid(), 'owner') OR
  is_contractor_profile_member(workspace_id, auth.uid(), 'admin')
)
WITH CHECK (
  is_contractor_profile_member(workspace_id, auth.uid(), 'owner') OR
  is_contractor_profile_member(workspace_id, auth.uid(), 'admin')
);

-- Contractor Services: Same as profile
CREATE POLICY IF NOT EXISTS "contractor_services_read"
ON public.contractor_services
FOR SELECT
USING (
  is_contractor_profile_member(workspace_id, auth.uid(), NULL)
);

CREATE POLICY IF NOT EXISTS "contractor_services_write"
ON public.contractor_services
FOR ALL
USING (
  is_contractor_profile_member(workspace_id, auth.uid(), 'owner') OR
  is_contractor_profile_member(workspace_id, auth.uid(), 'admin')
)
WITH CHECK (
  is_contractor_profile_member(workspace_id, auth.uid(), 'owner') OR
  is_contractor_profile_member(workspace_id, auth.uid(), 'admin')
);

-- Contractor Territory: Same as profile
CREATE POLICY IF NOT EXISTS "contractor_territory_read"
ON public.contractor_territory
FOR SELECT
USING (
  is_contractor_profile_member(workspace_id, auth.uid(), NULL)
);

CREATE POLICY IF NOT EXISTS "contractor_territory_write"
ON public.contractor_territory
FOR ALL
USING (
  is_contractor_profile_member(workspace_id, auth.uid(), 'owner') OR
  is_contractor_profile_member(workspace_id, auth.uid(), 'admin')
)
WITH CHECK (
  is_contractor_profile_member(workspace_id, auth.uid(), 'owner') OR
  is_contractor_profile_member(workspace_id, auth.uid(), 'admin')
);

-- Contractor Schedule Rules: Owners/Admins/Managers can write
CREATE POLICY IF NOT EXISTS "contractor_schedule_rules_read"
ON public.contractor_schedule_rules
FOR SELECT
USING (
  is_contractor_profile_member(workspace_id, auth.uid(), NULL)
);

CREATE POLICY IF NOT EXISTS "contractor_schedule_rules_write"
ON public.contractor_schedule_rules
FOR ALL
USING (
  is_contractor_profile_member(workspace_id, auth.uid(), 'owner') OR
  is_contractor_profile_member(workspace_id, auth.uid(), 'admin') OR
  is_contractor_profile_member(workspace_id, auth.uid(), 'manager')
)
WITH CHECK (
  is_contractor_profile_member(workspace_id, auth.uid(), 'owner') OR
  is_contractor_profile_member(workspace_id, auth.uid(), 'admin') OR
  is_contractor_profile_member(workspace_id, auth.uid(), 'manager')
);

-- Contractor Pricing: Owners/Admins only
CREATE POLICY IF NOT EXISTS "contractor_pricing_read"
ON public.contractor_pricing
FOR SELECT
USING (
  is_contractor_profile_member(workspace_id, auth.uid(), NULL)
);

CREATE POLICY IF NOT EXISTS "contractor_pricing_write"
ON public.contractor_pricing
FOR ALL
USING (
  is_contractor_profile_member(workspace_id, auth.uid(), 'owner') OR
  is_contractor_profile_member(workspace_id, auth.uid(), 'admin')
)
WITH CHECK (
  is_contractor_profile_member(workspace_id, auth.uid(), 'owner') OR
  is_contractor_profile_member(workspace_id, auth.uid(), 'admin')
);

-- Contractor Material Preferences: Owners/Admins can write
CREATE POLICY IF NOT EXISTS "contractor_material_preferences_read"
ON public.contractor_material_preferences
FOR SELECT
USING (
  is_contractor_profile_member(workspace_id, auth.uid(), NULL)
);

CREATE POLICY IF NOT EXISTS "contractor_material_preferences_write"
ON public.contractor_material_preferences
FOR ALL
USING (
  is_contractor_profile_member(workspace_id, auth.uid(), 'owner') OR
  is_contractor_profile_member(workspace_id, auth.uid(), 'admin')
)
WITH CHECK (
  is_contractor_profile_member(workspace_id, auth.uid(), 'owner') OR
  is_contractor_profile_member(workspace_id, auth.uid(), 'admin')
);

-- Contractor Insurance Preferences: Owners/Admins can write
CREATE POLICY IF NOT EXISTS "contractor_insurance_preferences_read"
ON public.contractor_insurance_preferences
FOR SELECT
USING (
  is_contractor_profile_member(workspace_id, auth.uid(), NULL)
);

CREATE POLICY IF NOT EXISTS "contractor_insurance_preferences_write"
ON public.contractor_insurance_preferences
FOR ALL
USING (
  is_contractor_profile_member(workspace_id, auth.uid(), 'owner') OR
  is_contractor_profile_member(workspace_id, auth.uid(), 'admin')
)
WITH CHECK (
  is_contractor_profile_member(workspace_id, auth.uid(), 'owner') OR
  is_contractor_profile_member(workspace_id, auth.uid(), 'admin')
);

-- Contractor Roles: Owners/Admins can write, all can read
CREATE POLICY IF NOT EXISTS "contractor_roles_read"
ON public.contractor_roles
FOR SELECT
USING (
  is_contractor_profile_member(workspace_id, auth.uid(), NULL)
);

CREATE POLICY IF NOT EXISTS "contractor_roles_write"
ON public.contractor_roles
FOR ALL
USING (
  is_contractor_profile_member(workspace_id, auth.uid(), 'owner') OR
  is_contractor_profile_member(workspace_id, auth.uid(), 'admin')
)
WITH CHECK (
  is_contractor_profile_member(workspace_id, auth.uid(), 'owner') OR
  is_contractor_profile_member(workspace_id, auth.uid(), 'admin')
);

-- Contractor Quote Preferences: Owners/Admins can write
CREATE POLICY IF NOT EXISTS "contractor_quote_preferences_read"
ON public.contractor_quote_preferences
FOR SELECT
USING (
  is_contractor_profile_member(workspace_id, auth.uid(), NULL)
);

CREATE POLICY IF NOT EXISTS "contractor_quote_preferences_write"
ON public.contractor_quote_preferences
FOR ALL
USING (
  is_contractor_profile_member(workspace_id, auth.uid(), 'owner') OR
  is_contractor_profile_member(workspace_id, auth.uid(), 'admin')
)
WITH CHECK (
  is_contractor_profile_member(workspace_id, auth.uid(), 'owner') OR
  is_contractor_profile_member(workspace_id, auth.uid(), 'admin')
);

-- Contractor Regional Data: Owners/Admins can write
CREATE POLICY IF NOT EXISTS "contractor_regional_data_read"
ON public.contractor_regional_data
FOR SELECT
USING (
  is_contractor_profile_member(workspace_id, auth.uid(), NULL)
);

CREATE POLICY IF NOT EXISTS "contractor_regional_data_write"
ON public.contractor_regional_data
FOR ALL
USING (
  is_contractor_profile_member(workspace_id, auth.uid(), 'owner') OR
  is_contractor_profile_member(workspace_id, auth.uid(), 'admin')
)
WITH CHECK (
  is_contractor_profile_member(workspace_id, auth.uid(), 'owner') OR
  is_contractor_profile_member(workspace_id, auth.uid(), 'admin')
);

-- ============================================
-- 13) Comments
-- ============================================
COMMENT ON TABLE public.contractor_profile IS 'Main contractor profile: company identity, business focus, emergency settings, workflow preferences, and business health metrics';
COMMENT ON TABLE public.contractor_services IS 'Services offered by contractor: used for lead filtering, appointment types, email templates, and task types';
COMMENT ON TABLE public.contractor_territory IS 'Service territory engine: ZIP codes, neighborhoods, counties, travel radius, excluded zones - controls targeting, booking, personalization';
COMMENT ON TABLE public.contractor_schedule_rules IS 'Scheduling rules: hours, lunch breaks, travel buffers, appointment types, weekend rules, emergency slots, daylight restrictions';
COMMENT ON TABLE public.contractor_pricing IS 'Pricing level and ranges: low/market/premium pricing, replacement/repair ranges, insurance supplement expectations';
COMMENT ON TABLE public.contractor_material_preferences IS 'Material preferences: preferred brands for shingles, metal, underlayment, ventilation, gutters, skylights';
COMMENT ON TABLE public.contractor_insurance_preferences IS 'Insurance preferences: claims strategy, deductible flexibility, supplement strategy, adjuster approach, messaging tone';
COMMENT ON TABLE public.contractor_roles IS 'Crew structure and roles: owner/operator, sales reps, repair techs, storm reps, office managers, insurance specialists with auto-assignment rules';
COMMENT ON TABLE public.contractor_quote_preferences IS 'Quote and estimate preferences: templates, deposit rules, financing options, insurance supplement layout, pricing format';
COMMENT ON TABLE public.contractor_regional_data IS 'Regional adjustment engine: local labor/material costs, insurance patterns, hail/wind severity, code requirements, season timing, roof type commonality';





















































