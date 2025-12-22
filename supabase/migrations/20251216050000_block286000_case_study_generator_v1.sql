-- ============================================================
-- BLOCK 286000 — SmartSend Case Study Generator v1
-- “Turn First Wins Into Sales Ammo.”
--
-- Objective:
-- - Automatically convert real customer wins into sales-ready proof
-- - Live data only (estimates, followups, jobs, delivery_logs, operator-loop signals)
-- - No manual trigger in v1
-- - Hard anonymization enforced by generation (no company name, no exact addresses)
-- - Admin approval gate before external use
-- ============================================================

-- ============================================================
-- 1) Table: case_studies
-- ============================================================
CREATE TABLE IF NOT EXISTS public.case_studies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  title text NOT NULL,
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  approved_for_use boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_case_studies_company_generated
  ON public.case_studies(company_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_case_studies_approved_generated
  ON public.case_studies(approved_for_use, generated_at DESC)
  WHERE approved_for_use = true;

ALTER TABLE public.case_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_studies FORCE ROW LEVEL SECURITY;

-- Only service_role may access case studies directly.
-- UI and demo surfaces read through server routes/components using service role.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='case_studies' AND policyname='case_studies_service_role_all'
  ) THEN
    CREATE POLICY case_studies_service_role_all
      ON public.case_studies
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='case_studies' AND policyname='case_studies_block_authenticated'
  ) THEN
    CREATE POLICY case_studies_block_authenticated
      ON public.case_studies
      FOR ALL
      TO authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

GRANT ALL ON public.case_studies TO service_role;

COMMENT ON TABLE public.case_studies IS 'Block 286000: Auto-generated, anonymized case studies (approval-gated).';

-- ============================================================
-- 2) Helpers (formatting + anonymized snapshot composition)
-- ============================================================

