-- =========================================================
-- Block 37444 — SmartSend Roofing "Job Costing + Profit Calculator Engine" v1
-- Track material cost • Labor cost • Dumpster fees • Supplements • Actual profit vs projected • Warn contractor when margin is too low
-- =========================================================
-- 
-- THIS MAKES SMARTSEND A TRUE BUSINESS ENGINE — NOT JUST AUTOMATION.
-- 
-- Most roofing companies don't know their real profit on each job.
-- They THINK they made $8,000... But after materials, labor, dumpster, delivery fees,
-- supplements, fuel, change orders, punch list, repairs, crew hours...
-- They actually made $3,500 — or even LOST money.
--
-- This block gives roofers what NO OTHER CRM gives them:
-- Real job profitability in real time.
--
-- This is where SmartSend becomes the financial brain of a roofing company.

-- ============================================================================
-- PART 1 — CREATE job_costs TABLE (Main Cost Aggregation)
-- ============================================================================
-- Aggregates all costs and calculates profit/margin

CREATE TABLE IF NOT EXISTS public.job_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE UNIQUE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  
  -- Cost breakdown by category
  materials_cost numeric(12,2) DEFAULT 0,
  labor_cost numeric(12,2) DEFAULT 0,
  equipment_cost numeric(12,2) DEFAULT 0,
  dumpster_cost numeric(12,2) DEFAULT 0,
  supplements numeric(12,2) DEFAULT 0,
  change_orders numeric(12,2) DEFAULT 0,
  
  -- Revenue tracking
  projected_revenue numeric(12,2), -- From proposal/estimate
  actual_revenue numeric(12,2),     -- Final contract value
  
  -- Calculated fields
  total_cost numeric(12,2) GENERATED ALWAYS AS (
    COALESCE(materials_cost, 0) + 
    COALESCE(labor_cost, 0) + 
    COALESCE(equipment_cost, 0) + 
    COALESCE(dumpster_cost, 0) + 
    COALESCE(change_orders, 0) - 
    COALESCE(supplements, 0) -- Supplements reduce cost (insurance pays)
  ) STORED,
  
  profit numeric(12,2) GENERATED ALWAYS AS (
    COALESCE(actual_revenue, projected_revenue, 0) - 
    (COALESCE(materials_cost, 0) + 
     COALESCE(labor_cost, 0) + 
     COALESCE(equipment_cost, 0) + 
     COALESCE(dumpster_cost, 0) + 
     COALESCE(change_orders, 0) - 
     COALESCE(supplements, 0))
  ) STORED,
  
  margin numeric(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN COALESCE(actual_revenue, projected_revenue, 0) > 0 THEN
        ROUND(
          ((COALESCE(actual_revenue, projected_revenue, 0) - 
            (COALESCE(materials_cost, 0) + 
             COALESCE(labor_cost, 0) + 
             COALESCE(equipment_cost, 0) + 
             COALESCE(dumpster_cost, 0) + 
             COALESCE(change_orders, 0) - 
             COALESCE(supplements, 0))) / 
           COALESCE(actual_revenue, projected_revenue, 1)) * 100,
          2
        )
      ELSE 0
    END
  ) STORED,
  
  -- Job metrics for per-square calculations
  square_footage numeric(10,2), -- Total squares
  
  -- Timestamps
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_costs_job ON public.job_costs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_costs_team ON public.job_costs(team_id);
CREATE INDEX IF NOT EXISTS idx_job_costs_margin ON public.job_costs(margin) WHERE margin < 30; -- Index low margins for alerts

-- ============================================================================
-- PART 2 — CREATE job_cost_items TABLE (Line Item Cost Tracking)
-- ============================================================================
-- Individual cost entries with receipt uploads

