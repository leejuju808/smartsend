-- =========================================================
-- Block 271700 — SmartSend Invisible Ops Sprint (Ambient Infrastructure)
-- Zero-Notification Mode • Auto-resolution of low-value threads • Binary ownership states
-- =========================================================

-- ==========================================================================
-- 1) Zero-Notification Mode setting (org + workspace compatible)
-- ==========================================================================

ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS zero_notification_mode boolean NOT NULL DEFAULT false;

ALTER TABLE public.company_notifications
  ADD COLUMN IF NOT EXISTS zero_notification_mode boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_zero_notification_mode(p_scope_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT os.zero_notification_mode FROM public.org_settings os WHERE os.org_id = p_scope_id),
    (SELECT cn.zero_notification_mode FROM public.company_notifications cn WHERE cn.workspace_id = p_scope_id),
    false
  );
$$;

COMMENT ON FUNCTION public.is_zero_notification_mode(uuid)
  IS 'Block 271700: Returns true when Zero-Notification Mode is enabled for the given org_id/workspace_id.';

-- ==========================================================================
-- 2) Notifications: allow estimate-approved + enforce zero-mode filtering
-- ==========================================================================

-- Extend notifications type constraint to include estimate_approved (V2 schema)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'type'
  ) THEN
    BEGIN
      ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
    EXCEPTION WHEN undefined_object THEN
      NULL;
    END;

    BEGIN
      ALTER TABLE public.notifications
        ADD CONSTRAINT notifications_type_check
        CHECK (type IN (
          -- Lead & Inbox Alerts
          'reply', 'hot_lead', 'warm_lead', 'sms_received', 'thread_resurfaced', 'estimate_approved',
          -- Tasks & Follow-Ups
          'task_assigned', 'task_due', 'task_overdue', 'task_completed',
          -- Calls
          'missed_call', 'call_followup_due',
          -- Campaign & System
          'campaign_paused', 'campaign_limit_reached', 'deliverability_issue', 'warmup_warning',
          -- Billing
          'billing_issue', 'plan_limit_reached', 'subscription_past_due',
          -- System (general)
          'system'
        ));
    EXCEPTION WHEN others THEN
      -- If another migration owns a different check constraint, do not fail the deploy.
      NULL;
    END;
  END IF;
END $$;

