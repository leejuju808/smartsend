-- Block 11900 — Inbox Snooze & Reminders v1
-- Adds snooze functionality to reply_threads with auto-unsnooze and notifications

-- 1. Ensure snoozed_until column exists
ALTER TABLE public.reply_threads
ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;

-- 2. Create index for efficient snooze queries
CREATE INDEX IF NOT EXISTS idx_reply_threads_snoozed_until 
ON public.reply_threads(snoozed_until) 
WHERE snoozed_until IS NOT NULL;

-- 3. Function to update status based on snoozed_until
CREATE OR REPLACE FUNCTION public.update_thread_status_from_snooze()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- If snoozed_until is set and in the future, set status to 'snoozed'
  IF NEW.snoozed_until IS NOT NULL AND NEW.snoozed_until > now() THEN
    NEW.status := 'snoozed';
  -- If snoozed_until is null or in the past, set status to 'open' (unless explicitly closed)
  ELSIF NEW.snoozed_until IS NULL OR NEW.snoozed_until <= now() THEN
    IF NEW.status = 'snoozed' THEN
      NEW.status := 'open';
      NEW.snoozed_until := NULL;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 4. Trigger to automatically update status when snoozed_until changes
DROP TRIGGER IF EXISTS trg_update_status_from_snooze ON public.reply_threads;
CREATE TRIGGER trg_update_status_from_snooze
BEFORE INSERT OR UPDATE ON public.reply_threads
FOR EACH ROW
EXECUTE FUNCTION public.update_thread_status_from_snooze();

-- 5. Function to auto-unsnooze threads (called by cron)
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
  -- Find threads that should be unsnoozed
  FOR v_thread IN
    SELECT 
      t.id,
      t.account_id,
      t.owner_id,
      t.lead_id,
      t.campaign_id,
      t.snoozed_until
    FROM public.reply_threads t
    WHERE t.snoozed_until IS NOT NULL
      AND t.snoozed_until <= now()
      AND t.status = 'snoozed'
  LOOP
    -- Update thread to unsnoozed
    UPDATE public.reply_threads
    SET 
      status = 'open',
      snoozed_until = NULL,
      updated_at = now()
    WHERE id = v_thread.id;
    
    -- Return thread info for notification creation
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

COMMENT ON FUNCTION public.auto_unsnooze_threads IS 'Auto-unsnoozes threads when snoozed_until time is reached. Returns threads that were unsnoozed for notification purposes.';

-- 6. Update reply_inbox_summary view to include snoozed_until
DO $$
BEGIN
  -- Check if view exists and add snoozed_until column
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'reply_inbox_summary') THEN
    DROP VIEW IF EXISTS public.reply_inbox_summary CASCADE;
    
    CREATE VIEW public.reply_inbox_summary AS
    SELECT
      rt.id,
      rt.workspace_id,
      rt.contact_id,
      rt.lead_id,
      rt.campaign_id,
      rt.thread_key,
      rt.latest_intent,
      rt.status,
      rt.assigned_to,
      rt.unread,
      rt.last_activity_at,
      rt.subject,
      rt.last_read_by,
      rt.snoozed_until, -- Block 11900: Add snoozed_until for snooze functionality
      c.email AS contact_email,
      c.status AS contact_status,
      CASE 
        WHEN c.first_name IS NOT NULL AND c.last_name IS NOT NULL THEN c.first_name || ' ' || c.last_name
        WHEN c.first_name IS NOT NULL THEN c.first_name
        WHEN c.last_name IS NOT NULL THEN c.last_name
        ELSE NULL
      END AS contact_name,
      COALESCE(
        CASE 
          WHEN c.first_name IS NOT NULL AND c.last_name IS NOT NULL THEN c.first_name || ' ' || c.last_name
          WHEN c.first_name IS NOT NULL THEN c.first_name
          WHEN c.last_name IS NOT NULL THEN c.last_name
          ELSE NULL
        END,
        c.email,
        l.email
      ) AS display_name,
      COALESCE(c.email, l.email) AS display_email,
      camp.name AS campaign_name,
      assigned_user.email AS assigned_to_email,
      COALESCE(
        assigned_profile.full_name,
        assigned_user.raw_user_meta_data->>'full_name',
        assigned_user.email
      ) AS assigned_to_name,
      assigned_profile.avatar_url AS assigned_to_avatar
    FROM public.reply_threads rt
    LEFT JOIN public.contacts c ON c.id = rt.contact_id
    LEFT JOIN public.leads l ON l.id = rt.lead_id
    LEFT JOIN public.campaigns camp ON camp.id = rt.campaign_id
    LEFT JOIN auth.users assigned_user ON assigned_user.id = rt.assigned_to
    LEFT JOIN public.profiles assigned_profile ON assigned_profile.id = rt.assigned_to;
    
    GRANT SELECT ON public.reply_inbox_summary TO authenticated;
  END IF;
END $$;

