-- Block 212: Campaign Variant Experiments v1
-- Add weight column to campaign_variants for A/B testing splits

ALTER TABLE public.campaign_variants
ADD COLUMN IF NOT EXISTS weight numeric DEFAULT 1.0;

COMMENT ON COLUMN public.campaign_variants.weight IS 'Weight for variant splitting (normalized later). Default 1.0 = even split.';










