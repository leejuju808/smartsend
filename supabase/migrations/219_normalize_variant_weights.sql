-- Block 212: Campaign Variant Experiments v1
-- Normalize variant weights so they sum to 1.0 per campaign

CREATE OR REPLACE FUNCTION normalize_variant_weights(cid uuid)
RETURNS void AS $$
DECLARE 
  total numeric;
BEGIN
  SELECT sum(weight) INTO total
  FROM campaign_variants 
  WHERE campaign_id = cid;

  -- Avoid division by zero
  IF total IS NULL OR total = 0 THEN
    -- Set all variants to equal weight
    UPDATE campaign_variants
    SET weight = 1.0
    WHERE campaign_id = cid;
    
    -- Recalculate total
    SELECT count(*)::numeric INTO total
    FROM campaign_variants 
    WHERE campaign_id = cid;
  END IF;

  -- Normalize weights
  UPDATE campaign_variants
  SET weight = weight / total
  WHERE campaign_id = cid;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION normalize_variant_weights IS 'Normalizes variant weights for a campaign so they sum to 1.0';










