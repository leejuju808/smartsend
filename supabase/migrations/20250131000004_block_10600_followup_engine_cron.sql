-- Block 10600 — Follow-Up Engine CRON Setup
-- Creates a pg_cron job to run the follow-up engine every hour

-- Note: This requires the pg_cron extension to be enabled
-- If pg_cron is not available, use Supabase Edge Functions scheduler instead

DO $$
BEGIN
  -- Check if pg_cron extension exists
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing job if it exists
    PERFORM cron.unschedule('followup-engine-hourly');
    
    -- Schedule the follow-up engine to run every hour
    PERFORM cron.schedule(
      'followup-engine-hourly',
      '0 * * * *', -- Every hour at minute 0
      $$
      SELECT public.execute_follow_up_engine();
      $$
    );
    
    RAISE NOTICE 'Follow-up engine CRON job scheduled successfully';
  ELSE
    RAISE NOTICE 'pg_cron extension not available. Use Supabase Edge Functions scheduler instead.';
  END IF;
END $$;





























































