-- ============================================================
-- BLOCK 280000 — SmartSend Founder Hardening v1
-- “Turn v1 Into an Unbreakable Weapon”
--
-- Goal (DB-first armor):
-- - Strict tenant isolation: a roofing company can only access its own data
-- - Role clarity (v1): owner vs staff (demo treated as read-only via restrictions)
-- - Money protection: approved estimates are immutable (core fields locked forever)
-- - Non-optional audit trail for money-related actions
-- - Safe delete: hard deletes disabled; archived_at used instead
-- ============================================================

-- =========================
-- 0) Helper functions
-- =========================

CREATE OR REPLACE FUNCTION public.is_company_owner(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.roofing_company_members rcm
    WHERE rcm.roofing_company_id = p_company_id
      AND rcm.user_id = auth.uid()
      AND rcm.role = 'owner'
      AND rcm.is_active = true
  );
$$;

CREATE OR REPLACE FUNCTION public.assert_company_owner(p_company_id uuid, p_action text DEFAULT 'perform this action')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_company_owner(p_company_id) THEN
    RAISE EXCEPTION 'Only company owner can %', p_action
      USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.is_company_owner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_company_owner(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_company_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_company_owner(uuid, text) TO authenticated;

-- =========================
-- 1) Safe delete: block hard deletes
-- =========================

CREATE OR REPLACE FUNCTION public.ss_block_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Hard deletes are disabled. Use archived_at instead.'
    USING ERRCODE = '42501';
END;
$$;

-- =========================
-- 2) Add archived_at (soft delete) to core tables
-- =========================

ALTER TABLE IF EXISTS public.estimates  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE IF EXISTS public.leads      ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE IF EXISTS public.campaigns  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE IF EXISTS public.jobs       ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Attach hard-delete blockers (idempotent; guarded by table existence)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='estimates') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_ss_block_delete_estimates ON public.estimates';
    EXECUTE 'CREATE TRIGGER trg_ss_block_delete_estimates BEFORE DELETE ON public.estimates FOR EACH ROW EXECUTE FUNCTION public.ss_block_hard_delete()';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='leads') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_ss_block_delete_leads ON public.leads';
    EXECUTE 'CREATE TRIGGER trg_ss_block_delete_leads BEFORE DELETE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.ss_block_hard_delete()';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='campaigns') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_ss_block_delete_campaigns ON public.campaigns';
    EXECUTE 'CREATE TRIGGER trg_ss_block_delete_campaigns BEFORE DELETE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.ss_block_hard_delete()';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='jobs') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_ss_block_delete_jobs ON public.jobs';
    EXECUTE 'CREATE TRIGGER trg_ss_block_delete_jobs BEFORE DELETE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.ss_block_hard_delete()';
  END IF;
END $$;

-- =========================
-- 3) RLS lockdown helpers (drop all existing policies for a table)
-- =========================

CREATE OR REPLACE FUNCTION public.ss_drop_all_policies(p_schema text, p_table text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = p_schema
      AND tablename = p_table
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, p_schema, p_table);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.ss_drop_all_policies(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ss_drop_all_policies(text, text) TO service_role;

-- =========================
-- 4) Strict company isolation (RLS hardening)
-- =========================

-- 4.1 ESTIMATES ---------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='estimates') THEN
    EXECUTE 'ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.estimates FORCE ROW LEVEL SECURITY';

    PERFORM public.ss_drop_all_policies('public', 'estimates');

    EXECUTE $pol$
      CREATE POLICY ss_estimates_select
      ON public.estimates
      FOR SELECT
      TO authenticated
      USING (company_id IS NOT NULL AND public.is_company_member(company_id))
    $pol$;

    EXECUTE $pol$
      CREATE POLICY ss_estimates_insert
      ON public.estimates
      FOR INSERT
      TO authenticated
      WITH CHECK (company_id IS NOT NULL AND public.is_company_member(company_id))
    $pol$;

    EXECUTE $pol$
      CREATE POLICY ss_estimates_update
      ON public.estimates
      FOR UPDATE
      TO authenticated
      USING (company_id IS NOT NULL AND public.is_company_member(company_id))
      WITH CHECK (company_id IS NOT NULL AND public.is_company_member(company_id))
    $pol$;

    -- service role full access (webhooks/automations)
    EXECUTE $pol$
      CREATE POLICY ss_estimates_service_role
      ON public.estimates
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)
    $pol$;
  END IF;
END $$;

