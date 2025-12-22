-- Block 269 — A/B Testing v2
-- Variant Weighting, Auto-Winner, Per-Sentence Heatmaps, Smarter Analytics
-- Migration: 288_template_variants_v2.sql

-- ============================================================================
-- 1. Extend template_variants table with v2 fields
-- ============================================================================

ALTER TABLE public.template_variants
ADD COLUMN IF NOT EXISTS weight int DEFAULT 50,            -- percent of traffic
ADD COLUMN IF NOT EXISTS is_winner boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS experiment_group text,            -- optional name of test group
ADD COLUMN IF NOT EXISTS stats jsonb DEFAULT '{}'::jsonb,  -- cached summary
ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false; -- for archiving losers

-- Create index for winner queries
CREATE INDEX IF NOT EXISTS idx_template_variants_winner 
ON public.template_variants(template_id, is_winner) 
WHERE is_winner = true;

-- Create index for active (non-archived) variants
CREATE INDEX IF NOT EXISTS idx_template_variants_active 
ON public.template_variants(template_id, is_archived) 
WHERE is_archived = false;

-- ============================================================================
-- 2. Add template_variant_id to message tracking tables
-- ============================================================================

-- Add to send_logs (primary tracking table)
ALTER TABLE public.send_logs 
ADD COLUMN IF NOT EXISTS template_variant_id uuid REFERENCES public.template_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_send_logs_template_variant 
ON public.send_logs(template_variant_id) 
WHERE template_variant_id IS NOT NULL;

-- Add to email_logs if it exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_logs') THEN
    ALTER TABLE public.email_logs 
    ADD COLUMN IF NOT EXISTS template_variant_id uuid REFERENCES public.template_variants(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_email_logs_template_variant 
    ON public.email_logs(template_variant_id) 
    WHERE template_variant_id IS NOT NULL;
  END IF;
END $$;

-- Add to campaign_logs if it exists (for event tracking)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaign_logs') THEN
    ALTER TABLE public.campaign_logs 
    ADD COLUMN IF NOT EXISTS template_variant_id uuid REFERENCES public.template_variants(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_campaign_logs_template_variant 
    ON public.campaign_logs(template_variant_id) 
    WHERE template_variant_id IS NOT NULL;
  END IF;
END $$;

-- Add to message_logs if it exists (as specified in requirements)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'message_logs') THEN
    ALTER TABLE public.message_logs 
    ADD COLUMN IF NOT EXISTS template_variant_id uuid REFERENCES public.template_variants(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_message_logs_template_variant 
    ON public.message_logs(template_variant_id) 
    WHERE template_variant_id IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- 3. Add experiment_config to templates table
-- ============================================================================

ALTER TABLE public.templates
ADD COLUMN IF NOT EXISTS experiment_config jsonb DEFAULT NULL;

-- Example structure:
-- {
--   "goal": "reply",                   -- "open" | "click" | "reply" | "meeting"
--   "min_sends": 200,
--   "min_runtime_hours": 48,
--   "auto_select_winner": true
-- }

-- ============================================================================
-- 4. Create materialized view for variant stats aggregation
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.template_variant_stats AS
SELECT
  tv.id as template_variant_id,
  tv.template_id,
  tv.campaign_id,
  tv.name,
  tv.weight,
  tv.is_winner,
  tv.is_archived,
  COUNT(DISTINCT CASE WHEN sl.id IS NOT NULL THEN sl.id END) AS sent,
  COUNT(DISTINCT CASE WHEN ee.id IS NOT NULL AND ee.event_type = 'open' THEN ee.id END) AS opens,
  COUNT(DISTINCT CASE WHEN ee.id IS NOT NULL AND ee.event_type = 'click' THEN ee.id END) AS clicks,
  COUNT(DISTINCT CASE WHEN cl.id IS NOT NULL AND cl.event = 'reply' THEN cl.id END) AS replies,
  COUNT(DISTINCT CASE WHEN cl.id IS NOT NULL AND cl.event = 'meeting_intent' THEN cl.id END) AS meetings,
  -- Calculate rates
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN sl.id IS NOT NULL THEN sl.id END) > 0 
    THEN ROUND(100.0 * COUNT(DISTINCT CASE WHEN ee.id IS NOT NULL AND ee.event_type = 'open' THEN ee.id END)::numeric / 
               COUNT(DISTINCT CASE WHEN sl.id IS NOT NULL THEN sl.id END)::numeric, 2)
    ELSE 0
  END AS open_rate,
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN sl.id IS NOT NULL THEN sl.id END) > 0 
    THEN ROUND(100.0 * COUNT(DISTINCT CASE WHEN ee.id IS NOT NULL AND ee.event_type = 'click' THEN ee.id END)::numeric / 
               COUNT(DISTINCT CASE WHEN sl.id IS NOT NULL THEN sl.id END)::numeric, 2)
    ELSE 0
  END AS click_rate,
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN sl.id IS NOT NULL THEN sl.id END) > 0 
    THEN ROUND(100.0 * COUNT(DISTINCT CASE WHEN cl.id IS NOT NULL AND cl.event = 'reply' THEN cl.id END)::numeric / 
               COUNT(DISTINCT CASE WHEN sl.id IS NOT NULL THEN sl.id END)::numeric, 2)
    ELSE 0
  END AS reply_rate,
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN sl.id IS NOT NULL THEN sl.id END) > 0 
    THEN ROUND(100.0 * COUNT(DISTINCT CASE WHEN cl.id IS NOT NULL AND cl.event = 'meeting_intent' THEN cl.id END)::numeric / 
               COUNT(DISTINCT CASE WHEN sl.id IS NOT NULL THEN sl.id END)::numeric, 2)
    ELSE 0
  END AS meeting_rate
