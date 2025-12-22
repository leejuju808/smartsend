-- =========================================================
-- Block 21396 — SmartSend Roofing "One-Click Call & Email" Actions
-- =========================================================

-- ============================================================================
-- PART 1 — Update roofing_jobs_with_health view to include homeowner_phone
-- ============================================================================

CREATE OR REPLACE VIEW public.roofing_jobs_with_health AS
SELECT
  j.id as job_id,
  j.org_id,
  j.homeowner_name,
  COALESCE(l.email, c.email) as homeowner_email,
  COALESCE(l.phone, c.phone) as homeowner_phone,
  j.current_stage as status,
  j.created_at,
  j.updated_at,

  h.latest_score,
  h.score_bucket,
  h.engagement_score,
  h.intent_score,
  h.follow_up_score,
  h.timeliness_score,
  h.last_calculated_at

FROM public.roofing_jobs j
LEFT JOIN public.roofing_job_health_scores h
  ON h.job_id = j.id
  AND h.org_id = j.org_id
LEFT JOIN public.leads l
  ON l.id = j.lead_id
LEFT JOIN public.contacts c
  ON c.id = j.contact_id;

COMMENT ON VIEW public.roofing_jobs_with_health IS 'View joining roofing_jobs with health scores for easy querying in frontend. Includes homeowner email and phone from leads or contacts.';

-- ============================================================================
-- PART 2 — Update RPC functions to return homeowner_phone
-- ============================================================================

-- Warm jobs RPC: jobs needing follow-up (last outbound >= 2 days ago, no inbound reply)
CREATE OR REPLACE FUNCTION public.get_warm_jobs_needing_followup(_org_id uuid)
RETURNS TABLE (
  job_id uuid,
  homeowner_name text,
  homeowner_email text,
  homeowner_phone text,
  latest_score integer,
  score_bucket text,
  last_calculated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    j.id as job_id,
    j.homeowner_name,
    COALESCE(l.email, c.email) as homeowner_email,
    COALESCE(l.phone, c.phone) as homeowner_phone,
    h.latest_score,
    h.score_bucket,
    h.last_calculated_at
  FROM public.roofing_jobs j
  JOIN public.roofing_job_health_scores h
    ON h.job_id = j.id AND h.org_id = j.org_id
  LEFT JOIN public.leads l
    ON l.id = j.lead_id
  LEFT JOIN public.contacts c
    ON c.id = j.contact_id
  LEFT JOIN public.inbox_threads t
    ON t.lead_id = j.lead_id
  LEFT JOIN LATERAL (
    SELECT MAX(COALESCE(m2.sent_at, m2.received_at)) as last_outbound_at
    FROM public.inbox_messages m2
    WHERE m2.thread_id = t.id
      AND m2.direction IN ('outbound', 'out')
  ) last_outbound ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) > 0 as has_inbound_after
    FROM public.inbox_messages m3
    WHERE m3.thread_id = t.id
      AND m3.direction IN ('inbound', 'in')
      AND COALESCE(m3.sent_at, m3.received_at) > COALESCE(last_outbound.last_outbound_at, '1970-01-01'::timestamptz)
  ) inbound_check ON true
  WHERE j.org_id = _org_id
    AND h.score_bucket = 'warm'
    AND last_outbound.last_outbound_at IS NOT NULL
    AND last_outbound.last_outbound_at <= (now() - interval '2 days')
    AND COALESCE(inbound_check.has_inbound_after, false) = false
  ORDER BY h.latest_score DESC
  LIMIT 10;
$$;

-- Cold revive RPC: cold jobs created in last 30 days with no reply yet
CREATE OR REPLACE FUNCTION public.get_cold_jobs_to_revive(
  _org_id uuid,
  _since timestamptz
)
RETURNS TABLE (
  job_id uuid,
  homeowner_name text,
  homeowner_email text,
  homeowner_phone text,
  latest_score integer,
  score_bucket text,
  last_calculated_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    j.id as job_id,
    j.homeowner_name,
    COALESCE(l.email, c.email) as homeowner_email,
    COALESCE(l.phone, c.phone) as homeowner_phone,
    h.latest_score,
    h.score_bucket,
    h.last_calculated_at
  FROM public.roofing_jobs j
  JOIN public.roofing_job_health_scores h
    ON h.job_id = j.id AND h.org_id = j.org_id
  LEFT JOIN public.leads l
    ON l.id = j.lead_id
  LEFT JOIN public.contacts c
    ON c.id = j.contact_id
  LEFT JOIN public.inbox_threads t
    ON t.lead_id = j.lead_id
  LEFT JOIN LATERAL (
    SELECT COUNT(*) > 0 as has_inbound
    FROM public.inbox_messages m
    WHERE m.thread_id = t.id
      AND m.direction IN ('inbound', 'in')
  ) inbound_check ON true
  WHERE j.org_id = _org_id
    AND h.score_bucket = 'cold'
    AND j.created_at >= _since
    AND COALESCE(inbound_check.has_inbound, false) = false
  ORDER BY j.created_at DESC
  LIMIT 10;
$$;

COMMENT ON FUNCTION public.get_warm_jobs_needing_followup IS 'Returns warm jobs where last outbound was sent >= 2 days ago with no inbound reply since then. Includes homeowner_phone for one-click actions.';
COMMENT ON FUNCTION public.get_cold_jobs_to_revive IS 'Returns cold jobs created in last 30 days with no inbound reply yet. Includes homeowner_phone for one-click actions.';















































