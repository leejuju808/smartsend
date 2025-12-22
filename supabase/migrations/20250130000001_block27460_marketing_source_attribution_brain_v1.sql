-- =========================================================
-- Block 27460 — SmartSend Roofing Marketing & Source Attribution Brain v1
-- (Track which channels bring the best jobs • Lead source ROI • Cost per booked job • "Where should we push harder?")
-- =========================================================
-- 
-- This block gives roofers full visibility into what's ACTUALLY working in their marketing.
-- 
-- Most roofers:
-- - Have no idea which channels bring profitable jobs
-- - Don't know their cost per lead (CPL) or cost per booked job (CPBJ)
-- - Spend money blindly on ads
-- - Attribute wins based on gut feelings, not data
-- - Think referrals are "free" when they're actually worth thousands
-- 
-- SmartSend will now:
-- - Track every lead source → connect it to booked jobs → calculate ROI → show EXACTLY where the company should spend and where it should stop.
-- 
-- This turns SmartSend into the Marketing GPS for roofers.

-- ============================================================================
-- PART 1 — EXPAND leads TABLE WITH STRONGER ATTRIBUTION FIELDS
-- ============================================================================
-- Add source tracking columns to leads table

DO $$
BEGIN
  -- Source category (groups sources for analysis)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'source_category'
  ) THEN
    ALTER TABLE public.leads
    ADD COLUMN source_category text;
    
    CREATE INDEX IF NOT EXISTS idx_leads_source_category 
      ON public.leads(source_category) 
      WHERE source_category IS NOT NULL;
  END IF;

  -- Source cost (cost to acquire this specific lead)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'source_cost'
  ) THEN
    ALTER TABLE public.leads
    ADD COLUMN source_cost numeric DEFAULT 0;
    
    CREATE INDEX IF NOT EXISTS idx_leads_source_cost 
      ON public.leads(source_cost) 
      WHERE source_cost > 0;
  END IF;

  -- Campaign name (for ads or email campaigns)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'campaign_name'
  ) THEN
    ALTER TABLE public.leads
    ADD COLUMN campaign_name text;
    
    CREATE INDEX IF NOT EXISTS idx_leads_campaign_name 
      ON public.leads(campaign_name) 
      WHERE campaign_name IS NOT NULL;
  END IF;

  -- UTM tracking parameters
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'utm_source'
  ) THEN
    ALTER TABLE public.leads
    ADD COLUMN utm_source text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'utm_medium'
  ) THEN
    ALTER TABLE public.leads
    ADD COLUMN utm_medium text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'utm_campaign'
  ) THEN
    ALTER TABLE public.leads
    ADD COLUMN utm_campaign text;
  END IF;
END $$;

-- ============================================================================
-- PART 2 — CREATE roofing_marketing_spend TABLE
-- ============================================================================
-- Track marketing spend by channel (roofers drop receipts or monthly spend here)

CREATE TABLE IF NOT EXISTS public.roofing_marketing_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source text NOT NULL,                         -- 'google_ads', 'facebook_ads', 'door_hangers', etc.
  category text,                                -- matches source_category: 'digital', 'referral', 'cold', 'paid_ads', 'offline'
  spend_amount numeric NOT NULL,
  spend_start date,
  spend_end date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_marketing_spend_workspace 
  ON public.roofing_marketing_spend(workspace_id);
CREATE INDEX IF NOT EXISTS idx_roofing_marketing_spend_source 
  ON public.roofing_marketing_spend(source);
CREATE INDEX IF NOT EXISTS idx_roofing_marketing_spend_category 
  ON public.roofing_marketing_spend(category);
CREATE INDEX IF NOT EXISTS idx_roofing_marketing_spend_dates 
  ON public.roofing_marketing_spend(spend_start, spend_end);

ALTER TABLE public.roofing_marketing_spend ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view marketing spend in their workspace"
  ON public.roofing_marketing_spend FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage marketing spend in their workspace"
  ON public.roofing_marketing_spend FOR ALL
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

-- ============================================================================
-- PART 3 — CREATE Lead → Job Connection View
-- ============================================================================
-- Links lead source → probability of conversion → value of job → profit

CREATE OR REPLACE VIEW public.roofing_lead_job_mapping AS
SELECT
  l.id as lead_id,
  l.workspace_id,
  l.name as lead_name,
  l.source,
  l.source_category,
  l.source_cost,
  l.campaign_name,
  l.utm_source,
  l.utm_medium,
  l.utm_campaign,
  j.id as job_id,
  j.status as job_status,
  j.current_stage,
  COALESCE(j.job_value, j.projected_job_value, 0) as estimated_value,
  COALESCE(j.revenue_collected, 0) as final_revenue,
  COALESCE(p.gross_profit, j.actual_gross_profit, 0) as gross_profit