FROM public.template_variants tv
LEFT JOIN public.send_logs sl ON sl.template_variant_id = tv.id
LEFT JOIN public.email_events ee ON ee.send_log_id = sl.id
LEFT JOIN public.campaign_logs cl ON cl.template_variant_id = tv.id
GROUP BY tv.id, tv.template_id, tv.campaign_id, tv.name, tv.weight, tv.is_winner, tv.is_archived;

-- Create index on materialized view for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_template_variant_stats_variant_id 
ON public.template_variant_stats(template_variant_id);

CREATE INDEX IF NOT EXISTS idx_template_variant_stats_template 
ON public.template_variant_stats(template_id);

CREATE INDEX IF NOT EXISTS idx_template_variant_stats_campaign 
ON public.template_variant_stats(campaign_id);

-- ============================================================================
-- 5. Function to refresh variant stats (call periodically or after batch jobs)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refresh_template_variant_stats()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.template_variant_stats;
END;
$$;

-- ============================================================================
-- 6. Auto-winner selection function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.select_experiment_winner(
  p_template_id uuid,
  p_min_sends_per_variant int DEFAULT 50,
  p_min_total_sends int DEFAULT 200,
  p_min_runtime_hours int DEFAULT 48
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_config jsonb;
  v_goal text;
  v_min_sends int;
  v_min_runtime int;
  v_auto_select boolean;
  v_winner_id uuid;
  v_winner_rate numeric;
  v_template_created_at timestamptz;
BEGIN
  -- Get experiment config
  SELECT experiment_config, created_at INTO v_config, v_template_created_at
  FROM public.templates
  WHERE id = p_template_id;
  
  IF v_config IS NULL THEN
    RETURN NULL; -- No experiment config, skip
  END IF;
  
  v_goal := v_config->>'goal';
  v_min_sends := COALESCE((v_config->>'min_sends')::int, p_min_total_sends);
  v_min_runtime := COALESCE((v_config->>'min_runtime_hours')::int, p_min_runtime_hours);
  v_auto_select := COALESCE((v_config->>'auto_select_winner')::boolean, false);
  
  IF NOT v_auto_select THEN
    RETURN NULL; -- Auto-select disabled
  END IF;
  
  -- Check runtime requirement
  IF v_template_created_at > NOW() - (v_min_runtime::text || ' hours')::interval THEN
    RETURN NULL; -- Not enough runtime yet
  END IF;
  
  -- Get variant stats
  WITH variant_metrics AS (
    SELECT 
      tvs.template_variant_id,
      tvs.sent,
      CASE v_goal
        WHEN 'open' THEN tvs.opens::numeric / NULLIF(tvs.sent, 0)
        WHEN 'click' THEN tvs.clicks::numeric / NULLIF(tvs.sent, 0)
        WHEN 'reply' THEN tvs.replies::numeric / NULLIF(tvs.sent, 0)
        WHEN 'meeting' THEN tvs.meetings::numeric / NULLIF(tvs.sent, 0)
        ELSE 0
      END AS goal_rate
    FROM public.template_variant_stats tvs
    WHERE tvs.template_id = p_template_id
      AND tvs.is_archived = false
  ),
  total_sends AS (
    SELECT SUM(sent) as total FROM variant_metrics
  )
  SELECT 
    vm.template_variant_id,
    vm.goal_rate
  INTO v_winner_id, v_winner_rate
  FROM variant_metrics vm
  CROSS JOIN total_sends ts
  WHERE vm.sent >= p_min_sends_per_variant  -- Each variant has minimum sends
    AND ts.total >= v_min_sends              -- Total sends meets threshold
  ORDER BY vm.goal_rate DESC
  LIMIT 1;
  
  -- If we found a winner, mark it
  IF v_winner_id IS NOT NULL THEN
    UPDATE public.template_variants
    SET is_winner = (id = v_winner_id)
    WHERE template_id = p_template_id;
    
    -- Optionally auto-adjust weights: winner → 80, others → 20 split
    UPDATE public.template_variants
    SET weight = CASE 
      WHEN id = v_winner_id THEN 80
      ELSE 20
    END
    WHERE template_id = p_template_id AND is_archived = false;
  END IF;
  
  RETURN v_winner_id;
END;
$$;

-- ============================================================================
-- 7. Function to normalize variant weights (ensures they sum to ~100)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.normalize_variant_weights(p_template_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_weight int;
  v_active_count int;
BEGIN
  -- Get total weight and count of active variants
  SELECT 
    COALESCE(SUM(weight), 0),
    COUNT(*)
  INTO v_total_weight, v_active_count
  FROM public.template_variants
  WHERE template_id = p_template_id 
    AND is_archived = false;
  
  -- If total is 0 or very different from 100, normalize proportionally
  IF v_total_weight > 0 AND v_total_weight != 100 THEN
    UPDATE public.template_variants
    SET weight = ROUND((weight::numeric / v_total_weight::numeric) * 100)::int
    WHERE template_id = p_template_id 
      AND is_archived = false;
  ELSIF v_total_weight = 0 AND v_active_count > 0 THEN
    -- If all weights are 0, distribute evenly
    UPDATE public.template_variants
    SET weight = ROUND(100.0 / v_active_count)::int
    WHERE template_id = p_template_id 
      AND is_archived = false;
  END IF;
END;
$$;

-- ============================================================================
-- 8. RPC function to update variant weights (with normalization)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_variant_weights(
  p_template_id uuid,
  p_variants jsonb  -- Array of {id, weight}
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_variant jsonb;
BEGIN
  -- Update weights for each variant
  FOR v_variant IN SELECT * FROM jsonb_array_elements(p_variants)
  LOOP
    UPDATE public.template_variants
    SET weight = (v_variant->>'weight')::int
    WHERE id = (v_variant->>'id')::uuid
      AND template_id = p_template_id;
  END LOOP;
  
  -- Normalize weights
  PERFORM public.normalize_variant_weights(p_template_id);
END;
$$;

-- ============================================================================
-- 9. RPC function to mark a variant as winner
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_variant_winner(
  p_template_id uuid,
  p_variant_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Set winner flag
  UPDATE public.template_variants
  SET is_winner = (id = p_variant_id)
  WHERE template_id = p_template_id;
  
  -- Adjust weights: winner → 100, others → 0 (or low)
  UPDATE public.template_variants
  SET weight = CASE 
    WHEN id = p_variant_id THEN 100
    ELSE 0
  END
  WHERE template_id = p_template_id;
END;
$$;

-- ============================================================================
-- 10. Grant permissions
-- ============================================================================

-- Grant execute on functions to authenticated users
GRANT EXECUTE ON FUNCTION public.refresh_template_variant_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.select_experiment_winner(uuid, int, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_variant_weights(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_variant_weights(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_variant_winner(uuid, uuid) TO authenticated;

-- Grant select on materialized view
GRANT SELECT ON public.template_variant_stats TO authenticated;

-- ============================================================================
-- 11. Comments for documentation
-- ============================================================================

COMMENT ON COLUMN public.template_variants.weight IS 'Percent of traffic for this variant (should sum to ~100 across active variants)';
COMMENT ON COLUMN public.template_variants.is_winner IS 'True if this variant won the experiment';
COMMENT ON COLUMN public.template_variants.experiment_group IS 'Optional name/group identifier for the experiment';
COMMENT ON COLUMN public.template_variants.stats IS 'Cached summary statistics (jsonb)';
COMMENT ON COLUMN public.template_variants.is_archived IS 'True if variant is archived (excluded from selection)';
COMMENT ON COLUMN public.templates.experiment_config IS 'Experiment configuration: goal, min_sends, min_runtime_hours, auto_select_winner';
COMMENT ON MATERIALIZED VIEW public.template_variant_stats IS 'Aggregated statistics per variant: sent, opens, clicks, replies, meetings, rates';

