-- =========================================================
-- Block 22270 — SmartSend Roofing Proposal → Job Conversion Flow v1
-- (The "We Got The Job" Button: Turn Approved Proposals Into Real Revenue)
-- =========================================================
-- 
-- When a homeowner says "Yes, let's do it", SmartSend lets the roofer:
-- Click ONE BUTTON → Proposal becomes a Job with value, schedule, and status.
-- 
-- This block is where SmartSend turns intent + proposal → real revenue in the job pipeline.

-- ============================================================================
-- PART 1 — CREATE roofing_jobs TABLE
-- ============================================================================
-- Single source of truth for work that's been won
-- Why roofers care: They get a clear list of real jobs, not mixed with leads and quotes.

CREATE TABLE IF NOT EXISTS public.roofing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,

  -- High level info
  title text, -- e.g. "Smith - Roof Replacement"
  job_type text, -- "roof_replacement", "repair", etc. (optional enum later)
  status text CHECK (status IN (
    'unscheduled',
    'scheduled',
    'in_progress',
    'completed',
    'cancelled'
  )) DEFAULT 'unscheduled',

  -- Money
  job_value numeric NOT NULL,
  deposit_required numeric DEFAULT 0,
  deposit_paid numeric DEFAULT 0,
  balance_remaining numeric GENERATED ALWAYS AS 
    (GREATEST(job_value - deposit_paid, 0)) STORED,

  -- Dates
  preferred_start_date date,
  scheduled_start_date date,
  scheduled_end_date date,

  -- Operations
  crew_name text,
  notes text,

  -- Meta
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS jobs_workspace_status_idx
  ON public.roofing_jobs(workspace_id, status);

CREATE INDEX IF NOT EXISTS jobs_lead_id_idx
  ON public.roofing_jobs(lead_id) WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS jobs_proposal_id_idx
  ON public.roofing_jobs(proposal_id) WHERE proposal_id IS NOT NULL;

-- ============================================================================
-- PART 2 — ADD job_id TO proposals TABLE
-- ============================================================================
-- Tie proposals to jobs so we can track which proposal created which job

ALTER TABLE IF EXISTS public.proposals
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_proposals_job_id ON public.proposals(job_id) WHERE job_id IS NOT NULL;

-- ============================================================================
-- PART 3 — CREATE job_events TABLE
-- ============================================================================
-- Activity feed for jobs (mirrors how proposal_events works)
-- Why roofers care: They can see exactly what's happening with the job over time.

CREATE TABLE IF NOT EXISTS public.job_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,

  event_type text CHECK (event_type IN (
    'job_created',
    'job_status_changed',
    'job_scheduled',
    'job_completed',
    'deposit_recorded'
  )) NOT NULL,

  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS job_events_job_idx
  ON public.job_events(job_id);

CREATE INDEX IF NOT EXISTS job_events_workspace_idx
  ON public.job_events(workspace_id);

CREATE INDEX IF NOT EXISTS job_events_created_at_idx
  ON public.job_events(created_at DESC);

-- ============================================================================
-- PART 4 — UPDATED_AT TRIGGER FOR roofing_jobs
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_roofing_jobs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_roofing_jobs_updated_at ON public.roofing_jobs;
CREATE TRIGGER trg_set_roofing_jobs_updated_at
BEFORE UPDATE ON public.roofing_jobs
FOR EACH ROW
EXECUTE FUNCTION public.set_roofing_jobs_updated_at();

-- ============================================================================
-- PART 5 — FUNCTION: convert_proposal_to_job
-- ============================================================================
-- One function ID in → job ID out
-- Why roofers care: No duplicate typing. No "what was that bid for again?"
-- One click = job is in the system.

