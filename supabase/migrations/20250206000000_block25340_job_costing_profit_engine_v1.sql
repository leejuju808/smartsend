-- =========================================================
-- Block 25340 — SmartSend Roofing Job Costing & Profit Engine v1
-- (COGS Tracking • Profit Per Job • Margin Alerts • Insurance vs Retail Profitability • Real-Time Cost Intelligence)
-- =========================================================
-- 
-- THE ROOFING PROFIT ENGINE — ZERO FLUFF.
-- This is the feature that makes SmartSend not just an operations system… but a MONEY SYSTEM.
--
-- Roofers are terrible at knowing their true profit:
-- ❌ wrong labor assumptions
-- ❌ missing material costs
-- ❌ supplements not tracked
-- ❌ extra dump fees
-- ❌ wood replacement not logged
-- ❌ undercharging
-- ❌ profit showing on paper but not in reality
-- ❌ jobs priced wrong
-- ❌ crews going over labor hours
--
-- SmartSend Job Costing & Profit Engine v1 solves ALL OF IT.

-- ============================================================================
-- PART 1 — ENHANCE job_labor_costs TABLE (TOT/TOI, Crew Size, Per-Square Rates)
-- ============================================================================
-- Add detailed labor tracking fields

ALTER TABLE public.job_labor_costs
  ADD COLUMN IF NOT EXISTS tot_hours numeric(10,2) DEFAULT 0, -- Time on Tear-Off
  ADD COLUMN IF NOT EXISTS toi_hours numeric(10,2) DEFAULT 0, -- Time on Install
  ADD COLUMN IF NOT EXISTS extra_hours numeric(10,2) DEFAULT 0, -- Extra hours beyond TOT+TOI
  ADD COLUMN IF NOT EXISTS crew_size integer DEFAULT 1, -- Number of crew members
  ADD COLUMN IF NOT EXISTS labor_type text CHECK (labor_type IN ('hourly', 'per_square')) DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS per_square_rate numeric(10,2), -- If labor_type = 'per_square'
  ADD COLUMN IF NOT EXISTS squares numeric(10,2), -- Square footage for per-square calculation
  ADD COLUMN IF NOT EXISTS decking_labor_hours numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS repair_labor_hours numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_hours numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_rate_multiplier numeric(3,2) DEFAULT 1.5; -- 1.5x for overtime

-- Update total_cost calculation to handle both hourly and per-square
CREATE OR REPLACE FUNCTION public.calculate_labor_total_cost()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.labor_type = 'per_square' AND NEW.per_square_rate IS NOT NULL AND NEW.squares IS NOT NULL THEN
    NEW.total_cost := NEW.per_square_rate * NEW.squares;
  ELSE
    -- Hourly calculation: (TOT + TOI + extra + decking + repair) * hourly_rate * crew_size
    -- Plus overtime: overtime_hours * hourly_rate * overtime_rate_multiplier * crew_size
    NEW.total_cost := (
      (COALESCE(NEW.tot_hours, 0) + 
       COALESCE(NEW.toi_hours, 0) + 
       COALESCE(NEW.extra_hours, 0) + 
       COALESCE(NEW.decking_labor_hours, 0) + 
       COALESCE(NEW.repair_labor_hours, 0)) * 
      COALESCE(NEW.hourly_rate, 0) * 
      COALESCE(NEW.crew_size, 1)
    ) + (
      COALESCE(NEW.overtime_hours, 0) * 
      COALESCE(NEW.hourly_rate, 0) * 
      COALESCE(NEW.overtime_rate_multiplier, 1.5) * 
      COALESCE(NEW.crew_size, 1)
    );
  END IF;
  
  -- Also calculate hours for display
  IF NEW.hours = 0 OR NEW.hours IS NULL THEN
    NEW.hours := COALESCE(NEW.tot_hours, 0) + 
                 COALESCE(NEW.toi_hours, 0) + 
                 COALESCE(NEW.extra_hours, 0) + 
                 COALESCE(NEW.decking_labor_hours, 0) + 
                 COALESCE(NEW.repair_labor_hours, 0) + 
                 COALESCE(NEW.overtime_hours, 0);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calculate_labor_total_cost ON public.job_labor_costs;
