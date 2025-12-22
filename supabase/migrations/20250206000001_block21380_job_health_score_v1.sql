-- =========================================================
-- Block 21380 — SmartSend Roofing Job Health Score v1
-- (Lead Scoring System for Inbox Priority)
-- =========================================================

-- ============================================================================
-- PART 1 — Add Score Fields to leads Table
-- ============================================================================

ALTER TABLE IF EXISTS public.leads
  -- Total health score (0-100)
  ADD COLUMN IF NOT EXISTS score_total integer DEFAULT NULL CHECK (score_total >= 0 AND score_total <= 100),
  
  -- Recency score (0-25 pts) - Time since last message (fresher = higher)
  ADD COLUMN IF NOT EXISTS score_recency integer DEFAULT NULL CHECK (score_recency >= 0 AND score_recency <= 25),
  
  -- Intent score (0-40 pts) - Based on reply classification (hot, warm, cold)
  ADD COLUMN IF NOT EXISTS score_intent integer DEFAULT NULL CHECK (score_intent >= 0 AND score_intent <= 40),
  
  -- Keyword match score (0-20 pts) - Roofing keywords like "leak", "insurance claim", "roof replacement"
  ADD COLUMN IF NOT EXISTS score_keyword_match integer DEFAULT NULL CHECK (score_keyword_match >= 0 AND score_keyword_match <= 20),
  
  -- Locality match score (0-10 pts) - Mentions city/neighborhood
  ADD COLUMN IF NOT EXISTS score_locality_match integer DEFAULT NULL CHECK (score_locality_match >= 0 AND score_locality_match <= 10),
  
  -- Email quality score (0-5 pts) - Short, polite, complete sentences = 5 pts
  ADD COLUMN IF NOT EXISTS score_email_quality integer DEFAULT NULL CHECK (score_email_quality >= 0 AND score_email_quality <= 5),
  
  -- Timestamp when score was last calculated
  ADD COLUMN IF NOT EXISTS score_last_updated timestamptz DEFAULT NULL;

-- Indexes for score queries and sorting
CREATE INDEX IF NOT EXISTS idx_leads_score_total ON public.leads(score_total DESC NULLS LAST) WHERE score_total IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_score_last_updated ON public.leads(score_last_updated DESC NULLS LAST) WHERE score_last_updated IS NOT NULL;

-- Composite index for inbox sorting (campaign + score)
CREATE INDEX IF NOT EXISTS idx_leads_campaign_score ON public.leads(campaign_id, score_total DESC NULLS LAST) WHERE campaign_id IS NOT NULL AND score_total IS NOT NULL;

-- ============================================================================
-- PART 2 — Comments
-- ============================================================================

COMMENT ON COLUMN public.leads.score_total IS 'Total job health score (0-100) - Higher = higher priority for roofing owners';
COMMENT ON COLUMN public.leads.score_recency IS 'Recency score (0-25 pts) - Time since last message (fresher = higher)';
COMMENT ON COLUMN public.leads.score_intent IS 'Intent score (0-40 pts) - Based on reply classification (hot=40, warm=25, cold=10)';
COMMENT ON COLUMN public.leads.score_keyword_match IS 'Keyword match score (0-20 pts) - Roofing keywords like "leak", "insurance claim", "roof replacement"';
COMMENT ON COLUMN public.leads.score_locality_match IS 'Locality match score (0-10 pts) - Mentions city/neighborhood';
COMMENT ON COLUMN public.leads.score_email_quality IS 'Email quality score (0-5 pts) - Short, polite, complete sentences = 5 pts';
COMMENT ON COLUMN public.leads.score_last_updated IS 'Timestamp when score was last calculated';















































