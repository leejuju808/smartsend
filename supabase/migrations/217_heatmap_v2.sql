-- Block 211: Campaign Engagement Heatmap v2
-- Hour-by-Hour Grid, Day-of-Week Grid, Opens/Clicks/Replies Density

-- Hour-of-day heatmap
CREATE OR REPLACE FUNCTION campaign_heatmap_hour(cid uuid)
RETURNS TABLE (
  hour int,
  sends int,
  opens int,
  clicks int,
  replies int
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    extract(hour from e.created_at)::int AS hour,
    count(*) FILTER (WHERE e.event_type = 'sent') AS sends,
    count(*) FILTER (WHERE e.event_type = 'open') AS opens,
    count(*) FILTER (WHERE e.event_type = 'click') AS clicks,
    count(*) FILTER (WHERE e.event_type = 'reply') AS replies
  FROM email_events e
  WHERE e.campaign_id = cid
  GROUP BY hour
  ORDER BY hour;
END;
$$ LANGUAGE plpgsql;

-- Day-of-week heatmap
CREATE OR REPLACE FUNCTION campaign_heatmap_dow(cid uuid)
RETURNS TABLE (
  dow int,
  sends int,
  opens int,
  clicks int,
  replies int
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    extract(dow from e.created_at)::int AS dow,   -- 0=Sun, 1=Mon...
    count(*) FILTER (WHERE e.event_type = 'sent') AS sends,
    count(*) FILTER (WHERE e.event_type = 'open') AS opens,
    count(*) FILTER (WHERE e.event_type = 'click') AS clicks,
    count(*) FILTER (WHERE e.event_type = 'reply') AS replies
  FROM email_events e
  WHERE e.campaign_id = cid
  GROUP BY dow
  ORDER BY dow;
END;
$$ LANGUAGE plpgsql;










