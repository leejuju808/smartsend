-- Block 489 — AI Smart Template Rewriter v1
-- Email Templates Table for AI-powered follow-up rewriting

CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NULL,                      -- null = global
  template_key TEXT NOT NULL,            -- e.g. 'answer_questions', 'confirm_meeting'
  label TEXT NOT NULL,                   -- human label
  base_subject TEXT NOT NULL,
  base_body TEXT NOT NULL,
  use_ai_rewriter BOOLEAN NOT NULL DEFAULT TRUE,
  tone TEXT NOT NULL DEFAULT 'neutral',  -- 'neutral' | 'casual' | 'formal'
  language TEXT NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- unique per org + key
CREATE UNIQUE INDEX IF NOT EXISTS email_templates_org_key_idx
ON email_templates (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), template_key);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_email_templates_template_key ON email_templates(template_key);
CREATE INDEX IF NOT EXISTS idx_email_templates_org_id ON email_templates(org_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_email_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_email_templates_updated_at
BEFORE UPDATE ON email_templates
FOR EACH ROW
EXECUTE FUNCTION update_email_templates_updated_at();

-- Enable RLS
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies: allow service role full access, authenticated users can read templates
CREATE POLICY "email_templates_service_role_all" ON email_templates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Allow authenticated users to read templates (org-specific access can be enforced at application level)
CREATE POLICY "email_templates_select_authenticated" ON email_templates
  FOR SELECT TO authenticated
  USING (true);

-- Seed default templates
INSERT INTO email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone)
VALUES
  ('00000000-0000-0000-0000-000000000000'::uuid, 'answer_questions',
    'Answer questions',
    'Re: {{ORIGINAL_SUBJECT}}',
'Hey {{FIRST_NAME}},

Thanks for the thoughtful questions — I added some quick answers below and kept it as short as possible.

{{ANSWER_SECTION}}

If it''s helpful, we can also do a quick 15–20 minute call so I can walk you through everything live.

Best,
{{SENDER_NAME}}',
    TRUE, 'neutral'),

  ('00000000-0000-0000-0000-000000000000'::uuid, 'check_back_later',
    'Check back later',
    'Quick check-in',
'Hey {{FIRST_NAME}},

Last time we spoke, timing wasn''t ideal — totally get it.

Just checking back in like we discussed to see if it makes sense to revisit how {{PRODUCT}} can help with {{VALUE_PROP}}.

If it''s still not a priority, no worries at all — just let me know and I''ll close the loop on my side.

Best,
{{SENDER_NAME}}',
    TRUE, 'neutral'),

  ('00000000-0000-0000-0000-000000000000'::uuid, 'nudge_to_meeting',
    'Nudge to meeting',
    'Worth a quick 15-min chat?',
'Hey {{FIRST_NAME}},

Rather than a long email chain, how about a quick 15–20 minute call where I can show you exactly how {{PRODUCT}} is working for teams like yours?

Totally fine if now isn''t the right time — just wanted to make it easy if it is.

Best,
{{SENDER_NAME}}',
    TRUE, 'neutral'),

  ('00000000-0000-0000-0000-000000000000'::uuid, 'confirm_meeting',
    'Confirm meeting',
    'Re: scheduling time',
'Hey {{FIRST_NAME}},

Glad you''re up for a call.

Here are a few times that usually work on my side:

{{MEETING_SLOTS}}

If none of these work, feel free to send a couple windows that are better for you and I''ll lock one in.

Looking forward to it,
{{SENDER_NAME}}',
    TRUE, 'neutral'),

  ('00000000-0000-0000-0000-000000000000'::uuid, 'unsubscribe_ack',
    'Unsubscribe ack',
    'You''re all set — removed from our list',
'Hey {{FIRST_NAME}},

Got it — I''ve removed you from future emails.

Wishing you and the team all the best,
{{SENDER_NAME}}',
    FALSE, 'neutral'),

  ('00000000-0000-0000-0000-000000000000'::uuid, 'no_followup',
    'No follow-up',
    'Re: {{ORIGINAL_SUBJECT}}',
'Hey {{FIRST_NAME}},

Thanks for letting me know — I''ll close the loop on my side.

All the best,
{{SENDER_NAME}}',
    FALSE, 'neutral'),

  -- Block 21706 — SmartSend Follow-Up Email Templates (Roofing Edition, High-Conversion)
  -- Follow-Up #1 — 48 Hours (Soft Remind)
  ('00000000-0000-0000-0000-000000000000'::uuid, 'followup_48h',
    'Follow-Up #1 — 48 Hours (Soft Remind)',
    'Quick follow-up',
'Hey {{first_name}}, just wanted to circle back in case my last message got buried.

If you still need someone to take a look at your roof, I can get you a free estimate this week.

No pressure — just reply here and I''ll get you on the schedule.

– {{sender_name}}',
    TRUE, 'casual'),

  -- Follow-Up #2 — 4 Days (Authority + Value)
  ('00000000-0000-0000-0000-000000000000'::uuid, 'followup_4d',
    'Follow-Up #2 — 4 Days (Authority + Value)',
    'Still need help with your roof?',
'Hi {{first_name}},

Wanted to check in — we''ve been helping a lot of homeowners in {{city}} with {{seasonal_issue}} (leaks, wind damage, missing shingles).

If you''d like, I can swing by for a quick inspection and give you a straightforward quote.
Takes about 10–15 minutes.

Would tomorrow or Thursday work for you?

– {{sender_name}}',
    TRUE, 'casual'),

  -- Follow-Up #3 — 7 Days (Short + Direct)
  ('00000000-0000-0000-0000-000000000000'::uuid, 'followup_7d',
    'Follow-Up #3 — 7 Days (Short + Direct)',
    'Should I close your file?',
'Hey {{first_name}},

Did you still want a quote for the roof?

Totally fine either way — I just don''t want to bother you if you''ve already handled it.

Let me know and I''ll update my notes.

– {{sender_name}}',
    TRUE, 'casual'),

  -- Follow-Up #4 — 14 Days (Final Touch / Opt-Out Safe)
  ('00000000-0000-0000-0000-000000000000'::uuid, 'followup_14d',
    'Follow-Up #4 — 14 Days (Final Touch / Opt-Out Safe)',
    'Last check-in',
'Hi {{first_name}},

This will be my last follow-up — if you still need help with the roof, I''m happy to take a look.

If not, just ignore this and I''ll close things out on my end.

All the best,
{{sender_name}}',
    TRUE, 'casual'),

  -- Bonus Automation: Warm Lead Reply → Auto-Send Booking Link
  ('00000000-0000-0000-0000-000000000000'::uuid, 'warm_lead_booking',
    'Warm Lead Reply — Auto-Send Booking Link',
    'Perfect — let''s get you booked',
'Thanks for getting back to me, {{first_name}}!

Here''s the link to pick a time that works best for you:

{{booking_link}}

Let me know if you need anything else at all.',
    TRUE, 'casual'),

  -- Bonus Automation: Hot Lead → Instant Response Template
  ('00000000-0000-0000-0000-000000000000'::uuid, 'hot_lead_response',
    'Hot Lead — Instant Response Template',
    'Got you — let''s get this done',
'Great news, {{first_name}} — we can take care of that for you.

I can get someone out today or tomorrow to take a look and get you a quote.

Which time works best?',
    TRUE, 'casual'),

  -- Bonus Automation: Not Interested → Respectful Close-Out
  ('00000000-0000-0000-0000-000000000000'::uuid, 'not_interested_closeout',
    'Not Interested — Respectful Close-Out',
    'Thanks for letting me know',
'No problem at all, {{first_name}} — I''ll close this out for you.

If anything changes, just reach out anytime.

Have a great day!',
    FALSE, 'casual'),

  -- Block 24460 — Payment Reminder Templates
  -- Deposit Reminder
  ('00000000-0000-0000-0000-000000000000'::uuid, 'deposit_reminder',
    'Deposit Reminder',
    'Just a reminder — deposit for your project',
'Hey {{first_name}},

Just a reminder — the deposit for your project is still outstanding.

Once received, we''ll secure your spot on the schedule!

Amount due: {{amount}}
Due date: {{due_date}}

You can pay by check, card, or bank transfer. Let me know if you have any questions.

Thanks,
{{sender_name}}',
    TRUE, 'casual'),

  -- ACV Check Reminder
  ('00000000-0000-0000-0000-000000000000'::uuid, 'acv_check_reminder',
    'ACV Check Reminder',
    'Any update on the ACV check?',
'Hey {{first_name}},

Any update from your insurance company on the ACV check?

We can help if the adjuster needs documentation or if there are any delays.

Expected amount: {{amount}}

Let me know if you need anything!

Thanks,
{{sender_name}}',
    TRUE, 'casual'),

  -- Depreciation Reminder
  ('00000000-0000-0000-0000-000000000000'::uuid, 'depreciation_reminder',
    'Depreciation Check Reminder',
    'Depreciation check reminder',
'Hey {{first_name}},

Just checking in on the depreciation check from your insurance company.

This is the final portion of your claim payment and we want to make sure you receive it.

Expected amount: {{amount}}

If you need help following up with your adjuster, let me know!

Thanks,
{{sender_name}}',
    TRUE, 'casual'),

  -- Final Invoice Reminder
  ('00000000-0000-0000-0000-000000000000'::uuid, 'final_invoice_reminder',
    'Final Invoice Reminder',
    'Hope you''re loving the new roof!',
'Hey {{first_name}},

Hope you''re loving the new roof!

Your final invoice is attached. Let us know if you have any questions.

Amount due: {{amount}}
Due date: {{due_date}}

Thanks for choosing us!

{{sender_name}}',
    TRUE, 'casual'),

  -- Block 25140 — Homeowner Experience v1 Templates
  -- Inspection Booked
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_inspection_booked',
    'Homeowner: Inspection Booked',
    'Your roof inspection is scheduled',
'Hi {{first_name}},

Your roof inspection is scheduled for {{inspector_name}} at {{inspection_time}} on {{inspection_date}}.

You''ll receive a reminder the day before. Reply anytime with questions.

{{sender_name}}',
    TRUE, 'casual'),

  -- Day-Before Reminder
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_day_before_reminder',
    'Homeowner: Day-Before Reminder',
    'We''re coming tomorrow for your inspection',
'Hi {{first_name}},

We''re coming tomorrow for your inspection. You''ll get the inspector''s name and photo in the morning.

See you then!

{{sender_name}}',
    TRUE, 'casual'),

  -- After Inspection
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_after_inspection',
    'Homeowner: After Inspection',
    'Thanks for meeting us today',
'Hi {{first_name}},

Thanks for meeting us today. Your quote will be ready soon. Reply anytime if you have questions about the findings.

{{sender_name}}',
    TRUE, 'casual'),

  -- Quote Sent
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_quote_sent',
    'Homeowner: Quote Sent',
    'Your roof replacement estimate is ready',
'Hi {{first_name}},

Your roof replacement estimate is ready. Want us to walk you through it?

{{quote_link}}

{{sender_name}}',
    TRUE, 'casual'),

  -- Job Approved
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_job_approved',
    'Homeowner: Job Approved',
    'Great choice! We''ll guide you through every step',
'Hi {{first_name}},

Great choice! We''ll guide you through every step.

First step: deposit. Second step: scheduling.

Here''s what happens next: {{next_steps}}

{{sender_name}}',
    TRUE, 'casual'),

  -- Install Morning (Crew On Way)
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_install_morning',
    'Homeowner: Install Morning',
    'Crew is on the way',
