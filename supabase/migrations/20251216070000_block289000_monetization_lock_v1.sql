-- ============================================================
-- BLOCK 289000 — SmartSend v1 Monetization Lock
-- “Revenue First, Always.”
--
-- Implements company-scoped monthly usage counters + hard enforcement:
-- - Sending estimates
-- - Sending follow-ups
-- - Running outreach (campaign_send_queue inserts)
-- - Exporting data (enforced in API, counters stored here)
--
-- Also preserves the legacy account-scoped usage counter system by renaming
-- the existing public.usage_counters (account_id/metric/month/count) table.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 0) Preserve legacy account-scoped usage counters (rename table + patch funcs)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema='public' AND table_name='usage_counters'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='usage_counters' AND column_name='account_id'
  )
  THEN
    -- Keep legacy system working, but free up the canonical name for company usage.
    ALTER TABLE public.usage_counters RENAME TO account_usage_counters;
  END IF;
END $$;

-- Re-point legacy helper functions to public.account_usage_counters if present.
-- These functions are used by the older plan catalog / entitlements system.
CREATE OR REPLACE FUNCTION public.bump_usage(p_account uuid, p_metric text, p_delta int DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_month date := public.usage_month();
BEGIN
  IF p_account IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='account_usage_counters') THEN
    INSERT INTO public.account_usage_counters(account_id, metric, month, count)
    VALUES (p_account, p_metric, v_month, GREATEST(p_delta, 0))
    ON CONFLICT (account_id, metric, month)
    DO UPDATE SET count = public.account_usage_counters.count + EXCLUDED.count;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.assert_within_limit(p_account uuid, p_metric text, p_entitlement_key text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_month date := public.usage_month();
  v_used bigint;
  v_limit int;
  v_left int;
BEGIN
  IF p_account IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='account_usage_counters') THEN
    -- legacy table not installed in this environment
    RETURN;
  END IF;

  SELECT COALESCE(count, 0)
    INTO v_used
  FROM public.account_usage_counters
  WHERE account_id = p_account
    AND metric = p_metric
    AND month = v_month;

  SELECT (public.get_entitlement(p_account, p_entitlement_key))::text::int
    INTO v_limit;

  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'Missing entitlement %', p_entitlement_key
      USING ERRCODE = 'UL001';
  END IF;

  v_left := v_limit - v_used;

  IF v_left <= 0 THEN
    RAISE EXCEPTION 'Limit reached for % (used %, limit %)', p_metric, v_used, v_limit
      USING ERRCODE = 'ULMAX';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.guard_emails_month()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_account uuid;
