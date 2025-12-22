-- =========================================================
-- Block 26020 — SmartSend Roofing Profit Engine v1
-- (REAL-TIME JOB PROFIT • MATERIAL COSTS • LABOR COSTS • INSURANCE SUPPLEMENTS • MARGIN PROTECTION)
-- =========================================================
-- 
-- This block turns SmartSend into something NO other cold-email tool or contractor CRM has:
-- A real-time profit engine that tracks job profitability automatically.
-- Roofers instantly see if they're about to lose money before they even start the job.
-- SmartSend becomes NOT just outreach… but the money guardrail for their entire business.

-- ============================================================================
-- PART 1 — CREATE roofing_job_profit TABLE
-- ============================================================================
-- Single source of truth for job-level profit calculations
-- Auto-updates when materials, labor, or supplements change

CREATE TABLE IF NOT EXISTS public.roofing_job_profit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Revenue
  estimated_revenue numeric(12,2), -- From job_value or proposal
  final_revenue numeric(12,2), -- Actual collected revenue

  -- Costs
  material_cost numeric(12,2) DEFAULT 0,
  labor_cost numeric(12,2) DEFAULT 0,
  supplement_revenue numeric(12,2) DEFAULT 0, -- Additional revenue from supplements

  -- Calculated fields (auto-computed)
  gross_profit numeric(12,2) GENERATED ALWAYS AS (
    COALESCE(final_revenue, estimated_revenue, 0) 
    - material_cost 
    - labor_cost 
    + supplement_revenue
  ) STORED,

  margin numeric(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN COALESCE(final_revenue, estimated_revenue, 0) > 0 
      THEN ROUND(
        ((COALESCE(final_revenue, estimated_revenue, 0) - material_cost - labor_cost + supplement_revenue)
         / COALESCE(final_revenue, estimated_revenue, 1)) * 100,
        2
      )
      ELSE 0
    END
  ) STORED,

  -- Timestamps
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),

  -- Ensure one profit record per job
  UNIQUE(job_id)
);

CREATE INDEX IF NOT EXISTS idx_roofing_job_profit_job ON public.roofing_job_profit(job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_job_profit_workspace ON public.roofing_job_profit(workspace_id);
CREATE INDEX IF NOT EXISTS idx_roofing_job_profit_margin ON public.roofing_job_profit(margin) WHERE margin < 30;

ALTER TABLE public.roofing_job_profit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view profit data in their workspace"
  ON public.roofing_job_profit FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage profit data in their workspace"
  ON public.roofing_job_profit FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 2 — FUNCTION: Recalculate profit for a job
-- ============================================================================
-- Aggregates costs from material_orders, job_labor_costs, and job_addon_costs

CREATE OR REPLACE FUNCTION public.recalc_job_profit(p_job_id uuid)
RETURNS void AS $$
DECLARE
  v_job public.roofing_jobs%rowtype;
  v_estimated_revenue numeric;
  v_final_revenue numeric;
  v_material_cost numeric;
  v_labor_cost numeric;
  v_supplement_revenue numeric;
  v_workspace_id uuid;
BEGIN
  -- Get job details
  SELECT * INTO v_job FROM public.roofing_jobs WHERE id = p_job_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_workspace_id := v_job.workspace_id;

  -- Get estimated revenue (from job_value)
  v_estimated_revenue := COALESCE(v_job.job_value, 0);

  -- Get final revenue (from job_payments if exists, otherwise use job_value)
  -- Check if job_payments table exists first
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'job_payments'
  ) THEN
    SELECT COALESCE(SUM(amount), 0)
    INTO v_final_revenue
    FROM public.job_payments
    WHERE job_id = p_job_id
      AND status = 'received';
  END IF;

  -- If no payments found or table doesn't exist, use job_value as final revenue
  IF v_final_revenue = 0 OR v_final_revenue IS NULL THEN
    v_final_revenue := v_estimated_revenue;
  END IF;

  -- Get material costs (from material_orders - use actual_invoice_cost if available, otherwise total)
  SELECT COALESCE(SUM(COALESCE(actual_invoice_cost, total, 0)), 0)
  INTO v_material_cost
  FROM public.material_orders
  WHERE job_id = p_job_id
    AND status NOT IN ('cancelled', 'canceled');

  -- Get labor costs (from job_labor_costs)
  SELECT COALESCE(SUM(total_cost), 0)
  INTO v_labor_cost
  FROM public.job_labor_costs
  WHERE job_id = p_job_id;

  -- Get supplement revenue (from job_addon_costs where supplement is approved)
  SELECT COALESCE(SUM(COALESCE(supplement_amount, total_cost, 0)), 0)
  INTO v_supplement_revenue
  FROM public.job_addon_costs
  WHERE job_id = p_job_id
    AND is_supplement_eligible = true
    AND supplement_status = 'approved';

  -- Upsert profit record
  INSERT INTO public.roofing_job_profit (
    job_id,
    workspace_id,
    estimated_revenue,
    final_revenue,
    material_cost,
    labor_cost,
    supplement_revenue,
    updated_at
  )
  VALUES (
    p_job_id,
    v_workspace_id,
    v_estimated_revenue,
    v_final_revenue,
    v_material_cost,
    v_labor_cost,
    v_supplement_revenue,
    now()
  )
  ON CONFLICT (job_id)
  DO UPDATE SET
    estimated_revenue = EXCLUDED.estimated_revenue,
    final_revenue = EXCLUDED.final_revenue,
    material_cost = EXCLUDED.material_cost,
    labor_cost = EXCLUDED.labor_cost,
    supplement_revenue = EXCLUDED.supplement_revenue,
    updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 3 — TRIGGERS: Auto-update profit when costs change
