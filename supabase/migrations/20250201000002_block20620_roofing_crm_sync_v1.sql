-- =========================================================
-- Block 20620 — SmartSend Roofing CRM Sync v1
-- (Auto-Moves Lead → Claim → Job → Install → Completed)
-- =========================================================
--
-- This block makes SmartSend feel less like "a smart inbox" and more like 
-- a mini roofing CRM that runs itself.
--
-- Up to now we built:
-- 20360 – Insurance Brain
-- 20380 – Attachment Parser
-- 20400 – Install-Ready Playbook
-- 20430 – Hot Lead Priority
-- 20460 – Claim Journey Map
-- 20490 – AI Estimator
-- 20520 – Proposal Builder
-- 20560 – Proposal Sender
-- 20590 – Adjuster Engine
--
-- 20620 is the glue that keeps the pipeline updated automatically so roofers 
-- don't have to drag cards around in a CRM all day.
-- =========================================================

-- ============================================================================
-- PART 1 — Create Pipeline Stage Enum
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE roofing_job_stage AS ENUM (
    'NEW_LEAD',
    'CLAIM_FILED',
    'ADJUSTER_SCHEDULED',
    'CLAIM_PENDING',
    'CLAIM_APPROVED',
    'INSTALL_READY',
    'SCHEDULED_INSTALL',
    'IN_PROGRESS',
    'COMPLETED',
    'LOST',
    'NOT_A_FIT'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE roofing_job_stage IS 'Pipeline stages for roofing jobs: NEW_LEAD → CLAIM_FILED → ADJUSTER_SCHEDULED → CLAIM_PENDING → CLAIM_APPROVED → INSTALL_READY → SCHEDULED_INSTALL → IN_PROGRESS → COMPLETED (or LOST/NOT_A_FIT)';

-- ============================================================================
-- PART 2 — Create roofing_jobs Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.roofing_jobs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Link to lead/thread/contact (flexible linking)
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  
  -- Primary contact info
  primary_email_id uuid, -- First contact email ID
  homeowner_name text,
  address text,
  
  -- Insurance info
  carrier text,
  claim_number text,
  
  -- Pipeline state
  current_stage roofing_job_stage NOT NULL DEFAULT 'NEW_LEAD',
  
  -- Scoring and value
  hot_lead_score integer CHECK (hot_lead_score >= 0 AND hot_lead_score <= 100),
  projected_job_value numeric(12,2), -- RCV or AI estimate
  
  -- Status tracking
  status_reason text, -- e.g., "awaiting adjuster", "homeowner ghosted"
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  stage_changed_at timestamptz NOT NULL DEFAULT now(),
  
  -- Ensure at least one link exists
  CONSTRAINT roofing_job_has_link CHECK (
    lead_id IS NOT NULL OR thread_id IS NOT NULL OR contact_id IS NOT NULL
  )
);

