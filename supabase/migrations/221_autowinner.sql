-- Block 212: Campaign Variant Experiments v1
-- Automatic winner detection based on score

CREATE OR REPLACE FUNCTION best_campaign_variant(cid uuid)
RETURNS uuid AS $$
DECLARE
  rec record;
BEGIN
  SELECT variant_id INTO rec
  FROM campaign_variant_stats_full(cid)
  ORDER BY score DESC NULLS LAST
  LIMIT 1;

  RETURN rec.variant_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION best_campaign_variant IS 'Returns the variant_id with the highest score (meeting-intent-weighted) for a campaign';










