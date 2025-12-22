-- =========================================================
-- Block 27340 — SmartSend Roofing Collections & Overdue Chase Brain v1
-- (Detect overdue payments • Auto-send reminders • Prioritize who to call • Cashflow stress radar)
-- =========================================================
-- 
-- This block turns SmartSend into the "where's my money?" brain.
-- 
-- Most roofers:
-- - Let overdue balances sit for weeks
-- - Forget who owes what
-- - Don't have a system for reminders
-- - Only notice cashflow problems when it's already bad
-- 
-- SmartSend will now:
-- - Watch every payment request, detect when it's overdue, chase it automatically, 
--   and tell the owner who to call first to fix cashflow.
-- 
-- This is straight survival + growth.

-- ============================================================================
-- PART 1 — OVERDUE PAYMENTS VIEW
-- ============================================================================
-- Calculates how overdue each payment request is

CREATE OR REPLACE VIEW public.roofing_overdue_payments AS
SELECT
  r.id AS payment_request_id,
  r.job_id,
  COALESCE(j.title, j.homeowner_name, 'Job') AS job_name,
  r.request_type,
  r.amount,
  r.due_date,
  r.status,
  COALESCE(r.customer_name, j.homeowner_name) AS customer_name,
  COALESCE(r.customer_email, l.email, c.email) AS customer_email,
  (CURRENT_DATE - r.due_date)::int AS days_overdue
FROM public.roofing_payment_requests r
JOIN public.roofing_jobs j ON j.id = r.job_id
LEFT JOIN public.leads l ON l.id = j.lead_id
LEFT JOIN public.contacts c ON c.id = j.contact_id
WHERE r.status IN ('pending', 'sent', 'overdue')
  AND r.due_date IS NOT NULL
  AND CURRENT_DATE > r.due_date;

-- Grant access
GRANT SELECT ON public.roofing_overdue_payments TO authenticated;
GRANT SELECT ON public.roofing_overdue_payments TO service_role;

COMMENT ON VIEW public.roofing_overdue_payments IS 'Block 27340: View showing all overdue payment requests with days overdue calculation';

-- ============================================================================
-- PART 2 — COLLECTIONS ACTION LOG TABLE
-- ============================================================================
-- Track every reminder / call / escalation

