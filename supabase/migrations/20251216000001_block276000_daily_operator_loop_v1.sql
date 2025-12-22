-- ============================================================
-- Block 276000 — SmartSend Daily Operator Loop v1
-- “What Roofers See Every Morning”
--
-- Objective:
--   Make SmartSend the first screen roofers check every day:
--   - who to reply to
--   - which estimates are at risk
--   - where today's money is coming from
--
-- Ship condition (DB):
--   View: public.daily_operator_queue
--   Combines: leads, estimates, followups
--   Sorted: revenue potential, time waiting, urgency
-- ============================================================

-- 0) Ensure required columns exist (non-destructive)
DO $$
BEGIN
  -- Leads: revenue hint for prioritization
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'leads'
  ) THEN
    ALTER TABLE public.leads
      ADD COLUMN IF NOT EXISTS estimated_job_value numeric(12,2);

    CREATE INDEX IF NOT EXISTS idx_leads_estimated_job_value
      ON public.leads(estimated_job_value DESC)
      WHERE estimated_job_value IS NOT NULL;
  END IF;

  -- Estimates: ensure send/followup fields exist (some envs have older schemas)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'estimates'
  ) THEN
    ALTER TABLE public.estimates
      ADD COLUMN IF NOT EXISTS sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS sent_to_email text,
      ADD COLUMN IF NOT EXISTS approved_at timestamptz,
      ADD COLUMN IF NOT EXISTS followup_status text DEFAULT 'paused',
      ADD COLUMN IF NOT EXISTS next_followup_at timestamptz;
  END IF;
END $$;

