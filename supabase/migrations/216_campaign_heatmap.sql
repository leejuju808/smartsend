CREATE OR REPLACE FUNCTION campaign_heatmap(cid uuid)
RETURNS TABLE (
  ts timestamptz,
  sends int,
  opens int,
  clicks int,
  replies int
) AS $$
BEGIN
  RETURN QUERY
  WITH event_hours AS (
    SELECT
      date_trunc('hour', e.created_at) AS ts,
      count(*) FILTER (WHERE e.event_type = 'sent') AS sends,
      count(*) FILTER (WHERE e.event_type = 'open') AS opens,
      count(*) FILTER (WHERE e.event_type = 'click') AS clicks
    FROM email_events e
    WHERE e.campaign_id = cid
    GROUP BY ts
  ),
  reply_hours AS (
    SELECT
      date_trunc('hour', COALESCE(rt.replied_at, rt.last_message_at, rt.created_at)) AS ts,
      count(*) AS replies
    FROM reply_threads rt
    WHERE rt.campaign_id = cid
      AND rt.replied_at IS NOT NULL
    GROUP BY ts
  )
  SELECT
    COALESCE(eh.ts, rh.ts) AS ts,
    COALESCE(eh.sends, 0) AS sends,
    COALESCE(eh.opens, 0) AS opens,
    COALESCE(eh.clicks, 0) AS clicks,
    COALESCE(rh.replies, 0) AS replies
  FROM event_hours eh
  FULL OUTER JOIN reply_hours rh ON eh.ts = rh.ts
  ORDER BY ts;
END;
$$ LANGUAGE plpgsql;

