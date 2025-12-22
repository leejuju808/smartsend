-- =========================================================
-- Block 20030 — SmartSend Inbox Homeowner Profile Intelligence v1
-- (Auto-Built Profiles, Property Data, Roof Age Lookup, Behavioral Insights, and Smart Engagement Scoring)
-- =========================================================

-- ============================================================================
-- PART 1 — Add Homeowner Intelligence Fields to inbox_threads
-- ============================================================================

ALTER TABLE IF EXISTS public.inbox_threads
  -- Property address
  ADD COLUMN IF NOT EXISTS property_address TEXT,
  
  -- Property details
  ADD COLUMN IF NOT EXISTS property_sqft INTEGER,
  ADD COLUMN IF NOT EXISTS property_beds INTEGER,
  ADD COLUMN IF NOT EXISTS property_baths INTEGER,
  ADD COLUMN IF NOT EXISTS property_year_built INTEGER,
  
  -- Roof intelligence
  ADD COLUMN IF NOT EXISTS roof_age_estimated INTEGER,
  ADD COLUMN IF NOT EXISTS last_roof_replacement_year INTEGER,
  
  -- Property value
  ADD COLUMN IF NOT EXISTS property_value_estimated INTEGER,
  
  -- Engagement scoring
  ADD COLUMN IF NOT EXISTS engagement_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engagement_level TEXT CHECK (engagement_level IN ('cold', 'warm', 'hot')),
  
  -- Behavioral insights (auto-generated)
  ADD COLUMN IF NOT EXISTS behavior_notes TEXT;

-- ============================================================================
-- PART 2 — Indexes for Performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_inbox_threads_engagement_score ON public.inbox_threads(engagement_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_engagement_level ON public.inbox_threads(engagement_level);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_property_value ON public.inbox_threads(property_value_estimated DESC NULLS LAST) WHERE property_value_estimated IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_threads_roof_age ON public.inbox_threads(roof_age_estimated) WHERE roof_age_estimated IS NOT NULL;

-- ============================================================================
-- PART 3 — Comments
-- ============================================================================

COMMENT ON COLUMN public.inbox_threads.property_address IS 'Homeowner property address (from property data lookup)';
COMMENT ON COLUMN public.inbox_threads.property_sqft IS 'Property square footage';
COMMENT ON COLUMN public.inbox_threads.property_beds IS 'Number of bedrooms';
COMMENT ON COLUMN public.inbox_threads.property_baths IS 'Number of bathrooms';
COMMENT ON COLUMN public.inbox_threads.property_year_built IS 'Year the property was built';
COMMENT ON COLUMN public.inbox_threads.roof_age_estimated IS 'Estimated roof age in years';
COMMENT ON COLUMN public.inbox_threads.last_roof_replacement_year IS 'Year of last roof replacement (if available)';
COMMENT ON COLUMN public.inbox_threads.property_value_estimated IS 'Estimated property value';
COMMENT ON COLUMN public.inbox_threads.engagement_score IS 'Engagement score (0-100+) based on reply content and behavior';
COMMENT ON COLUMN public.inbox_threads.engagement_level IS 'Engagement level: cold (low interest), warm (moderate interest), hot (high interest)';
COMMENT ON COLUMN public.inbox_threads.behavior_notes IS 'Auto-generated behavioral insights from reply analysis';

















































