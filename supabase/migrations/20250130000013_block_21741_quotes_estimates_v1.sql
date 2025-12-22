-- =========================================================
-- Block 21741 — SmartSend Roofing Estimate & Quote Module v1
-- (Create Estimates • Send to Homeowner • Track Proposal Status)
-- =========================================================
-- 
-- This is the "show me the money" block.
-- Leads are cute. Appointments are nice.
-- ESTIMATES are where jobs are actually won.
--
-- We're building a simple, deadly effective quote system made specifically for roofers:
-- - Fast estimate creation
-- - Clean email to homeowner
-- - Status tracking (Draft → Sent → Viewed → Accepted / Rejected)
-- - Pipeline updates automatically

-- ============================================================================
-- STEP 1: CREATE QUOTES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'Roofing Estimate',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'rejected')),
  subtotal NUMERIC DEFAULT 0,
  tax NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_quotes_lead_id ON public.quotes (lead_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON public.quotes (status);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON public.quotes (created_at DESC);

-- ============================================================================
-- STEP 2: CREATE QUOTE_ITEMS TABLE (Optional but useful: line items)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  quantity NUMERIC DEFAULT 1,
  unit_price NUMERIC DEFAULT 0,
  total NUMERIC GENERATED ALWAYS AS (quantity * unit_price) STORED
);

CREATE INDEX IF NOT EXISTS idx_quote_items_quote_id ON public.quote_items (quote_id);

-- ============================================================================
-- STEP 3: CREATE RECALC_QUOTE_TOTALS FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recalc_quote_totals(p_quote_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_subtotal NUMERIC;
BEGIN
  SELECT COALESCE(SUM(total), 0)
  INTO v_subtotal
  FROM public.quote_items
  WHERE quote_id = p_quote_id;

  UPDATE public.quotes
  SET subtotal = v_subtotal,
      tax = ROUND(v_subtotal * 0.10, 2), -- v1: flat 10% tax
      total = v_subtotal + ROUND(v_subtotal * 0.10, 2)
  WHERE id = p_quote_id;
END;
$$;

-- ============================================================================
-- STEP 4: ENABLE RLS ON QUOTES TABLE
-- ============================================================================

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view quotes for leads in their workspace
CREATE POLICY "Users can view quotes for their workspace leads"
  ON public.quotes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.leads l
      JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE l.id = quotes.lead_id
        AND wm.user_id = auth.uid()
    )
  );

-- Policy: Users can insert quotes for leads in their workspace
CREATE POLICY "Users can insert quotes for their workspace leads"
  ON public.quotes
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.leads l
      JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE l.id = quotes.lead_id
        AND wm.user_id = auth.uid()
    )
  );

-- Policy: Users can update quotes for leads in their workspace
CREATE POLICY "Users can update quotes for their workspace leads"
  ON public.quotes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.leads l
      JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE l.id = quotes.lead_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.leads l
      JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE l.id = quotes.lead_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- STEP 5: ENABLE RLS ON QUOTE_ITEMS TABLE
-- ============================================================================

ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view quote items for quotes they can view
CREATE POLICY "Users can view quote items for accessible quotes"
  ON public.quote_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.quotes q
      JOIN public.leads l ON l.id = q.lead_id
      JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE q.id = quote_items.quote_id
        AND wm.user_id = auth.uid()
    )
  );

-- Policy: Users can insert quote items for quotes they can update
CREATE POLICY "Users can insert quote items for accessible quotes"
  ON public.quote_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.quotes q
      JOIN public.leads l ON l.id = q.lead_id
      JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE q.id = quote_items.quote_id
        AND wm.user_id = auth.uid()
    )
  );

-- Policy: Users can update quote items for quotes they can update
CREATE POLICY "Users can update quote items for accessible quotes"
  ON public.quote_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.quotes q
      JOIN public.leads l ON l.id = q.lead_id
      JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE q.id = quote_items.quote_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.quotes q
      JOIN public.leads l ON l.id = q.lead_id
      JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE q.id = quote_items.quote_id
        AND wm.user_id = auth.uid()
    )
  );

-- Policy: Users can delete quote items for quotes they can update
CREATE POLICY "Users can delete quote items for accessible quotes"
  ON public.quote_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.quotes q
      JOIN public.leads l ON l.id = q.lead_id
      JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE q.id = quote_items.quote_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.quotes IS 'Roofing estimates/quotes tied to leads. Tracks status: draft, sent, viewed, accepted, rejected';
COMMENT ON TABLE public.quote_items IS 'Line items for quotes (optional v1, expandable later)';
COMMENT ON FUNCTION public.recalc_quote_totals IS 'Recalculates subtotal, tax (10%), and total for a quote based on its items';










































