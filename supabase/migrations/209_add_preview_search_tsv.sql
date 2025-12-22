-- Block 204 — Replies Inbox Search v1
-- Extend Thread Preview Table to Include Text Search
-- Adds search_tsv column for message body search

ALTER TABLE public.thread_previews
ADD COLUMN IF NOT EXISTS search_tsv tsvector;

-- Populate search_tsv for existing rows
UPDATE public.thread_previews
SET search_tsv = to_tsvector(coalesce(last_message_body, ''))
WHERE search_tsv IS NULL;

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_thread_previews_search
ON public.thread_previews
USING GIN (search_tsv);

-- Update preview trigger function to include search_tsv
CREATE OR REPLACE FUNCTION update_thread_preview()
RETURNS trigger AS $$
DECLARE
  v_body text;
  v_direction text;
  v_thread_id uuid;
BEGIN
  -- Handle different column name variations (body vs body_text)
  v_body := COALESCE(NEW.body, NEW.body_text, '');
  
  -- Handle direction (could be text or enum, convert to text)
  v_direction := CASE 
    WHEN NEW.direction::text IS NOT NULL THEN NEW.direction::text
    ELSE 'inbound'
  END;
  
  -- Handle thread_id - try to convert to UUID if it's text
  BEGIN
    v_thread_id := NEW.thread_id::uuid;
  EXCEPTION WHEN OTHERS THEN
    -- If thread_id is not a valid UUID, skip this update
    RETURN NEW;
  END;
  
  -- Only update if thread_id exists and references reply_threads
  IF v_thread_id IS NOT NULL THEN
    INSERT INTO public.thread_previews (
      thread_id,
      last_message_body,
      last_message_direction,
      last_message_at,
      search_tsv
    )
    VALUES (
      v_thread_id,
      v_body,
      v_direction,
      COALESCE(NEW.created_at, NOW()),
      to_tsvector(v_body)
    )
    ON CONFLICT (thread_id) DO UPDATE SET
      last_message_body = EXCLUDED.last_message_body,
      last_message_direction = EXCLUDED.last_message_direction,
      last_message_at = EXCLUDED.last_message_at,
      search_tsv = EXCLUDED.search_tsv;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON COLUMN public.thread_previews.search_tsv IS 'Full-text search vector for last message body enabling fast inbox search';










