-- =========================================================
-- Block 8570 — Lead Value + Pipeline Summary
-- =========================================================

-- 1) Add estimated_value + currency to leads
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS estimated_value numeric(12,2),
ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';

CREATE INDEX IF NOT EXISTS idx_leads_status
  ON public.leads (status);

-- 2) Pipeline summary view per workspace
DROP VIEW IF EXISTS public.lead_pipeline_summary_view;

CREATE VIEW public.lead_pipeline_summary_view AS
SELECT
  workspace_id,
  status,
  COUNT(*)::bigint AS lead_count,
  COALESCE(SUM(estimated_value), 0)::numeric(12,2) AS total_value
FROM public.leads
GROUP BY workspace_id, status;


























































