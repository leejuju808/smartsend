-- =========================================================
-- Block 32711 — SmartSend Roofing "AI Proposal Builder + Dynamic Contract Generator" v1
-- (Auto-generate roofing proposals • Pull job data automatically • Create legally sound contracts • Enable e-signature • Track homeowner engagement)
-- =========================================================

-- ============================================================================
-- PART 1 — EXTEND proposals TABLE FOR CONTRACT GENERATION
-- ============================================================================

-- Add contract-related fields to proposals
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contractor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS content text, -- markdown or html
  ADD COLUMN IF NOT EXISTS price numeric,
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS signature_url text,
  ADD COLUMN IF NOT EXISTS version int DEFAULT 1;

-- Update status enum to include new statuses
DO $$
BEGIN
  -- Check if status column exists and update constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'proposals' AND column_name = 'status'
  ) THEN
    -- Drop existing constraint if it exists
    ALTER TABLE public.proposals DROP CONSTRAINT IF EXISTS proposals_status_check;
    
    -- Add new constraint with all statuses
    ALTER TABLE public.proposals 
      ADD CONSTRAINT proposals_status_check 
      CHECK (status IN (
        'draft', 'generated', 'sent', 'viewed', 'signed', 'approved', 'rejected', 'won', 'lost', 'considering', 'declined', 'expired'
      ));
  END IF;
END $$;

-- ============================================================================
-- PART 2 — CREATE proposal_versions TABLE
-- ============================================================================
-- Tracks version history for proposals

CREATE TABLE IF NOT EXISTS public.proposal_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  version int NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_proposal_versions_proposal ON public.proposal_versions(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_versions_version ON public.proposal_versions(proposal_id, version);

-- ============================================================================
-- PART 3 — CREATE contract_documents TABLE
-- ============================================================================
-- Stores contract PDFs and signature data

CREATE TABLE IF NOT EXISTS public.contract_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  pdf_url text,
  signed_url text,
  contract_type text DEFAULT 'standard' CHECK (contract_type IN ('standard', 'insurance', 'storm', 'repair')),
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'signed', 'cancelled')),
  signed_at timestamptz,
  signed_by_name text,
  signed_by_email text,
  signature_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_documents_proposal ON public.contract_documents(proposal_id);
CREATE INDEX IF NOT EXISTS idx_contract_documents_lead ON public.contract_documents(lead_id);
CREATE INDEX IF NOT EXISTS idx_contract_documents_job ON public.contract_documents(job_id);
CREATE INDEX IF NOT EXISTS idx_contract_documents_status ON public.contract_documents(status);

-- ============================================================================
-- PART 4 — CREATE proposal_engagement TABLE
-- ============================================================================
-- Tracks detailed engagement metrics

CREATE TABLE IF NOT EXISTS public.proposal_engagement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'opened',
    'section_viewed',
    'financing_clicked',
    'warranty_viewed',
    'pricing_viewed',
    'photo_viewed',
    'upgrade_viewed',
    'time_spent'
  )),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_engagement_proposal ON public.proposal_engagement(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_engagement_event_type ON public.proposal_engagement(event_type);
CREATE INDEX IF NOT EXISTS idx_proposal_engagement_created ON public.proposal_engagement(created_at DESC);

-- ============================================================================
-- PART 5 — CREATE proposal_templates TABLE
-- ============================================================================
-- Stores proposal templates for different job types

CREATE TABLE IF NOT EXISTS public.proposal_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  template_name text NOT NULL,
  template_type text NOT NULL CHECK (template_type IN (
    'asphalt_shingle_replacement',
    'metal_roof_installation',
    'tpo_flat_roofing',
    'roof_repair',
    'storm_damage_insurance',
    'gutters_roofing_combo',
    'custom'
  )),
  content text NOT NULL,
  branding jsonb DEFAULT '{}'::jsonb, -- logo, colors, company details
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_templates_workspace ON public.proposal_templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_proposal_templates_type ON public.proposal_templates(template_type);

-- ============================================================================
-- PART 6 — TRIGGERS
-- ============================================================================

-- Update updated_at on contract_documents
CREATE OR REPLACE FUNCTION public.tg_update_contract_documents_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_update_contract_documents_updated_at ON public.contract_documents;
CREATE TRIGGER tr_update_contract_documents_updated_at
BEFORE UPDATE ON public.contract_documents
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_contract_documents_updated_at();

-- Update updated_at on proposal_templates
CREATE OR REPLACE FUNCTION public.tg_update_proposal_templates_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_update_proposal_templates_updated_at ON public.proposal_templates;
CREATE TRIGGER tr_update_proposal_templates_updated_at
BEFORE UPDATE ON public.proposal_templates
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_proposal_templates_updated_at();

-- Auto-increment version when proposal content changes
CREATE OR REPLACE FUNCTION public.tg_proposal_version_increment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.content IS DISTINCT FROM NEW.content THEN
    NEW.version := COALESCE(OLD.version, 0) + 1;
    
    -- Save version history
    INSERT INTO public.proposal_versions (proposal_id, version, content, created_by)
    VALUES (NEW.id, NEW.version, NEW.content, auth.uid());
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_proposal_version_increment ON public.proposals;
CREATE TRIGGER tr_proposal_version_increment
BEFORE UPDATE ON public.proposals
FOR EACH ROW
WHEN (OLD.content IS DISTINCT FROM NEW.content)
EXECUTE FUNCTION public.tg_proposal_version_increment();

-- Auto-update proposal status when contract is signed
CREATE OR REPLACE FUNCTION public.tg_contract_signed_update_proposal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'signed' AND OLD.status != 'signed' THEN
    -- Update proposal status
    UPDATE public.proposals
    SET 
      status = 'signed',
      signed_at = NEW.signed_at,
      signature_url = NEW.signed_url
    WHERE id = NEW.proposal_id;
    
    -- Update lead status to 'won' if lead_id exists
    IF NEW.lead_id IS NOT NULL THEN
      UPDATE public.leads
      SET status = 'won'
      WHERE id = NEW.lead_id;
    END IF;
    
    -- Create or update job if job_id exists
    IF NEW.job_id IS NOT NULL THEN
      UPDATE public.jobs
      SET 
        stage = 'approved',
        contract_value = (SELECT price FROM public.proposals WHERE id = NEW.proposal_id)
      WHERE id = NEW.job_id;
    ELSIF NEW.lead_id IS NOT NULL THEN
      -- Create new job if it doesn't exist
      INSERT INTO public.jobs (lead_id, stage, contract_value)
      SELECT 
        NEW.lead_id,
        'approved',
        (SELECT price FROM public.proposals WHERE id = NEW.proposal_id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.jobs WHERE lead_id = NEW.lead_id
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_contract_signed_update_proposal ON public.contract_documents;
CREATE TRIGGER tr_contract_signed_update_proposal
AFTER UPDATE ON public.contract_documents
FOR EACH ROW
WHEN (NEW.status = 'signed' AND OLD.status != 'signed')
EXECUTE FUNCTION public.tg_contract_signed_update_proposal();

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.proposal_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_engagement ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_templates ENABLE ROW LEVEL SECURITY;

-- Proposal versions policies
CREATE POLICY "Users can view proposal versions in their workspace"
  ON public.proposal_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = proposal_versions.proposal_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create proposal versions in their workspace"
  ON public.proposal_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.proposals p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = proposal_versions.proposal_id
        AND wm.user_id = auth.uid()
    )
  );

