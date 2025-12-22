-- Block 213: Auto-Optimization Engine v1
-- RPC function to auto-optimize variant weights for a campaign

CREATE OR REPLACE FUNCTION auto_optimize_campaign(cid uuid)
RETURNS void AS $$
DECLARE 
  variants record;
  winners record;
  losers record;
  total numeric;
  threshold numeric := 0.05; -- 5% score gap required
BEGIN
  -- Get best variant (highest score)
  SELECT * INTO winners
  FROM campaign_variant_stats_full(cid)
  ORDER BY score DESC NULLS LAST
  LIMIT 1;

  -- Get worst variant (lowest score)
  SELECT * INTO losers
  FROM campaign_variant_stats_full(cid)
  ORDER BY score ASC NULLS LAST
  LIMIT 1;

  -- If no meaningful data, skip
  IF winners.variant_id IS NULL OR winners.score IS NULL THEN
    RETURN;
  END IF;

  -- If only one variant, skip
  IF winners.variant_id = losers.variant_id THEN
    RETURN;
  END IF;

  -- Only optimize if difference > 5%
  IF (winners.score - losers.score) < threshold THEN
    RETURN;
  END IF;

  -- Shift weights by 15% toward winner
  UPDATE campaign_variants
  SET weight = weight + 0.15
  WHERE id = winners.variant_id
    AND campaign_id = cid;

  UPDATE campaign_variants
  SET weight = weight - 0.15
  WHERE id = losers.variant_id
    AND campaign_id = cid;

  -- Floor: set weight to 0 if it goes below 0.01 (effectively pause)
  UPDATE campaign_variants
  SET weight = 0
  WHERE campaign_id = cid
    AND weight < 0.01;

  -- Normalize weights so they sum to 1.0
  PERFORM normalize_variant_weights(cid);

END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_optimize_campaign IS 'Automatically shifts traffic toward winning variants and away from losing variants based on score differences';










