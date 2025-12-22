-- Block 212: Campaign Variant Experiments v1
-- Helper function to choose variant based on weights (for use in queuing logic)

CREATE OR REPLACE FUNCTION choose_campaign_variant(cid uuid)
RETURNS uuid AS $$
DECLARE
  r numeric;
  sum_weight numeric := 0;
  v record;
BEGIN
  -- Get random number between 0 and 1
  r := random();
  
  -- Normalize weights first (ensure they sum to 1.0)
  PERFORM normalize_variant_weights(cid);
  
  -- Iterate through variants and select based on cumulative weight
  FOR v IN 
    SELECT id, weight 
    FROM campaign_variants 
    WHERE campaign_id = cid 
      AND NOT is_paused
    ORDER BY name
  LOOP
    sum_weight := sum_weight + v.weight;
    IF r < sum_weight THEN
      RETURN v.id;
    END IF;
  END LOOP;
  
  -- Fallback: return first variant if no match (shouldn't happen if weights are normalized)
  SELECT id INTO v FROM campaign_variants 
  WHERE campaign_id = cid AND NOT is_paused 
  ORDER BY name 
  LIMIT 1;
  
  RETURN v.id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION choose_campaign_variant IS 'Probabilistically selects a variant based on normalized weights for a campaign';










