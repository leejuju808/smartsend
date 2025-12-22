-- Block 9100 — Contact Profile Page (Full Lead Overview + Activity Timeline)
-- Creates unified timeline view and supporting tables

-- 1) Contact status history table (for tracking status changes)
CREATE TABLE IF NOT EXISTS public.contact_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_status_history_contact 
  ON public.contact_status_history(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_status_history_workspace 
  ON public.contact_status_history(workspace_id);

ALTER TABLE public.contact_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contact_status_history_select_workspace"
  ON public.contact_status_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() AND p.workspace_id = contact_status_history.workspace_id
    )
  );

-- 2) Contact notes table (if not exists, or extend existing notes table)
-- We'll create a contact_notes table that links directly to contacts
CREATE TABLE IF NOT EXISTS public.contact_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_notes_contact 
  ON public.contact_notes(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_notes_workspace 
  ON public.contact_notes(workspace_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.set_contact_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contact_notes_updated_at ON public.contact_notes;
CREATE TRIGGER trg_contact_notes_updated_at
  BEFORE UPDATE ON public.contact_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_contact_notes_updated_at();

ALTER TABLE public.contact_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contact_notes_select_workspace"
  ON public.contact_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() AND p.workspace_id = contact_notes.workspace_id
    )
  );

CREATE POLICY "contact_notes_insert_workspace"
  ON public.contact_notes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p 
      WHERE p.id = auth.uid() AND p.workspace_id = contact_notes.workspace_id
    )
    AND user_id = auth.uid()
  );

CREATE POLICY "contact_notes_update_creator"
  ON public.contact_notes FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "contact_notes_delete_creator"
  ON public.contact_notes FOR DELETE
  USING (user_id = auth.uid());

-- 3) Add status column to contacts if not exists
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS status text 
    CHECK (status IN ('New', 'Attempting', 'Warm', 'Hot', 'Customer', 'Not Interested'))
    DEFAULT 'New';

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS address text;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS city text;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS state text;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS zip text;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS timezone text;

-- 4) Trigger to log status changes
CREATE OR REPLACE FUNCTION public.log_contact_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.contact_status_history (
      contact_id,
      workspace_id,
      old_status,
      new_status,
      changed_by
    ) VALUES (
      NEW.id,
      NEW.workspace_id,
      OLD.status,
      NEW.status,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_contact_status_change ON public.contacts;
CREATE TRIGGER trg_log_contact_status_change
  AFTER UPDATE OF status ON public.contacts
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.log_contact_status_change();

-- 5) Unified timeline view
-- This view combines all events related to a contact
CREATE OR REPLACE VIEW public.contact_timeline_events AS
WITH contact_leads AS (
  -- Map contacts to leads by email match within workspace
  SELECT DISTINCT
    c.id as contact_id,
    c.workspace_id,
    l.id as lead_id
  FROM public.contacts c
  JOIN public.leads l ON (
    lower(c.email) = lower(l.email)
    AND c.workspace_id = l.workspace_id
  )
),
email_sent_events AS (
  SELECT
    gen_random_uuid() as id,
    cl.contact_id,
    sl.sent_at as occurred_at,
    'email_sent'::text as type,
    COALESCE(sl.subject, 'Email sent') as title,
    LEFT(sl.body_preview, 200) as body,
    jsonb_build_object(
      'campaign_id', sl.campaign_id,
      'subject', sl.subject,
      'status', sl.status,
      'send_log_id', sl.id
    ) as meta,
    NULL::uuid as created_by
  FROM contact_leads cl
  JOIN public.send_logs sl ON sl.lead_id = cl.lead_id
  WHERE sl.sent_at IS NOT NULL
),
email_reply_events AS (
  SELECT
    gen_random_uuid() as id,
    cl.contact_id,
    er.created_at as occurred_at,
    'email_reply'::text as type,
    COALESCE('Reply from ' || er.from_email, 'Reply received') as title,
    LEFT(er.body_text, 200) as body,
    jsonb_build_object(
      'from_email', er.from_email,
      'subject', er.subject,
      'intent', er.intent,
      'reply_id', er.id,
      'send_log_id', er.send_log_id
    ) as meta,
    NULL::uuid as created_by
  FROM contact_leads cl
  JOIN public.send_logs sl ON sl.lead_id = cl.lead_id
  JOIN public.email_replies er ON er.send_log_id = sl.id
),
note_events AS (
  SELECT
    cn.id,
    cn.contact_id,
    cn.created_at as occurred_at,
    'note'::text as type,
    'Note from ' || COALESCE(p.email, 'user') as title,
    cn.body,
    jsonb_build_object(
      'note_id', cn.id,
      'user_id', cn.user_id
    ) as meta,
    cn.user_id as created_by
  FROM public.contact_notes cn
  LEFT JOIN auth.users p ON p.id = cn.user_id
),
task_created_events AS (
  SELECT
    gen_random_uuid() as id,
    cl.contact_id,
    t.created_at as occurred_at,
    'task_created'::text as type,
    'Task created: ' || t.title as title,
    COALESCE(t.notes, '') as body,
    jsonb_build_object(
      'task_id', t.id,
      'title', t.title,
      'due_at', t.due_at,
      'status', t.status
    ) as meta,
    t.user_id as created_by
  FROM contact_leads cl
  JOIN public.tasks t ON t.lead_id = cl.lead_id
),
task_completed_events AS (
  SELECT
    gen_random_uuid() as id,
    cl.contact_id,
    t.updated_at as occurred_at,
    'task_completed'::text as type,
    'Task completed: ' || t.title as title,
    COALESCE(t.notes, '') as body,
    jsonb_build_object(
      'task_id', t.id,
      'title', t.title
    ) as meta,
    t.user_id as created_by
  FROM contact_leads cl
  JOIN public.tasks t ON t.lead_id = cl.lead_id
  WHERE t.status = 'done' AND t.updated_at > t.created_at
),
status_change_events AS (
  SELECT
    csh.id,
    csh.contact_id,
    csh.created_at as occurred_at,
    'status_change'::text as type,
    'Status: ' || COALESCE(csh.old_status, 'None') || ' → ' || csh.new_status as title,
    NULL::text as body,
    jsonb_build_object(
      'old_status', csh.old_status,
      'new_status', csh.new_status,
      'changed_by', csh.changed_by
    ) as meta,
    csh.changed_by as created_by
  FROM public.contact_status_history csh
)
SELECT * FROM email_sent_events
UNION ALL
SELECT * FROM email_reply_events
UNION ALL
SELECT * FROM note_events
UNION ALL
SELECT * FROM task_created_events
UNION ALL
SELECT * FROM task_completed_events
UNION ALL
SELECT * FROM status_change_events;

