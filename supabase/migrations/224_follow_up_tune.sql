-- Block 213: Auto-Optimization Engine v1
-- Dynamic follow-up tuning based on reply rates

CREATE OR REPLACE FUNCTION tune_followups(cid uuid)
RETURNS void AS $$
DECLARE 
  sent int;
  replies int;
  reply_rate numeric;
BEGIN
  -- Count sent emails for this campaign
  SELECT count(*)::int INTO sent
  FROM email_events
  WHERE campaign_id = cid
    AND event_type = 'sent';

  -- Count replies (threads with incoming messages)
  SELECT count(*)::int INTO replies
  FROM reply_threads
  WHERE campaign_id = cid
    AND (last_incoming_message_at IS NOT NULL OR replied_at IS NOT NULL);

  -- If no sends, skip
  IF sent = 0 THEN
    RETURN;
  END IF;

  reply_rate := replies::numeric / sent;

  -- If high reply rate (>8%) → speed up follow-ups
  IF reply_rate > 0.08 THEN
    UPDATE followup_steps
    SET delay_hours = GREATEST(4, delay_hours - 4)
    WHERE sequence_id IN (
      SELECT id FROM followup_sequences WHERE campaign_id = cid
    );
  END IF;

  -- If extremely low reply rate (<1%) → slow down follow-ups
  IF reply_rate < 0.01 THEN
    UPDATE followup_steps
    SET delay_hours = delay_hours + 6
    WHERE sequence_id IN (
      SELECT id FROM followup_sequences WHERE campaign_id = cid
    );
  END IF;

END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION tune_followups IS 'Dynamically adjusts follow-up delays based on campaign reply rates';










