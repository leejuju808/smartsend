-- =========================================================
-- Block 21724 — SmartSend Roofing Per-Campaign Money View v1
-- ("Which campaign is actually making me money?")
-- =========================================================
--
-- This slice takes everything we've built (leads, jobs, follow-ups) and breaks it down per campaign,
-- so a roofer can see:
-- - Which campaign brings the most hot/warm leads
-- - Which one actually books the most money
-- - Which one is just noise
--
-- This is how they decide:
-- "Keep Storm Damage, kill Old Gutters, double down on Insurance Claims."
-- =========================================================

-- ============================================================================
-- 1. Wire Leads → Campaigns (if not already)
-- ============================================================================
-- We want each lead tied back to a campaign.

-- Add campaign_id column if it doesn't exist
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS campaign_id uuid;

-- Add foreign key constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'leads_campaign_id_fkey'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_campaign_id_fkey
        FOREIGN KEY (campaign_id)
        REFERENCES public.campaigns (id)
        ON DELETE SET NULL;
  END IF;
END $$;

-- Create index if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_leads_campaign_id
  ON public.leads (campaign_id);

-- ============================================================================
-- 2. Ensure campaigns table has company_id and name columns
-- ============================================================================

-- Add company_id to campaigns if it doesn't exist
-- We'll derive it from leads for existing campaigns, but new campaigns should set it
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS company_id uuid;

-- Add foreign key constraint for company_id if companies table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'companies'
  ) THEN
    -- Drop existing constraint if it exists with wrong name
    IF EXISTS (
      SELECT 1 FROM pg_constraint 
      WHERE conname = 'campaigns_company_id_fkey'
    ) THEN
      -- Constraint already exists, skip
      NULL;
    ELSE
      ALTER TABLE public.campaigns
        ADD CONSTRAINT campaigns_company_id_fkey
          FOREIGN KEY (company_id)
          REFERENCES public.companies (id)
          ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Ensure campaigns has a 'name' column (might be 'title' in some migrations)
DO $$
BEGIN
  -- If name doesn't exist but title does, rename title to name
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'campaigns' 
    AND column_name = 'title'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'campaigns' 
    AND column_name = 'name'
  ) THEN
    ALTER TABLE public.campaigns RENAME COLUMN title TO name;
  END IF;
  
  -- If neither exists, add name
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'campaigns' 
    AND column_name = 'name'
  ) THEN
    ALTER TABLE public.campaigns ADD COLUMN name text;
  END IF;
END $$;

-- Backfill company_id on campaigns from leads (for existing campaigns)
-- This ensures campaigns have company_id set based on their leads
UPDATE public.campaigns c
SET company_id = (
  SELECT DISTINCT l.company_id
  FROM public.leads l
  WHERE l.campaign_id = c.id
    AND l.company_id IS NOT NULL
  LIMIT 1
)
WHERE c.company_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.campaign_id = c.id
      AND l.company_id IS NOT NULL
  );

-- ============================================================================
-- 3. Per-Campaign Money View — campaign_money_view
-- ============================================================================
-- This view summarizes, for each campaign (within a company):
-- - total leads
-- - hot / warm / not interested
-- - pipeline value (new + working)
-- - booked value (booked)

CREATE OR REPLACE VIEW public.campaign_money_view AS
WITH campaign_company_ids AS (
  SELECT 
    c.id AS campaign_id,
    COALESCE(c.company_id, (
      SELECT DISTINCT l.company_id
      FROM public.leads l
      WHERE l.campaign_id = c.id
        AND l.company_id IS NOT NULL
      LIMIT 1
    )) AS company_id
  FROM public.campaigns c
)
SELECT
  c.id AS campaign_id,
  cci.company_id,
  c.name AS campaign_name,

  -- counts
  COUNT(l.*)                                                     AS leads_count,
  COUNT(*) FILTER (WHERE l.intent = 'hot')                       AS hot_leads,
  COUNT(*) FILTER (WHERE l.intent = 'warm')                      AS warm_leads,
  COUNT(*) FILTER (WHERE l.intent = 'not_interested')            AS not_interested_leads,

  -- values
  COALESCE(SUM(l.estimated_job_value)
      FILTER (WHERE l.status IN ('new','working')), 0)           AS pipeline_value,
  COALESCE(SUM(l.estimated_job_value)
      FILTER (WHERE l.status = 'booked'), 0)                     AS booked_value,

  -- helper %s
  CASE
    WHEN COUNT(l.*) = 0 THEN 0
    ELSE ROUND(
      (COUNT(*) FILTER (WHERE l.intent = 'hot')::numeric
       / COUNT(l.*)::numeric) * 100, 1
    )
  END                                                             AS hot_rate_percent,

  CASE
    WHEN COUNT(l.*) = 0 THEN 0
    ELSE ROUND(
      (COUNT(*) FILTER (WHERE l.intent IN ('hot','warm'))::numeric
       / COUNT(l.*)::numeric) * 100, 1
    )
  END                                                             AS opp_rate_percent

FROM public.campaigns c
LEFT JOIN campaign_company_ids cci ON cci.campaign_id = c.id
LEFT JOIN public.leads l
  ON l.campaign_id = c.id
GROUP BY c.id, cci.company_id, c.name;

-- Add comment
COMMENT ON VIEW public.campaign_money_view IS 'Block 21724: Per-campaign money view showing leads, intent breakdown, pipeline value, and booked value';

-- ============================================================================
-- 4. RLS for the view (if needed)
-- ============================================================================
-- Note: Views inherit RLS from underlying tables, but we can add a policy
-- to ensure company_id filtering works correctly

-- The view will be filtered by company_id in the API route using auth_company_id()
-- No additional RLS policy needed if campaigns and leads have proper RLS