CREATE OR REPLACE FUNCTION public.convert_proposal_to_job(p_proposal_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_proposal record;
  v_lead record;
  v_job_id uuid;
  v_title text;
BEGIN
  -- 1. Load proposal + lead
  SELECT 
    p.*,
    l.first_name,
    l.last_name,
    l.city,
    l.state
  INTO v_proposal
  FROM public.proposals p
  LEFT JOIN public.leads l ON p.lead_id = l.id
  WHERE p.id = p_proposal_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  -- 2. If job already exists, return it
  IF v_proposal.job_id IS NOT NULL THEN
    RETURN v_proposal.job_id;
  END IF;

  -- 3. Create job title using homeowner + city or amount
  IF v_proposal.first_name IS NOT NULL OR v_proposal.last_name IS NOT NULL THEN
    v_title := COALESCE(v_proposal.first_name || ' ' || v_proposal.last_name, 'Homeowner');
    IF v_proposal.city IS NOT NULL THEN
      v_title := v_title || ' - ' || v_proposal.city;
    END IF;
    v_title := v_title || ' - Roof Job';
  ELSE
    v_title := '$' || v_proposal.amount::text || ' Roof Job';
  END IF;

  -- 4. Generate job ID
  v_job_id := gen_random_uuid();

  -- 5. Create job
  INSERT INTO public.roofing_jobs (
    id,
    workspace_id,
    lead_id,
    proposal_id,
    title,
    job_type,
    status,
    job_value,
    deposit_required
  ) VALUES (
    v_job_id,
    v_proposal.workspace_id,
    v_proposal.lead_id,
    v_proposal.id,
    v_title,
    'roofing',
    'unscheduled',
    v_proposal.amount,
    (v_proposal.amount * 0.3) -- default: 30% deposit requirement
  );

  -- 6. Link back from proposal
  UPDATE public.proposals
  SET job_id = v_job_id
  WHERE id = v_proposal.id;

  -- 7. Mark lead as job_won (if status column supports it)
  -- Note: We'll update the lead status to 'won' if the status column supports it
  -- Otherwise, we'll use the outcome column
  IF v_proposal.lead_id IS NOT NULL THEN
    -- Try to update status to 'won' if the constraint allows
    BEGIN
      UPDATE public.leads
      SET status = 'won'
      WHERE id = v_proposal.lead_id;
    EXCEPTION WHEN OTHERS THEN
      -- If status doesn't support 'won', try outcome column
      UPDATE public.leads
      SET outcome = 'won', won_value = v_proposal.amount, won_at = now()
      WHERE id = v_proposal.lead_id;
    END;
  END IF;

  -- 8. Log job event
  INSERT INTO public.job_events (job_id, workspace_id, lead_id, event_type, metadata)
  VALUES (
    v_job_id,
    v_proposal.workspace_id,
    v_proposal.lead_id,
    'job_created',
    jsonb_build_object(
      'proposal_id', v_proposal.id,
      'job_value', v_proposal.amount
    )
  );

  RETURN v_job_id;
END;
$$;

COMMENT ON FUNCTION public.convert_proposal_to_job IS 'Converts an approved proposal into a job record. Returns the job_id.';

-- ============================================================================
-- PART 6 — ROW LEVEL SECURITY FOR roofing_jobs
-- ============================================================================

ALTER TABLE public.roofing_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view jobs in their workspace
CREATE POLICY "Users can view jobs in their workspace"
  ON public.roofing_jobs FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can create jobs in their workspace
CREATE POLICY "Users can create jobs in their workspace"
  ON public.roofing_jobs FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can update jobs in their workspace
CREATE POLICY "Users can update jobs in their workspace"
  ON public.roofing_jobs FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can delete jobs in their workspace
CREATE POLICY "Users can delete jobs in their workspace"
  ON public.roofing_jobs FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY FOR job_events
-- ============================================================================

ALTER TABLE public.job_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view job events in their workspace
CREATE POLICY "Users can view job events in their workspace"
  ON public.job_events FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: System can insert job events
CREATE POLICY "System can insert job events"
  ON public.job_events FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- PART 8 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_jobs TO authenticated;
GRANT SELECT, INSERT ON public.job_events TO authenticated;
GRANT EXECUTE ON FUNCTION public.convert_proposal_to_job(uuid) TO authenticated;