FROM public.leads l
LEFT JOIN public.roofing_jobs j ON j.lead_id = l.id
LEFT JOIN public.roofing_job_profit p ON p.job_id = j.id
WHERE l.workspace_id IS NOT NULL;

-- ============================================================================
-- PART 4 — ROI CALCULATION VIEW (THIS IS THE BRAIN)
-- ============================================================================
-- Per-source ROI metrics: cost per job, ROI, profit per lead, win rate, revenue

CREATE OR REPLACE VIEW public.roofing_marketing_roi AS
WITH source_spend AS (
  -- Aggregate marketing spend by source and workspace
  SELECT 
    source,
    workspace_id,
    SUM(spend_amount) as total_spend
  FROM public.roofing_marketing_spend
  WHERE (spend_start IS NULL OR spend_start <= CURRENT_DATE)
    AND (spend_end IS NULL OR spend_end >= CURRENT_DATE)
  GROUP BY source, workspace_id
),
lead_metrics AS (
  -- Aggregate lead and job metrics by source
  SELECT
    COALESCE(l.source, 'unknown') as source,
    COALESCE(l.source_category, 'other') as source_category,
    l.workspace_id,
    COUNT(DISTINCT l.lead_id) as leads_generated,
    COUNT(DISTINCT l.job_id) FILTER (
      WHERE l.job_id IS NOT NULL 
      AND (l.job_status = 'completed' OR l.current_stage = 'COMPLETED')
    ) as jobs_won,
    COALESCE(SUM(l.final_revenue) FILTER (
      WHERE l.job_id IS NOT NULL 
      AND (l.job_status = 'completed' OR l.current_stage = 'COMPLETED')
    ), 0) as total_revenue,
    COALESCE(SUM(l.gross_profit) FILTER (
      WHERE l.job_id IS NOT NULL 
      AND (l.job_status = 'completed' OR l.current_stage = 'COMPLETED')
    ), 0) as total_profit,
    COALESCE(SUM(l.source_cost), 0) as lead_source_cost
  FROM public.roofing_lead_job_mapping l
  WHERE l.workspace_id IS NOT NULL
  GROUP BY COALESCE(l.source, 'unknown'), COALESCE(l.source_category, 'other'), l.workspace_id
)
SELECT
  lm.source,
  lm.source_category,
  lm.workspace_id,
  lm.leads_generated,
  lm.jobs_won,
  lm.total_revenue,
  lm.total_profit,
  lm.lead_source_cost + COALESCE(ss.total_spend, 0) as total_cost,
  CASE 
    WHEN lm.leads_generated > 0
    THEN lm.total_revenue / lm.leads_generated
    ELSE 0
  END as avg_revenue_per_lead,
  CASE 
    WHEN lm.leads_generated > 0
    THEN lm.total_profit / lm.leads_generated
    ELSE 0
  END as avg_profit_per_lead,
  CASE 
    WHEN (lm.lead_source_cost + COALESCE(ss.total_spend, 0)) > 0
    THEN lm.total_profit / (lm.lead_source_cost + COALESCE(ss.total_spend, 0))
    ELSE 0
  END as roi_multiplier,
  CASE 
    WHEN lm.jobs_won > 0
    THEN (lm.lead_source_cost + COALESCE(ss.total_spend, 0)) / lm.jobs_won
    ELSE NULL
  END as cost_per_booked_job,
  CASE 
    WHEN lm.leads_generated > 0
    THEN (lm.jobs_won::numeric / lm.leads_generated::numeric * 100)
    ELSE 0
  END as close_rate_pct
FROM lead_metrics lm
LEFT JOIN source_spend ss ON ss.source = lm.source AND ss.workspace_id = lm.workspace_id;

-- ============================================================================
-- PART 5 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.roofing_marketing_spend IS 'Block 27460: Marketing spend tracking by channel for ROI calculation';
COMMENT ON VIEW public.roofing_lead_job_mapping IS 'Block 27460: Maps leads to jobs with source attribution and financial data';
COMMENT ON VIEW public.roofing_marketing_roi IS 'Block 27460: Per-source ROI metrics (leads, jobs, revenue, profit, ROI, cost per job)';

COMMENT ON COLUMN public.leads.source_category IS 'Block 27460: Source category: digital, referral, cold, paid_ads, offline';
COMMENT ON COLUMN public.leads.source_cost IS 'Block 27460: Cost to acquire this specific lead';
COMMENT ON COLUMN public.leads.campaign_name IS 'Block 27460: Campaign name for ads or email campaigns';
COMMENT ON COLUMN public.leads.utm_source IS 'Block 27460: UTM source parameter';
COMMENT ON COLUMN public.leads.utm_medium IS 'Block 27460: UTM medium parameter';
COMMENT ON COLUMN public.leads.utm_campaign IS 'Block 27460: UTM campaign parameter';



































