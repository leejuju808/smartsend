-- =========================================================
-- Block 20520 — SmartSend Roofing Proposal Builder v1
-- (Automatically Turns Estimates Into a Clean, Homeowner-Ready Proposal)
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE proposals TABLE
-- ============================================================================
-- Stores AI-generated homeowner-ready proposals

CREATE TABLE IF NOT EXISTS public.proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  estimate_id uuid REFERENCES public.estimates(id) ON DELETE SET NULL,
  
  -- Proposal status
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'generated',
    'sent',
    'approved',
    'rejected',
    'won',
    'lost'
  )),
  
  -- Proposal JSON structure (matches spec exactly)
  proposal_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "homeowner_name": "Sarah Thompson",
  --   "property_address": "123 Market Street",
  --   "roof_summary": {...},
  --   "project_price": 22680,
  --   "insurance_comparison": {...},
  --   "line_items": [...],
  --   "warranty": "...",
  --   "timeline": "...",
  --   "next_steps": "..."
  -- }
  
  -- Generated proposal text (homeowner-friendly)
  proposal_text text,
  
  -- PDF generation
  pdf_url text,
  pdf_generated_at timestamptz,
  
  -- Email tracking
  email_sent_at timestamptz,
  email_opened_at timestamptz,
  email_clicked_at timestamptz,
  
  -- AI generation metadata
  generation_metadata jsonb DEFAULT '{}'::jsonb,
  ai_confidence_score integer CHECK (ai_confidence_score >= 0 AND ai_confidence_score <= 100),
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  approved_at timestamptz,
  
  -- Unique constraint: one active proposal per thread
  UNIQUE(thread_id, status) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_proposals_thread ON public.proposals(thread_id);
CREATE INDEX IF NOT EXISTS idx_proposals_contact ON public.proposals(contact_id);
CREATE INDEX IF NOT EXISTS idx_proposals_workspace ON public.proposals(workspace_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON public.proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_estimate ON public.proposals(estimate_id);
CREATE INDEX IF NOT EXISTS idx_proposals_created ON public.proposals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_data ON public.proposals USING GIN(proposal_data);

-- ============================================================================
-- PART 2 — TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.tg_update_proposal_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_update_proposal_updated_at
BEFORE UPDATE ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_proposal_updated_at();

-- ============================================================================
-- PART 3 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view proposals in their workspace"
  ON public.proposals FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create proposals in their workspace"
  ON public.proposals FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update proposals in their workspace"
  ON public.proposals FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 4 — FUNCTION: Detect Proposal Request in Messages
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_proposal_request(
  p_message_text text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_text text;
BEGIN
  v_text := COALESCE(LOWER(p_message_text), '');
  
  -- Check for proposal/quote request patterns
  IF v_text ~* '(send.*me.*(?:quote|proposal|estimate|bid)|can.*you.*send.*(?:quote|proposal|estimate)|I.*need.*(?:quote|proposal|estimate)|want.*(?:quote|proposal|estimate)|get.*me.*(?:quote|proposal|estimate))' THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.detect_proposal_request IS 'Detects if a homeowner message requests a proposal/quote (Block 20520)';

-- ============================================================================
-- PART 5 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.proposals IS 'AI-generated homeowner-ready proposals (Block 20520)';
COMMENT ON COLUMN public.proposals.proposal_data IS 'JSONB containing full proposal structure: homeowner_name, property_address, roof_summary, project_price, insurance_comparison, line_items, warranty, timeline, next_steps';
COMMENT ON COLUMN public.proposals.proposal_text IS 'Homeowner-friendly proposal text generated by AI';
COMMENT ON COLUMN public.proposals.generation_metadata IS 'Metadata about how proposal was generated (inputs used, AI model, etc.)';

