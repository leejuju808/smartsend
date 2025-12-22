-- Block 31890 — SmartSend Roofing "Invoices, Payments + Collections Engine" v1
-- Send invoices in 1 click • Take card/ACH • Track balances • Chase late payers automatically • Close the money loop

-- ============================================================
-- 1. INVOICES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  contractor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  invoice_number text,
  type text CHECK (type IN ('deposit', 'final', 'change_order')) NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text DEFAULT 'usd',
  due_date date,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'partially_paid', 'paid', 'overdue', 'canceled')),
  stripe_payment_link text,
  stripe_invoice_id text,
  stripe_payment_link_id text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for invoices
CREATE INDEX IF NOT EXISTS idx_invoices_job ON public.invoices(job_id);
CREATE INDEX IF NOT EXISTS idx_invoices_contractor ON public.invoices(contractor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_team ON public.invoices(team_id);
CREATE INDEX IF NOT EXISTS idx_invoices_workspace ON public.invoices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON public.invoices(invoice_number) WHERE invoice_number IS NOT NULL;

-- ============================================================
-- 2. INVOICE LINE ITEMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(10,2) DEFAULT 1,
  unit_price numeric(12,2) NOT NULL,
  total numeric(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice ON public.invoice_line_items(invoice_id);

-- ============================================================
-- 3. PAYMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  stripe_payment_intent text,
  stripe_charge_id text,
  amount numeric(12,2) NOT NULL,
  currency text DEFAULT 'usd',
  status text CHECK (status IN ('succeeded', 'pending', 'failed', 'refunded')) NOT NULL,
  received_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_stripe_payment_intent ON public.payments(stripe_payment_intent) WHERE stripe_payment_intent IS NOT NULL;

-- ============================================================
-- 4. COLLECTIONS TASKS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.collections_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  description text,
  due_at timestamptz,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collections_tasks_invoice ON public.collections_tasks(invoice_id);
CREATE INDEX IF NOT EXISTS idx_collections_tasks_completed ON public.collections_tasks(completed);
CREATE INDEX IF NOT EXISTS idx_collections_tasks_due ON public.collections_tasks(due_at);

-- ============================================================
-- 5. HELPER FUNCTION — UPDATE INVOICE STATUS
-- ============================================================
CREATE OR REPLACE FUNCTION refresh_invoice_status(p_invoice_id uuid)
RETURNS void AS $$
DECLARE
  total_amount numeric;
  paid_amount numeric;
  new_status text;
  invoice_due_date date;
BEGIN
  -- Get invoice amount and due date
  SELECT amount, due_date INTO total_amount, invoice_due_date
  FROM public.invoices
  WHERE id = p_invoice_id;

  -- Calculate total paid amount
  SELECT COALESCE(SUM(amount), 0) INTO paid_amount
  FROM public.payments
  WHERE invoice_id = p_invoice_id
    AND status = 'succeeded';

  -- Determine new status
  IF paid_amount = 0 THEN
    -- Check if overdue
    IF invoice_due_date IS NOT NULL AND invoice_due_date < CURRENT_DATE THEN
      new_status := 'overdue';
    ELSE
      new_status := 'pending';
    END IF;
  ELSIF paid_amount < total_amount THEN
    -- Check if overdue
    IF invoice_due_date IS NOT NULL AND invoice_due_date < CURRENT_DATE THEN
      new_status := 'overdue';
    ELSE
      new_status := 'partially_paid';
    END IF;
  ELSE
    new_status := 'paid';
  END IF;

  -- Update invoice status
  UPDATE public.invoices
  SET status = new_status, updated_at = now()
  WHERE id = p_invoice_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 6. TRIGGER TO UPDATE INVOICE STATUS ON PAYMENT CHANGES
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_refresh_invoice_status()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM refresh_invoice_status(NEW.invoice_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payments_refresh_invoice_status ON public.payments;
CREATE TRIGGER trg_payments_refresh_invoice_status
AFTER INSERT OR UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION trigger_refresh_invoice_status();

-- ============================================================
-- 7. FUNCTION TO GENERATE INVOICE NUMBER
-- ============================================================
CREATE OR REPLACE FUNCTION generate_invoice_number(p_team_id uuid DEFAULT NULL, p_workspace_id uuid DEFAULT NULL)
RETURNS text AS $$
DECLARE
  prefix text;
  year text;
  sequence_num integer;
  invoice_num text;
BEGIN
  -- Generate prefix based on team/workspace
  IF p_team_id IS NOT NULL THEN
    prefix := 'INV-' || SUBSTRING(p_team_id::text, 1, 8);
  ELSIF p_workspace_id IS NOT NULL THEN
    prefix := 'INV-' || SUBSTRING(p_workspace_id::text, 1, 8);
  ELSE
    prefix := 'INV';
  END IF;

  year := TO_CHAR(CURRENT_DATE, 'YYYY');
  
  -- Get next sequence number for this year
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+$') AS INTEGER)), 0) + 1
  INTO sequence_num
  FROM public.invoices
  WHERE invoice_number LIKE prefix || '-' || year || '-%';
  
  invoice_num := prefix || '-' || year || '-' || LPAD(sequence_num::text, 6, '0');
  
  RETURN invoice_num;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 8. TRIGGER TO UPDATE updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION update_invoices_updated_at();

-- ============================================================
-- 9. FUNCTION TO GET OUTSTANDING RECEIVABLES
-- ============================================================
CREATE OR REPLACE FUNCTION get_outstanding_receivables(
  p_team_id uuid DEFAULT NULL,
  p_workspace_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_outstanding', (
      SELECT COALESCE(SUM(amount - COALESCE(paid.total, 0)), 0)
      FROM public.invoices i
      LEFT JOIN (
        SELECT invoice_id, SUM(amount) as total
        FROM public.payments
        WHERE status = 'succeeded'
        GROUP BY invoice_id
      ) paid ON i.id = paid.invoice_id
      WHERE i.status IN ('pending', 'partially_paid', 'overdue')
        AND (p_team_id IS NULL OR i.team_id = p_team_id)
        AND (p_workspace_id IS NULL OR i.workspace_id = p_workspace_id)
    ),
    'overdue_amount', (
      SELECT COALESCE(SUM(amount - COALESCE(paid.total, 0)), 0)
      FROM public.invoices i
      LEFT JOIN (
        SELECT invoice_id, SUM(amount) as total
        FROM public.payments
        WHERE status = 'succeeded'
        GROUP BY invoice_id
      ) paid ON i.id = paid.invoice_id
      WHERE i.status = 'overdue'
        AND (p_team_id IS NULL OR i.team_id = p_team_id)
        AND (p_workspace_id IS NULL OR i.workspace_id = p_workspace_id)
    ),
    'due_this_week', (
      SELECT COALESCE(SUM(amount - COALESCE(paid.total, 0)), 0)
      FROM public.invoices i
      LEFT JOIN (
        SELECT invoice_id, SUM(amount) as total
        FROM public.payments
        WHERE status = 'succeeded'
        GROUP BY invoice_id
      ) paid ON i.id = paid.invoice_id
      WHERE i.status IN ('pending', 'partially_paid')
        AND i.due_date >= CURRENT_DATE
        AND i.due_date <= CURRENT_DATE + INTERVAL '7 days'
        AND (p_team_id IS NULL OR i.team_id = p_team_id)
        AND (p_workspace_id IS NULL OR i.workspace_id = p_workspace_id)
    ),
    'collected_this_week', (
      SELECT COALESCE(SUM(p.amount), 0)
      FROM public.payments p
      JOIN public.invoices i ON p.invoice_id = i.id
      WHERE p.status = 'succeeded'
        AND p.received_at >= date_trunc('week', CURRENT_DATE)
        AND (p_team_id IS NULL OR i.team_id = p_team_id)
        AND (p_workspace_id IS NULL OR i.workspace_id = p_workspace_id)
    ),
    'collection_rate', (
      SELECT CASE
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND(
          100.0 * COUNT(*) FILTER (
            WHERE status = 'paid' 
            AND due_date IS NOT NULL 
            AND due_date >= (
              SELECT MIN(received_at::date)
              FROM public.payments
              WHERE invoice_id = i.id AND status = 'succeeded'
            )
          ) / COUNT(*),
          2
        )
      END
      FROM public.invoices i
      WHERE i.due_date IS NOT NULL
        AND (p_team_id IS NULL OR i.team_id = p_team_id)
        AND (p_workspace_id IS NULL OR i.workspace_id = p_workspace_id)
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 10. ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collections_tasks ENABLE ROW LEVEL SECURITY;

-- Invoices: Team members can access invoices in their teams
DROP POLICY IF EXISTS "invoices_team_member" ON public.invoices;
CREATE POLICY "invoices_team_member" ON public.invoices
  FOR ALL USING (
    (team_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.team_members 
      WHERE team_id = invoices.team_id AND user_id = auth.uid()
    ))
    OR
    (workspace_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_id = invoices.workspace_id AND user_id = auth.uid()
    ))
    OR
    contractor_id = auth.uid()
  )
  WITH CHECK (
    (team_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.team_members 
      WHERE team_id = invoices.team_id AND user_id = auth.uid()
    ))
    OR
    (workspace_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.workspace_members 
      WHERE workspace_id = invoices.workspace_id AND user_id = auth.uid()
    ))
    OR
    contractor_id = auth.uid()
  );

