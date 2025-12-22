-- ============================================================
-- Block 269100 — SmartSend Reality Anchor Sprint v1
-- Make Results Undeniable (Job-level proof, not lead-level)
--
-- Goals:
-- - Permanent "Origin: SmartSend" tag on closed jobs (never removable)
-- - Deterministic capture of first homeowner reply for an estimate (no timestamps shown in UI)
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'estimates'
  ) THEN
    -- 1) Columns used by the UI + attribution logic
    ALTER TABLE public.estimates
      ADD COLUMN IF NOT EXISTS origin_source text,
      ADD COLUMN IF NOT EXISTS origin_set_at timestamptz,
      ADD COLUMN IF NOT EXISTS first_homeowner_reply_at timestamptz,
      ADD COLUMN IF NOT EXISTS first_homeowner_reply_message_id uuid;

    COMMENT ON COLUMN public.estimates.origin_source IS
      'Block 269100: Permanent job origin attribution. When set to smartsend it can never be removed/changed.';
    COMMENT ON COLUMN public.estimates.origin_set_at IS
      'Block 269100: Timestamp when origin_source was first set (internal).';
    COMMENT ON COLUMN public.estimates.first_homeowner_reply_at IS
      'Block 269100: First homeowner reply timestamp detected for this estimate (internal; UI does not show timestamps).';
    COMMENT ON COLUMN public.estimates.first_homeowner_reply_message_id IS
      'Block 269100: First inbound inbox_messages.id mapped to this estimate via [EST|<estimateId>] subject token.';

    -- 2) Constrain origin_source values (tight by design for this sprint)
    BEGIN
      ALTER TABLE public.estimates
        DROP CONSTRAINT IF EXISTS estimates_origin_source_check;
      ALTER TABLE public.estimates
        ADD CONSTRAINT estimates_origin_source_check
        CHECK (origin_source IS NULL OR origin_source IN ('smartsend'));
    EXCEPTION WHEN others THEN
      NULL;
    END;

    -- 3) Lock origin_source once it's SmartSend (never removable)
    CREATE OR REPLACE FUNCTION public.ss_estimates_origin_lock()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      -- Auto-stamp origin_set_at on first set
      IF NEW.origin_source = 'smartsend' AND NEW.origin_set_at IS NULL AND
         (TG_OP = 'INSERT' OR OLD.origin_source IS DISTINCT FROM 'smartsend')
      THEN
        NEW.origin_set_at := now();
      END IF;

      -- Permanent lock: once smartsend, cannot be unset or changed
      IF TG_OP = 'UPDATE' AND OLD.origin_source = 'smartsend' AND NEW.origin_source IS DISTINCT FROM 'smartsend' THEN
        RAISE EXCEPTION 'SS_ORIGIN_LOCKED';
      END IF;

      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS trg_estimates_origin_lock ON public.estimates;
    CREATE TRIGGER trg_estimates_origin_lock
      BEFORE INSERT OR UPDATE ON public.estimates
      FOR EACH ROW
      EXECUTE FUNCTION public.ss_estimates_origin_lock();

    -- 4) Helpful indexes
    BEGIN
      CREATE INDEX IF NOT EXISTS idx_estimates_origin_source ON public.estimates(origin_source) WHERE origin_source IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_estimates_first_reply_at ON public.estimates(first_homeowner_reply_at DESC) WHERE first_homeowner_reply_at IS NOT NULL;
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;
END $$;








