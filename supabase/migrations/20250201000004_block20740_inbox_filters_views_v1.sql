-- =========================================================
-- Block 20740 — SmartSend Inbox Filters + Views v1
-- (Carrier Filters • Claim Status Filters • Hot Lead Filters • Job Stage Filters)
-- =========================================================
--
-- This block makes SmartSend's Inbox feel like a true command center for roofing companies.
-- Roofers can slice their inbox by money, insurance status, and urgency.
-- =========================================================

-- ============================================================================
-- PART 1 — Create inbox_view Materialized View (Optional but Recommended)
-- ============================================================================
-- This view combines data from inbox_threads, roofing_jobs, and hot_lead_scores
-- for fast filtering and querying

CREATE OR REPLACE VIEW public.inbox_view AS
SELECT 
  -- Thread basics
  t.id as thread_id,
  t.campaign_id,
  t.contact_id,
  t.lead_id,
  t.workspace_id,
  t.status as thread_status,
  t.last_message_at,
  t.created_at as thread_created_at,
  t.updated_at as thread_updated_at,
  
  -- Contact info
  c.first_name,
  c.last_name,
  c.email as contact_email,
  c.phone as contact_phone,
  CONCAT(c.first_name, ' ', c.last_name) as contact_name,
  c.city,
  c.state,
  c.address as contact_address,
  
  -- Insurance carrier (from inbox_threads)
  t.insurance_carrier,
  
  -- Claim status (from inbox_threads - Insurance Brain)
  t.insurance_claim_status,
  
  -- Claim details
  t.insurance_claim_number,
  t.insurance_adjuster_name,
  t.insurance_adjuster_phone,
  t.insurance_deductible_amount,
  t.insurance_payout_type,
  t.insurance_install_ready,
  
  -- Lead heat score (from roofing_jobs or hot_lead_scores)
  COALESCE(rj.hot_lead_score, hls.heat_score, NULL) as hot_lead_score,
  CASE 
    WHEN COALESCE(rj.hot_lead_score, hls.heat_score, 0) >= 80 THEN 'HOT'
    WHEN COALESCE(rj.hot_lead_score, hls.heat_score, 0) >= 60 THEN 'WARM'
    WHEN COALESCE(rj.hot_lead_score, hls.heat_score, 0) >= 40 THEN 'NURTURE'
    WHEN COALESCE(rj.hot_lead_score, hls.heat_score, 0) >= 20 THEN 'COLD'
    ELSE 'NOT_A_FIT'
  END as lead_heat_level,
  
  -- Job stage (from roofing_jobs)
  rj.current_stage as job_stage,
  rj.projected_job_value,
  rj.status_reason,
  
  -- Proposal and supplement flags
  t.has_parsed_scope,
  EXISTS(
    SELECT 1 FROM public.proposal_email_sends pes 
    WHERE pes.thread_id = t.id AND pes.status = 'sent'
  ) as proposal_sent,
  COALESCE((t.profitability_signals->>'supplement_opportunity')::boolean, false) as supplement_opportunity,
  EXISTS(
    SELECT 1 FROM public.adjuster_emails ae 
    WHERE ae.thread_id = t.id 
      AND ae.email_type = 'supplement_request' 
      AND ae.status = 'sent'
  ) as supplement_sent,
  
  -- Adjuster contact flags (from adjuster_emails table)
  EXISTS(
    SELECT 1 FROM public.adjuster_emails ae 
    WHERE ae.thread_id = t.id AND ae.status = 'sent'
  ) as adjuster_contacted,
  EXISTS(
    SELECT 1 FROM public.inbox_messages im 
    WHERE im.thread_id = t.id 
      AND im.direction = 'in' 
      AND im.from_email = t.insurance_adjuster_email
      AND im.received_at > (
        SELECT MAX(sent_at) FROM public.adjuster_emails ae2 
        WHERE ae2.thread_id = t.id AND ae2.status = 'sent'
      )
  ) as adjuster_replied,
  
  -- Message preview
  t.last_message_preview,
  t.last_direction,
  
  -- Value and revenue
  t.thread_estimated_value,
  t.close_probability_score,
  t.pipeline_stage
FROM public.inbox_threads t
LEFT JOIN public.contacts c ON t.contact_id = c.id
LEFT JOIN public.roofing_jobs rj ON (
  rj.thread_id = t.id 
  OR rj.contact_id = t.contact_id 
  OR rj.lead_id = t.lead_id
)
LEFT JOIN public.hot_lead_scores hls ON hls.contact_id = t.contact_id
WHERE t.workspace_id IS NOT NULL;

-- Indexes for performance (on underlying tables)
-- Most indexes already exist, but ensure we have them for filtering

CREATE INDEX IF NOT EXISTS idx_inbox_threads_insurance_carrier_filter 
  ON public.inbox_threads(insurance_carrier) 
  WHERE insurance_carrier IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbox_threads_claim_status_filter 
  ON public.inbox_threads(insurance_claim_status) 
  WHERE insurance_claim_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbox_threads_install_ready 
  ON public.inbox_threads(insurance_install_ready) 
  WHERE insurance_install_ready = true;

-- Indexes for proposal_email_sends (for proposal_sent queries)
CREATE INDEX IF NOT EXISTS idx_proposal_email_sends_thread_status 
  ON public.proposal_email_sends(thread_id, status) 
  WHERE status = 'sent';

