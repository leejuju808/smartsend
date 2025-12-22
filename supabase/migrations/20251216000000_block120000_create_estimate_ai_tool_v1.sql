-- ============================================================================
-- Block 120000 — SmartSend Roofing
-- "AI Estimate Engine v1 (Button Tool)"
-- ============================================================================
-- Goal: Support a simple, homeowner-ready estimate record generated from a UI form
-- without requiring an inbox thread. We extend the existing overloaded `public.estimates`
-- table with minimal fields required by the Create Estimate tool.
-- ============================================================================

DO $$
BEGIN
  -- Make thread_id nullable (older schema required a thread_id for inbox estimates).
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'estimates'
      AND column_name = 'thread_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.estimates ALTER COLUMN thread_id DROP NOT NULL;
  END IF;
END $$;

-- Add "Create Estimate" tool columns (safe no-ops if already present)
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS roof_type text,
  ADD COLUMN IF NOT EXISTS size text,
  ADD COLUMN IF NOT EXISTS scope text,
  ADD COLUMN IF NOT EXISTS estimate_text text,
  ADD COLUMN IF NOT EXISTS total_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';

-- Optional: keep compatibility with other estimate variants
ALTER TABLE public.estimates
  ADD COLUMN IF NOT EXISTS notes text;

-- FK to roofing_companies if that table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'roofing_companies'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name = 'estimates'
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name = 'estimates_company_id_fkey'
    ) THEN
      ALTER TABLE public.estimates
        ADD CONSTRAINT estimates_company_id_fkey
        FOREIGN KEY (company_id) REFERENCES public.roofing_companies(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_estimates_company_id ON public.estimates(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estimates_created_at ON public.estimates(created_at DESC);

-- RLS: allow authenticated roofing company members to access estimates by company_id
DO $$
BEGIN
  -- Enable RLS (may already be enabled by earlier migrations)
  EXECUTE 'ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN others THEN
  -- ignore if table does not exist or permissions in local push
  NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'roofing_company_members'
  ) THEN
    -- SELECT
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'estimates'
        AND policyname = 'estimates_select_roofing_company_members'
    ) THEN
      EXECUTE $POL$
        CREATE POLICY "estimates_select_roofing_company_members"
        ON public.estimates
        FOR SELECT
        TO authenticated
        USING (
          company_id IS NOT NULL AND company_id IN (
            SELECT roofing_company_id
            FROM public.roofing_company_members
            WHERE user_id = auth.uid()
              AND is_active = true
          )
        )
      $POL$;
    END IF;

    -- INSERT
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'estimates'
        AND policyname = 'estimates_insert_roofing_company_members'
    ) THEN
      EXECUTE $POL$
        CREATE POLICY "estimates_insert_roofing_company_members"
        ON public.estimates
        FOR INSERT
        TO authenticated
        WITH CHECK (
          company_id IS NOT NULL AND company_id IN (
            SELECT roofing_company_id
            FROM public.roofing_company_members
            WHERE user_id = auth.uid()
              AND is_active = true
          )
        )
      $POL$;
    END IF;

    -- UPDATE
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'estimates'
        AND policyname = 'estimates_update_roofing_company_members'
    ) THEN
      EXECUTE $POL$
        CREATE POLICY "estimates_update_roofing_company_members"
        ON public.estimates
        FOR UPDATE
        TO authenticated
        USING (
          company_id IS NOT NULL AND company_id IN (
            SELECT roofing_company_id
            FROM public.roofing_company_members
            WHERE user_id = auth.uid()
              AND is_active = true
          )
        )
        WITH CHECK (
          company_id IS NOT NULL AND company_id IN (
            SELECT roofing_company_id
            FROM public.roofing_company_members
            WHERE user_id = auth.uid()
              AND is_active = true
          )
        )
      $POL$;
    END IF;
  END IF;
END $$;

COMMENT ON COLUMN public.estimates.estimate_text IS 'Block 120000: Homeowner-ready estimate text (PDF-ready markdown)';
COMMENT ON COLUMN public.estimates.total_price IS 'Block 120000: Total price for homeowner-ready estimate';
COMMENT ON COLUMN public.estimates.scope IS 'Block 120000: Repair / Partial / Full Replacement';











