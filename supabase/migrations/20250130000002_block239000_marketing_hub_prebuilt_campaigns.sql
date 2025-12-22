-- =========================================================
-- Block 239000 — Marketing Hub v1 Pre-Built Campaign Templates
-- =========================================================
-- 
-- These are the pre-built campaigns that roofers can import instantly.
-- They're marked as templates (is_template = true) so they can be copied.
-- =========================================================

-- ============================================================================
-- CAMPAIGN #1 — Review Request (Google + Yelp)
-- ============================================================================
-- Trigger: job_completed
-- Steps: SMS immediately, Email 24h later, SMS 3 days later

DO $$
DECLARE
  v_campaign_id uuid;
BEGIN
  -- Note: This creates a template campaign that can be imported by workspaces
  -- In practice, workspaces will copy these templates when they import them
  
  -- This will be handled by application code that creates campaigns per workspace
  -- when users click "Import Template" in the UI
  
  -- For now, we'll create a function that can be called to seed templates
  NULL;
END $$;

-- Function to create pre-built campaign templates for a workspace
CREATE OR REPLACE FUNCTION public.seed_marketing_campaign_templates(
  p_workspace_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_review_campaign_id uuid;
  v_referral_campaign_id uuid;
  v_upsell_campaign_id uuid;
  v_warranty_campaign_id uuid;
  v_reactivation_campaign_id uuid;
BEGIN
  -- ============================================================
  -- CAMPAIGN #1 — Review Request (Google + Yelp)
  -- ============================================================
  INSERT INTO public.marketing_campaigns (
    workspace_id,
    name,
    type,
    status,
    trigger_type,
    trigger_config,
    is_template,
    is_ai_generated
  ) VALUES (
    p_workspace_id,
    'Review Request - Google + Yelp',
    'review',
    'active',
    'job_completed',
    '{}'::jsonb,
    false, -- Not a template, this is the actual campaign
    false
  )
  RETURNING id INTO v_review_campaign_id;
  
  -- Step 1: SMS at job completion
  INSERT INTO public.marketing_steps (
    campaign_id,
    step_order,
    delay_hours,
    channel,
    content
  ) VALUES (
    v_review_campaign_id,
    1,
    0,
    'sms',
    'Thanks again for choosing us! Mind leaving a quick review? It really helps other homeowners find us. [Google Review Link] [Yelp Review Link]'
  );
  
  -- Step 2: Email 24 hours later
  INSERT INTO public.marketing_steps (
    campaign_id,
    step_order,
    delay_hours,
    channel,
    subject,
    content
  ) VALUES (
    v_review_campaign_id,
    2,
    24,
    'email',
    'Your feedback helps homeowners choose us!',
    'Hi {{FIRST_NAME}},

Thanks again for choosing us for your roofing project. We''d love to hear about your experience!

Your feedback helps other homeowners make informed decisions. If you have a moment, please leave us a review:

[Google Review Link]
[Yelp Review Link]

We truly appreciate your time!

Best,
The Team'
  );
  
  -- Step 3: SMS 3 days later (72 hours from start, so 48 hours after step 2)
  INSERT INTO public.marketing_steps (
    campaign_id,
    step_order,
    delay_hours,
    channel,
    content
  ) VALUES (
    v_review_campaign_id,
    3,
    48,
    'sms',
    'Still need your help 🙏 Here''s the review link: [Google Review Link]'
  );
  
  -- ============================================================
  -- CAMPAIGN #2 — Referral Request
  -- ============================================================
  INSERT INTO public.marketing_campaigns (
    workspace_id,
    name,
    type,
    status,
    trigger_type,
    trigger_config,
    is_template,
    is_ai_generated
  ) VALUES (
    p_workspace_id,
    'Referral Request Campaign',
    'referral',
    'active',
    'job_completed',
    '{"delay_days": 7}'::jsonb,
    false,
    false
  )
  RETURNING id INTO v_referral_campaign_id;
  
  -- Step 1: SMS with referral offer
  INSERT INTO public.marketing_steps (
    campaign_id,
    step_order,
    delay_hours,
    channel,
    content
  ) VALUES (
    v_referral_campaign_id,
    1,
    168, -- 7 days after job completion
    'sms',
    'If you refer a friend who gets a roof, we''ll give you a $200 gift card! Here''s your referral link: [Referral Link]'
  );
  
  -- Step 2: Email with referral tracking
  INSERT INTO public.marketing_steps (
    campaign_id,
    step_order,
    delay_hours,
    channel,
    subject,
    content
  ) VALUES (
    v_referral_campaign_id,
    2,
    24, -- 24 hours after SMS
    'email',
    'Earn $200 for Every Referral',
    'Hi {{FIRST_NAME}},

We''re so grateful you chose us for your roofing project!

Know anyone else who needs a new roof or repair? For every friend you refer who becomes a customer, we''ll send you a $200 gift card.

Your personal referral link: [Referral Link]

Thanks for helping us grow!

Best,
The Team'
  );
  
  -- Step 3: Follow-up SMS 30 days later
  INSERT INTO public.marketing_steps (
    campaign_id,
    step_order,
    delay_hours,
    channel,
    content
  ) VALUES (
    v_referral_campaign_id,
    3,
    720, -- 30 days after step 2
    'sms',
    'Know anyone needing a new roof or repair? Share your referral link and earn $200: [Referral Link]'
  );
  
  -- ============================================================
  -- CAMPAIGN #3 — Upsell: Gutter Guards
  -- ============================================================
  INSERT INTO public.marketing_campaigns (
    workspace_id,
    name,
    type,
    status,
    trigger_type,
    trigger_config,
    is_template,
    is_ai_generated
  ) VALUES (
    p_workspace_id,
    'Gutter Guard Upsell',
    'upsell',
    'active',
    'job_completed',
    '{"job_type": "roof_replacement"}'::jsonb,
    false,
    false
  )
  RETURNING id INTO v_upsell_campaign_id;
  
  -- Step 1: Email about gutter guards
  INSERT INTO public.marketing_steps (
    campaign_id,
    step_order,
    delay_hours,
    channel,
    subject,
    content
  ) VALUES (
    v_upsell_campaign_id,
    1,
    336, -- 14 days after job completion
    'email',
    'Protect Your New Roof for 20+ Years',
    'Hi {{FIRST_NAME}},

Since you just replaced your roof, now is the perfect time to protect it with gutter guards.

Gutter guards prevent clogs, reduce maintenance, and protect your new roof investment for the next 20+ years.

We''re offering a special discount for recent customers. Interested in a free estimate?

Reply to this email or call us at [PHONE_NUMBER].

Best,
The Team'
  );
  
  -- Step 2: SMS follow-up
  INSERT INTO public.marketing_steps (
    campaign_id,
    step_order,
    delay_hours,
    channel,
    content
  ) VALUES (
    v_upsell_campaign_id,
    2,
    72, -- 3 days after email
    'sms',
    'Protect your new roof with gutter guards! Special pricing for recent customers. Interested? Reply YES or call [PHONE_NUMBER]'
  );
  
  -- ============================================================
  -- CAMPAIGN #4 — Warranty Check / Tune-Up
  -- ============================================================
  INSERT INTO public.marketing_campaigns (
    workspace_id,
    name,
    type,
    status,
    trigger_type,
    trigger_config,
    is_template,
    is_ai_generated
  ) VALUES (
    p_workspace_id,
    '6-Month Warranty Check',
    'warranty',
    'active',
    'time_delay',
    '{"delay_months": 6}'::jsonb,
    false,
    false
  )
  RETURNING id INTO v_warranty_campaign_id;
  
  -- Step 1: Email about warranty check
  INSERT INTO public.marketing_steps (
    campaign_id,
    step_order,
    delay_hours,
    channel,
    subject,
    content
  ) VALUES (
    v_warranty_campaign_id,
    1,
    0, -- Triggered 6 months after job completion
    'email',
    'Time for Your 6-Month Roof Health Check',
    'Hi {{FIRST_NAME}},

It''s been 6 months since we completed your roofing project, and we want to make sure everything is still perfect!

We''re offering a FREE 6-month roof health check. Our team will inspect your roof, check for any issues, and ensure your warranty is in good standing.

Schedule your free inspection: [Schedule Link]

Or reply to this email and we''ll set it up.

Best,
The Team'
  );
  
  -- ============================================================
  -- CAMPAIGN #5 — Lead Reactivation
  -- ============================================================
  INSERT INTO public.marketing_campaigns (
    workspace_id,
    name,
    type,
    status,
    trigger_type,
    trigger_config,
    is_template,
    is_ai_generated
  ) VALUES (
    p_workspace_id,
    'Lead Reactivation - 30 Days Inactive',
    'reactivation',
    'active',
    'lead_inactive',
    '{"inactive_days": 30}'::jsonb,
    false,
    false
  )
  RETURNING id INTO v_reactivation_campaign_id;
  
  -- Step 1: SMS check-in
  INSERT INTO public.marketing_steps (
    campaign_id,
    step_order,
    delay_hours,
    channel,
    content
  ) VALUES (
    v_reactivation_campaign_id,
    1,
    0,
    'sms',
    'Hi {{FIRST_NAME}}, we haven''t heard from you in a while. Still interested in your roofing project? We''re here to help! Reply or call [PHONE_NUMBER]'
  );
  
  -- Step 2: Email with offer
  INSERT INTO public.marketing_steps (
    campaign_id,
    step_order,
    delay_hours,
    channel,
    subject,
    content
  ) VALUES (
    v_reactivation_campaign_id,
    2,
    24,
    'email',
    'Special Offer - Let''s Get Your Project Started',
    'Hi {{FIRST_NAME}},

We noticed we haven''t connected in a while. We''d love to help you move forward with your roofing project!

As a special offer, we''re offering [DISCOUNT_OFFER] for projects started this month.

Ready to get started? Reply to this email or call us at [PHONE_NUMBER].

Best,
The Team'
  );
  
  -- Step 3: Final SMS with discount
  INSERT INTO public.marketing_steps (
    campaign_id,
    step_order,
    delay_hours,
    channel,
    content
  ) VALUES (
    v_reactivation_campaign_id,
    3,
    72, -- 3 days after email
    'sms',
    'Last chance! Special [DISCOUNT_OFFER] expires soon. Call [PHONE_NUMBER] to claim it.'
  );
  
END;
$$;

COMMENT ON FUNCTION public.seed_marketing_campaign_templates IS 'Seeds pre-built marketing campaign templates for a workspace (Block 239000)';

