-- Indexes for supplement queries (using profitability_signals GIN index already exists)
CREATE INDEX IF NOT EXISTS idx_adjuster_emails_thread_type_status 
  ON public.adjuster_emails(thread_id, email_type, status) 
  WHERE email_type = 'supplement_request' AND status = 'sent';

-- ============================================================================
-- PART 2 — Helper Function: Get Inbox Counts by Filter
-- ============================================================================
-- Returns counts for each filter category for UI display
-- Note: This is a simplified version - for production, consider caching or materialized view

CREATE OR REPLACE FUNCTION public.get_inbox_filter_counts(
  p_workspace_id uuid,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result jsonb;
  v_carriers jsonb;
  v_claim_statuses jsonb;
  v_lead_heat jsonb;
  v_job_stages jsonb;
BEGIN
  -- Carrier counts
  SELECT jsonb_object_agg(
    COALESCE(insurance_carrier, 'Other Carriers'),
    count
  ) INTO v_carriers
  FROM (
    SELECT 
      COALESCE(insurance_carrier, 'Other Carriers') as insurance_carrier,
      COUNT(*) as count
    FROM public.inbox_threads
    WHERE workspace_id = p_workspace_id
      AND (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
      AND (insurance_carrier IS NOT NULL OR is_insurance_claim = true)
    GROUP BY COALESCE(insurance_carrier, 'Other Carriers')
  ) carrier_counts;
  
  -- Claim status counts
  SELECT jsonb_object_agg(
    COALESCE(insurance_claim_status, 'no_claim_filed'),
    count
  ) INTO v_claim_statuses
  FROM (
    SELECT 
      COALESCE(insurance_claim_status, 'no_claim_filed') as insurance_claim_status,
      COUNT(*) as count
    FROM public.inbox_threads
    WHERE workspace_id = p_workspace_id
      AND (p_campaign_id IS NULL OR campaign_id = p_campaign_id)
    GROUP BY COALESCE(insurance_claim_status, 'no_claim_filed')
  ) status_counts;
  
  -- Lead heat counts
  SELECT jsonb_build_object(
    'HOT', COUNT(*) FILTER (WHERE hot_score >= 80),
    'WARM', COUNT(*) FILTER (WHERE hot_score >= 60 AND hot_score < 80),
    'NURTURE', COUNT(*) FILTER (WHERE hot_score >= 40 AND hot_score < 60),
    'COLD', COUNT(*) FILTER (WHERE hot_score >= 20 AND hot_score < 40),
    'NOT_A_FIT', COUNT(*) FILTER (WHERE hot_score < 20 OR hot_score IS NULL)
  ) INTO v_lead_heat
  FROM (
    SELECT 
      COALESCE(rj.hot_lead_score, hls.heat_score, 0) as hot_score
    FROM public.inbox_threads t
    LEFT JOIN public.roofing_jobs rj ON rj.thread_id = t.id OR rj.contact_id = t.contact_id
    LEFT JOIN public.hot_lead_scores hls ON hls.contact_id = t.contact_id
    WHERE t.workspace_id = p_workspace_id
      AND (p_campaign_id IS NULL OR t.campaign_id = p_campaign_id)
  ) heat_scores;
  
  -- Job stage counts
  SELECT jsonb_object_agg(
    COALESCE(current_stage::text, 'NEW_LEAD'),
    count
  ) INTO v_job_stages
  FROM (
    SELECT 
      COALESCE(rj.current_stage::text, 'NEW_LEAD') as current_stage,
      COUNT(DISTINCT t.id) as count
    FROM public.inbox_threads t
    LEFT JOIN public.roofing_jobs rj ON rj.thread_id = t.id OR rj.contact_id = t.contact_id
    WHERE t.workspace_id = p_workspace_id
      AND (p_campaign_id IS NULL OR t.campaign_id = p_campaign_id)
    GROUP BY COALESCE(rj.current_stage::text, 'NEW_LEAD')
  ) stage_counts;
  
  -- Build result
  v_result := jsonb_build_object(
    'carriers', COALESCE(v_carriers, '{}'::jsonb),
    'claim_statuses', COALESCE(v_claim_statuses, '{}'::jsonb),
    'lead_heat', COALESCE(v_lead_heat, '{}'::jsonb),
    'job_stages', COALESCE(v_job_stages, '{}'::jsonb)
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_inbox_filter_counts IS 'Returns counts for carrier, claim status, lead heat, and job stage filters for inbox UI';

-- ============================================================================
-- PART 3 — Comments
-- ============================================================================

COMMENT ON VIEW public.inbox_view IS 'Combined view of inbox threads with insurance, lead heat, and job stage data for filtering';
COMMENT ON INDEX idx_inbox_threads_insurance_carrier_filter IS 'Index for carrier filter performance';
COMMENT ON INDEX idx_inbox_threads_claim_status_filter IS 'Index for claim status filter performance';
COMMENT ON INDEX idx_inbox_threads_install_ready IS 'Index for install-ready smart view';
COMMENT ON INDEX idx_proposal_email_sends_thread_status IS 'Index for proposal_sent queries in inbox view';
COMMENT ON INDEX idx_adjuster_emails_thread_type_status IS 'Index for supplement_sent queries in inbox view';

