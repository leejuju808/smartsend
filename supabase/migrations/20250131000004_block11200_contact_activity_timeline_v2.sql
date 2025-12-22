-- Block 11200 — Contact Activity Timeline v2
-- Full Event Stream + Filters + Merge-Aware History + Deep Linking
-- This takes the v1 timeline and turns it into a full audit log of every touch point

-- ============================================================================
-- 1. ENHANCE activity_events TABLE
-- ============================================================================

-- Ensure activity_events has meta column (alias for metadata if needed, or add both)
-- The table already has metadata jsonb, but we'll ensure it's properly named
-- For consistency with the spec, we'll use metadata but ensure it's flexible

-- Add meta column if it doesn't exist (some systems use 'meta', some use 'metadata')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'activity_events' 
    AND column_name = 'meta'
  ) THEN
    ALTER TABLE public.activity_events ADD COLUMN meta jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- Ensure metadata column exists and defaults to empty jsonb
ALTER TABLE public.activity_events
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

-- Create index on meta for faster queries
CREATE INDEX IF NOT EXISTS idx_activity_events_meta 
  ON public.activity_events USING gin(meta);

CREATE INDEX IF NOT EXISTS idx_activity_events_metadata 
  ON public.activity_events USING gin(metadata);

-- ============================================================================
-- 2. HELPER FUNCTION TO GET MERGED CONTACT IDs
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_merged_contact_ids(p_contact_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result uuid[];
  v_merged_contact_id uuid;
  v_primary_contact_id uuid;
BEGIN
  -- Check if this contact was merged into another contact
  SELECT merged_into INTO v_primary_contact_id
  FROM public.contacts
  WHERE id = p_contact_id;
  
  -- If merged into another contact, use that as the primary
  IF v_primary_contact_id IS NOT NULL THEN
    v_result := ARRAY[v_primary_contact_id];
  ELSE
    -- This is the primary contact
    v_result := ARRAY[p_contact_id];
  END IF;
  
  -- Find all contacts that were merged INTO the primary contact
  FOR v_merged_contact_id IN
    SELECT id FROM public.contacts
    WHERE merged_into = COALESCE(v_primary_contact_id, p_contact_id)
  LOOP
    v_result := array_append(v_result, v_merged_contact_id);
  END LOOP;
  
  -- Also include the original contact if it was merged
  IF v_primary_contact_id IS NOT NULL AND NOT (p_contact_id = ANY(v_result)) THEN
    v_result := array_append(v_result, p_contact_id);
  END IF;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_merged_contact_ids IS 'Returns array of contact IDs including the primary contact and all contacts merged into it';

-- ============================================================================
-- 3. ENHANCED CONTACT TIMELINE VIEW WITH MERGE-AWARE QUERYING
-- ============================================================================

CREATE OR REPLACE VIEW public.contact_timeline_events_v2 AS
WITH merged_contacts AS (
  -- Get all contact IDs including merged ones for a given contact
  -- This CTE will be used with a parameter, but for the view we need to handle all contacts
  SELECT DISTINCT 
    c.id as primary_contact_id,
    unnest(public.get_merged_contact_ids(c.id)) as contact_id,
    c.workspace_id
  FROM public.contacts c
  WHERE c.merged_into IS NULL
),
contact_leads AS (
  -- Map contacts to leads by email match within workspace
  SELECT DISTINCT
    mc.primary_contact_id as contact_id,
    mc.workspace_id,
    l.id as lead_id
  FROM merged_contacts mc
  JOIN public.contacts c ON c.id = mc.contact_id
  LEFT JOIN public.leads l ON (
    lower(c.email) = lower(l.email)
    AND c.workspace_id = l.workspace_id
  )
),
-- Activity events from activity_events table (if they exist)
activity_events_data AS (
  SELECT
    ae.id,
    mc.primary_contact_id as contact_id,
    ae.created_at as occurred_at,
    ae.type,
    ae.title,
    ae.description as body,
    COALESCE(ae.meta, ae.metadata, '{}'::jsonb) as meta,
    ae.user_id as created_by
  FROM public.activity_events ae
  JOIN merged_contacts mc ON mc.contact_id = ae.contact_id
  WHERE ae.contact_id IS NOT NULL
),
email_sent_events AS (
  SELECT
    gen_random_uuid() as id,
    cl.contact_id,
    sl.sent_at as occurred_at,
    'email_sent'::text as type,
    COALESCE(sl.subject, 'Email sent') as title,
    LEFT(COALESCE(sl.body_preview, sl.body_text, ''), 200) as body,
    jsonb_build_object(
      'campaign_id', sl.campaign_id,
      'subject', sl.subject,
      'status', sl.status,
      'send_log_id', sl.id,
      'message_snippet', LEFT(COALESCE(sl.body_preview, sl.body_text, ''), 100)
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
    'reply_received'::text as type,
    COALESCE('Reply from ' || er.from_email, 'Reply received') as title,
    LEFT(COALESCE(er.body_text, er.body), 200) as body,
    jsonb_build_object(
      'from_email', er.from_email,
      'subject', er.subject,
      'intent', er.intent,
      'reply_id', er.id,
      'send_log_id', er.send_log_id,
      'thread_id', er.thread_id,
      'message_snippet', LEFT(COALESCE(er.body_text, er.body), 100)
    ) as meta,
    NULL::uuid as created_by
  FROM contact_leads cl
  JOIN public.send_logs sl ON sl.lead_id = cl.lead_id
  JOIN public.email_replies er ON er.send_log_id = sl.id
),
intent_change_events AS (
  SELECT
    gen_random_uuid() as id,
    cl.contact_id,
    rie.created_at as occurred_at,
    'intent_changed'::text as type,
    'Intent changed: ' || COALESCE(rie.old_intent, 'None') || ' → ' || rie.new_intent as title,
    NULL::text as body,
    jsonb_build_object(
      'old_intent', rie.old_intent,
      'new_intent', rie.new_intent,
      'lead_id', rie.lead_id
    ) as meta,
    NULL::uuid as created_by
  FROM contact_leads cl
  JOIN public.leads l ON l.id = cl.lead_id
  JOIN public.lead_intent_events rie ON rie.lead_id = l.id
  WHERE rie.old_intent IS DISTINCT FROM rie.new_intent
),
status_change_events AS (
  SELECT
    csh.id,
    mc.primary_contact_id as contact_id,
    csh.created_at as occurred_at,
    'status_changed'::text as type,
    'Status: ' || COALESCE(csh.old_status, 'None') || ' → ' || csh.new_status as title,
    NULL::text as body,
    jsonb_build_object(
      'old_status', csh.old_status,
      'new_status', csh.new_status,
      'changed_by', csh.changed_by
    ) as meta,
    csh.changed_by as created_by
  FROM public.contact_status_history csh
  JOIN merged_contacts mc ON mc.contact_id = csh.contact_id
),
tag_added_events AS (
  SELECT
    gen_random_uuid() as id,
    mc.primary_contact_id as contact_id,
    NOW() as occurred_at,
    'tag_added'::text as type,
    'Tag added: ' || tag_value as title,
    NULL::text as body,
    jsonb_build_object('tag', tag_value) as meta,
    NULL::uuid as created_by
  FROM merged_contacts mc
  JOIN public.contacts c ON c.id = mc.contact_id
  CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(c.tags, '[]'::jsonb)) tag_value
  WHERE c.tags IS NOT NULL AND jsonb_array_length(c.tags) > 0
),
note_events AS (
  SELECT
    cn.id,
    mc.primary_contact_id as contact_id,
    cn.created_at as occurred_at,
    'note_added'::text as type,
    'Note from ' || COALESCE(p.email, 'user') as title,
    cn.body,
    jsonb_build_object(
      'note_id', cn.id,
      'user_id', cn.user_id,
      'note_body', LEFT(cn.body, 200)
    ) as meta,
    cn.user_id as created_by
  FROM public.contact_notes cn
  JOIN merged_contacts mc ON mc.contact_id = cn.contact_id
  LEFT JOIN auth.users p ON p.id = cn.user_id
),
task_created_events AS (
  SELECT
    gen_random_uuid() as id,
    cl.contact_id,
    t.created_at as occurred_at,
    'task_created'::text as type,
    'Task created: ' || t.title as title,
    COALESCE(t.notes, t.description, '') as body,
    jsonb_build_object(
      'task_id', t.id,
      'title', t.title,
      'due_date', t.due_at,
      'status', t.status,
      'assigned_to', t.user_id
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
    COALESCE(t.notes, t.description, '') as body,
    jsonb_build_object(
      'task_id', t.id,
      'title', t.title
    ) as meta,
    t.user_id as created_by
  FROM contact_leads cl
  JOIN public.tasks t ON t.lead_id = cl.lead_id
  WHERE t.status = 'done' AND t.updated_at > t.created_at
),
task_assigned_events AS (
  SELECT
    gen_random_uuid() as id,
    cl.contact_id,
    t.updated_at as occurred_at,
    'task_assigned'::text as type,
    'Task assigned: ' || t.title as title,
    NULL::text as body,
    jsonb_build_object(
      'task_id', t.id,
      'title', t.title,
      'assigned_to', t.user_id
    ) as meta,
    NULL::uuid as created_by
  FROM contact_leads cl
  JOIN public.tasks t ON t.lead_id = cl.lead_id
  WHERE t.user_id IS NOT NULL
),
sequence_step_events AS (
  SELECT
    gen_random_uuid() as id,
    cl.contact_id,
    sq.created_at as occurred_at,
    'sequence_step_sent'::text as type,
    'Sequence step sent: ' || COALESCE(sq.subject, 'Step') as title,
    LEFT(COALESCE(sq.body_text, ''), 200) as body,
    jsonb_build_object(
      'step_id', sq.id,
      'campaign_id', sq.campaign_id,
      'subject', sq.subject,
      'sequence_step', sq.sequence_step
    ) as meta,
    NULL::uuid as created_by
  FROM contact_leads cl
  JOIN public.send_queue sq ON sq.lead_id = cl.lead_id
  WHERE sq.status = 'sent' AND sq.sequence_step IS NOT NULL
),
campaign_enrolled_events AS (
  SELECT
    gen_random_uuid() as id,
    mc.primary_contact_id as contact_id,
    cc.created_at as occurred_at,
    'campaign_enrolled'::text as type,
    'Enrolled in campaign: ' || COALESCE(c.name, 'Campaign') as title,
    NULL::text as body,
    jsonb_build_object(
      'campaign_id', cc.campaign_id,
      'campaign_name', c.name
    ) as meta,
    NULL::uuid as created_by
  FROM merged_contacts mc
  JOIN public.contacts c_contact ON c_contact.id = mc.contact_id
  JOIN public.campaign_contacts cc ON cc.contact_id = c_contact.id
  JOIN public.campaigns c ON c.id = cc.campaign_id
),
contact_merged_events AS (
  SELECT
    ae.id,
    mc.primary_contact_id as contact_id,
    ae.created_at as occurred_at,
    'contact_merged'::text as type,
    'Contact merged from ' || COALESCE((ae.metadata->>'merged_contact_email')::text, 'another contact') as title,
    NULL::text as body,
    jsonb_build_object(
      'from_contact_id', ae.metadata->>'merged_contact_id',
      'merged_contact_email', ae.metadata->>'merged_contact_email'
    ) as meta,
    ae.user_id as created_by
  FROM public.activity_events ae
  JOIN merged_contacts mc ON mc.contact_id = COALESCE(
    (ae.metadata->>'merged_contact_id')::uuid,
    ae.contact_id
  )
  WHERE ae.type = 'contact_merged'
)
SELECT * FROM activity_events_data
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'activity_events')
UNION ALL
SELECT * FROM email_sent_events
UNION ALL
SELECT * FROM email_reply_events
UNION ALL
SELECT * FROM intent_change_events
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_intent_events')
UNION ALL
SELECT * FROM status_change_events
UNION ALL
SELECT * FROM tag_added_events
UNION ALL
SELECT * FROM note_events
UNION ALL
SELECT * FROM task_created_events
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tasks')
UNION ALL
SELECT * FROM task_completed_events
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tasks')
UNION ALL
SELECT * FROM task_assigned_events
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tasks')
UNION ALL
SELECT * FROM sequence_step_events
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'send_queue')
UNION ALL
SELECT * FROM campaign_enrolled_events
WHERE EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_contacts')
UNION ALL
SELECT * FROM contact_merged_events;

