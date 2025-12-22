-- Block 273 — Lead Scoring v1
-- Workspace-level scoring rules table

CREATE TABLE IF NOT EXISTS public.lead_scoring_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  rules jsonb NOT NULL DEFAULT '{
    "email_open": 2,
    "email_click": 5,
    "reply": 15,
    "meeting_intent": 25,
    "deal_created": 10,
    "deal_stage_moved": 5,
    "deal_won": 40,
    "recent_activity_decay_per_day": -1,
    "max_score": 100,
    "min_score": 0
  }'::jsonb,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_lead_scoring_rules_workspace ON public.lead_scoring_rules(workspace_id);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_scoring_rules_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_scoring_rules_timestamp ON public.lead_scoring_rules;
CREATE TRIGGER trg_update_scoring_rules_timestamp
BEFORE UPDATE ON public.lead_scoring_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_scoring_rules_timestamp();

-- Enable RLS
ALTER TABLE public.lead_scoring_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Workspace members can view scoring rules
CREATE POLICY "lead_scoring_rules: select workspace members"
  ON public.lead_scoring_rules FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.team_members WHERE user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = lead_scoring_rules.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Owners and admins can insert/update scoring rules
CREATE POLICY "lead_scoring_rules: insert workspace owners/admins"
  ON public.lead_scoring_rules FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = lead_scoring_rules.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "lead_scoring_rules: update workspace owners/admins"
  ON public.lead_scoring_rules FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = lead_scoring_rules.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

-- Helper function: Get scoring rules for a workspace (with defaults)
CREATE OR REPLACE FUNCTION public.get_lead_scoring_rules(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rules jsonb;
BEGIN
  SELECT rules INTO v_rules
  FROM public.lead_scoring_rules
  WHERE workspace_id = p_workspace_id;
  
  -- Return defaults if no rules found
  IF v_rules IS NULL THEN
    RETURN '{
      "email_open": 2,
      "email_click": 5,
      "reply": 15,
      "meeting_intent": 25,
      "deal_created": 10,
      "deal_stage_moved": 5,
      "deal_won": 40,
      "recent_activity_decay_per_day": -1,
      "max_score": 100,
      "min_score": 0
    }'::jsonb;
  END IF;
  
  RETURN v_rules;
END;
$$;








