-- Block 267 — Lead & Deal Ownership v1
-- Migration 284: Create assignment_rules table

CREATE TABLE IF NOT EXISTS public.assignment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('round_robin', 'single_owner', 'none')),
  target text NOT NULL CHECK (target IN ('leads', 'deals')),
  is_active boolean DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ensure only one active rule per workspace per target
-- We'll enforce this via a partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_assignment_rules_unique_active 
ON public.assignment_rules(workspace_id, target) 
WHERE is_active = true;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_assignment_rules_workspace ON public.assignment_rules(workspace_id);
CREATE INDEX IF NOT EXISTS idx_assignment_rules_target ON public.assignment_rules(target);
CREATE INDEX IF NOT EXISTS idx_assignment_rules_active ON public.assignment_rules(workspace_id, target, is_active) WHERE is_active = true;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.set_assignment_rules_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assignment_rules_updated_at ON public.assignment_rules;
CREATE TRIGGER trg_assignment_rules_updated_at
BEFORE UPDATE ON public.assignment_rules
FOR EACH ROW EXECUTE FUNCTION public.set_assignment_rules_updated_at();

-- Enable RLS
ALTER TABLE public.assignment_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Workspace members can view assignment rules
DROP POLICY IF EXISTS "assignment_rules: select workspace members" ON public.assignment_rules;
CREATE POLICY "assignment_rules: select workspace members" ON public.assignment_rules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = assignment_rules.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- RLS Policy: Owners/admins can manage assignment rules
DROP POLICY IF EXISTS "assignment_rules: manage by owner/admin" ON public.assignment_rules;
CREATE POLICY "assignment_rules: manage by owner/admin" ON public.assignment_rules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = assignment_rules.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = assignment_rules.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

-- Helper function to pick next user in round robin
CREATE OR REPLACE FUNCTION public.pick_round_robin_user(p_config jsonb)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_members jsonb;
  v_last_assigned uuid;
  v_member jsonb;
  v_user_id uuid;
  v_weight int;
  v_total_weight int := 0;
  v_weighted_users uuid[] := '{}';
  v_selected_index int;
BEGIN
  -- Get members array from config
  v_members := p_config->'members';
  IF v_members IS NULL OR jsonb_array_length(v_members) = 0 THEN
    RETURN NULL;
  END IF;

  -- Get last assigned user
  v_last_assigned := (p_config->>'last_assigned_user_id')::uuid;

  -- Build weighted array of user IDs
  FOR v_member IN SELECT * FROM jsonb_array_elements(v_members)
  LOOP
    v_user_id := (v_member->>'user_id')::uuid;
    v_weight := COALESCE((v_member->>'weight')::int, 1);
    
    -- Add user_id to array v_weight times
    FOR i IN 1..v_weight LOOP
      v_weighted_users := array_append(v_weighted_users, v_user_id);
    END LOOP;
    
    v_total_weight := v_total_weight + v_weight;
  END LOOP;

  -- If no users, return NULL
  IF array_length(v_weighted_users, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  -- Find index of last assigned user
  IF v_last_assigned IS NOT NULL THEN
    v_selected_index := array_position(v_weighted_users, v_last_assigned);
    IF v_selected_index IS NOT NULL THEN
      -- Pick next user (wrap around)
      v_selected_index := (v_selected_index % array_length(v_weighted_users, 1)) + 1;
    ELSE
      -- Last assigned not found, start from beginning
      v_selected_index := 1;
    END IF;
  ELSE
    -- No last assigned, start from beginning
    v_selected_index := 1;
  END IF;

  RETURN v_weighted_users[v_selected_index];
END;
$$;

COMMENT ON FUNCTION public.pick_round_robin_user IS 'Picks the next user in a round-robin fashion based on weights. Returns the user_id to assign.';

