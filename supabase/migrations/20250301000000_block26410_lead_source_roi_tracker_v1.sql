-- =========================================================
-- Block 26410 — SmartSend Roofing Lead Source ROI Tracker v1
-- (Track which channels make real profit • Compare SmartSend vs ads vs referrals • Close the loop from lead → job → profit)
-- =========================================================
-- 
-- This block makes SmartSend prove its own value and exposes wasted ad spend for roofers.
-- 
-- You're building the system that tells an owner:
-- "These leads make you money. These leads are burning cash. Here's where to double down."
-- 
-- SmartSend stops being "cost" and becomes the thing that protects their marketing budget.

-- ============================================================================
-- PART 1 — CREATE roofing_lead_sources TABLE
-- ============================================================================
-- Track all lead sources (SmartSend campaigns, Google Ads, Facebook, referrals, etc.)

CREATE TABLE IF NOT EXISTS public.roofing_lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL, -- e.g. 'SmartSend - Cold Email', 'Google Ads', 'Referrals'
  channel_type text CHECK (channel_type IN ('smartsend', 'ads', 'referral', 'organic', 'other')) NOT NULL,

  -- Optional cost tracking
  monthly_budget numeric DEFAULT 0, -- what they *plan* to spend
  est_cost_per_lead numeric, -- optional

  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roofing_lead_sources_workspace ON public.roofing_lead_sources(workspace_id);
CREATE INDEX IF NOT EXISTS idx_roofing_lead_sources_channel_type ON public.roofing_lead_sources(channel_type);
CREATE INDEX IF NOT EXISTS idx_roofing_lead_sources_active ON public.roofing_lead_sources(is_active) WHERE is_active = true;

ALTER TABLE public.roofing_lead_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view lead sources in their workspace"
  ON public.roofing_lead_sources FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage lead sources in their workspace"
  ON public.roofing_lead_sources FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 2 — ADD lead_source_id TO leads TABLE
-- ============================================================================
-- Link leads to their source channel

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'lead_source_id'
  ) THEN
    ALTER TABLE public.leads
    ADD COLUMN lead_source_id uuid REFERENCES public.roofing_lead_sources(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_leads_lead_source_id ON public.leads(lead_source_id) WHERE lead_source_id IS NOT NULL;
  END IF;
END $$;

-- Note: campaign_id already exists on leads table, so we don't need to add it
-- campaign_id lets you go deeper: which exact SmartSend campaign pulled this lead

-- ============================================================================
-- PART 3 — ENSURE roofing_jobs HAS lead_id
-- ============================================================================
-- Connect jobs back to leads (should already exist, but ensure it)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'roofing_jobs' 
    AND column_name = 'lead_id'
  ) THEN
    ALTER TABLE public.roofing_jobs
    ADD COLUMN lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_roofing_jobs_lead_id ON public.roofing_jobs(lead_id) WHERE lead_id IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- PART 4 — SEED DEFAULT LEAD SOURCES
-- ============================================================================
-- Insert default lead sources for each workspace

DO $$
DECLARE
  v_workspace RECORD;
BEGIN
  FOR v_workspace IN SELECT DISTINCT id FROM public.workspaces LOOP
    -- Only insert if they don't already exist
    INSERT INTO public.roofing_lead_sources (workspace_id, name, channel_type)
    SELECT v_workspace.id, 'SmartSend - Cold Email', 'smartsend'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.roofing_lead_sources 
      WHERE workspace_id = v_workspace.id AND name = 'SmartSend - Cold Email'
    );
    
    INSERT INTO public.roofing_lead_sources (workspace_id, name, channel_type)
    SELECT v_workspace.id, 'Google Ads', 'ads'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.roofing_lead_sources 
      WHERE workspace_id = v_workspace.id AND name = 'Google Ads'
    );
    
    INSERT INTO public.roofing_lead_sources (workspace_id, name, channel_type)
    SELECT v_workspace.id, 'Facebook Ads', 'ads'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.roofing_lead_sources 
      WHERE workspace_id = v_workspace.id AND name = 'Facebook Ads'
    );
    
    INSERT INTO public.roofing_lead_sources (workspace_id, name, channel_type)
    SELECT v_workspace.id, 'Homeowner Referrals', 'referral'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.roofing_lead_sources 
      WHERE workspace_id = v_workspace.id AND name = 'Homeowner Referrals'
    );
    
    INSERT INTO public.roofing_lead_sources (workspace_id, name, channel_type)
    SELECT v_workspace.id, 'Yard Signs', 'organic'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.roofing_lead_sources 
      WHERE workspace_id = v_workspace.id AND name = 'Yard Signs'
    );
  END LOOP;
END $$;

-- ============================================================================
-- PART 5 — CREATE ROI VIEW
-- ============================================================================
-- Close the loop: Lead Source → Lead → Job → Profit

