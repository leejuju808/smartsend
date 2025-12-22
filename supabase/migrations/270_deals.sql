-- Block 254 — Smart Pipeline v1
-- Deals Table, Deal Activity Timeline, Auto-Create Deals From Intent

-- Create deals table
CREATE TABLE IF NOT EXISTS public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  stage text NOT NULL DEFAULT 'new', -- new, working, meeting, proposal, closed_won, closed_lost
  value int,
  probability int DEFAULT 10 CHECK (probability >= 0 AND probability <= 100),
  next_action text,
  next_action_due date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create deal_activity table for timeline
CREATE TABLE IF NOT EXISTS public.deal_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  type text NOT NULL,  -- note, task, reply, stage_change, meeting, email
  body text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_deals_workspace ON public.deals(workspace_id);
CREATE INDEX IF NOT EXISTS idx_deals_lead ON public.deals(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_owner ON public.deals(owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_stage ON public.deals(stage);
CREATE INDEX IF NOT EXISTS idx_deal_activity_deal ON public.deal_activity(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_activity_created ON public.deal_activity(created_at DESC);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION public.set_deals_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deals_updated_at ON public.deals;
CREATE TRIGGER trg_deals_updated_at
BEFORE UPDATE ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.set_deals_updated_at();

-- Enable RLS
ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_activity ENABLE ROW LEVEL SECURITY;

-- RLS policies for deals
-- Users can view deals in their workspace
DROP POLICY IF EXISTS "deals: select workspace members" ON public.deals;
CREATE POLICY "deals: select workspace members" ON public.deals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = deals.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Users can insert deals in their workspace
DROP POLICY IF EXISTS "deals: insert workspace members" ON public.deals;
CREATE POLICY "deals: insert workspace members" ON public.deals
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = deals.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Users can update deals in their workspace
DROP POLICY IF EXISTS "deals: update workspace members" ON public.deals;
CREATE POLICY "deals: update workspace members" ON public.deals
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = deals.workspace_id
      AND wm.user_id = auth.uid()
    )
  );

-- Users can delete deals in their workspace (admins/owners only)
DROP POLICY IF EXISTS "deals: delete workspace admins" ON public.deals;
CREATE POLICY "deals: delete workspace admins" ON public.deals
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = deals.workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin')
    )
  );

-- RLS policies for deal_activity
-- Users can view activity for deals they can see
DROP POLICY IF EXISTS "deal_activity: select via deal" ON public.deal_activity;
CREATE POLICY "deal_activity: select via deal" ON public.deal_activity
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      JOIN public.workspace_members wm ON wm.workspace_id = d.workspace_id
      WHERE d.id = deal_activity.deal_id
      AND wm.user_id = auth.uid()
    )
  );

-- Users can insert activity for deals they can see
DROP POLICY IF EXISTS "deal_activity: insert via deal" ON public.deal_activity;
CREATE POLICY "deal_activity: insert via deal" ON public.deal_activity
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals d
      JOIN public.workspace_members wm ON wm.workspace_id = d.workspace_id
      WHERE d.id = deal_activity.deal_id
      AND wm.user_id = auth.uid()
    )
  );

-- Helper function to auto-create deal from intent
CREATE OR REPLACE FUNCTION public.auto_create_deal_from_intent(
  p_lead_id uuid,
  p_intent_primary text,
  p_workspace_id uuid DEFAULT NULL,
  p_owner_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_deal_id uuid;
  v_workspace_id uuid;
  v_owner_id uuid;
  v_lead_workspace_id uuid;
  v_lead_owner_id uuid;
  v_lead_first_name text;
  v_lead_last_name text;
  v_lead_company text;
  v_stage text;
  v_probability int;
  v_title text;
  v_old_stage text;
BEGIN
  -- Get lead info
  SELECT workspace_id, owner_id, first_name, last_name, company
  INTO v_lead_workspace_id, v_lead_owner_id, v_lead_first_name, v_lead_last_name, v_lead_company
  FROM public.leads
  WHERE id = p_lead_id;

  IF v_lead_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Lead not found or has no workspace_id';
  END IF;

  -- Use provided workspace_id or fall back to lead's workspace_id
  v_workspace_id := COALESCE(p_workspace_id, v_lead_workspace_id);
  v_owner_id := COALESCE(p_owner_id, v_lead_owner_id);

  -- Check if deal already exists for this lead
  SELECT id INTO v_deal_id
  FROM public.deals
  WHERE lead_id = p_lead_id
  LIMIT 1;

  -- Determine stage and probability based on intent
  IF p_intent_primary = 'meeting_intent' THEN
    v_stage := 'meeting';
    v_probability := 50;
  ELSIF p_intent_primary = 'interested' THEN
    v_stage := 'working';
    v_probability := 20;
  ELSE
    v_stage := 'new';
    v_probability := 10;
  END IF;

  -- Generate title
  v_title := COALESCE(
    TRIM(v_lead_first_name || ' ' || v_lead_last_name),
    v_lead_company,
    'Deal'
  ) || ' — Deal';

  IF v_deal_id IS NOT NULL THEN
    -- Update existing deal stage if intent is higher priority
    IF (p_intent_primary = 'meeting_intent' AND (SELECT stage FROM public.deals WHERE id = v_deal_id) != 'meeting') OR
       (p_intent_primary = 'interested' AND (SELECT stage FROM public.deals WHERE id = v_deal_id) NOT IN ('meeting', 'proposal')) THEN
      -- Get old stage before update
      SELECT stage INTO v_old_stage FROM public.deals WHERE id = v_deal_id;
      
      UPDATE public.deals
      SET stage = v_stage,
          probability = GREATEST(probability, v_probability),
          updated_at = now()
      WHERE id = v_deal_id;

      -- Log stage change activity
      INSERT INTO public.deal_activity (deal_id, type, body, metadata)
      VALUES (
        v_deal_id,
        'stage_change',
        format('Deal moved to %s (auto-updated from %s intent)', v_stage, p_intent_primary),
        jsonb_build_object('intent', p_intent_primary, 'old_stage', v_old_stage, 'new_stage', v_stage)
      );
    END IF;

    RETURN v_deal_id;
  ELSE
    -- Create new deal
    INSERT INTO public.deals (
      workspace_id,
      lead_id,
      owner_id,
      title,
      stage,
      probability
    )
    VALUES (
      v_workspace_id,
      p_lead_id,
      v_owner_id,
      v_title,
      v_stage,
      v_probability
    )
    RETURNING id INTO v_deal_id;

    -- Log deal creation activity
    INSERT INTO public.deal_activity (deal_id, type, body, metadata)
    VALUES (
      v_deal_id,
      'note',
      format('Deal auto-created from %s intent', p_intent_primary),
      jsonb_build_object('intent', p_intent_primary, 'auto_created', true)
    );

    RETURN v_deal_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.auto_create_deal_from_intent IS 'Auto-creates or updates a deal based on reply intent. Returns deal_id.';

