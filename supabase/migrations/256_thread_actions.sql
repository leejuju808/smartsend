-- Block 241 — Replies Inbox Thread Actions v1
-- Adds thread management fields: archived, done, important, tags
-- Note: assigned_to already exists in the table

ALTER TABLE public.reply_threads
ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS done boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS important boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- Indexes for filtering
CREATE INDEX IF NOT EXISTS idx_reply_threads_archived 
  ON public.reply_threads(account_id, archived) 
  WHERE archived = false;

CREATE INDEX IF NOT EXISTS idx_reply_threads_done 
  ON public.reply_threads(account_id, done);

CREATE INDEX IF NOT EXISTS idx_reply_threads_important 
  ON public.reply_threads(account_id, important) 
  WHERE important = true;

CREATE INDEX IF NOT EXISTS idx_reply_threads_assigned_to 
  ON public.reply_threads(account_id, assigned_to) 
  WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reply_threads_tags 
  ON public.reply_threads USING GIN(tags);

-- RPC function to add tag to thread
CREATE OR REPLACE FUNCTION add_tag_to_thread(thread_id uuid, new_tag text)
RETURNS void AS $$
BEGIN
  UPDATE reply_threads
  SET tags = array_append(COALESCE(tags, '{}'), new_tag)
  WHERE id = thread_id
    AND NOT (new_tag = ANY(COALESCE(tags, '{}')));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function to remove tag from thread
CREATE OR REPLACE FUNCTION remove_tag_from_thread(thread_id uuid, tag_to_remove text)
RETURNS void AS $$
BEGIN
  UPDATE reply_threads
  SET tags = array_remove(COALESCE(tags, '{}'), tag_to_remove)
  WHERE id = thread_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comments
COMMENT ON COLUMN public.reply_threads.archived IS 'Whether the thread is archived';
COMMENT ON COLUMN public.reply_threads.done IS 'Whether the thread is marked as done';
COMMENT ON COLUMN public.reply_threads.important IS 'Whether the thread is marked as important/starred';
COMMENT ON COLUMN public.reply_threads.assigned_to IS 'User ID of the person assigned to this thread';
COMMENT ON COLUMN public.reply_threads.tags IS 'Array of tags for organizing threads';

