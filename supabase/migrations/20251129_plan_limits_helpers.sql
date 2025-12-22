-- =========================================================
-- Block 8720 — Workspace Plan Limits + Usage Helpers
-- =========================================================

-- Helper: get current plan + limits for a workspace
CREATE OR REPLACE FUNCTION public.get_workspace_plan_limits(
  p_workspace_id uuid
)
RETURNS TABLE (
  plan_id text,
  max_campaigns integer,
  max_emails_per_month integer
)
LANGUAGE sql
AS $$
  SELECT
    ws.plan_id,
    sp.max_campaigns,
    sp.max_emails_per_month
  FROM public.workspace_subscriptions ws
  JOIN public.subscription_plans sp
    ON sp.id = ws.plan_id
  WHERE ws.workspace_id = p_workspace_id
  LIMIT 1;
$$;

-- Helper: get current month email count for workspace
-- Counts sent + pending for this calendar month
CREATE OR REPLACE FUNCTION public.get_workspace_monthly_email_usage(
  p_workspace_id uuid
)
RETURNS integer
LANGUAGE sql
AS $$
  SELECT COUNT(*)
  FROM public.outbound_emails
  WHERE workspace_id = p_workspace_id
    AND date_trunc('month', COALESCE(sent_at, send_at)) = date_trunc('month', now());
$$;


























































