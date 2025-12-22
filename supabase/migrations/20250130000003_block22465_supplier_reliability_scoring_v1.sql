-- =========================================================
-- Block 22465 — SmartSend Roofing Supplier Reliability Scoring v1
-- (Turn every supplier into a scoreboard — so roofers stop gambling with deliveries)
-- =========================================================
-- 
-- This block adds reliability scoring to suppliers based on their delivery history.
-- Roofers get:
-- - Reliability score (0–100) for each supplier
-- - Clear tags: Elite • Solid • Risky
-- - Visibility into on-time delivery rate, average delay, cancellation rate
-- - Auto-updated based on real material orders, not vibes

-- ============================================================================
-- PART 1 — ADD RELIABILITY COLUMNS TO suppliers TABLE
-- ============================================================================

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS total_orders int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivered_orders int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS on_time_deliveries int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delayed_orders int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS canceled_orders int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS on_time_rate numeric(5,2) DEFAULT 0, -- 0–100
  ADD COLUMN IF NOT EXISTS cancel_rate numeric(5,2) DEFAULT 0,   -- 0–100
  ADD COLUMN IF NOT EXISTS avg_delay_days numeric(6,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reliability_score int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reliability_calculated_at timestamptz;

-- ============================================================================
-- PART 2 — CREATE supplier_delivery_stats VIEW
-- ============================================================================
-- Helper view for internal debugging + future reports
-- Aggregates delivery stats from material_orders and material_deliveries

CREATE OR REPLACE VIEW public.supplier_delivery_stats AS
SELECT
  ms.id as supplier_id,
  ms.workspace_id,
  COUNT(mo.id) as total_orders,
  COUNT(mo.id) FILTER (WHERE mo.status = 'delivered') as delivered_orders,
  COUNT(mo.id) FILTER (
    WHERE mo.status = 'delivered'
      AND mo.actual_delivery_date IS NOT NULL
      AND mo.expected_delivery_date IS NOT NULL
      AND mo.actual_delivery_date <= mo.expected_delivery_date
  ) as on_time_deliveries,
  COUNT(mo.id) FILTER (
    WHERE mo.status = 'delivered'
      AND mo.actual_delivery_date IS NOT NULL
      AND mo.expected_delivery_date IS NOT NULL
      AND mo.actual_delivery_date > mo.expected_delivery_date
  ) as delayed_orders,
  COUNT(mo.id) FILTER (WHERE mo.status = 'cancelled') as canceled_orders,
  AVG(
    GREATEST(
      0,
      EXTRACT(EPOCH FROM (mo.actual_delivery_date - mo.expected_delivery_date)) / 86400.0
    )
  ) FILTER (
    WHERE mo.status = 'delivered'
      AND mo.actual_delivery_date IS NOT NULL
      AND mo.expected_delivery_date IS NOT NULL
      AND mo.actual_delivery_date > mo.expected_delivery_date
  ) as avg_delay_days
FROM public.suppliers ms
LEFT JOIN public.material_orders mo ON mo.supplier_id = ms.id
GROUP BY ms.id, ms.workspace_id;

-- Grant access to authenticated users
GRANT SELECT ON public.supplier_delivery_stats TO authenticated;

-- ============================================================================
-- PART 3 — RLS POLICIES FOR VIEW
-- ============================================================================
-- Users can only see stats for suppliers in their workspace

ALTER VIEW public.supplier_delivery_stats SET (security_invoker = true);

-- Note: RLS is enforced through the base tables (suppliers and material_orders)
-- The view inherits RLS from those tables via workspace_id checks

COMMENT ON VIEW public.supplier_delivery_stats IS 
  'Aggregated delivery statistics for suppliers. Used by reliability scoring function.';

-- ============================================================================
-- PART 4 — CREATE FUNCTION TO TRIGGER RELIABILITY RECALCULATION
-- ============================================================================
-- This function can be called from triggers or manually to recalculate reliability
-- It calls the edge function supplier-compute-reliability via HTTP

CREATE OR REPLACE FUNCTION public.trigger_supplier_reliability_recalc(p_workspace_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_url text;
  v_service_role_key text;
BEGIN
  -- Get Supabase URL and service role key from environment
  -- Note: In production, these should be set via Supabase secrets
  -- For now, this function will be called manually or via cron
  
  -- The actual HTTP call to the edge function should be done from application code
  -- or via a pg_net extension if available. For now, we'll create a placeholder
  -- that can be extended later.
  
  -- This function exists primarily to be called from triggers
  -- The actual computation happens in the edge function
  NULL;
END;
$$;

COMMENT ON FUNCTION public.trigger_supplier_reliability_recalc IS 
  'Placeholder function for triggering reliability recalculation. Call the edge function supplier-compute-reliability directly from application code or cron.';

-- ============================================================================
-- PART 5 — CREATE TRIGGER TO MARK SUPPLIERS FOR RECALCULATION
-- ============================================================================
-- When material orders change (status, delivery dates), we should recalculate reliability
-- For now, we'll rely on manual/cron calls to the edge function
-- In the future, this could be enhanced with pg_net to call the edge function directly

-- Note: For automatic recalculation, set up a cron job or call the edge function
-- from application code when material orders are updated/delivered/cancelled

