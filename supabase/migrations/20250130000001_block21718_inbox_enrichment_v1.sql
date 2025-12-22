-- =========================================================
-- Block 21718 — SmartSend Roofing Inbox Enrichment v1
-- (Lead intent badges + follow-up stage + money signal directly in the inbox)
-- =========================================================
--
-- Goal: when a roofer opens the Inbox, they shouldn't just see emails.
-- They should instantly see:
-- 🔥 how hot the lead is
-- 🧠 what follow-up stage they're in
-- 💰 how big the job might be
--
-- So their brain goes: "Call these 3 people first. The rest can wait."
-- =========================================================

-- ============================================================================
-- PART 1 — Extend leads Table (Money Signal)
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS estimated_job_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS source text; -- e.g. 'campaign', 'manual', etc.

COMMENT ON COLUMN public.leads.estimated_job_value IS 'Block 21718: Estimated job value in dollars for inbox money signal';
COMMENT ON COLUMN public.leads.source IS 'Block 21718: Source of the lead (e.g. campaign, manual, etc.)';

-- ============================================================================
-- PART 2 — Update inbox_view to Include Enrichment Fields
-- ============================================================================
-- Add lead_intent, follow_up_stage, follow_up_status, and estimated_job_value
-- to the inbox_view so they're available in the inbox query

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
  t.pipeline_stage,
  
  -- Block 21718: Inbox Enrichment Fields
  -- Lead intent (from follow_up_profiles or leads)
  COALESCE(
    fp.lead_intent::text,
    l.intent::text,
    CASE 
      WHEN COALESCE(rj.hot_lead_score, hls.heat_score, 0) >= 80 THEN 'hot'
      WHEN COALESCE(rj.hot_lead_score, hls.heat_score, 0) >= 60 THEN 'warm'
      WHEN COALESCE(rj.hot_lead_score, hls.heat_score, 0) >= 20 THEN 'other'
      ELSE 'unknown'
    END
  ) as lead_intent,
  
  -- Follow-up stage (from follow_up_profiles)
  COALESCE(fp.current_stage::text, 'none') as follow_up_stage,
  
  -- Follow-up status (from follow_up_profiles)
  COALESCE(fp.status::text, 'active') as follow_up_status,
  
  -- Estimated job value (from leads or roofing_jobs)
  COALESCE(
    l.estimated_job_value,
    rj.projected_job_value,
    t.thread_estimated_value
  ) as estimated_job_value

FROM public.inbox_threads t
LEFT JOIN public.contacts c ON t.contact_id = c.id
LEFT JOIN public.roofing_jobs rj ON (
  rj.thread_id = t.id 
  OR rj.contact_id = t.contact_id 
  OR rj.lead_id = t.lead_id
)
LEFT JOIN public.hot_lead_scores hls ON hls.contact_id = t.contact_id
-- Block 21718: Join follow_up_profiles for follow-up stage/status/intent
LEFT JOIN public.follow_up_profiles fp ON (
  fp.contact_id = t.contact_id 
  AND fp.campaign_id = t.campaign_id
)
-- Block 21718: Join leads for estimated_job_value and intent
-- Prioritize direct lead_id match, then fallback to email match
LEFT JOIN public.leads l ON (
  l.id = t.lead_id
  OR (t.lead_id IS NULL AND c.email IS NOT NULL AND l.email = c.email AND l.workspace_id = t.workspace_id)
)
WHERE t.workspace_id IS NOT NULL;

-- ============================================================================
-- PART 3 — Indexes for Performance
-- ============================================================================

-- Index for follow_up_profiles lookups in inbox_view
CREATE INDEX IF NOT EXISTS idx_follow_up_profiles_inbox_lookup
  ON public.follow_up_profiles(contact_id, campaign_id);

-- Index for leads lookups in inbox_view
CREATE INDEX IF NOT EXISTS idx_leads_inbox_lookup
  ON public.leads(id, workspace_id, email);

-- Index for estimated_job_value filtering
CREATE INDEX IF NOT EXISTS idx_leads_estimated_job_value
  ON public.leads(estimated_job_value DESC NULLS LAST)
  WHERE estimated_job_value IS NOT NULL;

-- ============================================================================
-- PART 4 — Comments
-- ============================================================================

COMMENT ON VIEW public.inbox_view IS 'Block 21718: Combined view of inbox threads with lead intent, follow-up stage/status, and estimated job value for inbox enrichment';

