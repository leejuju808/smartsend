-- =========================================================
-- BLOCK 95000 — Roofing Industry Playbook Injector + Localized Coaching Responses
-- =========================================================
-- 
-- This slice makes SmartSend feel like:
-- "A roofing growth consultant who knows my market, not a generic AI toy."
-- 
-- Every playbook example = written for roofers, not generic contractors.
-- Coaching messages are localized ("Seattle rain roofs" vs "Texas hail roofs").
-- Outreach examples reference real job types and real weather events.
-- =========================================================

-- ============================================================================
-- PART 1 — EXTEND roofing_companies TABLE
-- ============================================================================
-- Add location and roofing-specific context fields

ALTER TABLE public.roofing_companies
  ADD COLUMN IF NOT EXISTS trade text DEFAULT 'roofing',
  ADD COLUMN IF NOT EXISTS company_city text,
  ADD COLUMN IF NOT EXISTS company_state text,
  ADD COLUMN IF NOT EXISTS primary_zip text,
  ADD COLUMN IF NOT EXISTS service_radius_miles int DEFAULT 25,
  ADD COLUMN IF NOT EXISTS roof_focus text CHECK (roof_focus IN ('residential', 'commercial', 'both'));

-- Create indexes for location-based queries
CREATE INDEX IF NOT EXISTS idx_roofing_companies_state ON public.roofing_companies(company_state) WHERE company_state IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_companies_city ON public.roofing_companies(company_city) WHERE company_city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_companies_focus ON public.roofing_companies(roof_focus) WHERE roof_focus IS NOT NULL;

-- ============================================================================
-- PART 2 — CREATE roofing_playbook_topics TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.roofing_playbook_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,        -- "hail-storm-outreach", "solar-ready-roofs", etc.
  title text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_playbook_topics_key ON public.roofing_playbook_topics(key);

-- ============================================================================
-- PART 3 — CREATE roofing_playbook_entries TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.roofing_playbook_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid NOT NULL REFERENCES public.roofing_playbook_topics(id) ON DELETE CASCADE,
  entry_type text NOT NULL,   -- "email_example", "reply_script", "pricing_angle", "followup_script"
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_playbook_entries_topic ON public.roofing_playbook_entries(topic_id);
CREATE INDEX IF NOT EXISTS idx_roofing_playbook_entries_type ON public.roofing_playbook_entries(entry_type);

-- ============================================================================
-- PART 4 — CREATE market_segments TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.market_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,     -- "hail-belt", "snow-belt", "rain-heavy", "sun-belt", "coastal-wind"
  label text NOT NULL,
  description text
);

CREATE INDEX IF NOT EXISTS idx_market_segments_key ON public.market_segments(key);

-- ============================================================================
-- PART 5 — CREATE state_market_segments TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.state_market_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code text NOT NULL,     -- "TX", "CO", "WA", etc.
  market_segment_id uuid NOT NULL REFERENCES public.market_segments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_state_market_segments_state ON public.state_market_segments(state_code);
CREATE INDEX IF NOT EXISTS idx_state_market_segments_segment ON public.state_market_segments(market_segment_id);

-- ============================================================================
-- PART 6 — SEED MARKET SEGMENTS
-- ============================================================================

INSERT INTO public.market_segments (key, label, description)
VALUES
  ('hail-belt', 'Hail Belt', 'States with frequent severe hail storms and wind damage'),
  ('snow-belt', 'Snow Belt', 'States with heavy snowfall, ice dams, and winter roof damage'),
  ('rain-heavy', 'Heavy Rain', 'States with frequent heavy rainfall and moisture-related roof issues'),
  ('sun-belt', 'Sun Belt', 'States with intense sun, heat damage, and energy efficiency concerns'),
  ('coastal-wind', 'Coastal Wind', 'Coastal states with high winds, hurricanes, and storm surge damage')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- PART 7 — SEED STATE MARKET SEGMENT MAPPINGS
