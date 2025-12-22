-- ============================================================
-- BLOCK 273600 — SmartSend Cash Certainty Sprint
-- Make money flow obvious, predictable, and inevitable.
--
-- Primitives:
-- - Closed → Cash countdown (expected cash date based on historical avg close→cash)
-- - Money-in-motion rollup (completed work awaiting payment)
-- - Week-by-week cash expectation (this week / next week)
-- - Cash stall visibility (expected date passed)
-- ============================================================

-- ------------------------------------------------------------
-- 1) Ensure roofing_jobs has completed_at (schema-drift safe)
-- ------------------------------------------------------------
ALTER TABLE IF EXISTS public.roofing_jobs
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

COMMENT ON COLUMN public.roofing_jobs.completed_at IS
  'Block 273600: Timestamp when job was marked completed (closed).';

CREATE INDEX IF NOT EXISTS idx_roofing_jobs_org_completed_at
  ON public.roofing_jobs(org_id, completed_at DESC)
  WHERE completed_at IS NOT NULL;

-- Best-effort backfill for existing completed jobs
DO $$
DECLARE
  v_has_org_id boolean;
  v_has_current_stage boolean;
  v_has_stage_changed_at boolean;
  v_has_status boolean;
  v_has_updated_at boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='roofing_jobs'
  ) THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='roofing_jobs' AND column_name='org_id'
  ) INTO v_has_org_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='roofing_jobs' AND column_name='current_stage'
  ) INTO v_has_current_stage;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='roofing_jobs' AND column_name='stage_changed_at'
  ) INTO v_has_stage_changed_at;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='roofing_jobs' AND column_name='status'
  ) INTO v_has_status;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='roofing_jobs' AND column_name='updated_at'
  ) INTO v_has_updated_at;

  -- Prefer stage_changed_at for CRM-stage schema (current_stage='COMPLETED')
  IF v_has_current_stage AND v_has_stage_changed_at THEN
    EXECUTE $sql$
      UPDATE public.roofing_jobs
      SET completed_at = COALESCE(completed_at, stage_changed_at)
      WHERE completed_at IS NULL
        AND lower(coalesce(current_stage::text,'')) = 'completed'
    $sql$;
  END IF;

  -- Fallback for legacy status schema (status='completed')
  IF v_has_status THEN
    IF v_has_updated_at THEN
      EXECUTE $sql$
        UPDATE public.roofing_jobs
        SET completed_at = COALESCE(completed_at, updated_at)
        WHERE completed_at IS NULL
          AND lower(coalesce(status::text,'')) = 'completed'
      $sql$;
    ELSE
      EXECUTE $sql$
        UPDATE public.roofing_jobs
        SET completed_at = COALESCE(completed_at, now())
        WHERE completed_at IS NULL
          AND lower(coalesce(status::text,'')) = 'completed'
      $sql$;
    END IF;
  END IF;
END $$;

-- Trigger: stamp completed_at when job becomes completed (schema-drift safe)
DO $$
DECLARE
  v_has_current_stage boolean;
  v_has_status boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='roofing_jobs'
  ) THEN
    RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='roofing_jobs' AND column_name='current_stage'
  ) INTO v_has_current_stage;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='roofing_jobs' AND column_name='status'
  ) INTO v_has_status;

  CREATE OR REPLACE FUNCTION public.ss_roofing_jobs_set_completed_at()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  BEGIN
    -- current_stage schema
    IF TG_OP = 'UPDATE' THEN
      IF NEW.completed_at IS NULL THEN
        IF NEW.current_stage IS NOT NULL AND lower(NEW.current_stage::text) = 'completed'
           AND (OLD.current_stage IS DISTINCT FROM NEW.current_stage) THEN
          NEW.completed_at := now();
        END IF;
      END IF;
    END IF;

    RETURN NEW;
  END;
  $fn$;

  CREATE OR REPLACE FUNCTION public.ss_roofing_jobs_set_completed_at_status()
  RETURNS trigger
  LANGUAGE plpgsql
  AS $fn$
  BEGIN
    IF TG_OP = 'UPDATE' THEN
      IF NEW.completed_at IS NULL THEN
        IF NEW.status IS NOT NULL AND lower(NEW.status::text) = 'completed'
           AND (OLD.status IS DISTINCT FROM NEW.status) THEN
          NEW.completed_at := now();
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END;
  $fn$;

  IF v_has_current_stage THEN
    DROP TRIGGER IF EXISTS trg_ss_roofing_jobs_set_completed_at ON public.roofing_jobs;
    CREATE TRIGGER trg_ss_roofing_jobs_set_completed_at
      BEFORE UPDATE OF current_stage ON public.roofing_jobs
      FOR EACH ROW
      EXECUTE FUNCTION public.ss_roofing_jobs_set_completed_at();
  END IF;

  IF v_has_status THEN
    DROP TRIGGER IF EXISTS trg_ss_roofing_jobs_set_completed_at_status ON public.roofing_jobs;
    CREATE TRIGGER trg_ss_roofing_jobs_set_completed_at_status
      BEFORE UPDATE OF status ON public.roofing_jobs
      FOR EACH ROW
      EXECUTE FUNCTION public.ss_roofing_jobs_set_completed_at_status();
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2) Cash expectation view (org-scoped)
-- ------------------------------------------------------------
-- Assumptions (matches existing UI usage):
-- - payments has org_id + job_id and status='succeeded' for received money
-- - roofing_jobs has org_id and either job_value or projected_job_value
--
-- If your schema deviates, adjust the joins/fields here.