-- 4.2 FOLLOWUPS ---------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='followups') THEN
    EXECUTE 'ALTER TABLE public.followups ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.followups FORCE ROW LEVEL SECURITY';

    PERFORM public.ss_drop_all_policies('public', 'followups');

    EXECUTE $pol$
      CREATE POLICY ss_followups_select
      ON public.followups
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.estimates e
          WHERE e.id = followups.estimate_id
            AND e.company_id IS NOT NULL
            AND public.is_company_member(e.company_id)
        )
      )
    $pol$;

    -- Followups are a system send-log: only service_role can insert/update
    EXECUTE $pol$
      CREATE POLICY ss_followups_service_role
      ON public.followups
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)
    $pol$;
  END IF;
END $$;

-- 4.3 LEADS -------------------------------------------------------------------
DO $$
DECLARE
  has_roofing_company_id boolean;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='leads') THEN
    EXECUTE 'ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.leads FORCE ROW LEVEL SECURITY';

    PERFORM public.ss_drop_all_policies('public', 'leads');

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='leads' AND column_name='roofing_company_id'
    ) INTO has_roofing_company_id;

    IF has_roofing_company_id THEN
      EXECUTE $pol$
        CREATE POLICY ss_leads_select
        ON public.leads
        FOR SELECT
        TO authenticated
        USING (roofing_company_id IS NOT NULL AND public.is_company_member(roofing_company_id))
      $pol$;

      EXECUTE $pol$
        CREATE POLICY ss_leads_insert
        ON public.leads
        FOR INSERT
        TO authenticated
        WITH CHECK (roofing_company_id IS NOT NULL AND public.is_company_member(roofing_company_id))
      $pol$;

      EXECUTE $pol$
        CREATE POLICY ss_leads_update
        ON public.leads
        FOR UPDATE
        TO authenticated
        USING (roofing_company_id IS NOT NULL AND public.is_company_member(roofing_company_id))
        WITH CHECK (roofing_company_id IS NOT NULL AND public.is_company_member(roofing_company_id))
      $pol$;
    END IF;

    EXECUTE $pol$
      CREATE POLICY ss_leads_service_role
      ON public.leads
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)
    $pol$;
  END IF;
END $$;

-- 4.4 CAMPAIGNS ----------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='campaigns')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='roofing_companies') THEN

    -- Add tenant column (do NOT overload campaigns.company_id which is used elsewhere)
    ALTER TABLE public.campaigns
      ADD COLUMN IF NOT EXISTS roofing_company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_campaigns_roofing_company_id
      ON public.campaigns(roofing_company_id) WHERE roofing_company_id IS NOT NULL;

    -- Backfill best-effort from leads
    DO $b$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='roofing_company_id')
         AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='leads' AND column_name='campaign_id') THEN
        UPDATE public.campaigns c
        SET roofing_company_id = (
          SELECT l.roofing_company_id
          FROM public.leads l
          WHERE l.campaign_id = c.id
            AND l.roofing_company_id IS NOT NULL
          LIMIT 1
        )
        WHERE c.roofing_company_id IS NULL;
      END IF;
    END $b$;

    EXECUTE 'ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.campaigns FORCE ROW LEVEL SECURITY';

    PERFORM public.ss_drop_all_policies('public', 'campaigns');

    EXECUTE $pol$
      CREATE POLICY ss_campaigns_select
      ON public.campaigns
      FOR SELECT
      TO authenticated
      USING (roofing_company_id IS NOT NULL AND public.is_company_member(roofing_company_id))
    $pol$;

    EXECUTE $pol$
      CREATE POLICY ss_campaigns_insert
      ON public.campaigns
      FOR INSERT
      TO authenticated
      WITH CHECK (roofing_company_id IS NOT NULL AND public.is_company_member(roofing_company_id))
    $pol$;

    EXECUTE $pol$
      CREATE POLICY ss_campaigns_update
      ON public.campaigns
      FOR UPDATE
      TO authenticated
      USING (roofing_company_id IS NOT NULL AND public.is_company_member(roofing_company_id))
      WITH CHECK (roofing_company_id IS NOT NULL AND public.is_company_member(roofing_company_id))
    $pol$;

    EXECUTE $pol$
      CREATE POLICY ss_campaigns_service_role
      ON public.campaigns
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)
    $pol$;
  END IF;
END $$;

