-- Block 251 — Follow-Up Rules v3
-- Advanced Rules Engine: Conditions, Wait Steps, Branching, Multi-Path Sequences
-- Graph-based follow-up system with nodes and edges

-- ================================================
-- 1) Core Tables: Flows, Nodes, Edges, Execution
-- ================================================

-- Follow-up flows (replaces simple linear sequences)
CREATE TABLE IF NOT EXISTS public.followup_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_active boolean DEFAULT false,
  entry_node_id uuid, -- optional: default entry node
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Follow-up nodes (steps + waits + branches + actions)
CREATE TABLE IF NOT EXISTS public.followup_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.followup_flows(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('wait', 'send_email', 'branch', 'action')),
  label text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb, -- node-specific config
  position jsonb, -- for canvas layout {x, y}
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Edges (connections between nodes)
CREATE TABLE IF NOT EXISTS public.followup_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.followup_flows(id) ON DELETE CASCADE,
  from_node_id uuid NOT NULL REFERENCES public.followup_nodes(id) ON DELETE CASCADE,
  to_node_id uuid NOT NULL REFERENCES public.followup_nodes(id) ON DELETE CASCADE,
  condition_key text, -- e.g. "opened", "not_opened", "clicked", "no_reply", "replied", "intent_meeting", "score_high"
  condition_value text, -- future use for thresholds
  created_at timestamptz DEFAULT now(),
  UNIQUE(flow_id, from_node_id, to_node_id, condition_key)
);

-- Execution tracking (per-lead position in flow)
CREATE TABLE IF NOT EXISTS public.followup_execution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id uuid NOT NULL REFERENCES public.followup_flows(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  current_node_id uuid REFERENCES public.followup_nodes(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'stopped')),
  last_run_at timestamptz,
  next_run_at timestamptz,
  context jsonb DEFAULT '{}'::jsonb, -- store last events (opened, clicked, replied, intent, score, etc.)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(flow_id, lead_id)
);

-- ================================================
-- 2) Indexes for Performance
-- ================================================

CREATE INDEX IF NOT EXISTS idx_followup_flows_workspace ON public.followup_flows(workspace_id);
CREATE INDEX IF NOT EXISTS idx_followup_flows_campaign ON public.followup_flows(campaign_id);
CREATE INDEX IF NOT EXISTS idx_followup_flows_active ON public.followup_flows(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_followup_nodes_flow ON public.followup_nodes(flow_id);
CREATE INDEX IF NOT EXISTS idx_followup_nodes_type ON public.followup_nodes(type);

CREATE INDEX IF NOT EXISTS idx_followup_edges_flow ON public.followup_edges(flow_id);
CREATE INDEX IF NOT EXISTS idx_followup_edges_from ON public.followup_edges(from_node_id);
CREATE INDEX IF NOT EXISTS idx_followup_edges_to ON public.followup_edges(to_node_id);
CREATE INDEX IF NOT EXISTS idx_followup_edges_condition ON public.followup_edges(condition_key);

CREATE INDEX IF NOT EXISTS idx_followup_execution_flow ON public.followup_execution(flow_id);
CREATE INDEX IF NOT EXISTS idx_followup_execution_lead ON public.followup_execution(lead_id);
CREATE INDEX IF NOT EXISTS idx_followup_execution_status ON public.followup_execution(status);
CREATE INDEX IF NOT EXISTS idx_followup_execution_next_run ON public.followup_execution(next_run_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_followup_execution_active_next ON public.followup_execution(status, next_run_at) WHERE status = 'active';

-- ================================================
-- 3) Triggers for updated_at
-- ================================================

CREATE OR REPLACE FUNCTION public.set_followup_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_followup_flows_updated_at ON public.followup_flows;
CREATE TRIGGER trg_followup_flows_updated_at
  BEFORE UPDATE ON public.followup_flows
  FOR EACH ROW
  EXECUTE FUNCTION public.set_followup_updated_at();

DROP TRIGGER IF EXISTS trg_followup_nodes_updated_at ON public.followup_nodes;
CREATE TRIGGER trg_followup_nodes_updated_at
  BEFORE UPDATE ON public.followup_nodes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_followup_updated_at();

DROP TRIGGER IF EXISTS trg_followup_execution_updated_at ON public.followup_execution;
CREATE TRIGGER trg_followup_execution_updated_at
  BEFORE UPDATE ON public.followup_execution
  FOR EACH ROW
  EXECUTE FUNCTION public.set_followup_updated_at();

-- ================================================
-- 4) Helper Functions
-- ================================================

