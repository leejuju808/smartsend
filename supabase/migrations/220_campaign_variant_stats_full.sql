-- Block 212: Campaign Variant Experiments v1
-- Expanded variant stats with meeting-intent-weighted scoring

CREATE OR REPLACE FUNCTION campaign_variant_stats_full(cid uuid)
RETURNS TABLE (
  variant_id uuid,
  name text,
  weight numeric,
  sent int,
  opens int,
  clicks int,
  replies int,
  meeting_intent int,
  reply_rate numeric,
  meeting_rate numeric,
  score numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.id as variant_id,
    v.name,
    v.weight,
    COALESCE((
      SELECT count(*)::int 
      FROM email_events e 
      WHERE e.variant_id = v.id 
        AND e.event_type = 'sent'
        AND e.campaign_id = cid
    ), 0) as sent,
    COALESCE((
      SELECT count(*)::int 
      FROM email_events e 
      WHERE e.variant_id = v.id 
        AND e.event_type = 'open'
        AND e.campaign_id = cid
    ), 0) as opens,
    COALESCE((
      SELECT count(*)::int 
      FROM email_events e 
      WHERE e.variant_id = v.id 
        AND e.event_type = 'click'
        AND e.campaign_id = cid
    ), 0) as clicks,
    COALESCE((
      SELECT count(*)::int 
      FROM reply_threads t 
      WHERE t.variant_id = v.id 
        AND t.campaign_id = cid
        AND (t.last_incoming_message_at IS NOT NULL OR t.replied_at IS NOT NULL)
    ), 0) as replies,
    COALESCE((
      SELECT count(*)::int 
      FROM reply_threads t 
      WHERE t.variant_id = v.id 
        AND t.campaign_id = cid
        AND t.intent_primary = 'meeting_intent'
    ), 0) as meeting_intent,
    CASE 
      WHEN COALESCE((
        SELECT count(*)::int 
        FROM email_events e 
        WHERE e.variant_id = v.id 
          AND e.event_type = 'sent'
          AND e.campaign_id = cid
      ), 0) = 0 THEN 0::numeric
      ELSE (
        COALESCE((
          SELECT count(*)::numeric 
          FROM reply_threads t 
          WHERE t.variant_id = v.id 
            AND t.campaign_id = cid
            AND (t.last_incoming_message_at IS NOT NULL OR t.replied_at IS NOT NULL)
        ), 0) / 
        COALESCE((
          SELECT count(*)::numeric 
          FROM email_events e 
          WHERE e.variant_id = v.id 
            AND e.event_type = 'sent'
            AND e.campaign_id = cid
        ), 1)
      )
    END as reply_rate,
    CASE 
      WHEN COALESCE((
        SELECT count(*)::int 
        FROM email_events e 
        WHERE e.variant_id = v.id 
          AND e.event_type = 'sent'
          AND e.campaign_id = cid
      ), 0) = 0 THEN 0::numeric
      ELSE (
        COALESCE((
          SELECT count(*)::numeric 
          FROM reply_threads t 
          WHERE t.variant_id = v.id 
            AND t.campaign_id = cid
            AND t.intent_primary = 'meeting_intent'
        ), 0) / 
        COALESCE((
          SELECT count(*)::numeric 
          FROM email_events e 
          WHERE e.variant_id = v.id 
            AND e.event_type = 'sent'
            AND e.campaign_id = cid
        ), 1)
      )
    END as meeting_rate,
    -- Score: weighted reply + 3× meeting-intent
    CASE 
      WHEN COALESCE((
        SELECT count(*)::int 
        FROM email_events e 
        WHERE e.variant_id = v.id 
          AND e.event_type = 'sent'
          AND e.campaign_id = cid
      ), 0) = 0 THEN 0::numeric
      ELSE (
        COALESCE((
          SELECT count(*)::numeric 
          FROM reply_threads t 
          WHERE t.variant_id = v.id 
            AND t.campaign_id = cid
            AND (t.last_incoming_message_at IS NOT NULL OR t.replied_at IS NOT NULL)
        ), 0) / 
        COALESCE((
          SELECT count(*)::numeric 
          FROM email_events e 
          WHERE e.variant_id = v.id 
            AND e.event_type = 'sent'
            AND e.campaign_id = cid
        ), 1)
      ) + 3 * (
        COALESCE((
          SELECT count(*)::numeric 
          FROM reply_threads t 
          WHERE t.variant_id = v.id 
            AND t.campaign_id = cid
            AND t.intent_primary = 'meeting_intent'
        ), 0) / 
        COALESCE((
          SELECT count(*)::numeric 
          FROM email_events e 
          WHERE e.variant_id = v.id 
            AND e.event_type = 'sent'
            AND e.campaign_id = cid
        ), 1)
      )
    END as score
  FROM campaign_variants v
  WHERE v.campaign_id = cid
  ORDER BY score DESC NULLS LAST, v.name;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION campaign_variant_stats_full IS 'Returns comprehensive variant stats with meeting-intent-weighted scoring (meeting intent worth 3× normal replies)';