-- ============================================================================

DO $$
DECLARE
  hail_belt_id uuid;
  snow_belt_id uuid;
  rain_heavy_id uuid;
  sun_belt_id uuid;
  coastal_wind_id uuid;
BEGIN
  -- Get segment IDs
  SELECT id INTO hail_belt_id FROM public.market_segments WHERE key = 'hail-belt';
  SELECT id INTO snow_belt_id FROM public.market_segments WHERE key = 'snow-belt';
  SELECT id INTO rain_heavy_id FROM public.market_segments WHERE key = 'rain-heavy';
  SELECT id INTO sun_belt_id FROM public.market_segments WHERE key = 'sun-belt';
  SELECT id INTO coastal_wind_id FROM public.market_segments WHERE key = 'coastal-wind';

  -- Hail Belt states
  INSERT INTO public.state_market_segments (state_code, market_segment_id)
  VALUES
    ('CO', hail_belt_id), ('TX', hail_belt_id), ('OK', hail_belt_id),
    ('KS', hail_belt_id), ('NE', hail_belt_id), ('SD', hail_belt_id),
    ('ND', hail_belt_id), ('WY', hail_belt_id), ('MT', hail_belt_id),
    ('IA', hail_belt_id), ('MO', hail_belt_id), ('AR', hail_belt_id)
  ON CONFLICT DO NOTHING;

  -- Snow Belt states
  INSERT INTO public.state_market_segments (state_code, market_segment_id)
  VALUES
    ('MN', snow_belt_id), ('WI', snow_belt_id), ('MI', snow_belt_id),
    ('NY', snow_belt_id), ('VT', snow_belt_id), ('NH', snow_belt_id),
    ('ME', snow_belt_id), ('MA', snow_belt_id), ('CT', snow_belt_id),
    ('PA', snow_belt_id), ('OH', snow_belt_id), ('IL', snow_belt_id)
  ON CONFLICT DO NOTHING;

  -- Heavy Rain states
  INSERT INTO public.state_market_segments (state_code, market_segment_id)
  VALUES
    ('WA', rain_heavy_id), ('OR', rain_heavy_id), ('ID', rain_heavy_id)
  ON CONFLICT DO NOTHING;

  -- Sun Belt states
  INSERT INTO public.state_market_segments (state_code, market_segment_id)
  VALUES
    ('AZ', sun_belt_id), ('NV', sun_belt_id), ('FL', sun_belt_id),
    ('CA', sun_belt_id), ('TX', sun_belt_id), ('NM', sun_belt_id),
    ('UT', sun_belt_id)
  ON CONFLICT DO NOTHING;

  -- Coastal Wind states
  INSERT INTO public.state_market_segments (state_code, market_segment_id)
  VALUES
    ('FL', coastal_wind_id), ('LA', coastal_wind_id), ('NC', coastal_wind_id),
    ('SC', coastal_wind_id), ('GA', coastal_wind_id), ('AL', coastal_wind_id),
    ('MS', coastal_wind_id), ('TX', coastal_wind_id), ('VA', coastal_wind_id),
    ('MD', coastal_wind_id), ('DE', coastal_wind_id), ('NJ', coastal_wind_id),
    ('NY', coastal_wind_id), ('MA', coastal_wind_id), ('RI', coastal_wind_id),
    ('CT', coastal_wind_id), ('NH', coastal_wind_id), ('ME', coastal_wind_id)
  ON CONFLICT DO NOTHING;
END $$;

-- ============================================================================
-- PART 8 — SEED ROOFING PLAYBOOK TOPICS
-- ============================================================================