-- Function to evaluate branch outcome based on execution context
CREATE OR REPLACE FUNCTION public.evaluate_branch_outcome(
  p_execution_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_context jsonb;
  v_opened boolean;
  v_clicked boolean;
  v_replied boolean;
  v_intent text;
  v_score numeric;
BEGIN
  -- Get execution context
  SELECT context INTO v_context
  FROM public.followup_execution
  WHERE id = p_execution_id;

  IF v_context IS NULL THEN
    RETURN 'no_open'; -- default fallback
  END IF;

  -- Extract values from context
  v_opened := COALESCE((v_context->>'opened')::boolean, false);
  v_clicked := COALESCE((v_context->>'clicked')::boolean, false);
  v_replied := COALESCE((v_context->>'replied')::boolean, false);
  v_intent := v_context->>'intent';
  v_score := COALESCE((v_context->>'score_v3')::numeric, 0);

  -- Priority order: replied > clicked > opened > intent > score
  IF v_replied THEN
    RETURN 'replied';
  END IF;

  IF v_clicked THEN
    RETURN 'clicked';
  END IF;

  IF v_intent = 'meeting_intent' THEN
    RETURN 'intent_meeting';
  END IF;

  IF v_score >= 75 THEN
    RETURN 'score_high';
  END IF;

  IF v_opened THEN
    RETURN 'opened';
  END IF;

  RETURN 'no_open'; -- fallback
END;
$$;

-- Function to get next node based on branch outcome
CREATE OR REPLACE FUNCTION public.get_next_node_id(
  p_flow_id uuid,
  p_from_node_id uuid,
  p_condition_key text
)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT to_node_id
  FROM public.followup_edges
  WHERE flow_id = p_flow_id
    AND from_node_id = p_from_node_id
    AND condition_key = p_condition_key
  LIMIT 1;
$$;

-- Function to calculate next run time for wait nodes
CREATE OR REPLACE FUNCTION public.calculate_next_run_time(
  p_wait_config jsonb,
  p_base_time timestamptz DEFAULT now()
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_wait_type text;
  v_amount numeric;
  v_unit text;
  v_result timestamptz;
BEGIN
  v_wait_type := p_wait_config->>'wait_type';
  
  IF v_wait_type = 'time' THEN
    v_amount := COALESCE((p_wait_config->>'amount')::numeric, 0);
    v_unit := p_wait_config->>'unit';
    
    CASE v_unit
      WHEN 'hours' THEN
        v_result := p_base_time + (v_amount || ' hours')::interval;
      WHEN 'days' THEN
        v_result := p_base_time + (v_amount || ' days')::interval;
      WHEN 'weeks' THEN
        v_result := p_base_time + (v_amount || ' weeks')::interval;
      ELSE
        v_result := p_base_time + (v_amount || ' days')::interval; -- default to days
    END CASE;
    
    RETURN v_result;
  ELSIF v_wait_type = 'until' THEN
    -- For "until" waits, we'll set a timeout
    -- The actual event will trigger progression
    v_amount := COALESCE((p_wait_config->>'timeout_days')::numeric, 5);
    RETURN p_base_time + (v_amount || ' days')::interval;
  ELSE
    RETURN p_base_time + interval '2 days'; -- default fallback
  END IF;
END;
$$;

-- ================================================
-- 5) RLS Policies
-- ================================================

ALTER TABLE public.followup_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_execution ENABLE ROW LEVEL SECURITY;

-- Helper function to check workspace membership (uses both workspace_members and team_members)
CREATE OR REPLACE FUNCTION public.is_workspace_member_for_followup(p_workspace_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = p_user_id
  ) OR EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.workspace_id = p_workspace_id
      AND tm.user_id = p_user_id
      AND tm.status = 'active'
  );
$$;

-- Helper function to check workspace admin
CREATE OR REPLACE FUNCTION public.is_workspace_admin_for_followup(p_workspace_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = p_user_id
      AND wm.role IN ('owner', 'admin')
  ) OR EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.workspace_id = p_workspace_id
      AND tm.user_id = p_user_id
      AND tm.role IN ('owner', 'admin')
      AND tm.status = 'active'
  );
$$;

-- RLS: followup_flows
DROP POLICY IF EXISTS "followup_flows_select_workspace_member" ON public.followup_flows;
CREATE POLICY "followup_flows_select_workspace_member"
  ON public.followup_flows FOR SELECT
  USING (is_workspace_member_for_followup(workspace_id));

DROP POLICY IF EXISTS "followup_flows_insert_workspace_member" ON public.followup_flows;
CREATE POLICY "followup_flows_insert_workspace_member"
  ON public.followup_flows FOR INSERT
  WITH CHECK (is_workspace_member_for_followup(workspace_id));

DROP POLICY IF EXISTS "followup_flows_update_workspace_admin" ON public.followup_flows;
CREATE POLICY "followup_flows_update_workspace_admin"
  ON public.followup_flows FOR UPDATE
  USING (is_workspace_admin_for_followup(workspace_id))
  WITH CHECK (is_workspace_admin_for_followup(workspace_id));

