-- ============================================================
-- Block 258700 — SmartSend Cash Flow & Collections Engine v1
-- (Invoicing Automation • AR Aging Buckets • Collections Logs • Payment Plans)
-- ============================================================
--
-- This block upgrades the core accounting engine so owners get:
-- - Clean aging buckets on every invoice
-- - A place to log every collections touch
-- - Stronger payment plan primitives for installment flows
-- - A dedicated AR aging view for dashboards
--
-- It builds on:
-- - Block 257100 — Accounting & Billing Engine v1 (public.invoices, public.payments, ar_summary)
-- - Block 58000  — Financing Options + Payment Plan System v1 (public.payment_plans, public.payment_plan_payments)
--
-- ============================================================
-- 1. INVOICES: AGING + REMINDER + ESCALATION FIELDS
-- ============================================================

DO $$
BEGIN
  -- aging_bucket: simple label for AR aging views (current, 1-30, 31-60, 60+)
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND column_name = 'aging_bucket'
  ) THEN
    ALTER TABLE public.invoices
      ADD COLUMN aging_bucket text DEFAULT 'current';
  END IF;

  -- last_reminder_at: last time an automated reminder was sent for this invoice
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND column_name = 'last_reminder_at'
  ) THEN
    ALTER TABLE public.invoices
      ADD COLUMN last_reminder_at timestamptz;
  END IF;

  -- escalation_level: collections intensity level (0 = friendly, 1 = firm, 2 = urgent, 3+ = legal/collections)
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND column_name = 'escalation_level'
  ) THEN
    ALTER TABLE public.invoices
      ADD COLUMN escalation_level int DEFAULT 0;
  END IF;
END;
$$;


-- Optional indexes for AR dashboards / collections queries
CREATE INDEX IF NOT EXISTS idx_invoices_aging_bucket
  ON public.invoices(team_id, aging_bucket);

CREATE INDEX IF NOT EXISTS idx_invoices_last_reminder_at
  ON public.invoices(team_id, last_reminder_at);

CREATE INDEX IF NOT EXISTS idx_invoices_escalation_level
  ON public.invoices(team_id, escalation_level);


-- ============================================================
-- 2. PAYMENT PLANS: INSTALLMENT SUPPORT FIELDS
-- ============================================================
-- NOTE: public.payment_plans already exists from Block 58000.
-- Here we extend it to better support AR / collections dashboards.

DO $$
BEGIN
  -- installment_amount: canonical per-period amount (regardless of frequency)
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payment_plans'
      AND column_name = 'installment_amount'
  ) THEN
    ALTER TABLE public.payment_plans
      ADD COLUMN installment_amount numeric;
  END IF;

  -- frequency: weekly / biweekly / monthly / custom
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payment_plans'
      AND column_name = 'frequency'
  ) THEN
    ALTER TABLE public.payment_plans
      ADD COLUMN frequency text DEFAULT 'monthly';
  END IF;

  -- next_due_date: next scheduled installment date for quick AR lookup
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payment_plans'
      AND column_name = 'next_due_date'
  ) THEN
    ALTER TABLE public.payment_plans
      ADD COLUMN next_due_date date;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_payment_plans_next_due_date
  ON public.payment_plans(next_due_date)
  WHERE status IN ('active', 'delinquent');

CREATE INDEX IF NOT EXISTS idx_payment_plans_frequency_status
  ON public.payment_plans(frequency, status);


-- ============================================================
-- 3. COLLECTIONS LOGS TABLE
-- ============================================================
-- Lightweight, generic collections log for public.invoices
-- (separate from roofing_collection_actions which is tied to roofing_payment_requests)

CREATE TABLE IF NOT EXISTS public.collections_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Multi-tenant scoping
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,

  -- Link to core invoice
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,

  -- What happened
  action text NOT NULL,          -- e.g. 'reminder_email_sent', 'sms_sent', 'call_logged', 'escalation_level_changed'
  message text,                  -- human-readable log or generated script
  metadata jsonb DEFAULT '{}'::jsonb,

  -- Snapshot of escalation level at time of log (optional, mirrors invoices.escalation_level)
  escalation_level int DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_collections_logs_invoice
  ON public.collections_logs(invoice_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collections_logs_team_created_at
  ON public.collections_logs(team_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collections_logs_escalation_level
  ON public.collections_logs(team_id, escalation_level);

-- RLS: mirror invoices / team_members pattern
ALTER TABLE public.collections_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "collections_logs_team_access"
  ON public.collections_logs
  FOR ALL
  USING (
    team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    team_id IN (
      SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.collections_logs TO authenticated;

COMMENT ON TABLE public.collections_logs IS 'Block 258700: Generic collections action log tied to public.invoices (reminders, calls, escalations).';


-- ============================================================
-- 4. AR AGING BUCKETS VIEW (TEAM-LEVEL SUMMARY)
-- ============================================================
-- This view powers the AR dashboard with classic aging buckets:
-- - Current
-- - 1–30 Days Late
-- - 31–60 Days Late
-- - 60+ Days Late

CREATE OR REPLACE VIEW public.ar_aging_buckets AS
SELECT
  i.team_id,

  -- Balance still not collected, bucketed by due_date vs today
  COALESCE(SUM(i.remaining_balance) FILTER (
    WHERE i.status IN ('unpaid', 'partially_paid', 'overdue')
      AND i.due_date >= CURRENT_DATE
  ), 0) AS current_amount,

  COALESCE(SUM(i.remaining_balance) FILTER (
    WHERE i.status IN ('unpaid', 'partially_paid', 'overdue')
      AND i.due_date < CURRENT_DATE
      AND i.due_date >= CURRENT_DATE - INTERVAL '30 days'
  ), 0) AS days_1_30_amount,

  COALESCE(SUM(i.remaining_balance) FILTER (
    WHERE i.status IN ('unpaid', 'partially_paid', 'overdue')
      AND i.due_date < CURRENT_DATE - INTERVAL '30 days'
      AND i.due_date >= CURRENT_DATE - INTERVAL '60 days'
  ), 0) AS days_31_60_amount,

  COALESCE(SUM(i.remaining_balance) FILTER (
    WHERE i.status IN ('unpaid', 'partially_paid', 'overdue')
      AND i.due_date < CURRENT_DATE - INTERVAL '60 days'
  ), 0) AS days_60_plus_amount,

  -- Total AR across all buckets
  COALESCE(SUM(i.remaining_balance) FILTER (
    WHERE i.status IN ('unpaid', 'partially_paid', 'overdue')
  ), 0) AS total_ar,

  -- Critical accounts = invoices 60+ days late with non-zero balance
  COUNT(*) FILTER (
    WHERE i.status IN ('unpaid', 'partially_paid', 'overdue')
      AND i.due_date < CURRENT_DATE - INTERVAL '60 days'
      AND i.remaining_balance > 0
  ) AS critical_accounts
FROM public.invoices i
GROUP BY i.team_id;

GRANT SELECT ON public.ar_aging_buckets TO authenticated;

COMMENT ON VIEW public.ar_aging_buckets IS 'Block 258700: Team-level AR aging buckets (current, 1–30, 31–60, 60+ days late) for invoices.';