-- 4.5 JOBS --------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='jobs') THEN
    EXECUTE 'ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.jobs FORCE ROW LEVEL SECURITY';

    PERFORM public.ss_drop_all_policies('public', 'jobs');

    EXECUTE $pol$
      CREATE POLICY ss_jobs_select
      ON public.jobs
      FOR SELECT
      TO authenticated
      USING (company_id IS NOT NULL AND public.is_company_member(company_id))
    $pol$;

    EXECUTE $pol$
      CREATE POLICY ss_jobs_insert
      ON public.jobs
      FOR INSERT
      TO authenticated
      WITH CHECK (company_id IS NOT NULL AND public.is_company_member(company_id))
    $pol$;

    EXECUTE $pol$
      CREATE POLICY ss_jobs_update
      ON public.jobs
      FOR UPDATE
      TO authenticated
      USING (company_id IS NOT NULL AND public.is_company_member(company_id))
      WITH CHECK (company_id IS NOT NULL AND public.is_company_member(company_id))
    $pol$;

    EXECUTE $pol$
      CREATE POLICY ss_jobs_service_role
      ON public.jobs
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)
    $pol$;
  END IF;
END $$;

-- 4.6 COMPANY SUBSCRIPTIONS (subscription mgmt is owner-only) -----------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='company_subscriptions') THEN
    EXECUTE 'ALTER TABLE public.company_subscriptions ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.company_subscriptions FORCE ROW LEVEL SECURITY';

    PERFORM public.ss_drop_all_policies('public', 'company_subscriptions');

    EXECUTE $pol$
      CREATE POLICY ss_company_subscriptions_select
      ON public.company_subscriptions
      FOR SELECT
      TO authenticated
      USING (company_id IS NOT NULL AND public.is_company_member(company_id))
    $pol$;

    EXECUTE $pol$
      CREATE POLICY ss_company_subscriptions_insert_owner_only
      ON public.company_subscriptions
      FOR INSERT
      TO authenticated
      WITH CHECK (company_id IS NOT NULL AND public.is_company_owner(company_id))
    $pol$;

    EXECUTE $pol$
      CREATE POLICY ss_company_subscriptions_update_owner_only
      ON public.company_subscriptions
      FOR UPDATE
      TO authenticated
      USING (company_id IS NOT NULL AND public.is_company_owner(company_id))
      WITH CHECK (company_id IS NOT NULL AND public.is_company_owner(company_id))
    $pol$;

    EXECUTE $pol$
      CREATE POLICY ss_company_subscriptions_service_role
      ON public.company_subscriptions
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)
    $pol$;
  END IF;
END $$;

-- =========================
-- 7) Environment safety (backend assertions)
-- =========================
-- - demo_mode cannot exist in production subscriptions (hard disabled at DB level)
-- - demo data never mixes with live data (per-company demo flag must match row.is_demo)
-- - founder pricing cannot be modified once locked (workspace_subscriptions)

-- 7.1 Hard-disable demo_mode on company_subscriptions (v1 safety)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='company_subscriptions') THEN
    ALTER TABLE public.company_subscriptions
      ADD COLUMN IF NOT EXISTS demo_mode boolean NOT NULL DEFAULT false;

    ALTER TABLE public.company_subscriptions
      DROP CONSTRAINT IF EXISTS company_subscriptions_demo_mode_false;

    ALTER TABLE public.company_subscriptions
      ADD CONSTRAINT company_subscriptions_demo_mode_false CHECK (demo_mode = false);
  END IF;
END $$;

-- 7.2 Demo isolation: company.is_demo must match row.is_demo
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='roofing_companies') THEN
    ALTER TABLE public.roofing_companies
      ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.estimates ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS public.jobs      ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS public.leads     ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE IF EXISTS public.campaigns ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.ss_enforce_demo_isolation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_company_id uuid;
  v_company_is_demo boolean;
BEGIN
  -- Resolve company id from common column names
  v_company_id := NULL;
  BEGIN
    v_company_id := NULLIF(to_jsonb(NEW)->>'company_id','')::uuid;
  EXCEPTION WHEN others THEN
    v_company_id := NULL;
  END;

  IF v_company_id IS NULL THEN
    BEGIN
      v_company_id := NULLIF(to_jsonb(NEW)->>'roofing_company_id','')::uuid;
    EXCEPTION WHEN others THEN
      v_company_id := NULL;
    END;
  END IF;

  IF v_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT rc.is_demo INTO v_company_is_demo
  FROM public.roofing_companies rc
  WHERE rc.id = v_company_id;

  IF v_company_is_demo IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.is_demo, false) IS DISTINCT FROM COALESCE(v_company_is_demo, false) THEN
    RAISE EXCEPTION 'Demo isolation violation: row.is_demo must match company.is_demo'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='estimates') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_ss_demo_isolation_estimates ON public.estimates';
    EXECUTE 'CREATE TRIGGER trg_ss_demo_isolation_estimates BEFORE INSERT OR UPDATE ON public.estimates FOR EACH ROW EXECUTE FUNCTION public.ss_enforce_demo_isolation()';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='jobs') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_ss_demo_isolation_jobs ON public.jobs';
    EXECUTE 'CREATE TRIGGER trg_ss_demo_isolation_jobs BEFORE INSERT OR UPDATE ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.ss_enforce_demo_isolation()';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='leads') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_ss_demo_isolation_leads ON public.leads';
    EXECUTE 'CREATE TRIGGER trg_ss_demo_isolation_leads BEFORE INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.ss_enforce_demo_isolation()';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='campaigns') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_ss_demo_isolation_campaigns ON public.campaigns';
    EXECUTE 'CREATE TRIGGER trg_ss_demo_isolation_campaigns BEFORE INSERT OR UPDATE ON public.campaigns FOR EACH ROW EXECUTE FUNCTION public.ss_enforce_demo_isolation()';
  END IF;