CREATE OR REPLACE VIEW public.roofing_jobs_cash_expectation AS
WITH job_base AS (
  SELECT
    j.org_id,
    j.id AS job_id,
    j.completed_at,
    COALESCE(j.job_value, j.projected_job_value, 0)::numeric(12,2) AS earned_amount
  FROM public.roofing_jobs j
),
paid AS (
  SELECT
    p.org_id,
    p.job_id,
    COALESCE(SUM(CASE WHEN p.status = 'succeeded' THEN p.amount ELSE 0 END), 0)::numeric(12,2) AS total_paid_amount,
    MAX(CASE WHEN p.status = 'succeeded' THEN p.created_at ELSE NULL END) AS last_paid_at
  FROM public.payments p
  WHERE p.job_id IS NOT NULL
  GROUP BY 1,2
),
job_cash AS (
  SELECT
    jb.org_id,
    jb.job_id,
    jb.completed_at,
    jb.earned_amount,
    COALESCE(p.total_paid_amount, 0)::numeric(12,2) AS total_paid_amount,
    p.last_paid_at,
    GREATEST(jb.earned_amount - COALESCE(p.total_paid_amount, 0), 0)::numeric(12,2) AS awaiting_payment_amount,
    (
      jb.completed_at IS NOT NULL
      AND jb.earned_amount > 0
      AND COALESCE(p.total_paid_amount, 0) >= jb.earned_amount
    ) AS is_fully_paid
  FROM job_base jb
  LEFT JOIN paid p
    ON p.org_id = jb.org_id
   AND p.job_id = jb.job_id
),
org_avg AS (
  SELECT
    org_id,
    -- Avg close→cash over recent fully-paid jobs; fallback to 14 days.
    COALESCE(
      NULLIF(ROUND(AVG(EXTRACT(EPOCH FROM (last_paid_at - completed_at)) / 86400.0))::int, 0),
      14
    ) AS avg_days_to_cash
  FROM job_cash
  WHERE is_fully_paid = true
    AND completed_at IS NOT NULL
    AND last_paid_at IS NOT NULL
    AND completed_at >= (now() - interval '180 days')
  GROUP BY 1
)
SELECT
  jc.org_id,
  jc.job_id,
  jc.completed_at,
  jc.earned_amount,
  jc.total_paid_amount,
  jc.awaiting_payment_amount,
  jc.last_paid_at,
  jc.is_fully_paid,
  LEAST(GREATEST(COALESCE(oa.avg_days_to_cash, 14), 1), 60) AS avg_days_to_cash,
  CASE
    WHEN jc.completed_at IS NULL THEN NULL
    WHEN jc.awaiting_payment_amount <= 0 THEN NULL
    ELSE (jc.completed_at + ((LEAST(GREATEST(COALESCE(oa.avg_days_to_cash, 14), 1), 60))::text || ' days')::interval)
  END AS expected_cash_date,
  CASE
    WHEN jc.completed_at IS NULL THEN NULL
    WHEN jc.awaiting_payment_amount <= 0 THEN NULL
    ELSE GREATEST(
      0,
      ( (jc.completed_at + ((LEAST(GREATEST(COALESCE(oa.avg_days_to_cash, 14), 1), 60))::text || ' days')::interval)::date - CURRENT_DATE )
    )::int
  END AS days_until_expected,
  CASE
    WHEN jc.completed_at IS NULL THEN false
    WHEN jc.awaiting_payment_amount <= 0 THEN false
    ELSE ( (jc.completed_at + ((LEAST(GREATEST(COALESCE(oa.avg_days_to_cash, 14), 1), 60))::text || ' days')::interval)::date < CURRENT_DATE )
  END AS is_stalled
