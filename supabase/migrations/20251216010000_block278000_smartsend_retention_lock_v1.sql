-- =========================================================
-- BLOCK 278000 — SmartSend Retention Lock v1
-- “Make Canceling Feel Dangerous” (friction + clarity, no dark patterns)
--
-- Adds:
-- - subscriptions.paused_at / subscriptions.canceled_at
-- - status supports paused/canceled (without removing existing Stripe-like statuses)
-- - org_billing pause/cancel timestamps (for org-based billing UX)
-- - retention_lock_events for internal metrics (attempted / pause / final cancel)
-- =========================================================

-- ---------------------------------------------------------
-- 1) Subscriptions table (best-effort, supports multiple schemas)
-- ---------------------------------------------------------
DO $$
DECLARE
  c record;
  v_has_table boolean;
  v_has_status boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'subscriptions'
  ) INTO v_has_table;

  IF NOT v_has_table THEN
    RETURN;
  END IF;

  -- Add timestamps (safe if table exists)
  BEGIN
    ALTER TABLE public.subscriptions
      ADD COLUMN IF NOT EXISTS paused_at timestamptz,
      ADD COLUMN IF NOT EXISTS canceled_at timestamptz;
  EXCEPTION WHEN others THEN
    NULL;
  END;

  -- If there's a "status" column, ensure it can accept 'paused'
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='subscriptions' AND column_name='status'
  ) INTO v_has_status;

  IF v_has_status THEN
    -- Drop existing CHECK constraints that restrict status (so we can add paused)
    FOR c IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'public.subscriptions'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%status%'
        AND pg_get_constraintdef(oid) ILIKE '%IN%'
    LOOP
      BEGIN
        EXECUTE format('ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS %I', c.conname);
      EXCEPTION WHEN others THEN
        NULL;
      END;
    END LOOP;

    -- Add a permissive-but-explicit status CHECK including paused.
    -- We keep Stripe-like legacy values to avoid breaking existing rows.
    BEGIN
      ALTER TABLE public.subscriptions
        ADD CONSTRAINT subscriptions_status_check_block278000
        CHECK (status IN (
          'active',
          'paused',
          'canceled',
          'trialing',
          'past_due',
          'unpaid',
          'incomplete',
          'incomplete_expired',
          'locked',
          'grace_period',
          'trial_expired'
        ));
    EXCEPTION WHEN others THEN
      -- If constraint can't be added (unknown legacy schema), skip.
      NULL;
    END;
  END IF;
END $$;

-- ---------------------------------------------------------
-- 2) Org billing table (so settings UI can reflect paused/canceled)
-- ---------------------------------------------------------
DO $$
DECLARE
  c record;
  v_has_table boolean;
  v_has_status boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'org_billing'
  ) INTO v_has_table;

  IF NOT v_has_table THEN
    RETURN;
  END IF;

  BEGIN
    ALTER TABLE public.org_billing
      ADD COLUMN IF NOT EXISTS paused_at timestamptz,
      ADD COLUMN IF NOT EXISTS canceled_at timestamptz;
  EXCEPTION WHEN others THEN
    NULL;
  END;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='org_billing' AND column_name='subscription_status'
  ) INTO v_has_status;

  IF v_has_status THEN
    -- Drop existing CHECK constraints that restrict subscription_status
    FOR c IN
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = 'public.org_billing'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%subscription_status%'
        AND pg_get_constraintdef(oid) ILIKE '%IN%'
    LOOP
      BEGIN
        EXECUTE format('ALTER TABLE public.org_billing DROP CONSTRAINT IF EXISTS %I', c.conname);
      EXCEPTION WHEN others THEN
        NULL;
      END;
    END LOOP;

    -- Allow paused + legacy Stripe-like statuses
    BEGIN
      ALTER TABLE public.org_billing
        ADD CONSTRAINT org_billing_subscription_status_check_block278000
        CHECK (subscription_status IN (
          'active',
          'trialing',
          'past_due',
          'canceled',
          'incomplete',
          'incomplete_expired',
          'unpaid',
          'paused'
        ));
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;
END $$;

-- ---------------------------------------------------------
-- 3) Retention metrics (internal)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.retention_lock_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('cancel_attempted', 'pause_accepted', 'cancel_confirmed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS retention_lock_events_created_at_idx
  ON public.retention_lock_events(created_at DESC);
CREATE INDEX IF NOT EXISTS retention_lock_events_org_id_idx
  ON public.retention_lock_events(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS retention_lock_events_owner_id_idx
  ON public.retention_lock_events(owner_id, created_at DESC);

ALTER TABLE public.retention_lock_events ENABLE ROW LEVEL SECURITY;

-- Internal only (service role)
DROP POLICY IF EXISTS "service_role_manage_retention_lock_events" ON public.retention_lock_events;
CREATE POLICY "service_role_manage_retention_lock_events" ON public.retention_lock_events
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

COMMENT ON TABLE public.retention_lock_events IS 'Block 278000: Tracks cancel attempts, pauses, and final cancels for retention improvement.';










