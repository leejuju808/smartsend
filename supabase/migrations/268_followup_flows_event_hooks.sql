-- Block 251 — Follow-Up Rules v3: Event Hooks
-- Updates followup_execution.context when events occur (opens, clicks, replies, intent, score)

-- ================================================
-- 1) Function to update execution context
-- ================================================

CREATE OR REPLACE FUNCTION public.update_followup_execution_context(
  p_lead_id uuid,
  p_event_type text,
  p_event_data jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_execution_record RECORD;
BEGIN
  -- Update all active executions for this lead
  FOR v_execution_record IN
    SELECT id, context
    FROM public.followup_execution
    WHERE lead_id = p_lead_id
      AND status = 'active'
  LOOP
    -- Merge new event data into context
    UPDATE public.followup_execution
    SET context = jsonb_build_object(
      'opened', COALESCE((v_execution_record.context->>'opened')::boolean, false) OR (p_event_type = 'open'),
      'clicked', COALESCE((v_execution_record.context->>'clicked')::boolean, false) OR (p_event_type = 'click'),
      'replied', COALESCE((v_execution_record.context->>'replied')::boolean, false) OR (p_event_type = 'reply'),
      'intent', COALESCE(p_event_data->>'intent', v_execution_record.context->>'intent'),
      'score_v3', COALESCE((p_event_data->>'score_v3')::numeric, (v_execution_record.context->>'score_v3')::numeric),
      'last_event_at', now()::text,
      'last_event_type', p_event_type
    ),
    updated_at = now()
    WHERE id = v_execution_record.id;
  END LOOP;
END;
$$;

-- ================================================
-- 2) Trigger function for email opens
-- ================================================

CREATE OR REPLACE FUNCTION public.on_email_open()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_lead_id uuid;
BEGIN
  -- Try to get lead_id from various sources
  v_lead_id := COALESCE(
    NEW.lead_id,
    (SELECT lead_id FROM public.email_logs WHERE id = NEW.email_log_id LIMIT 1),
    (SELECT lead_id FROM public.send_logs WHERE id = NEW.send_log_id LIMIT 1)
  );

  IF v_lead_id IS NOT NULL THEN
    PERFORM public.update_followup_execution_context(
      v_lead_id,
      'open',
      jsonb_build_object('opened', true, 'opened_at', NEW.created_at::text)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ================================================
-- 3) Trigger function for email clicks
-- ================================================

CREATE OR REPLACE FUNCTION public.on_email_click()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_lead_id uuid;
BEGIN
  -- Try to get lead_id from various sources
  v_lead_id := COALESCE(
    NEW.lead_id,
    (SELECT lead_id FROM public.email_logs WHERE id = NEW.email_log_id LIMIT 1),
    (SELECT lead_id FROM public.send_logs WHERE id = NEW.send_log_id LIMIT 1)
  );

  IF v_lead_id IS NOT NULL THEN
    PERFORM public.update_followup_execution_context(
      v_lead_id,
      'click',
      jsonb_build_object('clicked', true, 'clicked_at', NEW.created_at::text)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ================================================
-- 4) Trigger function for email replies
-- ================================================

CREATE OR REPLACE FUNCTION public.on_email_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_lead_id uuid;
BEGIN
  -- Try to get lead_id from various sources
  v_lead_id := COALESCE(
    NEW.lead_id,
    (SELECT lead_id FROM public.reply_threads WHERE id = NEW.thread_id LIMIT 1),
    (SELECT lead_id FROM public.email_logs WHERE id = NEW.email_log_id LIMIT 1)
  );

  IF v_lead_id IS NOT NULL THEN
    -- Update context and potentially stop execution
    PERFORM public.update_followup_execution_context(
      v_lead_id,
      'reply',
      jsonb_build_object('replied', true, 'replied_at', NEW.created_at::text)
    );

    -- Optionally pause/stop executions on reply (configurable per flow)
    -- For now, we'll let the flow handle this via branch nodes
  END IF;

  RETURN NEW;
END;
$$;

-- ================================================
-- 5) Trigger function for intent detection
-- ================================================

CREATE OR REPLACE FUNCTION public.on_intent_detected()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL AND NEW.intent_primary IS NOT NULL THEN
    PERFORM public.update_followup_execution_context(
      NEW.lead_id,
      'intent',
      jsonb_build_object(
        'intent', NEW.intent_primary,
        'intent_confidence', NEW.intent_confidence,
        'intent_detected_at', NEW.updated_at::text
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ================================================
-- 6) Trigger function for score updates
-- ================================================

CREATE OR REPLACE FUNCTION public.on_score_updated()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS NOT NULL AND NEW.score_v3 IS NOT NULL THEN
    PERFORM public.update_followup_execution_context(
      NEW.id,
      'score',
      jsonb_build_object('score_v3', NEW.score_v3, 'score_updated_at', NEW.updated_at::text)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- ================================================
-- 7) Create triggers (if tables exist)
-- ================================================

-- Email events table triggers
DO $$
BEGIN
  -- Open events
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_events') THEN
    DROP TRIGGER IF EXISTS trg_email_open_followup ON public.email_events;
    CREATE TRIGGER trg_email_open_followup
      AFTER INSERT ON public.email_events
      FOR EACH ROW
      WHEN (NEW.event_type = 'open')
      EXECUTE FUNCTION public.on_email_open();
  END IF;

  -- Click events
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'email_events') THEN
    DROP TRIGGER IF EXISTS trg_email_click_followup ON public.email_events;
    CREATE TRIGGER trg_email_click_followup
      AFTER INSERT ON public.email_events
      FOR EACH ROW
      WHEN (NEW.event_type = 'click')
      EXECUTE FUNCTION public.on_email_click();
  END IF;
END $$;

-- Reply threads trigger
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reply_threads') THEN
    DROP TRIGGER IF EXISTS trg_reply_thread_followup ON public.reply_threads;
    CREATE TRIGGER trg_reply_thread_followup
      AFTER INSERT OR UPDATE ON public.reply_threads
      FOR EACH ROW
      WHEN (NEW.status = 'replied' OR NEW.intent_primary IS NOT NULL)
      EXECUTE FUNCTION public.on_email_reply();
  END IF;
END $$;

-- Intent detection trigger
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'reply_threads') THEN
    DROP TRIGGER IF EXISTS trg_intent_followup ON public.reply_threads;
    CREATE TRIGGER trg_intent_followup
      AFTER UPDATE ON public.reply_threads
      FOR EACH ROW
      WHEN (NEW.intent_primary IS DISTINCT FROM OLD.intent_primary)
      EXECUTE FUNCTION public.on_intent_detected();
  END IF;
END $$;

-- Score updates trigger
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'leads') THEN
    DROP TRIGGER IF EXISTS trg_score_followup ON public.leads;
    CREATE TRIGGER trg_score_followup
      AFTER UPDATE ON public.leads
      FOR EACH ROW
      WHEN (NEW.score_v3 IS DISTINCT FROM OLD.score_v3)
      EXECUTE FUNCTION public.on_score_updated();
  END IF;
END $$;

-- ================================================
-- 8) Grant execute permissions
-- ================================================

GRANT EXECUTE ON FUNCTION public.update_followup_execution_context TO authenticated;
GRANT EXECUTE ON FUNCTION public.on_email_open TO authenticated;
GRANT EXECUTE ON FUNCTION public.on_email_click TO authenticated;
GRANT EXECUTE ON FUNCTION public.on_email_reply TO authenticated;
GRANT EXECUTE ON FUNCTION public.on_intent_detected TO authenticated;
GRANT EXECUTE ON FUNCTION public.on_score_updated TO authenticated;









