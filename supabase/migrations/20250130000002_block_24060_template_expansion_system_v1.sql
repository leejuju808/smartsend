-- ============================================================================
-- Block 24060 — SmartSend Roofing Template Expansion System v1
-- (How SmartSend Adds New Templates • Seasonal Roofing Scripts • Storm Messaging • Local Personalization • Why Templates = More Booked Jobs for Roofers)
-- ============================================================================
-- FULL TEMPLATE ENGINE — ZERO FLUFF.
-- Templates are NOT "content." They are revenue generators.
-- ============================================================================

-- ============================================================================
-- PART 1 — EXTEND TEMPLATE CATEGORIES WITH 6 CORE ROOFING CATEGORIES
-- ============================================================================

-- Ensure template_categories table exists (from Block 13000)
CREATE TABLE IF NOT EXISTS public.template_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  display_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Insert the 6 core roofing template categories
INSERT INTO public.template_categories (slug, name, description, display_order)
VALUES
  ('lead_revival', 'Lead Revival Templates', 'For homeowners who never replied. Creates FAST WINS — often within 24–48 hours.', 1),
  ('inspection_estimate', 'Inspection / Free Estimate Templates', 'Turn soft interest into booked appointments.', 2),
  ('storm_damage', 'Storm Damage Templates', 'Critical templates for hail, wind, heavy rain, snow load, seasonal storms. Storm campaigns = roofers'' biggest money weeks.', 3),
  ('repair', 'Repair Templates', 'Repairs keep crews busy during slow season. Repair leads → often convert into replacement jobs.', 4),
  ('after_quote_followup', 'After-Quote Follow-Up Templates', 'Roofers lose MOST jobs not because of price — but because they never follow up. SmartSend fixes the leak.', 5),
  ('seasonal', 'Seasonal Templates', 'Seasonality controls homeowner urgency. These templates create demand even when storms don''t.', 6)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order;

-- ============================================================================
-- PART 2 — EXTEND EMAIL_TEMPLATES TABLE WITH EXPANSION SYSTEM FIELDS
-- ============================================================================

-- Add new columns to email_templates table for the expansion system
DO $$ 
BEGIN
  -- Template category (references template_categories.slug)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_templates' AND column_name = 'category') THEN
    ALTER TABLE email_templates ADD COLUMN category text;
  END IF;

  -- Template type within category
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_templates' AND column_name = 'template_type') THEN
    ALTER TABLE email_templates ADD COLUMN template_type text;
  END IF;

  -- Dynamic tokens supported (JSONB array of token names)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_templates' AND column_name = 'supported_tokens') THEN
    ALTER TABLE email_templates ADD COLUMN supported_tokens jsonb DEFAULT '[]'::jsonb;
  END IF;

  -- Market-specific optimization (e.g., 'florida', 'texas', 'washington', null = all markets)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_templates' AND column_name = 'market_region') THEN
    ALTER TABLE email_templates ADD COLUMN market_region text;
  END IF;

  -- Monthly drop tracking (which month this template was added)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_templates' AND column_name = 'drop_month') THEN
    ALTER TABLE email_templates ADD COLUMN drop_month date;
  END IF;

  -- Template priority/ranking (for "Top Performers" display)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_templates' AND column_name = 'priority_score') THEN
    ALTER TABLE email_templates ADD COLUMN priority_score int DEFAULT 0;
  END IF;

  -- Is this a new template (for "New templates added!" notifications)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_templates' AND column_name = 'is_new') THEN
    ALTER TABLE email_templates ADD COLUMN is_new boolean DEFAULT false;
  END IF;

  -- Is this template featured/recommended
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_templates' AND column_name = 'is_featured') THEN
    ALTER TABLE email_templates ADD COLUMN is_featured boolean DEFAULT false;
  END IF;

  -- Usage count (how many times this template has been used)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'email_templates' AND column_name = 'usage_count') THEN
    ALTER TABLE email_templates ADD COLUMN usage_count int DEFAULT 0;
  END IF;
