-- =========================================================
-- Block 8990 — Simple Revenue & Reply Dashboard v1
-- (Jobs, Replies, Hot Leads per Campaign)
-- =========================================================

-- Add revenue columns to lead_auto_follow_up_stats table
ALTER TABLE IF EXISTS public.lead_auto_follow_up_stats
  ADD COLUMN IF NOT EXISTS potential_job_value numeric(12,2) DEFAULT NULL, -- homeowner job estimate
  ADD COLUMN IF NOT EXISTS closed_job_value numeric(12,2) DEFAULT NULL;    -- when stage = won

-- Create indexes for quick filtering by stage/status
CREATE INDEX IF NOT EXISTS idx_lead_auto_follow_up_stats_account_campaign_pipeline 
  ON public.lead_auto_follow_up_stats (account_id, campaign_id, pipeline_stage);

CREATE INDEX IF NOT EXISTS idx_lead_auto_follow_up_stats_account_campaign_lead_status 
  ON public.lead_auto_follow_up_stats (account_id, campaign_id, lead_status);

-- Function to copy potential_job_value to closed_job_value when pipeline_stage changes to 'won'
CREATE OR REPLACE FUNCTION public.update_closed_job_value_on_won()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- When pipeline stage changes to 'won', copy potential_job_value to closed_job_value if closed_job_value is null
  IF NEW.pipeline_stage = 'won'::pipeline_stage AND (OLD.pipeline_stage IS NULL OR OLD.pipeline_stage != 'won'::pipeline_stage) THEN
    IF NEW.closed_job_value IS NULL AND NEW.potential_job_value IS NOT NULL THEN
      NEW.closed_job_value := NEW.potential_job_value;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger to automatically update closed_job_value
DROP TRIGGER IF EXISTS trg_update_closed_job_value_on_won ON public.lead_auto_follow_up_stats;
CREATE TRIGGER trg_update_closed_job_value_on_won
  BEFORE UPDATE ON public.lead_auto_follow_up_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.update_closed_job_value_on_won();

-- Comments
COMMENT ON COLUMN public.lead_auto_follow_up_stats.potential_job_value IS 'Estimated job value set by owner (what this job might be worth)';
COMMENT ON COLUMN public.lead_auto_follow_up_stats.closed_job_value IS 'Actual booked amount when job is marked Won (copied from potential_job_value if not set)';
























