-- ============================================================================

-- Trigger: Update profit when material orders change
CREATE OR REPLACE FUNCTION public.update_profit_on_material_change()
RETURNS trigger AS $$
BEGIN
  PERFORM public.recalc_job_profit(COALESCE(NEW.job_id, OLD.job_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_profit_on_material_change ON public.material_orders;
CREATE TRIGGER trg_update_profit_on_material_change
AFTER INSERT OR UPDATE OR DELETE ON public.material_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_profit_on_material_change();

-- Trigger: Update profit when labor costs change
CREATE OR REPLACE FUNCTION public.update_profit_on_labor_change()
RETURNS trigger AS $$
BEGIN
  PERFORM public.recalc_job_profit(COALESCE(NEW.job_id, OLD.job_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_profit_on_labor_change ON public.job_labor_costs;
CREATE TRIGGER trg_update_profit_on_labor_change
AFTER INSERT OR UPDATE OR DELETE ON public.job_labor_costs
FOR EACH ROW
EXECUTE FUNCTION public.update_profit_on_labor_change();

-- Trigger: Update profit when addon costs (supplements) change
CREATE OR REPLACE FUNCTION public.update_profit_on_addon_change()
RETURNS trigger AS $$
BEGIN
  PERFORM public.recalc_job_profit(COALESCE(NEW.job_id, OLD.job_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_profit_on_addon_change ON public.job_addon_costs;
CREATE TRIGGER trg_update_profit_on_addon_change
AFTER INSERT OR UPDATE OR DELETE ON public.job_addon_costs
FOR EACH ROW
EXECUTE FUNCTION public.update_profit_on_addon_change();

-- Trigger: Update profit when job value changes
CREATE OR REPLACE FUNCTION public.update_profit_on_job_value_change()
RETURNS trigger AS $$
BEGIN
  IF NEW.job_value IS DISTINCT FROM OLD.job_value THEN
    PERFORM public.recalc_job_profit(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_profit_on_job_value_change ON public.roofing_jobs;
CREATE TRIGGER trg_update_profit_on_job_value_change
AFTER UPDATE OF job_value ON public.roofing_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_profit_on_job_value_change();

-- Trigger: Update profit when payments are received
CREATE OR REPLACE FUNCTION public.update_profit_on_payment_change()
RETURNS trigger AS $$
BEGIN
  PERFORM public.recalc_job_profit(COALESCE(NEW.job_id, OLD.job_id));
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if job_payments table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'job_payments'
  ) THEN
    DROP TRIGGER IF EXISTS trg_update_profit_on_payment_change ON public.job_payments;
    CREATE TRIGGER trg_update_profit_on_payment_change
    AFTER INSERT OR UPDATE OR DELETE ON public.job_payments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_profit_on_payment_change();
  END IF;
END $$;

-- ============================================================================
-- PART 4 — FUNCTION: Check margin and create alerts
-- ============================================================================
-- Warns if margin drops below 30%

CREATE OR REPLACE FUNCTION public.check_margin_alerts_v2(p_job_id uuid)
RETURNS void AS $$
DECLARE
  v_profit public.roofing_job_profit%rowtype;
  v_alert_exists boolean;
BEGIN
  -- Get profit record
  SELECT * INTO v_profit FROM public.roofing_job_profit WHERE job_id = p_job_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Check if margin is below 30%
  IF v_profit.margin < 30 AND v_profit.margin >= 0 THEN
    -- Check if alert already exists (use margin_alerts table from block 25340)
    SELECT EXISTS(
      SELECT 1 FROM public.margin_alerts
      WHERE job_id = p_job_id
        AND alert_type = 'low_margin'
        AND resolved = false
    ) INTO v_alert_exists;

    -- Create alert if it doesn't exist
    IF NOT v_alert_exists THEN
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
        v_profit.workspace_id,
        'low_margin',
        CASE WHEN v_profit.margin < 20 THEN 'high' ELSE 'medium' END,
        v_profit.margin,
        30,
        v_profit.gross_profit,
        'Warning: Job margin has dropped to ' || v_profit.margin::text || '%. This job is about to lose money — fix your numbers.',
        'Ask for supplement? Adjust labor? Review material waste?'
      );
    END IF;
  END IF;

  -- Check for negative profit
  IF v_profit.gross_profit < 0 THEN
    SELECT EXISTS(
      SELECT 1 FROM public.margin_alerts
      WHERE job_id = p_job_id
        AND alert_type = 'negative_profit'
        AND resolved = false
    ) INTO v_alert_exists;

    IF NOT v_alert_exists THEN
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
        v_profit.workspace_id,
        'negative_profit',
        'critical',
        v_profit.margin,
        v_profit.gross_profit,
        'THIS JOB IS LOSING MONEY. Current loss: $' || ABS(v_profit.gross_profit)::text,
        'Review all costs immediately. Consider requesting supplement or change order.'
      );
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Check margin after profit recalculation
CREATE OR REPLACE FUNCTION public.check_margin_after_profit_update()
RETURNS trigger AS $$
BEGIN
  PERFORM public.check_margin_alerts_v2(NEW.job_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_margin_after_profit_update ON public.roofing_job_profit;
CREATE TRIGGER trg_check_margin_after_profit_update
AFTER INSERT OR UPDATE ON public.roofing_job_profit
FOR EACH ROW
EXECUTE FUNCTION public.check_margin_after_profit_update();

-- ============================================================================
-- PART 5 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.roofing_job_profit TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_job_profit(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_margin_alerts_v2(uuid) TO authenticated;

-- ============================================================================
-- PART 6 — INITIALIZE PROFIT RECORDS FOR EXISTING JOBS
-- ============================================================================
-- Backfill profit data for existing jobs

DO $$
DECLARE
  v_job_record RECORD;
BEGIN
  FOR v_job_record IN SELECT id FROM public.roofing_jobs LOOP
    PERFORM public.recalc_job_profit(v_job_record.id);
  END LOOP;
END $$;

COMMENT ON TABLE public.roofing_job_profit IS 'Block 26020: Real-time job profit tracking with auto-calculated margins';
COMMENT ON FUNCTION public.recalc_job_profit IS 'Block 26020: Recalculate profit for a job by aggregating costs';
COMMENT ON FUNCTION public.check_margin_alerts_v2 IS 'Block 26020: Check margin and create alerts if below threshold';



































