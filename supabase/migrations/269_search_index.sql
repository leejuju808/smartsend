-- Block 253 — Unified Search v1
-- Global Search Across Leads, Replies, Campaigns, Notes, Tasks, Companies
-- Creates a materialized view that unifies all searchable entities

-- Drop existing materialized view if it exists
DROP MATERIALIZED VIEW IF EXISTS public.search_index CASCADE;

-- Create unified search index materialized view
CREATE MATERIALIZED VIEW public.search_index AS
SELECT
  id,
  workspace_id,
  'lead' AS type,
  COALESCE(email, '') AS title,
  (
    COALESCE(first_name, '') || ' ' ||
    COALESCE(last_name, '') || ' ' ||
    COALESCE(email, '') || ' ' ||
    COALESCE(company, '')
  ) AS keywords,
  '/leads/' || id AS url,
  updated_at
FROM public.leads
WHERE workspace_id IS NOT NULL

UNION ALL

-- Companies (distinct companies from leads)
SELECT
  gen_random_uuid() AS id,
  workspace_id,
  'company' AS type,
  company AS title,
  company AS keywords,
  '/companies/' || company AS url,
  MAX(updated_at) AS updated_at
FROM public.leads
WHERE workspace_id IS NOT NULL
  AND company IS NOT NULL
  AND company != ''
GROUP BY workspace_id, company

UNION ALL

-- Campaigns
SELECT
  id,
  COALESCE(workspace_id, (SELECT workspace_id FROM workspace_members WHERE user_id = campaigns.user_id LIMIT 1)) AS workspace_id,
  'campaign' AS type,
  COALESCE(name, title, 'Untitled Campaign') AS title,
  COALESCE(name, title, '') AS keywords,
  '/campaigns/' || id AS url,
  COALESCE(updated_at, created_at) AS updated_at
FROM public.campaigns
WHERE COALESCE(workspace_id, (SELECT workspace_id FROM workspace_members WHERE user_id = campaigns.user_id LIMIT 1)) IS NOT NULL

UNION ALL

-- Reply Threads
SELECT
  rt.id,
  rt.workspace_id,
  'thread' AS type,
  COALESCE(rt.subject, 'No Subject') AS title,
  (
    COALESCE(rt.subject, '') || ' ' ||
    COALESCE(
      (SELECT body FROM public.reply_messages 
       WHERE thread_id = rt.id 
       ORDER BY created_at DESC 
       LIMIT 1),
      ''
    )
  ) AS keywords,
  '/replies/' || rt.id AS url,
  rt.updated_at
FROM public.reply_threads rt
WHERE rt.workspace_id IS NOT NULL

UNION ALL

-- Notes
SELECT
  id,
  workspace_id,
  'note' AS type,
  LEFT(body, 100) AS title,
  body AS keywords,
  CASE 
    WHEN lead_id IS NOT NULL THEN '/leads/' || lead_id
    WHEN thread_id IS NOT NULL THEN '/replies/' || thread_id
    ELSE '/notes/' || id
  END AS url,
  updated_at
FROM public.notes
WHERE workspace_id IS NOT NULL

UNION ALL

-- Tasks
SELECT
  id,
  workspace_id,
  'task' AS type,
  title AS title,
  (COALESCE(title, '') || ' ' || COALESCE(description, '')) AS keywords,
  CASE
    WHEN thread_id IS NOT NULL THEN '/replies/' || thread_id
    WHEN lead_id IS NOT NULL THEN '/leads/' || lead_id
    ELSE '/tasks/' || id
  END AS url,
  updated_at
FROM public.tasks
WHERE workspace_id IS NOT NULL;

-- Create GIN index for full-text search
CREATE INDEX search_index_fts ON public.search_index
USING GIN (to_tsvector('english', keywords));

-- Create index on workspace_id for fast filtering
CREATE INDEX search_index_workspace_id_idx ON public.search_index(workspace_id);

-- Create index on type for categorization
CREATE INDEX search_index_type_idx ON public.search_index(type);

-- Create index on updated_at for sorting
CREATE INDEX search_index_updated_at_idx ON public.search_index(updated_at DESC);

-- Enable RLS on the materialized view
ALTER MATERIALIZED VIEW public.search_index OWNER TO postgres;

-- RLS Policy: Users can only see search results from their workspaces
-- Note: Materialized views don't support RLS directly, so we'll filter by workspace_id in queries
-- But we can create a function that respects workspace membership