'Hi {{first_name}},

Crew is on the way. Expected arrival: {{arrival_time}}.

Your project manager is {{project_manager_name}}. Reply if you need anything.

{{sender_name}}',
    TRUE, 'casual'),

  -- Install Midday Update
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_install_midday',
    'Homeowner: Install Midday Update',
    'We''re halfway done',
'Hi {{first_name}},

We''re halfway done. Everything on track.

{{sender_name}}',
    TRUE, 'casual'),

  -- Install Completion
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_install_completion',
    'Homeowner: Install Completion',
    'Your new roof is installed!',
'Hi {{first_name}},

Your new roof is installed! Crew is cleaning up now.

Final invoice + warranty info coming shortly.

{{sender_name}}',
    TRUE, 'casual'),

  -- Cleanup Checklist
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_cleanup_checklist',
    'Homeowner: Cleanup Checklist',
    'Crew is completing cleanup',
'Hi {{first_name}},

Crew is completing cleanup. Check your driveway and yard — let us know if anything looks off.

{{sender_name}}',
    TRUE, 'casual'),

  -- Warranty + Final Photos
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_warranty_delivered',
    'Homeowner: Warranty Delivered',
    'Your warranty is ready',
'Hi {{first_name}},

Your warranty is ready. Here are photos of your new roof!

{{warranty_link}}
{{photo_gallery_link}}

{{sender_name}}',
    TRUE, 'casual'),

  -- Review Request
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_review_request',
    'Homeowner: Review Request',
    'We''d love to hear how we did',
'Hi {{first_name}},

We''d love to hear how we did. Reviews help local homeowners choose trusted companies.

{{google_review_link}}
{{facebook_review_link}}
{{bbb_review_link}}

Thanks!

{{sender_name}}',
    TRUE, 'casual'),

  -- Insurance: ACV Explanation
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_insurance_acv_explanation',
    'Homeowner: Insurance ACV Explanation',
    'Here''s what insurance covers',
'Hi {{first_name}},

Here''s what insurance covers:

ACV (Actual Cash Value): {{acv_amount}} — This is what you receive first.

Depreciation: {{depreciation_amount}} — This comes after work is complete.

Total Coverage: {{total_coverage}}

Here''s what you pay: {{homeowner_portion}}

{{sender_name}}',
    TRUE, 'casual'),

  -- Insurance: Depreciation Timeline
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_insurance_depreciation_timeline',
    'Homeowner: Insurance Depreciation Timeline',
    'Depreciation check timeline',
'Hi {{first_name}},

Here''s when you''ll receive your depreciation check:

- After work is complete: We submit final documentation
- Insurance reviews: Usually 7-14 days
- Check issued: You''ll receive {{depreciation_amount}}

We''re handling all documentation for you.

{{sender_name}}',
    TRUE, 'casual'),

  -- Insurance: Supplement Process
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_insurance_supplement_process',
    'Homeowner: Insurance Supplement Process',
    'Supplement process explained',
'Hi {{first_name}},

We found additional damage during installation. Here''s what happens next:

1. We document the damage
2. We submit a supplement to your insurance
3. Insurance reviews (usually 7-14 days)
4. You receive the additional payment

We''re handling all of this for you.

{{sender_name}}',
    TRUE, 'casual'),

  -- Insurance: Adjuster Prep
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_insurance_adjuster_prep',
    'Homeowner: Insurance Adjuster Prep',
    'Preparing for your adjuster appointment',
'Hi {{first_name}},

Your adjuster appointment is scheduled for {{adjuster_date}} at {{adjuster_time}}.

Here''s what to expect:
- Adjuster will inspect the roof
- We''ll be there to point out damage
- Adjuster will write an estimate
- We''ll review it together

We''re handling all documentation for you.

{{sender_name}}',
    TRUE, 'casual'),

  -- Insurance: Check Issuance
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_insurance_check_issuance',
    'Homeowner: Insurance Check Issuance',
    'How checks get issued',
'Hi {{first_name}},

Here''s how insurance checks get issued:

1. ACV Check: {{acv_amount}} — Usually arrives first
2. Depreciation Check: {{depreciation_amount}} — After work is complete
3. Supplement Checks: If additional damage is found

We''ll let you know as soon as each check is issued.

{{sender_name}}',
    TRUE, 'casual'),

  -- Block 25180 — Job Completion Engine v1 Templates
  -- Final Invoice Sent
  ('00000000-0000-0000-0000-000000000000'::uuid, 'completion_final_invoice_sent',
    'Completion: Final Invoice Sent',
    'Congrats — your new roof is complete!',
'Hi {{first_name}},

Congrats — your new roof is complete! Your final invoice is attached.

Amount due: {{amount}}
Due date: {{due_date}}

You can pay by:
- ACH transfer: {{ach_instructions}}
- Credit card: {{payment_link}}
- Check: {{check_instructions}}

If you have any questions, just reply here.

Thanks for choosing us!

{{sender_name}}',
    TRUE, 'casual'),

  -- Cleanup Confirmation Request
  ('00000000-0000-0000-0000-000000000000'::uuid, 'completion_cleanup_confirmation',
    'Completion: Cleanup Confirmation Request',
    'Please check your property',
'Hi {{first_name}},

Our crew has completed cleanup. Please take a look around your home — if anything looks off, reply here and we''ll fix it ASAP.

We swept for nails, rolled magnets, cleaned the driveway and yard, and cleared gutters.

If everything looks good, no need to reply — we''ll proceed with final steps.

Thanks!

{{sender_name}}',
    TRUE, 'casual'),

  -- Referral Request
  ('00000000-0000-0000-0000-000000000000'::uuid, 'completion_referral_request',
    'Completion: Referral Request',
    'Know someone who needs roof help?',
'Hi {{first_name}},

If you know a neighbor, friend, or family member who needs help with their roof, we''d love to help them too. Referrals mean a lot to us!

{{referral_reward_text}}

Just reply with their name and contact info, or have them mention your name when they reach out.

Thanks for being an amazing customer!

{{sender_name}}',
    TRUE, 'casual'),

  -- Block 25700 — Homeowner Experience Engine v1 Templates
  -- A. Lead Stage
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_lead_stage',
    'Homeowner: Lead Stage',
    'Thanks for reaching out — here''s what happens next',
'Hi {{first_name}},

Thanks for reaching out about your roof. Here''s what happens next:

1. We''ll schedule a free inspection
2. Our inspector will assess your roof
3. You''ll receive a detailed quote
4. We''ll answer any questions you have

We''ll be in touch soon to schedule your inspection.

{{sender_name}}',
    TRUE, 'casual'),

  -- B. Pre-Inspection
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_pre_inspection',
    'Homeowner: Pre-Inspection',
    'Your roofing inspection is scheduled for tomorrow',
'Hi {{first_name}},

Your roofing inspection is scheduled for tomorrow at {{inspection_time}}.

Your inspector is {{inspector_name}}. They''ll assess your roof and answer any questions you have.

See you tomorrow!

{{sender_name}}',
    TRUE, 'casual'),

  -- F. Material Delivery Reminder
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_material_delivery_reminder',
    'Homeowner: Material Delivery Reminder',
    'Materials will be delivered tomorrow',
'Hi {{first_name}},

Materials will be delivered tomorrow between {{delivery_window_start}} and {{delivery_window_end}}.

Please move vehicles from the driveway to ensure clear access.

Thanks!

{{sender_name}}',
    TRUE, 'casual'),

  -- H. Final Invoice
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_final_invoice',
    'Homeowner: Final Invoice',
    'Your final invoice is ready',
'Hi {{first_name}},

Your final invoice is ready. Thank you for trusting us with your roof replacement.

Amount due: {{amount}}
Due date: {{due_date}}

{{payment_link}}

If you have any questions, just reply here.

Thanks for choosing us!

{{sender_name}}',
    TRUE, 'casual'),

  -- Trust Messaging Templates
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_trust_tarp_landscaping',
    'Homeowner: Trust — Tarp Landscaping',
    'We protect your landscaping',
'Hi {{first_name}},

Just wanted to let you know — we always tarp your landscaping before tear-off to protect your plants and yard.

Your property will be protected throughout the entire process.

{{sender_name}}',
    TRUE, 'casual'),

  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_trust_magnet_collection',
    'Homeowner: Trust — Magnet Collection',
    'We collect every nail',
'Hi {{first_name}},

Our crew will walk the entire property with a magnet to collect nails after installation.

We guarantee a clean property when we''re done.

{{sender_name}}',
    TRUE, 'casual'),

  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_trust_certified_suppliers',
    'Homeowner: Trust — Certified Suppliers',
    'All materials from certified suppliers',
'Hi {{first_name}},

All materials come from certified suppliers and meet industry standards.

You''re getting quality materials installed by professionals.

{{sender_name}}',
    TRUE, 'casual'),

  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_trust_warranty_registered',
    'Homeowner: Trust — Warranty Registered',
    'Your warranty is registered automatically',
'Hi {{first_name}},

Your warranty is registered automatically — no action needed on your part.

You''ll receive all warranty documents in your homeowner portal.

{{sender_name}}',
    TRUE, 'casual'),

  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_trust_certified_professionals',
    'Homeowner: Trust — Certified Professionals',
    'Your roof is installed by certified professionals',
'Hi {{first_name}},

Your roof is installed by certified professionals with years of experience.

We stand behind our work with a full warranty.

{{sender_name}}',
    TRUE, 'casual'),

  -- Education Templates
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_education_roofing_process',
    'Homeowner: Education — Roofing Process',
    'Here''s how the roofing process works',
'Hi {{first_name}},

Here''s how the roofing process works:

1. Inspection — We assess your roof
2. Quote — You receive a detailed estimate
3. Approval — You approve the work
4. Materials — Materials are delivered
5. Installation — Our crew installs your new roof
6. Cleanup — We clean up everything
7. Warranty — You receive warranty documents

We''ll guide you through every step.

{{sender_name}}',
    TRUE, 'casual'),

  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_education_tear_off',
    'Homeowner: Education — Tear-Off Explained',
    'What "tear-off" means',
'Hi {{first_name}},

"Tear-off" means we remove your old roof before installing the new one.

This ensures:
- No hidden damage underneath
- Proper installation
- Full warranty coverage

It''s noisy but necessary for a quality installation.

{{sender_name}}',
    TRUE, 'casual'),

  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_education_underlayment',
    'Homeowner: Education — Underlayment Explained',
    'What underlayment does',
'Hi {{first_name}},

Underlayment is a protective layer between your roof deck and shingles.

It:
- Prevents water intrusion
- Protects against wind-driven rain
- Extends roof life

It''s a critical part of a quality roof installation.

{{sender_name}}',
    TRUE, 'casual'),

  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_education_ridge_vents',
    'Homeowner: Education — Ridge Vents Explained',
    'Why ridge vents matter',
'Hi {{first_name}},

Ridge vents allow hot air to escape from your attic.

This:
- Reduces energy costs
- Prevents moisture buildup
- Extends roof life
- Keeps your home cooler

Proper ventilation is essential for a healthy roof.

{{sender_name}}',
    TRUE, 'casual'),

  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_education_ventilation',
    'Homeowner: Education — Ventilation Importance',
    'Why proper ventilation increases roof life',
'Hi {{first_name}},

Proper ventilation is crucial for roof longevity.

It:
- Prevents heat buildup in summer
- Reduces moisture in winter
- Prevents ice dams
- Extends shingle life by 30-50%

Your new roof includes proper ventilation.

