-- Block 77000 — SmartSend Roofing
-- "Campaign Templates + Persona-Based AI Writing Engine" v1
-- Complete implementation of pre-built roofing campaigns + AI personas

-- ============================================================================
-- 1. TEMPLATE CATEGORIES
-- ============================================================================
CREATE TABLE IF NOT EXISTS template_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT, -- optional icon identifier
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_template_categories_display_order ON template_categories(display_order);

-- ============================================================================
-- 2. CAMPAIGN TEMPLATES (Pre-built Roofing Campaigns)
-- ============================================================================
CREATE TABLE IF NOT EXISTS campaign_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES template_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL, -- e.g., "Storm Damage Outreach"
  description TEXT,
  niche TEXT DEFAULT 'roofing', -- for future expansion
  is_global BOOLEAN DEFAULT TRUE, -- true = available to all, false = org-specific
  org_id UUID, -- null = global template
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_templates_category ON campaign_templates(category_id);
CREATE INDEX IF NOT EXISTS idx_campaign_templates_org ON campaign_templates(org_id);
CREATE INDEX IF NOT EXISTS idx_campaign_templates_global ON campaign_templates(is_global);

-- ============================================================================
-- 3. CAMPAIGN TEMPLATE STEPS (4-7 email steps per campaign)
-- ============================================================================
CREATE TABLE IF NOT EXISTS campaign_template_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES campaign_templates(id) ON DELETE CASCADE,
  step_order INT NOT NULL, -- 1, 2, 3, 4, 5, 6, 7
  subject_template TEXT NOT NULL, -- with {{variables}}
  body_template TEXT NOT NULL, -- with {{variables}}
  delay_days INT NOT NULL DEFAULT 0, -- days after previous step (0 = initial)
  tone TEXT DEFAULT 'friendly', -- friendly, professional, straightforward, urgent
  cta_text TEXT, -- call-to-action text
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(template_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_template_steps_template ON campaign_template_steps(template_id, step_order);

-- ============================================================================
-- 4. AI PERSONAS (Writing Profiles)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID, -- null = global persona
  name TEXT NOT NULL, -- "Friendly Neighbor", "Local Expert", etc.
  description TEXT,
  voice_guidelines TEXT NOT NULL, -- detailed instructions for AI
  example_phrases TEXT, -- JSON array of example phrases
  tone_profile JSONB DEFAULT '{}'::jsonb, -- structured tone settings
  is_global BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_personas_org ON ai_personas(org_id);
CREATE INDEX IF NOT EXISTS idx_ai_personas_global ON ai_personas(is_global);

-- ============================================================================
-- 5. AI GENERATED EMAILS (Tracking & Training)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_generated_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID, -- org_id / workspace_id
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  template_id UUID REFERENCES campaign_templates(id) ON DELETE SET NULL,
  persona_id UUID REFERENCES ai_personas(id) ON DELETE SET NULL,
  original_body TEXT, -- before persona rewrite
  final_body TEXT NOT NULL, -- after persona rewrite
  personalization_data JSONB DEFAULT '{}'::jsonb, -- local data used
  spam_score DECIMAL(3,2), -- 0.00 to 1.00
  spam_issues TEXT[], -- array of detected issues
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_generated_campaign ON ai_generated_emails(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ai_generated_template ON ai_generated_emails(template_id);
CREATE INDEX IF NOT EXISTS idx_ai_generated_persona ON ai_generated_emails(persona_id);
CREATE INDEX IF NOT EXISTS idx_ai_generated_company ON ai_generated_emails(company_id);

-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_template_categories_updated_at
  BEFORE UPDATE ON template_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_campaign_templates_updated_at
  BEFORE UPDATE ON campaign_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_template_steps_updated_at
  BEFORE UPDATE ON campaign_template_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_ai_personas_updated_at
  BEFORE UPDATE ON ai_personas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- 7. RLS POLICIES
-- ============================================================================
ALTER TABLE template_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_template_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_generated_emails ENABLE ROW LEVEL SECURITY;

-- Template Categories: Read-only for authenticated users
CREATE POLICY "template_categories_select_all" ON template_categories
  FOR SELECT TO authenticated USING (true);

-- Campaign Templates: Read global + own org templates
CREATE POLICY "campaign_templates_select" ON campaign_templates
  FOR SELECT TO authenticated
  USING (
    is_global = true 
    OR org_id IN (
      SELECT org_id FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "campaign_templates_insert" ON campaign_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "campaign_templates_update" ON campaign_templates
  FOR UPDATE TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Template Steps: Read if template is accessible
CREATE POLICY "template_steps_select" ON campaign_template_steps
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaign_templates ct
      WHERE ct.id = campaign_template_steps.template_id
      AND (
        ct.is_global = true 
        OR ct.org_id IN (
          SELECT org_id FROM workspace_members 
          WHERE user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "template_steps_insert" ON campaign_template_steps
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaign_templates ct
      WHERE ct.id = campaign_template_steps.template_id
      AND ct.org_id IN (
        SELECT org_id FROM workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- AI Personas: Read global + own org personas
CREATE POLICY "ai_personas_select" ON ai_personas
  FOR SELECT TO authenticated
  USING (
    is_global = true 
    OR org_id IN (
      SELECT org_id FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "ai_personas_insert" ON ai_personas
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "ai_personas_update" ON ai_personas
  FOR UPDATE TO authenticated
  USING (
    org_id IN (
      SELECT org_id FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- AI Generated Emails: Read own company's generated emails
CREATE POLICY "ai_generated_emails_select" ON ai_generated_emails
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT org_id FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "ai_generated_emails_insert" ON ai_generated_emails
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (
      SELECT org_id FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 8. SEED DATA: Template Categories
-- ============================================================================
INSERT INTO template_categories (name, description, display_order) VALUES
  ('Storm Damage', 'Outreach campaigns for storm-damaged roofs', 1),
  ('Maintenance', 'Seasonal maintenance and wear & tear campaigns', 2),
  ('Insurance', 'Insurance claim assistance campaigns', 3),
  ('High-End', 'Upscale neighborhood outreach', 4),
  ('Spanish', 'Spanish-language homeowner campaigns', 5),
  ('Solar', 'Solar readiness and combo outreach', 6),
  ('Combo', 'Gutter + roof combo campaigns', 7)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 9. SEED DATA: Default AI Personas
-- ============================================================================
INSERT INTO ai_personas (name, description, voice_guidelines, example_phrases, is_global) VALUES
  (
    'Friendly Neighbor',
    'Warm, approachable, like a trusted neighbor',
    'Write like a friendly neighbor who genuinely cares. Use casual language, avoid jargon, be warm and approachable. Reference local areas naturally. Keep it conversational and human.',
    '["Hey there!", "I noticed your roof", "Happy to help", "Just wanted to check in"]'::text,
    true
  ),
  (
    'Local Roofing Expert',
    'Professional but approachable, with local knowledge',
    'Write as a knowledgeable local professional. Show expertise without being condescending. Reference local weather patterns, common issues in the area, and years of experience. Professional but friendly tone.',
    '["We''ve been serving", "Based on our experience", "Common in this area", "We specialize in"]'::text,
    true
  ),
  (
    'Storm Response Specialist',
    'Urgent but helpful, focused on immediate needs',
    'Write with urgency but remain helpful and professional. Acknowledge the stress of storm damage. Offer immediate assistance. Be clear about next steps. Show empathy for the situation.',
    '["We understand the urgency", "Available immediately", "Storm damage assessment", "Protect your home now"]'::text,
    true
  ),
  (
    'Insurance Claim Helper',
    'Helpful guide through insurance process',
    'Write as a helpful guide through the insurance process. Explain complex terms simply. Offer to handle paperwork. Show understanding of insurance timelines. Be patient and educational.',
    '["We handle all the paperwork", "Insurance can be confusing", "We''ll work with your adjuster", "No out-of-pocket upfront"]'::text,
    true
  ),
  (
    'Straight-Shooter Contractor',
    'Direct, honest, no-nonsense approach',
    'Write directly and honestly. No fluff, no salesy language. Get to the point quickly. Be transparent about pricing and process. Show respect for the homeowner''s time and intelligence.',
    '["Here''s the deal", "No BS", "Straightforward quote", "Let''s be honest"]'::text,
    true
  ),
  (
    'Upscale Professional',
    'Refined, premium service positioning',
    'Write with sophistication and refinement. Use elevated language without being pretentious. Emphasize quality, craftsmanship, and premium service. Appeal to discerning homeowners.',
    '["Premium craftsmanship", "Attention to detail", "Exceptional service", "Quality materials"]'::text,
    true
  )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 10. SEED DATA: Campaign Templates (10 Pre-built Roofing Campaigns)
-- ============================================================================

-- Get category IDs for reference
DO $$
DECLARE
  cat_storm UUID;
  cat_maintenance UUID;
  cat_insurance UUID;
  cat_high_end UUID;
  cat_spanish UUID;
  cat_solar UUID;
  cat_combo UUID;
  template_id UUID;
BEGIN
  -- Get category IDs
  SELECT id INTO cat_storm FROM template_categories WHERE name = 'Storm Damage' LIMIT 1;
  SELECT id INTO cat_maintenance FROM template_categories WHERE name = 'Maintenance' LIMIT 1;
  SELECT id INTO cat_insurance FROM template_categories WHERE name = 'Insurance' LIMIT 1;
  SELECT id INTO cat_high_end FROM template_categories WHERE name = 'High-End' LIMIT 1;
  SELECT id INTO cat_spanish FROM template_categories WHERE name = 'Spanish' LIMIT 1;
  SELECT id INTO cat_solar FROM template_categories WHERE name = 'Solar' LIMIT 1;
  SELECT id INTO cat_combo FROM template_categories WHERE name = 'Combo' LIMIT 1;

  -- ============================================================================
  -- 1. STORM DAMAGE OUTREACH
  -- ============================================================================
  INSERT INTO campaign_templates (category_id, name, description, is_global)
  VALUES (cat_storm, 'Storm Damage Outreach', 'Multi-step campaign for homes with recent storm damage', true)
  RETURNING id INTO template_id;

  INSERT INTO campaign_template_steps (template_id, step_order, subject_template, body_template, delay_days, tone) VALUES
    (template_id, 1, 'Quick check on your roof after {{storm_type}}', 
     'Hey {{first_name}},

I noticed your home in {{neighborhood}} may have been affected by the recent {{storm_type}}.

We''re offering free roof inspections to homeowners in your area. No pressure — just want to make sure you''re protected.

Would tomorrow or this week work for a quick 15-minute inspection?

{{sender_name}}', 0, 'friendly'),
    (template_id, 2, 'Still need help with storm damage?', 
     'Hi {{first_name}},

Just checking in — we''ve been helping a lot of homeowners in {{city}} with storm damage from {{storm_type}}.

If you''d like, I can swing by for a quick inspection and give you a straightforward quote. Takes about 10–15 minutes.

Would tomorrow or Thursday work?

{{sender_name}}', 3, 'friendly'),
    (template_id, 3, 'Should I close your file?', 
     'Hey {{first_name}},

Did you still want a quote for the storm damage?

Totally fine either way — I just don''t want to bother you if you''ve already handled it.

Let me know and I''ll update my notes.

{{sender_name}}', 4, 'straightforward'),
    (template_id, 4, 'Last check-in', 
     'Hi {{first_name}},

This will be my last follow-up — if you still need help with the storm damage, I''m happy to take a look.

If not, just ignore this and I''ll close things out on my end.

All the best,
{{sender_name}}', 7, 'friendly');

  -- ============================================================================
  -- 2. MISSING SHINGLES / WEAR & TEAR
  -- ============================================================================
  INSERT INTO campaign_templates (category_id, name, description, is_global)
  VALUES (cat_maintenance, 'Missing Shingles / Wear & Tear', 'Campaign for homes showing visible roof wear', true)
  RETURNING id INTO template_id;

  INSERT INTO campaign_template_steps (template_id, step_order, subject_template, body_template, delay_days, tone) VALUES
    (template_id, 1, 'Quick question about your roof', 
     'Hey {{first_name}},

I was in your neighborhood recently and noticed some shingles that may need attention on your roof.

We''re offering free inspections to homeowners in {{neighborhood}}. No obligation — just want to make sure everything''s good.

Would a quick 15-minute inspection work for you this week?

{{sender_name}}', 0, 'friendly'),
    (template_id, 2, 'Still thinking about your roof?', 
     'Hi {{first_name}},

Just wanted to check in — small roof issues can turn into bigger problems if left untreated.

We can do a quick inspection and give you an honest assessment. No pressure, just want to help.

Would tomorrow work?

{{sender_name}}', 3, 'professional'),
    (template_id, 3, 'Closing your file', 
     'Hey {{first_name}},

Just wanted to confirm — are you still interested in a roof inspection?

If not, no worries at all. Just let me know and I''ll close this out.

{{sender_name}}', 5, 'straightforward');

  -- ============================================================================
  -- 3. INSURANCE CLAIM ASSISTANCE
  -- ============================================================================
  INSERT INTO campaign_templates (category_id, name, description, is_global)
  VALUES (cat_insurance, 'Insurance Claim Assistance', 'Help homeowners navigate insurance claims', true)
  RETURNING id INTO template_id;

  INSERT INTO campaign_template_steps (template_id, step_order, subject_template, body_template, delay_days, tone) VALUES
    (template_id, 1, 'We can help with your insurance claim', 
     'Hi {{first_name}},

I know dealing with insurance can be overwhelming. We specialize in working with insurance companies to get your roof covered.

We handle all the paperwork, work directly with your adjuster, and make sure you get the coverage you deserve.

Would you like to schedule a free inspection so we can assess the damage and help with your claim?

{{sender_name}}', 0, 'professional'),
    (template_id, 2, 'Insurance claims don''t have to be complicated', 
     'Hi {{first_name}},

Just wanted to follow up — we''ve helped hundreds of homeowners in {{city}} navigate insurance claims successfully.

We''ll handle all the documentation, meet with your adjuster, and make sure everything is done right.

Would a quick call work to discuss your situation?

{{sender_name}}', 4, 'professional'),
    (template_id, 3, 'Still need help with your claim?', 
     'Hey {{first_name}},

I know insurance can be confusing. If you''re still working through a claim, we''re here to help.

No pressure — just want to make sure you get the coverage you deserve.

Let me know if you''d like to chat.

{{sender_name}}', 5, 'friendly');

  -- ============================================================================
  -- 4. SEASONAL MAINTENANCE CHECK
  -- ============================================================================
  INSERT INTO campaign_templates (category_id, name, description, is_global)
  VALUES (cat_maintenance, 'Seasonal Maintenance Check', 'Proactive seasonal roof maintenance outreach', true)
  RETURNING id INTO template_id;

  INSERT INTO campaign_template_steps (template_id, step_order, subject_template, body_template, delay_days, tone) VALUES
    (template_id, 1, 'Quick {{season}} roof check', 
     'Hey {{first_name}},

With {{season}} here, it''s a good time to check on your roof. We''re offering free inspections to homeowners in {{neighborhood}}.

A quick 15-minute inspection can catch small issues before they become big problems.

Would this week work for you?

{{sender_name}}', 0, 'friendly'),
    (template_id, 2, 'Don''t wait for problems', 
     'Hi {{first_name}},

Just wanted to remind you — proactive maintenance saves money in the long run.

We can do a quick inspection and let you know if anything needs attention. No pressure, just peace of mind.

Would tomorrow work?

{{sender_name}}', 4, 'professional');

  -- ============================================================================
  -- 5. FREE ROOF INSPECTION OFFER
  -- ============================================================================
  INSERT INTO campaign_templates (category_id, name, description, is_global)
  VALUES (cat_maintenance, 'Free Roof Inspection Offer', 'Simple no-pressure inspection offer', true)
  RETURNING id INTO template_id;

  INSERT INTO campaign_template_steps (template_id, step_order, subject_template, body_template, delay_days, tone) VALUES
    (template_id, 1, 'Free roof inspection — no obligation', 
     'Hey {{first_name}},

We''re offering free roof inspections to homeowners in {{neighborhood}} this month.

No pressure, no sales pitch — just a quick 15-minute check to make sure everything looks good.

Would this week work for you?

{{sender_name}}', 0, 'friendly'),
    (template_id, 2, 'Still interested in a free inspection?', 
     'Hi {{first_name}},

Just checking in — we still have availability for free roof inspections this week.

Takes about 15 minutes, no obligation. Just want to help homeowners in {{neighborhood}} stay protected.

Would tomorrow work?

{{sender_name}}', 3, 'friendly'),
    (template_id, 3, 'Last chance for free inspection', 
     'Hey {{first_name}},

This is our last week offering free inspections in your area.

If you''re interested, just reply and I''ll get you scheduled. If not, no worries at all.

{{sender_name}}', 4, 'straightforward');

  -- ============================================================================
  -- 6. NO-PRESSURE ESTIMATE SERIES
  -- ============================================================================
  INSERT INTO campaign_templates (category_id, name, description, is_global)
  VALUES (cat_maintenance, 'No-Pressure Estimate Series', 'Low-pressure campaign focused on education', true)
  RETURNING id INTO template_id;

  INSERT INTO campaign_template_steps (template_id, step_order, subject_template, body_template, delay_days, tone) VALUES
    (template_id, 1, 'Thinking about your roof?', 
     'Hey {{first_name}},

I know roof decisions can feel overwhelming. We''re here to help — no pressure, just honest information.

We can do a free inspection and give you a straightforward estimate. You decide what makes sense for you.

Would a quick call work to discuss?

{{sender_name}}', 0, 'friendly'),
    (template_id, 2, 'Here''s what to expect', 
     'Hi {{first_name}},

If you''re still thinking about your roof, here''s what our process looks like:

1. Free inspection (15 minutes)
2. Detailed estimate with options
3. No pressure — you decide

Would you like to schedule an inspection?

{{sender_name}}', 4, 'professional'),
    (template_id, 3, 'No pressure — just checking in', 
     'Hey {{first_name}},

Just wanted to check in — are you still thinking about your roof?

No pressure at all. If you''re ready, we''re here. If not, that''s totally fine too.

Let me know either way.

{{sender_name}}', 5, 'friendly');

  -- ============================================================================
  -- 7. HIGH-END NEIGHBORHOOD OUTREACH
  -- ============================================================================
  INSERT INTO campaign_templates (category_id, name, description, is_global)
  VALUES (cat_high_end, 'High-End Neighborhood Outreach', 'Premium positioning for upscale neighborhoods', true)
  RETURNING id INTO template_id;

  INSERT INTO campaign_template_steps (template_id, step_order, subject_template, body_template, delay_days, tone) VALUES
    (template_id, 1, 'Premium roofing services for {{neighborhood}}', 
     'Hi {{first_name}},

We specialize in premium roofing services for homeowners in {{neighborhood}}.

Our team uses only the highest quality materials and provides exceptional craftsmanship. We understand that your home deserves the best.

Would you be interested in a complimentary inspection to discuss your roofing needs?

{{sender_name}}', 0, 'professional'),
    (template_id, 2, 'Quality craftsmanship matters', 
     'Hi {{first_name}},

Just wanted to follow up — we''ve been serving homeowners in {{neighborhood}} with premium roofing services for years.

We use certified materials, experienced craftsmen, and stand behind our work with comprehensive warranties.

Would a brief call work to discuss your home?

{{sender_name}}', 4, 'professional'),
    (template_id, 3, 'Excellence in every detail', 
     'Hi {{first_name}},

We believe your home deserves exceptional attention to detail.

If you''re considering roofing work, we''d be honored to provide a consultation. No obligation, just an honest assessment.

Would you like to schedule a time?

{{sender_name}}', 5, 'professional');

  -- ============================================================================
  -- 8. SPANISH HOMEOWNER CAMPAIGN
  -- ============================================================================
  INSERT INTO campaign_templates (category_id, name, description, is_global)
  VALUES (cat_spanish, 'Spanish Homeowner Campaign', 'Spanish-language roofing outreach', true)
  RETURNING id INTO template_id;

  INSERT INTO campaign_template_steps (template_id, step_order, subject_template, body_template, delay_days, tone) VALUES
    (template_id, 1, 'Inspección gratuita de su techo', 
     'Hola {{first_name}},

Ofrecemos inspecciones gratuitas de techos para propietarios en {{neighborhood}}.

Sin presión, sin compromiso — solo queremos asegurarnos de que su techo esté en buenas condiciones.

¿Le funcionaría esta semana?

{{sender_name}}', 0, 'friendly'),
    (template_id, 2, '¿Aún necesita ayuda con su techo?', 
     'Hola {{first_name}},

Solo quería verificar — hemos estado ayudando a muchos propietarios en {{city}} con sus techos.

Si le gustaría, puedo pasar para una inspección rápida y darle un presupuesto directo. Toma unos 10–15 minutos.

¿Le funcionaría mañana o el jueves?

{{sender_name}}', 3, 'friendly'),
    (template_id, 3, 'Última verificación', 
     'Hola {{first_name}},

Esta será mi última verificación — si aún necesita ayuda con su techo, estaré encantado de echar un vistazo.

Si no, simplemente ignore esto y cerraré las cosas de mi lado.

Que tenga un buen día,
{{sender_name}}', 5, 'friendly');

  -- ============================================================================
  -- 9. SOLAR READINESS OUTREACH
  -- ============================================================================
  INSERT INTO campaign_templates (category_id, name, description, is_global)
  VALUES (cat_solar, 'Solar Readiness Outreach', 'Roofing + solar combo outreach', true)
  RETURNING id INTO template_id;

  INSERT INTO campaign_template_steps (template_id, step_order, subject_template, body_template, delay_days, tone) VALUES
    (template_id, 1, 'Is your roof ready for solar?', 
     'Hey {{first_name}},

Thinking about solar? Your roof needs to be in good shape first.

We can do a free inspection to see if your roof is solar-ready, or if it needs work before you install panels.

Would this week work for a quick check?

{{sender_name}}', 0, 'friendly'),
    (template_id, 2, 'Roof + solar = smart investment', 
     'Hi {{first_name}},

Just wanted to follow up — if you''re considering solar, now might be the perfect time to address any roof issues.

We can assess your roof and let you know if it''s ready for solar, or what needs to be done first.

Would a quick call work?

{{sender_name}}', 4, 'professional'),
    (template_id, 3, 'Solar-ready roof check', 
     'Hey {{first_name}},

Still thinking about solar? We can check if your roof is ready.

No pressure — just want to make sure you have all the information you need.

Let me know if you''d like to schedule an inspection.

{{sender_name}}', 5, 'friendly');

  -- ============================================================================
  -- 10. GUTTER + ROOF COMBO OUTREACH
  -- ============================================================================
  INSERT INTO campaign_templates (category_id, name, description, is_global)
  VALUES (cat_combo, 'Gutter + Roof Combo Outreach', 'Combined roofing and gutter services', true)
  RETURNING id INTO template_id;

  INSERT INTO campaign_template_steps (template_id, step_order, subject_template, body_template, delay_days, tone) VALUES
    (template_id, 1, 'Roof + gutters = complete protection', 
     'Hey {{first_name}},

Your roof and gutters work together to protect your home. If one needs attention, the other often does too.

We''re offering free inspections for both. No pressure — just want to make sure everything''s working together properly.

Would this week work?

{{sender_name}}', 0, 'friendly'),
    (template_id, 2, 'Complete home protection', 
     'Hi {{first_name}},

Just wanted to follow up — we specialize in both roofing and gutter services, so we can give you a complete picture of your home''s protection.

We can do a free inspection of both and give you honest recommendations.

Would tomorrow work?

{{sender_name}}', 3, 'professional'),
    (template_id, 3, 'Roof and gutter check', 
     'Hey {{first_name}},

Still thinking about your roof and gutters? We can do a quick inspection of both and give you a straightforward assessment.

No pressure — just want to help.

Let me know if you''d like to schedule.

{{sender_name}}', 4, 'friendly');

END $$;



























