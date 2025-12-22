-- Block 256200 — SmartSend AI Inventory & Yard Management v1
-- Stock Tracking, Auto-Restock Alerts, Yard → Job Allocation, Material Forecasting, Shrinkage Detection
-- 
-- This block turns SmartSend into the material control center that roofing companies have NEVER had
-- an AI-driven inventory system that keeps the yard stocked, eliminates shortages, stops material theft, and saves THOUSANDS per year.

-- ============================================================
-- PART 1 — CREATE yard_items TABLE
-- ============================================================
-- Tracks EVERYTHING in the yard: shingles, ridge, starter, nails, felt/synthetic, ice & water, vents, pipe boots, flashing, sealant, drip edge

CREATE TABLE IF NOT EXISTS public.yard_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Material Identity
  material_name text NOT NULL,              -- "Timberline HDZ Weathered Wood", "Synthetic Underlayment", "Ice & Water", etc.
  material_category text,                    -- "shingles", "underlayment", "ventilation", "flashing", "nails", "sealant", etc.
  unit text NOT NULL DEFAULT 'bundle',      -- "bundle", "roll", "ft", "lb", "gallon", "box"
  
  -- Inventory Levels
  quantity numeric NOT NULL DEFAULT 0,       -- Current quantity in yard
  min_quantity numeric DEFAULT 0,           -- Minimum threshold before restock alert
  max_quantity numeric,                     -- Maximum capacity (optional)
  
  -- Material Details
  brand text,                               -- "GAF", "Owens Corning", "CertainTeed", etc.
  color text,                               -- "Weathered Wood", "Charcoal", etc.
  sku text,                                 -- Supplier SKU (optional)
  cost_per_unit numeric(10,2),             -- Average cost per unit for costing
  supplier_name text,                      -- Primary supplier name
  
  -- Status
  is_active boolean DEFAULT true,
  location text,                            -- Yard location (optional: "Bay 1", "Main Yard", etc.)
  
  -- Metadata
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure unique material names per company
  CONSTRAINT unique_material_per_company UNIQUE (company_id, material_name)
);

