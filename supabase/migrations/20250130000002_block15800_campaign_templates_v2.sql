-- =========================================================
-- Block 15800 — SmartSend Campaign Templates v2
-- (High-Converting Roofing Templates: Storm, Insurance Claims, Old Quotes, Neighborhood Jobs, Repairs & Seasonal Playbooks)
-- =========================================================

-- Extend campaign_templates table with v2 fields
ALTER TABLE IF EXISTS campaign_templates
  ADD COLUMN IF NOT EXISTS category text, -- 'storm_damage', 'insurance_claims', 'old_quotes', 'neighborhood_outreach', 'repairs', 'replacements', 'seasonal'
  ADD COLUMN IF NOT EXISTS personalization_required boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS tone_options text[] DEFAULT ARRAY['urgent', 'friendly', 'professional', 'simple'],
  ADD COLUMN IF NOT EXISTS recommended_list_types text[] DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS promo_tag text DEFAULT NULL; -- e.g., 'High Reply Rate'

-- Extend campaign_template_steps table with tone field
ALTER TABLE IF EXISTS campaign_template_steps
  ADD COLUMN IF NOT EXISTS tone text DEFAULT 'default'; -- 'urgent', 'friendly', 'professional', 'simple', 'default'

-- Create indexes for new fields
CREATE INDEX IF NOT EXISTS idx_campaign_templates_category ON campaign_templates(category);
CREATE INDEX IF NOT EXISTS idx_campaign_templates_tone_options ON campaign_templates USING gin(tone_options);
CREATE INDEX IF NOT EXISTS idx_template_steps_tone ON campaign_template_steps(template_id, tone);

-- =========================================================
-- 1. STORM DAMAGE OUTREACH TEMPLATE
-- =========================================================
DO $$
DECLARE
  storm_template_id uuid;