CREATE TABLE IF NOT EXISTS public.job_cost_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  
  category text NOT NULL CHECK (category IN (
    'materials',
    'labor',
    'equipment',
    'dumpster',
    'supplements',
    'change_order',
    'other'
  )),
  
  -- Item details
  description text,
  vendor text,
  amount numeric(12,2) NOT NULL,
  cost_date date DEFAULT CURRENT_DATE,
  notes text,
  
  -- Receipt/document tracking
  receipt_url text, -- Storage path to uploaded receipt
  receipt_file_name text,
  
  -- Material-specific fields (optional)
  material_type text, -- 'shingles', 'underlayment', 'flashing', 'nails', 'ridge_vent', etc.
  quantity numeric(10,2),
  unit text, -- 'squares', 'rolls', 'lbs', etc.
  unit_cost numeric(10,2),
  
  -- Labor-specific fields (optional)
  crew_name text,
  hours numeric(10,2),
  hourly_rate numeric(10,2),
  
  -- Metadata
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_cost_items_job ON public.job_cost_items(job_id);
CREATE INDEX IF NOT EXISTS idx_job_cost_items_team ON public.job_cost_items(team_id);
CREATE INDEX IF NOT EXISTS idx_job_cost_items_category ON public.job_cost_items(category);
CREATE INDEX IF NOT EXISTS idx_job_cost_items_date ON public.job_cost_items(cost_date DESC);

-- ============================================================================
-- PART 3 — CREATE crew_hours TABLE (Time Tracking → Labor Cost)
-- ============================================================================
-- Crew leader logs hours, system auto-calculates labor cost

CREATE TABLE IF NOT EXISTS public.crew_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  
  crew_id uuid, -- References crews table if exists
  crew_name text, -- Fallback if crew_id not available
  
  -- Time tracking
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  total_hours numeric(10,2) GENERATED ALWAYS AS (
    CASE 
      WHEN end_time IS NOT NULL THEN
        EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0
      ELSE NULL
    END
  ) STORED,
  
  -- Cost calculation
  hourly_rate numeric(10,2) NOT NULL DEFAULT 0,
  crew_size integer DEFAULT 1,
  total_cost numeric(12,2) GENERATED ALWAYS AS (
    CASE 
      WHEN end_time IS NOT NULL THEN
        (EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0) * 
        COALESCE(hourly_rate, 0) * 
        COALESCE(crew_size, 1)
      ELSE 0
    END
  ) STORED,
  
  -- Crew member tracking
  crew_members text[], -- Array of crew member names
  
  -- Work details
  work_type text CHECK (work_type IN (
    'tear_off',
    'install',
    'repair',
    'decking',
    'other'
  )),
  issues text, -- Any problems encountered
  
  -- Metadata
  logged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crew_hours_job ON public.crew_hours(job_id);