-- Gate notification creation at the source
CREATE OR REPLACE FUNCTION public.create_notification_v2(
  p_org_id uuid,
  p_user_id uuid,
  p_category text,
  p_type text,
  p_title text,
  p_body text DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_url text DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_reply_thread_id uuid DEFAULT NULL,
  p_task_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_notification_id uuid;
BEGIN
  -- Block 271700: Zero-Notification Mode (silent unless hot lead or estimate approved)
  IF public.is_zero_notification_mode(p_org_id) THEN
    IF p_type NOT IN ('hot_lead', 'estimate_approved') THEN
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO public.notifications (
    org_id, user_id, category, type, title, body,
    entity_type, entity_id, url,
    contact_id, reply_thread_id, task_id, campaign_id,
    read, is_read, created_at
  )
  VALUES (
    p_org_id, p_user_id, p_category, p_type, p_title, p_body,
    p_entity_type, p_entity_id, p_url,
    p_contact_id, p_reply_thread_id, p_task_id, p_campaign_id,
    false, false, now()
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- Backstop: filter *any* direct inserts into notifications
CREATE OR REPLACE FUNCTION public.fn_notifications_zero_mode_filter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_scope_id uuid;
BEGIN
  -- Support both schemas: org_id and workspace_id may exist.
  v_scope_id := COALESCE(NEW.org_id, NEW.workspace_id);

  IF v_scope_id IS NOT NULL AND public.is_zero_notification_mode(v_scope_id) THEN
    IF NEW.type NOT IN ('hot_lead', 'estimate_approved') THEN
      RETURN NULL; -- silently drop
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_zero_mode_filter ON public.notifications;
CREATE TRIGGER trg_notifications_zero_mode_filter
BEFORE INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.fn_notifications_zero_mode_filter();

-- ==========================================================================
-- 3) Alerts: suppress all non-hot alerts in zero mode
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.create_alert(
  p_workspace_id uuid,
  p_user_id uuid,
  p_type alert_type,
  p_title text,
  p_message text,
  p_contact_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_appointment_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_source text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_alert_id uuid;
  v_priority alert_priority;
  v_icon text;
  v_recommended_actions jsonb;
  v_throttled boolean := false;
  v_existing_alert_id uuid;
  v_throttle_minutes integer;
BEGIN
  -- Block 271700: Zero-Notification Mode (alerts silent unless hot lead)
  IF public.is_zero_notification_mode(p_workspace_id) THEN
    IF p_type::text <> 'hot_lead' THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Determine priority based on type
  CASE p_type
    WHEN 'hot_lead', 'insurance_claim', 'storm_damage' THEN
      v_priority := 'priority_1';
      v_icon := CASE p_type
        WHEN 'hot_lead' THEN '🔥'
        WHEN 'insurance_claim' THEN '📄'
        WHEN 'storm_damage' THEN '🌪️'
      END;
    WHEN 'appointment' THEN
      v_priority := 'priority_2';
      v_icon := '📅';
    WHEN 'system_billing' THEN
      v_priority := 'priority_4';
      v_icon := '⚠️';
    WHEN 'performance_insights' THEN
      v_priority := 'priority_3';
      v_icon := '📈';
    ELSE
      v_priority := 'priority_3';
      v_icon := '🔔';
  END CASE;

  -- Generate recommended actions based on type
  v_recommended_actions := CASE p_type
    WHEN 'hot_lead' THEN '[{"action": "reply", "label": "Reply Now"}, {"action": "move_pipeline", "label": "Move to HOT"}, {"action": "book_appointment", "label": "Offer Time"}]'::jsonb
    WHEN 'insurance_claim' THEN '[{"action": "move_pipeline", "label": "Move to Insurance Pipeline"}, {"action": "send_template", "label": "Send Adjuster Prep Message"}]'::jsonb
    WHEN 'storm_damage' THEN '[{"action": "send_template", "label": "Send Storm Inspection Template"}, {"action": "book_appointment", "label": "Book Inspection"}]'::jsonb
    WHEN 'appointment' THEN '[{"action": "view_appointment", "label": "View Details"}, {"action": "confirm", "label": "Confirm Appointment"}]'::jsonb
    ELSE '[]'::jsonb
  END;

  -- Check throttling (max 1 alert per contact every X minutes)
  IF p_contact_id IS NOT NULL THEN
    SELECT throttle_minutes INTO v_throttle_minutes
    FROM public.alert_settings
    WHERE workspace_id = p_workspace_id AND user_id = p_user_id
    LIMIT 1;

    IF v_throttle_minutes IS NULL THEN
      v_throttle_minutes := 20;
    END IF;

    SELECT id INTO v_existing_alert_id
    FROM public.alerts
    WHERE workspace_id = p_workspace_id
      AND contact_id = p_contact_id
      AND type = p_type
      AND created_at > now() - (v_throttle_minutes || ' minutes')::interval
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_alert_id IS NOT NULL THEN
      v_throttled := true;
      UPDATE public.alerts
      SET
        title = p_title,
        message = p_message,
        metadata = p_metadata,
        throttled = true
      WHERE id = v_existing_alert_id
      RETURNING id INTO v_alert_id;

      RETURN v_alert_id;
    END IF;
  END IF;

  INSERT INTO public.alerts (
    workspace_id,
    user_id,
    type,
    priority,
    title,
    message,
    icon,
    contact_id,
    campaign_id,
    appointment_id,
    metadata,
    source,
    recommended_actions,
    throttled
  ) VALUES (
    p_workspace_id,
    p_user_id,
    p_type,
    v_priority,
    p_title,
    p_message,
    v_icon,
    p_contact_id,
    p_campaign_id,
    p_appointment_id,
    p_metadata,
    p_source,
    v_recommended_actions,
    v_throttled
  ) RETURNING id INTO v_alert_id;

  INSERT INTO public.alert_events (
    alert_id,
    workspace_id,
    event_type,
    category,
    severity,
    contact_id,
    source,
    metadata
  ) VALUES (
    v_alert_id,
    p_workspace_id,
    'created',
    p_type,
    v_priority,
    p_contact_id,
    p_source,
    p_metadata
  );

  RETURN v_alert_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_alerts_zero_mode_filter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF public.is_zero_notification_mode(NEW.workspace_id) THEN
    IF NEW.type::text <> 'hot_lead' THEN
      RETURN NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alerts_zero_mode_filter ON public.alerts;
CREATE TRIGGER trg_alerts_zero_mode_filter
BEFORE INSERT ON public.alerts
FOR EACH ROW
EXECUTE FUNCTION public.fn_alerts_zero_mode_filter();

-- ==========================================================================
-- 4) Handled vs Needs Owner (binary state) for tasks + threads
-- ==========================================================================

-- Tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS attention_state text
    CHECK (attention_state IN ('handled', 'needs_owner'))
    NOT NULL
    DEFAULT 'needs_owner';

UPDATE public.tasks
SET attention_state = CASE WHEN COALESCE(completed, false) THEN 'handled' ELSE 'needs_owner' END
WHERE attention_state IS NULL;

CREATE OR REPLACE FUNCTION public.sync_task_attention_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.attention_state := CASE WHEN COALESCE(NEW.completed, false) THEN 'handled' ELSE 'needs_owner' END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_task_attention_state ON public.tasks;
CREATE TRIGGER trg_sync_task_attention_state
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.sync_task_attention_state();

-- Reply Threads
ALTER TABLE public.reply_threads
  ADD COLUMN IF NOT EXISTS attention_state text
    CHECK (attention_state IN ('handled', 'needs_owner'))
    NOT NULL
    DEFAULT 'needs_owner';

UPDATE public.reply_threads
SET attention_state = CASE WHEN status IN ('closed', 'archived') THEN 'handled' ELSE 'needs_owner' END
WHERE attention_state IS NULL;

CREATE OR REPLACE FUNCTION public.sync_reply_thread_attention_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.attention_state := CASE WHEN NEW.status IN ('closed', 'archived') THEN 'handled' ELSE 'needs_owner' END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_reply_thread_attention_state ON public.reply_threads;
CREATE TRIGGER trg_sync_reply_thread_attention_state
BEFORE INSERT OR UPDATE OF status ON public.reply_threads
FOR EACH ROW
EXECUTE FUNCTION public.sync_reply_thread_attention_state();

-- ==========================================================================
-- 5) Auto-resolution of low-value threads + dead stays dead
-- ==========================================================================

