CREATE OR REPLACE FUNCTION campaign_variant_stats(cid uuid)
RETURNS TABLE (
  variant_id uuid,
  sent int,
  opens int,
  clicks int,
  replies int
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.id,
    (SELECT count(*) FROM email_events e WHERE e.variant_id = v.id AND e.event_type = 'sent' AND e.campaign_id = cid),
    (SELECT count(*) FROM email_events e WHERE e.variant_id = v.id AND e.event_type = 'open' AND e.campaign_id = cid),
    (SELECT count(*) FROM email_events e WHERE e.variant_id = v.id AND e.event_type = 'click' AND e.campaign_id = cid),
    (SELECT count(*) FROM reply_threads t 
     WHERE t.campaign_id = cid 
     AND t.replied_at IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM email_events e2 
       WHERE e2.campaign_id = cid 
       AND e2.variant_id = v.id 
       AND e2.lead_id = t.lead_id
       LIMIT 1
     ))
  FROM campaign_variants v
  WHERE v.campaign_id = cid;
END;
$$ LANGUAGE plpgsql;