END $$;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);
CREATE INDEX IF NOT EXISTS idx_email_templates_template_type ON email_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_email_templates_market_region ON email_templates(market_region);
CREATE INDEX IF NOT EXISTS idx_email_templates_drop_month ON email_templates(drop_month);
CREATE INDEX IF NOT EXISTS idx_email_templates_is_new ON email_templates(is_new);
CREATE INDEX IF NOT EXISTS idx_email_templates_is_featured ON email_templates(is_featured);
CREATE INDEX IF NOT EXISTS idx_email_templates_priority_score ON email_templates(priority_score DESC);

-- ============================================================================
-- PART 3 — TEMPLATE PERFORMANCE TRACKING TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.template_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  org_id uuid, -- null = global performance, set = org-specific
  
  -- Performance metrics (aggregated)
  total_sends int DEFAULT 0,
  total_opens int DEFAULT 0,
  total_clicks int DEFAULT 0,
  total_replies int DEFAULT 0,
  total_booked_estimates int DEFAULT 0,
  
  -- Calculated rates
  open_rate numeric(5,2) DEFAULT 0, -- percentage
  reply_rate numeric(5,2) DEFAULT 0, -- percentage
  booked_rate numeric(5,2) DEFAULT 0, -- percentage (replies → booked estimates)
  
  -- Time period tracking
  period_start date NOT NULL,
  period_end date NOT NULL,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Unique constraint: one record per template per period
  UNIQUE(template_id, org_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_template_performance_template_id ON template_performance(template_id);
CREATE INDEX IF NOT EXISTS idx_template_performance_org_id ON template_performance(org_id);
CREATE INDEX IF NOT EXISTS idx_template_performance_period ON template_performance(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_template_performance_reply_rate ON template_performance(reply_rate DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_template_performance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_template_performance_updated_at
BEFORE UPDATE ON template_performance
FOR EACH ROW
EXECUTE FUNCTION update_template_performance_updated_at();

-- ============================================================================
-- PART 4 — TEMPLATE A/B TEST VARIANTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.template_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  variant_key text NOT NULL, -- 'A', 'B', 'C', etc.
  
  -- Variant content
  subject text NOT NULL,
  body text NOT NULL,
  
  -- Variant metadata
  variant_name text, -- e.g., "Casual Tone", "Direct CTA", etc.
  changes_description text, -- what changed from base template
  
  -- Performance tracking
  total_sends int DEFAULT 0,
  total_replies int DEFAULT 0,
  reply_rate numeric(5,2) DEFAULT 0,
  
  -- Test status
  is_winner boolean DEFAULT false,
  is_active boolean DEFAULT true,
  test_started_at timestamptz DEFAULT now(),
  test_ended_at timestamptz,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Unique constraint: one variant key per template
  UNIQUE(template_id, variant_key)
);

CREATE INDEX IF NOT EXISTS idx_template_variants_template_id ON template_variants(template_id);
CREATE INDEX IF NOT EXISTS idx_template_variants_is_active ON template_variants(is_active);
CREATE INDEX IF NOT EXISTS idx_template_variants_is_winner ON template_variants(is_winner);

-- ============================================================================
-- PART 5 — MONTHLY TEMPLATE DROPS TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.template_drops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drop_month date NOT NULL UNIQUE, -- e.g., '2025-01-01' for January 2025
  drop_name text NOT NULL, -- e.g., "January 2025 Template Drop"
  description text,
  template_count int DEFAULT 0, -- how many templates in this drop
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_template_drops_month ON template_drops(drop_month DESC);

-- ============================================================================
-- PART 6 — TEMPLATE USAGE TRACKING (for "Recommended For You")
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.template_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  org_id uuid, -- null = global usage
  workspace_id uuid, -- for workspace-specific recommendations
  
  -- Usage context
  used_in_campaign_id uuid,
  used_by_user_id uuid,
  
  -- Usage metadata
  city text, -- for city-based recommendations
  market_region text, -- for market-based recommendations
  season text, -- 'winter', 'spring', 'summer', 'fall'
  
  -- Results
  resulted_in_reply boolean DEFAULT false,
  resulted_in_booking boolean DEFAULT false,
  
  used_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_template_usage_template_id ON template_usage(template_id);
CREATE INDEX IF NOT EXISTS idx_template_usage_org_id ON template_usage(org_id);
CREATE INDEX IF NOT EXISTS idx_template_usage_workspace_id ON template_usage(workspace_id);
CREATE INDEX IF NOT EXISTS idx_template_usage_city ON template_usage(city);
CREATE INDEX IF NOT EXISTS idx_template_usage_market_region ON template_usage(market_region);
CREATE INDEX IF NOT EXISTS idx_template_usage_season ON template_usage(season);
CREATE INDEX IF NOT EXISTS idx_template_usage_used_at ON template_usage(used_at DESC);

-- ============================================================================
-- PART 7 — RLS POLICIES
-- ============================================================================

ALTER TABLE template_performance ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_drops ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_usage ENABLE ROW LEVEL SECURITY;

-- Template performance: read for all authenticated users
CREATE POLICY "template_performance_select_all" ON template_performance
  FOR SELECT USING (true);

-- Template variants: read for all authenticated users
CREATE POLICY "template_variants_select_all" ON template_variants
  FOR SELECT USING (true);

-- Template drops: read for all authenticated users
CREATE POLICY "template_drops_select_all" ON template_drops
  FOR SELECT USING (true);

-- Template usage: users can read their own org/workspace usage
CREATE POLICY "template_usage_select_own" ON template_usage
  FOR SELECT USING (
    org_id IS NULL OR EXISTS (
      SELECT 1 FROM org_memberships om
      WHERE om.org_id = template_usage.org_id
      AND om.user_id = auth.uid()
    )
  );

-- Service role has full access
CREATE POLICY "template_performance_service_role" ON template_performance
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "template_variants_service_role" ON template_variants
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "template_drops_service_role" ON template_drops
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "template_usage_service_role" ON template_usage
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 8 — PERFORMANCE VIEW FOR "TOP PERFORMERS THIS MONTH"
-- ============================================================================

CREATE OR REPLACE VIEW public.template_performance_leaderboard AS
SELECT
  et.id AS template_id,
  et.template_key,
  et.label AS template_name,
  et.category,
  et.template_type,
  et.base_subject,
  et.market_region,
  
  -- Current month performance (from template_performance table)
  COALESCE(tp_current.total_sends, 0) AS current_month_sends,
  COALESCE(tp_current.total_replies, 0) AS current_month_replies,
  COALESCE(tp_current.reply_rate, 0) AS current_month_reply_rate,
  COALESCE(tp_current.total_booked_estimates, 0) AS current_month_booked,
  
  -- All-time performance (aggregated from template_performance)
  COALESCE(tp_alltime.total_sends, 0) AS all_time_sends,
  COALESCE(tp_alltime.total_replies, 0) AS all_time_replies,
  COALESCE(tp_alltime.reply_rate, 0) AS all_time_reply_rate,
  
  -- Usage count (from email_templates table)
  et.usage_count,
  et.is_new,
  et.is_featured,
  et.priority_score,
  
  et.created_at,
  et.updated_at
  
FROM email_templates et
LEFT JOIN template_performance tp_current ON tp_current.template_id = et.id
  AND tp_current.org_id IS NULL -- global performance
  AND tp_current.period_start = date_trunc('month', CURRENT_DATE)::date
  AND tp_current.period_end = (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date
LEFT JOIN (
  SELECT 
    template_id,
    SUM(total_sends) AS total_sends,
    SUM(total_replies) AS total_replies,
    CASE 
      WHEN SUM(total_sends) > 0 
      THEN ROUND(100.0 * SUM(total_replies)::numeric / SUM(total_sends)::numeric, 2)
      ELSE 0
    END AS reply_rate
  FROM template_performance
  WHERE org_id IS NULL
  GROUP BY template_id
) tp_alltime ON tp_alltime.template_id = et.id
WHERE et.org_id IS NULL -- only global templates
ORDER BY 
  et.priority_score DESC NULLS LAST,
  COALESCE(tp_current.reply_rate, 0) DESC,
  et.usage_count DESC NULLS LAST;

GRANT SELECT ON public.template_performance_leaderboard TO authenticated;

-- ============================================================================
-- PART 9 — SEED INITIAL TEMPLATES FOR ALL 6 CATEGORIES
-- ============================================================================

-- Category 1: Lead Revival Templates
INSERT INTO email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone, category, template_type, supported_tokens, is_featured, priority_score)
VALUES
  (NULL, 'revival_still_need_help', 'Still need help with your roof?', 'Still need help with your roof?', 
   'Hey {{first_name}}, just checking in — still need help with your roof at {{address}}?', 
   TRUE, 'casual', 'lead_revival', 'revival_check_in', 
   '["first_name", "address", "city"]'::jsonb, true, 90),
  
  (NULL, 'revival_checking_before_week_fills', 'Checking in before this week fills up…', 'Checking in before this week fills up…', 
   'Hey {{first_name}}, checking in before this week fills up. Still want me to take a look at your roof?', 
   TRUE, 'casual', 'lead_revival', 'urgency_revival', 
   '["first_name", "city"]'::jsonb, true, 85),
  
  (NULL, 'revival_quick_question_city', 'Quick question about your home in {{city}}', 'Quick question about your home in {{city}}', 
   'Quick question — are you still dealing with roof issues at your place in {{city}}?', 
   TRUE, 'casual', 'lead_revival', 'city_personalized', 
   '["city", "neighborhood"]'::jsonb, false, 80)
ON CONFLICT (template_key) DO NOTHING;

-- Category 2: Inspection / Free Estimate Templates
INSERT INTO email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone, category, template_type, supported_tokens, is_featured, priority_score)
VALUES
  (NULL, 'inspection_swing_by_tuesday_wednesday', 'We can swing by for a free inspection Tuesday or Wednesday', 'Free inspection this week', 
   'Hey {{first_name}}, we can swing by for a free inspection Tuesday or Wednesday. Want a time?', 
   TRUE, 'casual', 'inspection_estimate', 'time_specific', 
   '["first_name", "city"]'::jsonb, true, 95),
  
  (NULL, 'inspection_quick_roof_check_week', 'Quick roof check available this week — want a time?', 'Quick roof check this week', 
   'Quick roof check available this week — want a time?', 
   TRUE, 'casual', 'inspection_estimate', 'simple_offer', 
   '["first_name"]'::jsonb, true, 90),
  
  (NULL, 'inspection_free_look_this_week', 'Free look at your roof this week', 'Free roof check', 
   'Hey {{first_name}}, I can take a free look at your roof this week. Takes about 10 minutes.', 
   TRUE, 'casual', 'inspection_estimate', 'low_pressure', 
   '["first_name", "address"]'::jsonb, false, 85)
ON CONFLICT (template_key) DO NOTHING;

-- Category 3: Storm Damage Templates (CRITICAL)
INSERT INTO email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone, category, template_type, supported_tokens, is_featured, priority_score)
VALUES
  (NULL, 'storm_wind_gusts_45mph', 'Wind gusts hit 45mph yesterday — want us to check for lifted shingles?', 'Wind damage check', 
   'Hey {{first_name}}, wind gusts hit 45mph yesterday in {{city}} — want us to check for lifted shingles?', 
   TRUE, 'casual', 'storm_damage', 'wind_damage', 
   '["first_name", "city", "recent_weather_condition"]'::jsonb, true, 100),
  
  (NULL, 'storm_hail_passed_through_city', 'Hail passed through {{city}} — inspections are filling up', 'Hail damage inspection', 
   'Hail passed through {{city}} yesterday — inspections are filling up fast. Want me to check yours?', 
   TRUE, 'casual', 'storm_damage', 'hail_damage', 
   '["city", "recent_weather_condition"]'::jsonb, true, 100),
  
  (NULL, 'storm_heavy_rain_check_leaks', 'Heavy rain last night — want us to check for leaks?', 'Rain damage check', 
   'Hey {{first_name}}, heavy rain last night in {{city}} — want us to check for leaks?', 
   TRUE, 'casual', 'storm_damage', 'rain_damage', 
   '["first_name", "city", "recent_weather_condition"]'::jsonb, true, 95),
  
  (NULL, 'storm_snow_load_concern', 'Snow load concern — want a quick check?', 'Snow load check', 
   'Hey {{first_name}}, with all this snow, want me to check your roof for snow load issues?', 
   TRUE, 'casual', 'storm_damage', 'snow_damage', 
   '["first_name", "city", "recent_weather_condition"]'::jsonb, false, 90)
