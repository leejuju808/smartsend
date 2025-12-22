-- =========================================================
-- Block 21742 — SmartSend Roofing Revenue Tracker v1
-- (Tie Won Quotes → Monthly Revenue • Close Rates • Average Job Size)
-- =========================================================
-- 
-- This is where SmartSend stops being "lead software"...
-- and becomes: "This is how much money SmartSend helped you close."
--
-- This is what gets roofers to pay, stay, and upgrade plans.

-- ============================================================================
-- STEP 1: OPTIONAL - Add "job_value" to Leads (for fast reads)
-- ============================================================================
-- Not strictly required, but nice for future stuff

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS job_value NUMERIC DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_leads_job_value ON public.leads(job_value) 
WHERE job_value > 0;

COMMENT ON COLUMN public.leads.job_value IS 'Block 21742: Actual job value from accepted quotes (for fast reads)';

-- ============================================================================
-- STEP 2: CREATE REVENUE_SUMMARY FUNCTION
-- ============================================================================
-- Returns monthly revenue breakdown for the last N months

CREATE OR REPLACE FUNCTION public.revenue_summary(p_months int DEFAULT 6, p_workspace_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
  v_start timestamptz := date_trunc('month', v_now) - (interval '1 month' * (p_months - 1));
  v_workspace_id uuid;
  monthly json;
  overall json;
BEGIN
  -- If workspace_id not provided, get it from current user's workspace membership
  IF p_workspace_id IS NULL THEN
    SELECT workspace_id INTO v_workspace_id
    FROM public.workspace_members
    WHERE user_id = auth.uid()
    ORDER BY created_at ASC
    LIMIT 1;
  ELSE
    v_workspace_id := p_workspace_id;
  END IF;

  -- If still no workspace found, return empty result
  IF v_workspace_id IS NULL THEN
    RETURN json_build_object(
      'start', v_start,
      'end', v_now,
      'months', '[]'::json,
      'overall', json_build_object(
        'won_jobs', 0,
        'sent_quotes', 0,
        'closed_revenue', 0,
        'avg_job_size', 0,
        'close_rate_percent', 0
      )
    );
  END IF;

  -- Monthly breakout for last p_months (filtered by workspace via leads)
  monthly := (
    SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)
    FROM (
      SELECT
        to_char(date_trunc('month', q.decided_at), 'YYYY-MM') as month,
        count(*) FILTER (WHERE q.status = 'accepted') as won_jobs,
        count(*) FILTER (WHERE q.status IN ('sent','viewed','accepted')) as sent_quotes,
        COALESCE(sum(q.total) FILTER (WHERE q.status = 'accepted'), 0) as closed_revenue,
        CASE
          WHEN count(*) FILTER (WHERE q.status = 'accepted') > 0
          THEN ROUND(
            COALESCE(
              sum(q.total) FILTER (WHERE q.status = 'accepted'), 0
            ) 
            / NULLIF(count(*) FILTER (WHERE q.status = 'accepted'), 0)
          , 2)
          ELSE 0
        END as avg_job_size,
        CASE
          WHEN count(*) FILTER (WHERE q.status IN ('sent','viewed','accepted')) > 0
          THEN ROUND(
            100.0 * count(*) FILTER (WHERE q.status = 'accepted')
            / NULLIF(count(*) FILTER (WHERE q.status IN ('sent','viewed','accepted')),0)
          , 1)
          ELSE 0
        END as close_rate_percent
      FROM public.quotes q
      INNER JOIN public.leads l ON l.id = q.lead_id
      WHERE q.decided_at IS NOT NULL
        AND q.decided_at >= v_start
        AND q.decided_at <= v_now
        AND l.workspace_id = v_workspace_id
      GROUP BY date_trunc('month', q.decided_at)
      ORDER BY date_trunc('month', q.decided_at)
    ) t
  );

  -- Overall totals for the same period (filtered by workspace via leads)
  overall := (
    SELECT json_build_object(
      'won_jobs', count(*) FILTER (WHERE q.status = 'accepted'),
      'sent_quotes', count(*) FILTER (WHERE q.status IN ('sent','viewed','accepted')),
      'closed_revenue', COALESCE(sum(q.total) FILTER (WHERE q.status = 'accepted'), 0),
      'avg_job_size',
        CASE
          WHEN count(*) FILTER (WHERE q.status = 'accepted') > 0
          THEN ROUND(
            COALESCE(
              sum(q.total) FILTER (WHERE q.status = 'accepted'), 0
            ) 
            / NULLIF(count(*) FILTER (WHERE q.status = 'accepted'), 0)
          , 2)
          ELSE 0
        END,
      'close_rate_percent',
        CASE
          WHEN count(*) FILTER (WHERE q.status IN ('sent','viewed','accepted')) > 0
          THEN ROUND(
            100.0 * count(*) FILTER (WHERE q.status = 'accepted')
            / NULLIF(count(*) FILTER (WHERE q.status IN ('sent','viewed','accepted')),0)
          , 1)
          ELSE 0
        END
    )
    FROM public.quotes q
    INNER JOIN public.leads l ON l.id = q.lead_id
    WHERE q.decided_at IS NOT NULL
      AND q.decided_at >= v_start
      AND q.decided_at <= v_now
      AND l.workspace_id = v_workspace_id
  );

  RETURN json_build_object(
    'start', v_start,
    'end', v_now,
    'months', monthly,
    'overall', overall
  );
END;
$$;

COMMENT ON FUNCTION public.revenue_summary IS 'Block 21742: Returns monthly revenue summary from accepted quotes (won jobs, sent quotes, closed revenue, avg job size, close rate)';

