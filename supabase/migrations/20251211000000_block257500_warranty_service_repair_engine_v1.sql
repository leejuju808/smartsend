-- =========================================================
-- Block 257500 — SmartSend "Warranty, Service & Repair Engine" v1
-- Warranty Tracker • Service Requests • AI Leak Diagnostics • Repair Scheduling • Work Orders • Repair Billing
-- =========================================================
--
-- This block upgrades the existing warranty + service ticket system into a
-- full Warranty / Service / Repair engine, without breaking any existing flows.
--
-- It does NOT create a second parallel system.
-- Instead it:
--   - Extends public.warranties for richer coverage tracking (by job + customer)
--   - Extends public.service_tickets for AI diagnosis + severity + homeowner context
--   - Adds repair_work_orders for dispatch + field execution
--   - Adds repair_invoices for out-of-warranty billing
--   - Adds a compatibility VIEW public.service_requests over public.service_tickets
--
-- =========================================================
-- PART 1 — Extend warranties table (Coverage Tracker by Job + Customer)
-- =========================================================

-- New columns for coverage tracking + customer linkage
ALTER TABLE public.warranties
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS warranty_type text, -- workmanship, manufacturer, extended
  ADD COLUMN IF NOT EXISTS coverage_years integer,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS documents jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- Backfill start_date / end_date from existing columns where empty
DO $$
BEGIN
  -- Only run if columns exist (defensive)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'warranties' AND column_name = 'start_date'
  ) THEN
    UPDATE public.warranties
    SET start_date = COALESCE(start_date, install_date)
    WHERE start_date IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'warranties' AND column_name = 'end_date'
  ) THEN
    UPDATE public.warranties
    SET end_date = COALESCE(end_date, expiration_date)
    WHERE end_date IS NULL;
  END IF;

  -- Initialize coverage_years from workmanship_years if present
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'warranties' AND column_name = 'coverage_years'
  ) THEN
    UPDATE public.warranties
    SET coverage_years = COALESCE(coverage_years, workmanship_years)
    WHERE coverage_years IS NULL;
  END IF;
END $$;

-- FK to customers table when available (ties warranty → homeowner/customer record)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'customers'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'warranties'
        AND constraint_name = 'warranties_customer_id_fkey'
    ) THEN
      ALTER TABLE public.warranties
        ADD CONSTRAINT warranties_customer_id_fkey
        FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Keep is_active in sync with status + expiration
CREATE OR REPLACE FUNCTION public.set_warranty_is_active()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.expiration_date IS NOT NULL THEN
      NEW.is_active := (NEW.status = 'active' AND NEW.expiration_date >= current_date);
    ELSE
      NEW.is_active := (NEW.status = 'active');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger (idempotent: drop if exists first)
DROP TRIGGER IF EXISTS trg_warranties_is_active ON public.warranties;
CREATE TRIGGER trg_warranties_is_active
  BEFORE INSERT OR UPDATE ON public.warranties
  FOR EACH ROW
  EXECUTE FUNCTION public.set_warranty_is_active();

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_warranties_customer ON public.warranties(customer_id);
CREATE INDEX IF NOT EXISTS idx_warranties_active_flag ON public.warranties(is_active);
CREATE INDEX IF NOT EXISTS idx_warranties_type ON public.warranties(warranty_type);

COMMENT ON COLUMN public.warranties.customer_id IS 'Block 257500: Customer owning this warranty (links to public.customers)';
COMMENT ON COLUMN public.warranties.warranty_type IS 'Block 257500: Warranty type (workmanship, manufacturer, extended, etc.)';
COMMENT ON COLUMN public.warranties.coverage_years IS 'Block 257500: Total coverage duration in years';
COMMENT ON COLUMN public.warranties.start_date IS 'Block 257500: Coverage start date';
COMMENT ON COLUMN public.warranties.end_date IS 'Block 257500: Coverage end date';
COMMENT ON COLUMN public.warranties.documents IS 'Block 257500: Warranty documents / PDFs / registrations (JSONB array)';
COMMENT ON COLUMN public.warranties.is_active IS 'Block 257500: Convenience flag derived from status + expiration_date';


