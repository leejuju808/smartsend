-- =========================================================
-- Block 26110 — SmartSend Roofing Cashflow Forecast v1
-- (Predict future cashflow • Progress payments • Red-flag delays • Cash burn • Owner liquidity view)
-- =========================================================
-- 
-- This block turns SmartSend into a financial crystal ball for roofing companies.
-- Roofing owners fail not because they lack leads… They fail because cashflow kills them.
-- SmartSend becomes the system that warns them BEFORE they run out of money.

-- ============================================================================
-- PART 1 — CREATE roofing_cashflow_events TABLE
-- ============================================================================
-- Tracks all incoming and outgoing cashflow events tied to roofing jobs

CREATE TABLE IF NOT EXISTS public.roofing_cashflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,

  -- incoming or outgoing
  type text NOT NULL CHECK (type IN ('incoming', 'outgoing')),

  -- category of money (e.g., 'insurance_check', 'deposit', 'progress_payment', 
  -- 'final_payment', 'material_order', 'crew_payroll', 'dump_fees', 'supplement_pending', 'vendor_invoice')
  category text NOT NULL,
  
  amount numeric(12,2) NOT NULL CHECK (amount > 0),

  -- expected cashflow date
  expected_date date NOT NULL,

  -- actualized (has this event actually happened?)
  actual boolean DEFAULT false,
  actual_date date,

  -- Optional description/notes
  description text,
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cashflow_events_workspace ON public.roofing_cashflow_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_cashflow_events_job ON public.roofing_cashflow_events(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cashflow_events_type ON public.roofing_cashflow_events(type);
CREATE INDEX IF NOT EXISTS idx_cashflow_events_expected_date ON public.roofing_cashflow_events(expected_date);
CREATE INDEX IF NOT EXISTS idx_cashflow_events_actual ON public.roofing_cashflow_events(actual) WHERE actual = false;
CREATE INDEX IF NOT EXISTS idx_cashflow_events_workspace_date ON public.roofing_cashflow_events(workspace_id, expected_date);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_cashflow_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_cashflow_events_updated_at
  BEFORE UPDATE ON public.roofing_cashflow_events
  FOR EACH ROW
  EXECUTE FUNCTION update_cashflow_events_updated_at();

-- ============================================================================
-- PART 2 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.roofing_cashflow_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view cashflow events in their workspace
CREATE POLICY "Users can view cashflow events in their workspace"
  ON public.roofing_cashflow_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_cashflow_events.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Policy: Users can insert cashflow events in their workspace
CREATE POLICY "Users can insert cashflow events in their workspace"
  ON public.roofing_cashflow_events
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_cashflow_events.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Policy: Users can update cashflow events in their workspace
CREATE POLICY "Users can update cashflow events in their workspace"
  ON public.roofing_cashflow_events
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_cashflow_events.workspace_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_cashflow_events.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Policy: Users can delete cashflow events in their workspace
CREATE POLICY "Users can delete cashflow events in their workspace"
  ON public.roofing_cashflow_events
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_cashflow_events.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 3 — HELPER FUNCTION: Get cashflow forecast timeline
-- ============================================================================
-- Returns a JSON object with daily cashflow breakdown for a date range

CREATE OR REPLACE FUNCTION get_cashflow_forecast(
  p_workspace_id uuid,
  p_start_date date DEFAULT CURRENT_DATE,
  p_end_date date DEFAULT (CURRENT_DATE + INTERVAL '90 days')
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_timeline jsonb := '{}'::jsonb;
  v_day date;
  v_incoming numeric;
  v_outgoing numeric;
  v_net numeric;
BEGIN
  -- Initialize timeline for each day
  v_day := p_start_date;
  WHILE v_day <= p_end_date LOOP
    v_timeline := v_timeline || jsonb_build_object(
      v_day::text,
      jsonb_build_object(
        'incoming', 0,
        'outgoing', 0,
        'net', 0
      )
    );
    v_day := v_day + INTERVAL '1 day';
  END LOOP;

  -- Aggregate incoming events
  SELECT COALESCE(SUM(amount), 0)
  INTO v_incoming
  FROM public.roofing_cashflow_events
  WHERE workspace_id = p_workspace_id
    AND type = 'incoming'
    AND expected_date >= p_start_date
    AND expected_date <= p_end_date
    AND actual = false;

  -- Aggregate outgoing events
  SELECT COALESCE(SUM(amount), 0)
  INTO v_outgoing
  FROM public.roofing_cashflow_events
  WHERE workspace_id = p_workspace_id
    AND type = 'outgoing'
    AND expected_date >= p_start_date
    AND expected_date <= p_end_date
    AND actual = false;

  -- Build daily breakdown
  FOR v_day IN 
    SELECT DISTINCT expected_date
    FROM public.roofing_cashflow_events
    WHERE workspace_id = p_workspace_id
      AND expected_date >= p_start_date
      AND expected_date <= p_end_date
      AND actual = false
    ORDER BY expected_date
  LOOP
    SELECT 
      COALESCE(SUM(CASE WHEN type = 'incoming' THEN amount ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN type = 'outgoing' THEN amount ELSE 0 END), 0)
    INTO v_incoming, v_outgoing
    FROM public.roofing_cashflow_events
    WHERE workspace_id = p_workspace_id
      AND expected_date = v_day
      AND actual = false;

    v_net := v_incoming - v_outgoing;

    v_timeline := jsonb_set(
      v_timeline,
      ARRAY[v_day::text],
      jsonb_build_object(
        'incoming', v_incoming,
        'outgoing', v_outgoing,
        'net', v_net
      )
    );
  END LOOP;

  RETURN v_timeline;
END;
$$;

-- ============================================================================
-- PART 4 — HELPER FUNCTION: Get cashflow alerts (negative days)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_cashflow_alerts(
  p_workspace_id uuid,
  p_start_date date DEFAULT CURRENT_DATE,
  p_end_date date DEFAULT (CURRENT_DATE + INTERVAL '90 days')
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alerts jsonb := '[]'::jsonb;
  v_day date;
  v_incoming numeric;
  v_outgoing numeric;
  v_net numeric;
BEGIN
  -- Check each day for negative cashflow
  FOR v_day IN 
    SELECT DISTINCT expected_date
    FROM public.roofing_cashflow_events
    WHERE workspace_id = p_workspace_id
      AND expected_date >= p_start_date
      AND expected_date <= p_end_date
      AND actual = false
    ORDER BY expected_date
  LOOP
    SELECT 
      COALESCE(SUM(CASE WHEN type = 'incoming' THEN amount ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN type = 'outgoing' THEN amount ELSE 0 END), 0)
    INTO v_incoming, v_outgoing
    FROM public.roofing_cashflow_events
    WHERE workspace_id = p_workspace_id
      AND expected_date = v_day
      AND actual = false;

    v_net := v_incoming - v_outgoing;

    IF v_net < 0 THEN
      v_alerts := v_alerts || jsonb_build_object(
        'day', v_day::text,
        'net', v_net,
        'incoming', v_incoming,
        'outgoing', v_outgoing
      );
    END IF;
  END LOOP;

  RETURN v_alerts;
END;
$$;

COMMENT ON TABLE public.roofing_cashflow_events IS 'Block 26110: Tracks incoming and outgoing cashflow events for roofing jobs';
COMMENT ON FUNCTION get_cashflow_forecast IS 'Block 26110: Returns daily cashflow forecast timeline for a workspace';
COMMENT ON FUNCTION get_cashflow_alerts IS 'Block 26110: Returns days with negative cashflow forecast';



