BEGIN
  -- Only enforce if legacy schema exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='account_usage_counters') THEN
    RETURN NEW;
  END IF;

  SELECT account_id
    INTO v_account
  FROM public.campaigns
  WHERE id = NEW.campaign_id;

  IF v_account IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM public.assert_within_limit(v_account, 'emails_sent', 'emails_month');
  PERFORM public.bump_usage(v_account, 'emails_sent', 1);

  RETURN NEW;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='send_queue') THEN
    DROP TRIGGER IF EXISTS trg_guard_emails_month ON public.send_queue;
    CREATE TRIGGER trg_guard_emails_month
    BEFORE INSERT ON public.send_queue
    FOR EACH ROW EXECUTE FUNCTION public.guard_emails_month();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1) Company-scoped monthly usage counters (canonical: public.usage_counters)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usage_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  period_start date NOT NULL, -- first day of month (UTC)
  estimates_sent bigint NOT NULL DEFAULT 0,
  followups_sent bigint NOT NULL DEFAULT 0,
  outreach_sent bigint NOT NULL DEFAULT 0,
  exports_used bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_usage_counters_company_period
  ON public.usage_counters(company_id, period_start DESC);

ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='usage_counters' AND policyname='usage_counters_select_company_members'
  ) THEN
    CREATE POLICY usage_counters_select_company_members
      ON public.usage_counters
      FOR SELECT
      TO authenticated
      USING (public.is_company_member(company_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='usage_counters' AND policyname='usage_counters_service_role_all'
  ) THEN
    CREATE POLICY usage_counters_service_role_all
      ON public.usage_counters
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

GRANT SELECT ON public.usage_counters TO authenticated;
GRANT ALL ON public.usage_counters TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Helpers: monthly period + plan limits
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ss_usage_period_start(d timestamptz DEFAULT now())
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT date_trunc('month', d AT TIME ZONE 'UTC')::date
$$;

CREATE OR REPLACE FUNCTION public.ss_get_company_subscription(p_company_id uuid)
RETURNS TABLE(plan text, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(cs.plan, 'starter')::text AS plan,
    COALESCE(cs.status, 'trial')::text AS status
  FROM public.company_subscriptions cs
  WHERE cs.company_id = p_company_id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.ss_get_company_subscription(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ss_get_company_subscription(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ss_plan_limit(p_plan text, p_metric text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN lower(p_metric) IN ('estimates_sent','followups_sent') THEN 9223372036854775807::bigint -- unlimited
    WHEN lower(p_metric) = 'outreach_sent' THEN
      CASE lower(COALESCE(p_plan,'starter'))
        WHEN 'starter' THEN 500
        WHEN 'growth' THEN 2000
        WHEN 'domination' THEN 9223372036854775807::bigint
        ELSE 500
      END
    WHEN lower(p_metric) = 'exports_used' THEN
      CASE lower(COALESCE(p_plan,'starter'))
        WHEN 'starter' THEN 1
        WHEN 'growth' THEN 9223372036854775807::bigint
        WHEN 'domination' THEN 9223372036854775807::bigint
        ELSE 1
      END
    ELSE 0
  END
$$;

-- Ensure current period row exists and lock it for update
CREATE OR REPLACE FUNCTION public.ss_get_usage_row_for_update(p_company_id uuid)
RETURNS public.usage_counters
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period date := public.ss_usage_period_start();
  v_row public.usage_counters%rowtype;
BEGIN
  INSERT INTO public.usage_counters(company_id, period_start)
  VALUES (p_company_id, v_period)
  ON CONFLICT (company_id, period_start) DO NOTHING;

  SELECT *
    INTO v_row
  FROM public.usage_counters
  WHERE company_id = p_company_id
    AND period_start = v_period
  FOR UPDATE;

  RETURN v_row;
END
$$;

REVOKE ALL ON FUNCTION public.ss_get_usage_row_for_update(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ss_get_usage_row_for_update(uuid) TO authenticated, service_role;

-- Check + (optionally) mutate usage in one place.
-- p_action is one of: send_estimate, send_followup, send_outreach, export_data
CREATE OR REPLACE FUNCTION public.ss_check_and_bump_usage(
  p_company_id uuid,
  p_action text,
  p_amount int DEFAULT 1,
  p_bump boolean DEFAULT true
)
RETURNS TABLE(
  allowed boolean,
  reason text,
  plan text,
  status text,
  current_count bigint,
  max_allowed bigint,
  message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan text := 'starter';
  v_status text := 'trial';
  v_tier text := 'locked';
  v_metric text;
  v_limit bigint;
  v_used bigint;
  v_row public.usage_counters%rowtype;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN QUERY SELECT false, 'missing_company', v_plan, v_status, 0::bigint, 0::bigint, 'Missing company.'::text;
    RETURN;
  END IF;

  SELECT s.plan, s.status INTO v_plan, v_status
  FROM public.ss_get_company_subscription(p_company_id) s;

  -- Scale tier (defaults locked if missing)
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='scale_metrics_latest') THEN
    SELECT COALESCE(sml.tier, 'locked') INTO v_tier
    FROM public.scale_metrics_latest sml
    WHERE sml.company_id = p_company_id;
    v_tier := COALESCE(v_tier, 'locked');
  END IF;

  -- Map action -> metric column
  v_metric := CASE lower(COALESCE(p_action,''))
    WHEN 'send_estimate' THEN 'estimates_sent'
    WHEN 'send_followup' THEN 'followups_sent'
    WHEN 'send_outreach' THEN 'outreach_sent'
    WHEN 'export_data' THEN 'exports_used'
    ELSE NULL
  END;

  IF v_metric IS NULL THEN
    RETURN QUERY SELECT false, 'unknown_action', v_plan, v_status, 0::bigint, 0::bigint, 'Unknown action.'::text;
    RETURN;
  END IF;

  -- No free scaling rule: subscription must be active for all monetized actions.
  IF v_status IS DISTINCT FROM 'active' THEN
    RETURN QUERY SELECT false, 'subscription_inactive', v_plan, v_status, 0::bigint, 0::bigint, 'You’ve hit your plan limit. Upgrade to keep momentum.'::text;
    RETURN;
  END IF;

  -- No free scaling rule: exports disabled when scale tier locked; follow-ups paused when locked.
  IF v_tier = 'locked' AND v_metric IN ('exports_used','followups_sent') THEN
    RETURN QUERY SELECT false, 'scale_locked', v_plan, v_status, 0::bigint, 0::bigint, 'You’ve hit your plan limit. Upgrade to keep momentum.'::text;
    RETURN;
  END IF;

  v_row := public.ss_get_usage_row_for_update(p_company_id);

  v_used := CASE v_metric
    WHEN 'estimates_sent' THEN v_row.estimates_sent
    WHEN 'followups_sent' THEN v_row.followups_sent
    WHEN 'outreach_sent' THEN v_row.outreach_sent
    WHEN 'exports_used' THEN v_row.exports_used
    ELSE 0
  END;

  v_limit := public.ss_plan_limit(v_plan, v_metric);

  IF (v_used + GREATEST(COALESCE(p_amount,1),0)) > v_limit THEN
    RETURN QUERY SELECT false, 'limit_reached', v_plan, v_status, v_used, v_limit, 'You’ve hit your plan limit. Upgrade to keep momentum.'::text;
    RETURN;
  END IF;

  IF p_bump THEN
    UPDATE public.usage_counters
    SET
      estimates_sent = CASE WHEN v_metric = 'estimates_sent' THEN estimates_sent + GREATEST(COALESCE(p_amount,1),0) ELSE estimates_sent END,
      followups_sent = CASE WHEN v_metric = 'followups_sent' THEN followups_sent + GREATEST(COALESCE(p_amount,1),0) ELSE followups_sent END,
      outreach_sent  = CASE WHEN v_metric = 'outreach_sent'  THEN outreach_sent  + GREATEST(COALESCE(p_amount,1),0) ELSE outreach_sent  END,
      exports_used   = CASE WHEN v_metric = 'exports_used'   THEN exports_used   + GREATEST(COALESCE(p_amount,1),0) ELSE exports_used   END
    WHERE id = v_row.id;
  END IF;

  RETURN QUERY SELECT true, 'ok', v_plan, v_status, v_used, v_limit, NULL::text;
END
$$;

REVOKE ALL ON FUNCTION public.ss_check_and_bump_usage(uuid, text, int, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ss_check_and_bump_usage(uuid, text, int, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) DB-level enforcement hooks (hard block bypass attempts)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ss_guard_estimate_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_res record;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Only when transitioning into "sent"
  IF NEW.status = 'sent' AND (OLD.status IS DISTINCT FROM 'sent') THEN
    v_company := NEW.company_id;
    SELECT * INTO v_res
    FROM public.ss_check_and_bump_usage(v_company, 'send_estimate', 1, true);
    IF COALESCE(v_res.allowed, false) = false THEN
      RAISE EXCEPTION '%', 'SS_PLAN_LIMIT: ' || COALESCE(v_res.message, 'Blocked')
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='estimates') THEN
    DROP TRIGGER IF EXISTS trg_ss_guard_estimate_sent ON public.estimates;
    CREATE TRIGGER trg_ss_guard_estimate_sent
      BEFORE UPDATE OF status ON public.estimates
      FOR EACH ROW EXECUTE FUNCTION public.ss_guard_estimate_sent();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ss_guard_outreach_queue_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_plan text;
  v_status text;
  v_res record;
BEGIN
  -- Resolve company from workspace_id (best-effort)
  SELECT rc.id INTO v_company
  FROM public.roofing_companies rc
  WHERE rc.workspace_id = NEW.workspace_id
  ORDER BY rc.created_at ASC
  LIMIT 1;

  IF v_company IS NULL THEN
    RETURN NEW;
  END IF;

  -- Enforce + reserve outreach usage at enqueue time
  SELECT * INTO v_res
  FROM public.ss_check_and_bump_usage(v_company, 'send_outreach', 1, true);

  IF COALESCE(v_res.allowed, false) = false THEN
    RAISE EXCEPTION '%', 'SS_PLAN_LIMIT: ' || COALESCE(v_res.message, 'Blocked')
      USING ERRCODE = 'P0001';
  END IF;

  -- Domination: priority send queue (highest)
  v_plan := COALESCE(v_res.plan, 'starter');
  v_status := COALESCE(v_res.status, 'trial');
  IF v_status = 'active' AND v_plan = 'domination' THEN
    NEW.priority := 1;
  END IF;

  RETURN NEW;
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='campaign_send_queue') THEN
    DROP TRIGGER IF EXISTS trg_ss_guard_outreach_queue_insert ON public.campaign_send_queue;
    CREATE TRIGGER trg_ss_guard_outreach_queue_insert
      BEFORE INSERT ON public.campaign_send_queue
      FOR EACH ROW EXECUTE FUNCTION public.ss_guard_outreach_queue_insert();
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4) Value context RPC (for paywalls): usage + revenue + jobs recovered
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ss_company_value_context(p_company_id uuid)
RETURNS TABLE(
  company_id uuid,
  period_start date,
  usage jsonb,
  revenue_closed_this_month numeric,
  jobs_recovered int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period date := public.ss_usage_period_start();
  v_usage public.usage_counters%rowtype;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_company_member(p_company_id) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Ensure usage row exists for current period (read only; no lock needed)
  INSERT INTO public.usage_counters(company_id, period_start)
  VALUES (p_company_id, v_period)
  ON CONFLICT (company_id, period_start) DO NOTHING;

  SELECT * INTO v_usage
  FROM public.usage_counters
  WHERE company_id = p_company_id
    AND period_start = v_period;

  RETURN QUERY
  SELECT
    p_company_id,
    v_period,
    jsonb_build_object(
      'estimates_sent', COALESCE(v_usage.estimates_sent, 0),
      'followups_sent', COALESCE(v_usage.followups_sent, 0),
      'outreach_sent',  COALESCE(v_usage.outreach_sent, 0),
      'exports_used',   COALESCE(v_usage.exports_used, 0)
    ) AS usage,
    COALESCE((
      SELECT SUM(NULLIF(e.total_price::text,'')::numeric)
      FROM public.estimates e
      WHERE e.company_id = p_company_id
        AND e.approved_at IS NOT NULL
        AND e.approved_at >= (v_period::timestamptz)
        AND e.approved_at <  ((v_period::timestamptz) + interval '1 month')
    ), 0)::numeric AS revenue_closed_this_month,
    COALESCE((
      SELECT COUNT(DISTINCT e2.id)::int
      FROM public.estimates e2
      WHERE e2.company_id = p_company_id
        AND e2.approved_at IS NOT NULL
        AND e2.approved_at >= (v_period::timestamptz)
        AND e2.approved_at <  ((v_period::timestamptz) + interval '1 month')
        AND EXISTS (SELECT 1 FROM public.followups f WHERE f.estimate_id = e2.id)
    ), 0) AS jobs_recovered;
END
$$;

REVOKE ALL ON FUNCTION public.ss_company_value_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ss_company_value_context(uuid) TO authenticated, service_role;