CREATE INDEX IF NOT EXISTS idx_yard_items_company ON public.yard_items(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_yard_items_category ON public.yard_items(company_id, material_category) WHERE material_category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_yard_items_low_stock ON public.yard_items(company_id, quantity) WHERE quantity <= min_quantity AND is_active = true;

-- ============================================================
-- PART 2 — CREATE yard_transactions TABLE
-- ============================================================
-- Tracks ALL material movements: check-in, check-out, adjustments, returns

CREATE TABLE IF NOT EXISTS public.yard_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yard_item_id uuid NOT NULL REFERENCES public.yard_items(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Transaction Details
  transaction_type text NOT NULL CHECK (transaction_type IN ('check_in', 'check_out', 'adjustment', 'return', 'damage', 'theft')),
  quantity numeric NOT NULL,                -- Positive for check_in/return, negative for check_out
  
  -- Job & Crew Context
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  
  -- Transaction Metadata
  notes text,                                -- Reason for adjustment, damage description, etc.
  expected_quantity numeric,                -- For shrinkage detection (expected vs actual)
  variance numeric,                          -- Calculated variance (expected - actual)
  variance_percentage numeric,               -- Variance as percentage
  
  -- User Tracking
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_yard_transactions_item ON public.yard_transactions(yard_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_yard_transactions_company ON public.yard_transactions(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_yard_transactions_job ON public.yard_transactions(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_yard_transactions_crew ON public.yard_transactions(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_yard_transactions_type ON public.yard_transactions(transaction_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_yard_transactions_variance ON public.yard_transactions(company_id, variance) WHERE variance IS NOT NULL AND variance < 0;

-- ============================================================
-- PART 3 — CREATE yard_forecasting TABLE
-- ============================================================
-- AI predicts future material needs based on schedule, history, seasonality, storms

CREATE TABLE IF NOT EXISTS public.yard_forecasting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Forecast Details
  material_name text NOT NULL,
  material_category text,
  projected_usage numeric NOT NULL,       -- Projected quantity needed
  forecast_date date NOT NULL,              -- Date for this forecast
  forecast_period text DEFAULT 'daily',     -- "daily", "weekly", "monthly"
  
  -- Forecast Context
  days_ahead int DEFAULT 14,                -- How many days ahead this forecast covers
  jobs_count int DEFAULT 0,                 -- Number of jobs in this period
  historical_avg numeric,                  -- Historical average usage for comparison
  seasonality_factor numeric DEFAULT 1.0,   -- Seasonal adjustment factor
  storm_probability numeric DEFAULT 0.0,    -- Storm probability impact (0-1)
  
  -- Forecast Accuracy Tracking
  actual_usage numeric,                     -- Actual usage when date passes (for accuracy tracking)
  accuracy_score numeric,                   -- Forecast accuracy (0-100)
  
  -- Metadata
  forecast_method text DEFAULT 'ai',         -- "ai", "historical", "manual", "hybrid"
  confidence_score numeric DEFAULT 0.5,    -- AI confidence (0-1)
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_yard_forecasting_company ON public.yard_forecasting(company_id, forecast_date DESC);
CREATE INDEX IF NOT EXISTS idx_yard_forecasting_material ON public.yard_forecasting(company_id, material_name, forecast_date);
CREATE INDEX IF NOT EXISTS idx_yard_forecasting_date ON public.yard_forecasting(forecast_date) WHERE forecast_date >= CURRENT_DATE;

-- ============================================================
-- PART 4 — CREATE yard_restock_alerts TABLE
-- ============================================================
-- AI-powered restock alerts based on inventory levels and upcoming demand

CREATE TABLE IF NOT EXISTS public.yard_restock_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  yard_item_id uuid NOT NULL REFERENCES public.yard_items(id) ON DELETE CASCADE,
  
  -- Alert Details
  alert_type text NOT NULL DEFAULT 'low_stock' CHECK (alert_type IN ('low_stock', 'critical_stock', 'upcoming_demand', 'supplier_outage', 'price_alert')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'ordered', 'resolved', 'dismissed')),
  
  -- Alert Context
  current_quantity numeric NOT NULL,
  min_quantity numeric NOT NULL,
  recommended_order_quantity numeric,      -- AI-recommended order quantity
  upcoming_jobs_count int DEFAULT 0,        -- Jobs needing this material in next period
  upcoming_jobs_usage numeric DEFAULT 0,    -- Projected usage from upcoming jobs
  
  -- Supplier Info
  supplier_name text,
  supplier_availability text,               -- "in_stock", "limited", "out_of_stock", "unknown"
  estimated_delivery_date date,
  price_per_unit numeric(10,2),
  
  -- Alert Message
  message text NOT NULL,                    -- Human-readable alert message
  recommendation text,                      -- AI recommendation text
  
  -- User Tracking
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_yard_restock_alerts_company ON public.yard_restock_alerts(company_id, status, priority);
CREATE INDEX IF NOT EXISTS idx_yard_restock_alerts_item ON public.yard_restock_alerts(yard_item_id, status);
CREATE INDEX IF NOT EXISTS idx_yard_restock_alerts_active ON public.yard_restock_alerts(company_id, status, priority) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_yard_restock_alerts_critical ON public.yard_restock_alerts(company_id, priority) WHERE priority = 'critical' AND status = 'active';

-- ============================================================
-- PART 5 — CREATE yard_shrinkage_alerts TABLE
-- ============================================================
-- Detects material misuse, theft, and shrinkage patterns

CREATE TABLE IF NOT EXISTS public.yard_shrinkage_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  yard_item_id uuid REFERENCES public.yard_items(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  
  -- Alert Details
  alert_type text NOT NULL CHECK (alert_type IN ('missing_items', 'chronic_overuse', 'suspicious_pattern', 'variance_threshold', 'after_hours_checkout', 'no_job_assigned')),
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'investigating', 'resolved', 'dismissed', 'false_positive')),
  
  -- Shrinkage Details
  expected_quantity numeric,                -- Expected quantity
  actual_quantity numeric,                  -- Actual quantity
  variance numeric NOT NULL,                 -- Difference (expected - actual)
  variance_percentage numeric,               -- Variance as percentage
  estimated_loss_amount numeric(10,2),      -- Estimated dollar loss
  
  -- Pattern Detection
  pattern_description text,                 -- "Crew B consistently uses 8-12% more material"
  occurrences_count int DEFAULT 1,          -- Number of times this pattern occurred
  first_occurrence_at timestamptz,
  last_occurrence_at timestamptz,
  
  -- Context
  transaction_ids uuid[],                   -- Related transaction IDs
  notes text,
  investigation_notes text,
  
  -- User Tracking
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_yard_shrinkage_alerts_company ON public.yard_shrinkage_alerts(company_id, status, severity);
CREATE INDEX IF NOT EXISTS idx_yard_shrinkage_alerts_crew ON public.yard_shrinkage_alerts(crew_id) WHERE crew_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_yard_shrinkage_alerts_active ON public.yard_shrinkage_alerts(company_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_yard_shrinkage_alerts_critical ON public.yard_shrinkage_alerts(company_id, severity) WHERE severity = 'critical' AND status = 'active';

-- ============================================================
-- PART 6 — CREATE yard_reconciliation TABLE
-- ============================================================
-- End-of-day yard reconciliation summaries

CREATE TABLE IF NOT EXISTS public.yard_reconciliation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  
  -- Reconciliation Period
  reconciliation_date date NOT NULL,
  period_type text DEFAULT 'daily' CHECK (period_type IN ('daily', 'weekly', 'monthly')),
  
  -- Summary Metrics
  total_transactions int DEFAULT 0,
  check_ins_count int DEFAULT 0,
  check_outs_count int DEFAULT 0,
  adjustments_count int DEFAULT 0,
  returns_count int DEFAULT 0,
  
  -- Inventory Health
  items_missing_count int DEFAULT 0,         -- Items with negative variance
  items_damaged_count int DEFAULT 0,
  items_returned_count int DEFAULT 0,
  total_variance_amount numeric(10,2) DEFAULT 0,  -- Total dollar variance
  inventory_balance_percentage numeric(5,2), -- Inventory accuracy percentage (0-100)
  
  -- Shrinkage Summary
  shrinkage_alerts_count int DEFAULT 0,
  critical_shrinkage_count int DEFAULT 0,
  estimated_loss_total numeric(10,2) DEFAULT 0,
  
  -- Summary Text
  summary_text text,                        -- Human-readable summary
  notes text,
  
  -- Status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'reviewed')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure one reconciliation per company per date
  CONSTRAINT unique_reconciliation_per_date UNIQUE (company_id, reconciliation_date, period_type)
);

CREATE INDEX IF NOT EXISTS idx_yard_reconciliation_company ON public.yard_reconciliation(company_id, reconciliation_date DESC);
CREATE INDEX IF NOT EXISTS idx_yard_reconciliation_date ON public.yard_reconciliation(reconciliation_date DESC);

-- ============================================================
-- PART 7 — CREATE yard_job_allocation TABLE
-- ============================================================
-- Tracks material allocation from yard to jobs

CREATE TABLE IF NOT EXISTS public.yard_job_allocation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  yard_item_id uuid NOT NULL REFERENCES public.yard_items(id) ON DELETE CASCADE,
  
  -- Allocation Details
  allocated_quantity numeric NOT NULL,      -- Quantity allocated to this job
  allocated_at timestamptz DEFAULT now(),
  
  -- Status
  status text DEFAULT 'allocated' CHECK (status IN ('allocated', 'checked_out', 'returned', 'cancelled')),
  checked_out_at timestamptz,
  returned_at timestamptz,
  returned_quantity numeric DEFAULT 0,     -- Quantity returned (if less than allocated)
  
  -- Crew Context
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  crew_member_id uuid REFERENCES public.crew_members(id) ON DELETE SET NULL,
  
  -- Transaction Links
  checkout_transaction_id uuid REFERENCES public.yard_transactions(id) ON DELETE SET NULL,
  return_transaction_id uuid REFERENCES public.yard_transactions(id) ON DELETE SET NULL,
  
  -- Notes
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_yard_job_allocation_job ON public.yard_job_allocation(job_id, status);
CREATE INDEX IF NOT EXISTS idx_yard_job_allocation_item ON public.yard_job_allocation(yard_item_id);
CREATE INDEX IF NOT EXISTS idx_yard_job_allocation_company ON public.yard_job_allocation(company_id, allocated_at DESC);
CREATE INDEX IF NOT EXISTS idx_yard_job_allocation_active ON public.yard_job_allocation(job_id, status) WHERE status IN ('allocated', 'checked_out');

-- ============================================================
-- PART 8 — TRIGGERS & FUNCTIONS
-- ============================================================

-- Function to update yard_item quantity on transaction
CREATE OR REPLACE FUNCTION update_yard_item_quantity()
RETURNS TRIGGER AS $$
BEGIN
  -- Update quantity based on transaction type
  IF NEW.transaction_type IN ('check_in', 'return') THEN
    UPDATE public.yard_items
    SET quantity = quantity + NEW.quantity,
        updated_at = now()
    WHERE id = NEW.yard_item_id;
  ELSIF NEW.transaction_type IN ('check_out', 'damage', 'theft') THEN
    UPDATE public.yard_items
    SET quantity = GREATEST(0, quantity - ABS(NEW.quantity)),
        updated_at = now()
    WHERE id = NEW.yard_item_id;
  ELSIF NEW.transaction_type = 'adjustment' THEN
    -- Adjustments can be positive or negative
    UPDATE public.yard_items
    SET quantity = GREATEST(0, quantity + NEW.quantity),
        updated_at = now()
    WHERE id = NEW.yard_item_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_yard_item_quantity
AFTER INSERT ON public.yard_transactions
FOR EACH ROW
EXECUTE FUNCTION update_yard_item_quantity();

-- Function to calculate variance for transactions
CREATE OR REPLACE FUNCTION calculate_transaction_variance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expected_quantity IS NOT NULL AND NEW.quantity IS NOT NULL THEN
    NEW.variance = NEW.expected_quantity - ABS(NEW.quantity);
    IF NEW.expected_quantity > 0 THEN
      NEW.variance_percentage = (NEW.variance / NEW.expected_quantity) * 100;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calculate_transaction_variance
BEFORE INSERT OR UPDATE ON public.yard_transactions
FOR EACH ROW
EXECUTE FUNCTION calculate_transaction_variance();

-- Function to check for low stock and create alerts
CREATE OR REPLACE FUNCTION check_low_stock_alerts()
RETURNS TRIGGER AS $$
DECLARE
  item_record RECORD;
  upcoming_usage numeric;
BEGIN
  -- Get item details
  SELECT * INTO item_record
  FROM public.yard_items
  WHERE id = NEW.id;
  
  -- Check if quantity is below minimum
  IF item_record.quantity <= item_record.min_quantity AND item_record.is_active = true THEN
    -- Calculate upcoming usage from forecasts
    SELECT COALESCE(SUM(projected_usage), 0) INTO upcoming_usage
    FROM public.yard_forecasting
    WHERE company_id = item_record.company_id
      AND material_name = item_record.material_name
      AND forecast_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days';
    
    -- Determine alert priority
    DECLARE
      alert_priority text;
      alert_type text;
      recommended_qty numeric;
    BEGIN
      IF item_record.quantity <= (item_record.min_quantity * 0.5) THEN
        alert_priority := 'critical';
        alert_type := 'critical_stock';
      ELSE
        alert_priority := 'high';
        alert_type := 'low_stock';
      END IF;
      
      -- Calculate recommended order quantity
      recommended_qty := GREATEST(
        item_record.min_quantity * 2 - item_record.quantity,
        upcoming_usage * 1.2,
        item_record.min_quantity
      );
      
      -- Create or update alert
      INSERT INTO public.yard_restock_alerts (
        company_id,
        yard_item_id,
        alert_type,
        priority,
        current_quantity,
        min_quantity,
        recommended_order_quantity,
        upcoming_jobs_usage,
        message,
        recommendation
      )
      VALUES (
        item_record.company_id,
        item_record.id,
        alert_type,
        alert_priority,
        item_record.quantity,
        item_record.min_quantity,
        recommended_qty,
        upcoming_usage,
        item_record.material_name || ' – Only ' || item_record.quantity || ' ' || item_record.unit || ' left.',
        'Needed for next 14 days: ' || ROUND(upcoming_usage, 1) || ' ' || item_record.unit || '. Recommend ordering ' || ROUND(recommended_qty, 1) || ' ' || item_record.unit || ' today.'
      )
      ON CONFLICT DO NOTHING;
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_low_stock_alerts
AFTER UPDATE OF quantity ON public.yard_items
FOR EACH ROW
EXECUTE FUNCTION check_low_stock_alerts();

-- Function to detect shrinkage patterns
CREATE OR REPLACE FUNCTION detect_shrinkage_patterns()
RETURNS TRIGGER AS $$
DECLARE
  variance_threshold numeric := -0.05; -- 5% variance threshold
  variance_amount numeric;
  loss_amount numeric;
BEGIN
  -- Only check check_out transactions with expected quantities
  IF NEW.transaction_type = 'check_out' AND NEW.expected_quantity IS NOT NULL AND NEW.variance < 0 THEN
    -- Calculate estimated loss
    SELECT cost_per_unit INTO variance_amount
    FROM public.yard_items
    WHERE id = NEW.yard_item_id;
    
    loss_amount := ABS(NEW.variance) * COALESCE(variance_amount, 0);
    
    -- Check if variance exceeds threshold
    IF NEW.variance_percentage < (variance_threshold * 100) THEN
      -- Create shrinkage alert
      INSERT INTO public.yard_shrinkage_alerts (
        company_id,
        yard_item_id,
        job_id,
        crew_id,
        crew_member_id,
        alert_type,
        severity,
        expected_quantity,
        actual_quantity,
        variance,
        variance_percentage,
        estimated_loss_amount,
        pattern_description,
        transaction_ids,
        notes
      )
      VALUES (
        NEW.company_id,
        NEW.yard_item_id,
        NEW.job_id,
        NEW.crew_id,
        NEW.crew_member_id,
        CASE
          WHEN NEW.job_id IS NULL THEN 'no_job_assigned'
          WHEN EXTRACT(HOUR FROM NEW.created_at) < 6 OR EXTRACT(HOUR FROM NEW.created_at) > 20 THEN 'after_hours_checkout'
          ELSE 'missing_items'
        END,
        CASE
          WHEN ABS(NEW.variance_percentage) > 20 THEN 'critical'
          WHEN ABS(NEW.variance_percentage) > 10 THEN 'high'
          ELSE 'medium'
        END,
        NEW.expected_quantity,
        ABS(NEW.quantity),
        NEW.variance,
        NEW.variance_percentage,
        loss_amount,
        'Job #' || COALESCE(NEW.job_id::text, 'N/A') || ' expected ' || NEW.expected_quantity || ' but checked out ' || ABS(NEW.quantity) || '. Variance: ' || NEW.variance || ' (' || ROUND(NEW.variance_percentage, 1) || '%)',
        ARRAY[NEW.id],
        COALESCE(NEW.notes, '')
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_detect_shrinkage_patterns
AFTER INSERT ON public.yard_transactions
FOR EACH ROW
EXECUTE FUNCTION detect_shrinkage_patterns();

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_yard_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_yard_items_updated_at
BEFORE UPDATE ON public.yard_items
FOR EACH ROW
EXECUTE FUNCTION update_yard_items_updated_at();

CREATE OR REPLACE FUNCTION update_yard_forecasting_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_yard_forecasting_updated_at
BEFORE UPDATE ON public.yard_forecasting
FOR EACH ROW
EXECUTE FUNCTION update_yard_forecasting_updated_at();

CREATE OR REPLACE FUNCTION update_yard_restock_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_yard_restock_alerts_updated_at
BEFORE UPDATE ON public.yard_restock_alerts
FOR EACH ROW
EXECUTE FUNCTION update_yard_restock_alerts_updated_at();

CREATE OR REPLACE FUNCTION update_yard_shrinkage_alerts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_yard_shrinkage_alerts_updated_at
BEFORE UPDATE ON public.yard_shrinkage_alerts
FOR EACH ROW
EXECUTE FUNCTION update_yard_shrinkage_alerts_updated_at();

CREATE OR REPLACE FUNCTION update_yard_reconciliation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_yard_reconciliation_updated_at
BEFORE UPDATE ON public.yard_reconciliation
FOR EACH ROW
EXECUTE FUNCTION update_yard_reconciliation_updated_at();

CREATE OR REPLACE FUNCTION update_yard_job_allocation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_yard_job_allocation_updated_at
BEFORE UPDATE ON public.yard_job_allocation
FOR EACH ROW
EXECUTE FUNCTION update_yard_job_allocation_updated_at();

-- ============================================================
-- PART 9 — ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.yard_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yard_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yard_forecasting ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yard_restock_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yard_shrinkage_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yard_reconciliation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yard_job_allocation ENABLE ROW LEVEL SECURITY;

-- Helper function to check company access
CREATE OR REPLACE FUNCTION has_yard_access(_company_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.roofing_companies rc
    WHERE rc.id = _company_id
      AND (
        rc.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.team_members tm
          JOIN public.teams t ON t.id = tm.team_id
          WHERE tm.user_id = auth.uid()
            AND t.id IN (
              SELECT team_id FROM public.jobs WHERE company_id = _company_id LIMIT 1
            )
        )
      )
  );
$$;

-- RLS Policies for yard_items
CREATE POLICY "yard_items_select" ON public.yard_items
  FOR SELECT
  USING (has_yard_access(company_id));

CREATE POLICY "yard_items_insert" ON public.yard_items
  FOR INSERT
  WITH CHECK (has_yard_access(company_id));

CREATE POLICY "yard_items_update" ON public.yard_items
  FOR UPDATE
  USING (has_yard_access(company_id))
  WITH CHECK (has_yard_access(company_id));

CREATE POLICY "yard_items_delete" ON public.yard_items
  FOR DELETE
  USING (has_yard_access(company_id));

-- RLS Policies for yard_transactions
CREATE POLICY "yard_transactions_select" ON public.yard_transactions
  FOR SELECT
  USING (has_yard_access(company_id));

CREATE POLICY "yard_transactions_insert" ON public.yard_transactions
  FOR INSERT
  WITH CHECK (has_yard_access(company_id));

CREATE POLICY "yard_transactions_update" ON public.yard_transactions
  FOR UPDATE
  USING (has_yard_access(company_id))
  WITH CHECK (has_yard_access(company_id));

-- RLS Policies for yard_forecasting
CREATE POLICY "yard_forecasting_select" ON public.yard_forecasting
  FOR SELECT
  USING (has_yard_access(company_id));

CREATE POLICY "yard_forecasting_insert" ON public.yard_forecasting
  FOR INSERT
  WITH CHECK (has_yard_access(company_id));

CREATE POLICY "yard_forecasting_update" ON public.yard_forecasting
  FOR UPDATE
  USING (has_yard_access(company_id))
  WITH CHECK (has_yard_access(company_id));

CREATE POLICY "yard_forecasting_delete" ON public.yard_forecasting
  FOR DELETE
  USING (has_yard_access(company_id));

-- RLS Policies for yard_restock_alerts
CREATE POLICY "yard_restock_alerts_select" ON public.yard_restock_alerts
  FOR SELECT
  USING (has_yard_access(company_id));

CREATE POLICY "yard_restock_alerts_insert" ON public.yard_restock_alerts
  FOR INSERT
  WITH CHECK (has_yard_access(company_id));

CREATE POLICY "yard_restock_alerts_update" ON public.yard_restock_alerts
  FOR UPDATE
  USING (has_yard_access(company_id))
  WITH CHECK (has_yard_access(company_id));

-- RLS Policies for yard_shrinkage_alerts
CREATE POLICY "yard_shrinkage_alerts_select" ON public.yard_shrinkage_alerts
  FOR SELECT
  USING (has_yard_access(company_id));

CREATE POLICY "yard_shrinkage_alerts_insert" ON public.yard_shrinkage_alerts
  FOR INSERT
  WITH CHECK (has_yard_access(company_id));

CREATE POLICY "yard_shrinkage_alerts_update" ON public.yard_shrinkage_alerts
  FOR UPDATE
  USING (has_yard_access(company_id))
  WITH CHECK (has_yard_access(company_id));

-- RLS Policies for yard_reconciliation
CREATE POLICY "yard_reconciliation_select" ON public.yard_reconciliation
  FOR SELECT
  USING (has_yard_access(company_id));

CREATE POLICY "yard_reconciliation_insert" ON public.yard_reconciliation
  FOR INSERT
  WITH CHECK (has_yard_access(company_id));

CREATE POLICY "yard_reconciliation_update" ON public.yard_reconciliation
  FOR UPDATE
  USING (has_yard_access(company_id))
  WITH CHECK (has_yard_access(company_id));

-- RLS Policies for yard_job_allocation
CREATE POLICY "yard_job_allocation_select" ON public.yard_job_allocation
  FOR SELECT
  USING (has_yard_access(company_id));

CREATE POLICY "yard_job_allocation_insert" ON public.yard_job_allocation
  FOR INSERT
  WITH CHECK (has_yard_access(company_id));

CREATE POLICY "yard_job_allocation_update" ON public.yard_job_allocation
  FOR UPDATE
  USING (has_yard_access(company_id))
  WITH CHECK (has_yard_access(company_id));

-- ============================================================
-- PART 10 — COMMENTS FOR DOCUMENTATION
-- ============================================================

COMMENT ON TABLE public.yard_items IS 'Inventory items tracked in the yard (Block 256200)';
COMMENT ON TABLE public.yard_transactions IS 'All material movements: check-in, check-out, adjustments (Block 256200)';
COMMENT ON TABLE public.yard_forecasting IS 'AI-powered material usage forecasting (Block 256200)';
COMMENT ON TABLE public.yard_restock_alerts IS 'Automated restock alerts based on inventory levels and demand (Block 256200)';
COMMENT ON TABLE public.yard_shrinkage_alerts IS 'Shrinkage and theft detection alerts (Block 256200)';
COMMENT ON TABLE public.yard_reconciliation IS 'End-of-day yard reconciliation summaries (Block 256200)';
COMMENT ON TABLE public.yard_job_allocation IS 'Material allocation from yard to jobs (Block 256200)';





















