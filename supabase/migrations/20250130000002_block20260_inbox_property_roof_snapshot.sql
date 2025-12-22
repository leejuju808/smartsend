-- =========================================================
-- Block 20260 — SmartSend Inbox Property & Roof Snapshot v1
-- (So every lead shows "what kind of house / roof is this?" — not just an address.)
-- =========================================================

-- ============================================================================
-- PART 1 — Add Property & Roof Detail Fields to inbox_threads
-- ============================================================================
-- Extend inbox_threads so each homeowner lead can store:
-- - basic property stats (sqft, beds, baths, year built)
-- - estimated property value
-- - roof details (material, age, last replacement year)

ALTER TABLE IF EXISTS public.inbox_threads
  -- Property details (using property_bedrooms and property_bathrooms for consistency with API)
  ADD COLUMN IF NOT EXISTS property_bedrooms INTEGER,
  ADD COLUMN IF NOT EXISTS property_bathrooms NUMERIC(4,1),
  
  -- Property estimated value (using property_estimated_value for consistency with API)
  ADD COLUMN IF NOT EXISTS property_estimated_value NUMERIC(14,2),
  
  -- Roof details
  ADD COLUMN IF NOT EXISTS roof_material TEXT,                  -- 'asphalt', 'metal', 'tile', 'wood', etc
  ADD COLUMN IF NOT EXISTS roof_last_replacement_year INTEGER;  -- year they last replaced roof

-- Note: property_sqft, property_year_built, and roof_age_estimated already exist from Block 20030
-- We're adding the missing fields: property_bedrooms, property_bathrooms, property_estimated_value,
-- roof_material, and roof_last_replacement_year

-- ============================================================================
-- PART 2 — Indexes for Performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_inbox_threads_property_bedrooms 
  ON public.inbox_threads(property_bedrooms) WHERE property_bedrooms IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbox_threads_property_estimated_value 
  ON public.inbox_threads(property_estimated_value DESC) WHERE property_estimated_value IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbox_threads_roof_material 
  ON public.inbox_threads(roof_material) WHERE roof_material IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbox_threads_roof_last_replacement_year 
  ON public.inbox_threads(roof_last_replacement_year) WHERE roof_last_replacement_year IS NOT NULL;

-- ============================================================================
-- PART 3 — Update Activity Log Type Constraint
-- ============================================================================
-- Add 'property' as a valid activity log type

DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'inbox_activity_log_type_check'
    AND table_name = 'inbox_activity_log'
  ) THEN
    ALTER TABLE public.inbox_activity_log DROP CONSTRAINT inbox_activity_log_type_check;
  END IF;
END$$;

-- Add updated constraint with 'property' type
ALTER TABLE public.inbox_activity_log
  ADD CONSTRAINT inbox_activity_log_type_check 
  CHECK (type IN ('note', 'status_change', 'value_change', 'follow_up', 'system', 'call', 'appointment', 'insurance', 'lost', 'property'));

-- ============================================================================
-- PART 4 — Comments
-- ============================================================================

COMMENT ON COLUMN public.inbox_threads.property_bedrooms IS 'Number of bedrooms';
COMMENT ON COLUMN public.inbox_threads.property_bathrooms IS 'Number of bathrooms (supports half baths)';
COMMENT ON COLUMN public.inbox_threads.property_estimated_value IS 'Estimated property value in USD';
COMMENT ON COLUMN public.inbox_threads.roof_material IS 'Roof material type: asphalt, metal, tile, wood, flat, other';
COMMENT ON COLUMN public.inbox_threads.roof_last_replacement_year IS 'Year the roof was last replaced';