CREATE TABLE IF NOT EXISTS public.roofing_collection_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_request_id uuid REFERENCES public.roofing_payment_requests(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,

  action_type text CHECK (
    action_type IN ('email_reminder', 'sms_reminder', 'call_task', 'internal_note')
  ) NOT NULL,

  channel text,                   -- 'email', 'sms', 'phone', etc.
  status text CHECK (status IN ('queued', 'sent', 'completed', 'skipped')) DEFAULT 'queued',

  details text,                   -- message text / notes
  run_at timestamptz DEFAULT now(),
  completed_at timestamptz,

  created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_roofing_collection_actions_payment_request 
  ON public.roofing_collection_actions(payment_request_id);
CREATE INDEX IF NOT EXISTS idx_roofing_collection_actions_job 
  ON public.roofing_collection_actions(job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_collection_actions_workspace 
  ON public.roofing_collection_actions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_roofing_collection_actions_status 
  ON public.roofing_collection_actions(status);
CREATE INDEX IF NOT EXISTS idx_roofing_collection_actions_run_at 
  ON public.roofing_collection_actions(run_at);

-- Trigger to auto-populate workspace_id from job
CREATE OR REPLACE FUNCTION public.roofing_collection_actions_set_workspace()
RETURNS trigger AS $$
BEGIN
  IF NEW.job_id IS NOT NULL AND NEW.workspace_id IS NULL THEN
    SELECT workspace_id INTO NEW.workspace_id
    FROM public.roofing_jobs
    WHERE id = NEW.job_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_roofing_collection_actions_set_workspace ON public.roofing_collection_actions;
CREATE TRIGGER trg_roofing_collection_actions_set_workspace
BEFORE INSERT ON public.roofing_collection_actions
FOR EACH ROW
EXECUTE FUNCTION public.roofing_collection_actions_set_workspace();

-- RLS
ALTER TABLE public.roofing_collection_actions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view collection actions in their workspace
CREATE POLICY "Users can view collection actions in their workspace"
  ON public.roofing_collection_actions FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Service role can insert collection actions
CREATE POLICY "Service role can insert collection actions"
  ON public.roofing_collection_actions FOR INSERT
  WITH CHECK (true);

-- Policy: Users can update collection actions in their workspace
CREATE POLICY "Users can update collection actions in their workspace"
  ON public.roofing_collection_actions FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.roofing_collection_actions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.roofing_collection_actions TO service_role;

COMMENT ON TABLE public.roofing_collection_actions IS 'Block 27340: Tracks all collection actions (reminders, calls, notes) for overdue payments';

-- ============================================================================
-- PART 3 — COLLECTIONS PRIORITY VIEW
-- ============================================================================
-- Rank overdue payments by who matters most

CREATE OR REPLACE VIEW public.roofing_collections_priority AS
SELECT
  o.payment_request_id,
  o.job_id,
  o.job_name,
  o.customer_name,
  o.customer_email,
  o.request_type,
  o.amount,
  o.due_date,
  o.days_overdue,

  -- severity: high > medium > low
  CASE
    WHEN o.days_overdue >= 30 THEN 'high'
    WHEN o.days_overdue >= 14 THEN 'medium'
    ELSE 'low'
  END AS severity,

  -- recommended channel
  CASE
    WHEN o.days_overdue >= 30 THEN 'call'
    WHEN o.days_overdue >= 14 THEN 'email+call'
    ELSE 'email'
  END AS recommended_channel

FROM public.roofing_overdue_payments o
ORDER BY o.days_overdue DESC, o.amount DESC;

-- Grant access
GRANT SELECT ON public.roofing_collections_priority TO authenticated;
GRANT SELECT ON public.roofing_collections_priority TO service_role;

COMMENT ON VIEW public.roofing_collections_priority IS 'Block 27340: Prioritized list of overdue payments with severity and recommended actions';

-- ============================================================================
-- PART 4 — UPDATE EXECUTIVE SUMMARY VIEW
-- ============================================================================
-- Add total_overdue to executive summary

-- First, drop and recreate the view to add overdue totals
-- Note: This assumes roofing_executive_summary already exists from Block 26800

CREATE OR REPLACE VIEW public.roofing_executive_summary AS
SELECT
  w.id AS workspace_id,
  
  -- Cashflow (30-day forecast)
  COALESCE(cf.net_30d, 0) AS net_cashflow_30d,
  COALESCE(cf.incoming_30d, 0) AS incoming_cashflow_30d,
  COALESCE(cf.outgoing_30d, 0) AS outgoing_cashflow_30d,

  -- Profit Summary
  COALESCE(profit.total_projected_profit, 0) AS total_projected_profit,
  COALESCE(profit.total_projected_revenue, 0) AS total_projected_revenue,

  -- Collections (AR)
  COALESCE(ar.total_ar, 0) AS total_ar,
  COALESCE(ar.overdue_ar, 0) AS overdue_ar,

  -- Overdue Payments (from payment requests)
  COALESCE(overdue.total_overdue, 0) AS total_overdue,

  -- Renewal Opportunities (safe function call that handles missing table)
  public.get_pending_renewals(w.id) AS pending_renewals
FROM public.workspaces w
LEFT JOIN public.roofing_owner_30day_cashflow_summary cf ON cf.workspace_id = w.id
LEFT JOIN (
  SELECT 
    workspace_id,
    SUM(gross_profit) AS total_projected_profit,
    SUM(COALESCE(final_revenue, estimated_revenue)) AS total_projected_revenue
  FROM public.roofing_job_profit
  GROUP BY workspace_id
) profit ON profit.workspace_id = w.id
LEFT JOIN (
  SELECT 
    workspace_id,
    SUM(CASE WHEN balance_due > 0 THEN balance_due ELSE 0 END) AS total_ar,
    SUM(CASE WHEN status = 'overdue' THEN balance_due ELSE 0 END) AS overdue_ar
  FROM public.roofing_invoice_balances
  GROUP BY workspace_id
) ar ON ar.workspace_id = w.id
LEFT JOIN (
  SELECT 
    r.workspace_id,
    SUM(r.amount) AS total_overdue
  FROM public.roofing_payment_requests r
  WHERE r.status = 'overdue'
    AND r.due_date IS NOT NULL
    AND CURRENT_DATE > r.due_date
  GROUP BY r.workspace_id
) overdue ON overdue.workspace_id = w.id
WHERE w.is_active = true;

-- Grant access (re-grant in case view was recreated)
GRANT SELECT ON public.roofing_executive_summary TO authenticated;
GRANT SELECT ON public.roofing_executive_summary TO service_role;

COMMENT ON VIEW public.roofing_executive_summary IS 'Block 26800 + 27340: Executive summary view aggregating cashflow, profit, AR, overdue payments, and renewal opportunities';



































