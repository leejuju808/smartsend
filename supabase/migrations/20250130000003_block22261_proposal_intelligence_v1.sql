-- =========================================================
-- Block 22261 — SmartSend Roofing Proposal Intelligence v1
-- (The Proposal-Closing Machine: Track, Classify, Follow-Up, Predict Revenue)
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE proposals TABLE
-- ============================================================================
-- Tracks each proposal attached to a lead
-- Why roofers love this: They finally see who viewed, who ignored, and who is ready to close.

CREATE TABLE IF NOT EXISTS public.proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  proposal_url text,
  status text CHECK (status IN ('sent','viewed','considering','approved','declined','expired')) DEFAULT 'sent',
  sent_at timestamptz DEFAULT now(),
  viewed_at timestamptz,
  intent text, -- SmartSend AI classification: HOT, WARM, COLD, DECLINE
  confidence numeric CHECK (confidence >= 0.0 AND confidence <= 1.0), -- 0.0 - 1.0
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposals_lead_id ON public.proposals(lead_id);
CREATE INDEX IF NOT EXISTS idx_proposals_workspace_id ON public.proposals(workspace_id);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON public.proposals(status);
CREATE INDEX IF NOT EXISTS idx_proposals_intent ON public.proposals(intent);
CREATE INDEX IF NOT EXISTS idx_proposals_sent_at ON public.proposals(sent_at DESC);

-- ============================================================================
-- PART 2 — CREATE proposal_events TABLE
-- ============================================================================
-- Every interaction logged automatically into the unified activity feed
-- Why roofers love this: They get a real-time timeline of proposal actions.
-- They know if a homeowner actually opened it or is ghosting.

CREATE TABLE IF NOT EXISTS public.proposal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_type text CHECK (event_type IN ('proposal_sent','proposal_viewed','proposal_followup','proposal_reply')) NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_events_proposal_id ON public.proposal_events(proposal_id);
CREATE INDEX IF NOT EXISTS idx_proposal_events_lead_id ON public.proposal_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_proposal_events_workspace_id ON public.proposal_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_proposal_events_event_type ON public.proposal_events(event_type);
CREATE INDEX IF NOT EXISTS idx_proposal_events_created_at ON public.proposal_events(created_at DESC);

-- ============================================================================
-- PART 3 — UPDATED_AT TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_proposals_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_proposals_updated_at ON public.proposals;
CREATE TRIGGER trg_set_proposals_updated_at
BEFORE UPDATE ON public.proposals
FOR EACH ROW
EXECUTE FUNCTION public.set_proposals_updated_at();

-- ============================================================================
-- PART 4 — AUTO FOLLOW-UP FUNCTION & TRIGGER
-- ============================================================================
-- If proposal intent is WARM or COLD, SmartSend fires a follow-up after 24 hours
-- Why roofers love this: No more forgetting. No more "we didn't follow up." SmartSend handles it.

CREATE OR REPLACE FUNCTION public.schedule_proposal_followup()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.intent IN ('WARM','COLD') AND (OLD.intent IS NULL OR OLD.intent != NEW.intent) THEN
    INSERT INTO public.proposal_events (proposal_id, lead_id, workspace_id, event_type, metadata)
    VALUES (NEW.id, NEW.lead_id, NEW.workspace_id, 'proposal_followup', jsonb_build_object('auto', true, 'scheduled_at', now() + interval '24 hours'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proposal_intent_trigger ON public.proposals;
CREATE TRIGGER proposal_intent_trigger
AFTER UPDATE ON public.proposals
FOR EACH ROW
WHEN (OLD.intent IS DISTINCT FROM NEW.intent)
EXECUTE FUNCTION public.schedule_proposal_followup();

-- ============================================================================
-- PART 5 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view proposals in their workspace
CREATE POLICY "Users can view proposals in their workspace"
  ON public.proposals FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can create proposals in their workspace
CREATE POLICY "Users can create proposals in their workspace"
  ON public.proposals FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can update proposals in their workspace
CREATE POLICY "Users can update proposals in their workspace"
  ON public.proposals FOR UPDATE
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

-- Policy: Users can delete proposals in their workspace
CREATE POLICY "Users can delete proposals in their workspace"
  ON public.proposals FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

ALTER TABLE public.proposal_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view proposal events in their workspace
CREATE POLICY "Users can view proposal events in their workspace"
  ON public.proposal_events FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: System can insert proposal events
CREATE POLICY "System can insert proposal events"
  ON public.proposal_events FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- PART 6 — HELPER FUNCTION: Calculate Revenue Likelihood Score
-- ============================================================================
-- Revenue Prediction (v1 lightweight)
-- if intent === "HOT": score = 0.85  
-- if intent === "WARM": score = 0.55  
-- if intent === "COLD": score = 0.20  
-- if intent === "DECLINE": score = 0.02
-- Estimated revenue: proposal.amount * score

CREATE OR REPLACE FUNCTION public.get_proposal_revenue_score(p_intent text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE
    WHEN p_intent = 'HOT' THEN 0.85
    WHEN p_intent = 'WARM' THEN 0.55
    WHEN p_intent = 'COLD' THEN 0.20
    WHEN p_intent = 'DECLINE' THEN 0.02
    ELSE 0.30 -- Default for sent/no intent yet
  END;
END;
$$;

-- ============================================================================
-- PART 7 — VIEW: Proposals with Revenue Prediction
-- ============================================================================

CREATE OR REPLACE VIEW public.proposals_with_revenue AS
SELECT 
  p.*,
  public.get_proposal_revenue_score(p.intent) as revenue_score,
  (p.amount * public.get_proposal_revenue_score(p.intent)) as estimated_revenue
FROM public.proposals p;

COMMENT ON VIEW public.proposals_with_revenue IS 'Proposals with calculated revenue likelihood scores and estimated revenue amounts';








