-- Invoice line items: Inherit access from invoice
DROP POLICY IF EXISTS "invoice_line_items_access" ON public.invoice_line_items;
CREATE POLICY "invoice_line_items_access" ON public.invoice_line_items
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_line_items.invoice_id
      AND (
        (i.team_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.team_members 
          WHERE team_id = i.team_id AND user_id = auth.uid()
        ))
        OR
        (i.workspace_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.workspace_members 
          WHERE workspace_id = i.workspace_id AND user_id = auth.uid()
        ))
        OR
        i.contractor_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_line_items.invoice_id
      AND (
        (i.team_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.team_members 
          WHERE team_id = i.team_id AND user_id = auth.uid()
        ))
        OR
        (i.workspace_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.workspace_members 
          WHERE workspace_id = i.workspace_id AND user_id = auth.uid()
        ))
        OR
        i.contractor_id = auth.uid()
      )
    )
  );

-- Payments: Inherit access from invoice
DROP POLICY IF EXISTS "payments_access" ON public.payments;
CREATE POLICY "payments_access" ON public.payments
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.invoices i
      WHERE i.id = payments.invoice_id
      AND (
        (i.team_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.team_members 
          WHERE team_id = i.team_id AND user_id = auth.uid()
        ))
        OR
        (i.workspace_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.workspace_members 
          WHERE workspace_id = i.workspace_id AND user_id = auth.uid()
        ))
        OR
        i.contractor_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.invoices i
      WHERE i.id = payments.invoice_id
      AND (
        (i.team_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.team_members 
          WHERE team_id = i.team_id AND user_id = auth.uid()
        ))
        OR
        (i.workspace_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.workspace_members 
          WHERE workspace_id = i.workspace_id AND user_id = auth.uid()
        ))
        OR
        i.contractor_id = auth.uid()
      )
    )
  );