{{sender_name}}',
    TRUE, 'casual'),

  -- Expectation Setting Templates
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_expectation_noise',
    'Homeowner: Expectation — Noise Levels',
    'What to expect: noise levels',
'Hi {{first_name}},

Installation day will be noisy — hammering, machinery, and crew activity.

Peak noise: 8 AM - 5 PM
Quieter periods: Lunch break (12-1 PM)

If you work from home, you may want to plan accordingly.

{{sender_name}}',
    TRUE, 'casual'),

  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_expectation_debris',
    'Homeowner: Expectation — Debris',
    'What to expect: debris',
'Hi {{first_name}},

During installation, you''ll see:
- Old shingles in the dumpster
- Some debris in the yard
- Nails (we''ll collect these)

We''ll clean everything up when we''re done.

{{sender_name}}',
    TRUE, 'casual'),

  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_expectation_dumpster',
    'Homeowner: Expectation — Dumpster Placement',
    'Dumpster placement',
'Hi {{first_name}},

A dumpster will be placed {{dumpster_location}} for old materials.

It will be removed after cleanup is complete.

If you have concerns about placement, let us know.

{{sender_name}}',
    TRUE, 'casual'),

  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_expectation_vehicle_access',
    'Homeowner: Expectation — Vehicle Access',
    'Vehicle access during installation',
'Hi {{first_name}},

During installation:
- Please move vehicles from driveway
- Crew needs clear access
- You can park on the street

We''ll let you know when you can park normally again.

{{sender_name}}',
    TRUE, 'casual'),

  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_expectation_pet_safety',
    'Homeowner: Expectation — Pet Safety',
    'Pet safety during installation',
'Hi {{first_name}},

For pet safety during installation:
- Keep pets indoors
- Secure gates and fences
- Watch for nails after cleanup

We''ll do a final magnet sweep, but extra caution helps.

{{sender_name}}',
    TRUE, 'casual'),

  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_expectation_weather_delays',
    'Homeowner: Expectation — Weather Delays',
    'Weather delay expectations',
'Hi {{first_name}},

If weather delays installation:
- We''ll notify you immediately
- We''ll reschedule ASAP
- Your roof will be protected with tarps if needed

Safety first — we won''t work in dangerous conditions.

{{sender_name}}',
    TRUE, 'casual'),

  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_expectation_crew_arrival',
    'Homeowner: Expectation — Crew Arrival Windows',
    'Crew arrival windows',
'Hi {{first_name}},

Crew arrival: {{arrival_window_start}} - {{arrival_window_end}}

Your project manager is {{project_manager_name}}.

We''ll text you when we''re on the way.

{{sender_name}}',
    TRUE, 'casual'),

  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_expectation_lawn_nail_sweep',
    'Homeowner: Expectation — Lawn Nail Sweep',
    'Lawn nail sweep after completion',
'Hi {{first_name}},

After installation, we''ll do a complete magnet sweep of your:
- Lawn
- Driveway
- Walkways
- Landscaping

We guarantee a clean property.

{{sender_name}}',
    TRUE, 'casual'),

  -- Homeowner Playbook Template
  ('00000000-0000-0000-0000-000000000000'::uuid, 'homeowner_playbook',
    'Homeowner: Playbook — Your Roofing Journey',
    'Your roofing journey — what to expect',
'Hi {{first_name}},

Here''s what your roofing journey will look like:

STAGE 1: INSPECTION
We''ll assess your roof and provide a detailed report.

STAGE 2: QUOTE
You''ll receive a detailed estimate with options.

STAGE 3: APPROVAL
Once approved, we''ll schedule your installation.

STAGE 4: MATERIALS
Materials will be delivered before installation.

STAGE 5: INSTALL
Our certified crew will install your new roof.

STAGE 6: FINAL PAYMENT
Final invoice will be sent after completion.

STAGE 7: WARRANTY
You''ll receive full warranty documents.

STAGE 8: CLEANUP + REVIEW
We''ll clean up everything and ask for your feedback.

We''ll guide you through every step. Reply anytime with questions.

{{sender_name}}',
    TRUE, 'casual')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Block 21727.10 — Lead Timeline Events Table
-- SmartSend Roofing Lead Timeline v1
-- ============================================================================
-- This table stores every activity event for a roofing lead, creating a unified
-- activity feed that shows every touch, every email, every reply, every status
-- change — all in ONE place. This makes roofers feel like SmartSend is their
-- AI sales assistant that never forgets anything.

CREATE TABLE IF NOT EXISTS lead_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- email_sent, reply_received, status_changed, note, call_logged, quote_created, quote_signed
  event_subtype TEXT,       -- cold_email_step_1, ai_reply_hot, ai_reply_warm, manual_status_change, etc.
  message TEXT,             -- human readable description
  metadata JSONB DEFAULT '{}'::jsonb, -- store email_id, old_status, new_status, call_duration, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add event_subtype and message columns if they don't exist (for backward compatibility)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lead_timeline_events' AND column_name = 'event_subtype') THEN
    ALTER TABLE lead_timeline_events ADD COLUMN event_subtype TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'lead_timeline_events' AND column_name = 'message') THEN
    ALTER TABLE lead_timeline_events ADD COLUMN message TEXT;
  END IF;
END $$;

-- Index for fast loading of timeline
CREATE INDEX IF NOT EXISTS idx_lead_timeline_lead_id_created_at
ON lead_timeline_events (lead_id, created_at DESC);

-- Additional indexes for performance
CREATE INDEX IF NOT EXISTS idx_lead_timeline_events_lead_id ON lead_timeline_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_timeline_events_created_at ON lead_timeline_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_timeline_events_type ON lead_timeline_events(event_type);

-- RLS
ALTER TABLE lead_timeline_events ENABLE ROW LEVEL SECURITY;

-- Policy: Owners and workspace members can view timeline events for leads in their workspace
CREATE POLICY "Owners can view timeline"
  ON lead_timeline_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM leads l
      JOIN workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE l.id = lead_timeline_events.lead_id
        AND wm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM leads l
      WHERE l.id = lead_timeline_events.lead_id
        AND l.owner_id = auth.uid()
    )
  );

-- Policy: SmartSend system can insert timeline events
CREATE POLICY "SmartSend system can insert"
  ON lead_timeline_events
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- Block 258900 — AI Pricing & Market Intelligence Engine v1
-- Local market pricing, competitor estimates, and company pricing rules
-- ============================================================================

-- 1.1 market_price_trends
-- Stores time-series material pricing by supplier and region so estimates
-- can auto-adjust when shingle, underlayment, OSB, etc. prices move.
CREATE TABLE IF NOT EXISTS market_price_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_name TEXT NOT NULL,
  supplier TEXT,
  region TEXT,
  price NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast lookups by material / region / date
CREATE INDEX IF NOT EXISTS idx_market_price_trends_material_region_date
  ON market_price_trends (material_name, COALESCE(region, ''), date DESC);

CREATE INDEX IF NOT EXISTS idx_market_price_trends_date
  ON market_price_trends (date DESC);

-- RLS: service_role full access, authenticated can read
ALTER TABLE market_price_trends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "market_price_trends_service_role_all" ON market_price_trends
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "market_price_trends_select_authenticated" ON market_price_trends
  FOR SELECT TO authenticated
  USING (true);


