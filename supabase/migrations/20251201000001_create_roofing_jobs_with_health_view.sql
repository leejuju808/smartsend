-- =========================================================
-- Block 21383 — SmartSend Roofing Job Health in Pipeline + Job Detail
-- Create view for jobs with health scores
-- =========================================================

-- ============================================================================
-- PART 1 — Create roofing_jobs_with_health view
-- ============================================================================

CREATE OR REPLACE VIEW public.roofing_jobs_with_health AS
SELECT
  j.id as job_id,
  j.org_id,
  j.homeowner_name,
  COALESCE(l.email, c.email) as homeowner_email,
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

-- ============================================================================
-- PART 2 — RLS for the view
-- ============================================================================

ALTER VIEW public.roofing_jobs_with_health SET (security_invoker = on);

-- (The underlying tables already have RLS; this just respects those policies.)

-- ============================================================================
-- PART 3 — Comments
-- ============================================================================

COMMENT ON VIEW public.roofing_jobs_with_health IS 'View joining roofing_jobs with health scores for easy querying in frontend. Includes homeowner email from leads or contacts.';















































