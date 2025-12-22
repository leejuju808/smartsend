-- ============================================================
-- BLOCK 284000 — SmartSend First 10 Clients Ops v1
-- “Onboard, Close, Retain Without Chaos.”
--
-- Internal-only operational spine for the first 10 paying roofing companies.
-- Control + visibility only (no emails, no automations).
-- ============================================================

-- Safety: required extensions (uuid)
DO $$
BEGIN
  -- uuid-ossp may not exist in all environments; gen_random_uuid comes from pgcrypto.
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- ============================================================
-- 1) CLIENT OPS RECORD (INTERNAL)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.client_ops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,

  onboarding_status text NOT NULL DEFAULT 'not_started'
    CHECK (onboarding_status IN ('not_started', 'active', 'complete')),

  first_estimate_sent_at timestamptz,
  first_job_approved_at timestamptz,

  founder boolean NOT NULL DEFAULT false,

  health_status text NOT NULL DEFAULT 'green'
    CHECK (health_status IN ('green', 'yellow', 'red')),

  last_checkin_at timestamptz,
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT client_ops_company_id_unique UNIQUE (company_id)
);

CREATE INDEX IF NOT EXISTS idx_client_ops_health ON public.client_ops(health_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_ops_founder ON public.client_ops(founder) WHERE founder = true;

CREATE OR REPLACE FUNCTION public.set_client_ops_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_ops_updated_at ON public.client_ops;
CREATE TRIGGER trg_client_ops_updated_at
BEFORE UPDATE ON public.client_ops
FOR EACH ROW
EXECUTE FUNCTION public.set_client_ops_updated_at();

-- ============================================================
-- 2) HEALTH STATUS DAILY HISTORY (for “yellow 5 days” visibility)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.client_ops_health_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  day date NOT NULL,
  health_status text NOT NULL CHECK (health_status IN ('green', 'yellow', 'red')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_ops_health_daily_unique UNIQUE (company_id, day)
);

CREATE INDEX IF NOT EXISTS idx_client_ops_health_daily_company_day
  ON public.client_ops_health_daily(company_id, day DESC);

-- ============================================================
-- 3) FOUNDER SNAPSHOT EXPORT (internal)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.client_ops_daily_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_ops_daily_snapshots_unique UNIQUE (company_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_client_ops_snapshots_company_day
  ON public.client_ops_daily_snapshots(company_id, snapshot_date DESC);

-- Backfill: ensure existing roofing_companies have a client_ops row
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'roofing_companies'
  ) THEN
    INSERT INTO public.client_ops (company_id, onboarding_status, health_status)
    SELECT rc.id, 'not_started', 'green'
    FROM public.roofing_companies rc
    ON CONFLICT (company_id) DO NOTHING;
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- ============================================================
-- 4) AUTO-CREATE client_ops ROWS ON COMPANY CREATE
-- ============================================================

CREATE OR REPLACE FUNCTION public.ss_client_ops_bootstrap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.client_ops (company_id, onboarding_status, health_status)
  VALUES (NEW.id, 'not_started', 'green')
  ON CONFLICT (company_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'roofing_companies'
  ) THEN
    DROP TRIGGER IF EXISTS trg_ss_client_ops_bootstrap ON public.roofing_companies;
    CREATE TRIGGER trg_ss_client_ops_bootstrap
    AFTER INSERT ON public.roofing_companies
    FOR EACH ROW
    EXECUTE FUNCTION public.ss_client_ops_bootstrap();
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- ============================================================
-- 5) FIRST-VALUE CAPTURE (estimate_events → client_ops timestamps)
-- ============================================================

CREATE OR REPLACE FUNCTION public.ss_client_ops_capture_first_value()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Map estimate_events → company via estimates.company_id
  SELECT e.company_id
  INTO v_company_id
  FROM public.estimates e
  WHERE e.id = NEW.estimate_id
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Ensure ops row exists
  INSERT INTO public.client_ops (company_id, onboarding_status, health_status)
  VALUES (v_company_id, 'active', 'green')
  ON CONFLICT (company_id) DO NOTHING;

  IF NEW.event_type = 'sent' THEN
    UPDATE public.client_ops
    SET
      first_estimate_sent_at = COALESCE(first_estimate_sent_at, NEW.created_at),
      onboarding_status = CASE WHEN onboarding_status = 'not_started' THEN 'active' ELSE onboarding_status END
    WHERE company_id = v_company_id;
  ELSIF NEW.event_type = 'approved' THEN
    UPDATE public.client_ops
    SET
      first_job_approved_at = COALESCE(first_job_approved_at, NEW.created_at),
      onboarding_status = CASE WHEN onboarding_status = 'not_started' THEN 'active' ELSE onboarding_status END
    WHERE company_id = v_company_id;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'estimate_events'
  ) THEN
    DROP TRIGGER IF EXISTS trg_ss_client_ops_capture_first_value ON public.estimate_events;
    CREATE TRIGGER trg_ss_client_ops_capture_first_value
    AFTER INSERT ON public.estimate_events
    FOR EACH ROW
    EXECUTE FUNCTION public.ss_client_ops_capture_first_value();
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

-- ============================================================
-- 6) INTERNAL-ONLY ACCESS (service_role only)
-- ============================================================

ALTER TABLE public.client_ops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_ops_health_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_ops_daily_snapshots ENABLE ROW LEVEL SECURITY;

-- Do not allow authenticated users access by default (no policies for authenticated).
-- Allow service_role full access.
DO $$
BEGIN
  -- client_ops
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='client_ops' AND policyname='client_ops_service_role_all'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY client_ops_service_role_all
      ON public.client_ops
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)
    $pol$;
  END IF;

  -- client_ops_health_daily
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='client_ops_health_daily' AND policyname='client_ops_health_daily_service_role_all'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY client_ops_health_daily_service_role_all
      ON public.client_ops_health_daily
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)
    $pol$;
  END IF;

  -- client_ops_daily_snapshots
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='client_ops_daily_snapshots' AND policyname='client_ops_daily_snapshots_service_role_all'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY client_ops_daily_snapshots_service_role_all
      ON public.client_ops_daily_snapshots
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)
    $pol$;
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;

COMMENT ON TABLE public.client_ops IS 'Block 284000: Internal ops record for first customers (admin-only)';
COMMENT ON TABLE public.client_ops_health_daily IS 'Block 284000: Daily health history for check-in visibility';
COMMENT ON TABLE public.client_ops_daily_snapshots IS 'Block 284000: Daily internal snapshot payload for founder clients';









