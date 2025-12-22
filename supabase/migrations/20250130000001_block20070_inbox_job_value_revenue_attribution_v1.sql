-- =========================================================
-- Block 20070 — SmartSend Inbox Job Value + Revenue Attribution v1
-- (Turn every reply into a dollar amount, not just "a lead")
-- =========================================================

-- ============================================================================
-- Add Job Value & Revenue Fields to inbox_threads
-- ============================================================================
-- Track estimated value when the roofer quotes it, and actual value when the job is won

ALTER TABLE IF EXISTS public.inbox_threads
  ADD COLUMN IF NOT EXISTS estimated_job_value INTEGER,          -- what they think the job is worth ($)
  ADD COLUMN IF NOT EXISTS actual_job_value INTEGER,             -- final contract amount ($)
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD',          -- for later, default USD
  ADD COLUMN IF NOT EXISTS close_date DATE,                      -- when job was marked won
  ADD COLUMN IF NOT EXISTS source_campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,  -- link to campaigns table
  ADD COLUMN IF NOT EXISTS is_insurance_claim BOOLEAN,           -- storm / hail claims
  ADD COLUMN IF NOT EXISTS insurance_carrier TEXT;               -- e.g. State Farm, Allstate

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inbox_threads_estimated_job_value ON public.inbox_threads(estimated_job_value) WHERE estimated_job_value IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_threads_actual_job_value ON public.inbox_threads(actual_job_value) WHERE actual_job_value IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_threads_close_date ON public.inbox_threads(close_date) WHERE close_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_threads_insurance_claim ON public.inbox_threads(is_insurance_claim) WHERE is_insurance_claim = true;
CREATE INDEX IF NOT EXISTS idx_inbox_threads_source_campaign ON public.inbox_threads(source_campaign_id) WHERE source_campaign_id IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN public.inbox_threads.estimated_job_value IS 'Estimated job value when roofer quotes it ($)';
COMMENT ON COLUMN public.inbox_threads.actual_job_value IS 'Final contract amount when job is won ($)';
COMMENT ON COLUMN public.inbox_threads.currency IS 'Currency code (default USD)';
COMMENT ON COLUMN public.inbox_threads.close_date IS 'Date when job was marked won';
COMMENT ON COLUMN public.inbox_threads.source_campaign_id IS 'Link to campaigns table for revenue attribution';
COMMENT ON COLUMN public.inbox_threads.is_insurance_claim IS 'Whether this is a storm/hail insurance claim';
COMMENT ON COLUMN public.inbox_threads.insurance_carrier IS 'Insurance carrier name (e.g. State Farm, Allstate)';

















