INSERT INTO public.roofing_playbook_topics (key, title, description)
VALUES
  ('hail-storm-outreach', 'Hail Storm Outreach', 'Cold outreach strategies for markets with frequent hail storms and severe weather'),
  ('wind-damage-inspection', 'Wind Damage Inspection', 'Outreach for coastal and high-wind areas with wind damage concerns'),
  ('aging-shingle-roofs', 'Aging Shingle Roofs', 'Generic outreach that works anywhere for roofs showing age and wear'),
  ('roof-leak-emergency', 'Roof Leak Emergency', 'Emergency same/next-day service outreach for urgent leak situations'),
  ('solar-ready-roofs', 'Solar-Ready Roofs', 'Upsell and high-ticket job outreach for solar-ready and energy-efficient roofs'),
  ('commercial-flat-roofs', 'Commercial Flat Roofs', 'Outreach strategies for commercial-heavy markets with flat roof systems')
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- PART 9 — SEED ROOFING PLAYBOOK ENTRIES
-- ============================================================================

DO $$
DECLARE
  hail_topic_id uuid;
  wind_topic_id uuid;
  aging_topic_id uuid;
  leak_topic_id uuid;
  solar_topic_id uuid;
  commercial_topic_id uuid;
BEGIN
  -- Get topic IDs
  SELECT id INTO hail_topic_id FROM public.roofing_playbook_topics WHERE key = 'hail-storm-outreach';
  SELECT id INTO wind_topic_id FROM public.roofing_playbook_topics WHERE key = 'wind-damage-inspection';
  SELECT id INTO aging_topic_id FROM public.roofing_playbook_topics WHERE key = 'aging-shingle-roofs';
  SELECT id INTO leak_topic_id FROM public.roofing_playbook_topics WHERE key = 'roof-leak-emergency';
  SELECT id INTO solar_topic_id FROM public.roofing_playbook_topics WHERE key = 'solar-ready-roofs';
  SELECT id INTO commercial_topic_id FROM public.roofing_playbook_topics WHERE key = 'commercial-flat-roofs';

  -- ========================================================================
  -- HAIL STORM OUTREACH
  -- ========================================================================
  
  -- Email Example 1
  INSERT INTO public.roofing_playbook_entries (topic_id, entry_type, title, body)
  VALUES (
    hail_topic_id,
    'email_example',
    'Post-Storm Hail Damage Check',
    'Hey {{first_name}},

I''m {{sender_name}} with {{company_name}}. We just finished inspecting a few homes in your neighborhood after last week''s hail storm.

I noticed your roof might have taken some damage. Hail can crack shingles and damage the underlayment — things you can''t always see from the ground.

I can swing by for a free 10-minute inspection. No pressure, just want to make sure you''re covered before the next storm hits.

Would tomorrow afternoon work?

{{sender_name}}'
  );

  -- Email Example 2
  INSERT INTO public.roofing_playbook_entries (topic_id, entry_type, title, body)
  VALUES (
    hail_topic_id,
    'email_example',
    'Insurance Claim Angle',
    'Hey {{first_name}},

Last month''s hail storm did a number on roofs in {{city}}. We''ve been helping homeowners file insurance claims and get their roofs replaced.

Most insurance policies cover hail damage, but you need to act within a certain timeframe.

Want me to take a quick look and see if you have a claim? Takes about 10 minutes, and I''ll give you a straight answer.

{{sender_name}}'
  );

  -- Reply Script: Estimate Booked
  INSERT INTO public.roofing_playbook_entries (topic_id, entry_type, title, body)
  VALUES (
    hail_topic_id,
    'reply_script',
    'Estimate Booked Response',
    'Perfect! I''ll be there {{inspection_date}} at {{inspection_time}}.

I''ll check for:
- Hail damage on shingles
- Granule loss
- Dents in gutters
- Any soft spots on the roof

I''ll give you a full report and help you understand what your insurance might cover.

See you then!

{{sender_name}}'
  );

  -- Reply Script: Price Shopper
  INSERT INTO public.roofing_playbook_entries (topic_id, entry_type, title, body)
  VALUES (
    hail_topic_id,
    'reply_script',
    'Price Shopper Response',
    'Totally understand — you want to make sure you''re getting a fair price.

Here''s what I''ll do:
1. Free inspection to assess the damage
2. Detailed estimate with line items
3. Help you file the insurance claim if you have coverage
4. Match any legitimate quote you get

Most of our jobs are insurance-covered, so your out-of-pocket is usually just your deductible.

Want to schedule that inspection?

{{sender_name}}'
  );

  -- Follow-up Script
  INSERT INTO public.roofing_playbook_entries (topic_id, entry_type, title, body)
  VALUES (
    hail_topic_id,
    'followup_script',
    '7-Day Follow-Up',
    'Hey {{first_name}},

Just checking back in on the hail damage inspection. Still interested in having us take a look?

No pressure either way — just want to make sure you''re covered before the next storm season.

{{sender_name}}'
  );

  -- ========================================================================
  -- WIND DAMAGE INSPECTION
  -- ========================================================================
  
  -- Email Example 1
  INSERT INTO public.roofing_playbook_entries (topic_id, entry_type, title, body)
  VALUES (
    wind_topic_id,
    'email_example',
    'Post-Wind Storm Inspection',
    'Hey {{first_name}},

Those high winds we had last week can lift shingles and damage flashing. I''m doing free inspections in your area to check for wind damage.

Takes about 10 minutes. I''ll look for:
- Missing or lifted shingles
- Damaged flashing around chimneys and vents
- Loose gutters

If there''s damage, I''ll help you understand your options. If not, you''ll have peace of mind.

Want me to swing by?

{{sender_name}}'
  );

  -- Email Example 2
  INSERT INTO public.roofing_playbook_entries (topic_id, entry_type, title, body)
  VALUES (
    wind_topic_id,
    'email_example',
    'Hurricane Season Prep',
    'Hey {{first_name}},

Hurricane season is coming up. Now''s the time to make sure your roof can handle the wind.

I can do a quick inspection to check:
- Shingle condition
- Flashing integrity
- Any weak spots that could fail in high winds

Better to fix small issues now than deal with major damage after a storm.

Interested in a free inspection?

{{sender_name}}'
  );

  -- Reply Script: Estimate Booked
  INSERT INTO public.roofing_playbook_entries (topic_id, entry_type, title, body)
  VALUES (
    wind_topic_id,
    'reply_script',
    'Estimate Booked Response',
    'Great! I''ll be there {{inspection_date}} at {{inspection_time}}.

I''ll check your roof for wind damage and give you a full report. If there''s anything that needs attention, I''ll explain your options.

See you then!

{{sender_name}}'
  );

  -- Follow-up Script
  INSERT INTO public.roofing_playbook_entries (topic_id, entry_type, title, body)
  VALUES (
    wind_topic_id,
    'followup_script',
    '5-Day Follow-Up',
    'Hey {{first_name}},

Just following up on the wind damage inspection. Still want me to take a look?

{{sender_name}}'
  );

  -- ========================================================================
  -- AGING SHINGLE ROOFS
  -- ========================================================================
  
  -- Email Example 1
  INSERT INTO public.roofing_playbook_entries (topic_id, entry_type, title, body)
  VALUES (
    aging_topic_id,
    'email_example',
    'Roof Age Check',
    'Hey {{first_name}},

I was in your neighborhood and noticed your roof looks like it might be getting up there in age.

Most asphalt shingle roofs last 15-20 years. After that, you start seeing:
- Curling shingles
- Missing granules
- Leaks

I can do a free inspection and let you know if it''s time to start planning a replacement, or if you have a few more years left.

Want me to take a look?

{{sender_name}}'
  );

  -- Email Example 2
  INSERT INTO public.roofing_playbook_entries (topic_id, entry_type, title, body)
  VALUES (
    aging_topic_id,
    'email_example',
    'Preventive Maintenance Angle',
    'Hey {{first_name}},

Your roof is one of those things you don''t think about until it''s a problem. But catching issues early can save you thousands.

I''m offering free roof inspections in your area. I''ll check for:
- Worn or damaged shingles
- Clogged gutters
- Damaged flashing
- Any signs of leaks

Takes about 10 minutes. No pressure, just want to help you avoid surprises.

Interested?

{{sender_name}}'
  );

  -- Reply Script: No Response
  INSERT INTO public.roofing_playbook_entries (topic_id, entry_type, title, body)
  VALUES (
    aging_topic_id,
    'reply_script',
    'No Response Follow-Up',
    'Hey {{first_name}},

I know you''re probably busy. Just wanted to make sure you saw my message about the free roof inspection.

If now isn''t a good time, no worries. But if you want to avoid expensive emergency repairs down the road, it''s worth taking 10 minutes now.

Let me know if you want to schedule something.

{{sender_name}}'
  );

  -- Follow-up Script
  INSERT INTO public.roofing_playbook_entries (topic_id, entry_type, title, body)
  VALUES (
    aging_topic_id,
    'followup_script',
    '10-Day Follow-Up',
    'Hey {{first_name}},

Just checking back in on the roof inspection. Still interested?

{{sender_name}}'
  );

  -- ========================================================================
  -- ROOF LEAK EMERGENCY
  -- ========================================================================
  
  -- Email Example 1
  INSERT INTO public.roofing_playbook_entries (topic_id, entry_type, title, body)
  VALUES (
    leak_topic_id,
    'email_example',
    'Emergency Leak Service',
    'Hey {{first_name}},

I heard you might have a roof leak. We can get someone out today or tomorrow to tarp it and stop the water damage.

We''ll:
1. Tarp the affected area immediately
2. Find the source of the leak
3. Give you a quote to fix it properly

No one wants water damage spreading. Want me to send a crew out?

{{sender_name}}'
  );

  -- Email Example 2
  INSERT INTO public.roofing_playbook_entries (topic_id, entry_type, title, body)
  VALUES (
    leak_topic_id,
    'email_example',
    'Same-Day Emergency Response',
    'Hey {{first_name}},

Roof leaks don''t wait. We can have someone at your house within 2-3 hours to:
- Stop the leak with emergency tarping
- Assess the damage
- Get you a repair quote

The longer you wait, the more damage water can do to your ceiling, walls, and insulation.

Want me to dispatch a crew?

{{sender_name}}'
  );

  -- Reply Script: Hot Lead
  INSERT INTO public.roofing_playbook_entries (topic_id, entry_type, title, body)
  VALUES (
    leak_topic_id,
    'reply_script',
    'Hot Lead Response',
    'Got it. I''m sending a crew out now. They''ll be there within 2-3 hours.

They''ll tarp the leak first, then assess the full damage and give you options.

I''ll text you when they''re on the way.

{{sender_name}}'
  );

  -- ========================================================================
  -- SOLAR-READY ROOFS
  -- ========================================================================
  
  -- Email Example 1
  INSERT INTO public.roofing_playbook_entries (topic_id, entry_type, title, body)
  VALUES (
    solar_topic_id,
    'email_example',
    'Solar-Ready Roof Upgrade',
    'Hey {{first_name}},

Thinking about going solar? Your roof needs to be in good shape first.

Most solar companies won''t install on a roof that''s more than 10 years old. If your roof is getting close, it makes sense to replace it now — before you invest in solar panels.

We can:
1. Replace your roof with solar-ready materials
2. Coordinate with your solar installer
3. Make sure everything is done right the first time

Want to talk through your options?

{{sender_name}}'
  );

  -- Email Example 2
  INSERT INTO public.roofing_playbook_entries (topic_id, entry_type, title, body)
  VALUES (
    solar_topic_id,
    'email_example',
    'Energy-Efficient Roof Upgrade',
    'Hey {{first_name}},

New roofs can cut your energy bills by 10-15% with proper ventilation and reflective materials.

If your roof is 15+ years old, you''re probably losing money on cooling costs every month.

I can show you:
- Energy-efficient shingle options
- Proper ventilation upgrades
- Solar-ready prep if you want to go that route later

Want a free estimate?

{{sender_name}}'
  );

  -- Reply Script: High-Ticket Close
  INSERT INTO public.roofing_playbook_entries (topic_id, entry_type, title, body)
  VALUES (
    solar_topic_id,
    'reply_script',
    'High-Ticket Close',
    'Great! Let''s get you set up with a roof that''s ready for solar and saves you money on energy bills.

I''ll put together a detailed quote with:
- Solar-ready materials
- Energy-efficient options
- Warranty details
- Timeline

I''ll have it to you by {{quote_date}}.

{{sender_name}}'
  );

  -- ========================================================================
  -- COMMERCIAL FLAT ROOFS
  -- ========================================================================
  
  -- Email Example 1
  INSERT INTO public.roofing_playbook_entries (topic_id, entry_type, title, body)
  VALUES (
    commercial_topic_id,
    'email_example',
    'Commercial Flat Roof Inspection',
    'Hey {{first_name}},

Flat roofs need regular maintenance to avoid costly leaks and water damage.

I specialize in commercial flat roof systems — TPO, EPDM, modified bitumen. I can do a free inspection and let you know:
- Current condition
- Any areas of concern
- Repair vs. replacement options
- Maintenance recommendations

Takes about 30 minutes. Want to schedule something?

{{sender_name}}'
  );

  -- Email Example 2
  INSERT INTO public.roofing_playbook_entries (topic_id, entry_type, title, body)
  VALUES (
    commercial_topic_id,
    'email_example',
    'Preventive Maintenance Program',
    'Hey {{first_name}},

Most commercial roof failures happen because small issues weren''t caught early.

I offer preventive maintenance programs for flat roofs:
- Quarterly inspections
- Minor repairs as needed
- Detailed reports for your records
- Priority service when issues come up

This can extend your roof''s life by 5-10 years and save you from expensive emergency repairs.

Interested in learning more?

{{sender_name}}'
  );

  -- Reply Script: Commercial Estimate
  INSERT INTO public.roofing_playbook_entries (topic_id, entry_type, title, body)
  VALUES (
    commercial_topic_id,
    'reply_script',
    'Commercial Estimate Response',
    'Perfect! I''ll schedule a time to inspect your flat roof system.

I''ll provide:
- Detailed condition report
- Repair vs. replacement analysis
- Cost estimates for all options
- Timeline and minimal disruption plan

I''ll follow up with a time that works for you.

{{sender_name}}'
  );

