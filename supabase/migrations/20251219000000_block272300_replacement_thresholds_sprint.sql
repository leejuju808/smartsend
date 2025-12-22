-- =========================================================
-- Block 272300 — SmartSend Replacement Threshold Sprint v1
-- Make it obvious when to fire other tools (no smoothing)
-- =========================================================
--
-- Core deliverables:
-- - Compute raw cost per closed job for:
--   1) SmartSend (subscription cost)
--   2) Ads / Lead services (spend + closed jobs)
--   3) Agency (spend + closed jobs)
-- - Subtle "SmartSend is outperforming this channel" flag if it wins for the window.
-- - Revenue Continuity Test: record when a channel is paused while SmartSend keeps running.

-- ============================================================================
-- 1) Expand roofing_lead_sources.channel_type to include agency / lead_service
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'roofing_lead_sources'
  ) THEN
    BEGIN
      ALTER TABLE public.roofing_lead_sources
        DROP CONSTRAINT IF EXISTS roofing_lead_sources_channel_type_check;
    EXCEPTION WHEN others THEN
      NULL;
    END;

    BEGIN
      ALTER TABLE public.roofing_lead_sources
        ADD CONSTRAINT roofing_lead_sources_channel_type_check
        CHECK (channel_type IN ('smartsend', 'ads', 'lead_service', 'referral', 'organic', 'agency', 'other'));
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;
END $$;

-- ============================================================================
-- 2) Channel pause tests (Revenue Continuity Test)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.channel_pause_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  channel_type text NOT NULL CHECK (channel_type IN ('ads', 'lead_service', 'agency')),
  paused_lead_source_ids uuid[] DEFAULT '{}'::uuid[],
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_channel_pause_tests_workspace_active
  ON public.channel_pause_tests(workspace_id, is_active)
  WHERE is_active = true;

ALTER TABLE public.channel_pause_tests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "channel_pause_tests_select_workspace_members" ON public.channel_pause_tests;
CREATE POLICY "channel_pause_tests_select_workspace_members"
  ON public.channel_pause_tests
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "channel_pause_tests_modify_workspace_members" ON public.channel_pause_tests;
CREATE POLICY "channel_pause_tests_modify_workspace_members"
  ON public.channel_pause_tests
  FOR INSERT, UPDATE, DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_pause_tests TO authenticated;

COMMENT ON TABLE public.channel_pause_tests IS
  'Block 272300: Records revenue continuity tests where a channel is paused while SmartSend continues.';

-- ============================================================================
-- 3) Replacement thresholds RPC (raw, no smoothing)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.ss_monthly_fee_for_plan_id(p_plan_id text)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE lower(coalesce(p_plan_id, ''))
      WHEN '' THEN 99
      WHEN 'free' THEN 0
      WHEN 'trial' THEN 0
      WHEN 'starter' THEN 99
      WHEN 'growth' THEN 199
      WHEN 'domination' THEN 399
      -- legacy aliases
      WHEN 'basic' THEN 99
      WHEN 'pro' THEN 199
      WHEN 'scale' THEN 399
      ELSE 99
    END::numeric;
$$;

COMMENT ON FUNCTION public.ss_monthly_fee_for_plan_id(text) IS
  'Block 272300: Canonical SmartSend monthly fee mapping (kept in sync with app/api/financial-reality).';

