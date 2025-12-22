-- ============================================================================
-- Block 21889 — SmartSend Roofing Missed Opportunity Detector v1
-- ============================================================================
-- Automatic System That Finds Lost Jobs BEFORE They're Lost — and Saves Them
--
-- This block creates the engine that detects when a job is about to slip away
-- and steps in BEFORE the homeowner chooses another roofer.
--
-- The system scans the pipeline 24/7, looking for danger signals:
-- - Hot job suddenly cooling
-- - Estimator inactivity
-- - Proposal overdue
-- - Missed follow-ups
-- - High-value job neglected
-- - Negative homeowner tone
-- - Sharp probability drop
-- - Job stuck in same pipeline stage
-- - Lead ghosted
-- - Insurance claim ignored
--
-- When it sees one → it alerts the owner AND triggers automated save actions.
-- ============================================================================

-- 1) ADD RISK FIELDS TO LEADS TABLE
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS risk_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_category text DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS last_risk_update timestamptz;

-- Add check constraint for risk_category
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_risk_category_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_risk_category_check
  CHECK (risk_category IN ('low', 'medium', 'high', 'critical'));

-- Add check constraint for risk_score
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_risk_score_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_risk_score_check
  CHECK (risk_score >= 0 AND risk_score <= 100);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_risk_score ON public.leads(risk_score DESC) WHERE risk_score > 0;
CREATE INDEX IF NOT EXISTS idx_leads_risk_category ON public.leads(risk_category) WHERE risk_category != 'low';
CREATE INDEX IF NOT EXISTS idx_leads_risk_category_score ON public.leads(risk_category, risk_score DESC);

-- 2) ADD HELPER COLUMNS FOR RISK CALCULATION (if they don't exist)
-- ============================================================================
-- These columns will be computed dynamically in the edge function,
-- but we add them here for potential future optimization

-- Track probability history for drop detection
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS previous_job_probability integer;

-- Track stage entry time for "stuck in stage" detection
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS stage_entered_at timestamptz;

-- Track last estimator activity
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_estimator_activity_at timestamptz;

-- Track proposal due date
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS proposal_due_at timestamptz;

-- Track last homeowner message time
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_homeowner_message_at timestamptz;

-- 3) CREATE FUNCTION TO UPDATE STAGE ENTRY TIME
-- ============================================================================
-- This trigger automatically tracks when a lead enters a new pipeline stage

CREATE OR REPLACE FUNCTION public.update_stage_entered_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- If status changed, update stage_entered_at
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.stage_entered_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_stage_entered_at ON public.leads;
CREATE TRIGGER trg_update_stage_entered_at
  BEFORE UPDATE OF status ON public.leads
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.update_stage_entered_at();

-- 4) COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON COLUMN public.leads.risk_score IS 'Block 21889: Risk score (0-100) indicating likelihood of losing this job';
COMMENT ON COLUMN public.leads.risk_category IS 'Block 21889: Risk category: low (0-19), medium (20-49), high (50-79), critical (80-100)';
COMMENT ON COLUMN public.leads.last_risk_update IS 'Block 21889: Timestamp of last risk score calculation';
COMMENT ON COLUMN public.leads.previous_job_probability IS 'Block 21889: Previous job probability for drop detection';
COMMENT ON COLUMN public.leads.stage_entered_at IS 'Block 21889: When lead entered current pipeline stage (for stuck detection)';
COMMENT ON COLUMN public.leads.last_estimator_activity_at IS 'Block 21889: Last time estimator performed any activity on this lead';
COMMENT ON COLUMN public.leads.proposal_due_at IS 'Block 21889: When proposal should be sent (for overdue detection)';
COMMENT ON COLUMN public.leads.last_homeowner_message_at IS 'Block 21889: Last time homeowner sent a message (for ghost detection)';









































