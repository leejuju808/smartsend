-- ============================================================
-- Block 269000 — SmartSend Follow-Up Engine v1
-- “Money Is Made After the First Message”
-- Canonical fixed follow-up sequence for sent estimates (Day 2 / Day 5 / Day 9)
-- ============================================================

-- 1) Extend estimates with follow-up scheduling fields
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'estimates'
  ) THEN
    ALTER TABLE public.estimates
      ADD COLUMN IF NOT EXISTS followup_status text DEFAULT 'paused',
      ADD COLUMN IF NOT EXISTS last_followup_at timestamptz,
      ADD COLUMN IF NOT EXISTS next_followup_at timestamptz;

    -- Enforce enum-ish status values (best-effort)
    BEGIN
      ALTER TABLE public.estimates
        DROP CONSTRAINT IF EXISTS estimates_followup_status_check;

      ALTER TABLE public.estimates
        ADD CONSTRAINT estimates_followup_status_check
        CHECK (followup_status IN ('active', 'paused', 'completed', 'stale'));
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_estimates_followup_due
  ON public.estimates(next_followup_at)
  WHERE followup_status = 'active' AND next_followup_at IS NOT NULL;

-- 2) New table: followups (estimate follow-up send log)
CREATE TABLE IF NOT EXISTS public.followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  step_number integer NOT NULL CHECK (step_number IN (1, 2, 3)),
  message_text text NOT NULL,
  sent_at timestamptz,
  delivery_method text NOT NULL DEFAULT 'email' CHECK (delivery_method IN ('email')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followups_estimate_id ON public.followups(estimate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followups_sent_at ON public.followups(sent_at DESC) WHERE sent_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_followups_step_number ON public.followups(step_number);

-- RLS: follow estimate access (best-effort generic)
ALTER TABLE public.followups ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'followups'
      AND policyname = 'followups_select_via_estimate'
  ) THEN
    CREATE POLICY followups_select_via_estimate
      ON public.followups
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.estimates e
          WHERE e.id = followups.estimate_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'followups'
      AND policyname = 'followups_insert_via_estimate'
  ) THEN
    CREATE POLICY followups_insert_via_estimate
      ON public.followups
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.estimates e
          WHERE e.id = followups.estimate_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'followups'
      AND policyname = 'followups_service_role_all'
  ) THEN
    CREATE POLICY followups_service_role_all
      ON public.followups
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

COMMENT ON TABLE public.followups IS 'Block 269000: Fixed follow-up sends for estimates (step 1/2/3)';

-- 3) Metric helper: Jobs Recovered via Follow-Up
-- (estimate approved after at least one follow-up was sent)
CREATE OR REPLACE FUNCTION public.count_jobs_recovered_via_followup(p_owner_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  -- Prefer owner-scoped count when roofing_companies schema exists
  IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'roofing_companies'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'estimates' AND column_name = 'company_id'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'roofing_companies' AND column_name = 'owner_id'
    ) THEN

    EXECUTE $q$
      SELECT COUNT(DISTINCT e.id)
      FROM public.estimates e
      JOIN public.roofing_companies rc ON rc.id = e.company_id
      WHERE rc.owner_id = $1
        AND e.approved_at IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.followups f
          WHERE f.estimate_id = e.id
            AND f.sent_at IS NOT NULL
            AND f.sent_at <= e.approved_at
        )
    $q$
    INTO v_count
    USING p_owner_id;

  ELSE
    -- Fallback (unscoped)
    EXECUTE $q$
      SELECT COUNT(DISTINCT e.id)
      FROM public.estimates e
      WHERE e.approved_at IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.followups f
          WHERE f.estimate_id = e.id
            AND f.sent_at IS NOT NULL
            AND f.sent_at <= e.approved_at
        )
    $q$
    INTO v_count;
  END IF;

  RETURN COALESCE(v_count, 0);
END $$;

GRANT EXECUTE ON FUNCTION public.count_jobs_recovered_via_followup(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_jobs_recovered_via_followup(uuid) TO service_role;