-- =========================================================
-- PART 2 — Extend service_tickets table (Service Requests + AI Diagnostics)
-- =========================================================

-- Add homeowner + warranty context + repair fields expected by Block 52000 edge functions
ALTER TABLE public.service_tickets
  ADD COLUMN IF NOT EXISTS homeowner_id uuid,
  ADD COLUMN IF NOT EXISTS warranty_id uuid,
  ADD COLUMN IF NOT EXISTS category text,                       -- leak, missing_shingle, vent_issue, flashing_issue, gutter_issue, other
  ADD COLUMN IF NOT EXISTS homeowner_photos text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS warranty_status text DEFAULT 'in_warranty',
  ADD COLUMN IF NOT EXISTS technician_id uuid,
  ADD COLUMN IF NOT EXISTS scheduled_date date,
  ADD COLUMN IF NOT EXISTS scheduled_time time,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS labor_hours numeric(5,2),            -- actual labor hours (not just estimate)
  ADD COLUMN IF NOT EXISTS material_cost numeric(10,2),
  ADD COLUMN IF NOT EXISTS total_cost numeric(10,2),
  ADD COLUMN IF NOT EXISTS invoice_required boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_id uuid,
  ADD COLUMN IF NOT EXISTS homeowner_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS homeowner_rating integer,
  ADD COLUMN IF NOT EXISTS homeowner_feedback text,
  ADD COLUMN IF NOT EXISTS severity text,
  ADD COLUMN IF NOT EXISTS ai_diagnosis jsonb DEFAULT '{}'::jsonb;

-- Tighten enums where appropriate (only if column now exists)
DO $$
BEGIN
  -- warranty_status classification from Block 52000
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'service_tickets' AND column_name = 'warranty_status'
  ) THEN
    ALTER TABLE public.service_tickets
      ADD CONSTRAINT service_tickets_warranty_status_check
      CHECK (warranty_status IN ('in_warranty','out_of_warranty','fee_required','covered'))
      NOT VALID;
  END IF;

  -- severity ladder for Block 257500 (distinct from urgency)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'service_tickets' AND column_name = 'severity'
  ) THEN
    UPDATE public.service_tickets
    SET severity = CASE
      WHEN urgency = 'emergency' THEN 'emergency'
      WHEN urgency = 'high' THEN 'high'
      ELSE 'medium'
    END
    WHERE severity IS NULL;

    ALTER TABLE public.service_tickets
      ADD CONSTRAINT service_tickets_severity_check
      CHECK (severity IN ('low','medium','high','emergency'))
      NOT VALID;
  END IF;
END $$;

-- Backfill category from issue_type where null
UPDATE public.service_tickets
SET category = issue_type
WHERE category IS NULL;