END $$;

-- ============================================================================
-- PART 10 — ENABLE RLS ON NEW TABLES
-- ============================================================================

ALTER TABLE public.roofing_playbook_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_playbook_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.state_market_segments ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow all authenticated users to read playbook data
CREATE POLICY "roofing_playbook_topics_select" ON public.roofing_playbook_topics
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "roofing_playbook_entries_select" ON public.roofing_playbook_entries
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "market_segments_select" ON public.market_segments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "state_market_segments_select" ON public.state_market_segments
  FOR SELECT TO authenticated USING (true);

-- Allow service role full access
CREATE POLICY "roofing_playbook_topics_service_role" ON public.roofing_playbook_topics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "roofing_playbook_entries_service_role" ON public.roofing_playbook_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "market_segments_service_role" ON public.market_segments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "state_market_segments_service_role" ON public.state_market_segments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 11 — ADD ONBOARDING TASK FOR SERVICE AREA + ROOF FOCUS
-- ============================================================================

-- Add onboarding task for service area and roof focus
INSERT INTO public.onboarding_tasks (key, title, description, order_index)
VALUES (
  'add_service_area_roof_focus',
  'Add Your Service Area + Roof Focus',
  'Tell us where you operate and what types of roofs you focus on (residential, commercial, or both). This helps us personalize your coaching and playbook examples.',
  2
)
ON CONFLICT (key) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    order_index = EXCLUDED.order_index;


