-- Contract documents policies
CREATE POLICY "Users can view contracts in their workspace"
  ON public.contract_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = contract_documents.proposal_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage contracts in their workspace"
  ON public.contract_documents FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = contract_documents.proposal_id
        AND wm.user_id = auth.uid()
    )
  );

-- Proposal engagement policies (read-only for workspace members, insert allowed for service role)
CREATE POLICY "Users can view engagement in their workspace"
  ON public.proposal_engagement FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.proposals p
      JOIN public.workspace_members wm ON wm.workspace_id = p.workspace_id
      WHERE p.id = proposal_engagement.proposal_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can insert engagement"
  ON public.proposal_engagement FOR INSERT
  WITH CHECK (true);

-- Proposal templates policies
CREATE POLICY "Users can view templates in their workspace"
  ON public.proposal_templates FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage templates in their workspace"
  ON public.proposal_templates FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 8 — HELPER FUNCTIONS
-- ============================================================================

-- Get proposal engagement summary
CREATE OR REPLACE FUNCTION public.get_proposal_engagement_summary(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_views', COUNT(*) FILTER (WHERE event_type = 'opened'),
    'first_viewed_at', MIN(created_at) FILTER (WHERE event_type = 'opened'),
    'last_viewed_at', MAX(created_at) FILTER (WHERE event_type = 'opened'),
    'sections_viewed', jsonb_agg(DISTINCT metadata->>'section') FILTER (WHERE event_type = 'section_viewed'),
    'financing_clicks', COUNT(*) FILTER (WHERE event_type = 'financing_clicked'),
    'warranty_views', COUNT(*) FILTER (WHERE event_type = 'warranty_viewed'),
    'total_time_seconds', COALESCE(SUM((metadata->>'time_seconds')::int), 0) FILTER (WHERE event_type = 'time_spent')
  )
  INTO result
  FROM public.proposal_engagement
  WHERE proposal_id = p_proposal_id;
  
  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;

-- ============================================================================
-- PART 9 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.proposal_versions IS 'Version history for proposals (Block 32711)';
COMMENT ON TABLE public.contract_documents IS 'Contract documents and e-signature data (Block 32711)';
COMMENT ON TABLE public.proposal_engagement IS 'Detailed engagement tracking for proposals (Block 32711)';
COMMENT ON TABLE public.proposal_templates IS 'Proposal templates for different job types (Block 32711)';

COMMENT ON COLUMN public.proposals.lead_id IS 'Associated lead (Block 32711)';
COMMENT ON COLUMN public.proposals.job_id IS 'Associated job (Block 32711)';
COMMENT ON COLUMN public.proposals.contractor_id IS 'Contractor who created the proposal (Block 32711)';
COMMENT ON COLUMN public.proposals.content IS 'Proposal content in markdown or HTML (Block 32711)';
COMMENT ON COLUMN public.proposals.version IS 'Current version number (Block 32711)';

































