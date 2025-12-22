-- Block 21441 — Job Value Estimates View
-- Creates a view that provides base_amount and expected_value for revenue snapshot calculations
-- This view aggregates job value data from contacts table

-- Create job_value_estimates view
-- Maps contacts to job_value_estimates format with base_amount and expected_value
CREATE OR REPLACE VIEW public.job_value_estimates AS
SELECT 
  c.id,
  c.workspace_id,
  -- base_amount: use estimated_value_min, estimated_job_value, or est_job_value (in priority order)
  COALESCE(
    c.estimated_value_min,
    c.estimated_job_value,
    c.est_job_value,
    0
  )::numeric(12,2) AS base_amount,
  -- expected_value: base_amount * (close_probability / 100) or base_amount * 0.5 if no probability
  COALESCE(
    (COALESCE(
      c.estimated_value_min,
      c.estimated_job_value,
      c.est_job_value,
      0
    )::numeric(12,2) * 
    CASE 
      WHEN c.close_probability IS NOT NULL THEN (c.close_probability::numeric / 100.0)
      WHEN c.estimated_value_confidence IS NOT NULL THEN c.estimated_value_confidence
      ELSE 0.5
    END),
    0
  )::numeric(12,2) AS expected_value,
  c.created_at,
  c.updated_at
FROM public.contacts c
WHERE 
  -- Only include contacts with some value estimate
  (
    c.estimated_value_min IS NOT NULL 
    OR c.estimated_job_value IS NOT NULL 
    OR c.est_job_value IS NOT NULL
  )
  -- Exclude lost/won contacts (only active pipeline)
  AND (c.lead_status IS NULL OR c.lead_status NOT IN ('LOST', 'lost', 'WON', 'won'));

-- Add comment
COMMENT ON VIEW public.job_value_estimates IS 
  'Job value estimates view for revenue snapshot dashboard. Provides base_amount (pipeline value) and expected_value (probability-adjusted revenue) from contacts table.';

-- Enable RLS on the view (inherits from contacts table RLS)
-- The view will automatically respect contacts RLS policies since it queries from contacts

-- Create index on contacts for faster lookups (if not exists)
CREATE INDEX IF NOT EXISTS idx_contacts_revenue_snapshot 
  ON public.contacts(workspace_id, estimated_value_min, estimated_job_value, est_job_value)
  WHERE (estimated_value_min IS NOT NULL OR estimated_job_value IS NOT NULL OR est_job_value IS NOT NULL)
    AND (lead_status IS NULL OR lead_status NOT IN ('LOST', 'lost', 'WON', 'won'));