FROM job_cash jc
LEFT JOIN org_avg oa
  ON oa.org_id = jc.org_id;

ALTER VIEW public.roofing_jobs_cash_expectation SET (security_invoker = on);

COMMENT ON VIEW public.roofing_jobs_cash_expectation IS
  'Block 273600: Per-job close→cash expectation computed from org historical averages + payments.';

-- ------------------------------------------------------------
-- 3) Cash certainty rollup (org-scoped)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.roofing_cash_certainty_summary AS
WITH base AS (
  SELECT
    org_id,
    job_id,
    completed_at,
    awaiting_payment_amount,
    expected_cash_date,
    is_stalled
  FROM public.roofing_jobs_cash_expectation
  WHERE completed_at IS NOT NULL
    AND awaiting_payment_amount > 0
)
SELECT
  org_id,
  COALESCE(SUM(awaiting_payment_amount), 0)::numeric(12,2) AS money_in_motion,
  COALESCE(SUM(awaiting_payment_amount) FILTER (
    WHERE is_stalled = false
      AND expected_cash_date >= date_trunc('week', now())
      AND expected_cash_date < (date_trunc('week', now()) + interval '7 days')
  ), 0)::numeric(12,2) AS cash_likely_this_week,
  COALESCE(SUM(awaiting_payment_amount) FILTER (
    WHERE is_stalled = false
      AND expected_cash_date >= (date_trunc('week', now()) + interval '7 days')
      AND expected_cash_date < (date_trunc('week', now()) + interval '14 days')
  ), 0)::numeric(12,2) AS cash_likely_next_week,
  COALESCE(SUM(awaiting_payment_amount) FILTER (WHERE is_stalled = true), 0)::numeric(12,2) AS stalled_amount,
  COALESCE(COUNT(*) FILTER (WHERE is_stalled = true), 0)::int AS stalled_count
FROM base
GROUP BY 1;

ALTER VIEW public.roofing_cash_certainty_summary SET (security_invoker = on);

COMMENT ON VIEW public.roofing_cash_certainty_summary IS
  'Block 273600: Org rollup for money-in-motion + week buckets + stalled completed work.';

-- ------------------------------------------------------------
-- 4) Extend roofing_jobs_with_health to include cash certainty fields
-- ------------------------------------------------------------
-- Keeps the frontend fast (no N+1 per-job queries).
CREATE OR REPLACE VIEW public.roofing_jobs_with_health AS
SELECT
  j.id as job_id,
  j.org_id,
  j.homeowner_name,
  COALESCE(l.email, c.email) as homeowner_email,
  COALESCE(l.phone, c.phone) as homeowner_phone,
  j.current_stage as status,
  j.created_at,
  j.updated_at,

  h.latest_score,
  h.score_bucket,
  h.engagement_score,
  h.intent_score,
  h.follow_up_score,
  h.timeliness_score,
  h.last_calculated_at,

  -- Cash certainty (Block 273600)
  ce.awaiting_payment_amount as cash_awaiting_payment_amount,
  ce.days_until_expected as cash_days_until_expected,
  ce.is_stalled as cash_is_stalled

FROM public.roofing_jobs j
LEFT JOIN public.roofing_job_health_scores h
  ON h.job_id = j.id
  AND h.org_id = j.org_id
LEFT JOIN public.leads l
  ON l.id = j.lead_id
LEFT JOIN public.contacts c
  ON c.id = j.contact_id
LEFT JOIN public.roofing_jobs_cash_expectation ce
  ON ce.job_id = j.id
  AND ce.org_id = j.org_id;

ALTER VIEW public.roofing_jobs_with_health SET (security_invoker = on);


