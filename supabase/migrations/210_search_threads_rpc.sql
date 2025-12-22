-- Block 204 — Replies Inbox Search v1
-- RPC Functions for Full-Text Search
-- Provides reliable ways to search using tsvector

-- Search thread_previews by message body
CREATE OR REPLACE FUNCTION search_thread_previews(search_query text)
RETURNS TABLE(thread_id uuid) AS $$
BEGIN
  -- Use plainto_tsquery for user-friendly plain text search
  -- This handles regular search terms better than to_tsquery
  RETURN QUERY
  SELECT tp.thread_id
  FROM public.thread_previews tp
  WHERE tp.search_tsv @@ plainto_tsquery('english', search_query);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Search reply_threads by intent/status
CREATE OR REPLACE FUNCTION search_reply_threads(search_query text)
RETURNS TABLE(thread_id uuid) AS $$
BEGIN
  RETURN QUERY
  SELECT rt.id
  FROM public.reply_threads rt
  WHERE rt.search_tsv @@ plainto_tsquery('english', search_query);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION search_thread_previews(text) IS 'Full-text search function for thread_previews using tsvector. Returns thread_ids matching the search query.';
COMMENT ON FUNCTION search_reply_threads(text) IS 'Full-text search function for reply_threads using tsvector. Returns thread_ids matching intent/status search query.';

