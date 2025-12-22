-- ============================================================================
-- Block 23360 — SmartSend Roofing Outreach Funnel v1
-- "Script • Email Sequence • DM Templates • Demo Push System"
-- ============================================================================
-- This funnel builds the EXACT outreach machine to book demos and close roofing companies.
-- It ties directly into SmartSend's identity:
-- - We sell outcomes, not software
-- - We speak like roofers
-- - We keep it simple
-- - We focus on revenue, scheduling, chaos reduction
-- - We demonstrate value BEFORE the demo
-- ============================================================================

-- ============================================================================
-- PART 1 — Outreach Funnel Templates Table
-- ============================================================================
-- Stores all outreach templates: master script, email, DMs, follow-ups, objection killers

CREATE TABLE IF NOT EXISTS public.outreach_funnel_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Template Classification
  template_type text NOT NULL CHECK (template_type IN (
    'master_script',
    'email',
    'facebook_dm',
    'instagram_dm',
    'linkedin_dm',
    'followup_sequence',
    'objection_killer',
    'demo_push',
    'silent_forge_targeting'
  )),
  
  -- Template Details
  template_name text NOT NULL, -- e.g., 'Master Script', 'Follow-Up #1', 'Too Busy Objection'
  template_key text NOT NULL UNIQUE, -- e.g., 'master_script', 'followup_1', 'objection_too_busy'
  
  -- Content
  subject_line text, -- For email templates
  message_body text NOT NULL, -- The actual template content
  cta_text text, -- Call-to-action text if separate
  
  -- Sequence Information (for follow-ups)
  sequence_step integer, -- 1, 2, 3 for follow-up sequences
  delay_days integer, -- Days to wait before sending (for follow-ups)
  
  -- Objection Information (for objection killers)
  objection_type text, -- e.g., 'too_busy', 'has_jobnimbus', 'no_ai', 'good_right_now'
  response_type text, -- 'direct_response' | 'question' | 'value_prop'
  
  -- Demo Push Information
  demo_push_step integer, -- 1, 2, 3 for demo push sequence
  is_binary_choice boolean DEFAULT false, -- Force binary choice (today/tomorrow)
  
  -- Metadata
  description text, -- Human-readable description
  usage_notes text, -- How to use this template
  variables jsonb DEFAULT '{}'::jsonb, -- Available variables like {{name}}, {{first_name}}
  
  -- Stats
  times_used integer DEFAULT 0,
  last_used_at timestamptz,
  
  -- System
  is_active boolean DEFAULT true,
  is_default boolean DEFAULT true, -- System templates are default
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_outreach_funnel_type ON public.outreach_funnel_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_outreach_funnel_key ON public.outreach_funnel_templates(template_key);
CREATE INDEX IF NOT EXISTS idx_outreach_funnel_sequence ON public.outreach_funnel_templates(sequence_step, delay_days) WHERE sequence_step IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outreach_funnel_objection ON public.outreach_funnel_templates(objection_type) WHERE objection_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outreach_funnel_active ON public.outreach_funnel_templates(is_active) WHERE is_active = true;

-- ============================================================================
-- PART 2 — Seed Master Outreach Script
-- ============================================================================

INSERT INTO public.outreach_funnel_templates (
  template_type,
  template_name,
  template_key,
  message_body,
  description,
  usage_notes,
  variables
) VALUES (
  'master_script',
  'Master Outreach Script',
  'master_script',
  'Hey {{name}}, quick question —

Are you open to something that would help your roofing company book homeowner jobs automatically and run them with less office chaos?

I built a new system that handles:

• Follow-up
• Scheduling
• Documents
• Payments
• Homeowner updates
• AI job insights

All in one place.

I''m looking for 5–10 roofing companies to test it privately.

Want to see a 5-minute demo?',
  'Universal first-touch message that works across email, DM, text, or cold call',
  'Use this EXACTLY as written. It hits EVERY roofer pain point. Short, outcome-based, and irresistible.',
  '{"name": "Contact first name", "first_name": "Contact first name"}'
) ON CONFLICT (template_key) DO NOTHING;

