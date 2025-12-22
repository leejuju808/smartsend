-- Block 203 — Thread State System v1
-- Trigger to update thread state on new messages

-- Function to handle thread state updates
CREATE OR REPLACE FUNCTION public.handle_thread_state()
RETURNS trigger AS $$
DECLARE 
  _new_state TEXT;
BEGIN
  -- Determine new state based on message direction
  -- Map direction values: 'inbound'/'incoming' → 'needs_reply', 'outbound'/'outgoing' → 'replied'
  IF NEW.direction IN ('inbound', 'incoming') THEN
    _new_state := 'needs_reply';
  ELSIF NEW.direction IN ('outbound', 'outgoing') THEN
    _new_state := 'replied';
  ELSE
    -- Default to 'open' if direction doesn't match
    _new_state := 'open';
  END IF;

  -- Update thread state (but don't override 'closed' state unless explicitly set)
  UPDATE public.reply_threads
  SET state = _new_state
  WHERE id = NEW.thread_id
    AND state != 'closed';  -- Don't override closed state automatically

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS tr_thread_state ON public.reply_messages;
DROP TRIGGER IF EXISTS tr_thread_state ON public.messages;
DROP TRIGGER IF EXISTS tr_thread_state ON public.inbound_messages;

-- Create trigger on reply_messages table (primary table for reply threads)
CREATE TRIGGER tr_thread_state
AFTER INSERT ON public.reply_messages
FOR EACH ROW
WHEN (NEW.thread_id IS NOT NULL)
EXECUTE FUNCTION public.handle_thread_state();

-- Also create trigger on messages table if it references reply_threads
-- Check if messages table has thread_id column that references reply_threads
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'messages' 
    AND column_name = 'thread_id'
  ) THEN
    CREATE TRIGGER tr_thread_state_messages
    AFTER INSERT ON public.messages
    FOR EACH ROW
    WHEN (NEW.thread_id IS NOT NULL)
    EXECUTE FUNCTION public.handle_thread_state();
  END IF;
END $$;

COMMENT ON FUNCTION public.handle_thread_state() IS 'Automatically updates thread state when new messages are inserted';

