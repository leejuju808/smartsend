-- ============================================================
-- Block 255500 — SmartSend Repair Division Engine v1
-- Fast Repair Intake, Pricing Matrix, Auto-Diagnosis, 
-- Technician Routing, Same-Day Scheduling, Repair Photos & Warranty
-- ============================================================
-- 
-- This block turns SmartSend into the repair division machine 
-- that roofing companies desperately need.
-- 
-- Repairs = pure profit.
-- But roofing companies FAIL at repairs because:
-- - no system for booking repairs
-- - no pricing structure
-- - no routing logic
-- - no quick intake form
-- - techs don't take photos
-- - office forgets repairs
-- - repairs get lost in notebooks
-- - customers wait forever
-- - jobs are undercharged or overcharged
-- - no record of what was done
-- - no warranty log
-- - no follow-up
-- 
-- SmartSend fixes ALL OF IT.
-- ============================================================

-- ============================================================================
-- PART 1 — REPAIR_REQUESTS TABLE
-- ============================================================================
-- Customer repair requests with AI-powered analysis

CREATE TABLE IF NOT EXISTS public.repair_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  
  -- Contact information (if new customer)
  customer_name text,
  customer_phone text,
  customer_email text,
  address text NOT NULL,
  city text,
  state text,
  zip_code text,
  
  -- Problem description
  description text NOT NULL,
  photos text[] DEFAULT '{}', -- Array of photo URLs
  
  -- AI-powered analysis
  ai_issue_prediction text, -- AI-predicted issue type
  ai_predicted_repair_type text, -- e.g., 'pipe_boot_replacement', 'shingle_repair', 'chimney_flashing'
  ai_estimated_cost_min numeric(10,2),
  ai_estimated_cost_max numeric(10,2),
  ai_estimated_time_minutes int,
  ai_materials_needed text[], -- Array of materials
  ai_skill_level_required text CHECK (ai_skill_level_required IN ('basic', 'intermediate', 'advanced', 'expert')),
  ai_confidence_score numeric(5,2) CHECK (ai_confidence_score >= 0 AND ai_confidence_score <= 100),
  ai_analysis_metadata jsonb DEFAULT '{}'::jsonb, -- Full AI analysis details
  
  -- Urgency classification
  urgency text NOT NULL DEFAULT 'medium' CHECK (urgency IN ('low', 'medium', 'high', 'emergency')),
  
  -- Status tracking
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'diagnosed', 'scheduled', 'in_progress', 'completed', 'cancelled')),
  
  -- Scheduling
  preferred_date date,
  preferred_time_range text, -- e.g., 'morning', 'afternoon', 'evening', 'anytime'
  
  -- Assignment
  assigned_tech_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  
  -- Completion tracking
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  
  -- Upsell opportunity
  replacement_recommended boolean DEFAULT false,
  replacement_reason text,
  insurance_evaluation_recommended boolean DEFAULT false,
  
  -- Metadata
  source text DEFAULT 'web_form' CHECK (source IN ('web_form', 'phone', 'email', 'portal', 'mobile', 'api')),
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for repair_requests
CREATE INDEX IF NOT EXISTS idx_repair_requests_team ON public.repair_requests(team_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repair_requests_customer ON public.repair_requests(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_repair_requests_status ON public.repair_requests(status, urgency, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repair_requests_tech ON public.repair_requests(assigned_tech_id, status) WHERE assigned_tech_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_repair_requests_urgency ON public.repair_requests(urgency, status) WHERE status IN ('new', 'diagnosed', 'scheduled');
CREATE INDEX IF NOT EXISTS idx_repair_requests_created_at ON public.repair_requests(created_at DESC);

-- ============================================================================
-- PART 2 — REPAIR_JOBS TABLE
-- ============================================================================
-- Scheduled and completed repair jobs

CREATE TABLE IF NOT EXISTS public.repair_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_request_id uuid NOT NULL REFERENCES public.repair_requests(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  
  -- Technician assignment
  tech_id uuid NOT NULL REFERENCES public.crew_members(id) ON DELETE RESTRICT,
  
  -- Scheduling
  scheduled_time timestamptz NOT NULL,
  scheduled_date date NOT NULL GENERATED ALWAYS AS (scheduled_time::date) STORED,
  estimated_duration_minutes int,
  actual_duration_minutes int,
  
  -- Pricing
  price numeric(10,2) NOT NULL,
  price_breakdown jsonb DEFAULT '{}'::jsonb, -- {
    --   "labor": 150.00,
    --   "materials": 75.00,
    --   "travel": 25.00,
    --   "total": 250.00
    -- }
  
  -- Work performed
  findings jsonb DEFAULT '{}'::jsonb, -- Tech's findings on-site
  work_performed text, -- Description of work done
  materials_used jsonb DEFAULT '{}'::jsonb, -- {
    --   "pipe_boot": 1,
    --   "caulk_tubes": 2,
    --   "shingles": 3
    -- }
  
  -- Photos (organized by stage)
  photos_before text[] DEFAULT '{}',
  photos_during text[] DEFAULT '{}',
  photos_after text[] DEFAULT '{}',
  
  -- Status tracking
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'en_route', 'on_site', 'in_progress', 'completed', 'cancelled', 'no_show')),
  
  -- Completion details
  completed_at timestamptz,
  customer_satisfaction_score int CHECK (customer_satisfaction_score >= 1 AND customer_satisfaction_score <= 5),
  customer_feedback text,
  
  -- Payment
  payment_status text DEFAULT 'pending' CHECK (payment_status IN ('pending', 'partial', 'paid', 'refunded')),
  payment_method text,
  paid_at timestamptz,
  
  -- Metadata
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for repair_jobs
CREATE INDEX IF NOT EXISTS idx_repair_jobs_request ON public.repair_jobs(repair_request_id);
CREATE INDEX IF NOT EXISTS idx_repair_jobs_team ON public.repair_jobs(team_id, status, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_repair_jobs_tech ON public.repair_jobs(tech_id, scheduled_date, status);
CREATE INDEX IF NOT EXISTS idx_repair_jobs_scheduled_date ON public.repair_jobs(scheduled_date, status) WHERE status IN ('scheduled', 'en_route', 'on_site', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_repair_jobs_status ON public.repair_jobs(status, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_repair_jobs_payment ON public.repair_jobs(payment_status) WHERE payment_status != 'paid';

-- ============================================================================
-- PART 3 — REPAIR_WARRANTIES TABLE
-- ============================================================================
-- Warranty tracking for completed repairs

CREATE TABLE IF NOT EXISTS public.repair_warranties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repair_job_id uuid NOT NULL REFERENCES public.repair_jobs(id) ON DELETE CASCADE,
  repair_request_id uuid NOT NULL REFERENCES public.repair_requests(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  
  -- Warranty details
  warranty_length_days int NOT NULL, -- e.g., 30, 90, 365
  warranty_type text NOT NULL DEFAULT 'standard' CHECK (warranty_type IN ('standard', 'extended', 'workmanship', 'material')),
  warranty_starts_at timestamptz NOT NULL DEFAULT now(),
  warranty_ends_at timestamptz NOT NULL GENERATED ALWAYS AS (warranty_starts_at + (warranty_length_days || ' days')::interval) STORED,
  
  -- Coverage
  covered_items text[] NOT NULL, -- e.g., ['pipe_boot_installation', 'leak_recurrence']
  coverage_description text,
  
  -- Status
  is_active boolean DEFAULT true,
  is_voided boolean DEFAULT false,
  voided_at timestamptz,
  voided_reason text,
  
  -- Claims
  warranty_claims_count int DEFAULT 0,
  last_claim_at timestamptz,
  
  -- Metadata
  notes text,
  terms_and_conditions text,
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for repair_warranties
CREATE INDEX IF NOT EXISTS idx_repair_warranties_job ON public.repair_warranties(repair_job_id);
CREATE INDEX IF NOT EXISTS idx_repair_warranties_request ON public.repair_warranties(repair_request_id);
CREATE INDEX IF NOT EXISTS idx_repair_warranties_team ON public.repair_warranties(team_id, is_active);
CREATE INDEX IF NOT EXISTS idx_repair_warranties_customer ON public.repair_warranties(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_repair_warranties_active ON public.repair_warranties(is_active, warranty_ends_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_repair_warranties_expiring ON public.repair_warranties(warranty_ends_at) WHERE is_active = true AND warranty_ends_at > now();

-- ============================================================================
-- PART 4 — REPAIR_PRICING_MATRIX TABLE
-- ============================================================================
-- Company-customizable repair pricing

CREATE TABLE IF NOT EXISTS public.repair_pricing_matrix (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  
  -- Repair type
  repair_type text NOT NULL, -- e.g., 'pipe_boot_replacement', 'shingle_repair', 'chimney_flashing'
  repair_category text NOT NULL CHECK (repair_category IN ('shingles', 'flashing', 'vents', 'gutters', 'skylights', 'chimneys', 'general', 'emergency')),
  
  -- Pricing
  base_price numeric(10,2) NOT NULL CHECK (base_price > 0),
  price_min numeric(10,2), -- Optional min/max range
  price_max numeric(10,2),
  
  -- Pricing breakdown
  labor_cost numeric(10,2),
  material_cost numeric(10,2),
  travel_cost numeric(10,2) DEFAULT 0,
  
  -- Time estimates
  estimated_time_minutes int,
  estimated_time_min int,
  estimated_time_max int,
  
  -- Skill requirements
  skill_level_required text CHECK (skill_level_required IN ('basic', 'intermediate', 'advanced', 'expert')),
  
  -- Materials typically needed
  typical_materials text[], -- e.g., ['pipe_boot', 'caulk', 'shingles']
  
  -- Description
  description text,
  notes text,
  
  -- Status
  is_active boolean DEFAULT true,
  is_default boolean DEFAULT false, -- Default pricing that can be customized
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Unique constraint: one active pricing per repair type per team
  UNIQUE(team_id, repair_type) WHERE is_active = true
);

-- Indexes for repair_pricing_matrix
CREATE INDEX IF NOT EXISTS idx_repair_pricing_matrix_team ON public.repair_pricing_matrix(team_id, is_active);
CREATE INDEX IF NOT EXISTS idx_repair_pricing_matrix_category ON public.repair_pricing_matrix(repair_category, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_repair_pricing_matrix_type ON public.repair_pricing_matrix(repair_type, is_active) WHERE is_active = true;

-- ============================================================================
-- PART 5 — DEFAULT PRICING DATA
-- ============================================================================
-- Seed default repair pricing (companies can customize)

INSERT INTO public.repair_pricing_matrix (
  team_id,
  repair_type,
  repair_category,
  base_price,
  price_min,
  price_max,
  labor_cost,
  material_cost,
  estimated_time_minutes,
  skill_level_required,
  typical_materials,
  description,
  is_default
)
SELECT 
  t.id,
  'pipe_boot_replacement',
  'vents',
  275.00,
  250.00,
  350.00,
  150.00,
  75.00,
  45,
  'intermediate',
  ARRAY['pipe_boot', 'caulk', 'flashing'],
  'Replace deteriorated pipe boot and seal penetration',
  true
FROM public.teams t
WHERE NOT EXISTS (
  SELECT 1 FROM public.repair_pricing_matrix 
  WHERE team_id = t.id AND repair_type = 'pipe_boot_replacement'
)
UNION ALL
SELECT 
  t.id,
  'shingle_replacement_1_3_tabs',
  'shingles',
  250.00,
  200.00,
  300.00,
  120.00,
  80.00,
  35,
  'basic',
  ARRAY['shingles', 'nails', 'caulk'],
  'Replace 1-3 damaged shingle tabs',
  true
FROM public.teams t
WHERE NOT EXISTS (
  SELECT 1 FROM public.repair_pricing_matrix 
  WHERE team_id = t.id AND repair_type = 'shingle_replacement_1_3_tabs'
)
UNION ALL
SELECT 
  t.id,
  'chimney_counterflashing',
  'chimneys',
  450.00,
  400.00,
  550.00,
  250.00,
  150.00,
  90,
  'advanced',
  ARRAY['flashing', 'caulk', 'sealant'],
  'Repair or replace chimney counterflashing',
  true
FROM public.teams t
WHERE NOT EXISTS (
  SELECT 1 FROM public.repair_pricing_matrix 
  WHERE team_id = t.id AND repair_type = 'chimney_counterflashing'
)
UNION ALL
SELECT 
  t.id,
  'vent_reseal',
  'vents',
  175.00,
  150.00,
  225.00,
  100.00,
  50.00,
  30,
  'basic',
  ARRAY['caulk', 'sealant'],
  'Reseal roof vent to prevent leaks',
  true
FROM public.teams t
WHERE NOT EXISTS (
  SELECT 1 FROM public.repair_pricing_matrix 
  WHERE team_id = t.id AND repair_type = 'vent_reseal'
)
UNION ALL
SELECT 
  t.id,
  'gutter_reattachment',
  'gutters',
  150.00,
  125.00,
  200.00,
  100.00,
  30.00,
  25,
  'basic',
  ARRAY['screws', 'brackets'],
  'Reattach loose or sagging gutters',
  true
FROM public.teams t
WHERE NOT EXISTS (
  SELECT 1 FROM public.repair_pricing_matrix 
  WHERE team_id = t.id AND repair_type = 'gutter_reattachment'
)
UNION ALL
SELECT 
  t.id,
  'skylight_leak_reseal',
  'skylights',
  350.00,
  300.00,
  450.00,
  200.00,
  100.00,
  60,
  'intermediate',
  ARRAY['flashing', 'caulk', 'sealant'],
  'Reseal skylight to stop leaks',
  true
FROM public.teams t
WHERE NOT EXISTS (
  SELECT 1 FROM public.repair_pricing_matrix 
  WHERE team_id = t.id AND repair_type = 'skylight_leak_reseal'
);

-- ============================================================================
-- PART 6 — TRIGGERS
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_repair_division_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_repair_requests_updated_at
BEFORE UPDATE ON public.repair_requests
FOR EACH ROW
EXECUTE FUNCTION update_repair_division_updated_at();

CREATE TRIGGER trg_repair_jobs_updated_at
BEFORE UPDATE ON public.repair_jobs
FOR EACH ROW
EXECUTE FUNCTION update_repair_division_updated_at();

CREATE TRIGGER trg_repair_warranties_updated_at
BEFORE UPDATE ON public.repair_warranties
FOR EACH ROW
EXECUTE FUNCTION update_repair_division_updated_at();

CREATE TRIGGER trg_repair_pricing_matrix_updated_at
BEFORE UPDATE ON public.repair_pricing_matrix
FOR EACH ROW
EXECUTE FUNCTION update_repair_division_updated_at();

-- Auto-update repair_request status when job is created
CREATE OR REPLACE FUNCTION update_repair_request_on_job_create()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.repair_requests
  SET 
    status = 'scheduled',
    assigned_tech_id = NEW.tech_id,
    assigned_at = now()
  WHERE id = NEW.repair_request_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_repair_jobs_update_request
AFTER INSERT ON public.repair_jobs
FOR EACH ROW
EXECUTE FUNCTION update_repair_request_on_job_create();

-- Auto-update repair_request status when job is completed
CREATE OR REPLACE FUNCTION update_repair_request_on_job_complete()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE public.repair_requests
    SET 
      status = 'completed',
      completed_at = NEW.completed_at
    WHERE id = NEW.repair_request_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_repair_jobs_complete_request
AFTER UPDATE ON public.repair_jobs
FOR EACH ROW
EXECUTE FUNCTION update_repair_request_on_job_complete();

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.repair_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_warranties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repair_pricing_matrix ENABLE ROW LEVEL SECURITY;

-- RLS Policies for repair_requests
CREATE POLICY "repair_requests_team_access" ON public.repair_requests
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = repair_requests.team_id
      AND (
        t.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.team_id = t.id
          AND tm.user_id = auth.uid()
        )
      )
    )
  );

-- RLS Policies for repair_jobs
CREATE POLICY "repair_jobs_team_access" ON public.repair_jobs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = repair_jobs.team_id
      AND (
        t.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.team_id = t.id
          AND tm.user_id = auth.uid()
        )
      )
    )
  );

-- RLS Policies for repair_warranties
CREATE POLICY "repair_warranties_team_access" ON public.repair_warranties
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = repair_warranties.team_id
      AND (
        t.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.team_id = t.id
          AND tm.user_id = auth.uid()
        )
      )
    )
  );

-- RLS Policies for repair_pricing_matrix
CREATE POLICY "repair_pricing_matrix_team_access" ON public.repair_pricing_matrix
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.teams t
      WHERE t.id = repair_pricing_matrix.team_id
      AND (
        t.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.team_members tm
          WHERE tm.team_id = t.id
          AND tm.user_id = auth.uid()
        )
      )
    )
  );

-- ============================================================================
-- PART 8 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.repair_requests IS 'Block 255500: Customer repair requests with AI-powered analysis';
COMMENT ON TABLE public.repair_jobs IS 'Block 255500: Scheduled and completed repair jobs';
COMMENT ON TABLE public.repair_warranties IS 'Block 255500: Warranty tracking for completed repairs';
COMMENT ON TABLE public.repair_pricing_matrix IS 'Block 255500: Company-customizable repair pricing matrix';





