-- Permanently lock dead leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS dead_locked boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.enforce_dead_lock_on_leads()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (OLD.status = 'dead') AND (NEW.status IS DISTINCT FROM 'dead') THEN
    RAISE EXCEPTION 'Lead is dead (dead_locked): cannot change status away from dead';
  END IF;

  IF NEW.status = 'dead' THEN
    NEW.dead_locked := true;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'status'
  ) THEN
    DROP TRIGGER IF EXISTS trg_enforce_dead_lock_on_leads ON public.leads;
    CREATE TRIGGER trg_enforce_dead_lock_on_leads
    BEFORE UPDATE OF status ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_dead_lock_on_leads();
  END IF;
END $$;

-- Auto-close threads when a previously warm/hot lead goes cold, or when lead becomes dead.
CREATE OR REPLACE FUNCTION public.fn_auto_close_low_value_threads()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_cold boolean := false;
  v_is_dead boolean := false;
BEGIN
  v_is_dead := (NEW.status = 'dead');
  v_is_cold := (NEW.last_reply_intent = 'cold');

  IF NOT (v_is_dead OR v_is_cold) THEN
    RETURN NEW;
  END IF;

  -- Warm/hot -> cold should auto-close, but avoid closing if it was already cold.
  IF v_is_cold AND COALESCE(OLD.last_reply_intent, '') = 'cold' THEN
    RETURN NEW;
  END IF;

  -- Close reply_threads
  UPDATE public.reply_threads
  SET
    status = 'closed',
    snoozed_until = NULL,
    unread = false,
    attention_state = 'handled'
  WHERE lead_id = NEW.id
    AND status IN ('open', 'snoozed');

  -- Close inbox_threads (roofing inbox command center) if present
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'inbox_threads'
  ) THEN
    UPDATE public.inbox_threads
    SET
      status = 'closed',
      unread_count = 0,
      updated_at = now()
    WHERE lead_id = NEW.id
      AND status IN ('active', 'archived');
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'last_reply_intent'
  ) THEN
    DROP TRIGGER IF EXISTS trg_auto_close_low_value_threads ON public.leads;
    CREATE TRIGGER trg_auto_close_low_value_threads
    AFTER UPDATE OF last_reply_intent, status ON public.leads
    FOR EACH ROW
    WHEN (
      (NEW.last_reply_intent IS DISTINCT FROM OLD.last_reply_intent)
      OR (NEW.status IS DISTINCT FROM OLD.status)
    )
    EXECUTE FUNCTION public.fn_auto_close_low_value_threads();
  END IF;
