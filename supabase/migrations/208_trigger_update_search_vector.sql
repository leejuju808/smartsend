-- Block 204 — Replies Inbox Search v1
-- Trigger — Auto-update search_tsv on reply_threads

CREATE OR REPLACE FUNCTION update_reply_thread_search_vector()
RETURNS trigger AS $$
BEGIN
  NEW.search_tsv := to_tsvector(
    coalesce(NEW.intent_primary, '') || ' ' ||
    coalesce(NEW.status, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_update_thread_search_vector ON public.reply_threads;

CREATE TRIGGER tr_update_thread_search_vector
BEFORE INSERT OR UPDATE ON public.reply_threads
FOR EACH ROW
EXECUTE FUNCTION update_reply_thread_search_vector();

COMMENT ON FUNCTION update_reply_thread_search_vector() IS 'Automatically updates search_tsv column when intent_primary or status changes';










