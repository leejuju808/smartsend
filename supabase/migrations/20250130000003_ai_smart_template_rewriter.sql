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
    FALSE, 'neutral')
ON CONFLICT DO NOTHING;