-- ============================================================================
-- PART 3 — Email Templates
-- ============================================================================

INSERT INTO public.outreach_funnel_templates (
  template_type,
  template_name,
  template_key,
  subject_line,
  message_body,
  description,
  usage_notes,
  variables
) VALUES 
-- Email Subject Lines
(
  'email',
  'Email Subject Line 1',
  'email_subject_1',
  'Quick question about your roofing operations',
  NULL,
  'Subject line option 1',
  'Use for initial outreach email',
  '{}'
),
(
  'email',
  'Email Subject Line 2',
  'email_subject_2',
  'A new system for roofing companies',
  NULL,
  'Subject line option 2',
  'Use for initial outreach email',
  '{}'
),
(
  'email',
  'Email Subject Line 3',
  'email_subject_3',
  'Would this help your roofing business?',
  NULL,
  'Subject line option 3',
  'Use for initial outreach email',
  '{}'
),
(
  'email',
  'Email Subject Line 4',
  'email_subject_4',
  'Something to make your roofing jobs easier?',
  NULL,
  'Subject line option 4',
  'Use for initial outreach email',
  '{}'
),
-- Email Body Template
(
  'email',
  'Outreach Email Body',
  'email_body_v1',
  NULL,
  'Hey {{name}},

I''m reaching out because I built a new tool specifically for roofing companies that:

books more homeowner jobs

handles all follow-up automatically

manages scheduling + crews

sends contracts + change orders

collects deposits

updates homeowners

prevents delays

catches margin issues

reduces office chaos

It''s called SmartSend — and I''m putting together a small, private test group.

If you''re open to it, I can show you a 5-minute demo so you can see if it helps your business.

Want to check it out?

— {{sender_name}}
Founder, SmartSend AI',
  'Perfect for roofers — simple, direct, and purely practical',
  'Use with any of the subject lines above. Personalize {{name}} and {{sender_name}}.',
  '{"name": "Contact first name", "sender_name": "Your name"}'
) ON CONFLICT (template_key) DO NOTHING;

-- ============================================================================
-- PART 4 — DM Templates
-- ============================================================================

INSERT INTO public.outreach_funnel_templates (
  template_type,
  template_name,
  template_key,
  message_body,
  description,
  usage_notes,
  variables
) VALUES 
-- Facebook DM
(
  'facebook_dm',
  'Facebook DM Template',
  'facebook_dm_v1',
  'Hey {{name}},

I built a new tool that helps roofing companies book homeowner jobs automatically and run jobs smoother (scheduling, documents, payments, etc).

I''m opening 5–10 spots for early testers.
Want a quick demo?',
  'Facebook DM template - shorter than email',
  'DMs MUST be shorter than emails. Use this exact format.',
  '{"name": "Contact first name"}'
),
-- Instagram DM
(
  'instagram_dm',
  'Instagram DM Template',
  'instagram_dm_v1',
  'Hey {{name}}, I built something for roofing companies that books jobs + runs jobs automatically.

I''m showing it to a few owners this week — want to see it?',
  'Instagram DM template - shortest format',
  'Even shorter than Facebook. Get straight to the point.',
  '{"name": "Contact first name"}'
),
-- LinkedIn DM (Commercial Roofing)
(
  'linkedin_dm',
  'LinkedIn DM Template',
  'linkedin_dm_v1',
  'Hey {{name}}, I''m building an AI-based operating system for roofing companies — scheduling, documents, payments, field updates, everything in one spot.

Testing with 5–10 companies.
Open to a quick demo?',
  'LinkedIn DM template for commercial roofers',
  'Slightly more professional tone for LinkedIn/commercial roofing context.',
  '{"name": "Contact first name"}'
) ON CONFLICT (template_key) DO NOTHING;

-- ============================================================================
-- PART 5 — Follow-Up Sequence (3 Messages)
-- ============================================================================

