-- Analytics MB/100 Implementation
-- This migration creates views for tracking MB/100 (Meetings per 100 Replies) and sender health metrics

-- Helpful indexes (safe if they already exist)
CREATE INDEX IF NOT EXISTS idx_messages_profile_direction_created
  ON messages(profile_id, direction, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meetings_profile_invstatus_created
  ON meetings(profile_id, invite_status, created_at DESC);

-- Daily rollup view (per profile per day)
CREATE OR REPLACE VIEW analytics_daily AS
SELECT
  p.id AS profile_id,
  date_trunc('day', COALESCE(m.created_at, mt.created_at))::date AS day,
  COALESCE(SUM(CASE WHEN m.direction = 'inbound' THEN 1 ELSE 0 END), 0) AS replies_count,
  COALESCE(SUM(CASE WHEN mt.invite_status IN ('sent','booked') THEN 1 ELSE 0 END), 0) AS meetings_count
FROM profiles p
LEFT JOIN messages m
  ON m.profile_id = p.id
  AND m.created_at >= now() - interval '90 days'
LEFT JOIN meetings mt
  ON mt.profile_id = p.id
  AND mt.created_at >= now() - interval '90 days'
GROUP BY p.id, date_trunc('day', COALESCE(m.created_at, mt.created_at))::date;

-- Helper view: totals in a window (30 days)
CREATE OR REPLACE VIEW analytics_totals_30d AS
SELECT
  profile_id,
  SUM(replies_count) AS replies_30d,
  SUM(meetings_count) AS meetings_30d,
  CASE
    WHEN SUM(replies_count) = 0 THEN 0
    ELSE ROUND( (SUM(meetings_count)::numeric / SUM(replies_count)::numeric) * 100, 2)
  END AS mb_per_100_30d,
  CASE
    WHEN SUM(replies_count) = 0 THEN 0
    ELSE ROUND( (SUM(meetings_count)::numeric / SUM(replies_count)::numeric) * 100, 2)
  END AS replies_to_meetings_pct_30d
FROM analytics_daily
WHERE day >= (CURRENT_DATE - INTERVAL '30 days')
GROUP BY profile_id;

-- Minimal sender health heuristic (score 0–100)
-- Inputs: reply volume + MB/100; tune weights later.
CREATE OR REPLACE VIEW analytics_sender_health_30d AS
WITH base AS (
  SELECT
    t.profile_id,
    t.replies_30d,
    t.meetings_30d,
    t.mb_per_100_30d
  FROM analytics_totals_30d t
),
norms AS (
  SELECT
    b.*,
    NULLIF(MAX(b.replies_30d) OVER(), 0) AS max_replies
  FROM base b
)
SELECT
  profile_id,
  replies_30d,
  meetings_30d,
  mb_per_100_30d,
  -- 60% weight on MB/100, 40% weight on reply volume normalized
  ROUND( LEAST(100,
    (0.6 * LEAST(100, mb_per_100_30d)) +
    (0.4 * COALESCE((replies_30d::numeric / NULLIF(max_replies,0)) * 100, 0))
  ), 1) AS sender_health_score
FROM norms;

-- Optional: tighten RLS later; API uses service role for server-side reads.