-- 1) Canonical daily queue view
-- Notes:
-- - security_invoker ensures underlying table RLS is respected for the caller.
-- - workspace_id is required for filtering to the active workspace.
CREATE OR REPLACE VIEW public.daily_operator_queue
WITH (security_invoker = true)
AS
WITH
  -- A) Hot Replies (lead is hot, and no estimate exists yet for matching homeowner email)
  hot_replies AS (
    SELECT
      l.workspace_id,
      'hot_reply'::text AS item_type,
      l.id AS lead_id,
      l.name AS lead_name,
      l.email AS lead_email,
      h.id AS homeowner_id,
      NULL::uuid AS estimate_id,
      NULL::uuid AS company_id,

      COALESCE(l.estimated_job_value, 0)::numeric(12,2) AS revenue_potential,
      EXTRACT(EPOCH FROM (now() - COALESCE(l.updated_at, l.created_at)))::bigint AS waiting_seconds,
      3::int AS urgency,

      NULL::timestamptz AS estimate_sent_at,
      NULL::text AS estimate_status,
      NULL::text AS estimate_followup_status,
      NULL::timestamptz AS next_followup_at,
      NULL::int AS next_followup_step,
      NULL::text AS followup_message_preview,
      NULL::text AS sent_to_email
    FROM public.leads l
    LEFT JOIN public.homeowners h
      ON h.email IS NOT NULL AND l.email IS NOT NULL AND lower(h.email) = lower(l.email)
    WHERE lower(COALESCE(l.status::text, '')) = 'hot'
      AND (
        h.id IS NULL
        OR NOT EXISTS (
          SELECT 1
          FROM public.estimates e
          WHERE e.homeowner_id = h.id
        )
      )
  ),

  -- Helper for follow-up preview: determine next step (1..3) from sent followups
  estimate_followup_state AS (
    SELECT
      e.id AS estimate_id,
      COALESCE((
        SELECT COUNT(*)::int
        FROM public.followups f
        WHERE f.estimate_id = e.id AND f.sent_at IS NOT NULL
      ), 0) AS followups_sent
    FROM public.estimates e
  ),

  -- B) Stalled Estimates (sent > 3 days ago, not approved, followups active)
  stalled_estimates AS (
    SELECT
      rc.workspace_id,
      'stalled_estimate'::text AS item_type,
      NULL::uuid AS lead_id,
      NULL::text AS lead_name,
      NULL::text AS lead_email,
      e.homeowner_id,
      e.id AS estimate_id,
      e.company_id,

      COALESCE(e.total, 0)::numeric(12,2) AS revenue_potential,
      EXTRACT(EPOCH FROM (now() - e.sent_at))::bigint AS waiting_seconds,
      2::int AS urgency,

      e.sent_at AS estimate_sent_at,
      COALESCE(e.status::text, 'sent') AS estimate_status,
      COALESCE(e.followup_status::text, 'active') AS estimate_followup_status,
      e.next_followup_at,
      NULL::int AS next_followup_step,
      NULL::text AS followup_message_preview,
      e.sent_to_email
    FROM public.estimates e
    JOIN public.roofing_companies rc ON rc.id = e.company_id
    WHERE e.sent_at IS NOT NULL
      AND e.sent_at < (now() - INTERVAL '3 days')
      AND COALESCE(e.status::text, '') <> 'approved'
      AND e.approved_at IS NULL
      AND COALESCE(e.followup_status::text, 'active') = 'active'
  ),

  -- C) Follow-Ups Today (next_followup_at is today, followups active)
  followups_today AS (
    SELECT
      rc.workspace_id,
      'followup_due'::text AS item_type,
      NULL::uuid AS lead_id,
      NULL::text AS lead_name,
      NULL::text AS lead_email,
      e.homeowner_id,
      e.id AS estimate_id,
      e.company_id,

      COALESCE(e.total, 0)::numeric(12,2) AS revenue_potential,
      EXTRACT(EPOCH FROM (now() - COALESCE(e.sent_at, e.created_at)))::bigint AS waiting_seconds,
      1::int AS urgency,

      e.sent_at AS estimate_sent_at,
      COALESCE(e.status::text, 'sent') AS estimate_status,
      COALESCE(e.followup_status::text, 'active') AS estimate_followup_status,
      e.next_followup_at,
      LEAST(3, GREATEST(1, (efs.followups_sent + 1))) AS next_followup_step,
      CASE LEAST(3, GREATEST(1, (efs.followups_sent + 1)))
        WHEN 1 THEN 'Hi there, just checking in to see if you had any questions about the roofing estimate I sent over. Happy to help.'
        WHEN 2 THEN 'Wanted to follow up on the estimate in case timing matters — we’re booking out fast and wanted to make sure you had a spot.'
        ELSE 'Last check-in before we close this out. Let me know if you’d like to move forward or need adjustments.'
      END AS followup_message_preview,
      e.sent_to_email
    FROM public.estimates e
    JOIN public.roofing_companies rc ON rc.id = e.company_id
    LEFT JOIN estimate_followup_state efs ON efs.estimate_id = e.id
    WHERE COALESCE(e.followup_status::text, 'active') = 'active'
      AND e.next_followup_at IS NOT NULL
      AND e.next_followup_at >= date_trunc('day', now())
      AND e.next_followup_at < (date_trunc('day', now()) + INTERVAL '1 day')
      AND COALESCE(e.status::text, '') <> 'approved'
      AND e.approved_at IS NULL
  ),

  combined AS (
    SELECT * FROM hot_replies
    UNION ALL
    SELECT * FROM stalled_estimates
    UNION ALL
    SELECT * FROM followups_today
  )
SELECT
  -- stable-ish synthetic id per item type
  (item_type || ':' || COALESCE(estimate_id::text, lead_id::text, homeowner_id::text, '')) AS id,
  workspace_id,
  item_type,
  urgency,
  revenue_potential,
  waiting_seconds,

  lead_id,
  lead_name,
  lead_email,
  homeowner_id,
  estimate_id,
  company_id,

  estimate_sent_at,
  estimate_status,
  estimate_followup_status,
  next_followup_at,
  next_followup_step,
  followup_message_preview,
  sent_to_email,

  row_number() OVER (
    PARTITION BY workspace_id
    ORDER BY
      revenue_potential DESC NULLS LAST,
      waiting_seconds DESC NULLS LAST,
      urgency DESC,
      COALESCE(estimate_sent_at, now()) ASC
  )::int AS rank
FROM combined;

GRANT SELECT ON public.daily_operator_queue TO authenticated;

COMMENT ON VIEW public.daily_operator_queue IS 'Block 276000: Daily operator priority queue (hot replies, stalled estimates, followups due today)';










