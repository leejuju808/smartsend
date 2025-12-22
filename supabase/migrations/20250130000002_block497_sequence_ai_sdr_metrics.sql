-- Block 497 — Sequence-Level AI SDR Performance
-- View aggregating AI vs normal performance per sequence

CREATE OR REPLACE VIEW sequence_ai_sdr_metrics AS
WITH base_sends AS (
  SELECT
    sq.id AS send_queue_id,
    c.sequence_id,
    sq.lead_id,
    sq.source,
    sq.status,
    sq.created_at
  FROM send_queue sq
  JOIN campaigns c ON c.id = sq.campaign_id
  WHERE sq.status = 'sent'
    AND c.sequence_id IS NOT NULL
),

sequence_sends AS (
  SELECT
    sequence_id,
    COUNT(*) FILTER (WHERE source = 'ai_sdr') AS ai_sdr_sent,
    COUNT(*) FILTER (WHERE source IS NULL OR source = 'campaign') AS campaign_sent
  FROM base_sends
  GROUP BY sequence_id
),

sequence_replies AS (
  -- replies mapped via send_queue.reply_id -> lead_replies.id
  -- Only count replies to AI SDR sends
  SELECT
    bs.sequence_id,
    COUNT(DISTINCT lr.id) AS total_replies,
    COUNT(DISTINCT lr.id) FILTER (
      WHERE lr.intent_label IN ('ready_to_meet', 'open_to_chat', 'needs_info', 'follow_up_later')
    ) AS interested_replies
  FROM base_sends bs
  JOIN send_queue sq ON sq.id = bs.send_queue_id AND sq.reply_id IS NOT NULL
  JOIN lead_replies lr ON lr.id = sq.reply_id
  WHERE bs.source = 'ai_sdr'
  GROUP BY bs.sequence_id
),

sequence_meetings AS (
  -- when a lead in this sequence moves to `meeting_booked` stage
  -- Only count meetings from leads that received AI SDR sends
  SELECT
    bs.sequence_id,
    COUNT(DISTINCT lae.lead_id) AS meetings_booked
  FROM lead_activity_events lae
  JOIN base_sends bs ON bs.lead_id = lae.lead_id AND bs.source = 'ai_sdr'
  WHERE lae.event_type = 'pipeline_changed'
    AND (lae.payload->>'to') = 'meeting_booked'
  GROUP BY bs.sequence_id
)

SELECT
  ss.sequence_id,

  COALESCE(ss.ai_sdr_sent, 0) AS ai_sdr_sent,
  COALESCE(ss.campaign_sent, 0) AS campaign_sent,

  COALESCE(sr.total_replies, 0) AS total_replies,
  COALESCE(sr.interested_replies, 0) AS interested_replies,
  COALESCE(sm.meetings_booked, 0) AS meetings_booked,

  -- aggregate-level ratios (avoid div by 0)
  CASE
    WHEN COALESCE(ss.ai_sdr_sent, 0) = 0 THEN 0
    ELSE ROUND(
      (COALESCE(sr.total_replies, 0)::numeric / ss.ai_sdr_sent::numeric) * 100,
      2
    )
  END AS ai_reply_rate,

  CASE
    WHEN COALESCE(ss.ai_sdr_sent, 0) = 0 THEN 0
    ELSE ROUND(
      (COALESCE(sr.interested_replies, 0)::numeric / ss.ai_sdr_sent::numeric) * 100,
      2
    )
  END AS ai_interested_rate,

  CASE
    WHEN COALESCE(ss.ai_sdr_sent, 0) = 0 THEN 0
    ELSE ROUND(
      (COALESCE(sm.meetings_booked, 0)::numeric / ss.ai_sdr_sent::numeric) * 100,
      2
    )
  END AS ai_meeting_rate

FROM sequence_sends ss
LEFT JOIN sequence_replies sr ON sr.sequence_id = ss.sequence_id
LEFT JOIN sequence_meetings sm ON sm.sequence_id = ss.sequence_id;

-- Grant access to authenticated users
GRANT SELECT ON sequence_ai_sdr_metrics TO authenticated;