END $$;

-- Prevent snooze/unsnooze from re-opening dead/cold threads
CREATE OR REPLACE FUNCTION public.fn_prevent_low_value_thread_reopen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead record;
BEGIN
  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT l.status, l.dead_locked, l.last_reply_intent
  INTO v_lead
  FROM public.leads l
  WHERE l.id = NEW.lead_id
  LIMIT 1;

  IF FOUND THEN
    IF v_lead.status = 'dead' OR COALESCE(v_lead.dead_locked, false) = true OR v_lead.last_reply_intent = 'cold' THEN
      -- Force closed + handled
      NEW.status := 'closed';
      NEW.snoozed_until := NULL;
      NEW.unread := false;
      NEW.attention_state := 'handled';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_low_value_thread_reopen ON public.reply_threads;
CREATE TRIGGER trg_prevent_low_value_thread_reopen
BEFORE INSERT OR UPDATE OF status, snoozed_until ON public.reply_threads
FOR EACH ROW
EXECUTE FUNCTION public.fn_prevent_low_value_thread_reopen();

-- Update auto_unsnooze_threads to skip dead/cold leads (no resurfacing junk)
CREATE OR REPLACE FUNCTION public.auto_unsnooze_threads()
RETURNS TABLE(
  thread_id uuid,
  account_id uuid,
  owner_id uuid,
  lead_id uuid,
  campaign_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread RECORD;
BEGIN
  FOR v_thread IN
    SELECT
      t.id,
      t.account_id,
      t.owner_id,
      t.lead_id,
      t.campaign_id,
      t.snoozed_until
    FROM public.reply_threads t
    LEFT JOIN public.leads l ON l.id = t.lead_id
    WHERE t.snoozed_until IS NOT NULL
      AND t.snoozed_until <= now()
      AND t.status = 'snoozed'
      AND (l.id IS NULL OR (COALESCE(l.status, '') <> 'dead' AND COALESCE(l.dead_locked, false) = false AND COALESCE(l.last_reply_intent, '') <> 'cold'))
  LOOP
    UPDATE public.reply_threads
    SET
      status = 'open',
      snoozed_until = NULL,
      updated_at = now()
    WHERE id = v_thread.id;

    thread_id := v_thread.id;
    account_id := v_thread.account_id;
    owner_id := v_thread.owner_id;
    lead_id := v_thread.lead_id;
    campaign_id := v_thread.campaign_id;

    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

-- If the V2 unsnooze-with-notifications function exists, also harden it.
CREATE OR REPLACE FUNCTION public.auto_unsnooze_threads_with_notifications()
RETURNS TABLE(
  thread_id uuid,
  account_id uuid,
  owner_id uuid,
  lead_id uuid,
  campaign_id uuid,
  org_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_thread RECORD;
  v_lead RECORD;
BEGIN
  FOR v_thread IN
    SELECT
      t.id,
      t.account_id,
      t.owner_id,
      t.lead_id,
      t.campaign_id,
      t.org_id,
      t.snoozed_until
    FROM public.reply_threads t
    WHERE t.snoozed_until IS NOT NULL
      AND t.snoozed_until <= now()
      AND t.status = 'snoozed'
  LOOP
    -- Skip dead/cold leads
    IF v_thread.lead_id IS NOT NULL THEN
      SELECT l.status, l.dead_locked, l.last_reply_intent INTO v_lead
      FROM public.leads l
      WHERE l.id = v_thread.lead_id
      LIMIT 1;

      IF FOUND THEN
        IF v_lead.status = 'dead' OR COALESCE(v_lead.dead_locked, false) = true OR v_lead.last_reply_intent = 'cold' THEN
          CONTINUE;
        END IF;
      END IF;
    END IF;

    UPDATE public.reply_threads
    SET
      status = 'open',
      snoozed_until = NULL,
      updated_at = now()
    WHERE id = v_thread.id;

    IF v_thread.owner_id IS NOT NULL AND v_thread.org_id IS NOT NULL THEN
      PERFORM public.create_thread_resurfaced_notification(
        v_thread.org_id,
        v_thread.owner_id,
        v_thread.id
      );
    END IF;

    thread_id := v_thread.id;
    account_id := v_thread.account_id;
    owner_id := v_thread.owner_id;
    lead_id := v_thread.lead_id;
    campaign_id := v_thread.campaign_id;
    org_id := v_thread.org_id;

    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

-- ==========================================================================
-- Done
-- ==========================================================================



