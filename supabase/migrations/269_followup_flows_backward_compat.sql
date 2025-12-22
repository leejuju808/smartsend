-- Block 251 — Follow-Up Rules v3: Backward Compatibility
-- Converts existing linear follow-up steps to graph-based flows

-- ================================================
-- 1) Function to migrate campaign_steps to followup_flows
-- ================================================

CREATE OR REPLACE FUNCTION public.migrate_campaign_steps_to_flows()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_campaign RECORD;
  v_flow_id uuid;
  v_prev_node_id uuid;
  v_node_id uuid;
  v_step_order int;
BEGIN
  -- For each campaign with steps
  FOR v_campaign IN
    SELECT DISTINCT campaign_id
    FROM public.campaign_steps
    WHERE campaign_id IS NOT NULL
  LOOP
    -- Get campaign workspace_id
    DECLARE
      v_workspace_id uuid;
    BEGIN
      SELECT workspace_id INTO v_workspace_id
      FROM public.campaigns
      WHERE id = v_campaign.campaign_id;

      IF v_workspace_id IS NULL THEN
        CONTINUE; -- Skip campaigns without workspace
      END IF;

      -- Create flow
      INSERT INTO public.followup_flows (workspace_id, campaign_id, name, is_active, entry_node_id)
      VALUES (
        v_workspace_id,
        v_campaign.campaign_id,
        'Migrated Flow',
        true,
        NULL -- Will set after creating first node
      )
      RETURNING id INTO v_flow_id;

      v_prev_node_id := NULL;

      -- Create nodes and edges for each step
      FOR v_step_order IN
        SELECT DISTINCT step_index
        FROM public.campaign_steps
        WHERE campaign_id = v_campaign.campaign_id
        ORDER BY step_index ASC
      LOOP
        -- Create send_email node
        INSERT INTO public.followup_nodes (flow_id, type, label, config)
        SELECT
          v_flow_id,
          'send_email',
          'Step ' || (v_step_order + 1),
          jsonb_build_object(
            'step_name', 'Step ' || (v_step_order + 1),
            'template_variant_id', NULL -- Will need manual mapping
          )
        RETURNING id INTO v_node_id;

        -- Set entry node if first step
        IF v_prev_node_id IS NULL THEN
          UPDATE public.followup_flows
          SET entry_node_id = v_node_id
          WHERE id = v_flow_id;
        END IF;

        -- Create edge from previous node
        IF v_prev_node_id IS NOT NULL THEN
          -- Create wait node between steps
          DECLARE
            v_wait_node_id uuid;
            v_delay_days int;
          BEGIN
            SELECT delay_days INTO v_delay_days
            FROM public.campaign_steps
            WHERE campaign_id = v_campaign.campaign_id
              AND step_index = v_step_order
            LIMIT 1;

            v_delay_days := COALESCE(v_delay_days, 2); -- Default 2 days

            INSERT INTO public.followup_nodes (flow_id, type, label, config)
            VALUES (
              v_flow_id,
              'wait',
              'Wait ' || v_delay_days || ' days',
              jsonb_build_object(
                'wait_type', 'time',
                'amount', v_delay_days,
                'unit', 'days'
              )
            )
            RETURNING id INTO v_wait_node_id;

            -- Edge from previous send_email to wait
            INSERT INTO public.followup_edges (flow_id, from_node_id, to_node_id)
            VALUES (v_flow_id, v_prev_node_id, v_wait_node_id);

            -- Edge from wait to current send_email
            INSERT INTO public.followup_edges (flow_id, from_node_id, to_node_id)
            VALUES (v_flow_id, v_wait_node_id, v_node_id);
          END;
        END IF;

        v_prev_node_id := v_node_id;
      END LOOP;
    END;
  END LOOP;
END;
$$;

-- ================================================
-- 2) Function to migrate followup_sequences to flows
-- ================================================

CREATE OR REPLACE FUNCTION public.migrate_followup_sequences_to_flows()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_sequence RECORD;
  v_flow_id uuid;
  v_prev_node_id uuid;
  v_node_id uuid;
  v_step RECORD;