END $$;

-- 7.3 Founder pricing lock (workspace_subscriptions)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='workspace_subscriptions') THEN
    ALTER TABLE public.workspace_subscriptions
      ADD COLUMN IF NOT EXISTS founder_locked_at timestamptz;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ss_enforce_founder_pricing_lock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- service role is allowed to maintain Stripe fields, etc.
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Lock in founders: once true, cannot be unset
    IF COALESCE(OLD.is_founder, false) = true AND COALESCE(NEW.is_founder, false) = false THEN
      RAISE EXCEPTION 'Founder pricing is locked and cannot be removed'
        USING ERRCODE = 'check_violation';
    END IF;

    -- If founder is locked, plan_code cannot change
    IF COALESCE(OLD.is_founder, false) = true AND OLD.founder_locked_at IS NOT NULL THEN
      IF NEW.plan_code IS DISTINCT FROM OLD.plan_code THEN
        RAISE EXCEPTION 'Founder pricing is locked; plan cannot be modified'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    -- When first becoming a founder, freeze now
    IF COALESCE(OLD.is_founder, false) = false AND COALESCE(NEW.is_founder, false) = true THEN
      NEW.founder_locked_at := COALESCE(NEW.founder_locked_at, now());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='workspace_subscriptions') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_ss_founder_pricing_lock ON public.workspace_subscriptions';
    EXECUTE 'CREATE TRIGGER trg_ss_founder_pricing_lock BEFORE UPDATE ON public.workspace_subscriptions FOR EACH ROW EXECUTE FUNCTION public.ss_enforce_founder_pricing_lock()';
  END IF;
END $$;

-- 4.7 DELIVERY LOGS -----------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='delivery_logs') THEN
    EXECUTE 'ALTER TABLE public.delivery_logs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE public.delivery_logs FORCE ROW LEVEL SECURITY';

    PERFORM public.ss_drop_all_policies('public', 'delivery_logs');

    -- Read via lead -> roofing_company_id (preferred) or job/campaign link (fallback)
    EXECUTE $pol$
      CREATE POLICY ss_delivery_logs_select
      ON public.delivery_logs
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.leads l
          WHERE l.id = delivery_logs.lead_id
            AND (
              (l.roofing_company_id IS NOT NULL AND public.is_company_member(l.roofing_company_id))
              OR
              (l.company_id IS NOT NULL AND public.is_company_member(l.company_id))
            )
        )
      )
    $pol$;

    -- Only service role writes logs
    EXECUTE $pol$
      CREATE POLICY ss_delivery_logs_service_role
      ON public.delivery_logs
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true)
    $pol$;
  END IF;
END $$;

-- =========================
-- 5) Money protection: approved estimates immutable
-- =========================

ALTER TABLE IF EXISTS public.estimates
  ADD COLUMN IF NOT EXISTS scope_summary text;

CREATE OR REPLACE FUNCTION public.ss_enforce_estimate_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Staff cannot send estimates in v1 (status transition -> 'sent' is owner only)
    IF NEW.status = 'sent' AND (OLD.status IS DISTINCT FROM 'sent') THEN
      PERFORM public.assert_company_owner(NEW.company_id, 'send estimates');
    END IF;

    -- Once approved, lock key money-related fields forever
    IF OLD.status = 'approved' THEN
      IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IS DISTINCT FROM 'approved' THEN
        RAISE EXCEPTION 'Approved estimates cannot change status'
          USING ERRCODE = 'check_violation';
      END IF;

      IF (NEW.estimate_text IS DISTINCT FROM OLD.estimate_text)
         OR (NEW.total_price IS DISTINCT FROM OLD.total_price)
         OR (NEW.scope_summary IS DISTINCT FROM OLD.scope_summary)
         OR (NEW.scope IS DISTINCT FROM OLD.scope) THEN
        RAISE EXCEPTION 'Approved estimates are immutable. Create a new estimate for changes.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='estimates') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_ss_estimate_immutability ON public.estimates';
    EXECUTE 'CREATE TRIGGER trg_ss_estimate_immutability BEFORE UPDATE ON public.estimates FOR EACH ROW EXECUTE FUNCTION public.ss_enforce_estimate_immutability()';
  END IF;
