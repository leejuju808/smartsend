-- =========================================================
-- Block 10400 — SmartSend Roofing Campaign Builder v1
-- (The First Campaign Template That Prints Roofing Leads Fast)
-- =========================================================

-- This is the centerpiece of the entire product.
-- This is what makes roofers say: "Holy shit… this thing works."

-- ============================================================================
-- 1. CREATE THE ROOFING CAMPAIGN TEMPLATE
-- ============================================================================

-- Insert the SmartSend Roofing Campaign Builder v1 template
-- This campaign has 3 messages only. Not 8. Not 12. Roofers want simple.
DO $$
DECLARE
  roofing_template_id uuid;
BEGIN
  -- Insert or update the template
  INSERT INTO campaign_templates (
    slug,
    name,
    niche,
    goal,
    description,
    recommended_steps,
    is_active
  )
  VALUES (
    'smartsend-roofing-campaign-builder-v1',
    'SmartSend Roofing Campaign Builder v1',
    'roofing',
    'book_estimates',
    'The first roofing outreach campaign template inside SmartSend — the one that gets homeowners to reply FAST. Simple 3-message sequence that converts.',
    3,
    true
  )
  ON CONFLICT (slug) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    recommended_steps = excluded.recommended_steps,
    is_active = true
  RETURNING id INTO roofing_template_id;

  -- Get template ID if it already exists
  IF roofing_template_id IS NULL THEN
    SELECT id INTO roofing_template_id 
    FROM campaign_templates 
    WHERE slug = 'smartsend-roofing-campaign-builder-v1';
  END IF;

  -- Delete existing steps to ensure clean slate
  DELETE FROM campaign_template_steps WHERE template_id = roofing_template_id;

  -- ============================================================================
  -- 2. MESSAGE 1 — Initial Outreach
  -- ============================================================================
  -- Subject: Quick question about your roof
  -- Short. Local. Zero fluff. This gets replies instantly.
  INSERT INTO campaign_template_steps (
    template_id,
    step_order,
    delay_days,
    subject_template,
    body_template
  )
  VALUES (
    roofing_template_id,
    1,
    0, -- Send immediately
    'Quick question about your roof',
    'Hey {{first_name}},

We''re helping homeowners in {{city}} with repairs and inspections before winter hits.

Are you needing any roof work done at your place?'
  );

  -- ============================================================================
  -- 3. MESSAGE 2 — Follow-Up (No Response After 2 Days)
  -- ============================================================================
  -- Subject: Still needing roof help?
  -- Pushes urgency. Roofers LOVE this because they always say "We can squeeze them in."
  INSERT INTO campaign_template_steps (
    template_id,
    step_order,
    delay_days,
    subject_template,
    body_template
  )
  VALUES (
    roofing_template_id,
    2,
    2, -- 2 days after Message 1
    'Still needing roof help?',
    'Just checking in — are you looking at a repair or inspection soon?

We''ve got a slot open this week if you need it.'
  );

  -- ============================================================================
  -- 4. MESSAGE 3 — Final Nudge (No Response After 4 Days)
  -- ============================================================================
  -- Subject: Before I close this out…
  -- Uses 1-word CTA. Converts the silent homeowners. Makes the roofer see REAL results.
  INSERT INTO campaign_template_steps (
    template_id,
    step_order,
    delay_days,
    subject_template,
    body_template
  )
  VALUES (
    roofing_template_id,
    3,
    2, -- 2 days after Message 2 (4 days total after Message 1)
    'Before I close this out…',
    'I don''t want to bug you — just making sure you''re taken care of.

If you need a leak fixed or want someone to check the roof, just reply ''estimate'' and I''ll set it up.'
  );

END $$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE campaign_templates IS 'Pre-built campaign templates for instant setup';
COMMENT ON TABLE campaign_template_steps IS 'Individual email steps within a campaign template';

-- Template Notes:
-- This template follows the SmartSend Roofing Campaign Builder v1 blueprint:
-- 1. Simple 3-message sequence (not 8, not 12)
-- 2. Short, direct messages (never more than 3 sentences)
-- 3. Local personalization (uses {{city}} placeholder)
-- 4. Blue-collar tone (direct, no corporate speak)
-- 5. Auto-follow-up logic: 0, 2, 4 days
-- 6. Behavior triggers handled by system:
--    - If homeowner replies → stop sequence immediately
--    - If homeowner shows intent → classify (Warm/Hot/Not Interested)

