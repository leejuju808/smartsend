-- ============================================================================
-- Block 27140 — SmartSend Roofing Estimate & Proposal Generator v1
-- ============================================================================
-- Turn job scope + AI into clean homeowner proposals • Multiple formats • Close-rate optimized
--
-- This block makes SmartSend the proposal machine.
-- Right now, most roofers:
-- - Send ugly PDFs or plain text estimates
-- - Don't explain value (only price)
-- - Forget options (good / better / best)
-- - Don't tailor proposals to what the homeowner actually cares about
--
-- SmartSend will now:
-- - Take job data + AI insights → generate a beautiful, clear, high-converting proposal in 1–2 clicks.
-- - This directly boosts close rate and makes SmartSend feel like the roofer's sales engine, not just outreach.
-- ============================================================================

-- ============================================================================
-- PART 1 — ESTIMATE & PROPOSAL TABLES
-- ============================================================================

-- A) Estimates Table
CREATE TABLE IF NOT EXISTS public.roofing_estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,

  version int NOT NULL DEFAULT 1,
  total_price numeric(12,2) DEFAULT 0,

  summary text,           -- short homeowner-facing summary
  notes text,             -- extra notes (cleanup, warranties, etc.)

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- B) Estimate Line Items
CREATE TABLE IF NOT EXISTS public.roofing_estimate_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id uuid NOT NULL REFERENCES public.roofing_estimates(id) ON DELETE CASCADE,

  category text,         -- "Roof System", "Accessories", "Labor", etc.
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit text,             -- 'sq', 'lf', 'ea'
  unit_price numeric(12,2),
  total_price numeric(12,2),

  sort_order int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- C) Proposal Variants (Good / Better / Best)
CREATE TABLE IF NOT EXISTS public.roofing_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,

  tier text CHECK (tier IN ('good','better','best')) NOT NULL,
  title text,
  subtitle text,
  price numeric(12,2),
  features text[],          -- bullet list
  warranty_text text,
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- PART 2 — INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_roofing_estimates_job ON public.roofing_estimates(job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_estimates_version ON public.roofing_estimates(job_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_roofing_estimate_line_items_estimate ON public.roofing_estimate_line_items(estimate_id);
CREATE INDEX IF NOT EXISTS idx_roofing_estimate_line_items_sort ON public.roofing_estimate_line_items(estimate_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_roofing_proposals_job ON public.roofing_proposals(job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_proposals_tier ON public.roofing_proposals(job_id, tier);

-- ============================================================================
-- PART 3 — TRIGGERS
-- ============================================================================

-- Update updated_at timestamps
CREATE OR REPLACE FUNCTION public.set_roofing_estimates_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_roofing_estimates_updated_at
  BEFORE UPDATE ON public.roofing_estimates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_roofing_estimates_updated_at();

CREATE OR REPLACE FUNCTION public.set_roofing_estimate_line_items_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_roofing_estimate_line_items_updated_at
  BEFORE UPDATE ON public.roofing_estimate_line_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_roofing_estimate_line_items_updated_at();

CREATE OR REPLACE FUNCTION public.set_roofing_proposals_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_roofing_proposals_updated_at
  BEFORE UPDATE ON public.roofing_proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_roofing_proposals_updated_at();

-- ============================================================================
-- PART 4 — RLS POLICIES
-- ============================================================================

ALTER TABLE public.roofing_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_estimate_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_proposals ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "roofing_estimates_service_role_all"
  ON public.roofing_estimates
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "roofing_estimate_line_items_service_role_all"
  ON public.roofing_estimate_line_items
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "roofing_proposals_service_role_all"
  ON public.roofing_proposals
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Authenticated users can access estimates/proposals for jobs they have access to
-- Access is determined through leads or campaigns (matching roofing_jobs RLS pattern)
CREATE POLICY "roofing_estimates_select_authenticated"
  ON public.roofing_estimates
  FOR SELECT
  TO authenticated
  USING (
    job_id IN (
      SELECT j.id
      FROM public.roofing_jobs j
      WHERE (
        -- Access through lead
        (j.lead_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = j.lead_id
          AND (l.org_id IS NOT NULL AND public.is_org_member(l.org_id))
        ))
        OR
        -- Access through campaign
        (j.campaign_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.campaigns c
          WHERE c.id = j.campaign_id
          AND (c.org_id IS NOT NULL AND public.is_org_member(c.org_id))
        ))
      )
    )
  );

CREATE POLICY "roofing_estimates_insert_update_authenticated"
  ON public.roofing_estimates
  FOR ALL
  TO authenticated
  USING (
    job_id IN (
      SELECT j.id
      FROM public.roofing_jobs j
      WHERE (
        (j.lead_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = j.lead_id
          AND (l.org_id IS NOT NULL AND public.is_org_member(l.org_id))
        ))
        OR
        (j.campaign_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.campaigns c
          WHERE c.id = j.campaign_id
          AND (c.org_id IS NOT NULL AND public.is_org_member(c.org_id))
        ))
      )
    )
  )
  WITH CHECK (
    job_id IN (
      SELECT j.id
      FROM public.roofing_jobs j
      WHERE (
        (j.lead_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = j.lead_id
          AND (l.org_id IS NOT NULL AND public.is_org_member(l.org_id))
        ))
        OR
        (j.campaign_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.campaigns c
          WHERE c.id = j.campaign_id
          AND (c.org_id IS NOT NULL AND public.is_org_member(c.org_id))
        ))
      )
    )
  );

