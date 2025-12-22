-- =========================================================
-- Block 27210 — SmartSend Roofing E-Sign & Acceptance Tracker v1
-- (Simple approval links • Homeowner accept/decline buttons • Status tracking • Triggers for production & collections)
-- =========================================================
-- 
-- This block turns SmartSend proposals into signed jobs.
-- No more "Did they say yes?" - everything is timestamped, logged, and enforceable.

-- ============================================================================
-- PART 1 — ENSURE roofing_proposals TABLE EXISTS (may already exist from Block 27140)
-- ============================================================================
-- Stores individual tier proposals (good/better/best) linked to jobs
-- This allows us to track which specific tier was approved
-- Note: This table may already exist from Block 27140, so we use IF NOT EXISTS

CREATE TABLE IF NOT EXISTS public.roofing_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  
  -- Proposal tier (good/better/best)
  tier text NOT NULL CHECK (tier IN ('good', 'better', 'best')),
  
  -- Proposal details
  title text,
  subtitle text,
  price numeric(12,2),
  features text[], -- Array of feature strings
  warranty_text text,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add workspace_id if it doesn't exist (for compatibility with existing table)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'roofing_proposals' AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.roofing_proposals
      ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add proposal_id link if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'roofing_proposals' AND column_name = 'proposal_id'
  ) THEN
    ALTER TABLE public.roofing_proposals
      ADD COLUMN proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Ensure price is NOT NULL if it's currently nullable
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'roofing_proposals' 
    AND column_name = 'price' 
    AND is_nullable = 'YES'
  ) THEN
    -- Update any NULL prices to 0, then make NOT NULL
    UPDATE public.roofing_proposals SET price = 0 WHERE price IS NULL;
    ALTER TABLE public.roofing_proposals ALTER COLUMN price SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_roofing_proposals_job_id ON public.roofing_proposals(job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_proposals_job_tier ON public.roofing_proposals(job_id, tier);
CREATE INDEX IF NOT EXISTS idx_roofing_proposals_workspace ON public.roofing_proposals(workspace_id) WHERE workspace_id IS NOT NULL;

-- ============================================================================
-- PART 2 — CREATE roofing_proposal_tokens TABLE
-- ============================================================================
-- Stores unique approval links for each proposal tier

CREATE TABLE IF NOT EXISTS public.roofing_proposal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  proposal_tier text NOT NULL CHECK (proposal_tier IN ('good', 'better', 'best')),
  
  -- Token details
  token text UNIQUE NOT NULL, -- e.g. short hash like 'abC123'
  expires_at timestamptz, -- optional, can be null if no expiry
  is_active boolean NOT NULL DEFAULT true,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_proposal_tokens_token ON public.roofing_proposal_tokens(token) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_roofing_proposal_tokens_job ON public.roofing_proposal_tokens(job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_proposal_tokens_active ON public.roofing_proposal_tokens(is_active) WHERE is_active = true;

-- ============================================================================
-- PART 3 — CREATE roofing_proposal_acceptances TABLE
-- ============================================================================
-- Audit trail for all acceptance/decline decisions

CREATE TABLE IF NOT EXISTS public.roofing_proposal_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  proposal_tier text NOT NULL CHECK (proposal_tier IN ('good', 'better', 'best')),
  token text, -- which token they used
  
  -- Decision
  decision text NOT NULL CHECK (decision IN ('accepted', 'declined')),
  decision_at timestamptz NOT NULL DEFAULT now(),
  
  -- Homeowner info
  homeowner_name text,
  homeowner_email text,
  homeowner_ip text,
  homeowner_notes text, -- reason for decline / extra notes
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_proposal_acceptances_job ON public.roofing_proposal_acceptances(job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_proposal_acceptances_decision ON public.roofing_proposal_acceptances(decision);
CREATE INDEX IF NOT EXISTS idx_roofing_proposal_acceptances_token ON public.roofing_proposal_acceptances(token);
CREATE INDEX IF NOT EXISTS idx_roofing_proposal_acceptances_decision_at ON public.roofing_proposal_acceptances(decision_at DESC);

-- ============================================================================
-- PART 4 — ADD ACCEPTANCE FIELDS TO roofing_jobs TABLE
-- ============================================================================
-- Add fields to track acceptance status and selected tier

ALTER TABLE IF EXISTS public.roofing_jobs
  ADD COLUMN IF NOT EXISTS status text CHECK (status IN (
    'unscheduled',
    'scheduled',
    'in_progress',
    'completed',
    'cancelled',
    'accepted'
  )),
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS selected_tier text CHECK (selected_tier IN ('good', 'better', 'best'));

-- Update status constraint if it exists differently
DO $$
BEGIN
  -- Try to alter the constraint if status column already exists with different values
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'roofing_jobs' AND column_name = 'status'
  ) THEN
    -- Check if 'accepted' is already in the constraint
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_constraint cc ON c.conname = cc.conname
      WHERE c.conrelid = 'public.roofing_jobs'::regclass
      AND c.contype = 'c'
      AND c.consrc LIKE '%accepted%'
    ) THEN
      -- Drop old constraint if exists and add new one
      ALTER TABLE public.roofing_jobs DROP CONSTRAINT IF EXISTS roofing_jobs_status_check;
      ALTER TABLE public.roofing_jobs ADD CONSTRAINT roofing_jobs_status_check 
        CHECK (status IN ('unscheduled', 'scheduled', 'in_progress', 'completed', 'cancelled', 'accepted'));
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_roofing_jobs_status ON public.roofing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_accepted_at ON public.roofing_jobs(accepted_at) WHERE accepted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_selected_tier ON public.roofing_jobs(selected_tier) WHERE selected_tier IS NOT NULL;

-- ============================================================================
-- PART 5 — ENABLE ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.roofing_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_proposal_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_proposal_acceptances ENABLE ROW LEVEL SECURITY;

-- RLS Policies for roofing_proposals
CREATE POLICY "roofing_proposals_service_role_all" ON public.roofing_proposals
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "roofing_proposals_authenticated_select" ON public.roofing_proposals
  FOR SELECT TO authenticated
  USING (true);

-- RLS Policies for roofing_proposal_tokens
CREATE POLICY "roofing_proposal_tokens_service_role_all" ON public.roofing_proposal_tokens
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "roofing_proposal_tokens_authenticated_select" ON public.roofing_proposal_tokens
  FOR SELECT TO authenticated
  USING (true);

-- RLS Policies for roofing_proposal_acceptances
CREATE POLICY "roofing_proposal_acceptances_service_role_all" ON public.roofing_proposal_acceptances
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "roofing_proposal_acceptances_authenticated_select" ON public.roofing_proposal_acceptances
  FOR SELECT TO authenticated
  USING (true);

-- Public read access for tokens (needed for public approval page)
CREATE POLICY "roofing_proposal_tokens_public_read" ON public.roofing_proposal_tokens
  FOR SELECT TO anon
  USING (is_active = true);

-- Public insert access for acceptances (needed for public approval page)
CREATE POLICY "roofing_proposal_acceptances_public_insert" ON public.roofing_proposal_acceptances
  FOR INSERT TO anon
  WITH CHECK (true);

-- ============================================================================
-- PART 6 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.roofing_proposals IS 'Block 27210: Stores individual tier proposals (good/better/best) for each job';
COMMENT ON TABLE public.roofing_proposal_tokens IS 'Block 27210: Unique approval links for proposal acceptance';
COMMENT ON TABLE public.roofing_proposal_acceptances IS 'Block 27210: Audit trail for all acceptance/decline decisions';



































