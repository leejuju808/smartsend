-- Block 209 — Lead Merge View v1
-- RPC Functions for Merging Leads (Tags, Notes, Timeline, Threads)

-- Move tags from loser to winner
CREATE OR REPLACE FUNCTION merge_tags(winner uuid, loser uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.lead_tag_links
  SET lead_id = winner
  WHERE lead_id = loser;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Move notes from loser to winner
CREATE OR REPLACE FUNCTION merge_notes(winner uuid, loser uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.lead_notes
  SET lead_id = winner
  WHERE lead_id = loser;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Move timeline events from loser to winner
CREATE OR REPLACE FUNCTION merge_timeline(winner uuid, loser uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.lead_timeline_events
  SET lead_id = winner
  WHERE lead_id = loser;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Move reply threads from loser to winner
CREATE OR REPLACE FUNCTION merge_threads(winner uuid, loser uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.reply_threads
  SET lead_id = winner
  WHERE lead_id = loser;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION merge_tags(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION merge_notes(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION merge_timeline(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION merge_threads(uuid, uuid) TO authenticated;