ON CONFLICT (template_key) DO NOTHING;

-- Category 4: Repair Templates
INSERT INTO email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone, category, template_type, supported_tokens, is_featured, priority_score)
VALUES
  (NULL, 'repair_still_dealing_with_leaks', 'Quick question — are you still dealing with roof leaks?', 'Still dealing with leaks?', 
   'Quick question — are you still dealing with roof leaks? We can handle small repairs before they become big replacements.', 
   TRUE, 'casual', 'repair', 'leak_repair', 
   '["first_name", "city"]'::jsonb, true, 85),
  
  (NULL, 'repair_small_before_big', 'We can handle small repairs before they become big replacements', 'Small repairs available', 
   'Hey {{first_name}}, we can handle small repairs before they become big replacements. Want me to take a look?', 
   TRUE, 'casual', 'repair', 'preventive_repair', 
   '["first_name", "address"]'::jsonb, false, 80),
  
  (NULL, 'repair_missing_shingles_patches', 'Missing shingles or patches needed?', 'Roof repairs', 
   'Hey {{first_name}}, need any roof repairs? Missing shingles, patches, that kind of thing?', 
   TRUE, 'casual', 'repair', 'general_repair', 
   '["first_name"]'::jsonb, false, 75)
ON CONFLICT (template_key) DO NOTHING;