CREATE POLICY "roofing_estimate_line_items_select_authenticated"
  ON public.roofing_estimate_line_items
  FOR SELECT
  TO authenticated
  USING (
    estimate_id IN (
      SELECT e.id
      FROM public.roofing_estimates e
      JOIN public.roofing_jobs j ON j.id = e.job_id
      WHERE (
        (j.lead_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = j.lead_id
          AND (l.org_id IS NOT NULL AND public.is_org_member(l.org_id))
        ))
        OR
        (j.campaign_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.campaigns c
          WHERE c.id = j.campaign_id
          AND (c.org_id IS NOT NULL AND public.is_org_member(c.org_id))
        ))
      )
    )
  );

CREATE POLICY "roofing_estimate_line_items_insert_update_authenticated"
  ON public.roofing_estimate_line_items
  FOR ALL
  TO authenticated
  USING (
    estimate_id IN (
      SELECT e.id
      FROM public.roofing_estimates e
      JOIN public.roofing_jobs j ON j.id = e.job_id
      WHERE (
        (j.lead_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = j.lead_id
          AND (l.org_id IS NOT NULL AND public.is_org_member(l.org_id))
        ))
        OR
        (j.campaign_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.campaigns c
          WHERE c.id = j.campaign_id
          AND (c.org_id IS NOT NULL AND public.is_org_member(c.org_id))
        ))
      )
    )
  )
  WITH CHECK (
    estimate_id IN (
      SELECT e.id
      FROM public.roofing_estimates e
      JOIN public.roofing_jobs j ON j.id = e.job_id
      WHERE (
        (j.lead_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = j.lead_id
          AND (l.org_id IS NOT NULL AND public.is_org_member(l.org_id))
        ))
        OR
        (j.campaign_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.campaigns c
          WHERE c.id = j.campaign_id
          AND (c.org_id IS NOT NULL AND public.is_org_member(c.org_id))
        ))
      )
    )
  );

CREATE POLICY "roofing_proposals_select_authenticated"
  ON public.roofing_proposals
  FOR SELECT
  TO authenticated
  USING (
    job_id IN (
      SELECT j.id
      FROM public.roofing_jobs j
      WHERE (
        (j.lead_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = j.lead_id
          AND (l.org_id IS NOT NULL AND public.is_org_member(l.org_id))
        ))
        OR
        (j.campaign_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.campaigns c
          WHERE c.id = j.campaign_id
          AND (c.org_id IS NOT NULL AND public.is_org_member(c.org_id))
        ))
      )
    )
  );

CREATE POLICY "roofing_proposals_insert_update_authenticated"
  ON public.roofing_proposals
  FOR ALL
  TO authenticated
  USING (
    job_id IN (
      SELECT j.id
      FROM public.roofing_jobs j
      WHERE (
        (j.lead_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = j.lead_id
          AND (l.org_id IS NOT NULL AND public.is_org_member(l.org_id))
        ))
        OR
        (j.campaign_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.campaigns c
          WHERE c.id = j.campaign_id
          AND (c.org_id IS NOT NULL AND public.is_org_member(c.org_id))
        ))
      )
    )
  )
  WITH CHECK (
    job_id IN (
      SELECT j.id
      FROM public.roofing_jobs j
      WHERE (
        (j.lead_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = j.lead_id
          AND (l.org_id IS NOT NULL AND public.is_org_member(l.org_id))
        ))
        OR
        (j.campaign_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.campaigns c
          WHERE c.id = j.campaign_id
          AND (c.org_id IS NOT NULL AND public.is_org_member(c.org_id))
        ))
      )
    )
  );

-- ============================================================================
-- PART 5 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.roofing_estimates IS 'Block 27140: Estimates for roofing jobs - versioned estimates with line items';
COMMENT ON TABLE public.roofing_estimate_line_items IS 'Block 27140: Line items for roofing estimates';
COMMENT ON TABLE public.roofing_proposals IS 'Block 27140: Good/Better/Best proposal tiers for roofing jobs';

COMMENT ON COLUMN public.roofing_estimates.version IS 'Block 27140: Version number for estimate revisions';
COMMENT ON COLUMN public.roofing_estimates.summary IS 'Block 27140: Short homeowner-facing summary of the project';
COMMENT ON COLUMN public.roofing_proposals.tier IS 'Block 27140: Proposal tier: good, better, or best';



































