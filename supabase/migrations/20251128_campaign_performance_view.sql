-- =========================================================
-- Block 8590 — Campaign-level performance view
-- =========================================================

-- Create or replace campaign_performance_view for campaign-level stats
-- This aggregates replies, leads, pipeline value, and won value per campaign
DROP VIEW IF EXISTS public.campaign_performance_view;

CREATE VIEW public.campaign_performance_view AS
SELECT
  c.id                          AS campaign_id,
  c.workspace_id                AS workspace_id,
  c.name                        AS campaign_name,
  c.status                      AS campaign_status,
  c.created_at                  AS campaign_created_at,
  
  -- Replies count (from email_replies)
  COALESCE((
    SELECT COUNT(*)
    FROM public.email_replies er
    WHERE er.campaign_id = c.id
  ), 0)                         AS replies_count,
  
  -- Leads count (from leads table)
  COALESCE((
    SELECT COUNT(*)
    FROM public.leads l
    WHERE l.campaign_id = c.id
  ), 0)                         AS leads_count,
  
  -- Pipeline value: sum of estimated_value for leads with status in ('new', 'in_progress', 'won')
  COALESCE((
    SELECT SUM(estimated_value)
    FROM public.leads l
    WHERE l.campaign_id = c.id
      AND l.status IN ('new', 'in_progress', 'won')
      AND l.estimated_value IS NOT NULL
  ), 0)::text                   AS pipeline_value,
  
  -- Won value: sum of estimated_value for leads with status = 'won'
  COALESCE((
    SELECT SUM(estimated_value)
    FROM public.leads l
    WHERE l.campaign_id = c.id
      AND l.status = 'won'
      AND l.estimated_value IS NOT NULL
  ), 0)::text                   AS won_value

FROM public.campaigns c;

-- Grant access
GRANT SELECT ON public.campaign_performance_view TO authenticated, anon;

-- Add comment
COMMENT ON VIEW public.campaign_performance_view IS 
  'Campaign-level performance metrics: replies_count, leads_count, pipeline_value, won_value';