-- Indexes for roofing_jobs queries
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_lead ON public.roofing_jobs(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_thread ON public.roofing_jobs(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_contact ON public.roofing_jobs(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_campaign ON public.roofing_jobs(campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_stage ON public.roofing_jobs(current_stage);
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_stage_campaign ON public.roofing_jobs(campaign_id, current_stage);
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_hot_score ON public.roofing_jobs(hot_lead_score DESC NULLS LAST) WHERE hot_lead_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_value ON public.roofing_jobs(projected_job_value DESC NULLS LAST) WHERE projected_job_value IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_updated ON public.roofing_jobs(updated_at DESC);

-- Unique constraint: one job per thread (or lead/contact)
CREATE UNIQUE INDEX IF NOT EXISTS idx_roofing_jobs_thread_unique ON public.roofing_jobs(thread_id) WHERE thread_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_roofing_jobs_lead_unique ON public.roofing_jobs(lead_id) WHERE lead_id IS NOT NULL AND thread_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_roofing_jobs_contact_unique ON public.roofing_jobs(contact_id) WHERE contact_id IS NOT NULL AND thread_id IS NULL AND lead_id IS NULL;

COMMENT ON TABLE public.roofing_jobs IS 'Roofing job pipeline - one per property/claim. Auto-updated by SmartSend based on emails, claim status, proposals, and internal actions';
COMMENT ON COLUMN public.roofing_jobs.current_stage IS 'Current pipeline stage - auto-updated by triggers';
COMMENT ON COLUMN public.roofing_jobs.hot_lead_score IS 'Hot lead score from block 20430 (0-100)';
COMMENT ON COLUMN public.roofing_jobs.projected_job_value IS 'RCV total or AI estimate - the money value of this job';
COMMENT ON COLUMN public.roofing_jobs.status_reason IS 'Human-readable reason for current status (e.g., "awaiting adjuster", "homeowner ghosted")';

-- ============================================================================
-- PART 3 — Create crm_sync_status Table (Future External CRM Sync)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.crm_sync_status (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Link to roofing job
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  
  -- External CRM info
  external_system text NOT NULL CHECK (external_system IN ('jobnimbus', 'hubspot', 'salesforce', 'other')),
  external_id text, -- ID in external system
  
  -- Sync status
  sync_status text NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed', 'disabled')),
  sync_error text, -- Error message if sync failed
  
  -- Timestamps
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Unique: one sync record per job per external system
  UNIQUE(job_id, external_system)
);

CREATE INDEX IF NOT EXISTS idx_crm_sync_job ON public.crm_sync_status(job_id);
CREATE INDEX IF NOT EXISTS idx_crm_sync_external ON public.crm_sync_status(external_system, sync_status);
CREATE INDEX IF NOT EXISTS idx_crm_sync_pending ON public.crm_sync_status(sync_status, last_synced_at) WHERE sync_status = 'pending';

COMMENT ON TABLE public.crm_sync_status IS 'Tracks sync status with external CRMs (JobNimbus, HubSpot, Salesforce). Not implemented yet - structure ready for v2/v3';
COMMENT ON COLUMN public.crm_sync_status.external_system IS 'External CRM system name';
COMMENT ON COLUMN public.crm_sync_status.sync_status IS 'Sync status: pending, synced, failed, disabled';

-- ============================================================================
-- PART 4 — Function to Get or Create Roofing Job
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_or_create_roofing_job(
  p_thread_id uuid DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id uuid;
  v_thread record;
  v_lead record;
  v_contact record;
  v_homeowner_name text;
  v_address text;
  v_carrier text;
  v_claim_number text;
  v_hot_lead_score integer;
  v_projected_value numeric(12,2);
BEGIN
  -- Try to find existing job
  IF p_thread_id IS NOT NULL THEN
    SELECT id INTO v_job_id FROM public.roofing_jobs WHERE thread_id = p_thread_id;
  ELSIF p_lead_id IS NOT NULL THEN
    SELECT id INTO v_job_id FROM public.roofing_jobs WHERE lead_id = p_lead_id;
  ELSIF p_contact_id IS NOT NULL THEN
    SELECT id INTO v_job_id FROM public.roofing_jobs WHERE contact_id = p_contact_id;
  END IF;
  
  -- If job exists, return it
  IF v_job_id IS NOT NULL THEN
    RETURN v_job_id;
  END IF;
  
  -- Get data from thread if available
  IF p_thread_id IS NOT NULL THEN
    SELECT 
      t.*,
      c.name as contact_name,
      c.address as contact_address,
      l.name as lead_name,
      l.address as lead_address
    INTO v_thread
    FROM public.inbox_threads t
    LEFT JOIN public.contacts c ON t.contact_id = c.id
    LEFT JOIN public.leads l ON t.lead_id = l.id
    WHERE t.id = p_thread_id;
    
    IF FOUND THEN
      v_homeowner_name := COALESCE(v_thread.contact_name, v_thread.lead_name);
      v_address := COALESCE(v_thread.contact_address, v_thread.lead_address);
      v_carrier := v_thread.insurance_carrier;
      v_claim_number := v_thread.insurance_analysis_metadata->>'claim_number';
      v_hot_lead_score := v_thread.hot_lead_score;
      v_projected_value := COALESCE(
        (v_thread.claim_financials->>'rcv_total')::numeric,
        v_thread.thread_estimated_value
      );
      p_campaign_id := COALESCE(p_campaign_id, v_thread.campaign_id);
    END IF;
  END IF;
  
  -- Get data from lead if available
  IF p_lead_id IS NOT NULL AND v_homeowner_name IS NULL THEN
    SELECT name, address INTO v_homeowner_name, v_address
    FROM public.leads WHERE id = p_lead_id;
  END IF;
  
  -- Get data from contact if available
  IF p_contact_id IS NOT NULL AND v_homeowner_name IS NULL THEN
    SELECT name, address INTO v_homeowner_name, v_address
    FROM public.contacts WHERE id = p_contact_id;
  END IF;
  
  -- Create new job
  INSERT INTO public.roofing_jobs (
    lead_id,
    thread_id,
    contact_id,
    campaign_id,
    homeowner_name,
    address,
    carrier,
    claim_number,
    hot_lead_score,
    projected_job_value,
    current_stage,
    status_reason
  ) VALUES (
    p_lead_id,
    p_thread_id,
    p_contact_id,
    p_campaign_id,
    v_homeowner_name,
    v_address,
    v_carrier,
    v_claim_number,
    v_hot_lead_score,
    v_projected_value,
    'NEW_LEAD',
    'New lead detected'
  )
  RETURNING id INTO v_job_id;
  
  RETURN v_job_id;
END;
$$;

COMMENT ON FUNCTION public.get_or_create_roofing_job IS 'Gets existing roofing job or creates a new one. Auto-populates from thread/lead/contact data';

-- ============================================================================
-- PART 5 — Function to Update Job Stage
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_roofing_job_stage(
  p_job_id uuid,
  p_new_stage roofing_job_stage,
  p_status_reason text DEFAULT NULL,
  p_create_timeline_event boolean DEFAULT true
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_stage roofing_job_stage;
  v_job record;
BEGIN
  -- Get current job
  SELECT * INTO v_job FROM public.roofing_jobs WHERE id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  v_old_stage := v_job.current_stage;
  
  -- Don't update if stage hasn't changed
  IF v_old_stage = p_new_stage THEN
    RETURN true;
  END IF;
  
  -- Update stage
  UPDATE public.roofing_jobs
  SET 
    current_stage = p_new_stage,
    status_reason = COALESCE(p_status_reason, v_job.status_reason),
    stage_changed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_job_id;
  
  -- Create timeline event if requested
  IF p_create_timeline_event THEN
    PERFORM public.create_timeline_event(
      p_event_type := 'MANUAL_STAGE_UPDATE',
      p_event_payload := jsonb_build_object(
        'old_stage', v_old_stage,
        'new_stage', p_new_stage,
        'status_reason', p_status_reason
      ),
      p_thread_id := v_job.thread_id,
      p_lead_id := v_job.lead_id,
      p_contact_id := v_job.contact_id,
      p_detected_from := 'trigger'
    );
  END IF;
  
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.update_roofing_job_stage IS 'Updates roofing job stage and creates timeline event';

-- ============================================================================
-- PART 6 — Auto-Stage Movement Triggers
-- ============================================================================

-- Trigger: Auto-create job when new email with roofing keywords arrives
CREATE OR REPLACE FUNCTION public.trigger_create_job_on_new_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id uuid;
  v_body_lower text;
BEGIN
  -- Only process inbound messages
  IF NEW.direction != 'in' THEN
    RETURN NEW;
  END IF;
  
  -- Check for roofing keywords
  v_body_lower := lower(COALESCE(NEW.body, ''));
  
  IF v_body_lower LIKE ANY(ARRAY['%hail damage%', '%roof leak%', '%storm damage%', '%roof replacement%', '%roof repair%', '%insurance claim%']) THEN
    -- Get or create job
    v_job_id := public.get_or_create_roofing_job(
      p_thread_id := NEW.thread_id
    );
    
    -- Create timeline event
    PERFORM public.create_timeline_event(
      p_event_type := 'STORM_EVENT',
      p_event_payload := jsonb_build_object('detected_from', 'email', 'keywords', 'hail/storm/roof damage'),
      p_thread_id := NEW.thread_id,
      p_email_id := NEW.id,
      p_detected_from := 'email'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_job_on_new_lead ON public.inbox_messages;
CREATE TRIGGER trg_create_job_on_new_lead
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  WHEN (NEW.direction = 'in')
  EXECUTE FUNCTION public.trigger_create_job_on_new_lead();

-- Trigger: Auto-update stage when claim status changes (from block 20360)
CREATE OR REPLACE FUNCTION public.trigger_update_job_stage_on_claim_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id uuid;
  v_new_stage roofing_job_stage;
  v_status_reason text;
BEGIN
  -- Only process if claim status changed
  IF OLD.insurance_claim_status IS NOT DISTINCT FROM NEW.insurance_claim_status THEN
    RETURN NEW;
  END IF;
  
  -- Get or create job
  v_job_id := public.get_or_create_roofing_job(p_thread_id := NEW.id);
  
  -- Map claim status to stage
  CASE NEW.insurance_claim_status
    WHEN 'claim_filed_awaiting_adjuster' THEN
      v_new_stage := 'CLAIM_FILED';
      v_status_reason := 'Claim filed, awaiting adjuster';
    WHEN 'adjuster_visit_scheduled' THEN
      v_new_stage := 'ADJUSTER_SCHEDULED';
      v_status_reason := 'Adjuster visit scheduled';
    WHEN 'under_review' THEN
      v_new_stage := 'CLAIM_PENDING';
      v_status_reason := 'Claim under review';
    WHEN 'approved', 'approved_acv_only' THEN
      v_new_stage := 'CLAIM_APPROVED';
      v_status_reason := format('Claim approved (%s)', NEW.insurance_payout_type);
    WHEN 'denied' THEN
      v_new_stage := 'LOST';
      v_status_reason := 'Claim denied';
    ELSE
      -- No stage change needed
      RETURN NEW;
  END CASE;
  
  -- Update job stage
  PERFORM public.update_roofing_job_stage(
    p_job_id := v_job_id,
    p_new_stage := v_new_stage,
    p_status_reason := v_status_reason,
    p_create_timeline_event := false -- Timeline event already created by block 20460
  );
  
  -- Update job value and hot lead score
  UPDATE public.roofing_jobs
  SET 
    projected_job_value := COALESCE(
      (NEW.claim_financials->>'rcv_total')::numeric,
      NEW.thread_estimated_value,
      projected_job_value
    ),
    hot_lead_score := COALESCE(NEW.hot_lead_score, hot_lead_score),
    carrier := COALESCE(NEW.insurance_carrier, carrier),
    claim_number := COALESCE(
      NEW.insurance_analysis_metadata->>'claim_number',
      claim_number
    ),
    updated_at := NOW()
  WHERE id = v_job_id;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_job_stage_on_claim_status ON public.inbox_threads;
CREATE TRIGGER trg_update_job_stage_on_claim_status
  AFTER UPDATE ON public.inbox_threads
  FOR EACH ROW
  WHEN (
    OLD.insurance_claim_status IS DISTINCT FROM NEW.insurance_claim_status OR
    OLD.insurance_install_ready IS DISTINCT FROM NEW.insurance_install_ready OR
    OLD.claim_financials IS DISTINCT FROM NEW.claim_financials OR
    OLD.hot_lead_score IS DISTINCT FROM NEW.hot_lead_score
  )
  EXECUTE FUNCTION public.trigger_update_job_stage_on_claim_status();

-- Trigger: Auto-update stage when install-ready becomes true (from block 20400)
CREATE OR REPLACE FUNCTION public.trigger_update_job_stage_on_install_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id uuid;
BEGIN
  -- Only process if install_ready just became true
  IF NEW.insurance_install_ready = true AND 
     (OLD.insurance_install_ready IS NULL OR OLD.insurance_install_ready = false) THEN
    
    -- Get or create job
    v_job_id := public.get_or_create_roofing_job(p_thread_id := NEW.id);
    
    -- Update to INSTALL_READY stage
    PERFORM public.update_roofing_job_stage(
      p_job_id := v_job_id,
      p_new_stage := 'INSTALL_READY',
      p_status_reason := 'Install-ready: claim approved, deductible known, scope parsed',
      p_create_timeline_event := false -- Timeline event already created
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_job_stage_on_install_ready ON public.inbox_threads;
CREATE TRIGGER trg_update_job_stage_on_install_ready
  AFTER UPDATE ON public.inbox_threads
  FOR EACH ROW
  WHEN (NEW.insurance_install_ready = true AND (OLD.insurance_install_ready IS NULL OR OLD.insurance_install_ready = false))
  EXECUTE FUNCTION public.trigger_update_job_stage_on_install_ready();

COMMENT ON FUNCTION public.trigger_create_job_on_new_lead IS 'Auto-creates roofing job when new email with roofing keywords arrives';
COMMENT ON FUNCTION public.trigger_update_job_stage_on_claim_status IS 'Auto-updates job stage when claim status changes (from block 20360)';
COMMENT ON FUNCTION public.trigger_update_job_stage_on_install_ready IS 'Auto-updates job stage to INSTALL_READY when install-ready flag becomes true (from block 20400)';

-- Trigger: Auto-update stage when proposal is sent (from block 20560)
CREATE OR REPLACE FUNCTION public.trigger_update_job_stage_on_proposal_sent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id uuid;
  v_proposal record;
BEGIN
  -- Only process when proposal email status changes to 'sent'
  IF OLD.status != 'sent' AND NEW.status = 'sent' THEN
    -- Get proposal
    SELECT * INTO v_proposal FROM public.proposals WHERE id = NEW.proposal_id;
    
    IF FOUND THEN
      -- Get or create job
      v_job_id := public.get_or_create_roofing_job(p_thread_id := v_proposal.thread_id);
      
      -- Update job (proposal sent doesn't change stage, but we track it)
      -- Stage stays at CLAIM_APPROVED or INSTALL_READY
      UPDATE public.roofing_jobs
      SET 
        status_reason := COALESCE(status_reason, '') || ' | Proposal sent',
        updated_at := NOW()
      WHERE id = v_job_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_job_stage_on_proposal_sent ON public.proposal_email_sends;
CREATE TRIGGER trg_update_job_stage_on_proposal_sent
  AFTER UPDATE ON public.proposal_email_sends
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'sent')
  EXECUTE FUNCTION public.trigger_update_job_stage_on_proposal_sent();

-- Trigger: Auto-update stage when proposal is approved/won (from block 20520)
CREATE OR REPLACE FUNCTION public.trigger_update_job_stage_on_proposal_approved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id uuid;
  v_new_stage roofing_job_stage;
BEGIN
  -- Only process when proposal status changes to 'approved' or 'won'
  IF (OLD.status IS DISTINCT FROM NEW.status) AND 
     (NEW.status IN ('approved', 'won')) THEN
    
    -- Get or create job
    v_job_id := public.get_or_create_roofing_job(p_thread_id := NEW.thread_id);
    
    -- Move to SCHEDULED_INSTALL if approved, or IN_PROGRESS if won
    IF NEW.status = 'won' THEN
      v_new_stage := 'IN_PROGRESS';
    ELSE
      v_new_stage := 'SCHEDULED_INSTALL';
    END IF;
    
    -- Update job stage
    PERFORM public.update_roofing_job_stage(
      p_job_id := v_job_id,
      p_new_stage := v_new_stage,
      p_status_reason := format('Proposal %s', NEW.status),
      p_create_timeline_event := true
    );
  END IF;
  
  -- Handle rejected/lost proposals
  IF (OLD.status IS DISTINCT FROM NEW.status) AND 
     (NEW.status IN ('rejected', 'lost')) THEN
    
    -- Get or create job if not already done above
    IF v_job_id IS NULL THEN
      v_job_id := public.get_or_create_roofing_job(p_thread_id := NEW.thread_id);
    END IF;
    
    PERFORM public.update_roofing_job_stage(
      p_job_id := v_job_id,
      p_new_stage := 'LOST',
      p_status_reason := format('Proposal %s', NEW.status),
      p_create_timeline_event := true
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_job_stage_on_proposal_approved ON public.proposals;
CREATE TRIGGER trg_update_job_stage_on_proposal_approved
  AFTER UPDATE ON public.proposals
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.trigger_update_job_stage_on_proposal_approved();

COMMENT ON FUNCTION public.trigger_update_job_stage_on_proposal_sent IS 'Tracks when proposal is sent (from block 20560)';
COMMENT ON FUNCTION public.trigger_update_job_stage_on_proposal_approved IS 'Auto-updates job stage when proposal is approved/won/rejected (from block 20520)';

-- ============================================================================
-- PART 7 — Manual Stage Transition Functions
-- ============================================================================

-- Function: Manually mark job as SCHEDULED_INSTALL
CREATE OR REPLACE FUNCTION public.mark_job_scheduled_install(
  p_job_id uuid,
  p_scheduled_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job record;
BEGIN
  -- Get job details
  SELECT * INTO v_job FROM public.roofing_jobs WHERE id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  PERFORM public.update_roofing_job_stage(
    p_job_id := p_job_id,
    p_new_stage := 'SCHEDULED_INSTALL',
    p_status_reason := COALESCE(
      format('Install scheduled for %s', p_scheduled_date),
      'Install scheduled',
      p_notes
    ),
    p_create_timeline_event := true
  );
  
  -- Create timeline event with scheduled date
  IF p_scheduled_date IS NOT NULL THEN
    PERFORM public.create_timeline_event(
      p_event_type := 'MANUAL_STAGE_UPDATE',
      p_event_payload := jsonb_build_object(
        'stage', 'SCHEDULED_INSTALL',
        'scheduled_date', p_scheduled_date,
        'notes', p_notes
      ),
      p_event_date := p_scheduled_date,
      p_thread_id := v_job.thread_id,
      p_lead_id := v_job.lead_id,
      p_contact_id := v_job.contact_id,
      p_detected_from := 'manual'
    );
  END IF;
  
  RETURN true;
END;
$$;

-- Function: Manually mark job as IN_PROGRESS
CREATE OR REPLACE FUNCTION public.mark_job_in_progress(
  p_job_id uuid,
  p_start_date date DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.update_roofing_job_stage(
    p_job_id := p_job_id,
    p_new_stage := 'IN_PROGRESS',
    p_status_reason := COALESCE(
      format('Job started on %s', p_start_date),
      'Job started',
      p_notes
    ),
    p_create_timeline_event := true
  );
  
  RETURN true;
END;
$$;

-- Function: Manually mark job as COMPLETED
CREATE OR REPLACE FUNCTION public.mark_job_completed(
  p_job_id uuid,
  p_completion_date date DEFAULT NULL,
  p_final_payment_received boolean DEFAULT false,
  p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.update_roofing_job_stage(
    p_job_id := p_job_id,
    p_new_stage := 'COMPLETED',
    p_status_reason := COALESCE(
      format('Job completed on %s%s', 
        p_completion_date,
        CASE WHEN p_final_payment_received THEN ' - Final payment received' ELSE '' END
      ),
      'Job completed',
      p_notes
    ),
    p_create_timeline_event := true
  );
  
  RETURN true;
END;
$$;

-- Function: Manually mark job as LOST
CREATE OR REPLACE FUNCTION public.mark_job_lost(
  p_job_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.update_roofing_job_stage(
    p_job_id := p_job_id,
    p_new_stage := 'LOST',
    p_status_reason := COALESCE(p_reason, 'Marked as lost'),
    p_create_timeline_event := true
  );
  
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.mark_job_scheduled_install IS 'Manually marks job as SCHEDULED_INSTALL (for calendar integration or manual scheduling)';
COMMENT ON FUNCTION public.mark_job_in_progress IS 'Manually marks job as IN_PROGRESS (when work begins)';
COMMENT ON FUNCTION public.mark_job_completed IS 'Manually marks job as COMPLETED (when work is done and/or final payment received)';
COMMENT ON FUNCTION public.mark_job_lost IS 'Manually marks job as LOST (when homeowner goes with another contractor or cancels)';

-- ============================================================================
-- PART 8 — Pipeline Views for UI
-- ============================================================================

-- View: Pipeline view with all job details
CREATE OR REPLACE VIEW public.roofing_jobs_pipeline_view AS
SELECT 
  rj.id as job_id,
  rj.lead_id,
  rj.thread_id,
  rj.contact_id,
  rj.campaign_id,
  rj.homeowner_name,
  rj.address,
  rj.carrier,
  rj.claim_number,
  rj.current_stage,
  rj.hot_lead_score,
  rj.projected_job_value,
  rj.status_reason,
  rj.stage_changed_at,
  rj.updated_at,
  rj.created_at,
  -- Get last activity from thread
  it.last_message_at,
  -- Get contact email
  c.email as contact_email,
  -- Get lead email
  l.email as lead_email
FROM public.roofing_jobs rj
LEFT JOIN public.inbox_threads it ON rj.thread_id = it.id
LEFT JOIN public.contacts c ON rj.contact_id = c.id
LEFT JOIN public.leads l ON rj.lead_id = l.id;

COMMENT ON VIEW public.roofing_jobs_pipeline_view IS 'Complete pipeline view with all job details for UI display';

-- View: Jobs by stage (for pipeline board)
CREATE OR REPLACE VIEW public.roofing_jobs_by_stage AS
SELECT 
  current_stage,
  COUNT(*) as job_count,
  COALESCE(SUM(projected_job_value), 0) as total_value,
  COALESCE(AVG(hot_lead_score), 0) as avg_hot_score,
  MAX(updated_at) as last_activity
FROM public.roofing_jobs
GROUP BY current_stage
ORDER BY 
  CASE current_stage
    WHEN 'NEW_LEAD' THEN 1
    WHEN 'CLAIM_FILED' THEN 2
    WHEN 'ADJUSTER_SCHEDULED' THEN 3
    WHEN 'CLAIM_PENDING' THEN 4
    WHEN 'CLAIM_APPROVED' THEN 5
    WHEN 'INSTALL_READY' THEN 6
    WHEN 'SCHEDULED_INSTALL' THEN 7
    WHEN 'IN_PROGRESS' THEN 8
    WHEN 'COMPLETED' THEN 9
    WHEN 'LOST' THEN 10
    WHEN 'NOT_A_FIT' THEN 11
  END;

COMMENT ON VIEW public.roofing_jobs_by_stage IS 'Aggregated view of jobs by stage for pipeline metrics';

-- ============================================================================
-- PART 8 — Smart Actions Function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_smart_actions_for_stage(
  p_job_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_job record;
  v_actions jsonb;
BEGIN
  -- Get job
  SELECT * INTO v_job FROM public.roofing_jobs WHERE id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN '[]'::jsonb;
  END IF;
  
  -- Generate smart actions based on stage
  CASE v_job.current_stage
    WHEN 'NEW_LEAD' THEN
      v_actions := jsonb_build_array(
        jsonb_build_object(
          'action', 'Call for inspection',
          'priority', 'HIGH',
          'description', 'Schedule initial roof inspection'
        ),
        jsonb_build_object(
          'action', 'Send intro email',
          'priority', 'MEDIUM',
          'description', 'Send introduction email with company info'
        )
      );
    WHEN 'CLAIM_FILED' THEN
      v_actions := jsonb_build_array(
        jsonb_build_object(
          'action', 'Prep adjuster visit email',
          'priority', 'HIGH',
          'description', 'Send email preparing homeowner for adjuster visit'
        )
      );
    WHEN 'ADJUSTER_SCHEDULED' THEN
      v_actions := jsonb_build_array(
        jsonb_build_object(
          'action', 'Follow up with homeowner',
          'priority', 'MEDIUM',
          'description', 'Check in about adjuster visit'
        )
      );
    WHEN 'CLAIM_PENDING' THEN
      v_actions := jsonb_build_array(
        jsonb_build_object(
          'action', 'Follow up with adjuster',
          'priority', 'MEDIUM',
          'description', 'Contact adjuster about claim status'
        )
      );
    WHEN 'CLAIM_APPROVED' THEN
      v_actions := jsonb_build_array(
        jsonb_build_object(
          'action', 'Generate estimate/proposal',
          'priority', 'HIGH',
          'description', 'Create proposal using AI Estimator (block 20490)'
        )
      );
    WHEN 'INSTALL_READY' THEN
      v_actions := jsonb_build_array(
        jsonb_build_object(
          'action', 'Call now',
          'priority', 'HIGH',
          'description', 'Call homeowner immediately - install ready'
        ),
        jsonb_build_object(
          'action', 'Send scheduling email',
          'priority', 'HIGH',
          'description', 'Send email to schedule installation'
        )
      );
    WHEN 'SCHEDULED_INSTALL' THEN
      v_actions := jsonb_build_array(
        jsonb_build_object(
          'action', 'Confirm materials & crew',
          'priority', 'HIGH',
          'description', 'Verify materials ordered and crew scheduled'
        )
      );
    WHEN 'IN_PROGRESS' THEN
      v_actions := jsonb_build_array(
        jsonb_build_object(
          'action', 'Add photos (v2)',
          'priority', 'LOW',
          'description', 'Upload progress photos (feature coming in v2)'
        )
      );
    WHEN 'COMPLETED' THEN
      v_actions := jsonb_build_array(
        jsonb_build_object(
          'action', 'Send review request (v2)',
          'priority', 'LOW',
          'description', 'Request review from homeowner (feature coming in v2)'
        )
      );
    WHEN 'LOST', 'NOT_A_FIT' THEN
      v_actions := jsonb_build_array(
        jsonb_build_object(
          'action', 'Tag and archive',
          'priority', 'LOW',
          'description', 'Archive this job'
        )
      );
    ELSE
      v_actions := '[]'::jsonb;
  END CASE;
  
  RETURN v_actions;
END;
$$;

COMMENT ON FUNCTION public.get_smart_actions_for_stage IS 'Returns recommended smart actions based on current job stage';

-- ============================================================================
-- PART 9 — Function to Get Complete Job Summary
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_roofing_job_summary(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result jsonb;
  v_job record;
  v_thread record;
BEGIN
  -- Get job
  SELECT * INTO v_job FROM public.roofing_jobs WHERE id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN '{}'::jsonb;
  END IF;
  
  -- Get thread data if available
  IF v_job.thread_id IS NOT NULL THEN
    SELECT * INTO v_thread FROM public.inbox_threads WHERE id = v_job.thread_id;
  END IF;
  
  -- Build summary
  v_result := jsonb_build_object(
    'job_id', v_job.id,
    'homeowner_name', v_job.homeowner_name,
    'address', v_job.address,
    'carrier', v_job.carrier,
    'claim_number', v_job.claim_number,
    'current_stage', v_job.current_stage,
    'hot_lead_score', v_job.hot_lead_score,
    'projected_job_value', v_job.projected_job_value,
    'status_reason', v_job.status_reason,
    'stage_changed_at', v_job.stage_changed_at,
    'updated_at', v_job.updated_at,
    'smart_actions', public.get_smart_actions_for_stage(p_job_id),
    'insurance', CASE 
      WHEN v_thread.id IS NOT NULL THEN jsonb_build_object(
        'carrier', v_thread.insurance_carrier,
        'claim_status', v_thread.insurance_claim_status,
        'payout_type', v_thread.insurance_payout_type,
        'deductible', v_thread.insurance_deductible_amount,
        'install_ready', v_thread.insurance_install_ready
      )
      ELSE NULL
    END,
    'scope', CASE 
      WHEN v_thread.id IS NOT NULL THEN v_thread.roof_scope
      ELSE NULL
    END,
    'financials', CASE 
      WHEN v_thread.id IS NOT NULL THEN v_thread.claim_financials
      ELSE NULL
    END
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_roofing_job_summary IS 'Returns complete job summary with insurance, scope, financials, and smart actions';

-- ============================================================================
-- PART 10 — Helper Function to Sync Job Data from Thread
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_job_from_thread(p_thread_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id uuid;
  v_thread record;
BEGIN
  -- Get thread data
  SELECT * INTO v_thread FROM public.inbox_threads WHERE id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Get or create job
  v_job_id := public.get_or_create_roofing_job(p_thread_id := p_thread_id);
  
  -- Update job with latest thread data
  UPDATE public.roofing_jobs
  SET 
    hot_lead_score := COALESCE(v_thread.hot_lead_score, hot_lead_score),
    projected_job_value := COALESCE(
      (v_thread.claim_financials->>'rcv_total')::numeric,
      v_thread.thread_estimated_value,
      projected_job_value
    ),
    carrier := COALESCE(v_thread.insurance_carrier, carrier),
    claim_number := COALESCE(
      v_thread.insurance_analysis_metadata->>'claim_number',
      claim_number
    ),
    updated_at := NOW()
  WHERE id = v_job_id;
  
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.sync_job_from_thread IS 'Syncs roofing job data from thread (useful for manual refresh)';

-- ============================================================================
-- PART 11 — RLS Policies
-- ============================================================================

-- Enable RLS
ALTER TABLE public.roofing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_sync_status ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read jobs in their campaigns
-- Uses campaign ownership/membership pattern similar to inbox_threads
CREATE POLICY "Users can read roofing jobs in their campaigns"
  ON public.roofing_jobs
  FOR SELECT
  USING (
    campaign_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = roofing_jobs.campaign_id
      AND (
        COALESCE(c.owner_id, c.user_id) = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.campaign_shares s
          WHERE s.campaign_id = c.id AND s.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.campaign_members cm
          WHERE cm.campaign_id = c.id AND cm.user_id = auth.uid()
        )
      )
    )
  );

-- Policy: Users can update jobs in their campaigns
CREATE POLICY "Users can update roofing jobs in their campaigns"
  ON public.roofing_jobs
  FOR UPDATE
  USING (
    campaign_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = roofing_jobs.campaign_id
      AND (
        COALESCE(c.owner_id, c.user_id) = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.campaign_shares s
          WHERE s.campaign_id = c.id AND s.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.campaign_members cm
          WHERE cm.campaign_id = c.id AND cm.user_id = auth.uid()
        )
      )
    )
  );

-- Policy: System can insert jobs (via triggers)
-- Also allow authenticated users to insert (for manual job creation)
CREATE POLICY "Users can insert roofing jobs"
  ON public.roofing_jobs
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    (campaign_id IS NULL OR
     EXISTS (
       SELECT 1 FROM public.campaigns c
       WHERE c.id = roofing_jobs.campaign_id
       AND (
         COALESCE(c.owner_id, c.user_id) = auth.uid()
         OR EXISTS (
           SELECT 1 FROM public.campaign_shares s
           WHERE s.campaign_id = c.id AND s.user_id = auth.uid()
         )
         OR EXISTS (
           SELECT 1 FROM public.campaign_members cm
           WHERE cm.campaign_id = c.id AND cm.user_id = auth.uid()
         )
       )
     )
    )
  );

-- Policy: Users can read CRM sync status for their jobs
CREATE POLICY "Users can read CRM sync status for their jobs"
  ON public.crm_sync_status
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.campaigns c ON c.id = rj.campaign_id
      WHERE rj.id = crm_sync_status.job_id
      AND (
        COALESCE(c.owner_id, c.user_id) = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.campaign_shares s
          WHERE s.campaign_id = c.id AND s.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.campaign_members cm
          WHERE cm.campaign_id = c.id AND cm.user_id = auth.uid()
        )
      )
    )
  );

-- ============================================================================
-- PART 12 — Initial Backfill (Optional - can be run manually)
-- ============================================================================

-- Function to backfill jobs from existing threads
CREATE OR REPLACE FUNCTION public.backfill_roofing_jobs_from_threads(p_campaign_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread_id uuid;
  v_count integer := 0;
  v_errors integer := 0;
BEGIN
  -- Loop through threads
  FOR v_thread_id IN 
    SELECT id FROM public.inbox_threads
    WHERE (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
      AND (
        insurance_carrier IS NOT NULL OR
        insurance_claim_status IS NOT NULL OR
        hot_lead_score IS NOT NULL
      )
  LOOP
    BEGIN
      PERFORM public.sync_job_from_thread(v_thread_id);
      v_count := v_count + 1;
    EXCEPTION
      WHEN OTHERS THEN
        v_errors := v_errors + 1;
        RAISE WARNING 'Error backfilling job for thread %: %', v_thread_id, SQLERRM;
    END;
  END LOOP;
  
  RETURN jsonb_build_object(
    'campaign_id', p_campaign_id,
    'jobs_created', v_count,
    'errors', v_errors,
    'completed_at', NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.backfill_roofing_jobs_from_threads IS 'Backfills roofing jobs from existing threads (run manually after migration)';

