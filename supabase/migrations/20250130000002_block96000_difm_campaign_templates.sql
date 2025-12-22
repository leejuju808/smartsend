-- =========================================================
-- Block 96000 — SmartSend Roofing Do-It-For-Me Campaign Templates
-- =========================================================
-- 
-- THE 1-CLICK CAMPAIGN BUILDER — ZERO FLUFF.
-- 
-- This block enables roofers to push ONE BUTTON and get a fully-built,
-- personalized, activated campaign instantly.
-- 
-- No thinking. No configuration. Just results.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE difm_campaign_templates TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.difm_campaign_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text UNIQUE NOT NULL,  -- "hail-market", "leak-repair", "aging-roofs"
  title text NOT NULL,
  description text,
  base_subject text NOT NULL,
  base_email text NOT NULL,
  base_followups jsonb NOT NULL DEFAULT '[]'::jsonb,  -- list of follow-up bodies
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_difm_templates_key ON public.difm_campaign_templates(template_key);

COMMENT ON TABLE public.difm_campaign_templates IS 'Do-It-For-Me campaign templates for instant campaign creation (Block 96000)';

-- Enable RLS
ALTER TABLE public.difm_campaign_templates ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read templates
CREATE POLICY "difm_templates_select" ON public.difm_campaign_templates
  FOR SELECT TO authenticated
  USING (true);

-- Service role can manage templates
CREATE POLICY "difm_templates_service_role" ON public.difm_campaign_templates
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- PART 2 — SEED REQUIRED TEMPLATES
-- ============================================================================

-- Template 1: Hail Market Campaign
INSERT INTO public.difm_campaign_templates (template_key, title, description, base_subject, base_email, base_followups)
VALUES (
  'hail-market',
  'Hail Damage Inspection Campaign',
  'Target homeowners after recent hail storms with free roof inspections',
  'Quick question about your roof in {{city}}',
  'Hey {{first_name}},

I''m with {{company_name}} here in {{city}}, {{state}}.

We''ve been helping a lot of homeowners in your area after the recent hail storms. Most people don''t realize they have damage until they see missing shingles or leaks months later.

I''m offering a **free roof inspection** this week. Takes about 20-30 minutes, no pressure, and you''ll know exactly what needs attention (if anything).

Want me to lock in a time? Just reply with a good day/time or your best number and I''ll get you scheduled.

Thanks,
{{sender_name}}',
  '[
    "Hey {{first_name}},\n\nJust following up in case my last note got buried.\n\nWe''re still doing free roof checks for homeowners in {{city}} after the recent hail. Most damage isn''t obvious until it''s a bigger problem.\n\nWant to lock in a time this week?\n\n{{sender_name}}",
    "Hey {{first_name}},\n\nLast quick note from me about the free roof inspection.\n\nIf you''re interested, reply here and I''ll get you scheduled. If not, no worries at all – I''ll close this out.\n\n{{sender_name}}"
  ]'::jsonb
) ON CONFLICT (template_key) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  base_subject = EXCLUDED.base_subject,
  base_email = EXCLUDED.base_email,
  base_followups = EXCLUDED.base_followups;

-- Template 2: Wind Damage Campaign
INSERT INTO public.difm_campaign_templates (template_key, title, description, base_subject, base_email, base_followups)
VALUES (
  'wind-damage',
  'Wind Damage Inspection Campaign',
  'Target coastal and windy areas with wind damage inspections',
  'Roof check in {{city}} after recent winds?',
  'Hey {{first_name}},

I''m with {{company_name}} in {{city}}, {{state}}.

The recent high winds we''ve had can cause damage that''s easy to miss – lifted shingles, damaged flashing, or loose gutters. Small issues can turn into big problems fast.

I''m offering a **free inspection** this week to check for any wind damage. No obligation, just want to make sure you''re covered.

Interested in scheduling one? Reply with a good time or your best number.

Thanks,
{{sender_name}}',
  '[
    "Hey {{first_name}},\n\nJust wanted to follow up on the free wind damage inspection.\n\nWe''re still scheduling checks in {{city}} this week. Takes about 20 minutes and you''ll know exactly what''s going on with your roof.\n\nWant to lock in a time?\n\n{{sender_name}}",
    "Hey {{first_name}},\n\nLast note about the free roof inspection.\n\nIf you''re interested, just reply and I''ll get you scheduled. If not, all good – I''ll close this out.\n\n{{sender_name}}"
  ]'::jsonb
) ON CONFLICT (template_key) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  base_subject = EXCLUDED.base_subject,
  base_email = EXCLUDED.base_email,
  base_followups = EXCLUDED.base_followups;

