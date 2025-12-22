-- ============================================================
-- Block 272700 — SmartSend Lock‑In Sprint
-- Turn SmartSend into the default decision maker.
--
-- Change:
--   Upgrade public.daily_operator_queue so the "Daily" screen is
--   system-decided:
--   - Reply-first: threads that need a human reply come first
--   - Money-second: stalled estimates surface by value + waiting time
--   - Followups-last: autopilot pressure due today is informational only
--
-- Notes:
--   - security_invoker ensures underlying RLS is respected.
--   - This view is intentionally deterministic: no user ordering.
-- ============================================================

CREATE OR REPLACE VIEW public.daily_operator_queue
WITH (security_invoker = true)
AS
WITH
  -- A) Homeowners waiting (threads needing reply)
  reply_waiting AS (
    SELECT
      t.workspace_id,
      'hot_reply'::text AS item_type,
      t.id AS thread_id,

      t.lead_id AS lead_id,
      COALESCE(l.name, NULLIF(trim(CONCAT(l.first_name, ' ', l.last_name)), ''), l.email)::text AS lead_name,
      l.email AS lead_email,
      h.id AS homeowner_id,
      NULL::uuid AS estimate_id,
      NULL::uuid AS company_id,

      COALESCE(t.estimated_job_value, t.thread_estimated_value, l.estimated_job_value, 0)::numeric(12,2) AS revenue_potential,
      EXTRACT(EPOCH FROM (now() - COALESCE(t.updated_at, t.created_at)))::bigint AS waiting_seconds,
      CASE
        WHEN COALESCE(t.urgency::text, '') = 'urgent' THEN 5
        ELSE 4
      END::int AS urgency,

      NULL::timestamptz AS estimate_sent_at,
      NULL::text AS estimate_status,
      NULL::text AS estimate_followup_status,
      NULL::timestamptz AS next_followup_at,
      NULL::int AS next_followup_step,
      NULL::text AS followup_message_preview,
      NULL::text AS sent_to_email,

      'Homeowner replied — respond now.'::text AS decision_reason
    FROM public.inbox_threads t
    LEFT JOIN public.leads l ON l.id = t.lead_id
    LEFT JOIN public.homeowners h
      ON h.email IS NOT NULL AND l.email IS NOT NULL AND lower(h.email) = lower(l.email)
    WHERE COALESCE(t.needs_reply, false) = true
      AND COALESCE(t.stopped_by_reply, false) = false
      AND COALESCE(t.status::text, 'open') NOT IN ('archived', 'closed')
  ),

  -- B) Fallback "hot leads" (legacy): lead.status = hot and no estimate yet.
  -- Keeps the queue useful even if inbox_threads is not fully populated.
  legacy_hot AS (
    SELECT
      l.workspace_id,
      'hot_reply'::text AS item_type,
      NULL::uuid AS thread_id,

      l.id AS lead_id,
      COALESCE(l.name, NULLIF(trim(CONCAT(l.first_name, ' ', l.last_name)), ''), l.email)::text AS lead_name,
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
      NULL::text AS sent_to_email,

      'Hot lead flagged — create estimate + move fast.'::text AS decision_reason
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

  -- C) Stalled Estimates (sent > 3 days ago, not approved, followups active)
  stalled_estimates AS (
    SELECT
      rc.workspace_id,
      'stalled_estimate'::text AS item_type,
      NULL::uuid AS thread_id,

      NULL::uuid AS lead_id,
      NULL::text AS lead_name,
      NULL::text AS lead_email,
      e.homeowner_id,
      e.id AS estimate_id,
      e.company_id,

      COALESCE(e.total, 0)::numeric(12,2) AS revenue_potential,
      EXTRACT(EPOCH FROM (now() - e.sent_at))::bigint AS waiting_seconds,
      3::int AS urgency,

      e.sent_at AS estimate_sent_at,
      COALESCE(e.status::text, 'sent') AS estimate_status,
      COALESCE(e.followup_status::text, 'active') AS estimate_followup_status,
      e.next_followup_at,
      NULL::int AS next_followup_step,
      NULL::text AS followup_message_preview,
      e.sent_to_email,

      'Estimate sent 3+ days ago — nudge to close.'::text AS decision_reason
    FROM public.estimates e
    JOIN public.roofing_companies rc ON rc.id = e.company_id
    WHERE e.sent_at IS NOT NULL
      AND e.sent_at < (now() - INTERVAL '3 days')
      AND COALESCE(e.status::text, '') <> 'approved'
      AND e.approved_at IS NULL
      AND COALESCE(e.followup_status::text, 'active') = 'active'
  ),

  -- D) Follow-Ups Today (autopilot pressure due today)
  followups_today AS (
    SELECT
      rc.workspace_id,
      'followup_due'::text AS item_type,
      NULL::uuid AS thread_id,

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
      e.sent_to_email,

      'Autopilot follow-up scheduled today (FYI).'::text AS decision_reason
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
    SELECT * FROM reply_waiting
    UNION ALL
    SELECT * FROM legacy_hot
    UNION ALL
    SELECT * FROM stalled_estimates
    UNION ALL
    SELECT * FROM followups_today
  )
SELECT
  -- stable-ish synthetic id per item type
  (item_type || ':' || COALESCE(thread_id::text, estimate_id::text, lead_id::text, homeowner_id::text, '')) AS id,
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
  thread_id,

  estimate_sent_at,
  estimate_status,
  estimate_followup_status,
  next_followup_at,
  next_followup_step,
  followup_message_preview,
  sent_to_email,

  decision_reason,

  row_number() OVER (
    PARTITION BY workspace_id
    ORDER BY
      CASE item_type
        WHEN 'hot_reply' THEN 0
        WHEN 'stalled_estimate' THEN 1
        WHEN 'followup_due' THEN 2
        ELSE 9
      END ASC,
      revenue_potential DESC NULLS LAST,
      urgency DESC,
      waiting_seconds DESC NULLS LAST
  )::int AS rank
FROM combined
WHERE NOT (
  -- minimal noise suppression: hide tiny-value replies unless they're urgent
  item_type = 'hot_reply'
  AND COALESCE(revenue_potential, 0) < 2500
  AND urgency < 5
  AND COALESCE(waiting_seconds, 0) < 6 * 3600
);

GRANT SELECT ON public.daily_operator_queue TO authenticated;

COMMENT ON VIEW public.daily_operator_queue IS 'Block 272700: System-decided daily operator queue (reply-first, then money-at-risk)';



