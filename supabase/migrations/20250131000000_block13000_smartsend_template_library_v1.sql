-- =========================================================
-- Block 13000 — SmartSend Template Library v1
-- (The Roofing Email Template Library Filled With Proven Angles, Openers & Follow-Ups)
-- =========================================================

-- 1. Create template_categories table
CREATE TABLE IF NOT EXISTS public.template_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE, -- e.g., 'roofing_outreach', 'old_quotes', 'storm_insurance'
  name text NOT NULL, -- e.g., 'Roofing Outreach', 'Old Quotes'
  description text,
  display_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 2. Create templates table (if not exists, extend if it does)
CREATE TABLE IF NOT EXISTS public.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL, -- references template_categories.slug
  subject text, -- Short, curiosity-based, personalized
  body text NOT NULL, -- 1-2 sentences max, homeowner-friendly
  cta text, -- Call-to-action question that triggers replies
  created_by text DEFAULT 'system', -- 'system' or user_id
  premium_flag boolean DEFAULT false, -- Future upsells
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add columns if they don't exist (for existing templates table)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'templates' AND column_name = 'category') THEN
    ALTER TABLE public.templates ADD COLUMN category text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'templates' AND column_name = 'subject') THEN
    ALTER TABLE public.templates ADD COLUMN subject text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'templates' AND column_name = 'cta') THEN
    ALTER TABLE public.templates ADD COLUMN cta text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'templates' AND column_name = 'created_by') THEN
    ALTER TABLE public.templates ADD COLUMN created_by text DEFAULT 'system';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'templates' AND column_name = 'premium_flag') THEN
    ALTER TABLE public.templates ADD COLUMN premium_flag boolean DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'templates' AND column_name = 'updated_at') THEN
    ALTER TABLE public.templates ADD COLUMN updated_at timestamptz DEFAULT now();
  END IF;
END $$;

-- 3. Create user_custom_templates table
CREATE TABLE IF NOT EXISTS public.user_custom_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid, -- For multi-tenant support
  title text NOT NULL,
  category text NOT NULL,
  subject text,
  body text NOT NULL,
  cta text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Create indexes
CREATE INDEX IF NOT EXISTS idx_templates_category ON public.templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_created_by ON public.templates(created_by);
CREATE INDEX IF NOT EXISTS idx_templates_premium ON public.templates(premium_flag);
CREATE INDEX IF NOT EXISTS idx_user_custom_templates_user ON public.user_custom_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_user_custom_templates_workspace ON public.user_custom_templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_template_categories_slug ON public.template_categories(slug);

-- 5. Enable RLS
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_custom_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_categories ENABLE ROW LEVEL SECURITY;

-- RLS Policies for templates (read-only for all authenticated users)
DROP POLICY IF EXISTS "templates_select_all" ON public.templates;
CREATE POLICY "templates_select_all" ON public.templates
  FOR SELECT USING (true);

-- RLS Policies for user_custom_templates (users can only access their own)
DROP POLICY IF EXISTS "user_custom_templates_select_own" ON public.user_custom_templates;
CREATE POLICY "user_custom_templates_select_own" ON public.user_custom_templates
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_custom_templates_insert_own" ON public.user_custom_templates;
CREATE POLICY "user_custom_templates_insert_own" ON public.user_custom_templates
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_custom_templates_update_own" ON public.user_custom_templates;
CREATE POLICY "user_custom_templates_update_own" ON public.user_custom_templates
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_custom_templates_delete_own" ON public.user_custom_templates;
CREATE POLICY "user_custom_templates_delete_own" ON public.user_custom_templates
  FOR DELETE USING (user_id = auth.uid());

-- RLS Policies for template_categories (read-only for all authenticated users)
DROP POLICY IF EXISTS "template_categories_select_all" ON public.template_categories;
CREATE POLICY "template_categories_select_all" ON public.template_categories
  FOR SELECT USING (true);

-- 6. Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_templates_updated_at ON public.templates;
CREATE TRIGGER trg_templates_updated_at
  BEFORE UPDATE ON public.templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_templates_updated_at();

DROP TRIGGER IF EXISTS trg_user_custom_templates_updated_at ON public.user_custom_templates;
CREATE TRIGGER trg_user_custom_templates_updated_at
  BEFORE UPDATE ON public.user_custom_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_templates_updated_at();

