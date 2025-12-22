-- ============================================================================
-- Block 261500 — SmartSend Marketing Intelligence, Attribution & Spend Control v1
-- (True Attribution · Channel ROI · Kill Losers · Scale Winners)
-- ============================================================================
--
-- This block layers a simple spend control + owner command view on top of the
-- existing attribution/ROI engine:
--   - Block 93000  : lead_sources / lead_campaigns / lead_attributions
--   - Block 27460  : roofing_marketing_spend + roofing_marketing_roi
--   - Block 26410  : roofing_lead_sources + roofing_lead_source_roi
--
-- Goals for this block:
--   1) Make every dollar traceable from spend → lead → job → profit
--   2) Give owners a “kill losers / scale winners” control surface
--   3) Provide a single Owner Marketing Command View
--
-- NOTE: We *extend* existing tables where possible instead of duplicating them.
--       New tables are workspace-scoped and RLS-aware.


-- ============================================================================
-- 1. lead_sources CATEGORY EXTENSION
-- ============================================================================
-- Add a light-weight category tag to existing public.lead_sources so marketing
-- views can group channels as: paid, organic, referral, storm, offline, etc.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'lead_sources'
      AND column_name  = 'category'
  ) THEN
    ALTER TABLE public.lead_sources
      ADD COLUMN category text;

    CREATE INDEX IF NOT EXISTS idx_lead_sources_category
      ON public.lead_sources(category)
      WHERE category IS NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.lead_sources.category IS
  'Block 261500: High-level marketing category for this source (paid, organic, referral, storm, offline, etc.).';


-- ============================================================================
-- 2. LEAD ATTRIBUTION SNAPSHOTS (LIGHTWEIGHT TABLE)
-- ============================================================================
-- While Block 93000''s public.lead_attributions table stores rich multi-touch
-- attribution, this simple table gives us a lean “source → campaign → cost”
-- snapshot per lead that downstream analytics and guardrails can query cheaply.

CREATE TABLE IF NOT EXISTS public.lead_attribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  lead_id uuid NOT NULL
    REFERENCES public.leads(id)
    ON DELETE CASCADE,

  source_id uuid
    REFERENCES public.lead_sources(id)
    ON DELETE SET NULL,

  -- Optional human-readable campaign label (e.g. "Google - Storm Reactivation")
  campaign text,

  -- Direct acquisition cost for this lead from this source/campaign
  cost numeric,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_attribution_lead_id
  ON public.lead_attribution(lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_attribution_source_id
  ON public.lead_attribution(source_id);

COMMENT ON TABLE public.lead_attribution IS
  'Block 261500: Lightweight per-lead attribution snapshot (lead → source → campaign → cost) built on top of the richer lead_attributions engine.';


-- ============================================================================
-- 3. MARKETING SPEND (GUARDRAIL-FRIENDLY)
-- ============================================================================
-- Dedicated marketing spend table tied to public.lead_sources.
-- This complements Block 27460''s public.roofing_marketing_spend, but is
-- intentionally simpler and focused on:
--   - Periodic budget amounts
--   - Per-source, per-campaign guardrail checks

CREATE TABLE IF NOT EXISTS public.marketing_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  source_id uuid NOT NULL
    REFERENCES public.lead_sources(id)
    ON DELETE CASCADE,

  campaign text,          -- optional free-form campaign label

  amount numeric NOT NULL,

  -- Granularity of this spend row: ''daily'', ''weekly'', ''monthly'', or custom
  period text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_spend_source_id
  ON public.marketing_spend(source_id);

CREATE INDEX IF NOT EXISTS idx_marketing_spend_period
  ON public.marketing_spend(period);

COMMENT ON TABLE public.marketing_spend IS
  'Block 261500: Simple per-source/campaign marketing spend rows (amount + period) used for guardrails and spend control.';


-- ============================================================================
-- 4. RLS FOR MARKETING_SPEND
-- ============================================================================
-- We scope access to the workspace owning the underlying lead_source.

ALTER TABLE public.marketing_spend ENABLE ROW LEVEL SECURITY;

CREATE POLICY "marketing_spend_select_workspace_members"
  ON public.marketing_spend
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.lead_sources ls
      JOIN public.workspace_members wm
        ON wm.workspace_id = ls.workspace_id
      WHERE ls.id = marketing_spend.source_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "marketing_spend_modify_workspace_members"
  ON public.marketing_spend
  FOR INSERT, UPDATE, DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.lead_sources ls
      JOIN public.workspace_members wm
        ON wm.workspace_id = ls.workspace_id
      WHERE ls.id = marketing_spend.source_id
        AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.lead_sources ls
      JOIN public.workspace_members wm
        ON wm.workspace_id = ls.workspace_id
      WHERE ls.id = marketing_spend.source_id
        AND wm.user_id = auth.uid()
    )
  );


-- ============================================================================
-- 5. OWNER MARKETING COMMAND VIEW
-- ============================================================================
-- High-level “one screen” owner view built on top of Block 27460''s
-- public.roofing_marketing_roi view:
--   - Total Spend
--   - Revenue Attributed
--   - Net Marketing ROI (× multiplier)
--   - Biggest Winner Source
--   - Biggest Loser Source
--
-- NOTE: Time-windowing (e.g. last 30 days) is handled at the app/query layer
-- using spend_date ranges in roofing_marketing_spend; this view focuses on
-- the aggregated shape.

CREATE OR REPLACE VIEW public.owner_marketing_command_view AS
WITH roi AS (
  SELECT
    workspace_id,
    source,
    total_revenue,
    total_profit,
    total_cost
  FROM public.roofing_marketing_roi
),
agg AS (
  SELECT
    workspace_id,
    COALESCE(SUM(total_cost), 0)   AS total_spend,
    COALESCE(SUM(total_revenue), 0) AS revenue_attributed,
    COALESCE(SUM(total_profit), 0)  AS total_profit
  FROM roi
  GROUP BY workspace_id
),
ranked AS (
  SELECT
    workspace_id,
    source,
    total_profit,
    ROW_NUMBER() OVER (PARTITION BY workspace_id ORDER BY total_profit DESC) AS profit_rank_desc,
    ROW_NUMBER() OVER (PARTITION BY workspace_id ORDER BY total_profit ASC)  AS profit_rank_asc
  FROM roi
)
SELECT
  a.workspace_id,
  a.total_spend,
  a.revenue_attributed,
  CASE
    WHEN a.total_spend > 0
      THEN ROUND(a.total_profit / a.total_spend, 2)
    ELSE NULL
  END AS net_marketing_roi_multiplier,
  -- Biggest winner (highest profit)
  (SELECT r.source
   FROM ranked r
   WHERE r.workspace_id = a.workspace_id
     AND r.profit_rank_desc = 1
   LIMIT 1) AS biggest_winner_source,
  -- Biggest loser (lowest profit)
  (SELECT r.source
   FROM ranked r
   WHERE r.workspace_id = a.workspace_id
     AND r.profit_rank_asc = 1
   LIMIT 1) AS biggest_loser_source
FROM agg a;

COMMENT ON VIEW public.owner_marketing_command_view IS
  'Block 261500: Owner-level marketing command view (total spend, attributed revenue, net ROI multiplier, biggest winner/loser sources) built on top of roofing_marketing_roi.';

GRANT SELECT ON public.owner_marketing_command_view TO authenticated;













