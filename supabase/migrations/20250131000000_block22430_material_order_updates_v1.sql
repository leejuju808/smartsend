-- =========================================================
-- Block 22430 — SmartSend Roofing Material Orders & Supplier Tracking v1
-- Material Order Updates Table (Timeline Feed)
-- =========================================================
-- 
-- This table stores every status update and message for material orders,
-- creating a timeline feed that shows roofers exactly what happened and when.
-- Every status change gets logged here automatically.

-- ============================================================================
-- PART 1 — CREATE material_order_updates TABLE
-- ============================================================================
-- Timeline feed for material order status changes and messages

CREATE TABLE IF NOT EXISTS public.material_order_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_order_id uuid NOT NULL REFERENCES public.material_orders(id) ON DELETE CASCADE,
  status text CHECK (status IN ('ordered','en_route','delivered','delayed','canceled')) NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast timeline queries
CREATE INDEX IF NOT EXISTS idx_material_order_updates_order_id 
  ON public.material_order_updates(material_order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_material_order_updates_created_at 
  ON public.material_order_updates(created_at DESC);

-- ============================================================================
-- PART 2 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.material_order_updates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view updates for orders in their workspace
CREATE POLICY "Users can view material order updates"
  ON public.material_order_updates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.material_orders mo
      JOIN public.workspace_members wm ON wm.workspace_id = mo.workspace_id
      WHERE mo.id = material_order_updates.material_order_id
        AND wm.user_id = auth.uid()
    )
  );

-- Policy: Users can insert updates for orders in their workspace
CREATE POLICY "Users can insert material order updates"
  ON public.material_order_updates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.material_orders mo
      JOIN public.workspace_members wm ON wm.workspace_id = mo.workspace_id
      WHERE mo.id = material_order_updates.material_order_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 3 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT ON public.material_order_updates TO authenticated;

-- ============================================================================
-- PART 4 — ADD reliability_score TO suppliers TABLE (if not exists)
-- ============================================================================
-- Auto-calculated supplier reliability score (0-100)

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS reliability_score int DEFAULT 0 CHECK (reliability_score >= 0 AND reliability_score <= 100);

COMMENT ON COLUMN public.suppliers.reliability_score IS 'Auto-calculated supplier reliability score based on delivery performance';

-- ============================================================================
-- PART 5 — UPDATE material_orders TABLE STATUS CHECK
-- ============================================================================
-- Ensure status values match the spec: ordered, en_route, delivered, delayed, canceled
-- Note: The existing migration uses different statuses (draft, ordered, confirmed, on_truck, delivered, partial, cancelled).
-- We'll extend the CHECK constraint to support both formats for backward compatibility.

-- Drop and recreate the status check constraint to include new statuses
ALTER TABLE public.material_orders
  DROP CONSTRAINT IF EXISTS material_orders_status_check;

ALTER TABLE public.material_orders
  ADD CONSTRAINT material_orders_status_check CHECK (
    status IN (
      -- Legacy statuses (from block22320)
      'draft', 'ordered', 'confirmed', 'on_truck', 'delivered', 'partial', 'cancelled',
      -- New statuses (from block22430 spec)
      'en_route', 'delayed', 'canceled'
    )
  );

-- ============================================================================
-- PART 6 — FUNCTION TO LOG MATERIAL UPDATE TO JOB TIMELINE
-- ============================================================================
-- When a material order status changes, log it to the job timeline

CREATE OR REPLACE FUNCTION public.log_material_update_to_timeline()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id uuid;
  v_lead_id uuid;
  v_supplier_name text;
  v_message text;
BEGIN
  -- Get job_id and lead_id from the material order
  SELECT mo.job_id, rj.lead_id, s.name
  INTO v_job_id, v_lead_id, v_supplier_name
  FROM public.material_orders mo
  LEFT JOIN public.roofing_jobs rj ON rj.id = mo.job_id
  LEFT JOIN public.suppliers s ON s.id = mo.supplier_id
  WHERE mo.id = NEW.material_order_id;

  -- Only proceed if we have a lead_id (for timeline)
  IF v_lead_id IS NOT NULL THEN
    -- Build the timeline message
    v_message := COALESCE(v_supplier_name || ' ', '') || 
                 CASE NEW.status
                   WHEN 'ordered' THEN 'marked material order as Ordered'
                   WHEN 'en_route' THEN 'marked material order as En Route'
                   WHEN 'delivered' THEN 'marked material order as Delivered'
                   WHEN 'delayed' THEN 'marked material order as Delayed'
                   WHEN 'canceled' THEN 'marked material order as Canceled'
                   ELSE 'updated material order status'
                 END;
    
    IF NEW.message IS NOT NULL AND NEW.message != '' THEN
      v_message := v_message || '. ' || NEW.message;
    END IF;

    -- Insert into job_timelines table
    INSERT INTO public.job_timelines (
      lead_id,
      event_type,
      event_data
    ) VALUES (
      v_lead_id,
      'material_order_update',
      jsonb_build_object(
        'material_order_id', NEW.material_order_id,
        'status', NEW.status,
        'message', NEW.message,
        'update_id', NEW.id,
        'created_at', NEW.created_at
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger to automatically log updates to timeline
DROP TRIGGER IF EXISTS trg_log_material_update_to_timeline ON public.material_order_updates;
CREATE TRIGGER trg_log_material_update_to_timeline
AFTER INSERT ON public.material_order_updates
FOR EACH ROW
EXECUTE FUNCTION public.log_material_update_to_timeline();

COMMENT ON FUNCTION public.log_material_update_to_timeline IS 'Automatically logs material order status updates to the job timeline';