-- 7. Insert Template Categories
INSERT INTO public.template_categories (slug, name, description, display_order)
VALUES
  ('roofing_outreach', 'Roofing Outreach', 'Cold outreach templates for new homeowner lists', 1),
  ('roofing_followups', 'Roofing Follow-Ups', 'Follow-up templates for ongoing conversations', 2),
  ('old_quotes', 'Old Quotes', 'Reactivation templates for previous quotes', 3),
  ('insurance_storm', 'Insurance/Storm', 'Storm damage and insurance claim templates', 4),
  ('seasonal_campaigns', 'Seasonal Campaigns', 'Season-specific templates (winter, spring, summer, fall)', 5),
  ('specials_promotions', 'Specials/Promotions', 'Promotional and special offer templates', 6),
  ('re_engagement', 'Re-Engagement', 'Templates to re-engage inactive leads', 7),
  ('short_messages', 'Short Messages', 'One-liner templates for quick outreach', 8),
  ('test_templates', 'Test Templates', 'Templates for testing and experimentation', 9),
  ('custom_templates', 'Custom Templates', 'User-created custom templates', 10)
ON CONFLICT (slug) DO NOTHING;

-- 8. Seed the 12 Core Roofing Template Sets
-- Use DO block to prevent duplicates

DO $$
BEGIN
  -- Set 1 — Straightforward Homeowner Outreach
  IF NOT EXISTS (SELECT 1 FROM public.templates WHERE title = 'Quick Roof Question' AND category = 'roofing_outreach') THEN
    INSERT INTO public.templates (title, category, subject, body, cta, created_by)
    VALUES
      ('Quick Roof Question', 'roofing_outreach', 'Quick roof question', 
       'Hey {{name}}, are you still the best person to talk to about the roof at {{address_or_city}}? Just wanted to ask a quick question about the condition.',
       'Mind if I send over a quick estimate?', 'system');
  END IF;

  -- Set 2 — Old Quotes Reactivation
  IF NOT EXISTS (SELECT 1 FROM public.templates WHERE title = 'Old Quote Follow-Up' AND category = 'old_quotes') THEN
    INSERT INTO public.templates (title, category, subject, body, cta, created_by)
    VALUES
      ('Old Quote Follow-Up', 'old_quotes', 'Following up on roof work', 
       'Hey {{name}}, we talked before about roof work. Did you ever end up getting that handled?',
       'If not, want me to check current pricing for you?', 'system');
  END IF;

  -- Set 3 — Storm/Insurance Outreach
  IF NOT EXISTS (SELECT 1 FROM public.templates WHERE title = 'Storm Inspection Offer' AND category = 'insurance_storm') THEN
    INSERT INTO public.templates (title, category, subject, body, cta, created_by)
    VALUES
      ('Storm Inspection Offer', 'insurance_storm', 'Quick heads up — storm inspection', 
       'Hey {{name}}, quick heads up — a lot of homeowners in {{city}} are getting inspections covered by insurance after last week''s storm. Want me to take a look at yours?',
       'Want me to check if you qualify?', 'system');
  END IF;

  -- Set 4 — Leak & Repair Short Messages
  IF NOT EXISTS (SELECT 1 FROM public.templates WHERE title = 'Roof Leak Check' AND category = 'short_messages') THEN
    INSERT INTO public.templates (title, category, subject, body, cta, created_by)
    VALUES
      ('Roof Leak Check', 'short_messages', 'Random question', 
       'Random question — any roof leaks over there?',
       NULL, 'system');
  END IF;

  -- Set 5 — Seasonal Campaigns
  IF NOT EXISTS (SELECT 1 FROM public.templates WHERE title = 'Winter Freeze Notice' AND category = 'seasonal_campaigns') THEN
    INSERT INTO public.templates (title, category, subject, body, cta, created_by)
    VALUES
      ('Winter Freeze Notice', 'seasonal_campaigns', 'Winter freeze warning', 
       'Hey {{name}}, with the freeze coming this week, want me to check your roof for any damage?',
       'Want me to swing by?', 'system'),
      ('Spring Inspection Reminder', 'seasonal_campaigns', 'Spring roof check', 
       'Hey {{name}}, spring is a good time to catch small roof issues before they become expensive leaks.',
       'Want me to take a quick look?', 'system'),
      ('Summer Heat Damage', 'seasonal_campaigns', 'Summer heat damage check', 
       'Hey {{name}}, the summer heat can cause shingles to crack. Want me to check yours?',
       'Want me to swing by?', 'system'),
      ('Fall Gutter + Roof Check', 'seasonal_campaigns', 'Fall gutter + roof check', 
       'Hey {{name}}, fall is the perfect time to check gutters and roof before winter hits.',
       'Want me to take a look?', 'system');
  END IF;

  -- Set 6 — Price-Check Templates
  IF NOT EXISTS (SELECT 1 FROM public.templates WHERE title = 'Updated Pricing Check' AND category = 'roofing_outreach') THEN
    INSERT INTO public.templates (title, category, subject, body, cta, created_by)
    VALUES
      ('Updated Pricing Check', 'roofing_outreach', 'Updated pricing question', 
       'Curious — do you want updated pricing on your roof? A lot has changed this year.',
       'Want me to send over current numbers?', 'system');
  END IF;

  -- Set 7 — Neighborhood Outreach
  IF NOT EXISTS (SELECT 1 FROM public.templates WHERE title = 'Neighborhood Roof Check' AND category = 'roofing_outreach') THEN
    INSERT INTO public.templates (title, category, subject, body, cta, created_by)
    VALUES
      ('Neighborhood Roof Check', 'roofing_outreach', 'Neighborhood roof work', 
       'Hey {{name}}, we''re doing a few roofs in {{neighborhood}} this week. Want yours checked while we''re there?',
       'Want me to add you to the list?', 'system');
  END IF;

  -- Set 8 — Repair-Only Angle
  IF NOT EXISTS (SELECT 1 FROM public.templates WHERE title = 'Small Repair Offer' AND category = 'roofing_outreach') THEN
    INSERT INTO public.templates (title, category, subject, body, cta, created_by)
    VALUES
      ('Small Repair Offer', 'roofing_outreach', 'Small roof repairs', 
       'Do you need any small roof repairs done? Stuff like vents, patches, or missing shingles?',
       'Want me to take a look?', 'system');
  END IF;

  -- Set 9 — Big Job Angle
  IF NOT EXISTS (SELECT 1 FROM public.templates WHERE title = 'Full Roof Replacement Check' AND category = 'roofing_outreach') THEN
    INSERT INTO public.templates (title, category, subject, body, cta, created_by)
    VALUES
      ('Full Roof Replacement Check', 'roofing_outreach', 'Full roof timing', 
       'Have you thought about doing the full roof this year or next? Just checking — pricing is good right now.',
       'Want me to send over some numbers?', 'system');
  END IF;

  -- Set 10 — Follow-Up Templates (3-Step)
  IF NOT EXISTS (SELECT 1 FROM public.templates WHERE title = 'Follow-Up 1' AND category = 'roofing_followups') THEN
    INSERT INTO public.templates (title, category, subject, body, cta, created_by)
    VALUES
      ('Follow-Up 1', 'roofing_followups', 'Circling back', 
       'Hey, circling back. Should I hold off or check your roof?',
       NULL, 'system'),
      ('Follow-Up 2', 'roofing_followups', 'Still interested?', 
       'Still want this done or should I close your file?',
       NULL, 'system'),
      ('Follow-Up 3', 'roofing_followups', 'Last follow-up', 
       'Last follow-up from me — want me to take a quick look at the roof?',
       NULL, 'system');
  END IF;

  -- Set 11 — One-Liner Lightning Templates
  IF NOT EXISTS (SELECT 1 FROM public.templates WHERE title = 'Figure Anything Out?' AND category = 'short_messages') THEN
    INSERT INTO public.templates (title, category, subject, body, cta, created_by)
    VALUES
      ('Figure Anything Out?', 'short_messages', 'Figure anything out?', 
       'Figure anything out with your roof?',
       NULL, 'system'),
      ('Still Own the Place?', 'short_messages', 'Still own the place?', 
       'Still own the place?',
       NULL, 'system'),
      ('Need Any Repairs?', 'short_messages', 'Need any repairs?', 
       'Need any repairs?',
       NULL, 'system'),
      ('Want Pricing Check?', 'short_messages', 'Want pricing check?', 
       'Want me to check pricing?',
       NULL, 'system');
  END IF;

  -- Set 12 — Hard "Stop" Follow-Up Avoidance
  IF NOT EXISTS (SELECT 1 FROM public.templates WHERE title = 'Soft Exit' AND category = 're_engagement') THEN
    INSERT INTO public.templates (title, category, subject, body, cta, created_by)
    VALUES
      ('Soft Exit', 're_engagement', 'No problem', 
       'No problem at all. Let me know if anything changes.',
       NULL, 'system');
  END IF;
END $$;

-- Comments
COMMENT ON TABLE public.templates IS 'SmartSend Template Library - Pre-built, professionally written, high-converting roofing outreach templates';
COMMENT ON TABLE public.template_categories IS 'Template categories for organizing the template library';
COMMENT ON TABLE public.user_custom_templates IS 'User-created custom templates';
COMMENT ON COLUMN public.templates.subject IS 'Short, curiosity-based, personalized subject line';
COMMENT ON COLUMN public.templates.body IS '1-2 sentences max. No paragraphs. No sales talk. Homeowner-friendly.';
COMMENT ON COLUMN public.templates.cta IS 'Simple question that triggers replies';