-- 1.2 competitor_price_estimates
-- Stores estimated competitor price bands by region and roof type so SmartSend
-- can show budget / mid-tier / premium ranges for similar jobs.
CREATE TABLE IF NOT EXISTS competitor_price_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region TEXT NOT NULL,
  roof_type TEXT,
  price_low NUMERIC,
  price_high NUMERIC,
  source TEXT, -- where this estimate came from (scraped, manual, vendor feed, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION update_competitor_price_estimates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_competitor_price_estimates_updated_at
BEFORE UPDATE ON competitor_price_estimates
FOR EACH ROW
EXECUTE FUNCTION update_competitor_price_estimates_updated_at();

-- Indexes for querying by market segment
CREATE INDEX IF NOT EXISTS idx_competitor_price_estimates_region_roof_type
  ON competitor_price_estimates (region, roof_type);

CREATE INDEX IF NOT EXISTS idx_competitor_price_estimates_updated_at
  ON competitor_price_estimates (updated_at DESC);

-- RLS: service_role full access, authenticated can read
ALTER TABLE competitor_price_estimates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "competitor_price_estimates_service_role_all" ON competitor_price_estimates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "competitor_price_estimates_select_authenticated" ON competitor_price_estimates
  FOR SELECT TO authenticated
  USING (true);


-- 1.3 pricing_rules
-- Per-company pricing configuration that ties margin targets, seasonal
-- multipliers, and adjustment flags into the AI pricing engine.
CREATE TABLE IF NOT EXISTS pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  margin_target NUMERIC,          -- target gross margin (e.g. 0.30 for 30%)
  seasonal_multiplier NUMERIC,    -- seasonal factor (e.g. 1.12 in storm market)
  adjust_for_complexity BOOLEAN NOT NULL DEFAULT TRUE,
  adjust_for_labor_cost BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION update_pricing_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pricing_rules_updated_at
BEFORE UPDATE ON pricing_rules
FOR EACH ROW
EXECUTE FUNCTION update_pricing_rules_updated_at();

-- Index for quick lookup of a company's active pricing rule(s)
CREATE INDEX IF NOT EXISTS idx_pricing_rules_company_id
  ON pricing_rules (company_id);

-- RLS: service_role full access, authenticated can read rules;
-- write access is expected to be mediated via backend running as service_role.
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pricing_rules_service_role_all" ON pricing_rules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "pricing_rules_select_authenticated" ON pricing_rules
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================================
-- Block 259100 — SmartSend Field Operations AI v1
-- Drone integration, damage detection, auto-measurements, photo mapping, reports
-- ============================================================================

-- 1.1 inspection_reports
-- Stores structured results from field / drone inspections per job.

CREATE TABLE IF NOT EXISTS inspection_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  inspector_id UUID REFERENCES users(id),
  measurements JSONB DEFAULT '{}'::jsonb,     -- auto-measurements: SQ, pitch, lengths, etc.
  damage_analysis JSONB DEFAULT '{}'::jsonb,  -- per slope / facet damage findings
  condition_rating NUMERIC,                   -- 0–1 or 1–10 scale, interpreted in app
  hazards JSONB DEFAULT '[]'::jsonb,          -- list of detected / noted hazards
  recommendation TEXT,                        -- repair vs replace, notes, summary
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for reporting and job-level lookup
CREATE INDEX IF NOT EXISTS idx_inspection_reports_job_id
  ON inspection_reports (job_id);

CREATE INDEX IF NOT EXISTS idx_inspection_reports_inspector_id
  ON inspection_reports (inspector_id);

-- RLS: service_role full access, authenticated can read via backend
ALTER TABLE inspection_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inspection_reports_service_role_all" ON inspection_reports
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "inspection_reports_select_authenticated" ON inspection_reports
  FOR SELECT TO authenticated
  USING (true);


-- 1.2 inspection_photos
-- Individual inspection / drone photos mapped to reports and roof locations.

CREATE TABLE IF NOT EXISTS inspection_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES inspection_reports(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  ai_tags JSONB DEFAULT '[]'::jsonb,      -- list of detected objects / damage tags
  location_on_roof TEXT,                  -- grid cell, slope code, or facet label
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspection_photos_report_id
  ON inspection_photos (report_id);

CREATE INDEX IF NOT EXISTS idx_inspection_photos_location_on_roof
  ON inspection_photos (location_on_roof);

ALTER TABLE inspection_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inspection_photos_service_role_all" ON inspection_photos
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "inspection_photos_select_authenticated" ON inspection_photos
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================================
-- Block 259000 — SmartSend Lead Generation Engine v1
-- Lead generation logging + scoring extensions
-- ============================================================================

-- 1.1 lead_generation_logs
-- Central log of every lead created or touched by SmartSend's lead engine:
-- cold outreach, website/chatbot, missed-calls, reactivation, etc.

CREATE TABLE IF NOT EXISTS lead_generation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,              -- outreach, website, missed_call, reactivation, ads, gmb, landing_page
  message TEXT,                       -- human-readable message or snippet
  result TEXT,                        -- responded, booked, no_reply, qualified, disqualified
  metadata JSONB DEFAULT '{}'::jsonb, -- store campaign_id, source_url, call_id, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast querying by lead and recency
CREATE INDEX IF NOT EXISTS idx_lead_generation_logs_lead_id_created_at
  ON lead_generation_logs (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_generation_logs_channel
  ON lead_generation_logs (channel);

CREATE INDEX IF NOT EXISTS idx_lead_generation_logs_result
  ON lead_generation_logs (result);

-- RLS: workspace members can see logs for their leads; service_role can manage all
ALTER TABLE lead_generation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view lead generation logs for workspace leads"
  ON lead_generation_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM leads l
      JOIN workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE l.id = lead_generation_logs.lead_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage lead generation logs"
  ON lead_generation_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE lead_generation_logs IS 'Block 259000: Centralized log of all AI-driven lead generation touchpoints (outreach, website/chatbot, missed-calls, reactivation, ads, etc.)';


-- 1.2 lead_scores extensions
-- Reuse existing lead_scores table from earlier blocks and add a generic
-- JSON factors payload so the Lead Generation Engine can store its own
-- scoring breakdown without fighting existing columns.

ALTER TABLE IF EXISTS public.lead_scores
  ADD COLUMN IF NOT EXISTS factors JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.lead_scores.factors IS 'Block 259000: Optional JSON breakdown of lead score components used by the Lead Generation Engine (e.g. outreach, website, missed_call, reactivation signals).';


-- ============================================================================
-- Block 259300 — SmartSend Inventory & Material Logistics v1
-- Inventory & material logistics engine: catalog, inventory, orders, usage
-- ============================================================================

-- 1.1 material_catalog
-- Master list of materials (shingles, ridge, underlayment, etc.) that can be
-- ordered, stocked in warehouse, and tracked on jobs.
CREATE TABLE IF NOT EXISTS material_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT,              -- shingles, nails, underlayment, etc.
  supplier TEXT,              -- Beacon, SRS, ABC, etc.
  unit TEXT NOT NULL,         -- bundle, roll, sheet, ft
  base_price NUMERIC,         -- baseline price per unit
  sku TEXT,                   -- optional supplier or internal SKU
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_catalog_name
  ON material_catalog (name);

CREATE INDEX IF NOT EXISTS idx_material_catalog_category
  ON material_catalog (category);

CREATE INDEX IF NOT EXISTS idx_material_catalog_supplier
  ON material_catalog (supplier);


-- 1.2 warehouse_inventory
-- Current on-hand and committed inventory per material and location.
CREATE TABLE IF NOT EXISTS warehouse_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES material_catalog(id) ON DELETE CASCADE,
  quantity NUMERIC NOT NULL DEFAULT 0,      -- on-hand quantity
  committed_quantity NUMERIC NOT NULL DEFAULT 0, -- reserved for jobs but not yet used
  location TEXT,                            -- main warehouse, yard, truck, etc.
  reorder_threshold NUMERIC,                -- when quantity falls below, trigger alert
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_material_location
  ON warehouse_inventory (material_id, COALESCE(location, ''));

CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_location
  ON warehouse_inventory (location);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_warehouse_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_warehouse_inventory_updated_at
BEFORE UPDATE ON warehouse_inventory
FOR EACH ROW
EXECUTE FUNCTION update_warehouse_inventory_updated_at();


-- 1.3 material_orders
-- Material purchase orders tied to jobs and suppliers (Beacon/SRS/ABC).
CREATE TABLE IF NOT EXISTS material_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  supplier TEXT,                    -- Beacon, SRS, ABC, etc.
  supplier_order_id TEXT,           -- external supplier order number
  delivery_date DATE,               -- planned delivery date
  delivery_window_start TIMESTAMPTZ, -- optional tighter delivery window
  delivery_window_end TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, confirmed, en_route, delivered, cancelled, returned
  total_cost NUMERIC,
  delivery_notes TEXT,              -- driver / drop location instructions
  metadata JSONB DEFAULT '{}'::jsonb, -- raw supplier payloads, webhooks, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_orders_job_id
  ON material_orders (job_id);

CREATE INDEX IF NOT EXISTS idx_material_orders_supplier
  ON material_orders (supplier);

CREATE INDEX IF NOT EXISTS idx_material_orders_delivery_date
  ON material_orders (delivery_date);

CREATE INDEX IF NOT EXISTS idx_material_orders_status
  ON material_orders (status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_material_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_material_orders_updated_at
BEFORE UPDATE ON material_orders
FOR EACH ROW
EXECUTE FUNCTION update_material_orders_updated_at();


-- 1.4 material_order_items
-- Line items on material orders (what was actually ordered).
CREATE TABLE IF NOT EXISTS material_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES material_orders(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES material_catalog(id) ON DELETE RESTRICT,
  quantity NUMERIC NOT NULL,
  price NUMERIC,               -- unit price at time of order
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_order_items_order_id
  ON material_order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_material_order_items_material_id
  ON material_order_items (material_id);


-- 1.5 material_usage
-- Tracks estimated vs actual usage per job & material (waste, over/under).
CREATE TABLE IF NOT EXISTS material_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES material_catalog(id) ON DELETE RESTRICT,
  estimated_quantity NUMERIC,   -- from takeoff / measurement engine
  actual_quantity NUMERIC,      -- from field / crew reporting
  variance NUMERIC,             -- actual - estimated (positive = over-usage)
  notes TEXT,                   -- explanation for variance / field notes
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_usage_job_id
  ON material_usage (job_id);

CREATE INDEX IF NOT EXISTS idx_material_usage_material_id
  ON material_usage (material_id);


-- RLS: follow existing pattern — service_role can manage everything,
-- authenticated clients can read; write is mediated via backend.
ALTER TABLE material_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "material_catalog_service_role_all" ON material_catalog
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "warehouse_inventory_service_role_all" ON warehouse_inventory
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "material_orders_service_role_all" ON material_orders
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "material_order_items_service_role_all" ON material_order_items
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "material_usage_service_role_all" ON material_usage
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "material_catalog_select_authenticated" ON material_catalog
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "warehouse_inventory_select_authenticated" ON warehouse_inventory
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "material_orders_select_authenticated" ON material_orders
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "material_order_items_select_authenticated" ON material_order_items
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "material_usage_select_authenticated" ON material_usage
  FOR SELECT TO authenticated
  USING (true);


COMMENT ON TABLE material_catalog IS 'Block 259300: Master material catalog powering ordering, warehouse tracking, and usage analytics.';
COMMENT ON TABLE warehouse_inventory IS 'Block 259300: Real-time warehouse inventory (on-hand, committed, reorder thresholds) per material and location.';
COMMENT ON TABLE material_orders IS 'Block 259300: Material purchase orders linked to jobs and suppliers (Beacon/SRS/ABC).';
COMMENT ON TABLE material_order_items IS 'Block 259300: Line items for material orders (quantities and prices at time of order).';
COMMENT ON TABLE material_usage IS 'Block 259300: Estimated vs actual material usage per job for variance and waste tracking.';


-- ============================================================================
-- Block 259400 — SmartSend Quality Assurance & Job Audit Engine v1
-- Install standards, QA scorecards, callbacks, warranty tasks
-- ============================================================================

-- 1.1 qa_checklists
-- Master install standards / QA steps per roof type & manufacturer.
CREATE TABLE IF NOT EXISTS qa_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roof_type TEXT,
  manufacturer TEXT,
  steps JSONB DEFAULT '[]'::jsonb, -- array of step definitions (keys, labels, required, photo_required, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qa_checklists_roof_type_manufacturer
  ON qa_checklists (COALESCE(roof_type, ''), COALESCE(manufacturer, ''));


-- 1.2 qa_reports
-- Per-job QA scorecard / audit summary.
CREATE TABLE IF NOT EXISTS qa_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  pm_id UUID REFERENCES users(id),
  score NUMERIC,                             -- 0–100 job QA score
  issues JSONB DEFAULT '[]'::jsonb,          -- list of QA issues (slope, step_key, severity, notes)
  approved BOOLEAN NOT NULL DEFAULT FALSE,   -- PM approval flag
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qa_reports_job_id_created_at
  ON qa_reports (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_qa_reports_pm_id
  ON qa_reports (pm_id);


-- 1.3 callbacks
-- Tracks post-install callbacks (leaks, ridge issues, etc.) and their cost.
CREATE TABLE IF NOT EXISTS callbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  issue_type TEXT,
  description TEXT,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  cost NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_callbacks_job_id_created_at
  ON callbacks (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_callbacks_issue_type
  ON callbacks (issue_type);

CREATE INDEX IF NOT EXISTS idx_callbacks_resolved
  ON callbacks (resolved);


-- 1.4 warranty_tasks
-- Warranty-related follow-up tasks per job (pipe boot recheck, sealant check, etc.).
CREATE TABLE IF NOT EXISTS warranty_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  task TEXT NOT NULL,
  due_date DATE,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warranty_tasks_job_id_due_date
  ON warranty_tasks (job_id, due_date);

CREATE INDEX IF NOT EXISTS idx_warranty_tasks_completed
  ON warranty_tasks (completed);


-- RLS: follow existing pattern — service_role manages all, authenticated can read.
ALTER TABLE qa_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE callbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE warranty_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qa_checklists_service_role_all" ON qa_checklists
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "qa_reports_service_role_all" ON qa_reports
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "callbacks_service_role_all" ON callbacks
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "warranty_tasks_service_role_all" ON warranty_tasks
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "qa_checklists_select_authenticated" ON qa_checklists
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "qa_reports_select_authenticated" ON qa_reports
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "callbacks_select_authenticated" ON callbacks
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "warranty_tasks_select_authenticated" ON warranty_tasks
  FOR SELECT TO authenticated
  USING (true);


COMMENT ON TABLE qa_checklists IS 'Block 259400: Install standards / QA checklists per roof type and manufacturer.';
COMMENT ON TABLE qa_reports IS 'Block 259400: Per-job QA scorecards including issues and PM approval.';
COMMENT ON TABLE callbacks IS 'Block 259400: Post-install callbacks (issues, costs) tied to jobs and crews.';
COMMENT ON TABLE warranty_tasks IS 'Block 259400: Warranty-related follow-up tasks and reminders per job.';


-- ============================================================================
-- Block 259500 — SmartSend Customer Experience Engine v1
-- Homeowner portal, live job timeline, messaging, satisfaction scores
-- ============================================================================

-- 1.1 homeowner_portal_sessions
CREATE TABLE IF NOT EXISTS homeowner_portal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  session_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_homeowner_portal_sessions_token
  ON homeowner_portal_sessions (session_token);

CREATE INDEX IF NOT EXISTS idx_homeowner_portal_sessions_job_id
  ON homeowner_portal_sessions (job_id);


-- 1.2 job_timeline_events
CREATE TABLE IF NOT EXISTS job_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- material_delivery, crew_arrived, tearoff_start, underlayment_installed, etc.
  description TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_timeline_events_job_id_created_at
  ON job_timeline_events (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_timeline_events_event_type
  ON job_timeline_events (event_type);


-- 1.3 customer_interactions
CREATE TABLE IF NOT EXISTS customer_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  channel TEXT NOT NULL, -- sms, portal, email
  message TEXT,
  sender TEXT NOT NULL, -- customer, company
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_interactions_job_id_created_at
  ON customer_interactions (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_interactions_channel
  ON customer_interactions (channel);

CREATE INDEX IF NOT EXISTS idx_customer_interactions_sender
  ON customer_interactions (sender);


-- 1.4 customer_satisfaction_scores
CREATE TABLE IF NOT EXISTS customer_satisfaction_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  score INT,
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_satisfaction_scores_job_id_created_at
  ON customer_satisfaction_scores (job_id, created_at DESC);


-- RLS: service_role manages all, authenticated can read.
ALTER TABLE homeowner_portal_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_satisfaction_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homeowner_portal_sessions_service_role_all" ON homeowner_portal_sessions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "job_timeline_events_service_role_all" ON job_timeline_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "customer_interactions_service_role_all" ON customer_interactions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "customer_satisfaction_scores_service_role_all" ON customer_satisfaction_scores
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "homeowner_portal_sessions_select_authenticated" ON homeowner_portal_sessions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "job_timeline_events_select_authenticated" ON job_timeline_events
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "customer_interactions_select_authenticated" ON customer_interactions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "customer_satisfaction_scores_select_authenticated" ON customer_satisfaction_scores
  FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE homeowner_portal_sessions IS 'Block 259500: Homeowner portal sessions tied to jobs and customers.';
COMMENT ON TABLE job_timeline_events IS 'Block 259500: Live job timeline events with descriptions and photos.';
COMMENT ON TABLE customer_interactions IS 'Block 259500: Centralized log of homeowner communications across SMS, portal, and email.';
COMMENT ON TABLE customer_satisfaction_scores IS 'Block 259500: Job-level customer satisfaction scores and feedback.';


-- ============================================================================
-- Block 259700 — SmartSend Accounting Sync v1
-- Accounting brainstem: QuickBooks integration, job costing, WIP
-- ============================================================================

-- 1.1 accounting_integrations
-- Stores per-company accounting provider connections (QuickBooks Online, etc.)
CREATE TABLE IF NOT EXISTS public.accounting_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider text NOT NULL,             -- 'quickbooks_online', 'xero' (future)
  access_token text,
  refresh_token text,
  realm_id text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_sync_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_accounting_integrations_company_provider
  ON public.accounting_integrations (company_id, provider);

CREATE INDEX IF NOT EXISTS idx_accounting_integrations_last_sync_at
  ON public.accounting_integrations (last_sync_at DESC);

ALTER TABLE public.accounting_integrations ENABLE ROW LEVEL SECURITY;

-- Only backend/service_role should touch tokens; no direct client access.
CREATE POLICY "accounting_integrations_service_role_all" ON public.accounting_integrations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- 1.2 chart_of_accounts_mapping
-- Maps QuickBooks chart of accounts into SmartSend accounting buckets.
CREATE TABLE IF NOT EXISTS public.chart_of_accounts_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  qb_account_id text NOT NULL,
  qb_account_name text,
  category text CHECK (category IN ('revenue', 'labor', 'materials', 'subs', 'overhead')),
  smartsend_usage text, -- 'job_revenue', 'job_materials', 'job_labor', etc.
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_company_qb_account
  ON public.chart_of_accounts_mapping (company_id, qb_account_id);

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_company_usage
  ON public.chart_of_accounts_mapping (company_id, smartsend_usage);

ALTER TABLE public.chart_of_accounts_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chart_of_accounts_mapping_service_role_all" ON public.chart_of_accounts_mapping
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "chart_of_accounts_mapping_select_authenticated" ON public.chart_of_accounts_mapping
  FOR SELECT TO authenticated
  USING (true);


-- 1.3 job_cost_mapping
-- Per-job cost trail tied back to QuickBooks transactions.
CREATE TABLE IF NOT EXISTS public.job_cost_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  qb_txn_id text,         -- bill, expense, check, journal entry
  qb_account_id text,
  type text CHECK (type IN ('material', 'labor', 'sub', 'overhead')),
  amount numeric,
  description text,
  txn_date date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_cost_mapping_job_id_created_at
  ON public.job_cost_mapping (job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_cost_mapping_qb_txn_id
  ON public.job_cost_mapping (qb_txn_id);

CREATE INDEX IF NOT EXISTS idx_job_cost_mapping_type
  ON public.job_cost_mapping (type);

ALTER TABLE public.job_cost_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_cost_mapping_service_role_all" ON public.job_cost_mapping
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "job_cost_mapping_select_authenticated" ON public.job_cost_mapping
  FOR SELECT TO authenticated
  USING (true);


-- 1.4 wip_entries
-- Work-in-progress accounting snapshots per job and period.
CREATE TABLE IF NOT EXISTS public.wip_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  costs_incurred numeric,
  revenue_recognized numeric,
  status text NOT NULL CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wip_entries_period_valid CHECK (period_start <= period_end)
);

CREATE INDEX IF NOT EXISTS idx_wip_entries_job_id_period
  ON public.wip_entries (job_id, period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_wip_entries_status
  ON public.wip_entries (status);

ALTER TABLE public.wip_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wip_entries_service_role_all" ON public.wip_entries
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "wip_entries_select_authenticated" ON public.wip_entries
  FOR SELECT TO authenticated
  USING (true);


COMMENT ON TABLE public.accounting_integrations IS 'Block 259700: Per-company accounting provider connections (QuickBooks, etc.) with sync metadata.';
COMMENT ON TABLE public.chart_of_accounts_mapping IS 'Block 259700: Mapping from QuickBooks chart of accounts into SmartSend job costing categories.';
COMMENT ON TABLE public.job_cost_mapping IS 'Block 259700: Detailed per-job cost lines tied back to specific QuickBooks transactions.';
COMMENT ON TABLE public.wip_entries IS 'Block 259700: Work-in-progress accounting snapshots per job and reporting period.';


-- ============================================================================
-- Block 260300 — SmartSend White-Label & Partner Ecosystem v1
-- Agencies, consultants, resellers, revenue share, and client mappings
-- ============================================================================

-- 1.1 partners
-- Master table for agencies, consultants, and resellers that bring clients
-- onto SmartSend under white-label or co-branded arrangements.
CREATE TABLE IF NOT EXISTS public.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,           -- 'agency', 'consultant', 'reseller'
  name text NOT NULL,
  branding jsonb DEFAULT '{}'::jsonb, -- logo, colors, domain, copy, etc.
  revenue_share numeric NOT NULL,     -- 0.20 = 20% rev share
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partners_revenue_share_range CHECK (revenue_share >= 0 AND revenue_share <= 1)
);

CREATE INDEX IF NOT EXISTS idx_partners_type_name
  ON public.partners (type, name);


-- 1.2 partner_clients
-- Links partners to their managed client companies (multi-tenant control plane).
CREATE TABLE IF NOT EXISTS public.partner_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active', -- 'active', 'paused', 'churned'
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_clients_status_valid CHECK (status IN ('active', 'paused', 'churned')),
  CONSTRAINT partner_clients_unique_partner_company UNIQUE (partner_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_partner_clients_partner_id_status
  ON public.partner_clients (partner_id, status);

CREATE INDEX IF NOT EXISTS idx_partner_clients_company_id
  ON public.partner_clients (company_id);


-- 1.3 partner_payouts
-- Aggregated revenue share payouts per partner and period (e.g. monthly).
CREATE TABLE IF NOT EXISTS public.partner_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  period text NOT NULL, -- e.g. '2025-01', '2025-Q1'
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'paid'
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_payouts_status_valid CHECK (status IN ('pending', 'paid'))
);

CREATE INDEX IF NOT EXISTS idx_partner_payouts_partner_id_period
  ON public.partner_payouts (partner_id, period);

CREATE INDEX IF NOT EXISTS idx_partner_payouts_status_created_at
  ON public.partner_payouts (status, created_at DESC);


-- RLS: backend/service_role manages everything; authenticated can read via app-level rules.
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partners_service_role_all" ON public.partners
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "partner_clients_service_role_all" ON public.partner_clients
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "partner_payouts_service_role_all" ON public.partner_payouts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "partners_select_authenticated" ON public.partners
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "partner_clients_select_authenticated" ON public.partner_clients
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "partner_payouts_select_authenticated" ON public.partner_payouts
  FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE public.partners IS 'Block 260300: Agencies, consultants, and resellers with white-label branding and revenue share terms.';
COMMENT ON TABLE public.partner_clients IS 'Block 260300: Mapping of partners to the roofing companies they manage (multi-tenant partner console).';
COMMENT ON TABLE public.partner_payouts IS 'Block 260300: Periodic revenue-share payouts computed for each partner.';

-- ============================================================================
-- Block 260400 — SmartSend Data Warehouse & Benchmark Engine v1
-- Industry benchmarks, peer comparison, best-in-class metrics
-- ============================================================================

-- 1.1 warehouse_metrics
-- Centralized per-company metric snapshots feeding the SmartSend data warehouse.
CREATE TABLE IF NOT EXISTS public.warehouse_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  metric_name text NOT NULL,      -- e.g. 'gross_margin', 'close_rate', 'callbacks_rate'
  metric_value numeric,           -- stored as decimal (e.g. 0.32 for 32% or absolute)
  period text NOT NULL,           -- e.g. '2025-01' (month) or '2025-W05' (week)
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for querying company benchmark history
CREATE INDEX IF NOT EXISTS idx_warehouse_metrics_company_period_metric
  ON public.warehouse_metrics (company_id, period, metric_name);

CREATE INDEX IF NOT EXISTS idx_warehouse_metrics_metric_period
  ON public.warehouse_metrics (metric_name, period);


-- 1.2 industry_benchmarks
-- Anonymous industry-wide benchmark curves used to answer "what good looks like".
CREATE TABLE IF NOT EXISTS public.industry_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment text,           -- residential, commercial, storm, mixed
  company_size text,      -- small, mid, large (or revenue bands)
  region text,            -- e.g. 'TX', 'Southeast', 'US'
  metric_name text NOT NULL,
  median_value numeric,
  top_25_value numeric,
  top_10_value numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_industry_benchmarks_segment_size_region_metric
  ON public.industry_benchmarks (
    COALESCE(segment, ''),
    COALESCE(company_size, ''),
    COALESCE(region, ''),
    metric_name
  );

CREATE INDEX IF NOT EXISTS idx_industry_benchmarks_metric_name
  ON public.industry_benchmarks (metric_name);


-- 1.3 peer_groups
-- Peer group definitions (by revenue band, employees, region, mix, etc.).
CREATE TABLE IF NOT EXISTS public.peer_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criteria jsonb NOT NULL,  -- { "revenue_min": ..., "revenue_max": ..., "region": ..., "segment": ... }
  created_at timestamptz NOT NULL DEFAULT now()
);

-- JSONB index for fast peer group matching
CREATE INDEX IF NOT EXISTS idx_peer_groups_criteria
  ON public.peer_groups
  USING GIN (criteria);


-- RLS: backend/service_role manages all; authenticated can read benchmarks.
ALTER TABLE public.warehouse_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.industry_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.peer_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warehouse_metrics_service_role_all" ON public.warehouse_metrics
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "industry_benchmarks_service_role_all" ON public.industry_benchmarks
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "peer_groups_service_role_all" ON public.peer_groups
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "warehouse_metrics_select_authenticated" ON public.warehouse_metrics
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "industry_benchmarks_select_authenticated" ON public.industry_benchmarks
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "peer_groups_select_authenticated" ON public.peer_groups
  FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE public.warehouse_metrics IS 'Block 260400: Central SmartSend data warehouse metrics per company and period (revenue, margins, callbacks, crew output, marketing ROI, etc.).';
COMMENT ON TABLE public.industry_benchmarks IS 'Block 260400: Anonymous industry benchmark curves (median, top 25%, top 10%) by segment, size, region, and metric.';
COMMENT ON TABLE public.peer_groups IS 'Block 260400: Peer group definitions used for apples-to-apples comparisons (revenue bands, region, mix).';


-- ============================================================================
-- Block 261000 — SmartSend Referral, Reputation & Flywheel Engine v1
-- Reviews, referrals, repeat jobs, and zero-ad flywheel growth
-- ============================================================================

-- 1.1 reviews
-- Stores per-job, per-customer reviews across platforms so SmartSend can:
-- - trigger review requests at the right emotional moment (job complete, payment, warranty)
-- - track review velocity, average rating, and response times
-- - power lost-review recovery and bad-review intercept automations
CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  platform text,                    -- google, facebook, yelp, bbb, etc.
  rating int CHECK (rating >= 1 AND rating <= 5),
  review_text text,
  review_url text,
  status text NOT NULL DEFAULT 'pending', -- pending, published, flagged, removed
  requested_at timestamptz,         -- when SmartSend first asked for a review
  reminder_sent_at timestamptz,     -- when lost-review recovery reminder was sent
  received_at timestamptz,          -- when review was actually posted
  responded_at timestamptz,         -- when company replied to the review
  metadata jsonb DEFAULT '{}'::jsonb, -- raw payloads, platform ids, sentiment, etc.
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_company_platform_created_at
  ON reviews (company_id, COALESCE(platform, ''), created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reviews_job_id
  ON reviews (job_id);

CREATE INDEX IF NOT EXISTS idx_reviews_customer_id
  ON reviews (customer_id);


-- 1.2 referrals
-- Tracks every referral from happy customers, sales reps, and crews so SmartSend can:
-- - ask for referrals at positive moments
-- - measure referral-to-booked-to-won conversion
-- - power internal referral leaderboards and incentive payouts
CREATE TABLE IF NOT EXISTS referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  referrer_customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  referrer_name text,
  referrer_contact text,              -- phone, email, or notes
  referred_lead_id uuid REFERENCES leads(id) ON DELETE SET NULL,
  referred_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  source text,                         -- homeowner, crew, sales_rep, partner, other
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'contacted', 'booked', 'won', 'lost', 'cancelled')),
  incentive_id uuid REFERENCES referral_incentives(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referrals_company_status_created_at
  ON referrals (company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_customer_id
  ON referrals (referrer_customer_id);

CREATE INDEX IF NOT EXISTS idx_referrals_referred_lead_job
  ON referrals (referred_lead_id, referred_job_id);


-- Auto-update updated_at on referrals
CREATE OR REPLACE FUNCTION update_referrals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_referrals_updated_at
BEFORE UPDATE ON referrals
FOR EACH ROW
EXECUTE FUNCTION update_referrals_updated_at();


-- 1.3 referral_incentives
-- Per-company incentive configuration for referrals so SmartSend can:
-- - keep referral asks simple ("$250 gift card or $250 to charity")
-- - track which offers are active
-- - attribute payouts back to specific referrals
CREATE TABLE IF NOT EXISTS referral_incentives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  label text,                          -- e.g. "Standard $250 Referral", "Charity Match"
  incentive_type text NOT NULL         -- cash, gift_card, charity, other
    CHECK (incentive_type IN ('cash', 'gift_card', 'charity', 'other')),
  amount numeric,
  is_active boolean NOT NULL DEFAULT true,
  terms text,                          -- optional description shown in templates
  metadata jsonb DEFAULT '{}'::jsonb,  -- for future expansion
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_incentives_company_active
  ON referral_incentives (company_id, is_active);


-- Auto-update updated_at on referral_incentives
CREATE OR REPLACE FUNCTION update_referral_incentives_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_referral_incentives_updated_at
BEFORE UPDATE ON referral_incentives
FOR EACH ROW
EXECUTE FUNCTION update_referral_incentives_updated_at();


-- RLS: follow existing pattern — backend/service_role manages everything,
-- authenticated clients can read; write is mediated via backend.
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_incentives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews_service_role_all" ON reviews
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "referrals_service_role_all" ON referrals
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "referral_incentives_service_role_all" ON referral_incentives
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "reviews_select_authenticated" ON reviews
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "referrals_select_authenticated" ON referrals
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "referral_incentives_select_authenticated" ON referral_incentives
  FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE reviews IS 'Block 261000: Per-job, per-customer reviews powering SmartSend''s review capture engine, reputation score, and bad-review intercept.';
COMMENT ON TABLE referrals IS 'Block 261000: Referral tracking from happy customers, crews, and sales reps into booked and won jobs (fuel for the zero-ad flywheel).';
COMMENT ON TABLE referral_incentives IS 'Block 261000: Per-company referral incentive rules (cash, gift card, charity) used in referral asks and leaderboard reporting.';


-- ============================================================================
-- Block 261200 — SmartSend Financial Command & Cash-Flow Engine v1
-- AR/AP command center, cash forecasting, profit locks, zero surprises
-- ============================================================================

-- 1.1 receivables
-- Job-level accounts receivable records so SmartSend can power:
-- - AR Command Center views
-- - automated collections & escalation flows
-- - job-level cash timelines and profit lock alerts
CREATE TABLE IF NOT EXISTS receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
  amount_due numeric,
  due_date date,
  status text, -- open, paid, overdue
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receivables_job_id
  ON receivables (job_id);

CREATE INDEX IF NOT EXISTS idx_receivables_due_date_status
  ON receivables (due_date, COALESCE(status, ''));


-- 1.2 payables
-- Simple AP ledger so SmartSend can surface:
-- - upcoming cash-out obligations (materials, labor, insurance, overhead)
-- - expense spike detection and trend alerts
CREATE TABLE IF NOT EXISTS payables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor text,
  amount numeric,
  due_date date,
  category text, -- materials, labor, insurance, overhead
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payables_vendor
  ON payables (vendor);

CREATE INDEX IF NOT EXISTS idx_payables_due_date_category
  ON payables (due_date, COALESCE(category, ''));


-- 1.3 cash_forecasts
-- Per-company cash-in / cash-out projections feeding:
-- - Owner Cash Dashboard
-- - storm cash surge mode
-- - financial risk alerts (runway, low-point projections)
CREATE TABLE IF NOT EXISTS cash_forecasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  forecast jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cash_forecasts_company_created_at
  ON cash_forecasts (company_id, created_at DESC);


-- RLS: follow existing pattern — backend/service_role manages everything,
-- authenticated clients can read; write is mediated via backend.
ALTER TABLE receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE payables ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_forecasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "receivables_service_role_all" ON receivables
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "payables_service_role_all" ON payables
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "cash_forecasts_service_role_all" ON cash_forecasts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "receivables_select_authenticated" ON receivables
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "payables_select_authenticated" ON payables
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "cash_forecasts_select_authenticated" ON cash_forecasts
  FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE receivables IS 'Block 261200: Job-level accounts receivable powering AR Command Center, collections, and job cash timelines.';
COMMENT ON TABLE payables IS 'Block 261200: Accounts payable ledger for upcoming cash-out obligations and expense spike detection.';
COMMENT ON TABLE cash_forecasts IS 'Block 261200: Per-company cash-in / cash-out forecasts feeding the Owner Cash Dashboard and financial risk alerts.';

-- ============================================================================
-- Block 261300 — SmartSend Hiring, Retention & Culture Engine v2
-- Elite Workforce Engine: candidates, scorecards, performance
-- ============================================================================

-- 1.1 candidates
-- Always-on hiring pipeline for installers, crew leads, PMs, sales, etc.
CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role TEXT,   -- installer, crew_lead, pm, sales
  source TEXT, -- referral, indeed, walk-in, etc.
  status TEXT, -- applied, interviewed, hired, rejected
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_candidates_company_role_status
  ON candidates (company_id, role, status);

CREATE INDEX IF NOT EXISTS idx_candidates_company_created_at
  ON candidates (company_id, created_at DESC);


-- 1.2 role_scorecards
-- Clear expectations, KPIs, and behavioral standards per role.
-- company_id is optional so we can support global defaults (NULL) plus
-- per-company overrides when needed.
CREATE TABLE IF NOT EXISTS role_scorecards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  expectations JSONB NOT NULL DEFAULT '{}'::jsonb,
  kpis JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_role_scorecards_company_role
  ON role_scorecards (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), role);


-- 1.3 employee_performance
-- Per-user performance snapshots feeding scorecards, performance pay, and
-- retention / promotion signals.
CREATE TABLE IF NOT EXISTS employee_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  score NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_performance_user_created_at
  ON employee_performance (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_employee_performance_score
  ON employee_performance (score DESC);


-- RLS: follow existing pattern — backend/service_role manages everything,
-- authenticated clients can read; write is mediated via backend.
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_scorecards ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "candidates_service_role_all" ON candidates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "role_scorecards_service_role_all" ON role_scorecards
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "employee_performance_service_role_all" ON employee_performance
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "candidates_select_authenticated" ON candidates
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "role_scorecards_select_authenticated" ON role_scorecards
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "employee_performance_select_authenticated" ON employee_performance
  FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE candidates IS 'Block 261300: Always-on hiring pipeline candidates per company (role, source, status).';
COMMENT ON TABLE role_scorecards IS 'Block 261300: Role-level expectations and KPIs powering hiring, reviews, and promotion paths.';
COMMENT ON TABLE employee_performance IS 'Block 261300: Per-employee performance metrics and scores for crews, pay, and retention risk.';


-- ============================================================================
-- Block 261400 — SmartSend Procurement, Supplier Power & Cost Control Engine v1
-- Procurement brain: material pricing, vendor leverage, margin defense
-- ============================================================================
-- This block tightens control around materials and suppliers:
-- - Centralized purchasing on top of existing purchase_orders engine
-- - Real job-level material cost visibility via price history
-- - Supplier leverage via rebate tracking and price comparisons
-- - Margin defense by making cost movements and overpay impossible to ignore

-- 1.1 suppliers
-- Extend existing suppliers table with procurement-specific fields so we can:
-- - store structured contact info (multiple reps, phones, emails)
-- - mark which vendors are currently approved vs blocked
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'suppliers'
  ) THEN
    ALTER TABLE public.suppliers
      ADD COLUMN IF NOT EXISTS contact jsonb,  -- { primary_rep, phone, email, accounts_payable, notes, ... }
      ADD COLUMN IF NOT EXISTS approved boolean DEFAULT true;
  END IF;
END $$;

-- Fast lookup of active, approved vendors
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'suppliers'
      AND column_name = 'approved'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_suppliers_approved
      ON public.suppliers (approved)
      WHERE approved = true;
  END IF;
END $$;


-- 1.2 material_prices
-- Per-supplier material price history so SmartSend can:
-- - compare suppliers on the same SKU
-- - detect quiet price creep and storm spikes
-- - feed the Bulk Buy & Forecast and Margin Defense engines
CREATE TABLE IF NOT EXISTS public.material_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  material_id uuid REFERENCES public.material_catalog(id) ON DELETE SET NULL,
  material text NOT NULL,                 -- human label / description
  price numeric(12,2) NOT NULL,          -- price per unit at time of record
  unit text NOT NULL,                    -- bundle, roll, sheet, sq, lf, etc.
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_prices_supplier_material_recorded
  ON public.material_prices (supplier_id, material, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_material_prices_material_recorded
  ON public.material_prices (material, recorded_at DESC);

ALTER TABLE public.material_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "material_prices_service_role_all" ON public.material_prices
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "material_prices_select_authenticated" ON public.material_prices
  FOR SELECT TO authenticated
  USING (true);


-- 1.3 purchase_orders
-- Ensure purchase_orders has a canonical total_cost column that the
-- procurement engine can rely on, regardless of which earlier block
-- originally created the table.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'purchase_orders'
  ) THEN
    ALTER TABLE public.purchase_orders
      ADD COLUMN IF NOT EXISTS total_cost numeric(12,2);
  END IF;
END $$;


-- 1.4 supplier_rebates
-- Tracks rebate programs and volume incentives per supplier so owners
-- can intentionally steer volume and never miss earned money.
CREATE TABLE IF NOT EXISTS public.supplier_rebates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  company_id uuid,                         -- flexible FK: roofing_companies or companies (added below)
  threshold numeric(12,2) NOT NULL,        -- spend threshold for rebate (e.g. 500000.00)
  rebate_amount numeric(12,2) NOT NULL,    -- rebate dollars or credit at threshold
  period text,                             -- '2025', '2025-Q1', '2025-01', etc.
  metadata jsonb DEFAULT '{}'::jsonb,      -- store program names, tiers, notes
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Attach company_id FK depending on which company table exists in this project.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'supplier_rebates'
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name = 'supplier_rebates_company_id_fkey'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'roofing_companies'
    ) THEN
      ALTER TABLE public.supplier_rebates
        ADD CONSTRAINT supplier_rebates_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES public.roofing_companies(id) ON DELETE CASCADE;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'companies'
    ) THEN
      ALTER TABLE public.supplier_rebates
        ADD CONSTRAINT supplier_rebates_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_supplier_rebates_supplier_period
  ON public.supplier_rebates (supplier_id, period);

CREATE INDEX IF NOT EXISTS idx_supplier_rebates_company_period
  ON public.supplier_rebates (company_id, period);

ALTER TABLE public.supplier_rebates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_rebates_service_role_all" ON public.supplier_rebates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "supplier_rebates_select_authenticated" ON public.supplier_rebates
  FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE public.material_prices IS 'Block 261400: Per-supplier material price history for comparisons, surge detection, and bulk-buy intelligence.';
COMMENT ON TABLE public.supplier_rebates IS 'Block 261400: Supplier rebate and volume incentive programs so owners intentionally capture earned rebates.';
 
 
-- ============================================================================
-- Block 261600 — SmartSend Knowledge Base, SOP Compiler & Training OS v1
-- Company brain: knowledge base, SOPs, training, compliance
-- ============================================================================

-- 1.1 knowledge_articles
-- Central, searchable knowledge base for each roofing company:
-- - estimate rules, inspection flows, safety procedures
-- - material ordering rules, storm workflows, insurance processes
CREATE TABLE IF NOT EXISTS public.knowledge_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  category text,              -- sales, ops, safety, admin, legal, etc.
  tags text[],                -- simple facet tags (["insurance", "supplement", "storm"])
  created_by uuid REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_company_category
  ON public.knowledge_articles (company_id, COALESCE(category, ''));

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_company_title
  ON public.knowledge_articles (company_id, title);

-- Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION public.update_knowledge_articles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_knowledge_articles_updated_at
BEFORE UPDATE ON public.knowledge_articles
FOR EACH ROW
EXECUTE FUNCTION public.update_knowledge_articles_updated_at();


-- 1.2 sops
-- Canonical SOPs per company and role; powers:
-- - Auto-SOP compiler (source + metadata)
-- - Job-attached contextual SOPs
-- - Versioning and owner approvals
CREATE TABLE IF NOT EXISTS public.sops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  role text,                       -- installer, sales, pm, admin, etc.
  category text,                   -- sales, ops, safety, admin, compliance
  steps jsonb NOT NULL DEFAULT '[]'::jsonb, -- array of { key, label, description, required, checklist, ... }
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  version int NOT NULL DEFAULT 1,
  source text,                     -- 'manual', 'auto_generated', 'template'
  source_metadata jsonb DEFAULT '{}'::jsonb, -- e.g. { "based_on": "top_10_percent_sales", "events": [...] }
  approved_by uuid REFERENCES public.users(id),
  approved_at timestamptz,
  created_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sops_company_role_status
  ON public.sops (company_id, COALESCE(role, ''), status);

CREATE INDEX IF NOT EXISTS idx_sops_company_category
  ON public.sops (company_id, COALESCE(category, ''));

-- Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION public.update_sops_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sops_updated_at
BEFORE UPDATE ON public.sops
FOR EACH ROW
EXECUTE FUNCTION public.update_sops_updated_at();


-- 1.3 sop_versions
-- Immutable change log for each SOP version.
-- Lets owners see what changed, when, and why.
CREATE TABLE IF NOT EXISTS public.sop_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id uuid NOT NULL REFERENCES public.sops(id) ON DELETE CASCADE,
  version int NOT NULL,
  change_summary text,                 -- "Updated storm season pricing rules", etc.
  steps jsonb NOT NULL,                -- full snapshot of steps at this version
  changed_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sop_versions_unique_version_per_sop UNIQUE (sop_id, version)
);

CREATE INDEX IF NOT EXISTS idx_sop_versions_sop_id_version
  ON public.sop_versions (sop_id, version DESC);


-- 1.4 training_modules
-- Micro-training building blocks:
-- - role-based training paths
-- - 3–5 minute lessons + quizzes
-- - can be tied back to SOPs for deep links
CREATE TABLE IF NOT EXISTS public.training_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE, -- NULL = global default module
  role text,                          -- installer, sales, pm, crew_lead, etc.
  title text NOT NULL,
  content text,                        -- markdown / rich text
  module_type text NOT NULL DEFAULT 'onboarding'
    CHECK (module_type IN ('onboarding', 'ongoing', 'safety', 'product', 'sop')),
  required boolean NOT NULL DEFAULT true,
  estimated_minutes int,
  sop_id uuid REFERENCES public.sops(id) ON DELETE SET NULL,
  order_index int,                     -- ordering within a path for the role
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_modules_company_role_type
  ON public.training_modules (
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(role, ''),
    module_type
  );

CREATE INDEX IF NOT EXISTS idx_training_modules_sop_id
  ON public.training_modules (sop_id);


-- 1.5 training_triggers
-- Defines when modules are assigned / required:
-- - Day-based onboarding (Day 1, Day 7, Day 30)
-- - Contextual gates ("before first steep roof", "before driving company truck")
CREATE TABLE IF NOT EXISTS public.training_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  trigger_type text NOT NULL,              -- onboarding_day, before_job_type, before_role_action
  trigger_metadata jsonb DEFAULT '{}'::jsonb, -- { "day": 1 }, { "job_type": "steep_roof" }, etc.
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_triggers_company_type
  ON public.training_triggers (company_id, trigger_type);

CREATE INDEX IF NOT EXISTS idx_training_triggers_module_id
  ON public.training_triggers (module_id);


-- 1.6 training_assignments
-- Per-user training progress across modules:
-- - powers onboarding OS, micro-training, and checkpoints
CREATE TABLE IF NOT EXISTS public.training_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'in_progress', 'completed', 'overdue')),
  progress jsonb DEFAULT '{}'::jsonb,      -- quiz scores, attempts, notes, etc.
  due_date date,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT training_assignments_unique_user_module UNIQUE (user_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_training_assignments_user_status
  ON public.training_assignments (user_id, status);


-- 1.7 compliance_requirements
-- Company-specific compliance / certification requirements:
-- - OSHA training, ladder training, driver eligibility, equipment certs
-- - can be tied to roles + modules
CREATE TABLE IF NOT EXISTS public.compliance_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code text NOT NULL,                      -- 'osha_fall_protection', 'ladder_training', etc.
  name text NOT NULL,
  description text,
  role text,                               -- role this requirement applies to (optional)
  training_module_id uuid REFERENCES public.training_modules(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT compliance_requirements_unique_company_code UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_compliance_requirements_company_role
  ON public.compliance_requirements (company_id, COALESCE(role, ''));


-- 1.8 user_compliance_status
-- Tracks which users are cleared / blocked for each requirement.
-- App logic can block assignments or job dispatch when status != 'completed'.
CREATE TABLE IF NOT EXISTS public.user_compliance_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES public.compliance_requirements(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'expired')),
  completed_at timestamptz,
  expires_at timestamptz,
  evidence jsonb DEFAULT '{}'::jsonb,      -- cert numbers, file references, notes
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_compliance_status_unique_user_requirement UNIQUE (user_id, requirement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_compliance_status_user_status
  ON public.user_compliance_status (user_id, status);


-- 1.9 job_sop_links
-- Attaches SOPs directly to job steps for contextual help:
-- - "Ice & Water Best Practices" on Ice & Water install
-- - "Decking Change Order SOP" when change order step is triggered
CREATE TABLE IF NOT EXISTS public.job_sop_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  sop_id uuid NOT NULL REFERENCES public.sops(id) ON DELETE CASCADE,
  job_step_key text,                       -- internal step code (e.g. 'ice_and_water_install')
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_sop_links_job_step
  ON public.job_sop_links (job_id, COALESCE(job_step_key, ''));


-- RLS: follow existing pattern — backend/service_role manages everything,
-- authenticated clients can read; write is mediated via backend.
ALTER TABLE public.knowledge_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sop_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_compliance_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_sop_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "knowledge_articles_service_role_all" ON public.knowledge_articles
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "sops_service_role_all" ON public.sops
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "sop_versions_service_role_all" ON public.sop_versions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "training_modules_service_role_all" ON public.training_modules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "training_triggers_service_role_all" ON public.training_triggers
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "training_assignments_service_role_all" ON public.training_assignments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "compliance_requirements_service_role_all" ON public.compliance_requirements
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "user_compliance_status_service_role_all" ON public.user_compliance_status
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "job_sop_links_service_role_all" ON public.job_sop_links
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "knowledge_articles_select_authenticated" ON public.knowledge_articles
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "sops_select_authenticated" ON public.sops
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "sop_versions_select_authenticated" ON public.sop_versions
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "training_modules_select_authenticated" ON public.training_modules
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "training_triggers_select_authenticated" ON public.training_triggers
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "training_assignments_select_authenticated" ON public.training_assignments
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "compliance_requirements_select_authenticated" ON public.compliance_requirements
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "user_compliance_status_select_authenticated" ON public.user_compliance_status
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "job_sop_links_select_authenticated" ON public.job_sop_links
  FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE public.knowledge_articles IS 'Block 261600: Central SmartSend knowledge base per company (estimate rules, safety, storm workflows, insurance processes, etc.).';
COMMENT ON TABLE public.sops IS 'Block 261600: Canonical company SOPs with roles, categories, steps, and owner-approved versions.';
COMMENT ON TABLE public.sop_versions IS 'Block 261600: Immutable SOP version history and change log for auditability.';
COMMENT ON TABLE public.training_modules IS 'Block 261600: Role-based micro-training modules powering onboarding paths and SOP-linked lessons.';
COMMENT ON TABLE public.training_triggers IS 'Block 261600: Triggers that assign/require training modules (onboarding days, job-type gates, role events).';
COMMENT ON TABLE public.training_assignments IS 'Block 261600: Per-user training progress and completion status for onboarding and ongoing training.';
COMMENT ON TABLE public.compliance_requirements IS 'Block 261600: Company-specific safety, certification, and compliance requirements tied to roles and training.';
COMMENT ON TABLE public.user_compliance_status IS 'Block 261600: User-level compliance status used to block unsafe work when training or certs are missing.';
COMMENT ON TABLE public.job_sop_links IS 'Block 261600: Job-attached SOP links providing contextual guidance at each job step.';

-- ============================================================================
-- Block 262100 — SmartSend Compliance, Licensing & Regulatory Shield v1
-- Permits, licensing, OSHA, state rules, zero shutdowns
-- ============================================================================

-- 1.1 licenses
-- Centralized license vault per company:
-- - contractor licenses
-- - specialty endorsements
-- - city registrations
-- - insurance & bond references (stored in metadata if needed)
CREATE TABLE IF NOT EXISTS public.licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  license_type text,         -- contractor, specialty, city, etc.
  state text,                -- two-letter state or region code
  license_number text,
  expiration_date date,
  status text,               -- active, expired, suspended
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_licenses_company_state_status_expiration
  ON public.licenses (
    company_id,
    COALESCE(state, ''),
    COALESCE(status, ''),
    expiration_date
  );


-- 1.2 permits
-- Job-level permit enforcement:
-- - ensures "no permit = no start"
-- - powers inspection packs and permit status views
CREATE TABLE IF NOT EXISTS public.permits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  permit_type text,
  permit_number text,
  status text,               -- required, submitted, approved
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permits_job_id_status
  ON public.permits (job_id, COALESCE(status, ''));


-- 1.3 compliance_events
-- Generic compliance event log to back:
-- - inspections (scheduled, surprise, passed, failed)
-- - violations and warnings
-- - OSHA checklists, toolbox talks, safety checks
-- - incidents and follow-up actions
CREATE TABLE IF NOT EXISTS public.compliance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  event_type text,           -- inspection, violation, training, incident, etc.
  evidence jsonb,            -- structured payload: photos, forms, GPS, signatures
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compliance_events_job_event_created
  ON public.compliance_events (job_id, COALESCE(event_type, ''), created_at DESC);


-- RLS: follow existing pattern — backend/service_role manages everything,
-- authenticated clients can read; write is mediated via backend.
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "licenses_service_role_all" ON public.licenses
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "permits_service_role_all" ON public.permits
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "compliance_events_service_role_all" ON public.compliance_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "licenses_select_authenticated" ON public.licenses
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "permits_select_authenticated" ON public.permits
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "compliance_events_select_authenticated" ON public.compliance_events
  FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE public.licenses IS 'Block 262100: Central license vault per company with expiration tracking and status.';
COMMENT ON TABLE public.permits IS 'Block 262100: Job-level permits powering permit-required enforcement and inspection readiness.';
COMMENT ON TABLE public.compliance_events IS 'Block 262100: Generic compliance event log for inspections, violations, OSHA checklists, and incidents.';

-- ============================================================================
-- Block 262200 — SmartSend Legal Defense, Dispute Resolution & Claim Shield v1
-- Lawsuits, chargebacks, insurance disputes, and attorney-ready case files
-- ============================================================================

-- 1.1 legal_cases
-- Job-level legal case file attached to a job, powering:
-- - disputes and chargebacks
-- - lawsuits and insurance claim escalations
-- - owner and attorney command dashboards
CREATE TABLE IF NOT EXISTS public.legal_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  case_type text,             -- dispute, chargeback, lawsuit, insurance
  status text,                -- open, resolved, escalated
  created_at timestamptz DEFAULT now(),
  CONSTRAINT legal_cases_case_type_valid CHECK (case_type IN ('dispute', 'chargeback', 'lawsuit', 'insurance')),
  CONSTRAINT legal_cases_status_valid CHECK (status IN ('open', 'resolved', 'escalated'))
);

CREATE INDEX IF NOT EXISTS idx_legal_cases_job_case_status_created
  ON public.legal_cases (
    job_id,
    COALESCE(case_type, ''),
    COALESCE(status, ''),
    created_at DESC
  );


-- 1.2 legal_evidence
-- Structured evidence items attached to each legal case:
-- - photos, contracts, logs, messages, payment records, timelines
-- - powers auto-compiled evidence packs and attorney-ready exports
CREATE TABLE IF NOT EXISTS public.legal_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid REFERENCES public.legal_cases(id) ON DELETE CASCADE,
  evidence_type text,         -- photo, contract, log, message, payment, timeline
  data jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_evidence_case_type_created
  ON public.legal_evidence (
    case_id,
    COALESCE(evidence_type, ''),
    created_at DESC
  );


-- RLS: backend/service_role manages everything; authenticated can read via app-level rules.
ALTER TABLE public.legal_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "legal_cases_service_role_all" ON public.legal_cases
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "legal_evidence_service_role_all" ON public.legal_evidence
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "legal_cases_select_authenticated" ON public.legal_cases
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "legal_evidence_select_authenticated" ON public.legal_evidence
  FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE public.legal_cases IS 'Block 262200: Job-level legal case files for disputes, chargebacks, lawsuits, and insurance claims.';
COMMENT ON TABLE public.legal_evidence IS 'Block 262200: Structured legal evidence (contracts, photos, logs, messages) attached to each legal case.';

-- ============================================================================
-- Block 263000 — SmartSend Internationalization, Adjacent Trades Expansion & Empire Path v1
-- Multi-trade model, country-by-country rollout, and localization/compliance abstraction
-- ============================================================================

-- 1.1 trades
-- Master catalog of service trades (roofing, solar, siding, HVAC, etc.)
-- "Roofing First" is enforced by:
-- - a single primary trade
-- - that primary must be the 'roofing' key
CREATE TABLE IF NOT EXISTS public.trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,                -- e.g. 'roofing', 'solar', 'hvac'
  name text NOT NULL,               -- human label
  is_primary boolean NOT NULL DEFAULT false, -- true only for the canonical roofing trade
  adjacency_rank int,               -- lower = closer / higher priority expansion from roofing
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb, -- room for per-trade flags (modules, terminology families, etc.)
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trades_key_unique UNIQUE (key),
  CONSTRAINT trades_primary_roofing_only
    CHECK (is_primary = false OR key = 'roofing')
);

-- Only one primary trade allowed (Roofing First).
CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_single_primary
  ON public.trades ((is_primary))
  WHERE is_primary;


-- 1.2 markets
-- Country-by-country rollout model with one canonical currency and locale per market.
CREATE TABLE IF NOT EXISTS public.markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL,        -- ISO 3166-1 alpha-2, e.g. 'US', 'CA'
  name text NOT NULL,                -- e.g. 'United States', 'Canada'
  default_currency text NOT NULL,    -- e.g. 'USD', 'CAD', 'AUD', 'GBP', 'EUR'
  default_locale text NOT NULL,      -- e.g. 'en-US', 'en-CA', 'en-AU', 'en-GB', 'fr-CA'
  rollout_status text NOT NULL DEFAULT 'planned'
    CHECK (rollout_status IN ('planned', 'beta', 'active', 'paused', 'deprecated')),
  rollout_order int,                 -- 1 = first, 2 = second, etc. (US, CA, AU, UK/EU...)
  metadata jsonb DEFAULT '{}'::jsonb, -- tax regimes, regional units, notes
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT markets_country_unique UNIQUE (country_code)
);

CREATE INDEX IF NOT EXISTS idx_markets_rollout_status_order
  ON public.markets (rollout_status, rollout_order);


-- 1.3 trade_market_configs
-- Abstraction layer:
-- IF country = X AND trade = Y THEN apply ruleset Z
-- Used to bind trades + markets to:
-- - compliance & permitting defaults
-- - units (imperial/metric)
-- - tax handling
-- - localized terminology and workflows
CREATE TABLE IF NOT EXISTS public.trade_market_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id uuid NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  ruleset_key text NOT NULL,          -- e.g. 'roofing_us_default', 'solar_au_default'
  units text NOT NULL DEFAULT 'imperial'
    CHECK (units IN ('imperial', 'metric', 'mixed')),
  tax_config jsonb DEFAULT '{}'::jsonb,      -- VAT vs sales tax, GST, etc.
  compliance_profile jsonb DEFAULT '{}'::jsonb, -- license types, permit flows, inspection rules
  localization jsonb DEFAULT '{}'::jsonb,    -- trade-specific terminology, phrasing, and labels
  is_default boolean NOT NULL DEFAULT true,  -- default profile per (trade, market)
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trade_market_configs_trade_market_ruleset_unique
    UNIQUE (trade_id, market_id, ruleset_key)
);

-- Fast lookup for the active default config per trade+market.
CREATE INDEX IF NOT EXISTS idx_trade_market_configs_default
  ON public.trade_market_configs (trade_id, market_id)
  WHERE is_default;


-- 1.4 company_trade_profiles
-- Per-company binding to a trade + market configuration.
-- This isolates trade-specific modules and terminology:
-- - roofers never see HVAC junk
-- - HVAC never sees roofing junk
CREATE TABLE IF NOT EXISTS public.company_trade_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  trade_id uuid NOT NULL REFERENCES public.trades(id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES public.markets(id) ON DELETE CASCADE,
  trade_market_config_id uuid REFERENCES public.trade_market_configs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'beta', 'legacy', 'disabled')),
  config jsonb DEFAULT '{}'::jsonb,        -- per-company overrides: enabled modules, terminology tweaks, etc.
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT company_trade_profiles_unique_company_trade_market
    UNIQUE (company_id, trade_id, market_id)
);