-- Grant access to the view
GRANT SELECT ON public.contact_timeline_events_v2 TO authenticated;

-- ============================================================================
-- 4. FUNCTION TO GET CONTACT ACTIVITY WITH FILTERS AND PAGINATION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_contact_activity(
  p_contact_id uuid,
  p_event_types text[] DEFAULT NULL,
  p_cursor timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  type text,
  occurred_at timestamptz,
  title text,
  body text,
  meta jsonb,
  created_by uuid,
  next_cursor timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_events record;
  v_count integer := 0;
  v_last_occurred_at timestamptz;
BEGIN
  -- Get events from the enhanced view
  FOR v_events IN
    SELECT 
      e.id,
      e.type,
      e.occurred_at,
      e.title,
      e.body,
      e.meta,
      e.created_by
    FROM public.contact_timeline_events_v2 e
    WHERE e.contact_id = p_contact_id
      AND (p_event_types IS NULL OR e.type = ANY(p_event_types))
      AND (p_cursor IS NULL OR e.occurred_at < p_cursor)
    ORDER BY e.occurred_at DESC
    LIMIT p_limit + 1
  LOOP
    v_count := v_count + 1;
    
    IF v_count <= p_limit THEN
      RETURN QUERY SELECT 
        v_events.id,
        v_events.type,
        v_events.occurred_at,
        v_events.title,
        v_events.body,
        v_events.meta,
        v_events.created_by,
        NULL::timestamptz;
    ELSE
      -- This is the extra row, use it for cursor
      v_last_occurred_at := v_events.occurred_at;
    END IF;
  END LOOP;
  
  -- Return cursor if there are more results
  IF v_count > p_limit THEN
    -- Update the last row with the cursor
    RETURN QUERY SELECT 
      NULL::uuid,
      NULL::text,
      NULL::timestamptz,
      NULL::text,
      NULL::text,
      NULL::jsonb,
      NULL::uuid,
      v_last_occurred_at;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_contact_activity IS 'Returns paginated contact activity events with optional type filtering';

GRANT EXECUTE ON FUNCTION public.get_contact_activity(uuid, text[], timestamptz, integer) TO authenticated;