-- Category 5: After-Quote Follow-Up Templates
INSERT INTO email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone, category, template_type, supported_tokens, is_featured, priority_score)
VALUES
  (NULL, 'after_quote_questions_about_estimate', 'Just wanted to check if you had any questions about the estimate we sent over', 'Questions about your estimate?', 
   'Hey {{first_name}}, just wanted to check if you had any questions about the estimate we sent over.', 
   TRUE, 'casual', 'after_quote_followup', 'question_check', 
   '["first_name", "last_contact_date"]'::jsonb, true, 90),
  
  (NULL, 'after_quote_schedule_next_week', 'We can schedule you for next week if you want to move forward', 'Ready to schedule?', 
   'Hey {{first_name}}, we can schedule you for next week if you want to move forward. Sound good?', 
   TRUE, 'casual', 'after_quote_followup', 'scheduling_nudge', 
   '["first_name"]'::jsonb, true, 85),
  
  (NULL, 'after_quote_following_up_estimate', 'Following up on the estimate', 'Following up', 
   'Hey {{first_name}}, following up on the estimate we sent. Still interested?', 
   TRUE, 'casual', 'after_quote_followup', 'simple_followup', 
   '["first_name", "last_contact_date"]'::jsonb, false, 80)
ON CONFLICT (template_key) DO NOTHING;