CREATE INDEX IF NOT EXISTS idx_crew_hours_team ON public.crew_hours(team_id);
CREATE INDEX IF NOT EXISTS idx_crew_hours_crew ON public.crew_hours(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_hours_date ON public.crew_hours(start_time DESC);

-- ============================================================================
-- PART 4 — CREATE profit_warnings TABLE (Margin Alert System)
-- ============================================================================
-- Tracks profit warnings and alerts

CREATE TABLE IF NOT EXISTS public.profit_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  
  warning_type text NOT NULL CHECK (warning_type IN (
    'low_margin',
    'negative_profit',
    'labor_overage',
    'material_cost_increase',
    'supplement_denied',
    'unexpected_repair',
    'extra_crew_hours',
    'cost_variance'
  )),
  
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  
  message text NOT NULL,
  details jsonb, -- Additional context (e.g., {"threshold": 35, "current": 28, "variance": -7})
  
  -- Threshold settings (per team/user preference)
  margin_threshold numeric(5,2), -- e.g., 35% minimum margin
  
  -- Status
  acknowledged boolean DEFAULT false,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_profit_warnings_job ON public.profit_warnings(job_id);
CREATE INDEX IF NOT EXISTS idx_profit_warnings_team ON public.profit_warnings(team_id);
CREATE INDEX IF NOT EXISTS idx_profit_warnings_unacknowledged ON public.profit_warnings(acknowledged) WHERE acknowledged = false;
CREATE INDEX IF NOT EXISTS idx_profit_warnings_type ON public.profit_warnings(warning_type);

-- ============================================================================
-- PART 5 — CREATE team_profit_settings TABLE (Margin Thresholds)
-- ============================================================================
-- Per-team profit margin preferences

CREATE TABLE IF NOT EXISTS public.team_profit_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE UNIQUE,
  
  -- Margin thresholds
  minimum_margin_percent numeric(5,2) DEFAULT 35.00, -- Default 35% minimum
  warning_margin_percent numeric(5,2) DEFAULT 30.00, -- Warn at 30%
  critical_margin_percent numeric(5,2) DEFAULT 20.00, -- Critical at 20%
  
  -- Labor cost defaults
  default_hourly_rate numeric(10,2) DEFAULT 0,
  default_crew_size integer DEFAULT 1,
  
  -- Auto-calculate settings
  auto_calculate_profit boolean DEFAULT true,
  auto_create_warnings boolean DEFAULT true,
  
  -- Timestamps
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_profit_settings_team ON public.team_profit_settings(team_id);

-- ============================================================================
-- PART 6 — FUNCTIONS
-- ============================================================================

-- Function: Calculate job profit (updates job_costs table)
CREATE OR REPLACE FUNCTION public.calculate_job_profit(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job public.jobs%rowtype;
  v_materials_total numeric(12,2) := 0;
  v_labor_total numeric(12,2) := 0;
  v_equipment_total numeric(12,2) := 0;
  v_dumpster_total numeric(12,2) := 0;
  v_supplements_total numeric(12,2) := 0;
  v_change_orders_total numeric(12,2) := 0;
  v_crew_hours_total numeric(12,2) := 0;
  v_result jsonb;
BEGIN
  -- Get job details
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Job not found');
  END IF;
  
  -- Sum cost items by category
  SELECT 
    COALESCE(SUM(amount) FILTER (WHERE category = 'materials'), 0),
    COALESCE(SUM(amount) FILTER (WHERE category = 'labor'), 0),
    COALESCE(SUM(amount) FILTER (WHERE category = 'equipment'), 0),
    COALESCE(SUM(amount) FILTER (WHERE category = 'dumpster'), 0),
    COALESCE(SUM(amount) FILTER (WHERE category = 'supplements'), 0),
    COALESCE(SUM(amount) FILTER (WHERE category = 'change_order'), 0)
  INTO 
    v_materials_total,
    v_labor_total,
    v_equipment_total,
    v_dumpster_total,
    v_supplements_total,
    v_change_orders_total
  FROM public.job_cost_items
  WHERE job_id = p_job_id;
  
  -- Sum crew hours labor cost
  SELECT COALESCE(SUM(total_cost), 0)
  INTO v_crew_hours_total
  FROM public.crew_hours
  WHERE job_id = p_job_id;
  
  -- Add crew hours to labor total
  v_labor_total := v_labor_total + v_crew_hours_total;
  
  -- Upsert job_costs record
  INSERT INTO public.job_costs (
    job_id,
    team_id,
    materials_cost,
    labor_cost,
    equipment_cost,
    dumpster_cost,
    supplements,
    change_orders,
    projected_revenue,
    actual_revenue
  )
  VALUES (
    p_job_id,
    v_job.team_id,
    v_materials_total,
    v_labor_total,
    v_equipment_total,
    v_dumpster_total,
    v_supplements_total,
    v_change_orders_total,
    v_job.contract_value,
    v_job.contract_value
  )
  ON CONFLICT (job_id) DO UPDATE SET
    team_id = EXCLUDED.team_id,
    materials_cost = EXCLUDED.materials_cost,
    labor_cost = EXCLUDED.labor_cost,
    equipment_cost = EXCLUDED.equipment_cost,
    dumpster_cost = EXCLUDED.dumpster_cost,
    supplements = EXCLUDED.supplements,
    change_orders = EXCLUDED.change_orders,
    projected_revenue = EXCLUDED.projected_revenue,
    actual_revenue = EXCLUDED.actual_revenue,
    updated_at = now();
  
  -- Get calculated values
  SELECT jsonb_build_object(
    'profit', profit,
    'margin', margin,
    'total_cost', total_cost,
    'materials_cost', materials_cost,
    'labor_cost', labor_cost,
    'equipment_cost', equipment_cost,
    'dumpster_cost', dumpster_cost,
    'supplements', supplements,
    'change_orders', change_orders
  )
  INTO v_result
  FROM public.job_costs
  WHERE job_id = p_job_id;
  
  -- Check for profit warnings
  PERFORM public.check_profit_warnings(p_job_id);
  
  RETURN v_result;
END;
$$;

-- Function: Check and create profit warnings
CREATE OR REPLACE FUNCTION public.check_profit_warnings(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job public.jobs%rowtype;
  v_costs public.job_costs%rowtype;
  v_settings public.team_profit_settings%rowtype;
  v_margin numeric(5,2);
  v_threshold numeric(5,2);
  v_existing_warning boolean;
BEGIN
  -- Get job and costs
  SELECT * INTO v_job FROM public.jobs WHERE id = p_job_id;
  SELECT * INTO v_costs FROM public.job_costs WHERE job_id = p_job_id;
  
  IF NOT FOUND OR v_costs IS NULL THEN
    RETURN;
  END IF;
  
  -- Get team settings (or use defaults)
  SELECT * INTO v_settings 
  FROM public.team_profit_settings 
  WHERE team_id = v_job.team_id;
  
  v_margin := COALESCE(v_costs.margin, 0);
  v_threshold := COALESCE(v_settings.minimum_margin_percent, 35.00);
  
  -- Check for low margin warning
  IF v_margin < v_threshold AND v_margin >= 0 THEN
    -- Check if warning already exists
    SELECT EXISTS(
      SELECT 1 FROM public.profit_warnings
      WHERE job_id = p_job_id
      AND warning_type = 'low_margin'
      AND acknowledged = false
    ) INTO v_existing_warning;
    
    IF NOT v_existing_warning THEN
      INSERT INTO public.profit_warnings (
        job_id,
        team_id,
        warning_type,
        severity,
        message,
        details,
        margin_threshold
      )
      VALUES (
        p_job_id,
        v_job.team_id,
        'low_margin',
        CASE 
          WHEN v_margin < COALESCE(v_settings.critical_margin_percent, 20.00) THEN 'critical'
          WHEN v_margin < COALESCE(v_settings.warning_margin_percent, 30.00) THEN 'high'
          ELSE 'medium'
        END,
        format('Profit margin on job is %.2f%%, below threshold of %.2f%%', v_margin, v_threshold),
        jsonb_build_object(
          'current_margin', v_margin,
          'threshold', v_threshold,
          'variance', v_margin - v_threshold
        ),
        v_threshold
      );
    END IF;
  END IF;
  
  -- Check for negative profit
  IF v_costs.profit < 0 THEN
    SELECT EXISTS(
      SELECT 1 FROM public.profit_warnings
      WHERE job_id = p_job_id
      AND warning_type = 'negative_profit'
      AND acknowledged = false
    ) INTO v_existing_warning;
    
    IF NOT v_existing_warning THEN
      INSERT INTO public.profit_warnings (
        job_id,
        team_id,
        warning_type,
        severity,
        message,
        details
      )
      VALUES (
        p_job_id,
        v_job.team_id,
        'negative_profit',
        'critical',
        format('Job is losing money: $%.2f', v_costs.profit),
        jsonb_build_object(
          'profit', v_costs.profit,
          'revenue', COALESCE(v_costs.actual_revenue, v_costs.projected_revenue, 0),
          'total_cost', v_costs.total_cost
        )
      );
    END IF;
  END IF;
END;
$$;

-- Trigger: Auto-calculate profit when cost items change
CREATE OR REPLACE FUNCTION public.trigger_calculate_job_profit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.calculate_job_profit(COALESCE(NEW.job_id, OLD.job_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_calculate_profit_on_cost_item ON public.job_cost_items;
CREATE TRIGGER trg_calculate_profit_on_cost_item
AFTER INSERT OR UPDATE OR DELETE ON public.job_cost_items
FOR EACH ROW
EXECUTE FUNCTION public.trigger_calculate_job_profit();

DROP TRIGGER IF EXISTS trg_calculate_profit_on_crew_hours ON public.crew_hours;
CREATE TRIGGER trg_calculate_profit_on_crew_hours
AFTER INSERT OR UPDATE OR DELETE ON public.crew_hours
FOR EACH ROW
EXECUTE FUNCTION public.trigger_calculate_job_profit();

-- Trigger: Update updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_cost_items_updated_at ON public.job_cost_items;
CREATE TRIGGER trg_job_cost_items_updated_at
BEFORE UPDATE ON public.job_cost_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_crew_hours_updated_at ON public.crew_hours;
CREATE TRIGGER trg_crew_hours_updated_at
BEFORE UPDATE ON public.crew_hours
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.job_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_cost_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crew_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profit_warnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_profit_settings ENABLE ROW LEVEL SECURITY;

-- Job costs: Team members can access
CREATE POLICY "job_costs_team_member" ON public.job_costs
  FOR ALL USING (
    team_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.team_members 
      WHERE team_id = job_costs.team_id AND user_id = auth.uid()
    )
  );

-- Job cost items: Team members can access
CREATE POLICY "job_cost_items_team_member" ON public.job_cost_items
  FOR ALL USING (
    team_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.team_members 
      WHERE team_id = job_cost_items.team_id AND user_id = auth.uid()
    )
  );

-- Crew hours: Team members can access
CREATE POLICY "crew_hours_team_member" ON public.crew_hours
  FOR ALL USING (
    team_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.team_members 
      WHERE team_id = crew_hours.team_id AND user_id = auth.uid()
    )
  );

-- Profit warnings: Team members can access
CREATE POLICY "profit_warnings_team_member" ON public.profit_warnings
  FOR ALL USING (
    team_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.team_members 
      WHERE team_id = profit_warnings.team_id AND user_id = auth.uid()
    )
  );

-- Team profit settings: Team members can view, owners/managers can modify
CREATE POLICY "team_profit_settings_view" ON public.team_profit_settings
  FOR SELECT USING (
    team_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.team_members 
      WHERE team_id = team_profit_settings.team_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "team_profit_settings_modify" ON public.team_profit_settings
  FOR ALL USING (
    team_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.team_members 
      WHERE team_id = team_profit_settings.team_id 
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'manager')
    )
  );

