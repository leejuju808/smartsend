-- =========================================================
-- Block 21845 — SmartSend Roofing Pipeline Board v1
-- Kanban-Style "Lead → Estimate → Proposal → Won/Lost" Board Built for Roofers
-- =========================================================
-- This migration adds the roofing pipeline status column to leads table
-- and ensures all required columns exist for the pipeline board

-- 1) UPDATE STATUS COLUMN TO SUPPORT ROOFING PIPELINE STATUSES
-- Drop existing check constraint if it exists (we'll recreate it)
DO $$
BEGIN
  -- Remove old check constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'leads_status_check' 
    AND conrelid = 'public.leads'::regclass
  ) THEN
    ALTER TABLE public.leads DROP CONSTRAINT leads_status_check;
  END IF;
END $$;

-- Add status column if it doesn't exist
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'new_lead';

-- Update existing status values to match new roofing pipeline statuses
-- Map old statuses to new ones
UPDATE public.leads
SET status = CASE
  WHEN status IN ('new', 'queued') THEN 'new_lead'
  WHEN status = 'replied' THEN 'contacted'
  WHEN status IN ('won', 'booked') THEN 'won'
  WHEN status IN ('lost', 'unsubscribed', 'bounced') THEN 'lost'
  ELSE 'new_lead'
END
WHERE status NOT IN ('new_lead', 'contacted', 'estimate_booked', 'estimate_completed', 
                      'proposal_sent', 'decision_pending', 'won', 'lost');

-- Add check constraint for roofing pipeline statuses
ALTER TABLE public.leads
  ADD CONSTRAINT leads_status_check 
  CHECK (status IN (
    'new_lead',
    'contacted',
    'estimate_booked',
    'estimate_completed',
    'proposal_sent',
    'decision_pending',
    'won',
    'lost'
  ));

-- Set default status
ALTER TABLE public.leads
  ALTER COLUMN status SET DEFAULT 'new_lead';

-- 2) ENSURE REQUIRED COLUMNS EXIST FOR PIPELINE BOARD
-- Name (combine first_name + last_name if needed)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS name text;

-- Update name from first_name + last_name if name is null
UPDATE public.leads
SET name = TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, '')))
WHERE name IS NULL AND (first_name IS NOT NULL OR last_name IS NOT NULL);

-- Address fields
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS zip text;

-- Heat score and job probability (already exist from previous blocks, but ensure they exist)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS heat_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS job_probability integer DEFAULT 0;

-- Estimator assignment (already exists from block 21768, but ensure it exists)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS estimator_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Job value (already exists from previous blocks, but ensure it exists)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS estimated_job_value numeric(12,2);

-- Workspace ID (ensure it exists)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS workspace_id uuid;

-- 3) CREATE INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_status_workspace ON public.leads(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_estimator_status ON public.leads(estimator_id, status) WHERE estimator_id IS NOT NULL;

-- 4) ENSURE LEAD_TIMELINE_EVENTS TABLE EXISTS (from block 21727.10)
-- This is already created in 20250130000001_ai_rewrite_templates.sql
-- But we'll ensure it exists and add a helper function for status changes

-- Function to log status changes to timeline
CREATE OR REPLACE FUNCTION public.log_lead_status_change(
  p_lead_id uuid,
  p_old_status text,
  p_new_status text,
  p_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.lead_timeline_events (
    lead_id,
    event_type,
    event_subtype,
    message,
    metadata
  ) VALUES (
    p_lead_id,
    'status_changed',
    'pipeline_board_drag',
    CASE
      WHEN p_new_status = 'new_lead' THEN 'Lead moved to New Leads'
      WHEN p_new_status = 'contacted' THEN 'Lead moved to Contacted'
      WHEN p_new_status = 'estimate_booked' THEN 'Estimate booked'
      WHEN p_new_status = 'estimate_completed' THEN 'Estimate completed'
      WHEN p_new_status = 'proposal_sent' THEN 'Proposal sent'
      WHEN p_new_status = 'decision_pending' THEN 'Waiting for decision'
      WHEN p_new_status = 'won' THEN 'Job won! 🎉'
      WHEN p_new_status = 'lost' THEN 'Job lost'
      ELSE 'Status changed'
    END,
    jsonb_build_object(
      'old_status', p_old_status,
      'new_status', p_new_status,
      'changed_by', p_user_id,
      'changed_at', now()
    )
  );
END;
$$;

COMMENT ON FUNCTION public.log_lead_status_change IS 'Block 21845: Logs status changes to lead timeline when dragging leads on pipeline board';

-- 5) CREATE TRIGGER TO AUTO-LOG STATUS CHANGES
CREATE OR REPLACE FUNCTION public.trigger_log_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.log_lead_status_change(
      NEW.id,
      OLD.status,
      NEW.status,
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trg_log_lead_status_change ON public.leads;
CREATE TRIGGER trg_log_lead_status_change
  AFTER UPDATE OF status ON public.leads
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.trigger_log_status_change();

-- 6) COMMENTS FOR DOCUMENTATION
COMMENT ON COLUMN public.leads.status IS 'Block 21845: Roofing pipeline status: new_lead, contacted, estimate_booked, estimate_completed, proposal_sent, decision_pending, won, lost';
COMMENT ON COLUMN public.leads.name IS 'Block 21845: Homeowner full name for pipeline board display';
COMMENT ON COLUMN public.leads.city IS 'Block 21845: City for pipeline board display';
COMMENT ON COLUMN public.leads.heat_score IS 'Block 21845: Lead heat score (0-100) for pipeline board';
COMMENT ON COLUMN public.leads.job_probability IS 'Block 21845: Job win probability (0-100) for pipeline board';
COMMENT ON COLUMN public.leads.estimator_id IS 'Block 21845: Assigned estimator for pipeline board';
COMMENT ON COLUMN public.leads.estimated_job_value IS 'Block 21845: Estimated job value for pipeline board revenue display';









































