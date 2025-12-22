-- =========================================================
-- Block 28844 — SmartSend Roofing "Price Drop & Quote Revival Engine" v1
-- (Detect stalled quotes • Auto-send price adjustments • Recover silent homeowners • Convert lost jobs into booked estimates)
-- =========================================================
-- 
-- This is pure revenue recovery.
-- Roofers lose 30–50% of potential revenue from silent homeowners after quotes.
-- SmartSend fixes this by detecting stalled quotes and auto-reviving them.

-- ============================================================================
-- STEP 1: EXTEND QUOTES TABLE WITH REVIVAL STATUSES
-- ============================================================================

-- Drop the existing check constraint to add new statuses
ALTER TABLE public.quotes 
  DROP CONSTRAINT IF EXISTS quotes_status_check;

-- Add new statuses: 'stalled', 'revived' to the existing status enum
ALTER TABLE public.quotes
  ADD CONSTRAINT quotes_status_check 
  CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'stalled', 'revived', 'lost'));

-- Add amount column if it doesn't exist (for price tracking)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'quotes' 
    AND column_name = 'amount'
  ) THEN
    ALTER TABLE public.quotes ADD COLUMN amount NUMERIC;
  END IF;
END $$;

-- Add updated_at if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'quotes' 
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.quotes ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- ============================================================================
-- STEP 2: CREATE REVIVAL_EVENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.revival_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('check_in_3', 'check_in_6', 'offer', 'final')),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'replied', 'cancelled')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_revival_events_quote_id ON public.revival_events (quote_id);
CREATE INDEX IF NOT EXISTS idx_revival_events_status ON public.revival_events (status);
CREATE INDEX IF NOT EXISTS idx_revival_events_scheduled_at ON public.revival_events (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_revival_events_type ON public.revival_events (type);

-- ============================================================================
-- STEP 3: CREATE PRICE_DROP_RULES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.price_drop_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  enable_discounts BOOLEAN DEFAULT false,
  discount_type TEXT CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC DEFAULT 0,
  monthly_limit INT DEFAULT 5,
  used_this_month INT DEFAULT 0,
  reset_date TIMESTAMPTZ DEFAULT date_trunc('month', now()),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(contractor_id)
);

CREATE INDEX IF NOT EXISTS idx_price_drop_rules_contractor_id ON public.price_drop_rules (contractor_id);
CREATE INDEX IF NOT EXISTS idx_price_drop_rules_workspace_id ON public.price_drop_rules (workspace_id);

-- ============================================================================
-- STEP 4: CREATE FUNCTION TO DETECT STALLED QUOTES
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_stalled_quotes()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Mark quotes as stalled if:
  -- 1. Status is 'sent'
  -- 2. Sent more than 3 days ago
  -- 3. No reply detected
  -- 4. Not already marked as stalled, accepted, rejected, or lost
  UPDATE public.quotes
  SET status = 'stalled',
      updated_at = now()
  WHERE status = 'sent'
    AND sent_at IS NOT NULL
    AND sent_at <= now() - interval '3 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.revival_events re
      WHERE re.quote_id = quotes.id
      AND re.status = 'replied'
    );
END;
$$;

COMMENT ON FUNCTION public.detect_stalled_quotes IS 'Auto-detects quotes that have been sent but not replied to for 3+ days and marks them as stalled';