-- Create helper function to check workspace membership
CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = auth.uid()
  );
$$;

-- Function to refresh the search index
CREATE OR REPLACE FUNCTION public.refresh_search_index()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.search_index;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.refresh_search_index() TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_search_index() TO service_role;

-- Initial refresh
REFRESH MATERIALIZED VIEW public.search_index;

-- Refresh triggers (lightweight - schedule refresh instead of immediate)
-- Note: For production, use pg_cron to refresh nightly instead of on every change

-- Create a flag table to track when refresh is needed (single row)
CREATE TABLE IF NOT EXISTS public.search_index_refresh_flag (
  id uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
  needs_refresh boolean DEFAULT true,
  last_refreshed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Insert initial row if it doesn't exist
INSERT INTO public.search_index_refresh_flag (id, needs_refresh, last_refreshed_at)
VALUES ('00000000-0000-0000-0000-000000000000'::uuid, false, now())
ON CONFLICT (id) DO NOTHING;

-- Function to mark refresh as needed
CREATE OR REPLACE FUNCTION public.mark_search_index_refresh_needed()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update the single row flag
  UPDATE public.search_index_refresh_flag
  SET needs_refresh = true
  WHERE id = '00000000-0000-0000-0000-000000000000'::uuid;
END;
$$;

-- Triggers to mark refresh needed on data changes
CREATE OR REPLACE FUNCTION public.trigger_search_index_refresh()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.mark_search_index_refresh_needed();
  RETURN NULL;
END;
$$;

-- Add triggers for each table
DROP TRIGGER IF EXISTS trg_refresh_search_on_leads ON public.leads;
CREATE TRIGGER trg_refresh_search_on_leads
  AFTER INSERT OR UPDATE OR DELETE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.trigger_search_index_refresh();

DROP TRIGGER IF EXISTS trg_refresh_search_on_campaigns ON public.campaigns;
CREATE TRIGGER trg_refresh_search_on_campaigns
  AFTER INSERT OR UPDATE OR DELETE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.trigger_search_index_refresh();

DROP TRIGGER IF EXISTS trg_refresh_search_on_reply_threads ON public.reply_threads;
CREATE TRIGGER trg_refresh_search_on_reply_threads
  AFTER INSERT OR UPDATE OR DELETE ON public.reply_threads
  FOR EACH ROW EXECUTE FUNCTION public.trigger_search_index_refresh();

DROP TRIGGER IF EXISTS trg_refresh_search_on_reply_messages ON public.reply_messages;
CREATE TRIGGER trg_refresh_search_on_reply_messages
  AFTER INSERT OR UPDATE OR DELETE ON public.reply_messages
  FOR EACH ROW EXECUTE FUNCTION public.trigger_search_index_refresh();

DROP TRIGGER IF EXISTS trg_refresh_search_on_notes ON public.notes;
CREATE TRIGGER trg_refresh_search_on_notes
  AFTER INSERT OR UPDATE OR DELETE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.trigger_search_index_refresh();

DROP TRIGGER IF EXISTS trg_refresh_search_on_tasks ON public.tasks;
CREATE TRIGGER trg_refresh_search_on_tasks
  AFTER INSERT OR UPDATE OR DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.trigger_search_index_refresh();

-- Function to check and refresh if needed (call this periodically or via cron)
CREATE OR REPLACE FUNCTION public.check_and_refresh_search_index()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  needs_refresh boolean;
BEGIN
  SELECT COALESCE(needs_refresh, false) INTO needs_refresh
  FROM public.search_index_refresh_flag
  WHERE id = '00000000-0000-0000-0000-000000000000'::uuid;

  IF needs_refresh THEN
    PERFORM public.refresh_search_index();
    UPDATE public.search_index_refresh_flag
    SET needs_refresh = false, last_refreshed_at = now()
    WHERE id = '00000000-0000-0000-0000-000000000000'::uuid;
  END IF;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.check_and_refresh_search_index() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_refresh_search_index() TO service_role;

-- Comment
COMMENT ON MATERIALIZED VIEW public.search_index IS 'Unified search index for leads, companies, campaigns, threads, notes, and tasks. Refresh with refresh_search_index() function or check_and_refresh_search_index() for conditional refresh.';
COMMENT ON FUNCTION public.check_and_refresh_search_index() IS 'Checks if refresh is needed and refreshes the search index. Call this periodically (e.g., every 5 minutes) or via pg_cron nightly.';