END $$;

-- =========================
-- 6) Audit trail for money-related actions
-- =========================

-- Extend existing audit_logs (used elsewhere) with the money-audit fields.
ALTER TABLE IF EXISTS public.audit_logs
  ADD COLUMN IF NOT EXISTS company_id uuid,
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS action_type text,
  ADD COLUMN IF NOT EXISTS related_id uuid;

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_time
  ON public.audit_logs(company_id, created_at DESC)
  WHERE company_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.insert_money_audit(
  p_company_id uuid,
  p_action_type text,
  p_related_id uuid DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs(
    company_id,
    user_id,
    actor_id,
    action_type,
    action,
    related_id,
    entity,
    entity_id,
    meta
  )
  VALUES (
    p_company_id,
    auth.uid(),
    auth.uid(),
    p_action_type,
    p_action_type,
    p_related_id,
    'money',
    p_related_id,
    COALESCE(p_meta, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.insert_money_audit(uuid, text, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.insert_money_audit(uuid, text, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_money_audit(uuid, text, uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.ss_audit_estimate_money_events()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.company_id IS NOT NULL THEN
      PERFORM public.insert_money_audit(NEW.company_id, 'create_estimate', NEW.id, jsonb_build_object('status', NEW.status));
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.company_id IS NOT NULL AND (NEW.status IS DISTINCT FROM OLD.status) THEN
      IF NEW.status = 'sent' THEN
        PERFORM public.insert_money_audit(NEW.company_id, 'send_estimate', NEW.id, jsonb_build_object('from', OLD.status, 'to', NEW.status));
      ELSIF NEW.status = 'approved' THEN
        PERFORM public.insert_money_audit(NEW.company_id, 'approve_estimate', NEW.id, jsonb_build_object('from', OLD.status, 'to', NEW.status));
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='estimates') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_ss_audit_estimate_money_events_ins ON public.estimates';
    EXECUTE 'CREATE TRIGGER trg_ss_audit_estimate_money_events_ins AFTER INSERT ON public.estimates FOR EACH ROW EXECUTE FUNCTION public.ss_audit_estimate_money_events()';

    EXECUTE 'DROP TRIGGER IF EXISTS trg_ss_audit_estimate_money_events_upd ON public.estimates';
    EXECUTE 'CREATE TRIGGER trg_ss_audit_estimate_money_events_upd AFTER UPDATE OF status ON public.estimates FOR EACH ROW EXECUTE FUNCTION public.ss_audit_estimate_money_events()';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ss_audit_company_subscription_events()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.insert_money_audit(NEW.company_id, 'create_subscription', NEW.id, jsonb_build_object('status', NEW.status, 'plan', NEW.plan));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'canceled' THEN
        PERFORM public.insert_money_audit(NEW.company_id, 'cancel_sub', NEW.id, jsonb_build_object('from', OLD.status, 'to', NEW.status));
      ELSIF NEW.status = 'past_due' THEN
        PERFORM public.insert_money_audit(NEW.company_id, 'sub_past_due', NEW.id, jsonb_build_object('from', OLD.status, 'to', NEW.status));
      ELSIF NEW.status = 'active' THEN
        PERFORM public.insert_money_audit(NEW.company_id, 'activate_sub', NEW.id, jsonb_build_object('from', OLD.status, 'to', NEW.status));
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='company_subscriptions') THEN
    DROP TRIGGER IF EXISTS trg_ss_audit_company_subscriptions_ins ON public.company_subscriptions;
    CREATE TRIGGER trg_ss_audit_company_subscriptions_ins
    AFTER INSERT ON public.company_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.ss_audit_company_subscription_events();

    DROP TRIGGER IF EXISTS trg_ss_audit_company_subscriptions_upd ON public.company_subscriptions;
    CREATE TRIGGER trg_ss_audit_company_subscriptions_upd
    AFTER UPDATE OF status ON public.company_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.ss_audit_company_subscription_events();
  END IF;
END $$;










