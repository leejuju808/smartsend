-- ============================================================
-- Block 267100 — SmartSend Execution Reality Check: Estimate → Send → Track v1
-- Locks the canonical revenue path:
-- Create Estimate → Send to Homeowner → Mark Approved → Proof Counters
-- ============================================================

-- ============================================================
-- A) Update estimates table (non-destructive; supports multiple schemas)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'estimates'
  ) THEN
    ALTER TABLE public.estimates
      ADD COLUMN IF NOT EXISTS sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS sent_to_email text,
      ADD COLUMN IF NOT EXISTS delivery_status text DEFAULT 'draft',
      ADD COLUMN IF NOT EXISTS approved_at timestamptz;

    -- Add/repair delivery_status constraint (draft / sent / viewed)
    BEGIN
      ALTER TABLE public.estimates
        DROP CONSTRAINT IF EXISTS estimates_delivery_status_check;
      ALTER TABLE public.estimates
        ADD CONSTRAINT estimates_delivery_status_check
        CHECK (delivery_status IN ('draft', 'sent', 'viewed'));
    EXCEPTION WHEN others THEN
      -- If constraint changes fail due to unknown existing type/constraint, skip.
      NULL;
    END;
  END IF;
END $$;

-- Helpful index for sent_at
CREATE INDEX IF NOT EXISTS idx_estimates_sent_at ON public.estimates(sent_at DESC) WHERE sent_at IS NOT NULL;

-- ============================================================
-- B) New table: estimate_events (proof-of-use)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.estimate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('created', 'sent', 'viewed', 'approved')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estimate_events_estimate_id ON public.estimate_events(estimate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_estimate_events_event_type ON public.estimate_events(event_type, created_at DESC);

-- RLS: follow estimates access (generic: user must be able to see the estimate)
ALTER TABLE public.estimate_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'estimate_events' AND policyname = 'estimate_events_select_via_estimate'
  ) THEN
    CREATE POLICY estimate_events_select_via_estimate
      ON public.estimate_events
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.estimates e
          WHERE e.id = estimate_events.estimate_id
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'estimate_events' AND policyname = 'estimate_events_insert_via_estimate'
  ) THEN
    CREATE POLICY estimate_events_insert_via_estimate
      ON public.estimate_events
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.estimates e
          WHERE e.id = estimate_events.estimate_id
        )
      );
  END IF;
END $$;

COMMENT ON TABLE public.estimate_events IS 'Block 267100: Proof-of-use events for estimates (created/sent/viewed/approved).';










