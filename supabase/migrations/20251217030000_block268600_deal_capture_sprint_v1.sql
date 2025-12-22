-- ============================================================
-- Block 268600 — SmartSend Deal Capture Sprint v1
-- Turn conversations into booked jobs:
-- - Ultra-simple estimate status (sent / waiting / approved / lost)
-- - Money-stuck visibility + loss reason + close attribution
-- - Non-destructive, schema-drift tolerant changes
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'estimates'
  ) THEN
    -- Add missing fields (best-effort)
    ALTER TABLE public.estimates
      ADD COLUMN IF NOT EXISTS lost_reason text,
      ADD COLUMN IF NOT EXISTS lost_at timestamptz,
      ADD COLUMN IF NOT EXISTS closed_via text,
      ADD COLUMN IF NOT EXISTS closed_at timestamptz,
      ADD COLUMN IF NOT EXISTS status_updated_at timestamptz;

    COMMENT ON COLUMN public.estimates.lost_reason IS 'Block 268600: Optional lost reason bucket (price|timing|no_response|other).';
    COMMENT ON COLUMN public.estimates.lost_at IS 'Block 268600: Timestamp when estimate marked lost (internal).';
    COMMENT ON COLUMN public.estimates.closed_via IS 'Block 268600: Close attribution tag (e.g. smartsend).';
    COMMENT ON COLUMN public.estimates.closed_at IS 'Block 268600: Timestamp when approved/closed (internal).';
    COMMENT ON COLUMN public.estimates.status_updated_at IS 'Block 268600: Last time status was changed (internal).';

    -- Constrain lost_reason values (best-effort; avoid breaking drift)
    BEGIN
      ALTER TABLE public.estimates
        DROP CONSTRAINT IF EXISTS estimates_lost_reason_check;
      ALTER TABLE public.estimates
        ADD CONSTRAINT estimates_lost_reason_check
        CHECK (lost_reason IS NULL OR lost_reason IN ('price','timing','no_response','other'));
    EXCEPTION WHEN others THEN
      NULL;
    END;

    -- Expand status constraint if a check constraint exists (best-effort).
    -- Some environments already have a permissive text column without a check.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'estimates' AND column_name = 'status'
    ) THEN
      BEGIN
        -- Drop common constraint names if present
        ALTER TABLE public.estimates DROP CONSTRAINT IF EXISTS estimates_status_check;
        ALTER TABLE public.estimates DROP CONSTRAINT IF EXISTS estimates_status_enum_check;
        -- Re-add broad allowed set (includes legacy values)
        ALTER TABLE public.estimates
          ADD CONSTRAINT estimates_status_check
          CHECK (status IN ('draft','sent','waiting','approved','lost','viewed'));
      EXCEPTION WHEN others THEN
        NULL;
      END;
    END IF;
  END IF;
END $$;

-- Index helpers (safe if columns exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimates' AND column_name = 'sent_at'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_estimates_pending_money ON public.estimates(sent_at DESC) WHERE sent_at IS NOT NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'estimates' AND column_name = 'status'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_estimates_status ON public.estimates(status)';
  END IF;
EXCEPTION WHEN others THEN
  NULL;
END $$;