DROP POLICY IF EXISTS "followup_flows_delete_workspace_admin" ON public.followup_flows;
CREATE POLICY "followup_flows_delete_workspace_admin"
  ON public.followup_flows FOR DELETE
  USING (is_workspace_admin_for_followup(workspace_id));

-- RLS: followup_nodes (via flow)
DROP POLICY IF EXISTS "followup_nodes_select_workspace_member" ON public.followup_nodes;
CREATE POLICY "followup_nodes_select_workspace_member"
  ON public.followup_nodes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.followup_flows ff
      WHERE ff.id = followup_nodes.flow_id
        AND is_workspace_member_for_followup(ff.workspace_id)
    )
  );

DROP POLICY IF EXISTS "followup_nodes_insert_workspace_member" ON public.followup_nodes;
CREATE POLICY "followup_nodes_insert_workspace_member"
  ON public.followup_nodes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.followup_flows ff
      WHERE ff.id = followup_nodes.flow_id
        AND is_workspace_member_for_followup(ff.workspace_id)
    )
  );

DROP POLICY IF EXISTS "followup_nodes_update_workspace_admin" ON public.followup_nodes;
CREATE POLICY "followup_nodes_update_workspace_admin"
  ON public.followup_nodes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.followup_flows ff
      WHERE ff.id = followup_nodes.flow_id
        AND is_workspace_admin_for_followup(ff.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.followup_flows ff
      WHERE ff.id = followup_nodes.flow_id
        AND is_workspace_admin_for_followup(ff.workspace_id)
    )
  );

DROP POLICY IF EXISTS "followup_nodes_delete_workspace_admin" ON public.followup_nodes;
CREATE POLICY "followup_nodes_delete_workspace_admin"
  ON public.followup_nodes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.followup_flows ff
      WHERE ff.id = followup_nodes.flow_id
        AND is_workspace_admin_for_followup(ff.workspace_id)
    )
  );

-- RLS: followup_edges (via flow)
DROP POLICY IF EXISTS "followup_edges_select_workspace_member" ON public.followup_edges;
CREATE POLICY "followup_edges_select_workspace_member"
  ON public.followup_edges FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.followup_flows ff
      WHERE ff.id = followup_edges.flow_id
        AND is_workspace_member_for_followup(ff.workspace_id)
    )
  );

DROP POLICY IF EXISTS "followup_edges_insert_workspace_member" ON public.followup_edges;
CREATE POLICY "followup_edges_insert_workspace_member"
  ON public.followup_edges FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.followup_flows ff
      WHERE ff.id = followup_edges.flow_id
        AND is_workspace_member_for_followup(ff.workspace_id)
    )
  );

DROP POLICY IF EXISTS "followup_edges_update_workspace_admin" ON public.followup_edges;
CREATE POLICY "followup_edges_update_workspace_admin"
  ON public.followup_edges FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.followup_flows ff
      WHERE ff.id = followup_edges.flow_id
        AND is_workspace_admin_for_followup(ff.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.followup_flows ff
      WHERE ff.id = followup_edges.flow_id
        AND is_workspace_admin_for_followup(ff.workspace_id)
    )
  );

DROP POLICY IF EXISTS "followup_edges_delete_workspace_admin" ON public.followup_edges;
CREATE POLICY "followup_edges_delete_workspace_admin"
  ON public.followup_edges FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.followup_flows ff
      WHERE ff.id = followup_edges.flow_id
        AND is_workspace_admin_for_followup(ff.workspace_id)
    )
  );

-- RLS: followup_execution (users can see executions for their leads)
DROP POLICY IF EXISTS "followup_execution_select_workspace_member" ON public.followup_execution;
CREATE POLICY "followup_execution_select_workspace_member"
  ON public.followup_execution FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.followup_flows ff
      JOIN public.leads l ON l.id = followup_execution.lead_id
      WHERE ff.id = followup_execution.flow_id
        AND l.workspace_id = ff.workspace_id
        AND is_workspace_member_for_followup(ff.workspace_id)
    )
  );

DROP POLICY IF EXISTS "followup_execution_insert_service" ON public.followup_execution;
CREATE POLICY "followup_execution_insert_service"
  ON public.followup_execution FOR INSERT
  WITH CHECK (true); -- Service role can insert

DROP POLICY IF EXISTS "followup_execution_update_service" ON public.followup_execution;
CREATE POLICY "followup_execution_update_service"
  ON public.followup_execution FOR UPDATE
  USING (true) -- Service role can update
  WITH CHECK (true);

-- ================================================
-- 6) Grants
-- ================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_flows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_nodes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.followup_edges TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.followup_execution TO authenticated;









