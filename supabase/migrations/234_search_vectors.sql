-- Block 221 — Global Search Engine v1
-- Full-Text Search Columns and Triggers for Leads, Threads, Campaigns

-- 1. Add search_vector columns
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS search_vector tsvector;

ALTER TABLE public.reply_threads
ADD COLUMN IF NOT EXISTS search_vector tsvector;

ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- 2. Create trigger function for leads
CREATE OR REPLACE FUNCTION update_lead_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector('simple',
      coalesce(NEW.name,'') || ' ' ||
      coalesce(NEW.first_name,'') || ' ' ||
      coalesce(NEW.last_name,'') || ' ' ||
      coalesce(NEW.email,'') || ' ' ||
      coalesce(NEW.company,'')
    );
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tsv_leads ON public.leads;
CREATE TRIGGER tsv_leads
BEFORE INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION update_lead_search_vector();

-- 3. Create trigger function for reply_threads
-- Note: We'll use a simpler approach - update search vector when messages are added
-- For initial inserts, we'll set an empty vector (will be updated when messages arrive)
CREATE OR REPLACE FUNCTION update_thread_search_vector() RETURNS trigger AS $$
BEGIN
  -- For now, set a basic search vector (can be enhanced later with message content)
  -- This will be updated by the message trigger
  NEW.search_vector := to_tsvector('simple', '');
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tsv_threads ON public.reply_threads;
CREATE TRIGGER tsv_threads
BEFORE INSERT OR UPDATE ON public.reply_threads
FOR EACH ROW EXECUTE FUNCTION update_thread_search_vector();

-- Also update search vector when reply_messages change
CREATE OR REPLACE FUNCTION update_thread_search_on_message() RETURNS trigger AS $$
BEGIN
  -- Update the parent thread's search vector with the latest inbound message
  UPDATE public.reply_threads
  SET search_vector = to_tsvector('simple',
    coalesce((
      SELECT body_text 
      FROM reply_messages 
      WHERE thread_id = NEW.thread_id 
        AND direction = 'inbound'
      ORDER BY created_at DESC 
      LIMIT 1
    ), '') || ' ' ||
    coalesce((
      SELECT snippet 
      FROM reply_messages 
      WHERE thread_id = NEW.thread_id 
        AND direction = 'inbound'
      ORDER BY created_at DESC 
      LIMIT 1
    ), '')
  )
  WHERE id = NEW.thread_id;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- Only create trigger if reply_messages table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reply_messages') THEN
    DROP TRIGGER IF EXISTS tsv_threads_on_message ON public.reply_messages;
    CREATE TRIGGER tsv_threads_on_message
    AFTER INSERT OR UPDATE ON public.reply_messages
    FOR EACH ROW EXECUTE FUNCTION update_thread_search_on_message();
  END IF;
END $$;

-- 4. Create trigger function for campaigns
CREATE OR REPLACE FUNCTION update_campaign_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector('simple',
      coalesce(NEW.name,'') || ' ' ||
      coalesce(NEW.title,'') || ' ' ||
      coalesce(NEW.subject,'') || ' ' ||
      coalesce(NEW.subject_line,'')
    );
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tsv_campaigns ON public.campaigns;
CREATE TRIGGER tsv_campaigns
BEFORE INSERT OR UPDATE ON public.campaigns
FOR EACH ROW EXECUTE FUNCTION update_campaign_search_vector();

-- 5. Create GIN indexes for fast full-text search
CREATE INDEX IF NOT EXISTS idx_lead_search ON public.leads USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_thread_search ON public.reply_threads USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_campaign_search ON public.campaigns USING GIN(search_vector);

-- 6. Backfill existing data
UPDATE public.leads SET search_vector = to_tsvector('simple',
  coalesce(name,'') || ' ' ||
  coalesce(first_name,'') || ' ' ||
  coalesce(last_name,'') || ' ' ||
  coalesce(email,'') || ' ' ||
  coalesce(company,'')
) WHERE search_vector IS NULL;

UPDATE public.campaigns SET search_vector = to_tsvector('simple',
  coalesce(name,'') || ' ' ||
  coalesce(title,'') || ' ' ||
  coalesce(subject,'') || ' ' ||
  coalesce(subject_line,'')
) WHERE search_vector IS NULL;

-- For threads, we'll update them when messages are queried or via a one-time backfill
-- This is more complex so we'll do it lazily or via a separate migration if needed