-- ============================================================================
-- PART 8 — STORAGE BUCKET FOR RECEIPTS
-- ============================================================================

-- Create storage bucket for cost receipts
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'job-cost-receipts',
  'job-cost-receipts',
  false, -- private bucket
  10485760, -- 10 MB limit per file
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for job-cost-receipts bucket
CREATE POLICY IF NOT EXISTS "job_cost_receipts_team_member_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'job-cost-receipts'
    AND EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id::text = (storage.foldername(name))[1]
        AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "job_cost_receipts_team_member_read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'job-cost-receipts'
    AND EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id::text = (storage.foldername(name))[1]
        AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY IF NOT EXISTS "job_cost_receipts_team_member_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'job-cost-receipts'
    AND EXISTS(
      SELECT 1 FROM public.jobs j
      JOIN public.team_members tm ON j.team_id = tm.team_id
      WHERE j.id::text = (storage.foldername(name))[1]
        AND tm.user_id = auth.uid()
    )
  );

-- Service role can do everything
CREATE POLICY IF NOT EXISTS "job_cost_receipts_service_role_full_access"
  ON storage.objects
  TO service_role
  FOR ALL
  USING (bucket_id = 'job-cost-receipts')
  WITH CHECK (bucket_id = 'job-cost-receipts');
































