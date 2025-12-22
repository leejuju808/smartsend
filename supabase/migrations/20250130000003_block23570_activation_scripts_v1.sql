-- Block 23570 — SmartSend Roofing Activation Scripts v1
-- (Onboarding Call Script • First Wins • Retention Engine • How This Helps Roofers Make Money)
-- FULL ACTIVATION PACKAGE — ZERO FLUFF.

-- ============================================================================
-- ACTIVATION SCRIPTS TABLE
-- ============================================================================
-- Stores all activation scripts, checklists, and guidance for onboarding calls

CREATE TABLE IF NOT EXISTS activation_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_type TEXT NOT NULL CHECK (script_type IN (
    'call_part',           -- Part 1, 2, 3 of the activation call
    'followup_script',     -- 24-hour, 48-hour, 7-day follow-ups
    'checklist',           -- Activation win checklist
    'red_flag',           -- Red flags to watch for
    'psychology_insight'   -- Psychology insights
  )),
  script_key TEXT NOT NULL, -- e.g. 'welcome_expectations', '48_hour_followup', 'win_checklist'
  title TEXT NOT NULL,
  script_content TEXT NOT NULL, -- The actual script text
  why_it_helps TEXT, -- Explanation of why this helps roofers
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(script_key)
);

CREATE INDEX IF NOT EXISTS idx_activation_scripts_type ON activation_scripts(script_type);
CREATE INDEX IF NOT EXISTS idx_activation_scripts_key ON activation_scripts(script_key);
CREATE INDEX IF NOT EXISTS idx_activation_scripts_active ON activation_scripts(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_activation_scripts_order ON activation_scripts(display_order);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_activation_scripts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_activation_scripts_updated_at
BEFORE UPDATE ON activation_scripts
FOR EACH ROW
EXECUTE FUNCTION update_activation_scripts_updated_at();

-- ============================================================================
-- SEED ACTIVATION SCRIPTS
-- ============================================================================

-- PART 1: Welcome & Expectations
INSERT INTO activation_scripts (script_type, script_key, title, script_content, why_it_helps, display_order) VALUES
('call_part', 'welcome_expectations', 
  'Part 1: Welcome & Set Expectations',
  'Awesome — welcome to SmartSend.

My goal right now is simple: get your first campaign live so you start getting homeowner replies in the next 24–48 hours.',
  'Roofers don''t care about onboarding. They care about booked estimates. This statement aligns SmartSend with THAT goal.',
  1)
ON CONFLICT (script_key) DO UPDATE SET
  script_content = EXCLUDED.script_content,
  why_it_helps = EXCLUDED.why_it_helps,
  updated_at = now();

-- PART 2: Account Foundations (4 Questions)
INSERT INTO activation_scripts (script_type, script_key, title, script_content, why_it_helps, display_order) VALUES
('call_part', 'account_foundations',
  'Part 2: Account Foundations (4 Questions)',
  'What city should SmartSend reference in your outreach?

What''s the best phone number for homeowners?

What type of estimates should we focus on — repair, replacement, or both?

Do you already have an existing homeowner or lead list?

[Then YOU enter the info]',
  'They don''t have to type or think — you''re doing the work. Roofers LOVE done-for-you.',
  2)
ON CONFLICT (script_key) DO UPDATE SET
  script_content = EXCLUDED.script_content,
  why_it_helps = EXCLUDED.why_it_helps,
  updated_at = now();

-- PART 3: Launch First Campaign - Option A (Lead Revival)
INSERT INTO activation_scripts (script_type, script_key, title, script_content, why_it_helps, display_order) VALUES
('call_part', 'launch_campaign_revival',
  'Part 3: Launch First Campaign — Option A (Lead Revival)',
  'I''m going to set up your first campaign for you.

This is the one that generates fast results for roofers.

[Choose Option A — Lead Revival Campaign]

This campaign revives old leads — the ones you never had time to follow up with.

These turn into quick estimates.

[Preview the AI-generated message]

Here''s the exact message SmartSend will send for you.

[Roofers ALWAYS say: "That looks good."]

Perfect — let''s launch it.

[Click Launch Campaign while they watch]',
  'Roofers constantly lose money from NOT following up. SmartSend FIXES the leak.',
  3)
ON CONFLICT (script_key) DO UPDATE SET
  script_content = EXCLUDED.script_content,
  why_it_helps = EXCLUDED.why_it_helps,
  updated_at = now();

-- PART 3: Launch First Campaign - Option B (Free Inspection)
INSERT INTO activation_scripts (script_type, script_key, title, script_content, why_it_helps, display_order) VALUES
('call_part', 'launch_campaign_inspection',
  'Part 3: Launch First Campaign — Option B (Free Inspection)',
  'I''m going to set up your first campaign for you.

This is the one that generates fast results for roofers.

[Choose Option B — Free Inspection / Estimate Campaign]

This campaign puts you directly in front of homeowners needing roof work right now.

[Preview the AI-generated message]

Here''s the exact message SmartSend will send for you.

[Roofers ALWAYS say: "That looks good."]

Perfect — let''s launch it.

[Click Launch Campaign while they watch]',
  'Roofers see SmartSend as a lead generator, not software.',
  4)
ON CONFLICT (script_key) DO UPDATE SET
  script_content = EXCLUDED.script_content,
  why_it_helps = EXCLUDED.why_it_helps,
  updated_at = now();

-- FIRST WIN SCRIPT (Immediately After Launch)
INSERT INTO activation_scripts (script_type, script_key, title, script_content, why_it_helps, display_order) VALUES
('followup_script', 'first_win',
  'The "First Win" Script (Immediately After Launch)',
  'You''re officially live.

You''ll start seeing homeowner replies within the next 1–2 days.

I''ll check in with you after your first replies to help you close them.',
  'They feel supported. They feel momentum. They feel ROI before it happens.',
  5)
ON CONFLICT (script_key) DO UPDATE SET
  script_content = EXCLUDED.script_content,
  why_it_helps = EXCLUDED.why_it_helps,
  updated_at = now();

-- 24-HOUR FOLLOW-UP SCRIPT
INSERT INTO activation_scripts (script_type, script_key, title, script_content, why_it_helps, display_order) VALUES
('followup_script', '24_hour_followup',
  '24-Hour Follow-Up Script (Results Support)',
  'Hey, just checking your dashboard — campaign is running smoothly.

Reply rate usually starts within 24–48 hours.

I''ll help you with your first responses so you can book the estimates.',
  'Roofers don''t know the best messaging tone for homeowners. YOU help them → they close more → SmartSend looks more powerful.',
  6)
ON CONFLICT (script_key) DO UPDATE SET
  script_content = EXCLUDED.script_content,
  why_it_helps = EXCLUDED.why_it_helps,
  updated_at = now();

-- 48-HOUR LEAD CHECK-IN SCRIPT
INSERT INTO activation_scripts (script_type, script_key, title, script_content, why_it_helps, display_order) VALUES
('followup_script', '48_hour_checkin',
  '48-Hour "Lead Check-In" Script',
  'Saw a few opens coming in — that''s a good sign.

As soon as replies hit, I''ll walk you through the responses so you maximize booked estimates.',
  'They know SmartSend is monitoring their performance. This rescues disengaged roofers.',
  7)
ON CONFLICT (script_key) DO UPDATE SET
  script_content = EXCLUDED.script_content,
  why_it_helps = EXCLUDED.why_it_helps,
  updated_at = now();

-- 7-DAY RETENTION SCRIPT
INSERT INTO activation_scripts (script_type, script_key, title, script_content, why_it_helps, display_order) VALUES
('followup_script', '7_day_retention',
  '7-Day Retention Script (THE MOST IMPORTANT)',
  'You''ve had SmartSend running for a week.

You have X replies and Y leads so far.

Want me to launch your next campaign to keep your crews busy?',
  'Roofers love being told what to do when it grows their business. This keeps them ACTIVE → ACTIVE USERS STAY SUBSCRIBED.',
  8)
ON CONFLICT (script_key) DO UPDATE SET
  script_content = EXCLUDED.script_content,
  why_it_helps = EXCLUDED.why_it_helps,
  updated_at = now();

-- ACTIVATION RED FLAGS
INSERT INTO activation_scripts (script_type, script_key, title, script_content, why_it_helps, display_order) VALUES
('red_flag', 'activation_red_flags',
  'Activation Red Flags (When You Must Intervene)',
  'Intervene if:

• They haven''t uploaded a list
• They haven''t launched a campaign
• They have 0 replies by day 3
• Their open rate is under 20%
• They ignore the dashboard',
  'Roofers fail from inactivity, not lack of value. You push them into momentum.',
  9)
ON CONFLICT (script_key) DO UPDATE SET
  script_content = EXCLUDED.script_content,
  why_it_helps = EXCLUDED.why_it_helps,
  updated_at = now();

-- ACTIVATION WIN CHECKLIST
INSERT INTO activation_scripts (script_type, script_key, title, script_content, why_it_helps, display_order) VALUES
('checklist', 'activation_win_checklist',
  'Activation Win Checklist (DO NOT END CALL UNTIL THESE ARE DONE)',
  '✓ Stripe subscription active
✓ Account created
✓ City + phone set
✓ Lead list imported (or committed)
✓ First campaign launched
✓ 48-hour follow-up scheduled
✓ Next campaign suggested
✓ Retention sequence triggered',
  'Everything feels COMPLETE. Roofers leave the call thinking: "Damn, this thing is actually doing work for me." That''s retention.',
  10)
ON CONFLICT (script_key) DO UPDATE SET
  script_content = EXCLUDED.script_content,
  why_it_helps = EXCLUDED.why_it_helps,
  updated_at = now();

-- PSYCHOLOGY OF ROOFERS DURING ACTIVATION
INSERT INTO activation_scripts (script_type, script_key, title, script_content, why_it_helps, display_order) VALUES
('psychology_insight', 'roofer_psychology',
  'The Psychology of Roofers During Activation',
  'Roofers feel:

• Overwhelmed
• Distracted
• Unsure if it will work
• Too busy to learn something

Your job is to create one feeling:

👉 "This is easy. This is making me money already."

Once they feel that → you''ve locked in a long-term user.',
  'Understanding roofer psychology helps you guide them through activation with empathy and focus on what matters: immediate ROI.',
  11)
ON CONFLICT (script_key) DO UPDATE SET
  script_content = EXCLUDED.script_content,
  why_it_helps = EXCLUDED.why_it_helps,
  updated_at = now();

-- ============================================================================
-- HELPER FUNCTION: Get Scripts by Type
-- ============================================================================

CREATE OR REPLACE FUNCTION get_activation_scripts(p_script_type TEXT DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  script_type TEXT,
  script_key TEXT,
  title TEXT,
  script_content TEXT,
  why_it_helps TEXT,
  display_order INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.script_type,
    s.script_key,
    s.title,
    s.script_content,
    s.why_it_helps,
    s.display_order
  FROM activation_scripts s
  WHERE s.is_active = TRUE
    AND (p_script_type IS NULL OR s.script_type = p_script_type)
  ORDER BY s.display_order ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE activation_scripts ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role can manage activation scripts"
  ON activation_scripts
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated users can read scripts
CREATE POLICY "Authenticated users can read activation scripts"
  ON activation_scripts
  FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE activation_scripts IS 'Block 23570: Stores activation scripts, checklists, and guidance for onboarding calls with roofers';
COMMENT ON FUNCTION get_activation_scripts(TEXT) IS 'Block 23570: Get activation scripts by type (call_part, followup_script, checklist, red_flag, psychology_insight)';






