BEGIN
  INSERT INTO campaign_templates (
    slug, name, niche, goal, description, recommended_steps,
    category, personalization_required, tone_options, recommended_list_types, promo_tag
  ) VALUES (
    'roofing-storm-damage-v2',
    'Storm Damage Outreach (Hail/Wind/Rain)',
    'roofing',
    'book_estimates',
    'High-converting storm outreach sequence. Targets storm lists, neighborhood lists, high-risk zips. Goal: BOOK inspections.',
    7,
    'storm_damage',
    true,
    ARRAY['urgent', 'friendly', 'professional', 'simple'],
    ARRAY['storm_lists', 'neighborhood_lists', 'high_risk_zips'],
    'High Reply Rate'
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    is_active = true
  RETURNING id INTO storm_template_id;

  IF storm_template_id IS NULL THEN
    SELECT id INTO storm_template_id FROM campaign_templates WHERE slug = 'roofing-storm-damage-v2';
  END IF;

  -- Step 1: Storm Inspection Offer (Urgent)
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    storm_template_id, 1, 0, 'urgent',
    'Quick roof check in {{neighborhood}}?',
    'Hey {{first_name}},

We had some serious storms hit {{neighborhood}} last week — hail, wind, the works.

Most homeowners don''t see roof damage until it''s too late. Want me to swing by and do a quick inspection? It''s free, takes 20 minutes, and you''ll know exactly what you''re dealing with.

{{booking_link}}

Reply here if you want me to check it out.

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 1: Friendly variant
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    storm_template_id, 1, 0, 'friendly',
    'Quick roof check in {{neighborhood}}?',
    'Hey {{first_name}},

Hope you made it through the storms okay! We''ve been helping a lot of folks in {{neighborhood}} check their roofs after last week''s weather.

I''d be happy to take a quick look at yours — no pressure, just want to make sure everything''s good. Takes about 20 minutes and it''s completely free.

{{booking_link}}

Let me know if you''d like me to stop by!

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 2: Specific Storm Angle
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    storm_template_id, 2, 3, 'urgent',
    'Hail hits differently in {{zip}}. Want me to check it?',
    '{{first_name}},

Hail damage in {{zip}} can be sneaky — you might not see it from the ground, but it can shorten your roof''s life by years.

We''re doing free inspections in your area this week. Want me to take a look?

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 3: Scarcity + Social Proof
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    storm_template_id, 3, 6, 'urgent',
    'We''re checking 6 roofs on {{neighborhood}} today',
    '{{first_name}},

We''re in {{neighborhood}} today checking roofs after the storm. Already looked at 6 homes on your street.

Want me to add yours to the list? Free inspection, takes 20 minutes.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 4: Light follow-up
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    storm_template_id, 4, 9, 'friendly',
    'Following up on roof check',
    'Hey {{first_name}},

Just wanted to follow up — still offering free roof inspections in {{neighborhood}} after the storms.

No pressure, but if you want me to take a look, reply here and I''ll lock in a time.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 5: Direct ask
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    storm_template_id, 5, 12, 'professional',
    'Last call: Free roof inspection in {{city}}',
    '{{first_name}},

Final follow-up on the free roof inspection offer.

If you''d like me to check your roof, reply here and I''ll schedule it. If not, no worries — I''ll close this out.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 6: Storm-specific calendar link
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    storm_template_id, 6, 15, 'urgent',
    'Storm damage window closing — book your inspection',
    '{{first_name}},

Insurance companies typically want claims filed within 30 days of storm damage. We''re still doing free inspections this week.

{{booking_link}}

Book a time and I''ll check everything before your adjuster comes.

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 7: Soft ending
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    storm_template_id, 7, 18, 'simple',
    'Last note on roof check',
    '{{first_name}},

Last note from me. If you want a free roof inspection, reply here: {{booking_link}}

If not, all good — I''ll close this out.

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;
END $$;

-- =========================================================
-- 2. INSURANCE CLAIM SEQUENCE TEMPLATE
-- =========================================================
DO $$
DECLARE
  insurance_template_id uuid;
BEGIN
  INSERT INTO campaign_templates (
    slug, name, niche, goal, description, recommended_steps,
    category, personalization_required, tone_options, recommended_list_types, promo_tag
  ) VALUES (
    'roofing-insurance-claims-v2',
    'Insurance Claim Sequence',
    'roofing',
    'book_estimates',
    'Own the claim inspection. Targets insurance leads, storm jobs. Goal: OWN the claim inspection.',
    7,
    'insurance_claims',
    true,
    ARRAY['urgent', 'friendly', 'professional', 'simple'],
    ARRAY['insurance_leads', 'storm_jobs'],
    'High Reply Rate'
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    is_active = true
  RETURNING id INTO insurance_template_id;

  IF insurance_template_id IS NULL THEN
    SELECT id INTO insurance_template_id FROM campaign_templates WHERE slug = 'roofing-insurance-claims-v2';
  END IF;

  -- Step 1: Adjuster Prep (Urgent)
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    insurance_template_id, 1, 0, 'urgent',
    'Before the adjuster comes, want a free roof check?',
    'Hey {{first_name}},

If you''re planning to file an insurance claim, here''s what you need to know:

The adjuster works for the insurance company — not you. They might miss damage or lowball the estimate.

Want me to do a free inspection BEFORE your adjuster comes? I''ll document everything so you know exactly what to point out.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 2: Guidance Tone
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    insurance_template_id, 2, 3, 'professional',
    'Insurance can be confusing. Want help?',
    '{{first_name}},

Insurance claims can be overwhelming. Here''s what I''ve learned:

1. Document everything BEFORE the adjuster arrives
2. Know what damage to point out
3. Understand what''s covered vs. what''s not

I can do a free inspection and walk you through the process. No pressure — just want to help you get what you deserve.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 3: Urgent Reminder
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    insurance_template_id, 3, 6, 'urgent',
    'If you plan to file, I can check everything this week',
    '{{first_name}},

Time-sensitive: If you''re filing a claim, you want documentation BEFORE the adjuster shows up.

I can inspect your roof this week and give you a detailed report. That way you know exactly what to point out.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 4: Light follow-up
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    insurance_template_id, 4, 9, 'friendly',
    'Following up on insurance claim help',
    'Hey {{first_name}},

Just following up — still offering free roof inspections for insurance claims.

If you want help navigating the process, reply here and I''ll set up a time.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 5: Direct ask
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    insurance_template_id, 5, 12, 'professional',
    'Last call: Free inspection before adjuster',
    '{{first_name}},

Final follow-up. If you''re filing a claim and want a free inspection before your adjuster comes, reply here.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 6: Insurance-specific conditional
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    insurance_template_id, 6, 15, 'urgent',
    '{% if claim_likelihood == "high" %}Claim window closing — book inspection{% else %}Free roof inspection for insurance claims{% endif %}',
    '{% if claim_likelihood == "high" %}
{{first_name}},

Most insurance companies want claims filed within 30 days. If you''re planning to file, you need documentation NOW.

{{booking_link}}

Book a time and I''ll inspect everything before your adjuster arrives.

{% else %}
{{first_name}},

Still offering free roof inspections for insurance claims. If you need help navigating the process, reply here.

{{booking_link}}

{{company_name}}
{% endif %}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 7: Soft ending
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    insurance_template_id, 7, 18, 'simple',
    'Last note on insurance claim help',
    '{{first_name}},

Last note. If you want help with your insurance claim, reply here: {{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;
END $$;

-- =========================================================
-- 3. OLD QUOTE REVIVAL (MONEY SEQUENCE) TEMPLATE
-- =========================================================
DO $$
DECLARE
  old_quote_template_id uuid;
BEGIN
  INSERT INTO campaign_templates (
    slug, name, niche, goal, description, recommended_steps,
    category, personalization_required, tone_options, recommended_list_types, promo_tag
  ) VALUES (
    'roofing-old-quotes-v2',
    'Old Quote Revival (Money Sequence)',
    'roofing',
    'reactivate_past_customers',
    'Revive dead quotes. Targets old quotes, past customers. Goal: REVIVE dead quotes.',
    7,
    'old_quotes',
    true,
    ARRAY['urgent', 'friendly', 'professional', 'simple'],
    ARRAY['old_quotes', 'past_customers'],
    'High Reply Rate'
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    is_active = true
  RETURNING id INTO old_quote_template_id;

  IF old_quote_template_id IS NULL THEN
    SELECT id INTO old_quote_template_id FROM campaign_templates WHERE slug = 'roofing-old-quotes-v2';
  END IF;

  -- Step 1: Soft Reconnect
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    old_quote_template_id, 1, 0, 'friendly',
    'We quoted you {{time_since_last_quote}} — want updated pricing?',
    'Hey {{first_name}},

We quoted you a roof {{time_since_last_quote}} ago. A lot has changed since then — material costs, labor, everything.

Want me to give you updated pricing? No pressure, just want to make sure you have current numbers if you''re still thinking about it.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 2: Neighborhood Activity
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    old_quote_template_id, 2, 4, 'friendly',
    'We''ve been working near {{local_landmark}} again',
    'Hey {{first_name}},

We''re back in your area — been doing some work near {{local_landmark}}.

Since we''re in the neighborhood anyway, want me to swing by and recheck your roof? I can give you updated pricing while I''m at it.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 3: Final Nudge
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    old_quote_template_id, 3, 8, 'simple',
    'No pressure — want me to recheck your roof?',
    '{{first_name}},

No pressure at all — just wanted to follow up.

If you''re still thinking about the roof, I can recheck it and give you updated pricing. If not, no worries.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 4: Light follow-up
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    old_quote_template_id, 4, 12, 'friendly',
    'Following up on updated quote',
    'Hey {{first_name}},

Just following up — still happy to give you updated pricing on your roof.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 5: Direct ask
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    old_quote_template_id, 5, 16, 'professional',
    'Last call: Updated pricing on your roof',
    '{{first_name}},

Final follow-up. If you want updated pricing, reply here and I''ll recheck your roof.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 6: Soft ending
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    old_quote_template_id, 6, 20, 'simple',
    'Last note on updated quote',
    '{{first_name}},

Last note. If you want updated pricing: {{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 7: Final touch
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    old_quote_template_id, 7, 24, 'simple',
    'Closing this out',
    '{{first_name}},

Closing this out. If you need anything, just reach out.

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;
END $$;

-- =========================================================
-- 4. NEIGHBORHOOD OUTREACH TEMPLATE
-- =========================================================
DO $$
DECLARE
  neighborhood_template_id uuid;
BEGIN
  INSERT INTO campaign_templates (
    slug, name, niche, goal, description, recommended_steps,
    category, personalization_required, tone_options, recommended_list_types, promo_tag
  ) VALUES (
    'roofing-neighborhood-outreach-v2',
    'Neighborhood Outreach',
    'roofing',
    'book_estimates',
    'Build neighborhood authority. Targets geo lists, subdivision lists. Goal: Build neighborhood authority.',
    7,
    'neighborhood_outreach',
    true,
    ARRAY['urgent', 'friendly', 'professional', 'simple'],
    ARRAY['geo_lists', 'subdivision_lists'],
    'High Reply Rate'
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    is_active = true
  RETURNING id INTO neighborhood_template_id;

  IF neighborhood_template_id IS NULL THEN
    SELECT id INTO neighborhood_template_id FROM campaign_templates WHERE slug = 'roofing-neighborhood-outreach-v2';
  END IF;

  -- Step 1: Local Mention
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    neighborhood_template_id, 1, 0, 'friendly',
    'Been helping folks around {{neighborhood}}. Need anything checked?',
    'Hey {{first_name}},

We''ve been doing a lot of work in {{neighborhood}} lately — helping neighbors with roof inspections, repairs, that kind of thing.

Want me to take a quick look at yours? No pressure, just want to make sure everything''s good.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 2: Street-Level Personalization
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    neighborhood_template_id, 2, 4, 'friendly',
    'We finished some work near {{local_landmark}}',
    'Hey {{first_name}},

We just finished up some work near {{local_landmark}} — couple roofs, some repairs.

Since we''re in the area, want me to swing by and check yours? Free inspection, takes 20 minutes.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 3: Final Touch
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    neighborhood_template_id, 3, 8, 'friendly',
    'Still in the neighborhood if you need anything',
    '{{first_name}},

Still working in {{neighborhood}} this week. If you need anything checked, just let me know.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 4: Light follow-up
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    neighborhood_template_id, 4, 12, 'friendly',
    'Following up from {{neighborhood}}',
    'Hey {{first_name}},

Just following up — still offering free roof inspections in {{neighborhood}}.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 5: Direct ask
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    neighborhood_template_id, 5, 16, 'professional',
    'Last call: Free inspection in {{neighborhood}}',
    '{{first_name}},

Final follow-up. If you want a free roof inspection, reply here.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 6: Soft ending
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    neighborhood_template_id, 6, 20, 'simple',
    'Last note from {{neighborhood}}',
    '{{first_name}},

Last note. If you need anything: {{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 7: Final touch
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    neighborhood_template_id, 7, 24, 'simple',
    'Closing this out',
    '{{first_name}},

Closing this out. Reach out if you need anything.

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;
END $$;

-- =========================================================
-- 5. REPAIR SEQUENCE (LEAKING / MINOR FIXES) TEMPLATE
-- =========================================================
DO $$
DECLARE
  repair_template_id uuid;
BEGIN
  INSERT INTO campaign_templates (
    slug, name, niche, goal, description, recommended_steps,
    category, personalization_required, tone_options, recommended_list_types, promo_tag
  ) VALUES (
    'roofing-repairs-v2',
    'Repair Sequence (Leaking / Minor Fixes)',
    'roofing',
    'book_estimates',
    'Book repair visits (easy $$$). Targets repair lists, water damage lists. Goal: Book repair visits.',
    7,
    'repairs',
    true,
    ARRAY['urgent', 'friendly', 'professional', 'simple'],
    ARRAY['repair_lists', 'water_damage_lists'],
    'High Reply Rate'
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    is_active = true
  RETURNING id INTO repair_template_id;

  IF repair_template_id IS NULL THEN
    SELECT id INTO repair_template_id FROM campaign_templates WHERE slug = 'roofing-repairs-v2';
  END IF;

  -- Step 1: Identifying the Issue
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    repair_template_id, 1, 0, 'urgent',
    'Noticed a lot of repair calls in your area — need anything checked?',
    'Hey {{first_name}},

We''ve been getting a lot of repair calls in your area — leaks, missing shingles, that kind of thing.

Want me to take a quick look at your roof? Small repairs are way cheaper if you catch them early.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 2: Leak Specific
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    repair_template_id, 2, 3, 'urgent',
    'Saw rain next week in {{city}} — want it patched first?',
    '{{first_name}},

Weather forecast shows rain coming to {{city}} next week.

If you have any leaks or weak spots, now''s the time to patch them. Want me to check it out?

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 3: Reminder
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    repair_template_id, 3, 6, 'friendly',
    'We''re doing small repairs all week — want me to stop by?',
    'Hey {{first_name}},

We''re doing small repairs all week in {{city}}. If you need anything checked or patched, I can swing by.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 4: Light follow-up
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    repair_template_id, 4, 9, 'friendly',
    'Following up on repairs',
    'Hey {{first_name}},

Just following up — still doing repairs in {{city}} this week.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 5: Direct ask
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    repair_template_id, 5, 12, 'professional',
    'Last call: Small repairs in {{city}}',
    '{{first_name}},

Final follow-up. If you need any repairs, reply here.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 6: Soft ending
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    repair_template_id, 6, 15, 'simple',
    'Last note on repairs',
    '{{first_name}},

Last note. If you need repairs: {{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 7: Final touch
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    repair_template_id, 7, 18, 'simple',
    'Closing this out',
    '{{first_name}},

Closing this out. Reach out if you need anything.

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;
END $$;

-- =========================================================
-- 6. FULL ROOF REPLACEMENT SEQUENCE TEMPLATE
-- =========================================================
DO $$
DECLARE
  replacement_template_id uuid;
BEGIN
  INSERT INTO campaign_templates (
    slug, name, niche, goal, description, recommended_steps,
    category, personalization_required, tone_options, recommended_list_types, promo_tag
  ) VALUES (
    'roofing-replacements-v2',
    'Full Roof Replacement Sequence',
    'roofing',
    'book_estimates',
    'Sell full replacements (BIG $$$). Targets high-value neighborhoods, old roofs, past inquiries. Goal: Sell full replacements.',
    7,
    'replacements',
    true,
    ARRAY['urgent', 'friendly', 'professional', 'simple'],
    ARRAY['high_value_neighborhoods', 'old_roofs', 'past_inquiries'],
    'High Reply Rate'
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category,
    is_active = true
  RETURNING id INTO replacement_template_id;

  IF replacement_template_id IS NULL THEN
    SELECT id INTO replacement_template_id FROM campaign_templates WHERE slug = 'roofing-replacements-v2';
  END IF;

  -- Step 1: Roof Age Guess
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    replacement_template_id, 1, 0, 'professional',
    'Your roof is likely {{roof_age_guess}} — want me to check it?',
    'Hey {{first_name}},

Based on your address, your roof is likely around {{roof_age_guess}} years old. Most roofs need replacement around 20-25 years.

Want me to take a look and give you an honest assessment? No pressure — just want to make sure you know where things stand.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 2: Comparative Line
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    replacement_template_id, 2, 4, 'friendly',
    'We''re replacing a few roofs in {{neighborhood}}',
    'Hey {{first_name}},

We''re doing a few full roof replacements in {{neighborhood}} this month.

If yours is getting up there in age, might be worth taking a look. I can give you an honest assessment and pricing.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 3: Offer a visit
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    replacement_template_id, 3, 8, 'professional',
    'Want me to take a look this week?',
    '{{first_name}},

If you''re thinking about a roof replacement, I can take a look this week and give you an honest assessment.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 4: Light follow-up
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    replacement_template_id, 4, 12, 'friendly',
    'Following up on roof replacement',
    'Hey {{first_name}},

Just following up — still happy to take a look at your roof and give you an assessment.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 5: Direct ask
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    replacement_template_id, 5, 16, 'professional',
    'Last call: Free roof assessment',
    '{{first_name}},

Final follow-up. If you want me to take a look at your roof, reply here.

{{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 6: Soft ending
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    replacement_template_id, 6, 20, 'simple',
    'Last note on roof assessment',
    '{{first_name}},

Last note. If you want an assessment: {{booking_link}}

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;

  -- Step 7: Final touch
  INSERT INTO campaign_template_steps (template_id, step_order, delay_days, tone, subject_template, body_template)
  VALUES (
    replacement_template_id, 7, 24, 'simple',
    'Closing this out',
    '{{first_name}},

Closing this out. Reach out if you need anything.

{{company_name}}'
  )
  ON CONFLICT (template_id, step_order) DO UPDATE SET
    subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    tone = EXCLUDED.tone;
END $$;

-- Comments
COMMENT ON COLUMN campaign_templates.category IS 'Template category: storm_damage, insurance_claims, old_quotes, neighborhood_outreach, repairs, replacements, seasonal';
COMMENT ON COLUMN campaign_templates.tone_options IS 'Available tone variants: urgent, friendly, professional, simple';
COMMENT ON COLUMN campaign_templates.recommended_list_types IS 'Recommended list types for this template';
COMMENT ON COLUMN campaign_template_steps.tone IS 'Tone variant for this step: urgent, friendly, professional, simple, default';





















































