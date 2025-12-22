-- Block 231 — Lead Scoring v1
-- Add score and score_bucket columns to leads table

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS score int DEFAULT 0,
ADD COLUMN IF NOT EXISTS icp_industry text,
ADD COLUMN IF NOT EXISTS icp_related text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS open_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS click_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS intent_primary text CHECK (
  intent_primary IN (
    'meeting_intent',
    'interested',
    'neutral',
    'ooo',
    'not_interested',
    'unsubscribe'
  )
);

-- Add generated column for score bucket
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS score_bucket text GENERATED ALWAYS AS (
  CASE
    WHEN score >= 80 THEN 'hot'
    WHEN score >= 50 THEN 'warm'
    WHEN score >= 20 THEN 'cool'
    ELSE 'cold'
  END
) STORED;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_score ON public.leads(score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_score_bucket ON public.leads(score_bucket);
CREATE INDEX IF NOT EXISTS idx_leads_intent_primary ON public.leads(intent_primary);
CREATE INDEX IF NOT EXISTS idx_leads_open_count ON public.leads(open_count);
CREATE INDEX IF NOT EXISTS idx_leads_click_count ON public.leads(click_count);

COMMENT ON COLUMN public.leads.score IS 'Lead score 0-100 calculated from industry fit, company size, engagement, and intent';
COMMENT ON COLUMN public.leads.score_bucket IS 'Generated bucket: hot (80+), warm (50-79), cool (20-49), cold (<20)';
COMMENT ON COLUMN public.leads.icp_industry IS 'Ideal Customer Profile industry for matching';
COMMENT ON COLUMN public.leads.icp_related IS 'Array of related industries for scoring';
COMMENT ON COLUMN public.leads.open_count IS 'Total number of email opens for this lead';
COMMENT ON COLUMN public.leads.click_count IS 'Total number of email clicks for this lead';
COMMENT ON COLUMN public.leads.intent_primary IS 'Primary intent classification from reply threads';










