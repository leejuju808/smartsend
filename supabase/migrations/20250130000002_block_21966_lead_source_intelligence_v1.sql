-- ============================================================================
-- Block 21966 — SmartSend Roofing Lead Source Intelligence v1
-- 🧭 "Which Leads Make You Money?" — Automatic Source Detection, Scoring & ROI
-- ============================================================================
-- FULL BLOCK. THIS ONE IS A MONEY PRINTER FOR ROOFERS.
-- 
-- Right now, roofers waste THOUSANDS every month on:
-- - Google Ads, HomeAdvisor, Angi, Thumbtack, Facebook ads
-- - Door hangers, Yard signs, Local networking
-- - Real estate agents, Insurance referrals
-- 
-- But they NEVER truly know:
-- - Which sources bring the most revenue
-- - Which bring the highest close rate
-- - Which bring angry homeowners
-- - Which bring price shoppers
-- - Which sources are fake leads or dead
-- - Which sources "look good" but cost money
-- 
-- SmartSend becomes the brain that answers:
-- "Where should we spend money? Where should we stop? 
-- Which sources produce HIGH-PAYING jobs?"
-- ============================================================================

-- ============================================================================
-- PART 1 — ADD LEAD SOURCE COLUMNS TO LEADS TABLE
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lead_source TEXT,
  ADD COLUMN IF NOT EXISTS lead_source_confidence INTEGER;

-- Add index for fast filtering/sorting by lead source
CREATE INDEX IF NOT EXISTS idx_leads_lead_source ON public.leads(lead_source);
CREATE INDEX IF NOT EXISTS idx_leads_lead_source_workspace ON public.leads(workspace_id, lead_source);

-- Add comments for documentation
COMMENT ON COLUMN public.leads.lead_source IS 'Block 21966: Detected lead source (google_search, google_ads, facebook_ads, homeadvisor, angi, thumbtack, yard_sign, door_hanger, referral, real_estate_agent, insurance_adjuster, walk_in, event, cold_email, resurrection, unknown)';
COMMENT ON COLUMN public.leads.lead_source_confidence IS 'Block 21966: Confidence score (0-100) for lead source detection. Higher = more confident.';

-- ============================================================================
-- PART 2 — CREATE lead_source_stats TABLE
-- ============================================================================
-- This table stores aggregated performance metrics for each lead source
-- per workspace, updated nightly by the calculate_source_performance edge function

CREATE TABLE IF NOT EXISTS public.lead_source_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Source identification
  source TEXT NOT NULL,
  
  -- Volume metrics
  total_leads INTEGER DEFAULT 0,
  
  -- Quality metrics (averaged from leads)
  avg_heat INTEGER,
  avg_probability INTEGER,
  
  -- Conversion metrics
  close_rate NUMERIC(5,2), -- percentage (0-100)
  
  -- Revenue metrics
  avg_job_value NUMERIC(12,2),
  total_revenue NUMERIC(12,2),
  
  -- Overall source score (0-100, weighted composite)
  source_score INTEGER,
  
  -- Timestamps
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Unique constraint: one stat row per workspace + source
  UNIQUE(workspace_id, source)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_lead_source_stats_workspace ON public.lead_source_stats(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_source_stats_source ON public.lead_source_stats(source);
CREATE INDEX IF NOT EXISTS idx_lead_source_stats_score ON public.lead_source_stats(source_score DESC NULLS LAST);

-- Add comments
COMMENT ON TABLE public.lead_source_stats IS 'Block 21966: Aggregated performance metrics per lead source per workspace. Updated nightly.';
COMMENT ON COLUMN public.lead_source_stats.source_score IS 'Block 21966: Weighted composite score (0-100): quality*0.30 + close_rate*0.30 + revenue*0.25 + volume*0.10 + efficiency*0.05';

-- ============================================================================
-- PART 3 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.lead_source_stats ENABLE ROW LEVEL SECURITY;

-- Policy: Service role has full access (for edge functions)
CREATE POLICY "lead_source_stats_service_role_all"
  ON public.lead_source_stats
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: Authenticated users can read stats for their workspace
CREATE POLICY "lead_source_stats_select_authenticated"
  ON public.lead_source_stats
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = lead_source_stats.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 4 — HELPER FUNCTION: Calculate Source Score
-- ============================================================================
-- This function computes the weighted composite score for a source
-- Formula: (quality * 0.30) + (close_rate * 0.30) + (revenue * 0.25) + (volume * 0.10) + (efficiency * 0.05)

CREATE OR REPLACE FUNCTION public.calculate_source_score(
  p_avg_heat INTEGER,
  p_avg_probability INTEGER,
  p_close_rate NUMERIC,
  p_avg_job_value NUMERIC,
  p_total_leads INTEGER,
  p_efficiency_score INTEGER DEFAULT 50 -- Default efficiency if not calculated
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_quality_score NUMERIC;
  v_close_rate_score NUMERIC;
  v_revenue_score NUMERIC;
  v_volume_score NUMERIC;
  v_efficiency_score NUMERIC;
  v_final_score NUMERIC;
BEGIN
  -- Quality score: average of heat and probability (0-100)
  v_quality_score := COALESCE((p_avg_heat + p_avg_probability) / 2.0, 0);
  
  -- Close rate score: use close_rate directly (0-100)
  v_close_rate_score := COALESCE(p_close_rate, 0);
  
  -- Revenue score: normalize avg_job_value (assume $50k = 100 points)
  -- Scale: $0 = 0 points, $50k+ = 100 points
  v_revenue_score := LEAST(COALESCE((p_avg_job_value / 500.0), 0), 100);
  
  -- Volume score: normalize total_leads (assume 100+ leads = 100 points)
  -- Scale: 0 leads = 0 points, 100+ leads = 100 points
  v_volume_score := LEAST(COALESCE((p_total_leads::NUMERIC / 1.0), 0), 100);
  
  -- Efficiency score: use provided value (0-100)
  v_efficiency_score := COALESCE(p_efficiency_score, 50);
  
  -- Weighted composite score
  v_final_score := 
    (v_quality_score * 0.30) +
    (v_close_rate_score * 0.30) +
    (v_revenue_score * 0.25) +
    (v_volume_score * 0.10) +
    (v_efficiency_score * 0.05);
  
  -- Clamp to 0-100 and round
  RETURN GREATEST(0, LEAST(100, ROUND(v_final_score)));
END;
$$;

COMMENT ON FUNCTION public.calculate_source_score IS 'Block 21966: Calculates weighted composite source score (0-100) from quality, close rate, revenue, volume, and efficiency metrics.';

-- ============================================================================
-- PART 5 — TRIGGER: Update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_lead_source_stats_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_lead_source_stats_updated_at ON public.lead_source_stats;
CREATE TRIGGER trg_set_lead_source_stats_updated_at
  BEFORE UPDATE ON public.lead_source_stats
  FOR EACH ROW
  EXECUTE FUNCTION public.set_lead_source_stats_updated_at();









































