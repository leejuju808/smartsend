-- =========================================================
-- Block 59000 — SmartSend Roofing "AI Sales Coach + Objection Handling System" v1
-- (REAL-TIME OBJECTION RESPONSES • AI SALES SCRIPTS • FOLLOW-UP GENERATOR • DEAL-SAVING PROMPTS • SALES COACHING DASHBOARD)
-- =========================================================
-- 
-- This block makes SmartSend not just an operations system...
-- Not just a production system...
-- But a full-blown SALES CLOSING ENGINE.
--
-- Features:
-- - AI Objection Response Engine
-- - Sales Script Generator (AI-Powered)
-- - Deal Rescue AI Follow-Up Generator
-- - Sales Coaching Dashboard
-- - Sales Follow-Up Sequences
-- - Sales Confidence Prompter (On-Call AI)
-- =========================================================

-- =========================================================
-- 1. SALES_OBJECTIONS TABLE
-- =========================================================
-- Tracks homeowner objections and AI-generated responses
CREATE TABLE IF NOT EXISTS public.sales_objections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE CASCADE,
  homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  objection_text text NOT NULL,
  objection_type text, -- 'price', 'timing', 'competitor', 'insurance', 'thinking', 'other'
  ai_response text, -- Full AI-generated response
  verbal_script text, -- What to say verbally
  text_message text, -- Text/SMS version
  email_message text, -- Email version
  confidence_script text, -- Confidence-building script
  risk_removal_sentence text, -- Risk removal statement
  follow_up_plan text, -- Follow-up strategy
  psychological_angle text, -- Psychological approach
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_objections_proposal_id ON public.sales_objections(proposal_id);
CREATE INDEX IF NOT EXISTS idx_sales_objections_homeowner_id ON public.sales_objections(homeowner_id);
CREATE INDEX IF NOT EXISTS idx_sales_objections_lead_id ON public.sales_objections(lead_id);
CREATE INDEX IF NOT EXISTS idx_sales_objections_workspace_id ON public.sales_objections(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sales_objections_objection_type ON public.sales_objections(objection_type);
CREATE INDEX IF NOT EXISTS idx_sales_objections_created_at ON public.sales_objections(created_at DESC);

-- =========================================================
-- 2. SALES_FOLLOWUPS TABLE
-- =========================================================
-- Tracks scheduled and sent follow-up messages
CREATE TABLE IF NOT EXISTS public.sales_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  homeowner_id uuid REFERENCES public.homeowners(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('email', 'sms', 'voicemail')),
  message text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  sent boolean DEFAULT false,
  sent_at timestamptz,
  follow_up_sequence_day integer, -- Day 1, 3, 7, 14, etc.
  follow_up_type text, -- 'initial', 'nudge', 'pre_expiration', 'last_chance', 'rescue'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_followups_proposal_id ON public.sales_followups(proposal_id);
CREATE INDEX IF NOT EXISTS idx_sales_followups_lead_id ON public.sales_followups(lead_id);
CREATE INDEX IF NOT EXISTS idx_sales_followups_workspace_id ON public.sales_followups(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sales_followups_scheduled_at ON public.sales_followups(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_sales_followups_sent ON public.sales_followups(sent);
CREATE INDEX IF NOT EXISTS idx_sales_followups_sent_at ON public.sales_followups(sent_at);

-- =========================================================
-- 3. SALES_COACHING_LOGS TABLE
-- =========================================================
-- Tracks sales coaching scenarios and AI advice
CREATE TABLE IF NOT EXISTS public.sales_coaching_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  scenario text NOT NULL, -- The situation the sales rep needs help with
  ai_advice text NOT NULL, -- AI-generated coaching advice
  what_to_say text, -- Specific words to use
  how_to_say_it text, -- Tone and delivery
  angle_to_use text, -- Strategic angle
  psychology_to_apply text, -- Psychological principles
  what_not_to_say text, -- Things to avoid
  how_to_close text, -- Closing strategy
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_coaching_logs_user_id ON public.sales_coaching_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_coaching_logs_workspace_id ON public.sales_coaching_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sales_coaching_logs_created_at ON public.sales_coaching_logs(created_at DESC);

-- =========================================================
-- 4. SALES_SCRIPTS TABLE
-- =========================================================
-- Stores AI-generated sales scripts as templates
CREATE TABLE IF NOT EXISTS public.sales_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  script_type text NOT NULL CHECK (script_type IN ('pitch', 'door_knocking', 'insurance', 'storm_damage', 'upsell', 'voicemail', 'proposal_walkthrough', 'other')),
  title text NOT NULL,
  script_content text NOT NULL,
  use_case text, -- When to use this script
  key_points text[], -- Array of key talking points
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_scripts_workspace_id ON public.sales_scripts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sales_scripts_script_type ON public.sales_scripts(script_type);
CREATE INDEX IF NOT EXISTS idx_sales_scripts_created_at ON public.sales_scripts(created_at DESC);

-- =========================================================
-- 5. UPDATED_AT TRIGGERS
-- =========================================================

CREATE OR REPLACE FUNCTION public.set_sales_objections_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_sales_followups_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_sales_scripts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_sales_objections_updated_at ON public.sales_objections;
CREATE TRIGGER trg_set_sales_objections_updated_at
BEFORE UPDATE ON public.sales_objections
FOR EACH ROW
EXECUTE FUNCTION public.set_sales_objections_updated_at();

DROP TRIGGER IF EXISTS trg_set_sales_followups_updated_at ON public.sales_followups;
CREATE TRIGGER trg_set_sales_followups_updated_at
BEFORE UPDATE ON public.sales_followups
FOR EACH ROW
EXECUTE FUNCTION public.set_sales_followups_updated_at();

DROP TRIGGER IF EXISTS trg_set_sales_scripts_updated_at ON public.sales_scripts;
CREATE TRIGGER trg_set_sales_scripts_updated_at
BEFORE UPDATE ON public.sales_scripts
FOR EACH ROW
EXECUTE FUNCTION public.set_sales_scripts_updated_at();

-- =========================================================
-- 6. ROW LEVEL SECURITY
-- =========================================================

-- Sales Objections RLS
ALTER TABLE public.sales_objections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view objections in their workspace"
  ON public.sales_objections FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create objections in their workspace"
  ON public.sales_objections FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update objections in their workspace"
  ON public.sales_objections FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Sales Followups RLS
ALTER TABLE public.sales_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view followups in their workspace"
  ON public.sales_followups FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create followups in their workspace"
  ON public.sales_followups FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update followups in their workspace"
  ON public.sales_followups FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Sales Coaching Logs RLS
ALTER TABLE public.sales_coaching_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view coaching logs in their workspace"
  ON public.sales_coaching_logs FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create coaching logs in their workspace"
  ON public.sales_coaching_logs FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Sales Scripts RLS
ALTER TABLE public.sales_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view scripts in their workspace"
  ON public.sales_scripts FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create scripts in their workspace"
  ON public.sales_scripts FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update scripts in their workspace"
  ON public.sales_scripts FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- =========================================================
-- 7. HELPER VIEW: Sales Objections Summary
-- =========================================================
CREATE OR REPLACE VIEW public.sales_objections_summary AS
SELECT 
  workspace_id,
  objection_type,
  COUNT(*) as total_objections,
  COUNT(DISTINCT proposal_id) as proposals_with_objections,
  COUNT(DISTINCT lead_id) as leads_with_objections,
  MIN(created_at) as first_objection,
  MAX(created_at) as last_objection
FROM public.sales_objections
GROUP BY workspace_id, objection_type;

-- =========================================================
-- 8. HELPER VIEW: Sales Follow-Up Effectiveness
-- =========================================================
CREATE OR REPLACE VIEW public.sales_followup_effectiveness AS
SELECT 
  sf.workspace_id,
  sf.follow_up_type,
  sf.follow_up_sequence_day,
  COUNT(*) as total_sent,
  COUNT(CASE WHEN p.status = 'approved' THEN 1 END) as proposals_approved_after,
  COUNT(CASE WHEN p.status = 'viewed' THEN 1 END) as proposals_viewed_after,
  AVG(EXTRACT(EPOCH FROM (p.updated_at - sf.sent_at)) / 86400) as avg_days_to_response
FROM public.sales_followups sf
LEFT JOIN public.proposals p ON sf.proposal_id = p.id
WHERE sf.sent = true
GROUP BY sf.workspace_id, sf.follow_up_type, sf.follow_up_sequence_day;

COMMENT ON VIEW public.sales_followup_effectiveness IS 'Tracks follow-up message effectiveness by type and sequence day';
