CREATE TRIGGER trg_calculate_labor_total_cost
BEFORE INSERT OR UPDATE ON public.job_labor_costs
FOR EACH ROW
EXECUTE FUNCTION public.calculate_labor_total_cost();

-- ============================================================================
-- PART 2 — CREATE job_addon_costs TABLE (Dumpster, Wood, Repairs, Add-Ons)
-- ============================================================================
-- Track additional job costs: wood replacement, dump fees, repairs, etc.

CREATE TABLE IF NOT EXISTS public.job_addon_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  addon_type text CHECK (addon_type IN (
    'wood_replacement',      -- Plywood/decking sheets
    'dumpster',              -- Dumpster rental/dump fees
    'repair',                -- Additional repairs
    'skylight_replacement', -- Skylight replacement
    'plumbing_boot_change',  -- Plumbing boot replacement
    'permit',                -- Permit fees
    'equipment_rental',      -- Equipment rental
    'gas_travel',            -- Gas/travel costs
    'change_order',          -- Change order costs
    'other'                  -- Other add-ons
  )) NOT NULL,
  
  description text NOT NULL,
  quantity numeric(10,2) DEFAULT 1,
  unit text, -- 'sheets', 'dumpsters', 'hours', 'each', etc.
  unit_cost numeric(10,2) NOT NULL,
  total_cost numeric(10,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  
  -- Insurance supplement tracking
  is_supplement_eligible boolean DEFAULT false, -- Can this be claimed as supplement?
  supplement_status text CHECK (supplement_status IN ('not_submitted', 'submitted', 'approved', 'denied')) DEFAULT 'not_submitted',
  supplement_amount numeric(10,2), -- Amount approved/requested for supplement
  
  -- Timeline entry
  added_at timestamptz DEFAULT now(),
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_addon_costs_job_idx ON public.job_addon_costs(job_id);
CREATE INDEX IF NOT EXISTS job_addon_costs_workspace_idx ON public.job_addon_costs(workspace_id);
CREATE INDEX IF NOT EXISTS job_addon_costs_type_idx ON public.job_addon_costs(addon_type);
CREATE INDEX IF NOT EXISTS job_addon_costs_supplement_idx ON public.job_addon_costs(supplement_status) WHERE supplement_status != 'not_submitted';

ALTER TABLE public.job_addon_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view addon costs in their workspace"
  ON public.job_addon_costs FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create addon costs in their workspace"
  ON public.job_addon_costs FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update addon costs in their workspace"
  ON public.job_addon_costs FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete addon costs in their workspace"
  ON public.job_addon_costs FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 3 — ENHANCE material_orders TABLE (Actual Invoice Cost Sync)
-- ============================================================================
-- Add fields to track actual supplier invoice costs

ALTER TABLE public.material_orders
  ADD COLUMN IF NOT EXISTS actual_invoice_cost numeric(10,2), -- Actual cost from supplier invoice
  ADD COLUMN IF NOT EXISTS actual_invoice_received_at timestamptz, -- When invoice was received
  ADD COLUMN IF NOT EXISTS actual_invoice_variance_pct numeric(5,2), -- % difference from estimated
  ADD COLUMN IF NOT EXISTS invoice_synced boolean DEFAULT false; -- Whether cost was synced from invoice

-- ============================================================================
-- PART 4 — CREATE margin_alerts TABLE (Profit Protection)
-- ============================================================================
-- Track margin alerts and profit warnings

CREATE TABLE IF NOT EXISTS public.margin_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  alert_type text CHECK (alert_type IN (
    'low_margin',              -- Margin below threshold (e.g., < 30%)
    'negative_profit',         -- Job is losing money
    'material_cost_variance',  -- Material cost significantly higher than expected
    'labor_cost_overrun',      -- Labor hours exceeding target
    'supplement_opportunity',  -- Potential supplement not requested
    'cost_increase'            -- Recent cost increase dropped margin
  )) NOT NULL,
  
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  
  current_margin numeric(5,2), -- Current margin %
  threshold_margin numeric(5,2), -- Threshold that triggered alert
  current_profit numeric(10,2), -- Current profit $
  
  message text NOT NULL, -- Human-readable alert message
  suggestion text, -- Suggested action (e.g., "Ask for supplement?", "Review material waste?")
  
  acknowledged boolean DEFAULT false,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS margin_alerts_job_idx ON public.margin_alerts(job_id);
CREATE INDEX IF NOT EXISTS margin_alerts_workspace_idx ON public.margin_alerts(workspace_id);
CREATE INDEX IF NOT EXISTS margin_alerts_unresolved_idx ON public.margin_alerts(workspace_id, resolved) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS margin_alerts_severity_idx ON public.margin_alerts(severity);

ALTER TABLE public.margin_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view margin alerts in their workspace"
  ON public.margin_alerts FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage margin alerts in their workspace"
  ON public.margin_alerts FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 5 — ADD INSURANCE vs RETAIL CATEGORIZATION TO roofing_jobs
-- ============================================================================
-- Track job type for profit comparison

ALTER TABLE public.roofing_jobs
  ADD COLUMN IF NOT EXISTS job_revenue_type text CHECK (job_revenue_type IN ('insurance', 'retail', 'mixed')) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS profit_status text CHECK (profit_status IN ('strong', 'acceptable', 'at_risk', 'losing')) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS roofing_jobs_revenue_type_idx ON public.roofing_jobs(job_revenue_type) WHERE job_revenue_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS roofing_jobs_profit_status_idx ON public.roofing_jobs(profit_status) WHERE profit_status IS NOT NULL;

-- ============================================================================
-- PART 6 — ENHANCE recalc_job_financials FUNCTION (Include All Cost Types)
-- ============================================================================
-- Update profit calculation to include labor costs, addon costs, and all cost entries

CREATE OR REPLACE FUNCTION public.recalc_job_financials(p_job_id uuid)
RETURNS void AS $$
DECLARE
  v_job public.roofing_jobs%rowtype;
  v_revenue numeric;
  v_mat numeric;
  v_lab numeric;
  v_addon numeric;
  v_other numeric;
  v_total_cost numeric;
  v_profit numeric;
  v_margin numeric;
  v_profit_status text;
BEGIN
  SELECT * INTO v_job FROM public.roofing_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Revenue collected (received payments + supplements + change orders)
  SELECT COALESCE(SUM(amount), 0)
  INTO v_revenue
  FROM public.job_payments
  WHERE job_id = p_job_id
    AND status = 'received';

  -- Add supplements (from insurance claims)
  SELECT COALESCE(SUM(supplement_approved), 0)
  INTO v_revenue
  FROM v_revenue + (
    SELECT COALESCE(SUM(supplement_approved), 0)
    FROM public.job_insurance_claims
    WHERE job_id = p_job_id
  );

  -- Add approved change orders
  SELECT COALESCE(SUM(amount), 0)
  INTO v_revenue
  FROM v_revenue + (
    SELECT COALESCE(SUM(amount), 0)
    FROM public.job_change_orders
    WHERE job_id = p_job_id
      AND status = 'approved'
  );

  -- Material costs (from cost entries + actual invoice costs from material orders)
  SELECT COALESCE(SUM(amount) FILTER (WHERE category = 'materials'), 0)
  INTO v_mat
  FROM public.job_cost_entries
  WHERE job_id = p_job_id;

  -- Add actual invoice costs from material orders (if synced)
  SELECT COALESCE(SUM(COALESCE(actual_invoice_cost, total)), 0)
  INTO v_mat
  FROM v_mat + (
    SELECT COALESCE(SUM(COALESCE(actual_invoice_cost, total)), 0)
    FROM public.material_orders
    WHERE job_id = p_job_id
      AND status NOT IN ('cancelled', 'canceled')
  );

  -- Labor costs (from job_labor_costs table)
  SELECT COALESCE(SUM(total_cost), 0)
  INTO v_lab
  FROM public.job_labor_costs
  WHERE job_id = p_job_id;

  -- Add labor from cost entries (legacy)
  SELECT COALESCE(SUM(amount) FILTER (WHERE category = 'labor'), 0)
  INTO v_lab
  FROM v_lab + (
    SELECT COALESCE(SUM(amount) FILTER (WHERE category = 'labor'), 0)
    FROM public.job_cost_entries
    WHERE job_id = p_job_id
  );

  -- Addon costs (wood, dumpster, repairs, etc.)
  SELECT COALESCE(SUM(total_cost), 0)
  INTO v_addon
  FROM public.job_addon_costs
  WHERE job_id = p_job_id;

  -- Other costs (from cost entries, excluding materials and labor)
  SELECT COALESCE(SUM(amount) FILTER (WHERE category NOT IN ('materials','labor')), 0)
  INTO v_other
  FROM public.job_cost_entries
  WHERE job_id = p_job_id;

  v_total_cost := v_mat + v_lab + v_addon + v_other;
  v_profit := v_revenue - v_total_cost;

  IF v_revenue > 0 THEN
    v_margin := (v_profit / v_revenue) * 100;
  ELSE
    v_margin := 0;
  END IF;

  -- Determine profit status
  IF v_profit < 0 THEN
    v_profit_status := 'losing';
  ELSIF v_margin < 20 THEN
    v_profit_status := 'at_risk';
  ELSIF v_margin < 30 THEN
    v_profit_status := 'acceptable';
  ELSE
    v_profit_status := 'strong';
  END IF;

  UPDATE public.roofing_jobs
  SET
    revenue_collected = v_revenue,
    actual_material_cost = v_mat,
    actual_labor_cost = v_lab,
    actual_other_cost = v_addon + v_other,
    actual_total_cost = v_total_cost,
    actual_gross_profit = v_profit,
    actual_margin_pct = v_margin,
    profit_status = v_profit_status,
    updated_at = now()
  WHERE id = p_job_id;

  -- Trigger margin alerts if needed
  PERFORM public.check_margin_alerts(p_job_id);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 7 — CREATE check_margin_alerts FUNCTION (Profit Protection)
-- ============================================================================
-- Check and create margin alerts when profit drops

CREATE OR REPLACE FUNCTION public.check_margin_alerts(p_job_id uuid)
RETURNS void AS $$
DECLARE
  v_job public.roofing_jobs%rowtype;
  v_alert_id uuid;
BEGIN
  SELECT * INTO v_job FROM public.roofing_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Check for negative profit
  IF v_job.actual_gross_profit < 0 THEN
    INSERT INTO public.margin_alerts (
      job_id,
      workspace_id,
      alert_type,
      severity,
      current_margin,
      current_profit,
      message,
      suggestion
    )
    VALUES (
      p_job_id,
      v_job.workspace_id,
      'negative_profit',
      'critical',
      v_job.actual_margin_pct,
      v_job.actual_gross_profit,
      'This job is losing money. Current loss: $' || ABS(v_job.actual_gross_profit)::text,
      'Review all costs immediately. Consider requesting supplement or change order.'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Check for low margin (< 30%)
  IF v_job.actual_margin_pct < 30 AND v_job.actual_margin_pct >= 0 THEN
    INSERT INTO public.margin_alerts (
      job_id,
      workspace_id,
      alert_type,
      severity,
      current_margin,
      threshold_margin,
      current_profit,
      message,
      suggestion
    )
    VALUES (
      p_job_id,
      v_job.workspace_id,
      'low_margin',
      CASE WHEN v_job.actual_margin_pct < 20 THEN 'high' ELSE 'medium' END,
      v_job.actual_margin_pct,
      30,
      v_job.actual_gross_profit,
      'Profit margin has dropped below 30%. Current margin: ' || v_job.actual_margin_pct::text || '%',
      'Ask for supplement? Adjust labor? Review material waste?'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Check for material cost variance (> 20% higher than estimated)
  IF v_job.est_material_cost > 0 AND v_job.actual_material_cost > 0 THEN
    IF (v_job.actual_material_cost / v_job.est_material_cost - 1) > 0.20 THEN
      INSERT INTO public.margin_alerts (
        job_id,
        workspace_id,
        alert_type,
        severity,
        current_margin,
        current_profit,
        message,
        suggestion
      )
      VALUES (
        p_job_id,
        v_job.workspace_id,
        'material_cost_variance',
        'medium',
        v_job.actual_margin_pct,
        v_job.actual_gross_profit,
        'Material cost is ' || ROUND(((v_job.actual_material_cost / v_job.est_material_cost - 1) * 100)::numeric, 1)::text || '% higher than expected.',
        'Supplier mistake? Wrong order? Review material invoices.'
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 8 — CREATE TRIGGERS (Auto-recalculate on cost changes)
-- ============================================================================

-- Trigger on job_labor_costs changes
CREATE OR REPLACE FUNCTION public.job_labor_costs_after_change()
RETURNS trigger AS $$
BEGIN
  PERFORM public.recalc_job_financials(COALESCE(NEW.job_id, OLD.job_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_labor_costs_after_change_trigger ON public.job_labor_costs;
CREATE TRIGGER job_labor_costs_after_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.job_labor_costs
FOR EACH ROW
EXECUTE FUNCTION public.job_labor_costs_after_change();

-- Trigger on job_addon_costs changes
CREATE OR REPLACE FUNCTION public.job_addon_costs_after_change()
RETURNS trigger AS $$
BEGIN
  PERFORM public.recalc_job_financials(COALESCE(NEW.job_id, OLD.job_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS job_addon_costs_after_change_trigger ON public.job_addon_costs;
CREATE TRIGGER job_addon_costs_after_change_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.job_addon_costs
FOR EACH ROW
EXECUTE FUNCTION public.job_addon_costs_after_change();

-- Trigger on material_orders changes (when actual invoice cost is updated)
CREATE OR REPLACE FUNCTION public.material_orders_after_cost_update()
RETURNS trigger AS $$
BEGIN
  IF NEW.actual_invoice_cost IS DISTINCT FROM OLD.actual_invoice_cost THEN
    PERFORM public.recalc_job_financials(NEW.job_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS material_orders_after_cost_update_trigger ON public.material_orders;
CREATE TRIGGER material_orders_after_cost_update_trigger
AFTER UPDATE OF actual_invoice_cost ON public.material_orders
FOR EACH ROW
EXECUTE FUNCTION public.material_orders_after_cost_update();

-- ============================================================================
-- PART 9 — CREATE VIEW: insurance_vs_retail_profit_comparison
-- ============================================================================
-- Compare insurance vs retail job profitability

CREATE OR REPLACE VIEW public.insurance_vs_retail_profit_comparison AS
SELECT
  workspace_id,
  job_revenue_type,
  COUNT(*) as job_count,
  AVG(actual_margin_pct) as avg_margin_pct,
  AVG(actual_gross_profit) as avg_profit,
  SUM(actual_gross_profit) as total_profit,
  AVG(actual_material_cost) as avg_material_cost,
  AVG(actual_labor_cost) as avg_labor_cost,
  AVG(actual_total_cost) as avg_total_cost,
  AVG(revenue_collected) as avg_revenue
FROM public.roofing_jobs
WHERE job_revenue_type IS NOT NULL
  AND actual_gross_profit IS NOT NULL
GROUP BY workspace_id, job_revenue_type;

-- ============================================================================
-- PART 10 — CREATE VIEW: profit_dashboard_summary (Owner-Only)
-- ============================================================================
-- Top profitable/least profitable jobs, crew efficiency, supplier accuracy

CREATE OR REPLACE VIEW public.profit_dashboard_summary AS
SELECT
  rj.workspace_id,
  rj.id as job_id,
  rj.title,
  rj.job_value,
  rj.revenue_collected,
  rj.actual_total_cost,
  rj.actual_gross_profit,
  rj.actual_margin_pct,
  rj.profit_status,
  rj.job_revenue_type,
  rj.status,
  rj.scheduled_start_date,
  rj.scheduled_end_date,
  -- Crew info
  (SELECT string_agg(DISTINCT crew_name, ', ') FROM public.job_labor_costs WHERE job_id = rj.id) as crew_names,
  (SELECT SUM(total_cost) FROM public.job_labor_costs WHERE job_id = rj.id) as total_labor_cost,
  -- Supplier info
  (SELECT string_agg(DISTINCT s.name, ', ') FROM public.material_orders mo JOIN public.suppliers s ON s.id = mo.supplier_id WHERE mo.job_id = rj.id) as supplier_names,
  (SELECT AVG(actual_invoice_variance_pct) FROM public.material_orders WHERE job_id = rj.id AND actual_invoice_variance_pct IS NOT NULL) as avg_supplier_variance_pct
FROM public.roofing_jobs rj
WHERE rj.actual_gross_profit IS NOT NULL;

-- ============================================================================
-- PART 11 — CREATE TABLE: bidding_intelligence (Future Bidding Suggestions)
-- ============================================================================
-- Learn from past jobs to improve future bidding

CREATE TABLE IF NOT EXISTS public.bidding_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Job characteristics
  job_size_category text, -- 'small' (< 15 sq), 'medium' (15-30 sq), 'large' (> 30 sq)
  job_type text, -- 'roof_replacement', 'repair', etc.
  has_tear_off boolean,
  complexity_rating text, -- 'low', 'medium', 'high', 'very_high'
  
  -- Actual costs learned
  avg_material_cost_per_square numeric(10,2),
  avg_labor_hours_per_square numeric(10,2),
  avg_addon_cost numeric(10,2),
  common_overages jsonb, -- Array of common overages: [{"type": "wood", "avg_cost": 450}, ...]
  
  -- City/market data
  city text,
  state text,
  zip_code text,
  avg_permit_cost numeric(10,2),
  
  -- Supplier performance
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  avg_supplier_variance_pct numeric(5,2), -- How accurate is this supplier?
  
  -- Insurance patterns
  avg_supplement_success_rate numeric(5,2), -- % of supplements approved
  avg_supplement_amount numeric(10,2),
  
  -- Recommendations
  suggested_square_buffer numeric(5,2), -- e.g., "add 2 squares to estimate"
  suggested_material_buffer_pct numeric(5,2), -- e.g., "add 5% to material estimate"
  suggested_labor_buffer_pct numeric(5,2), -- e.g., "add 10% to labor estimate"
  
  -- Sample size
  job_count integer DEFAULT 0, -- Number of jobs this intelligence is based on
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bidding_intelligence_workspace_idx ON public.bidding_intelligence(workspace_id);
CREATE INDEX IF NOT EXISTS bidding_intelligence_location_idx ON public.bidding_intelligence(zip_code, city, state);
CREATE INDEX IF NOT EXISTS bidding_intelligence_job_type_idx ON public.bidding_intelligence(job_type, job_size_category);

ALTER TABLE public.bidding_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view bidding intelligence in their workspace"
  ON public.bidding_intelligence FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage bidding intelligence in their workspace"
  ON public.bidding_intelligence FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 12 — CREATE get_crew_efficiency FUNCTION
-- ============================================================================
-- Calculate crew cost efficiency for profit dashboard

CREATE OR REPLACE FUNCTION public.get_crew_efficiency(
  p_workspace_id uuid,
  p_days integer DEFAULT 30
)
RETURNS TABLE (
  crew_name text,
  job_count bigint,
  total_labor_cost numeric,
  avg_labor_cost_per_job numeric,
  total_revenue numeric,
  avg_profit_per_job numeric,
  avg_margin_pct numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cutoff_date date;
BEGIN
  v_cutoff_date := CURRENT_DATE - (p_days || ' days')::interval;

  RETURN QUERY
  SELECT
    jlc.crew_name,
    COUNT(DISTINCT jlc.job_id) as job_count,
    SUM(jlc.total_cost) as total_labor_cost,
    AVG(jlc.total_cost) as avg_labor_cost_per_job,
    SUM(rj.revenue_collected) as total_revenue,
    AVG(rj.actual_gross_profit) as avg_profit_per_job,
    AVG(rj.actual_margin_pct) as avg_margin_pct
  FROM public.job_labor_costs jlc
  JOIN public.roofing_jobs rj ON rj.id = jlc.job_id
  WHERE jlc.workspace_id = p_workspace_id
    AND rj.scheduled_start_date >= v_cutoff_date
  GROUP BY jlc.crew_name
  ORDER BY avg_profit_per_job DESC NULLS LAST;
END;
$$;

-- ============================================================================
-- PART 13 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_addon_costs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.margin_alerts TO authenticated;
GRANT SELECT ON public.insurance_vs_retail_profit_comparison TO authenticated;
GRANT SELECT ON public.profit_dashboard_summary TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bidding_intelligence TO authenticated;

GRANT EXECUTE ON FUNCTION public.check_margin_alerts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_labor_total_cost() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_crew_efficiency(uuid, integer) TO authenticated;

-- ============================================================================
-- PART 14 — CREATE calculate_profit_score FUNCTION (For Job Health Score Integration)
-- ============================================================================
-- Calculate profit pillar score (0-100) for job health score

CREATE OR REPLACE FUNCTION public.calculate_profit_score(p_job_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job record;
  v_score numeric := 100; -- Start with perfect score
  v_margin numeric;
  v_profit numeric;
  v_margin_alerts_count integer;
BEGIN
  -- Get job details
  SELECT * INTO v_job
  FROM public.roofing_jobs
  WHERE id = p_job_id;

  IF v_job IS NULL THEN
    RETURN 100; -- Job not found, return neutral score
  END IF;

  v_margin := COALESCE(v_job.actual_margin_pct, 0);
  v_profit := COALESCE(v_job.actual_gross_profit, 0);

  -- If no profit data yet, return neutral score
  IF v_job.actual_margin_pct IS NULL AND v_job.actual_gross_profit IS NULL THEN
    RETURN 100;
  END IF;

  -- Negative profit: severe penalty
  IF v_profit < 0 THEN
    v_score := v_score - 30; -- Major issue
  END IF;

  -- Low margin penalties
  IF v_margin < 20 THEN
    v_score := v_score - 25; -- At risk
  ELSIF v_margin < 30 THEN
    v_score := v_score - 15; -- Acceptable but low
  ELSIF v_margin >= 35 THEN
    v_score := v_score + 10; -- Strong margin bonus
  END IF;

  -- Count unresolved margin alerts
  SELECT COUNT(*) INTO v_margin_alerts_count
  FROM public.margin_alerts
  WHERE job_id = p_job_id
    AND resolved = false
    AND severity IN ('high', 'critical');

  -- Penalty for critical alerts
  IF v_margin_alerts_count > 0 THEN
    v_score := v_score - (v_margin_alerts_count * 5); -- -5 per critical/high alert
  END IF;

  -- Material cost variance penalty (if material cost significantly higher than estimated)
  IF v_job.est_material_cost > 0 AND v_job.actual_material_cost > 0 THEN
    IF (v_job.actual_material_cost / v_job.est_material_cost - 1) > 0.20 THEN
      v_score := v_score - 10; -- Material cost 20%+ over estimate
    END IF;
  END IF;

  -- Ensure score is between 0 and 100
  v_score := GREATEST(0, LEAST(100, v_score));

  RETURN v_score;
END;
$$;

COMMENT ON FUNCTION public.calculate_profit_score IS 'Block 25340: Calculate profit pillar score (0-100) for job health score integration';

COMMENT ON TABLE public.job_addon_costs IS 'Block 25340: Track additional job costs (wood, dumpster, repairs, etc.)';
COMMENT ON TABLE public.margin_alerts IS 'Block 25340: Profit protection alerts when margins drop';
COMMENT ON TABLE public.bidding_intelligence IS 'Block 25340: Learn from past jobs to improve future bidding accuracy';




