INSERT INTO public.outreach_funnel_templates (
  template_type,
  template_name,
  template_key,
  message_body,
  sequence_step,
  delay_days,
  description,
  usage_notes,
  variables
) VALUES 
-- Follow-Up #1 (1 day later)
(
  'followup_sequence',
  'Follow-Up #1',
  'followup_1',
  'Just checking in — want to see how SmartSend books jobs + runs them automatically?',
  1,
  1,
  'First follow-up - short and direct',
  'Send 1 day after initial outreach. Short, direct, friendly.',
  '{}'
),
-- Follow-Up #2 (2-3 days later)
(
  'followup_sequence',
  'Follow-Up #2',
  'followup_2',
  'Still open to taking a look?

Roofers testing SmartSend are seeing better scheduling + faster payments.',
  2,
  3,
  'Second follow-up - adds social proof',
  'Send 2-3 days after follow-up #1. Adds social proof to build credibility.',
  '{}'
),
-- Follow-Up #3 (Final nudge)
(
  'followup_sequence',
  'Follow-Up #3',
  'followup_3',
  'No worries if not — just let me know.

Happy to show you how it works if you''re curious.',
  3,
  5,
  'Final follow-up - respectful opt-out',
  'Final nudge. Respectful opt-out option. PROVEN to convert.',
  '{}'
) ON CONFLICT (template_key) DO NOTHING;

-- ============================================================================
-- PART 6 — Objection Killers
-- ============================================================================

INSERT INTO public.outreach_funnel_templates (
  template_type,
  template_name,
  template_key,
  message_body,
  objection_type,
  response_type,
  description,
  usage_notes,
  variables
) VALUES 
-- "I'm too busy right now"
(
  'objection_killer',
  'Too Busy Objection',
  'objection_too_busy',
  'That''s exactly when SmartSend helps the most.

Let me show you how it removes 60% of the office work.',
  'too_busy',
  'direct_response',
  'Killer response for "too busy" objection',
  'Turn their objection into a value prop. Show immediate relief.',
  '{}'
),
-- "We already have JobNimbus"
(
  'objection_killer',
  'Has JobNimbus Objection',
  'objection_has_jobnimbus',
  'Totally — SmartSend isn''t trying to replace your CRM.

It handles all the stuff JobNimbus doesn''t do:
follow-up, scheduling intelligence, documents, payments, homeowner updates.',
  'has_jobnimbus',
  'value_prop',
  'Killer response for JobNimbus users',
  'If they have JobNimbus, SELL scheduling problems. Position as complement, not replacement.',
  '{}'
),
-- "We don't need AI"
(
  'objection_killer',
  'No AI Objection',
  'objection_no_ai',
  'SmartSend isn''t chatbots or fluff — it''s AI that runs your jobs.

It predicts delays, catches margin issues early, and automates follow-up.',
  'no_ai',
  'value_prop',
  'Killer response for AI skeptics',
  'Clarify what AI means. Focus on practical outcomes, not buzzwords.',
  '{}'
),
-- "We're good right now"
(
  'objection_killer',
  'Good Right Now Objection',
  'objection_good_right_now',
  'Totally get it — but most roofers don''t realize how many jobs they lose from slow follow-up and scheduling errors until they fix it.

Let me show you a 5-minute preview just in case it can help.',
  'good_right_now',
  'question',
  'Killer response for "we''re good"',
  'Acknowledge, then reframe the problem. Make them curious.',
  '{}'
) ON CONFLICT (template_key) DO NOTHING;

-- ============================================================================
-- PART 7 — Demo Push System
-- ============================================================================