-- Collections tasks: Inherit access from invoice
DROP POLICY IF EXISTS "collections_tasks_access" ON public.collections_tasks;
CREATE POLICY "collections_tasks_access" ON public.collections_tasks
  FOR ALL USING (
    EXISTS(
      SELECT 1 FROM public.invoices i
      WHERE i.id = collections_tasks.invoice_id
      AND (
        (i.team_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.team_members 
          WHERE team_id = i.team_id AND user_id = auth.uid()
        ))
        OR
        (i.workspace_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.workspace_members 
          WHERE workspace_id = i.workspace_id AND user_id = auth.uid()
        ))
        OR
        i.contractor_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS(
      SELECT 1 FROM public.invoices i
      WHERE i.id = collections_tasks.invoice_id
      AND (
        (i.team_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.team_members 
          WHERE team_id = i.team_id AND user_id = auth.uid()
        ))
        OR
        (i.workspace_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM public.workspace_members 
          WHERE workspace_id = i.workspace_id AND user_id = auth.uid()
        ))
        OR
        i.contractor_id = auth.uid()
      )
    )
  );

-- Service role has full access
CREATE POLICY IF NOT EXISTS "service_role_full_access_invoices"
  ON public.invoices FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "service_role_full_access_invoice_line_items"
  ON public.invoice_line_items FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "service_role_full_access_payments"
  ON public.payments FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "service_role_full_access_collections_tasks"
  ON public.collections_tasks FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

