CREATE INDEX IF NOT EXISTS idx_company_trade_profiles_company_status
  ON public.company_trade_profiles (company_id, status);

CREATE INDEX IF NOT EXISTS idx_company_trade_profiles_trade_market
  ON public.company_trade_profiles (trade_id, market_id);


-- RLS: backend/service_role manages everything; authenticated can read via app-level rules.
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_market_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_trade_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trades_service_role_all" ON public.trades
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "markets_service_role_all" ON public.markets
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "trade_market_configs_service_role_all" ON public.trade_market_configs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "company_trade_profiles_service_role_all" ON public.company_trade_profiles
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "trades_select_authenticated" ON public.trades
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "markets_select_authenticated" ON public.markets
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "trade_market_configs_select_authenticated" ON public.trade_market_configs
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "company_trade_profiles_select_authenticated" ON public.company_trade_profiles
  FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE public.trades IS 'Block 263000: Master catalog of service trades (roofing, solar, HVAC, etc.) with Roofing First canonical trade.';
COMMENT ON TABLE public.markets IS 'Block 263000: Country-by-country markets with default currency, locale, and rollout status for SmartSend expansion.';
COMMENT ON TABLE public.trade_market_configs IS 'Block 263000: Trade+market configuration layer mapping (country, trade) -> ruleset for compliance, units, tax, and localization.';
COMMENT ON TABLE public.company_trade_profiles IS 'Block 263000: Per-company trade profiles binding companies to trades, markets, and configs so each trade sees only its own OS.';