CREATE OR REPLACE VIEW public.roofing_lead_source_roi AS
SELECT
  s.id AS lead_source_id,
  s.workspace_id,
  s.name AS lead_source_name,
  s.channel_type,

  -- Leads
  COUNT(DISTINCT l.id) AS total_leads,

  -- Jobs sold from those leads
  COUNT(DISTINCT j.id) FILTER (WHERE j.status IN ('sold', 'in_production', 'completed') OR j.current_stage IN ('COMPLETED', 'IN_PROGRESS', 'SCHEDULED_INSTALL', 'APPROVED')) AS jobs_sold,

  -- Close rate
  CASE 
    WHEN COUNT(DISTINCT l.id) = 0 THEN 0
    ELSE ROUND(
      COUNT(DISTINCT j.id) FILTER (WHERE j.status IN ('sold', 'in_production', 'completed') OR j.current_stage IN ('COMPLETED', 'IN_PROGRESS', 'SCHEDULED_INSTALL', 'APPROVED'))::numeric
      / COUNT(DISTINCT l.id)::numeric * 100, 1
    )
  END AS close_rate_pct,

  -- Revenue + profit
  COALESCE(SUM(p.final_revenue), SUM(p.estimated_revenue), SUM(j.projected_job_value), SUM(j.job_value), 0) AS total_revenue,
  COALESCE(SUM(p.gross_profit), 0) AS total_gross_profit,

  -- Cost (simple: monthly_budget as "current period" estimate, can grow later)
  s.monthly_budget AS channel_cost_estimate,

  -- ROI calculation
  CASE 
    WHEN s.monthly_budget IS NULL OR s.monthly_budget <= 0 THEN NULL
    ELSE ROUND((COALESCE(SUM(p.gross_profit), 0) - s.monthly_budget) / s.monthly_budget * 100, 1)
  END AS roi_pct

FROM public.roofing_lead_sources s
LEFT JOIN public.leads l ON l.lead_source_id = s.id AND l.workspace_id = s.workspace_id
LEFT JOIN public.roofing_jobs j ON j.lead_id = l.id
LEFT JOIN public.roofing_job_profit p ON p.job_id = j.id AND p.workspace_id = s.workspace_id
WHERE s.is_active = true
GROUP BY s.id, s.workspace_id, s.name, s.channel_type, s.monthly_budget;

-- ============================================================================
-- PART 6 — CREATE COMPARISON VIEW (SmartSend vs Others)
-- ============================================================================
-- Make it easy to show "SmartSend wins"

CREATE OR REPLACE VIEW public.roofing_channel_vs_smartsend AS
SELECT
  s.workspace_id,
  CASE 
    WHEN s.channel_type = 'smartsend' THEN 'SmartSend'
    ELSE 'Non-SmartSend'
  END AS category,
  COUNT(DISTINCT l.id) AS total_leads,
  COUNT(DISTINCT j.id) FILTER (WHERE j.status IN ('sold', 'in_production', 'completed') OR j.current_stage IN ('COMPLETED', 'IN_PROGRESS', 'SCHEDULED_INSTALL', 'APPROVED')) AS jobs_sold,
  COALESCE(SUM(p.final_revenue), SUM(p.estimated_revenue), SUM(j.projected_job_value), SUM(j.job_value), 0) AS revenue,
  COALESCE(SUM(p.gross_profit), 0) AS profit,
  SUM(s.monthly_budget) AS total_cost
FROM public.roofing_lead_sources s
LEFT JOIN public.leads l ON l.lead_source_id = s.id AND l.workspace_id = s.workspace_id
LEFT JOIN public.roofing_jobs j ON j.lead_id = l.id
LEFT JOIN public.roofing_job_profit p ON p.job_id = j.id AND p.workspace_id = s.workspace_id
WHERE s.is_active = true
GROUP BY s.workspace_id, 
  CASE 
    WHEN s.channel_type = 'smartsend' THEN 'SmartSend'
    ELSE 'Non-SmartSend'
  END;

-- ============================================================================
-- PART 7 — RLS FOR VIEWS
-- ============================================================================
-- Views inherit RLS from underlying tables, but we can add explicit policies if needed

-- Note: Views use RLS from the underlying tables (roofing_lead_sources, leads, roofing_jobs, roofing_job_profit)
-- All of which already have workspace-based RLS policies

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.roofing_lead_sources IS 'Block 26410: Lead source tracking for ROI analysis';
COMMENT ON VIEW public.roofing_lead_source_roi IS 'Block 26410: Per-channel ROI metrics (leads, jobs, revenue, profit, ROI%)';
COMMENT ON VIEW public.roofing_channel_vs_smartsend IS 'Block 26410: SmartSend vs other channels comparison';



































