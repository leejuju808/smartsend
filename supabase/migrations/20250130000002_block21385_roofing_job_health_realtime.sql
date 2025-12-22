-- =========================================================
-- Block 21385 — SmartSend Roofing Job Health: Realtime Auto-Refresh
-- (Enable realtime subscriptions for roofing_job_health_scores table)
-- =========================================================

-- Add roofing_job_health_scores to the supabase_realtime publication
-- This enables Supabase Realtime to emit events whenever a health score row is inserted/updated
ALTER PUBLICATION supabase_realtime
ADD TABLE public.roofing_job_health_scores;

-- Note: If the table is already in the publication, this will be a no-op.
-- This allows clients to subscribe to changes and auto-refresh the dashboard and pipeline.















