INSERT INTO public.outreach_funnel_templates (
  template_type,
  template_name,
  template_key,
  message_body,
  demo_push_step,
  is_binary_choice,
  description,
  usage_notes,
  variables
) VALUES 
-- Step 1: Force binary choice
(
  'demo_push',
  'Demo Push Step 1',
  'demo_push_step_1',
  'Perfect — what''s better for you?

Today or tomorrow?',
  1,
  true,
  'First demo push - force binary choice',
  'When roofer says "yes" or shows interest, IMMEDIATELY reply with this. Force binary choice. NEVER ask "when works for you?"',
  '{}'
),
-- Step 2: Narrow down time
(
  'demo_push',
  'Demo Push Step 2',
  'demo_push_step_2',
  'Morning or afternoon?',
  2,
  true,
  'Second demo push - narrow time window',
  'After they pick "tomorrow", immediately narrow to morning/afternoon.',
  '{}'
),
-- Step 3: Lock in time and get email
(
  'demo_push',
  'Demo Push Step 3',
  'demo_push_step_3',
  'Cool — let''s do {{time}}.

What email should I send the meeting link to?',
  3,
  false,
  'Final demo push - lock in time',
  'After they pick time, lock it in and get their email. Done.',
  '{"time": "Specific time like 2:30 PM"}'
) ON CONFLICT (template_key) DO NOTHING;

-- ============================================================================
-- PART 8 — Silent Forge Targeting Script
-- ============================================================================

INSERT INTO public.outreach_funnel_templates (
  template_type,
  template_name,
  template_key,
  message_body,
  description,
  usage_notes,
  variables
) VALUES (
  'silent_forge_targeting',
  'Silent Forge Targeting Script',
  'silent_forge_targeting',
  'I''m building a private beta group of 5–10 roofing companies to use SmartSend before the public launch.

You get:
• priority onboarding
• lifetime discounted pricing
• done-for-you setup
• direct access to the founder
• and we''ll help run one of your jobs in the system

Want to see it?',
  'Exclusivity-based targeting script',
  'Roofers LOVE exclusivity. This message gets EXCELLENT results. Use for Silent Forge beta group.',
  '{}'
) ON CONFLICT (template_key) DO NOTHING;

-- ============================================================================
-- PART 9 — RLS Policies
-- ============================================================================

ALTER TABLE public.outreach_funnel_templates ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "outreach_funnel_templates_service_role_all" ON public.outreach_funnel_templates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated users can read templates
CREATE POLICY "outreach_funnel_templates_select_authenticated" ON public.outreach_funnel_templates
  FOR SELECT TO authenticated
  USING (true);

-- ============================================================================
-- PART 10 — Helper Functions
-- ============================================================================

-- Function to get template by key
CREATE OR REPLACE FUNCTION public.get_outreach_template(p_template_key text)
RETURNS public.outreach_funnel_templates
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM public.outreach_funnel_templates
  WHERE template_key = p_template_key
    AND is_active = true
  LIMIT 1;
$$;

-- Function to get follow-up sequence
CREATE OR REPLACE FUNCTION public.get_followup_sequence()
RETURNS TABLE (
  step integer,
  delay_days integer,
  message_body text,
  template_key text
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    sequence_step,
    delay_days,
    message_body,
    template_key
  FROM public.outreach_funnel_templates
  WHERE template_type = 'followup_sequence'
    AND is_active = true
  ORDER BY sequence_step ASC;
$$;

-- Function to get objection killer by type
CREATE OR REPLACE FUNCTION public.get_objection_killer(p_objection_type text)
RETURNS public.outreach_funnel_templates
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM public.outreach_funnel_templates
  WHERE template_type = 'objection_killer'
    AND objection_type = p_objection_type
    AND is_active = true
  LIMIT 1;
$$;

-- Function to get demo push sequence
CREATE OR REPLACE FUNCTION public.get_demo_push_sequence()
RETURNS TABLE (
  step integer,
  message_body text,
  is_binary_choice boolean,
  template_key text
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    demo_push_step,
    message_body,
    is_binary_choice,
    template_key
  FROM public.outreach_funnel_templates
  WHERE template_type = 'demo_push'
    AND is_active = true
  ORDER BY demo_push_step ASC;
$$;

-- ============================================================================
-- PART 11 — Update Trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION update_outreach_funnel_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_outreach_funnel_templates_updated_at
BEFORE UPDATE ON public.outreach_funnel_templates
FOR EACH ROW
EXECUTE FUNCTION update_outreach_funnel_templates_updated_at();

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================







