-- Template 3: Aging Shingle Campaign
INSERT INTO public.difm_campaign_templates (template_key, title, description, base_subject, base_email, base_followups)
VALUES (
  'aging-shingle',
  'Aging Roof Replacement Campaign',
  'Target homes with older roofs for replacement estimates',
  'How old is your roof in {{city}}?',
  'Hey {{first_name}},

I''m with {{company_name}} here in {{city}}, {{state}}.

Most roofs in this area are hitting 15-20 years old, which is when you start seeing issues. Curled shingles, missing granules, or leaks that come out of nowhere.

I''m offering a **free roof inspection** to check the condition and give you an honest assessment. If it''s time to replace, you''ll know. If it''s got a few more years, you''ll know that too.

Want to schedule one? Just reply with a good day/time or your best number.

Thanks,
{{sender_name}}',
  '[
    "Hey {{first_name}},\n\nFollowing up on my note about the free roof inspection.\n\nOlder roofs can fail pretty quickly once they start showing signs of wear. A quick check now can save you from emergency repairs later.\n\nInterested in scheduling?\n\n{{sender_name}}",
    "Hey {{first_name}},\n\nLast note about the free inspection.\n\nIf you want to get it scheduled, just reply here. If not, no worries – I''ll close this out.\n\n{{sender_name}}"
  ]'::jsonb
) ON CONFLICT (template_key) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  base_subject = EXCLUDED.base_subject,
  base_email = EXCLUDED.base_email,
  base_followups = EXCLUDED.base_followups;

-- Template 4: Roof Leak Emergency Campaign
INSERT INTO public.difm_campaign_templates (template_key, title, description, base_subject, base_email, base_followups)
VALUES (
  'roof-leak-emergency',
  'Roof Leak Prevention Campaign',
  'Target areas with heavy rain for leak prevention and repairs',
  'Roof leak prevention in {{city}}',
  'Hey {{first_name}},

I''m with {{company_name}} in {{city}}, {{state}}.

With all the rain we''ve been getting, a lot of homeowners are dealing with leaks they didn''t know they had. Water damage can get expensive fast if you don''t catch it early.

I''m offering a **free leak inspection** this week. We''ll check your roof, gutters, and flashing to make sure everything is sealed tight before the next big storm.

Want to schedule one? Reply with a good time or your best number.

Thanks,
{{sender_name}}',
  '[
    "Hey {{first_name}},\n\nJust following up on the leak inspection offer.\n\nWith more rain coming, it''s worth checking your roof now before any small issues become big problems.\n\nInterested in scheduling this week?\n\n{{sender_name}}",
    "Hey {{first_name}},\n\nLast note about the leak inspection.\n\nIf you want to get it scheduled, reply here. If not, all good – I''ll close this out.\n\n{{sender_name}}"
  ]'::jsonb
) ON CONFLICT (template_key) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  base_subject = EXCLUDED.base_subject,
  base_email = EXCLUDED.base_email,
  base_followups = EXCLUDED.base_followups;

-- Template 5: Solar-Ready Roof Campaign
INSERT INTO public.difm_campaign_templates (template_key, title, description, base_subject, base_email, base_followups)
VALUES (
  'solar-ready-roof',
  'Solar-Ready Roof Campaign',
  'Target homeowners considering solar with roof condition checks',
  'Thinking about solar? Let''s check your roof in {{city}}',
  'Hey {{first_name}},

I''m with {{company_name}} in {{city}}, {{state}}.

If you''re thinking about going solar, your roof needs to be in good shape first. Most solar companies won''t install on roofs that are more than 10-15 years old or showing signs of wear.

I''m offering a **free roof condition check** to see if your roof is solar-ready. If it needs work, we can handle it. If it''s good to go, you''ll know you''re set.

Interested? Reply with a good day/time or your best number.

Thanks,
{{sender_name}}',
  '[
    "Hey {{first_name}},\n\nFollowing up on the solar-ready roof check.\n\nGetting your roof inspected before going solar can save you from having to redo the solar installation later. Worth checking now.\n\nWant to schedule?\n\n{{sender_name}}",
    "Hey {{first_name}},\n\nLast note about the roof condition check.\n\nIf you''re interested, reply here and I''ll get you scheduled. If not, no worries.\n\n{{sender_name}}"
  ]'::jsonb
) ON CONFLICT (template_key) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  base_subject = EXCLUDED.base_subject,
  base_email = EXCLUDED.base_email,
  base_followups = EXCLUDED.base_followups;


























