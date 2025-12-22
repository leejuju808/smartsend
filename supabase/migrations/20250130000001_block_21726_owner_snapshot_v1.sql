-- Block 21726 — SmartSend Roofing "Owner Snapshot" Top Bar v1
-- SQL Helper — get_owner_snapshot(p_company_id)
-- Returns pipeline_value, won_value, today_hot_leads, today_jobs_booked

CREATE OR REPLACE FUNCTION public.get_owner_snapshot(
  p_company_id uuid
)
RETURNS TABLE (
  pipeline_value numeric,
  won_value numeric,
  today_hot_leads int,
  today_jobs_booked int
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH today AS (
    SELECT
      date_trunc('day', now()) AS day_start,
      date_trunc('day', now()) + interval '1 day' AS day_end
  ),
  leads_agg AS (
    SELECT
      coalesce(sum(estimated_job_value)
        FILTER (WHERE status IN ('new','working')), 0) AS pipeline_value,
      coalesce(sum(estimated_job_value)
        FILTER (WHERE status = 'booked'), 0) AS won_value
    FROM leads
    WHERE company_id = p_company_id
  ),
  today_hot AS (
    SELECT
      count(*) AS today_hot_leads
    FROM leads, today
    WHERE company_id = p_company_id
      AND intent = 'hot'
      AND created_at >= today.day_start
      AND created_at < today.day_end
  ),
  today_jobs AS (
    SELECT
      count(*) AS today_jobs_booked
    FROM jobs, today
    WHERE company_id = p_company_id
      AND booked_at >= today.day_start
      AND booked_at < today.day_end
  )
  SELECT
    leads_agg.pipeline_value,
    leads_agg.won_value,
    today_hot.today_hot_leads,
    today_jobs.today_jobs_booked
  FROM leads_agg, today_hot, today_jobs;
END;
$$;

COMMENT ON FUNCTION public.get_owner_snapshot IS 'Block 21726: Returns owner snapshot metrics (pipeline value, won value, today hot leads, today jobs booked)';











