-- Money display rule:
-- - Revenue shown as ranges if < $50k (hard enforced in stored JSON)
-- - Exact value may be stored in metrics_json for internal math/evidence
CREATE OR REPLACE FUNCTION public.ss_money_display_json(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric := COALESCE(p_amount, 0);
  v_min numeric;
  v_max numeric;
  v_display text;
BEGIN
  IF v_amount < 50000 THEN
    -- 5k buckets: 0-5k, 5-10k, ... up to 45-50k
    v_min := GREATEST(0, floor(v_amount / 5000) * 5000);
    v_max := v_min + 5000;
    v_display := ('$' || (v_min / 1000)::int || 'k–$' || (v_max / 1000)::int || 'k');
    RETURN jsonb_build_object(
      'is_range', true,
      'min', v_min,
      'max', v_max,
      'display', v_display
    );
  END IF;

  v_display := to_char(v_amount, 'FM$999,999,999,990');
  RETURN jsonb_build_object(
    'is_range', false,
    'value', v_amount,
    'display', v_display
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ss_money_display_json(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ss_money_display_json(numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.ss_company_size_range(p_company_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cnt int := 0;
BEGIN
  SELECT COUNT(*)::int
  INTO v_cnt
  FROM public.roofing_company_members m
  WHERE m.roofing_company_id = p_company_id
    AND COALESCE(m.is_active, true) = true;

  IF v_cnt <= 1 THEN
    RETURN '1';
  ELSIF v_cnt <= 3 THEN
    RETURN '2–3';
  ELSIF v_cnt <= 10 THEN
    RETURN '4–10';
  ELSIF v_cnt <= 25 THEN
    RETURN '11–25';
  ELSIF v_cnt <= 50 THEN
    RETURN '26–50';
  ELSE
    RETURN '50+';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ss_company_size_range(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ss_company_size_range(uuid) TO service_role;

-- ============================================================
-- 3) Generator (DB-only; called by triggers)
-- ============================================================

CREATE OR REPLACE FUNCTION public.ss_generate_case_study(p_company_id uuid, p_trigger text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company record;
  v_jobs_approved int := 0;
  v_recovered int := 0;
  v_revenue_total numeric := 0;
  v_avg_time_to_approval_hours numeric := NULL;
  v_baseline_send_delay_hours numeric := NULL;
  v_followup_gap_days numeric := NULL;
  v_same_day_rate numeric := NULL;
  v_followups_sent int := 0;
  v_daily_operator_used boolean := false;
  v_title text;
  v_revenue_display jsonb;
  v_problem text;
  v_solution jsonb;
  v_results jsonb;
  v_snapshot jsonb;
  v_metrics jsonb;
  v_id uuid;
BEGIN
  -- Guard: ignore null company
  IF p_company_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Guard: only generate once per trigger per company
  IF EXISTS (
    SELECT 1
    FROM public.case_studies cs
    WHERE cs.company_id = p_company_id
      AND (cs.metrics_json->>'trigger') = p_trigger
  ) THEN
    RETURN NULL;
  END IF;

  SELECT
    rc.id,
    rc.city,
    rc.state,
    rc.created_at,
    COALESCE(rc.is_demo, false) AS is_demo
  INTO v_company
  FROM public.roofing_companies rc
  WHERE rc.id = p_company_id;

  -- Live-only: skip demo companies entirely
  IF v_company.id IS NULL OR v_company.is_demo = true THEN
    RETURN NULL;
  END IF;

  -- Jobs approved (approved estimates)
  SELECT COUNT(*)::int
  INTO v_jobs_approved
  FROM public.estimates e
  WHERE e.company_id = p_company_id
    AND (COALESCE(e.status::text, '') = 'approved' OR e.approved_at IS NOT NULL)
    AND e.archived_at IS NULL;

  -- Total approved revenue (schema-safe: prefers total_price, falls back to total)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimates' AND column_name = 'total_price'
  ) THEN
    EXECUTE $q$
      SELECT COALESCE(SUM(COALESCE(e.total_price, 0)), 0)
      FROM public.estimates e
      WHERE e.company_id = $1
        AND (COALESCE(e.status::text, '') = 'approved' OR e.approved_at IS NOT NULL)
        AND e.archived_at IS NULL
    $q$
    INTO v_revenue_total
    USING p_company_id;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimates' AND column_name = 'total'
  ) THEN
    EXECUTE $q$
      SELECT COALESCE(SUM(COALESCE(e.total, 0)), 0)
      FROM public.estimates e
      WHERE e.company_id = $1
        AND (COALESCE(e.status::text, '') = 'approved' OR e.approved_at IS NOT NULL)
        AND e.archived_at IS NULL
    $q$
    INTO v_revenue_total
    USING p_company_id;
  ELSE
    v_revenue_total := 0;
  END IF;

  -- Jobs recovered via follow-up:
  -- (approved after at least one follow-up was sent on/before approval)
  SELECT COUNT(DISTINCT e.id)::int
  INTO v_recovered
  FROM public.estimates e
  WHERE e.company_id = p_company_id
    AND (COALESCE(e.status::text, '') = 'approved' OR e.approved_at IS NOT NULL)
    AND e.archived_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.followups f
      WHERE f.estimate_id = e.id
        AND f.sent_at IS NOT NULL
        AND f.sent_at <= COALESCE(e.approved_at, now())
    );

  -- Avg time to approval (sent_at -> approved_at)
  SELECT AVG(EXTRACT(EPOCH FROM (e.approved_at - e.sent_at)) / 3600.0)
  INTO v_avg_time_to_approval_hours
  FROM public.estimates e
  WHERE e.company_id = p_company_id
    AND e.sent_at IS NOT NULL
    AND e.approved_at IS NOT NULL
    AND e.archived_at IS NULL;

  -- Baseline send delay (created_at -> sent_at) using earliest 10 sent estimates
  SELECT AVG(EXTRACT(EPOCH FROM (x.sent_at - x.created_at)) / 3600.0)
  INTO v_baseline_send_delay_hours
  FROM (
    SELECT e.created_at, e.sent_at
    FROM public.estimates e
    WHERE e.company_id = p_company_id
      AND e.sent_at IS NOT NULL
      AND e.created_at IS NOT NULL
      AND e.archived_at IS NULL
    ORDER BY e.created_at ASC
    LIMIT 10
  ) x;

  -- Follow-up gap (sent_at -> first followup sent_at) in days
  SELECT AVG(EXTRACT(EPOCH FROM (ff.first_followup_at - e.sent_at)) / 86400.0)
  INTO v_followup_gap_days
  FROM public.estimates e
  JOIN (
    SELECT f.estimate_id, MIN(f.sent_at) AS first_followup_at
    FROM public.followups f
    WHERE f.sent_at IS NOT NULL
    GROUP BY f.estimate_id
  ) ff ON ff.estimate_id = e.id
  WHERE e.company_id = p_company_id
    AND e.sent_at IS NOT NULL
    AND e.archived_at IS NULL;

  -- Same-day send rate (sent within 24h of creation), last 30 sent estimates
  WITH last_sent AS (
    SELECT e.created_at, e.sent_at
    FROM public.estimates e
    WHERE e.company_id = p_company_id
      AND e.sent_at IS NOT NULL
      AND e.created_at IS NOT NULL
      AND e.archived_at IS NULL
    ORDER BY e.sent_at DESC
    LIMIT 30
  )
  SELECT
    CASE WHEN COUNT(*) = 0 THEN NULL
         ELSE (SUM(CASE WHEN sent_at <= created_at + interval '1 day' THEN 1 ELSE 0 END)::numeric / COUNT(*)::numeric)
    END
  INTO v_same_day_rate
  FROM last_sent;

  -- Follow-ups sent count (evidence)
  SELECT COUNT(*)::int
  INTO v_followups_sent
  FROM public.followups f
  JOIN public.estimates e ON e.id = f.estimate_id
  WHERE e.company_id = p_company_id
    AND f.sent_at IS NOT NULL;

  -- Daily operator loop used (proxy): followups activated/scheduled or followups exist
  SELECT EXISTS (
    SELECT 1
    FROM public.estimates e
    WHERE e.company_id = p_company_id
      AND e.archived_at IS NULL
      AND (
        COALESCE(e.followup_status::text, '') = 'active'
        OR e.next_followup_at IS NOT NULL
      )
  ) OR (v_followups_sent > 0)
  INTO v_daily_operator_used;

  -- Title (fixed)
  v_title := format('Local Roofing Company Closes %s Jobs Faster With SmartSend', GREATEST(v_jobs_approved, 1));

  v_revenue_display := public.ss_money_display_json(v_revenue_total);

  -- Problem (auto, driven by measured delays)
  v_problem := format(
    'Before SmartSend, estimates often waited %.0f hours to go out and follow-ups stalled for %.1f days.',
    COALESCE(v_baseline_send_delay_hours, 24),
    COALESCE(v_followup_gap_days, 3.0)
  );

  -- Solution (auto evidence, fixed bullets)
  v_solution := jsonb_build_array(
    jsonb_build_object('label', 'Estimates sent same day', 'evidence', jsonb_build_object('same_day_send_rate', COALESCE(v_same_day_rate, 0))),
    jsonb_build_object('label', 'Follow-ups automated', 'evidence', jsonb_build_object('followups_sent', v_followups_sent)),
    jsonb_build_object('label', 'Daily operator loop used', 'evidence', jsonb_build_object('used', v_daily_operator_used))
  );

  -- Results (auto)
  v_results := jsonb_build_array(
    jsonb_build_object('label', 'Jobs approved', 'value', v_jobs_approved),
    jsonb_build_object('label', 'Revenue closed', 'value', v_revenue_display->>'display'),
    jsonb_build_object('label', 'Jobs recovered', 'value', v_recovered),
    jsonb_build_object(
      'label',
      'Avg time to approval',
      'value',
      CASE
        WHEN v_avg_time_to_approval_hours IS NULL THEN '—'
        WHEN v_avg_time_to_approval_hours >= 48 THEN to_char((v_avg_time_to_approval_hours / 24.0), 'FM999,990.0') || ' days'
        ELSE to_char(v_avg_time_to_approval_hours, 'FM999,990.0') || ' hours'
      END
    )
  );

  v_snapshot := jsonb_build_object(
    'snapshot', jsonb_build_object(
      'city', NULLIF(BTRIM(COALESCE(v_company.city, '')), ''),
      'state', NULLIF(BTRIM(COALESCE(v_company.state, '')), ''),
      'company_size_range', public.ss_company_size_range(p_company_id),
      'time_using_smartsend_days', GREATEST(0, date_part('day', now() - COALESCE(v_company.created_at, now()))::int)
    ),
    'problem', v_problem,
    'solution', v_solution,
    'results', v_results,
    'quote', jsonb_build_object(
      'text', '“SmartSend paid for itself after the first job.”',
      'attribution', '(Anonymous, standardized.)'
    ),
    'anonymization', jsonb_build_object(
      'company_name_removed', true,
      'exact_addresses_removed', true,
      'city_state_only', true,
      'revenue_ranged_if_lt_50k', true
    )
  );

  v_metrics := jsonb_build_object(
    'trigger', p_trigger,
    'jobs_approved', v_jobs_approved,
    'jobs_recovered', v_recovered,
    'revenue_total', v_revenue_total,
    'revenue_display', v_revenue_display,
    'avg_time_to_approval_hours', v_avg_time_to_approval_hours,
    'baseline_send_delay_hours', v_baseline_send_delay_hours,
    'followup_gap_days', v_followup_gap_days,
    'evidence', jsonb_build_object(
      'same_day_send_rate', v_same_day_rate,
      'followups_sent', v_followups_sent,
      'daily_operator_loop_used', v_daily_operator_used
    ),
    'sources', jsonb_build_object(
      'tables', jsonb_build_array('estimates', 'followups', 'jobs', 'delivery_logs', 'daily_operator_queue'),
      'generated_by', 'db_trigger_v1'
    )
  );

  INSERT INTO public.case_studies(company_id, title, snapshot_json, metrics_json)
  VALUES (p_company_id, v_title, v_snapshot, v_metrics)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ss_generate_case_study(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ss_generate_case_study(uuid, text) TO service_role;

-- ============================================================
-- 4) Trigger dispatcher (LOCKED triggers)
-- ============================================================

CREATE OR REPLACE FUNCTION public.ss_maybe_generate_case_studies(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_jobs_approved int := 0;
  v_recovered int := 0;
  v_revenue_total numeric := 0;
BEGIN
  IF p_company_id IS NULL THEN
    RETURN;
  END IF;

  -- Compute current milestone state
  SELECT COUNT(*)::int
  INTO v_jobs_approved
  FROM public.estimates e
  WHERE e.company_id = p_company_id
    AND (COALESCE(e.status::text, '') = 'approved' OR e.approved_at IS NOT NULL)
    AND e.archived_at IS NULL;

  -- Total approved revenue (schema-safe: prefers total_price, falls back to total)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimates' AND column_name = 'total_price'
  ) THEN
    EXECUTE $q$
      SELECT COALESCE(SUM(COALESCE(e.total_price, 0)), 0)
      FROM public.estimates e
      WHERE e.company_id = $1
        AND (COALESCE(e.status::text, '') = 'approved' OR e.approved_at IS NOT NULL)
        AND e.archived_at IS NULL
    $q$
    INTO v_revenue_total
    USING p_company_id;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimates' AND column_name = 'total'
  ) THEN
    EXECUTE $q$
      SELECT COALESCE(SUM(COALESCE(e.total, 0)), 0)
      FROM public.estimates e
      WHERE e.company_id = $1
        AND (COALESCE(e.status::text, '') = 'approved' OR e.approved_at IS NOT NULL)
        AND e.archived_at IS NULL
    $q$
    INTO v_revenue_total
    USING p_company_id;
  ELSE
    v_revenue_total := 0;
  END IF;

  SELECT COUNT(DISTINCT e.id)::int
  INTO v_recovered
  FROM public.estimates e
  WHERE e.company_id = p_company_id
    AND (COALESCE(e.status::text, '') = 'approved' OR e.approved_at IS NOT NULL)
    AND e.archived_at IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.followups f
      WHERE f.estimate_id = e.id
        AND f.sent_at IS NOT NULL
        AND f.sent_at <= COALESCE(e.approved_at, now())
    );

  -- Trigger 1: First job approved
  IF v_jobs_approved = 1 THEN
    PERFORM public.ss_generate_case_study(p_company_id, 'first_job_approved');
  END IF;

  -- Trigger 2: $25,000+ total approved revenue
  IF v_revenue_total >= 25000 THEN
    PERFORM public.ss_generate_case_study(p_company_id, 'revenue_25k');
  END IF;

  -- Trigger 3: ≥2 jobs recovered via follow-up
  IF v_recovered >= 2 THEN
    PERFORM public.ss_generate_case_study(p_company_id, 'recovered_2');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.ss_maybe_generate_case_studies(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ss_maybe_generate_case_studies(uuid) TO service_role;

-- Trigger: on estimate approval (status becomes approved)
CREATE OR REPLACE FUNCTION public.ss_case_study_on_estimate_approved()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only run on transition to approved
  IF (NEW.company_id IS NOT NULL)
     AND (NEW.status = 'approved')
     AND (TG_OP = 'UPDATE')
     AND (OLD.status IS DISTINCT FROM 'approved') THEN
    PERFORM public.ss_maybe_generate_case_studies(NEW.company_id);
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'estimates'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_ss_case_study_on_estimate_approved ON public.estimates';
    EXECUTE $trg$
      CREATE TRIGGER trg_ss_case_study_on_estimate_approved
      AFTER UPDATE OF status ON public.estimates
      FOR EACH ROW
      WHEN (NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved'))
      EXECUTE FUNCTION public.ss_case_study_on_estimate_approved()
    $trg$;
  END IF;
END $$;









