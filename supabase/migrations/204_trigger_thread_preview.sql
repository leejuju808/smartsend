-- Block 202 — Replies Inbox Performance v2
-- Trigger — Update thread_previews whenever a new message arrives

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
    INSERT INTO public.thread_previews (thread_id, last_message_body, last_message_direction, last_message_at)
    VALUES (v_thread_id, v_body, v_direction, COALESCE(NEW.created_at, NOW()))
    ON CONFLICT (thread_id) DO UPDATE SET
      last_message_body = EXCLUDED.last_message_body,
      last_message_direction = EXCLUDED.last_message_direction,
      last_message_at = EXCLUDED.last_message_at;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing triggers
DROP TRIGGER IF EXISTS tr_update_thread_preview ON public.messages;
DROP TRIGGER IF EXISTS tr_update_thread_preview_reply_messages ON public.reply_messages;

-- Create trigger for messages table
CREATE TRIGGER tr_update_thread_preview
AFTER INSERT ON public.messages
FOR EACH ROW
WHEN (NEW.thread_id IS NOT NULL)
EXECUTE FUNCTION update_thread_preview();

-- Also create trigger for reply_messages table (if it exists)
CREATE TRIGGER tr_update_thread_preview_reply_messages
AFTER INSERT ON public.reply_messages
FOR EACH ROW
WHEN (NEW.thread_id IS NOT NULL)
EXECUTE FUNCTION update_thread_preview();

COMMENT ON FUNCTION update_thread_preview() IS 'Automatically updates thread_previews table when a new message is inserted into messages or reply_messages tables';

