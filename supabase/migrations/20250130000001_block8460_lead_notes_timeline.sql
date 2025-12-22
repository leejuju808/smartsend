-- =========================================================
-- Block 8460 — Lead Notes & Call Logs Inside Timeline
-- =========================================================
-- Adds support for manual notes and call logs in the lead timeline
-- Allows roofers to log notes and calls directly into the timeline view

-- 1. Ensure lead_notes table has required columns
-- Add note_type column if it doesn't exist, or update constraint to include 'note' and 'call'
DO $$
BEGIN
  -- Add note_type column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lead_notes'
    AND column_name = 'note_type'
  ) THEN
    ALTER TABLE public.lead_notes
    ADD COLUMN note_type TEXT NOT NULL DEFAULT 'note';
  END IF;

  -- Add title column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lead_notes'
    AND column_name = 'title'
  ) THEN
    ALTER TABLE public.lead_notes
    ADD COLUMN title TEXT NULL;
  END IF;

  -- Ensure body column exists (should already exist)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lead_notes'
    AND column_name = 'body'
  ) THEN
    ALTER TABLE public.lead_notes
    ADD COLUMN body TEXT NOT NULL DEFAULT '';
  END IF;

  -- Add author_id column if it doesn't exist (may exist as user_id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lead_notes'
    AND column_name = 'author_id'
  ) THEN
    -- Check if user_id exists and use it as author_id
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'lead_notes'
      AND column_name = 'user_id'
    ) THEN
      ALTER TABLE public.lead_notes
      ADD COLUMN author_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;
      UPDATE public.lead_notes
      SET author_id = user_id
      WHERE user_id IS NOT NULL AND author_id IS NULL;
    ELSE
      ALTER TABLE public.lead_notes
      ADD COLUMN author_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
  END IF;

  -- Ensure created_at exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lead_notes'
    AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.lead_notes
    ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;
END $$;

-- 2. Update note_type constraint to include 'note' and 'call'
-- Drop existing constraint if it exists
DO $$
BEGIN
  -- Drop old constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lead_notes_note_type_check'
  ) THEN
    ALTER TABLE public.lead_notes DROP CONSTRAINT lead_notes_note_type_check;
  END IF;

  -- Add new constraint that includes 'note' and 'call'
  ALTER TABLE public.lead_notes
  ADD CONSTRAINT lead_notes_note_type_check
  CHECK (note_type IN ('note', 'call', 'context', 'objection', 'playbook_hint', 'do_not_mention', 'priority'));
END $$;

-- 3. Update existing notes to have 'note' type if they don't have a valid type
UPDATE public.lead_notes
SET note_type = 'note'
WHERE note_type IS NULL 
   OR note_type NOT IN ('note', 'call', 'context', 'objection', 'playbook_hint', 'do_not_mention', 'priority');

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id
  ON public.lead_notes (lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_notes_created_at
  ON public.lead_notes (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_created
  ON public.lead_notes (lead_id, created_at DESC);

-- 5. Update lead_timeline_events view to include notes
CREATE OR REPLACE VIEW public.lead_timeline_events AS
-- Outbound emails: join through contacts to get lead_id
SELECT
  oe.id::text                         AS id,
  l.id::uuid                          AS lead_id,
  'outbound'::text                    AS direction,
  'email_sent'::text                  AS event_type,
  oe.subject                          AS subject,
  left(coalesce(oe.body, ''), 240)   AS body_preview,
  coalesce(oe.sent_at, oe.send_at, oe.created_at) AS event_time,
  null::text                          AS intent,
  false                               AS is_hot
FROM public.outbound_emails oe
JOIN public.contacts c ON c.id = oe.contact_id
JOIN public.leads l ON l.contact_id = c.id

UNION ALL

-- Inbound replies: use inbound_replies table (has lead_id directly)
SELECT
  ir.id::text                         AS id,
  ir.lead_id::uuid                    AS lead_id,
  'inbound'::text                     AS direction,
  'reply_received'::text              AS event_type,
  ir.subject                          AS subject,
  left(coalesce(ir.body_text, ''), 240) AS body_preview,
  ir.created_at                       AS event_time,
  CASE 
    WHEN ir.is_human_reply THEN 'hot'
    ELSE null
  END::text                           AS intent,
  ir.is_human_reply                   AS is_hot
FROM public.inbound_replies ir
WHERE ir.lead_id IS NOT NULL

UNION ALL

-- Also include replies table if it exists (alternative inbound source)
SELECT
  r.id::text                          AS id,
  r.lead_id::uuid                     AS lead_id,
  'inbound'::text                     AS direction,
  'reply_received'::text              AS event_type,
  r.subject                           AS subject,
  left(coalesce(r.body, ''), 240)    AS body_preview,
  coalesce(r.received_at, r.created_at) AS event_time,
  r.detected_intent::text             AS intent,
  (r.detected_intent = 'positive')    AS is_hot
FROM public.replies r
WHERE r.lead_id IS NOT NULL
  AND NOT EXISTS (
    -- Avoid duplicates if inbound_replies already has this
    SELECT 1 FROM public.inbound_replies ir2 
    WHERE ir2.lead_id = r.lead_id 
      AND abs(extract(epoch FROM (ir2.created_at - coalesce(r.received_at, r.created_at)))) < 60
  )

UNION ALL

-- Manual notes / call logs
SELECT
  ln.id::text                         AS id,
  ln.lead_id::uuid                    AS lead_id,
  'internal'::text                    AS direction,
  ln.note_type::text                  AS event_type, -- 'note' or 'call'
  ln.title                            AS subject,
  left(coalesce(ln.body, ''), 240)    AS body_preview,
  ln.created_at                       AS event_time,
  null::text                          AS intent,
  false                               AS is_hot
FROM public.lead_notes ln
WHERE ln.lead_id IS NOT NULL;

-- Update comment
COMMENT ON VIEW public.lead_timeline_events IS 'Unified timeline of outbound emails, inbound replies, and internal notes/call logs for leads. Query by lead_id and order by event_time.';

-- Grant access to authenticated users
GRANT SELECT ON public.lead_timeline_events TO authenticated;

























































