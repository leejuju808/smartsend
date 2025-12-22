-- =========================================================
-- Block 21743 — SmartSend Roofing Campaign Revenue Attribution v1
-- (Track Which Campaigns → Produced Leads → Produced Revenue)
-- =========================================================
-- 
-- This block turns SmartSend from:
-- "Good outreach tool"
-- into:
-- "This campaign made you $47,000 last month — keep it running."
--
-- This is a revenue weapon for roofing companies, and it becomes a sales weapon for you.
-- Roofers are absolutely terrible at knowing where their money comes from.
-- SmartSend fixes that forever.

-- ============================================================================
-- STEP 1: Add Campaign Attribution to Leads Table
-- ============================================================================
-- When a campaign sends an email to a homeowner and that homeowner replies 
-- or becomes a lead, we must track which campaign created the lead.

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL;

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS sequence_id UUID REFERENCES public.sequences(id) ON DELETE SET NULL;

ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS source_step JSONB DEFAULT '{}'::jsonb; -- store: step #, trigger, etc.

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_leads_campaign_id ON public.leads (campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_sequence_id ON public.leads (sequence_id) WHERE sequence_id IS NOT NULL;

-- ============================================================================
-- STEP 2: Add Revenue Attribution to Quotes Table
-- ============================================================================
-- In Block 21741 we already set status = 'accepted' and store total.
-- Now also tag the quote with campaign attribution.

ALTER TABLE public.quotes
ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL;

ALTER TABLE public.quotes
ADD COLUMN IF NOT EXISTS sequence_id UUID REFERENCES public.sequences(id) ON DELETE SET NULL;

ALTER TABLE public.quotes
ADD COLUMN IF NOT EXISTS attributed_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_quotes_campaign_id ON public.quotes (campaign_id) WHERE campaign_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_sequence_id ON public.quotes (sequence_id) WHERE sequence_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_attributed_lead_id ON public.quotes (attributed_lead_id) WHERE attributed_lead_id IS NOT NULL;

-- ============================================================================
-- STEP 3: Create Campaign Revenue Summary RPC Function
-- ============================================================================
-- Returns JSON array with campaign revenue attribution data:
-- campaign_id, campaign_name, leads_generated, appointments, quotes_sent, jobs_won, revenue

CREATE OR REPLACE FUNCTION public.campaign_revenue_summary()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(t))
    FROM (
      SELECT
        c.id AS campaign_id,
        COALESCE(c.name, c.title, 'Unnamed Campaign') AS campaign_name,
        
        -- Raw lead count from this campaign
        (SELECT COUNT(*) 
         FROM public.leads l 
         WHERE l.campaign_id = c.id) AS leads_generated,
        
        -- Count of appointments from this campaign
        (SELECT COUNT(*)
         FROM public.appointments a
         JOIN public.leads l ON l.id = a.lead_id
         WHERE l.campaign_id = c.id) AS appointments,
        
        -- Count of quotes sent
        (SELECT COUNT(*)
         FROM public.quotes q
         WHERE q.campaign_id = c.id
           AND q.status IN ('sent', 'viewed', 'accepted')) AS quotes_sent,
        
        -- Count of won jobs (accepted quotes)
        (SELECT COUNT(*)
         FROM public.quotes q
         WHERE q.campaign_id = c.id
           AND q.status = 'accepted') AS jobs_won,
        
        -- Revenue total from accepted quotes
        (SELECT COALESCE(SUM(q.total), 0)
         FROM public.quotes q
         WHERE q.campaign_id = c.id
           AND q.status = 'accepted') AS revenue
      FROM public.campaigns c
      ORDER BY revenue DESC NULLS LAST, campaign_name
    ) t
  );
END;
$$;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.leads.campaign_id IS 'Campaign that generated this lead';
COMMENT ON COLUMN public.leads.sequence_id IS 'Sequence that generated this lead';
COMMENT ON COLUMN public.leads.source_step IS 'JSONB storing step number, trigger type, timestamp';
COMMENT ON COLUMN public.quotes.campaign_id IS 'Campaign that generated the lead for this quote';
COMMENT ON COLUMN public.quotes.sequence_id IS 'Sequence that generated the lead for this quote';
COMMENT ON COLUMN public.quotes.attributed_lead_id IS 'Lead that this quote is attributed to';
COMMENT ON FUNCTION public.campaign_revenue_summary IS 'Returns revenue attribution summary for all campaigns';










