-- Grant access to the view
GRANT SELECT ON public.contact_timeline_events TO authenticated;

-- 6) Helper function to get contact stats
CREATE OR REPLACE FUNCTION public.get_contact_stats(p_contact_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact_email text;
  v_workspace_id uuid;
  v_stats jsonb;
BEGIN
  -- Get contact email and workspace
  SELECT email, workspace_id INTO v_contact_email, v_workspace_id
  FROM public.contacts
  WHERE id = p_contact_id;

  IF v_contact_email IS NULL THEN
    RETURN jsonb_build_object('error', 'Contact not found');
  END IF;

  -- Get stats
  WITH contact_leads AS (
    SELECT l.id as lead_id
    FROM public.leads l
    WHERE lower(l.email) = lower(v_contact_email)
      AND l.workspace_id = v_workspace_id
  ),
  email_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE sl.sent_at IS NOT NULL) as emails_sent,
      COUNT(DISTINCT er.id) as emails_replied
    FROM contact_leads cl
    LEFT JOIN public.send_logs sl ON sl.lead_id = cl.lead_id
    LEFT JOIN public.email_replies er ON er.send_log_id = sl.id
  ),
  last_activity AS (
    SELECT MAX(occurred_at) as last_activity_at
    FROM public.contact_timeline_events
    WHERE contact_id = p_contact_id
  ),
  last_reply_intent AS (
    SELECT er.intent
    FROM contact_leads cl
    JOIN public.send_logs sl ON sl.lead_id = cl.lead_id
    JOIN public.email_replies er ON er.send_log_id = sl.id
    ORDER BY er.created_at DESC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'emails_sent', COALESCE(ec.emails_sent, 0),
    'emails_replied', COALESCE(ec.emails_replied, 0),
    'last_activity_at', la.last_activity_at,
    'last_intent', lr.intent
  ) INTO v_stats
  FROM email_counts ec
  CROSS JOIN last_activity la
  LEFT JOIN last_reply_intent lr ON true;

  RETURN v_stats;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_contact_stats(uuid) TO authenticated;





























































