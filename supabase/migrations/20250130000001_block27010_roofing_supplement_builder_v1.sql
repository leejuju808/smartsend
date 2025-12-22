-- =========================================================
-- Block 27010 — SmartSend Roofing Supplement Builder v1
-- (Generate supplement line items • Detect missing insurance items • Auto-build packages from damage & photos)
-- =========================================================
-- 
-- This block is where SmartSend starts printing extra money for roofers.
-- 
-- Most roofing companies:
-- - Under-bill insurance
-- - Forget code-required items
-- - Don't know what to ask for
-- - Hate writing supplements
-- 
-- SmartSend will now:
-- - Look at damage + photos + job scope → propose supplement line items and a clean package they can send to the adjuster or homeowner.
-- 
-- You are literally building a "free money generator" for roofers.

-- ============================================================================
-- PART 1 — CREATE roofing_supplements TABLE
-- ============================================================================
-- Stores supplement proposals per job

CREATE TABLE IF NOT EXISTS public.roofing_supplements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  status text CHECK (status IN ('draft', 'submitted', 'approved', 'denied', 'partial')) DEFAULT 'draft',
  total_amount numeric DEFAULT 0,
  
  -- High-level notes
  summary text,
  adjuster_notes text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_roofing_supplements_job_id ON public.roofing_supplements(job_id);
CREATE INDEX IF NOT EXISTS idx_roofing_supplements_workspace_id ON public.roofing_supplements(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_supplements_status ON public.roofing_supplements(status);
CREATE INDEX IF NOT EXISTS idx_roofing_supplements_created_at ON public.roofing_supplements(created_at DESC);

-- ============================================================================
-- PART 2 — CREATE roofing_supplement_line_items TABLE
-- ============================================================================
-- Stores individual line items within a supplement

CREATE TABLE IF NOT EXISTS public.roofing_supplement_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplement_id uuid NOT NULL REFERENCES public.roofing_supplements(id) ON DELETE CASCADE,
  
  code text,              -- Optional (Xactimate or internal code)
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit text,              -- 'sq', 'lf', 'ea'
  unit_price numeric,     -- Optional
  total_price numeric,    -- Optional
  
  rationale text,         -- Why this is needed (damage, code, manufacturer)
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_roofing_supplement_line_items_supplement_id ON public.roofing_supplement_line_items(supplement_id);
CREATE INDEX IF NOT EXISTS idx_roofing_supplement_line_items_code ON public.roofing_supplement_line_items(code) WHERE code IS NOT NULL;

-- ============================================================================
-- PART 3 — TRIGGERS
-- ============================================================================
-- Auto-update updated_at timestamps

CREATE OR REPLACE FUNCTION public.tg_update_roofing_supplements_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_roofing_supplements_updated_at
BEFORE UPDATE ON public.roofing_supplements
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_roofing_supplements_updated_at();

CREATE OR REPLACE FUNCTION public.tg_update_roofing_supplement_line_items_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_roofing_supplement_line_items_updated_at
BEFORE UPDATE ON public.roofing_supplement_line_items
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_roofing_supplement_line_items_updated_at();

-- ============================================================================
-- PART 4 — RLS POLICIES
-- ============================================================================
-- Enable Row Level Security

ALTER TABLE public.roofing_supplements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_supplement_line_items ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view supplements for jobs in their workspace
CREATE POLICY "roofing supplements select"
  ON public.roofing_supplements
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.roofing_jobs rj
      WHERE rj.id = roofing_supplements.job_id
      AND (
        rj.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members 
          WHERE user_id = auth.uid()
        )
        OR rj.workspace_id IN (
          SELECT id FROM public.workspaces 
          WHERE owner_id = auth.uid()
        )
      )
    )
  );

-- Policy: Users can insert/update supplements for jobs in their workspace
CREATE POLICY "roofing supplements insert"
  ON public.roofing_supplements
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "roofing supplements update"
  ON public.roofing_supplements
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- Policy: Service role can do everything (for edge functions)
CREATE POLICY "roofing supplements service role all"
  ON public.roofing_supplements
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Users can view line items for supplements they can access
CREATE POLICY "roofing supplement line items select"
  ON public.roofing_supplement_line_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_supplements rs
      WHERE rs.id = roofing_supplement_line_items.supplement_id
      AND (
        rs.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members 
          WHERE user_id = auth.uid()
        )
        OR rs.workspace_id IN (
          SELECT id FROM public.workspaces 
          WHERE owner_id = auth.uid()
        )
      )
    )
  );

-- Policy: Users can insert/update line items for supplements they can access
CREATE POLICY "roofing supplement line items insert"
  ON public.roofing_supplement_line_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roofing_supplements rs
      WHERE rs.id = roofing_supplement_line_items.supplement_id
      AND (
        rs.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members 
          WHERE user_id = auth.uid()
        )
        OR rs.workspace_id IN (
          SELECT id FROM public.workspaces 
          WHERE owner_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "roofing supplement line items update"
  ON public.roofing_supplement_line_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_supplements rs
      WHERE rs.id = roofing_supplement_line_items.supplement_id
      AND (
        rs.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members 
          WHERE user_id = auth.uid()
        )
        OR rs.workspace_id IN (
          SELECT id FROM public.workspaces 
          WHERE owner_id = auth.uid()
        )
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.roofing_supplements rs
      WHERE rs.id = roofing_supplement_line_items.supplement_id
      AND (
        rs.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members 
          WHERE user_id = auth.uid()
        )
        OR rs.workspace_id IN (
          SELECT id FROM public.workspaces 
          WHERE owner_id = auth.uid()
        )
      )
    )
  );

-- Policy: Service role can do everything (for edge functions)
CREATE POLICY "roofing supplement line items service role all"
  ON public.roofing_supplement_line_items
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- PART 5 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.roofing_supplements IS 'Block 27010: Insurance supplement proposals per job';
COMMENT ON TABLE public.roofing_supplement_line_items IS 'Block 27010: Individual line items within a supplement';
COMMENT ON COLUMN public.roofing_supplements.status IS 'Block 27010: Supplement status: draft, submitted, approved, denied, partial';
COMMENT ON COLUMN public.roofing_supplement_line_items.rationale IS 'Block 27010: Why this line item should be added (damage, code, manufacturer requirement)';



































