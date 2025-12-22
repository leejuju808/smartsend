-- Block 503 — SDR Team Performance Board
-- (AI vs Human performance per rep)
--
-- This block enables SmartSend to track and display team performance metrics:
-- ✔ Tag sends to SDRs (sent_by_user_id)
-- ✔ Track lead ownership (owner_id already exists)
-- ✔ View: sdr_user_performance_metrics
-- ✔ Team Performance dashboard page

-- ============================================================================
-- 1. Schema: Add sent_by_user_id to send_queue
-- ============================================================================

-- Add sent_by_user_id column to send_queue table
ALTER TABLE public.send_queue
ADD COLUMN IF NOT EXISTS sent_by_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_send_queue_sent_by_user ON public.send_queue(sent_by_user_id) 
WHERE sent_by_user_id IS NOT NULL;

-- ============================================================================
-- 2. View: sdr_user_performance_metrics
-- ============================================================================

CREATE OR REPLACE VIEW public.sdr_user_performance_metrics AS
WITH last_30_days AS (
  SELECT (now() - interval '30 days') AS cutoff
),

base_users AS (
  -- map SDRs from profiles table
  SELECT
    p.id AS user_id,
    COALESCE(p.full_name, p.email, 'Unknown') AS name,
    p.email
  FROM public.profiles p
),

email_sends AS (
  -- Human sends: where sent_by_user_id is set
  SELECT
    sq.sent_by_user_id AS user_id,
    COUNT(*) FILTER (
      WHERE sq.source IS NULL OR sq.source IN ('campaign', 'manual', 'manual_reply')
    ) AS human_sent,
    0 AS ai_sent
  FROM public.send_queue sq, last_30_days l30
  WHERE sq.status = 'sent'
    AND sq.created_at >= l30.cutoff
    AND sq.sent_by_user_id IS NOT NULL
  GROUP BY sq.sent_by_user_id
  
  UNION ALL
  
  -- AI sends: associate via lead ownership
  SELECT
    l.owner_id AS user_id,
    0 AS human_sent,
    COUNT(*) AS ai_sent
  FROM public.send_queue sq
  JOIN public.leads l ON l.id = sq.lead_id
  CROSS JOIN last_30_days l30
  WHERE sq.status = 'sent'
    AND sq.created_at >= l30.cutoff
    AND sq.source = 'ai_sdr'
    AND l.owner_id IS NOT NULL
  GROUP BY l.owner_id
),

owned_leads AS (
  SELECT
    l.owner_id AS user_id,
    COUNT(*) AS owned_lead_count
  FROM public.leads l
  WHERE l.owner_id IS NOT NULL
  GROUP BY l.owner_id
),

owned_replies AS (
  SELECT
    l.owner_id AS user_id,
    COUNT(*) AS total_replies,
    COUNT(*) FILTER (
      WHERE lr.intent_label IN (
        'ready_to_meet',
        'open_to_chat',
        'needs_info',
        'follow_up_later'
      )
    ) AS interested_replies
  FROM public.lead_replies lr
  JOIN public.leads l ON l.id = lr.lead_id
  CROSS JOIN last_30_days l30
  WHERE l.owner_id IS NOT NULL
    AND lr.created_at >= l30.cutoff
  GROUP BY l.owner_id
),

owned_meetings AS (
  SELECT
    l.owner_id AS user_id,
    COUNT(DISTINCT lae.lead_id) AS meetings_booked
  FROM public.lead_activity_events lae
  JOIN public.leads l ON l.id = lae.lead_id
  CROSS JOIN last_30_days l30
  WHERE l.owner_id IS NOT NULL
    AND lae.event_type = 'pipeline_changed'
    AND (lae.payload->>'to') = 'meeting_booked'
    AND lae.created_at >= l30.cutoff
  GROUP BY l.owner_id
)

SELECT
  bu.user_id,
  bu.name,
  bu.email,

  COALESCE(os.owned_lead_count, 0) AS owned_lead_count,

  COALESCE(es.human_sent, 0) AS human_sent_30d,
  COALESCE(es.ai_sent, 0) AS ai_sent_30d,

  COALESCE(or2.total_replies, 0) AS replies_30d,
  COALESCE(or2.interested_replies, 0) AS interested_replies_30d,

  COALESCE(om.meetings_booked, 0) AS meetings_30d,

  CASE
    WHEN COALESCE(es.human_sent, 0) = 0 THEN 0
    ELSE ROUND(
      (COALESCE(or2.total_replies, 0)::numeric
       / es.human_sent::numeric) * 100,
      2
    )
  END AS human_reply_rate_30d,

  CASE
    WHEN COALESCE(es.ai_sent, 0) = 0 THEN 0
    ELSE ROUND(
      (COALESCE(or2.total_replies, 0)::numeric
       / es.ai_sent::numeric) * 100,
      2
    )
  END AS ai_reply_rate_30d

FROM base_users bu
LEFT JOIN (
  SELECT
    user_id,
    SUM(human_sent) AS human_sent,
    SUM(ai_sent) AS ai_sent
  FROM email_sends
  GROUP BY user_id
) es ON es.user_id = bu.user_id
LEFT JOIN owned_leads os ON os.user_id = bu.user_id
LEFT JOIN owned_replies or2 ON or2.user_id = bu.user_id
LEFT JOIN owned_meetings om ON om.user_id = bu.user_id;

-- Grant access to authenticated users
GRANT SELECT ON public.sdr_user_performance_metrics TO authenticated;