BEGIN
  -- For each sequence
  FOR v_sequence IN
    SELECT s.id, s.campaign_id, s.name, s.is_active, c.workspace_id
    FROM public.followup_sequences s
    JOIN public.campaigns c ON c.id = s.campaign_id
    WHERE c.workspace_id IS NOT NULL
  LOOP
    -- Create flow
    INSERT INTO public.followup_flows (workspace_id, campaign_id, name, is_active, entry_node_id)
    VALUES (
      v_sequence.workspace_id,
      v_sequence.campaign_id,
      v_sequence.name || ' (Migrated)',
      v_sequence.is_active,
      NULL
    )
    RETURNING id INTO v_flow_id;

    v_prev_node_id := NULL;

    -- Create nodes for each step
    FOR v_step IN
      SELECT id, step_order, delay_hours, template_id
      FROM public.followup_steps
      WHERE sequence_id = v_sequence.id
      ORDER BY step_order ASC
    LOOP
      -- Create send_email node
      INSERT INTO public.followup_nodes (flow_id, type, label, config)
      VALUES (
        v_flow_id,
        'send_email',
        'Step ' || v_step.step_order,
        jsonb_build_object(
          'step_name', 'Step ' || v_step.step_order,
          'template_variant_id', NULL -- Will need manual mapping from template_id
        )
      )
      RETURNING id INTO v_node_id;

      -- Set entry node if first step
      IF v_prev_node_id IS NULL THEN
        UPDATE public.followup_flows
        SET entry_node_id = v_node_id
        WHERE id = v_flow_id;
      END IF;

      -- Create wait node and edges
      IF v_prev_node_id IS NOT NULL THEN
        DECLARE
          v_wait_node_id uuid;
          v_delay_hours int;
        BEGIN
          v_delay_hours := COALESCE(v_step.delay_hours, 48);

          INSERT INTO public.followup_nodes (flow_id, type, label, config)
          VALUES (
            v_flow_id,
            'wait',
            'Wait ' || v_delay_hours || ' hours',
            jsonb_build_object(
              'wait_type', 'time',
              'amount', v_delay_hours,
              'unit', 'hours'
            )
          )
          RETURNING id INTO v_wait_node_id;

          -- Edge from previous send_email to wait
          INSERT INTO public.followup_edges (flow_id, from_node_id, to_node_id)
          VALUES (v_flow_id, v_prev_node_id, v_wait_node_id);

          -- Edge from wait to current send_email
          INSERT INTO public.followup_edges (flow_id, from_node_id, to_node_id)
          VALUES (v_flow_id, v_wait_node_id, v_node_id);
        END;
      END IF;

      v_prev_node_id := v_node_id;
    END LOOP;
  END LOOP;
END;
$$;

-- ================================================
-- 3) Function to initialize executions for leads in campaigns
-- ================================================

CREATE OR REPLACE FUNCTION public.initialize_followup_executions()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_flow RECORD;
  v_lead RECORD;
BEGIN
  -- For each active flow
  FOR v_flow IN
    SELECT id, campaign_id, entry_node_id
    FROM public.followup_flows
    WHERE is_active = true
      AND entry_node_id IS NOT NULL
  LOOP
    -- For each lead in the campaign (if campaign_id is set)
    IF v_flow.campaign_id IS NOT NULL THEN
      FOR v_lead IN
        SELECT DISTINCT l.id
        FROM public.leads l
        WHERE l.campaign_id = v_flow.campaign_id
          OR EXISTS (
            SELECT 1 FROM public.campaign_recipients cr
            WHERE cr.campaign_id = v_flow.campaign_id
              AND cr.email = l.email
          )
      LOOP
        -- Create execution if it doesn't exist
        INSERT INTO public.followup_execution (
          flow_id,
          lead_id,
          current_node_id,
          status,
          next_run_at
        )
        VALUES (
          v_flow.id,
          v_lead.id,
          v_flow.entry_node_id,
          'active',
          now() -- Start immediately
        )
        ON CONFLICT (flow_id, lead_id) DO NOTHING;
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

-- ================================================
-- 4) Run migrations (optional - comment out if you want manual control)
-- ================================================

-- Uncomment to auto-migrate on deployment:
-- SELECT public.migrate_campaign_steps_to_flows();
-- SELECT public.migrate_followup_sequences_to_flows();
-- SELECT public.initialize_followup_executions();

-- ================================================
-- 5) Grant execute permissions
-- ================================================

GRANT EXECUTE ON FUNCTION public.migrate_campaign_steps_to_flows TO authenticated;
GRANT EXECUTE ON FUNCTION public.migrate_followup_sequences_to_flows TO authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_followup_executions TO authenticated;









