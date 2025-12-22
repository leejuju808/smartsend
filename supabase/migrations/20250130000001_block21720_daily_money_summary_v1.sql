-- =========================================================
-- Block 21720 — SmartSend Roofing Daily Money Summary Email v1
-- (A daily digest that tells roofers exactly how many opportunities SmartSend created yesterday)
-- =========================================================
-- 
-- This feature sends a once-per-day email to the roofing owner/manager summarizing:
-- 🔥 Hot leads created yesterday
-- 🟡 Warm leads created yesterday
-- ✉️ Replies SmartSend captured
-- 🔄 Follow-ups SmartSend sent
-- 📅 Jobs booked (if using booking link)
-- 💰 Estimated job value created (sum of hot/warm leads)
--
-- This turns SmartSend into a visible revenue engine.
-- Every morning they see what SmartSend did while they slept.
-- =========================================================

-- ============================================================================
-- 1) Add daily_summary_enabled to company_notifications table
-- ============================================================================

ALTER TABLE public.company_notifications
  ADD COLUMN IF NOT EXISTS daily_summary_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.company_notifications.daily_summary_enabled IS 'Block 21720: Enable daily money summary emails sent at 6 AM';

-- ============================================================================
-- 2) SQL Helper — Yesterday's Stats Per Workspace
-- ============================================================================
-- RPC function that returns yesterday's stats for a workspace

CREATE OR REPLACE FUNCTION public.get_daily_money_summary(
  p_workspace_id uuid
)
RETURNS TABLE (
  hot_leads int,
  warm_leads int,
  replies_total int,
  follow_ups_sent int,
  jobs_booked int,
  estimated_value numeric
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_day_start date;
  v_day_end date;
BEGIN
  -- Calculate yesterday's date range (start of day to start of today)
  v_day_start := (now()::date - 1);
  v_day_end := now()::date;

  RETURN QUERY
  WITH y AS (
    SELECT
      v_day_start as day_start,
      v_day_end as day_end
  ),
  -- Replies captured yesterday
  -- Note: inbound_emails may have workspace_id or company_id (which maps to workspace_id)
  replies AS (
    SELECT COUNT(*)::int as replies_total
    FROM public.inbound_emails, y
    WHERE (workspace_id = p_workspace_id OR company_id = p_workspace_id)
      AND received_at >= y.day_start
      AND received_at < y.day_end
  ),
  -- Follow-ups sent yesterday
  fus AS (
    SELECT COUNT(*)::int as follow_ups_sent
    FROM public.email_send_queue, y
    WHERE company_id = p_workspace_id  -- Note: email_send_queue uses company_id which maps to workspace_id
      AND follow_up_stage IS NOT NULL
      AND sent_at IS NOT NULL
      AND sent_at >= y.day_start
      AND sent_at < y.day_end
  ),
  -- Leads created yesterday by intent (using score_bucket or last_intent)
  leads_intent AS (
    SELECT
      COUNT(*) FILTER (WHERE score_bucket = 'hot' OR last_intent = 'hot_lead')::int as hot_leads,
      COUNT(*) FILTER (WHERE score_bucket = 'warm' OR last_intent = 'warm_lead')::int as warm_leads,
      COALESCE(SUM(estimated_job_value), 0) as estimated_value
    FROM public.leads, y
    WHERE workspace_id = p_workspace_id
      AND created_at >= y.day_start
      AND created_at < y.day_end
  ),
  -- Booked jobs yesterday (from appointments table)
  booked AS (
    SELECT COUNT(*)::int as jobs_booked
    FROM public.appointments, y
    WHERE workspace_id = p_workspace_id
      AND status IN ('scheduled', 'completed')
      AND created_at >= y.day_start
      AND created_at < y.day_end
  )
  SELECT
    COALESCE(leads_intent.hot_leads, 0),
    COALESCE(leads_intent.warm_leads, 0),
    COALESCE(replies.replies_total, 0),
    COALESCE(fus.follow_ups_sent, 0),
    COALESCE(booked.jobs_booked, 0),
    COALESCE(leads_intent.estimated_value, 0)
  FROM replies
  CROSS JOIN fus
  CROSS JOIN leads_intent
  CROSS JOIN booked;
END;
$$;

COMMENT ON FUNCTION public.get_daily_money_summary(uuid) IS 'Block 21720: Returns yesterday''s stats (hot/warm leads, replies, follow-ups, jobs booked, estimated value) for a workspace';

-- ============================================================================
-- 3) Grant execute permission
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.get_daily_money_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_money_summary(uuid) TO service_role;