-- Foreign keys for homeowner_id / warranty_id (if base tables exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'homeowners'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'service_tickets'
        AND constraint_name = 'service_tickets_homeowner_id_fkey'
    ) THEN
      ALTER TABLE public.service_tickets
        ADD CONSTRAINT service_tickets_homeowner_id_fkey
        FOREIGN KEY (homeowner_id) REFERENCES public.homeowners(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'warranties'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'service_tickets'
        AND constraint_name = 'service_tickets_warranty_id_fkey'
    ) THEN
      ALTER TABLE public.service_tickets
        ADD CONSTRAINT service_tickets_warranty_id_fkey
        FOREIGN KEY (warranty_id) REFERENCES public.warranties(id) ON DELETE SET NULL;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crew_members'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'service_tickets'
        AND constraint_name = 'service_tickets_technician_id_fkey'
    ) THEN
      ALTER TABLE public.service_tickets
        ADD CONSTRAINT service_tickets_technician_id_fkey
        FOREIGN KEY (technician_id) REFERENCES public.crew_members(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Helpful indexes for the new fields
CREATE INDEX IF NOT EXISTS idx_service_tickets_warranty_status ON public.service_tickets(warranty_status);
CREATE INDEX IF NOT EXISTS idx_service_tickets_severity ON public.service_tickets(severity);
CREATE INDEX IF NOT EXISTS idx_service_tickets_technician ON public.service_tickets(technician_id) WHERE technician_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_tickets_completed_at ON public.service_tickets(completed_at) WHERE completed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_service_tickets_invoice_required ON public.service_tickets(invoice_required) WHERE invoice_required = true;

COMMENT ON COLUMN public.service_tickets.category IS 'Block 257500: Normalized leak/service category used by homeowner portal + AI intake';
COMMENT ON COLUMN public.service_tickets.homeowner_photos IS 'Block 257500: Raw homeowner-uploaded photos (URLs)';
COMMENT ON COLUMN public.service_tickets.warranty_status IS 'Block 257500: Warranty coverage classification for this ticket';
COMMENT ON COLUMN public.service_tickets.technician_id IS 'Block 257500: Assigned technician or service crew member';
COMMENT ON COLUMN public.service_tickets.labor_hours IS 'Block 257500: Actual labor hours used for this repair';
COMMENT ON COLUMN public.service_tickets.material_cost IS 'Block 257500: Material cost for this repair';
COMMENT ON COLUMN public.service_tickets.total_cost IS 'Block 257500: Total cost (labor + materials) for this repair';
COMMENT ON COLUMN public.service_tickets.invoice_required IS 'Block 257500: Whether this ticket requires a repair invoice (out-of-warranty)';
COMMENT ON COLUMN public.service_tickets.invoice_id IS 'Block 257500: Linked repair invoice id when created';
COMMENT ON COLUMN public.service_tickets.severity IS 'Block 257500: Severity classification (low/medium/high/emergency)';
COMMENT ON COLUMN public.service_tickets.ai_diagnosis IS 'Block 257500: AI leak diagnostic payload (JSON: issue, time estimate, materials, coverage, etc.)';


-- =========================================================
-- PART 3 — repair_work_orders (Field-Ready Work Orders)
-- =========================================================
-- One or more work orders per service ticket.
-- Used for dispatch, field instructions, and checklists.

CREATE TABLE IF NOT EXISTS public.repair_work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_ticket_id uuid NOT NULL,

  assigned_to uuid,             -- crew member / subcontractor id
  assigned_to_name text,        -- human-readable name for field apps

  scope text,                   -- scope of work / issue summary
  materials jsonb DEFAULT '[]'::jsonb, -- [{name, quantity, unit, notes}]

  scheduled_for timestamptz,
  status text DEFAULT 'scheduled' CHECK (status IN (
    'scheduled',
    'in_progress',
    'completed',
    'cancelled'
  )),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- FK to service_tickets (CASCADE on delete)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'service_tickets'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'repair_work_orders'
        AND constraint_name = 'repair_work_orders_service_ticket_id_fkey'
    ) THEN
      ALTER TABLE public.repair_work_orders
        ADD CONSTRAINT repair_work_orders_service_ticket_id_fkey
        FOREIGN KEY (service_ticket_id) REFERENCES public.service_tickets(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_repair_work_orders_ticket ON public.repair_work_orders(service_ticket_id);
CREATE INDEX IF NOT EXISTS idx_repair_work_orders_status ON public.repair_work_orders(status);
CREATE INDEX IF NOT EXISTS idx_repair_work_orders_scheduled_for ON public.repair_work_orders(scheduled_for) WHERE scheduled_for IS NOT NULL;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_repair_work_orders_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_repair_work_orders_updated_at ON public.repair_work_orders;
CREATE TRIGGER trg_repair_work_orders_updated_at
  BEFORE UPDATE ON public.repair_work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_repair_work_orders_updated_at();

-- RLS aligned with service_tickets (workspace-based)
ALTER TABLE public.repair_work_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view repair work orders in their workspace"
  ON public.repair_work_orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.service_tickets st
      WHERE st.id = repair_work_orders.service_ticket_id
      AND st.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY IF NOT EXISTS "Users can manage repair work orders in their workspace"
  ON public.repair_work_orders FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.service_tickets st
      WHERE st.id = repair_work_orders.service_ticket_id
      AND st.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_tickets st
      WHERE st.id = repair_work_orders.service_ticket_id
      AND st.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

COMMENT ON TABLE public.repair_work_orders IS 'Block 257500: Field-ready repair work orders tied to service tickets';
COMMENT ON COLUMN public.repair_work_orders.scope IS 'Block 257500: Scope of repair including issue + steps';
COMMENT ON COLUMN public.repair_work_orders.materials IS 'Block 257500: Materials required/used for this work order (JSONB array)';


-- =========================================================
-- PART 4 — repair_invoices (Out-of-Warranty Repair Billing)
-- =========================================================
-- Separate invoice records for chargeable repairs.

CREATE TABLE IF NOT EXISTS public.repair_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_ticket_id uuid NOT NULL,

  amount numeric NOT NULL,
  description text,
  status text DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid','void')),

  issued_at timestamptz DEFAULT now(),
  paid_at timestamptz,

  metadata jsonb DEFAULT '{}'::jsonb
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'service_tickets'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'repair_invoices'
        AND constraint_name = 'repair_invoices_service_ticket_id_fkey'
    ) THEN
      ALTER TABLE public.repair_invoices
        ADD CONSTRAINT repair_invoices_service_ticket_id_fkey
        FOREIGN KEY (service_ticket_id) REFERENCES public.service_tickets(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_repair_invoices_ticket ON public.repair_invoices(service_ticket_id);
CREATE INDEX IF NOT EXISTS idx_repair_invoices_status ON public.repair_invoices(status);
CREATE INDEX IF NOT EXISTS idx_repair_invoices_issued_at ON public.repair_invoices(issued_at DESC);

ALTER TABLE public.repair_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view repair invoices in their workspace"
  ON public.repair_invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.service_tickets st
      WHERE st.id = repair_invoices.service_ticket_id
      AND st.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY IF NOT EXISTS "Users can manage repair invoices in their workspace"
  ON public.repair_invoices FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.service_tickets st
      WHERE st.id = repair_invoices.service_ticket_id
      AND st.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.service_tickets st
      WHERE st.id = repair_invoices.service_ticket_id
      AND st.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

COMMENT ON TABLE public.repair_invoices IS 'Block 257500: Repair invoices for out-of-warranty or fee-required service tickets';
COMMENT ON COLUMN public.repair_invoices.amount IS 'Block 257500: Invoice amount for the repair';
COMMENT ON COLUMN public.repair_invoices.metadata IS 'Block 257500: Extra billing metadata (tax, discounts, payment links, etc.)';


-- =========================================================
-- PART 5 — Compatibility VIEW: service_requests
-- =========================================================
-- For analytics and future UI, expose a simplified service_requests view
-- matching the Block 257500 spec, backed by service_tickets.

CREATE OR REPLACE VIEW public.service_requests AS
SELECT
  st.id,
  NULL::uuid AS customer_id, -- Can be wired from customer_jobs/customers in a future block
  st.job_id,
  st.description,
  COALESCE(st.category, st.issue_type) AS category,
  NULL::text[] AS photos, -- Photos live in service_photos; aggregate if needed in a follow-up
  st.ai_diagnosis,
  st.severity,
  st.status,
  st.created_at
FROM public.service_tickets st;

COMMENT ON VIEW public.service_requests IS 'Block 257500: Compatibility view exposing service_requests semantics over service_tickets.';


-- =========================================================
-- PART 6 — Grants
-- =========================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.repair_work_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.repair_invoices TO authenticated;

-- End of Block 257500 — Warranty, Service & Repair Engine v1