-- Category 6: Seasonal Templates
INSERT INTO email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone, category, template_type, supported_tokens, is_featured, priority_score)
VALUES
  -- Winter
  (NULL, 'seasonal_winter_cold_weather_worsen', 'Cold weather can worsen small roof issues — want a quick check?', 'Winter roof check', 
   'Hey {{first_name}}, cold weather can worsen small roof issues — want a quick check?', 
   TRUE, 'casual', 'seasonal', 'winter', 
   '["first_name", "city"]'::jsonb, true, 85),
  
  -- Spring
  (NULL, 'seasonal_spring_post_winter_inspection', 'Post-winter inspection openings available this week', 'Spring roof check', 
   'Hey {{first_name}}, post-winter inspection openings available this week. Want me to take a look?', 
   TRUE, 'casual', 'seasonal', 'spring', 
   '["first_name", "city"]'::jsonb, true, 85),
  
  -- Summer
  (NULL, 'seasonal_summer_high_heat_damage', 'High heat can damage shingles — want us to take a look?', 'Summer heat check', 
   'Hey {{first_name}}, high heat can damage shingles — want us to take a look?', 
   TRUE, 'casual', 'seasonal', 'summer', 
   '["first_name", "city"]'::jsonb, true, 85),
  
  -- Fall
  (NULL, 'seasonal_fall_before_winter_hits', 'Before winter hits, we recommend a quick roof inspection', 'Fall roof check', 
   'Hey {{first_name}}, before winter hits, we recommend a quick roof inspection. Want me to take a look?', 
   TRUE, 'casual', 'seasonal', 'fall', 
   '["first_name", "city"]'::jsonb, true, 85)
ON CONFLICT (template_key) DO NOTHING;

-- ============================================================================
-- PART 10 — CREATE INITIAL MONTHLY DROP RECORD
-- ============================================================================