CREATE OR REPLACE FUNCTION public.ss_get_replacement_thresholds(
  p_workspace_id uuid,
  p_days integer DEFAULT 30
)
RETURNS TABLE (
  channel text,
  cost numeric,
  closed_jobs bigint,
  cost_per_closed_job numeric,
  smartsend_outperforming boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $fn$
DECLARE
  v_start timestamptz := now() - make_interval(days => greatest(p_days, 1));
  v_plan_id text;
  v_smartsend_cost numeric := 0;
  v_smartsend_closed bigint := 0;
  v_smartsend_cpcj numeric := NULL;
  v_ads_cost numeric := NULL;
  v_ads_closed bigint := 0;
  v_ads_cpcj numeric := NULL;
  v_agency_cost numeric := NULL;
  v_agency_closed bigint := 0;
  v_agency_cpcj numeric := NULL;
  v_has_leads_source_id boolean := false;
  v_has_jobs_status boolean := false;
  v_has_jobs_current_stage boolean := false;
  v_completed_predicate text := '';
BEGIN
  -- Detect schema capabilities (avoid hard column references that may not exist)
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'leads'
      AND column_name = 'lead_source_id'
  ) INTO v_has_leads_source_id;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'roofing_jobs'
      AND column_name = 'status'
  ) INTO v_has_jobs_status;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'roofing_jobs'
      AND column_name = 'current_stage'
  ) INTO v_has_jobs_current_stage;

  -- SmartSend subscription cost (monthly fee)
  SELECT plan_id
    INTO v_plan_id
  FROM public.workspace_billing_state
  WHERE workspace_id = p_workspace_id
  LIMIT 1;

  v_smartsend_cost := public.ss_monthly_fee_for_plan_id(v_plan_id);

  -- SmartSend closed jobs (approved estimates) over the window
  SELECT COUNT(*)::bigint
    INTO v_smartsend_closed
  FROM public.estimates e
  JOIN public.roofing_companies rc ON rc.id = e.company_id
  WHERE rc.workspace_id = p_workspace_id
    AND e.origin_source = 'smartsend'
    AND e.approved_at IS NOT NULL
    AND e.approved_at >= v_start;

  v_smartsend_cpcj := CASE
    WHEN v_smartsend_closed > 0 AND v_smartsend_cost > 0
      THEN (v_smartsend_cost / v_smartsend_closed::numeric)
    ELSE NULL
  END;

  -- Ads / Lead services cost: sum roofing_marketing_spend overlapping the window.
  SELECT COALESCE(SUM(s.spend_amount), 0)::numeric
    INTO v_ads_cost
  FROM public.roofing_marketing_spend s
  WHERE s.workspace_id = p_workspace_id
    AND (
      lower(coalesce(s.category, '')) IN ('paid_ads', 'ads', 'digital', 'lead_service', 'lead_services')
      OR lower(coalesce(s.source, '')) LIKE '%google%'
      OR lower(coalesce(s.source, '')) LIKE '%facebook%'
      OR lower(coalesce(s.source, '')) LIKE '%ads%'
      OR lower(coalesce(s.source, '')) LIKE '%homeadvisor%'
      OR lower(coalesce(s.source, '')) LIKE '%angi%'
      OR lower(coalesce(s.source, '')) LIKE '%thumbtack%'
    )
    AND (s.spend_start IS NULL OR s.spend_start <= (now()::date))
    AND (s.spend_end IS NULL OR s.spend_end >= (v_start::date));

  -- Agency cost: sum roofing_marketing_spend overlapping the window.
  SELECT COALESCE(SUM(s.spend_amount), 0)::numeric
    INTO v_agency_cost
  FROM public.roofing_marketing_spend s
  WHERE s.workspace_id = p_workspace_id
    AND (
      lower(coalesce(s.category, '')) IN ('agency')
      OR lower(coalesce(s.source, '')) LIKE '%agency%'
      OR lower(coalesce(s.source, '')) LIKE '%marketing%'
    )
    AND (s.spend_start IS NULL OR s.spend_start <= (now()::date))
    AND (s.spend_end IS NULL OR s.spend_end >= (v_start::date));

  -- Closed jobs for Ads/Lead services and Agency:
  -- completed jobs mapped via leads.lead_source_id -> roofing_lead_sources.
  -- NOTE: We use updated_at as the time proxy for completion in the window (blunt + simple).
  -- We build the "completed" predicate dynamically to avoid referencing columns that may not exist.
  IF v_has_jobs_status THEN
    v_completed_predicate := v_completed_predicate || ' (j.status = ''completed'') ';
  END IF;
  IF v_has_jobs_current_stage THEN
    IF v_completed_predicate <> '' THEN
      v_completed_predicate := v_completed_predicate || ' OR ';
    END IF;
    v_completed_predicate := v_completed_predicate || ' (j.current_stage = ''COMPLETED'') ';
  END IF;
  IF v_completed_predicate = '' THEN
    -- No known completion signal available in this schema; leave counts at 0.
    v_ads_closed := 0;
    v_agency_closed := 0;
  ELSIF NOT v_has_leads_source_id THEN
    -- Can't map jobs to roofing_lead_sources without leads.lead_source_id.
    v_ads_closed := 0;
    v_agency_closed := 0;
  ELSE
    EXECUTE format(
      'SELECT COUNT(DISTINCT j.id)::bigint
       FROM public.roofing_jobs j
       JOIN public.leads l ON l.id = j.lead_id
       JOIN public.roofing_lead_sources ls ON ls.id = l.lead_source_id
       WHERE ls.workspace_id = $1
         AND ls.channel_type IN (''ads'', ''lead_service'')
         AND (%s)
         AND j.updated_at >= $2',
      v_completed_predicate
    )
    INTO v_ads_closed
    USING p_workspace_id, v_start;

    EXECUTE format(
      'SELECT COUNT(DISTINCT j.id)::bigint
       FROM public.roofing_jobs j
       JOIN public.leads l ON l.id = j.lead_id
       JOIN public.roofing_lead_sources ls ON ls.id = l.lead_source_id
       WHERE ls.workspace_id = $1
         AND ls.channel_type = ''agency''
         AND (%s)
         AND j.updated_at >= $2',
      v_completed_predicate
    )
    INTO v_agency_closed
    USING p_workspace_id, v_start;
  END IF;

  v_ads_cpcj := CASE
    WHEN v_ads_closed > 0 AND v_ads_cost IS NOT NULL AND v_ads_cost > 0
      THEN (v_ads_cost / v_ads_closed::numeric)
    ELSE NULL
  END;

  v_agency_cpcj := CASE
    WHEN v_agency_closed > 0 AND v_agency_cost IS NOT NULL AND v_agency_cost > 0
      THEN (v_agency_cost / v_agency_closed::numeric)
    ELSE NULL
  END;

  -- Return rows (SmartSend, Ads/Lead services, Agency)
  channel := 'smartsend';
  cost := v_smartsend_cost;
  closed_jobs := v_smartsend_closed;
  cost_per_closed_job := v_smartsend_cpcj;
  smartsend_outperforming := false;
  RETURN NEXT;

  channel := 'ads';
  cost := v_ads_cost;
  closed_jobs := v_ads_closed;
  cost_per_closed_job := v_ads_cpcj;
  smartsend_outperforming := (v_smartsend_cpcj IS NOT NULL AND v_ads_cpcj IS NOT NULL AND v_smartsend_cpcj < v_ads_cpcj);
  RETURN NEXT;

  channel := 'agency';
  cost := v_agency_cost;
  closed_jobs := v_agency_closed;
  cost_per_closed_job := v_agency_cpcj;
  smartsend_outperforming := (v_smartsend_cpcj IS NOT NULL AND v_agency_cpcj IS NOT NULL AND v_smartsend_cpcj < v_agency_cpcj);
  RETURN NEXT;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.ss_get_replacement_thresholds(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.ss_get_replacement_thresholds(uuid, integer) IS
  'Block 272300: Returns raw cost-per-closed-job for SmartSend vs Ads vs Agency over a rolling window (default 30d), plus outperform flags.';




