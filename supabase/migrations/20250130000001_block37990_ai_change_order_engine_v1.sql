-- ============================================================
-- Block 37990 — SmartSend Roofing "AI Change Order Engine + Scope Adjustment System" v1
-- (Auto-detect mid-job changes • Create change orders instantly • Get homeowner approval via text • Update contract value + profit automatically)
-- ============================================================

-- ============================================================
-- 1. CHANGE ORDERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.change_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_change_orders_job ON public.change_orders(job_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_status ON public.change_orders(status);
CREATE INDEX IF NOT EXISTS idx_change_orders_created ON public.change_orders(created_at DESC);

-- ============================================================
-- 2. CHANGE ORDER PHOTOS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.change_order_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_order_id uuid NOT NULL REFERENCES public.change_orders(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  label text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_change_order_photos_co ON public.change_order_photos(change_order_id);

-- ============================================================
-- 3. RPC FUNCTION: INCREMENT JOB CONTRACT VALUE
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_job_value(
  p_job_id uuid,
  p_amount numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.jobs
  SET 
    contract_value = COALESCE(contract_value, 0) + p_amount,
    updated_at = now()
  WHERE id = p_job_id;
END;
$$;

-- ============================================================
-- 4. TRIGGER: AUTO-UPDATE JOB VALUE WHEN CHANGE ORDER APPROVED
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_change_order_to_job()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- When change order is approved, increment job contract value
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    PERFORM public.increment_job_value(NEW.job_id, NEW.amount);
    
    -- Update approved_at timestamp
    IF NEW.approved_at IS NULL THEN
      NEW.approved_at = now();
    END IF;
  END IF;
  
  -- When change order is rejected, update rejected_at
  IF NEW.status = 'rejected' AND (OLD.status IS NULL OR OLD.status != 'rejected') THEN
    IF NEW.rejected_at IS NULL THEN
      NEW.rejected_at = now();
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_change_order_to_job ON public.change_orders;
CREATE TRIGGER trg_apply_change_order_to_job
BEFORE UPDATE ON public.change_orders
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status)
EXECUTE FUNCTION public.apply_change_order_to_job();

-- ============================================================
-- 5. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.change_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.change_order_photos ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view change orders for jobs in their team
CREATE POLICY "Users can view change orders in their team"
  ON public.change_orders FOR SELECT
  USING (
    job_id IN (
      SELECT id FROM public.jobs
      WHERE team_id IN (
        SELECT team_id FROM public.team_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Policy: Users can create change orders for jobs in their team
CREATE POLICY "Users can create change orders in their team"
  ON public.change_orders FOR INSERT
  WITH CHECK (
    job_id IN (
      SELECT id FROM public.jobs
      WHERE team_id IN (
        SELECT team_id FROM public.team_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Policy: Users can update change orders for jobs in their team
CREATE POLICY "Users can update change orders in their team"
  ON public.change_orders FOR UPDATE
  USING (
    job_id IN (
      SELECT id FROM public.jobs
      WHERE team_id IN (
        SELECT team_id FROM public.team_members
        WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    job_id IN (
      SELECT id FROM public.jobs
      WHERE team_id IN (
        SELECT team_id FROM public.team_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- Policy: Users can view change order photos for change orders in their team
CREATE POLICY "Users can view change order photos in their team"
  ON public.change_order_photos FOR SELECT
  USING (
    change_order_id IN (
      SELECT id FROM public.change_orders
      WHERE job_id IN (
        SELECT id FROM public.jobs
        WHERE team_id IN (
          SELECT team_id FROM public.team_members
          WHERE user_id = auth.uid()
        )
      )
    )
  );

-- Policy: Users can create change order photos for change orders in their team
CREATE POLICY "Users can create change order photos in their team"
  ON public.change_order_photos FOR INSERT
  WITH CHECK (
    change_order_id IN (
      SELECT id FROM public.change_orders
      WHERE job_id IN (
        SELECT id FROM public.jobs
        WHERE team_id IN (
          SELECT team_id FROM public.team_members
          WHERE user_id = auth.uid()
        )
      )
    )
  );

-- ============================================================
-- 6. GRANT PERMISSIONS
-- ============================================================
GRANT SELECT, INSERT, UPDATE ON public.change_orders TO authenticated;
GRANT SELECT, INSERT ON public.change_order_photos TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_job_value(uuid, numeric) TO authenticated;

-- ============================================================
-- 7. COMMENTS
-- ============================================================
COMMENT ON TABLE public.change_orders IS 'Block 37990: AI Change Order Engine - Track mid-job changes, get homeowner approval via SMS, update contract value automatically';
COMMENT ON TABLE public.change_order_photos IS 'Block 37990: Photos attached to change orders for documentation and insurance proof';
COMMENT ON FUNCTION public.increment_job_value(uuid, numeric) IS 'Block 37990: Increments job contract_value when change order is approved';
COMMENT ON FUNCTION public.apply_change_order_to_job() IS 'Block 37990: Trigger function that automatically updates job contract value when change order is approved';
