INSERT INTO template_drops (drop_month, drop_name, description, template_count)
VALUES
  (date_trunc('month', CURRENT_DATE)::date, 
   'Initial Template Drop', 
   'Initial seed of 6 core roofing template categories', 
   (SELECT COUNT(*) FROM email_templates WHERE org_id IS NULL AND category IS NOT NULL))
ON CONFLICT (drop_month) DO NOTHING;

-- ============================================================================
-- PART 11 — FUNCTION TO UPDATE TEMPLATE PERFORMANCE METRICS
-- ============================================================================
-- Note: This function will be populated with actual tracking table joins
-- based on the specific schema in use. For now, it provides the structure.

CREATE OR REPLACE FUNCTION update_template_performance_metrics()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- This function should be updated to join with the actual email tracking tables
  -- in your system. Common patterns include:
  -- - email_logs / send_logs for sends
  -- - email_events for opens/clicks
  -- - campaign_reply_events / email_replies for replies
  -- - leads table for booked estimates
  
  -- For now, we'll create a placeholder that can be extended:
  -- The actual implementation will depend on your specific tracking schema
  
  -- Example structure (adjust based on your actual tables):
  /*
  INSERT INTO template_performance (
    template_id,
    org_id,
    period_start,
    period_end,
    total_sends,
    total_opens,
    total_clicks,
    total_replies,
    total_booked_estimates,
    open_rate,
    reply_rate,
    booked_rate
  )
  SELECT
    et.id AS template_id,
    NULL AS org_id,
    date_trunc('month', CURRENT_DATE)::date AS period_start,
    (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date AS period_end,
    -- Add your actual tracking table joins here
    0 AS total_sends,
    0 AS total_opens,
    0 AS total_clicks,
    0 AS total_replies,
    0 AS total_booked_estimates,
    0 AS open_rate,
    0 AS reply_rate,
    0 AS booked_rate
  FROM email_templates et
  WHERE et.org_id IS NULL
  ON CONFLICT (template_id, org_id, period_start, period_end) 
  DO UPDATE SET
    updated_at = now();
  */
  
  -- Placeholder: Do nothing for now, will be implemented based on actual schema
  RETURN;
END;
$$;

-- ============================================================================
-- PART 12 — COMMENTS AND DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE email_templates IS 'SmartSend Template Expansion System - Templates are revenue generators, not just content. Includes 6 core roofing categories: Lead Revival, Inspection/Estimate, Storm Damage, Repair, After-Quote Follow-Up, and Seasonal.';
COMMENT ON COLUMN email_templates.category IS 'Template category: lead_revival, inspection_estimate, storm_damage, repair, after_quote_followup, seasonal';
COMMENT ON COLUMN email_templates.supported_tokens IS 'JSONB array of dynamic tokens this template supports: first_name, city, neighborhood, recent_weather_condition, last_contact_date, roof_type, service_type, etc.';
COMMENT ON COLUMN email_templates.market_region IS 'Market-specific optimization: florida, texas, washington, etc. NULL = works for all markets';
COMMENT ON COLUMN email_templates.drop_month IS 'Which month this template was added (for monthly template drops tracking)';
COMMENT ON COLUMN email_templates.priority_score IS 'Priority score for ranking templates in "Top Performers" display';
COMMENT ON COLUMN email_templates.is_new IS 'Is this a new template (for "New templates added!" notifications)';
COMMENT ON COLUMN email_templates.is_featured IS 'Is this template featured/recommended';

COMMENT ON TABLE template_performance IS 'Tracks template performance metrics: sends, opens, replies, booked estimates, and calculated rates. Supports both global and org-specific performance tracking.';
COMMENT ON TABLE template_variants IS 'A/B testing variants for templates. SmartSend automatically tests new variations, ranks them, and replaces low performers.';
COMMENT ON TABLE template_drops IS 'Tracks monthly template drops. Every month, SmartSend publishes 5-10 new templates directly inside the app.';
COMMENT ON TABLE template_usage IS 'Tracks template usage for "Recommended For You" feature. Based on city, past performance, crew size, and seasonality.';

COMMENT ON VIEW template_performance_leaderboard IS 'View for "Top Performers This Month" display. Shows current month and all-time performance metrics, sorted by priority score and reply rate.';

-- ============================================================================
-- END OF BLOCK 24060 — TEMPLATE EXPANSION SYSTEM V1
-- ============================================================================

