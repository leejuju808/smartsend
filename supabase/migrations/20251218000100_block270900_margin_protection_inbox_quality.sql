-- =========================================================
-- Block 270900 — SmartSend Margin Protection Sprint
-- Inbox Job Quality Tags + Profit-First Priority (Premium / Standard / Low-fit)
-- =========================================================
--
-- This migration upgrades `public.inbox_view` to surface:
-- - job_quality_tag: premium | standard | low_fit
-- - profit_priority_score: numeric score used to sort the inbox by profit potential
--
-- NOTE:
-- We implement these as VIEW-computed fields (no new tables required) so the UI/API
-- can adopt immediately and the logic can evolve without backfills.
--
-- Source of truth for inbox list queries is `public.inbox_view` (Block 20740/21718).

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
  ) as estimated_job_value,

  -- =========================================================
  -- Block 270900: Job Quality Tag (Premium / Standard / Low-fit)
  -- =========================================================
  -- Signals:
  -- - "language": last_message_preview
  -- - "urgency/seriousness": hot_lead_score, claim stage, install_ready
  -- - "money": estimated_job_value

  CASE
    -- Strong low-fit language (budget-only / cheap / small patch / renters / warranty)
    WHEN lower(COALESCE(t.last_message_preview, '')) ~
      '(cheap|cheapest|lowest\\s+price|low\\s+cost|budget|discount|deal|coupon|how\\s+cheap|can\\s+you\\s+do\\s+it\\s+for\\s+\\$?\\d+|just\\s+a\\s+patch|patch\\s+job|small\\s+repair\\s+only|quick\\s+patch|handyman|home\\s+warranty|warranty\\s+company|tenant|renter|landlord)'
      THEN 'low_fit'
    -- Extremely low money signal (and not an insurance-install-ready case)
    WHEN COALESCE(l.estimated_job_value, rj.projected_job_value, t.thread_estimated_value, 0) > 0
      AND COALESCE(l.estimated_job_value, rj.projected_job_value, t.thread_estimated_value, 0) < 2500
      AND COALESCE(t.insurance_install_ready, false) = false
      THEN 'low_fit'
    -- Premium: strong money OR install-ready OR approved claim stages OR explicit replace language
    WHEN COALESCE(l.estimated_job_value, rj.projected_job_value, t.thread_estimated_value, 0) >= 20000
      THEN 'premium'
    WHEN COALESCE(t.insurance_install_ready, false) = true
      THEN 'premium'
    WHEN COALESCE(t.insurance_claim_status, '') IN ('approved', 'approved_acv_only', 'supplements_needed')
      THEN 'premium'
    WHEN lower(COALESCE(t.last_message_preview, '')) ~ '(full\\s+roof|roof\\s+replacement|replace\\s+the\\s+roof|reroof|new\\s+roof)'
      THEN 'premium'
    ELSE 'standard'
  END as job_quality_tag,

  -- =========================================================
  -- Block 270900: Profit-first priority score
  -- =========================================================
  (
    -- Tag weight
    CASE
      WHEN (
        CASE
          WHEN lower(COALESCE(t.last_message_preview, '')) ~
            '(cheap|cheapest|lowest\\s+price|low\\s+cost|budget|discount|deal|coupon|how\\s+cheap|can\\s+you\\s+do\\s+it\\s+for\\s+\\$?\\d+|just\\s+a\\s+patch|patch\\s+job|small\\s+repair\\s+only|quick\\s+patch|handyman|home\\s+warranty|warranty\\s+company|tenant|renter|landlord)'
            THEN 'low_fit'
          WHEN COALESCE(l.estimated_job_value, rj.projected_job_value, t.thread_estimated_value, 0) > 0
            AND COALESCE(l.estimated_job_value, rj.projected_job_value, t.thread_estimated_value, 0) < 2500
            AND COALESCE(t.insurance_install_ready, false) = false
            THEN 'low_fit'
          WHEN COALESCE(l.estimated_job_value, rj.projected_job_value, t.thread_estimated_value, 0) >= 20000
            THEN 'premium'
          WHEN COALESCE(t.insurance_install_ready, false) = true
            THEN 'premium'
          WHEN COALESCE(t.insurance_claim_status, '') IN ('approved', 'approved_acv_only', 'supplements_needed')
            THEN 'premium'
          WHEN lower(COALESCE(t.last_message_preview, '')) ~ '(full\\s+roof|roof\\s+replacement|replace\\s+the\\s+roof|reroof|new\\s+roof)'
            THEN 'premium'
          ELSE 'standard'
        END
      ) = 'premium' THEN 100
      WHEN (
        CASE
          WHEN lower(COALESCE(t.last_message_preview, '')) ~
            '(cheap|cheapest|lowest\\s+price|low\\s+cost|budget|discount|deal|coupon|how\\s+cheap|can\\s+you\\s+do\\s+it\\s+for\\s+\\$?\\d+|just\\s+a\\s+patch|patch\\s+job|small\\s+repair\\s+only|quick\\s+patch|handyman|home\\s+warranty|warranty\\s+company|tenant|renter|landlord)'
            THEN 'low_fit'
          WHEN COALESCE(l.estimated_job_value, rj.projected_job_value, t.thread_estimated_value, 0) > 0
            AND COALESCE(l.estimated_job_value, rj.projected_job_value, t.thread_estimated_value, 0) < 2500
            AND COALESCE(t.insurance_install_ready, false) = false
            THEN 'low_fit'
          WHEN COALESCE(l.estimated_job_value, rj.projected_job_value, t.thread_estimated_value, 0) >= 20000
            THEN 'premium'
          WHEN COALESCE(t.insurance_install_ready, false) = true
            THEN 'premium'
          WHEN COALESCE(t.insurance_claim_status, '') IN ('approved', 'approved_acv_only', 'supplements_needed')
            THEN 'premium'
          WHEN lower(COALESCE(t.last_message_preview, '')) ~ '(full\\s+roof|roof\\s+replacement|replace\\s+the\\s+roof|reroof|new\\s+roof)'
            THEN 'premium'
          ELSE 'standard'
        END
      ) = 'standard' THEN 50
      ELSE 0
    END
    +
    -- Money signal (0..50)
    LEAST(50, GREATEST(0, COALESCE(l.estimated_job_value, rj.projected_job_value, t.thread_estimated_value, 0) / 1000))
    +
    -- Heat signal (0..50)
    LEAST(50, GREATEST(0, COALESCE(rj.hot_lead_score, hls.heat_score, 0) / 2))
    +
    -- Install-ready bonus
    CASE WHEN COALESCE(t.insurance_install_ready, false) = true THEN 20 ELSE 0 END
    +
    -- Penalty for explicit low-fit language
    CASE
      WHEN lower(COALESCE(t.last_message_preview, '')) ~
        '(cheap|cheapest|lowest\\s+price|low\\s+cost|budget|discount|deal|coupon|how\\s+cheap|just\\s+a\\s+patch|patch\\s+job|handyman|home\\s+warranty|tenant|renter|landlord)'
        THEN -75
      ELSE 0
    END
  )::numeric as profit_priority_score

FROM public.inbox_threads t
LEFT JOIN public.contacts c ON t.contact_id = c.id
LEFT JOIN public.roofing_jobs rj ON (
  rj.thread_id = t.id
  OR rj.contact_id = t.contact_id
  OR rj.lead_id = t.lead_id
)
LEFT JOIN public.hot_lead_scores hls ON hls.contact_id = t.contact_id
LEFT JOIN public.follow_up_profiles fp ON (
  fp.contact_id = t.contact_id
  AND fp.campaign_id = t.campaign_id
)
LEFT JOIN public.leads l ON (
  l.id = t.lead_id
  OR (t.lead_id IS NULL AND c.email IS NOT NULL AND l.email = c.email AND l.workspace_id = t.workspace_id)
)
WHERE t.workspace_id IS NOT NULL;

COMMENT ON VIEW public.inbox_view IS 'Block 270900: Inbox view with job quality tag + profit-first priority score for margin protection.';