-- ============================================================================
-- STEP 5: CREATE FUNCTION TO GET REVIVAL METRICS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_revival_metrics(p_workspace_id UUID DEFAULT NULL)
RETURNS TABLE (
  stalled_quotes_count BIGINT,
  revived_quotes_count BIGINT,
  revenue_recovered NUMERIC,
  discounts_offered INT,
  discounts_accepted INT,
  jobs_won_after_revival INT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH workspace_quotes AS (
    SELECT q.id, q.status, q.total, q.lead_id
    FROM public.quotes q
    JOIN public.leads l ON l.id = q.lead_id
    WHERE (p_workspace_id IS NULL OR l.workspace_id = p_workspace_id)
  ),
  revival_stats AS (
    SELECT 
      COUNT(DISTINCT CASE WHEN q.status = 'stalled' THEN q.id END) as stalled,
      COUNT(DISTINCT CASE WHEN q.status = 'revived' THEN q.id END) as revived,
      COALESCE(SUM(CASE WHEN q.status = 'revived' AND q.status != 'sent' THEN q.total ELSE 0 END), 0) as revenue,
      COUNT(DISTINCT CASE WHEN re.type = 'offer' AND re.status = 'sent' THEN re.id END) as offers_sent,
      COUNT(DISTINCT CASE WHEN re.type = 'offer' AND re.status = 'replied' THEN re.id END) as offers_accepted,
      COUNT(DISTINCT CASE WHEN q.status = 'revived' AND q.status = 'accepted' THEN q.id END) as jobs_won
    FROM workspace_quotes q
    LEFT JOIN public.revival_events re ON re.quote_id = q.id
  )
  SELECT 
    stalled,
    revived,
    revenue,
    offers_sent,
    offers_accepted,
    jobs_won
  FROM revival_stats;
END;
$$;

COMMENT ON FUNCTION public.get_revival_metrics IS 'Returns revival engine metrics for a workspace';

-- ============================================================================
-- STEP 6: CREATE FUNCTION TO RESET MONTHLY DISCOUNT LIMITS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reset_monthly_discount_limits()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.price_drop_rules
  SET used_this_month = 0,
      reset_date = date_trunc('month', now()),
      updated_at = now()
  WHERE reset_date < date_trunc('month', now());
END;
$$;

COMMENT ON FUNCTION public.reset_monthly_discount_limits IS 'Resets monthly discount usage counters at the start of each month';

-- ============================================================================
-- STEP 6B: CREATE FUNCTION TO INCREMENT DISCOUNT USAGE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.increment_discount_usage(p_workspace_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.price_drop_rules
  SET used_this_month = used_this_month + 1,
      updated_at = now()
  WHERE workspace_id = p_workspace_id
    AND enable_discounts = true
    AND used_this_month < monthly_limit;
END;
$$;

COMMENT ON FUNCTION public.increment_discount_usage IS 'Increments the monthly discount usage counter for a workspace';

-- ============================================================================
-- STEP 7: ENABLE RLS ON NEW TABLES
-- ============================================================================

ALTER TABLE public.revival_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_drop_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for revival_events
CREATE POLICY "Users can view revival events for their workspace quotes"
  ON public.revival_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.quotes q
      JOIN public.leads l ON l.id = q.lead_id
      JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE q.id = revival_events.quote_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can manage revival events"
  ON public.revival_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for price_drop_rules
CREATE POLICY "Users can view price drop rules for their workspace"
  ON public.price_drop_rules
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = price_drop_rules.workspace_id
        AND wm.user_id = auth.uid()
    )
    OR contractor_id = auth.uid()
  );

CREATE POLICY "Users can update price drop rules for their workspace"
  ON public.price_drop_rules
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = price_drop_rules.workspace_id
        AND wm.user_id = auth.uid()
    )
    OR contractor_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = price_drop_rules.workspace_id
        AND wm.user_id = auth.uid()
    )
    OR contractor_id = auth.uid()
  );

CREATE POLICY "Users can insert price drop rules for their workspace"
  ON public.price_drop_rules
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = price_drop_rules.workspace_id
        AND wm.user_id = auth.uid()
    )
    OR contractor_id = auth.uid()
  );

-- ============================================================================
-- STEP 8: CREATE TRIGGER TO UPDATE QUOTES UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_quotes_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotes_updated_at ON public.quotes;
CREATE TRIGGER trg_quotes_updated_at
  BEFORE UPDATE ON public.quotes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_quotes_updated_at();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.revival_events IS 'Tracks revival messages sent to homeowners for stalled quotes';
COMMENT ON TABLE public.price_drop_rules IS 'Stores contractor price drop discount rules and monthly limits';
COMMENT ON COLUMN public.quotes.status IS 'Quote status: draft, sent, viewed, accepted, rejected, stalled, revived, lost';
COMMENT ON COLUMN public.revival_events.type IS 'Revival message type: check_in_3 (day 3), check_in_6 (day 6), offer (day 9), final (day 14)';


































