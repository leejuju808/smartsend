-- 1) Niche attribute on profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS niche text CHECK (niche IN ('recruiting','smb','saas','agency') OR niche IS NULL);

COMMENT ON COLUMN public.profiles.niche IS 'Primary customer niche for verticalized UX.';

-- 2) Sequence templates (verticalized library)
CREATE TABLE IF NOT EXISTS public.sequence_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  niche text NOT NULL CHECK (niche IN ('recruiting','smb','saas','agency')),
  use_case text NOT NULL, -- e.g., 'candidate_outreach', 'client_prospecting'
  description text,
  content jsonb NOT NULL, -- { emails: [{subject, body, delay_days, variables:[]}, ...] }
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sequence_templates_niche_idx ON public.sequence_templates (niche);

-- 3) RLS
ALTER TABLE public.sequence_templates ENABLE ROW LEVEL SECURITY;

-- Read-only for authenticated users (so anyone logged in can browse the library)
DROP POLICY IF EXISTS sequence_templates_read ON public.sequence_templates;
CREATE POLICY sequence_templates_read
ON public.sequence_templates
FOR SELECT
TO authenticated
USING (true);

-- Insert/Update/Delete only via service role (API/admin/seeding)
DROP POLICY IF EXISTS sequence_templates_write ON public.sequence_templates;
CREATE POLICY sequence_templates_write
ON public.sequence_templates
FOR ALL
USING (false)
WITH CHECK (false);

-- 4) Helpful trigger for updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_updated_at_sequence_templates ON public.sequence_templates;
CREATE TRIGGER trg_touch_updated_at_sequence_templates
BEFORE UPDATE ON public.sequence_templates
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

-- 5) Seed: Recruiter Outreach Pack (3 sequences)
-- A) Candidate Outreach (software engineer)
INSERT INTO public.sequence_templates (slug, title, niche, use_case, description, content)
VALUES
(
  'recruiting-candidate-software-engineer',
  'Candidate Outreach – Software Engineer (3-step)',
  'recruiting',
  'candidate_outreach',
  'High-reply, short messages that ask for interest + auto-calendar follow-through.',
  '{
    "emails": [
      {
        "subject": "Quick fit check for {{role}} at {{company}}?",
        "body": "Hey {{first_name}},\\n\\nSaw your background in {{skill}} – looks like a match for a {{role}} role with {{company}} ({{comp_highlight}}). 15 min to see if it''s worth your time?\\n\\nIf yes, grab a slot: {{calendar_link}}\\n\\nIf not, no worries – happy to share comp band / team details via email.\\n\\n– {{sender_name}}",
        "delay_days": 0,
        "variables": ["first_name","skill","role","company","comp_highlight","calendar_link","sender_name"]
      },
      {
        "subject": "Worth a 15-min skim?",
        "body": "Hey {{first_name}},\\n\\nTL;DR: {{role}} @ {{company}} building {{product_area}}. Comp: {{comp_band}}. Lead: {{hiring_manager}} (great track record).\\n\\nIf open, here''s my calendar: {{calendar_link}}\\n\\n– {{sender_name}}",
        "delay_days": 3,
        "variables": ["first_name","role","company","product_area","comp_band","hiring_manager","calendar_link","sender_name"]
      },
      {
        "subject": "Close the loop?",
        "body": "Hey {{first_name}},\\n\\nShould I close this thread or send you the full role brief? Happy to tailor to your preferences.\\n\\nCalendar: {{calendar_link}}\\n\\n– {{sender_name}}",
        "delay_days": 5,
        "variables": ["first_name","calendar_link","sender_name"]
      }
    ]
  }'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- B) Client Prospecting (hiring managers)
INSERT INTO public.sequence_templates (slug, title, niche, use_case, description, content)
VALUES
(
  'recruiting-client-hiring-manager',
  'Client Prospecting – Hiring Manager (3-step)',
  'recruiting',
  'client_prospecting',
  'Short proof-first outreach to book scoping calls with hiring managers.',
  '{
    "emails": [
      {
        "subject": "{{first_name}}, 2 resumes in 48h for your {{role}}?",
        "body": "Hi {{first_name}},\\n\\nWe place {{role_plural}} for {{industry}} teams. Average time-to-first-candidate: 48h.\\n\\nIf you have an open {{role}} req at {{company}}, I can share 2 screened profiles + comp calibration on a 15-min call.\\n\\nHere''s a quick slot picker: {{calendar_link}}\\n\\n– {{sender_name}}",
        "delay_days": 0,
        "variables": ["first_name","role","role_plural","industry","company","calendar_link","sender_name"]
      },
      {
        "subject": "2 profiles + comp band (15 min)",
        "body": "Hi {{first_name}},\\n\\nWe just filled {{recent_fill}} and have a pipeline of {{role_plural}} open to {{location}} roles.\\n\\nIf useful, let''s review 2 profiles + a comp sanity check: {{calendar_link}}\\n\\n– {{sender_name}}",
        "delay_days": 4,
        "variables": ["first_name","recent_fill","role_plural","location","calendar_link","sender_name"]
      },
      {
        "subject": "Close the loop @ {{company}}?",
        "body": "Hi {{first_name}},\\n\\nShould I circle back next quarter or is there a live {{role}} need now? 15 min to sanity-check fit: {{calendar_link}}\\n\\n– {{sender_name}}",
        "delay_days": 6,
        "variables": ["first_name","company","role","calendar_link","sender_name"]
      }
    ]
  }'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- C) Client Prospecting – HR/TA leader
INSERT INTO public.sequence_templates (slug, title, niche, use_case, description, content)
VALUES
(
  'recruiting-client-ta-leader',
  'Client Prospecting – TA/HR Leader (2-step)',
  'recruiting',
  'client_prospecting',
  'Meetings with TA leaders focused on time-to-fill and quality.',
  '{
    "emails": [
      {
        "subject": "Cut time-to-first-candidate to 48h for {{role_plural}}",
        "body": "Hi {{first_name}},\\n\\nWe help TA teams reduce time-to-first-candidate to ~48h for {{role_plural}} by combining outbound sourcing + pre-vetted pipelines.\\n\\nOpen to a 15-min test fit? {{calendar_link}}\\n\\n– {{sender_name}}",
        "delay_days": 0,
        "variables": ["first_name","role_plural","calendar_link","sender_name"]
      },
      {
        "subject": "Worth 15 min to pressure-test?",
        "body": "Hi {{first_name}},\\n\\nIf the above isn''t a fit, I''ll close the loop. Otherwise, 15 min to pressure-test targets + comp? {{calendar_link}}\\n\\n– {{sender_name}}",
        "delay_days": 5,
        "variables": ["first_name","calendar_link","sender_name"]
      }
    ]
  }'::jsonb
)
ON CONFLICT (slug) DO NOTHING;