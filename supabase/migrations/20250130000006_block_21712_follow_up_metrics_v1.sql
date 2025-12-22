-- =========================================================
-- Block 21712 — SmartSend Roofing Follow-Up & Reply Metrics v1
-- =========================================================
-- 
-- This block gives roofers visibility into how much money 
-- the Follow-Up Brain is making them.
--
-- When a roofer logs into a campaign, they should instantly see:
-- "SmartSend sent 87 follow-ups, pulled 16 extra replies, and turned 5 into hot leads."
-- That's how you justify the subscription.

-- ============================================================================
-- 1. Metrics Table (Optional Cache) — campaign_follow_up_stats
-- ============================================================================
-- You can compute everything on the fly from existing tables, but a small 
-- cached table keeps UI snappy.

CREATE TABLE IF NOT EXISTS public.campaign_follow_up_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  campaign_id uuid NOT NULL UNIQUE,

  initial_sent int NOT NULL DEFAULT 0,
  follow_ups_sent int NOT NULL DEFAULT 0,

  replies_total int NOT NULL DEFAULT 0,
  replies_from_followups int NOT NULL DEFAULT 0,

  hot_leads int NOT NULL DEFAULT 0,
  warm_leads int NOT NULL DEFAULT 0,
  not_interested_leads int NOT NULL DEFAULT 0,

  -- simple percentages (0–100) for fast UI
  reply_rate numeric(5,2) DEFAULT 0,         -- replies_total / initial_sent * 100
  hot_lead_rate numeric(5,2) DEFAULT 0,      -- hot_leads / replies_total * 100

  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_follow_up_stats_campaign
  ON public.campaign_follow_up_stats (campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_follow_up_stats_company
  ON public.campaign_follow_up_stats (company_id);

-- ============================================================================
-- 2. Live Metrics View — campaign_follow_up_stats_view
-- ============================================================================
-- This will compute everything from:
-- - follow_up_profiles
-- - email_send_queue
-- - inbound_emails

CREATE OR REPLACE VIEW public.campaign_follow_up_stats_view AS
WITH profiles AS (
  SELECT
    company_id,
    campaign_id,
    COUNT(*) FILTER (WHERE current_stage IS NOT NULL) AS total_contacts,
    COUNT(*) FILTER (WHERE lead_intent = 'hot') AS hot_leads,
    COUNT(*) FILTER (WHERE lead_intent = 'warm') AS warm_leads,
    COUNT(*) FILTER (WHERE lead_intent = 'not_interested') AS not_interested_leads
  FROM public.follow_up_profiles
  GROUP BY company_id, campaign_id
),
emails_out AS (
  -- Count initial emails (follow_up_stage is null) and follow-ups (follow_up_stage is not null)
  SELECT
    company_id,
    campaign_id,
    COUNT(*) FILTER (WHERE follow_up_stage IS NULL) AS initial_sent,
    COUNT(*) FILTER (WHERE follow_up_stage IS NOT NULL) AS follow_ups_sent
  FROM public.email_send_queue
  WHERE status IN ('pending', 'sent', 'processing')
  GROUP BY company_id, campaign_id
),
replies AS (
  SELECT
    COALESCE(company_id, fp.company_id) AS company_id,
    campaign_id,
    COUNT(*) AS replies_total
  FROM public.inbound_emails ie
  LEFT JOIN public.follow_up_profiles fp
    ON ie.contact_id = fp.contact_id
    AND ie.campaign_id = fp.campaign_id
  WHERE campaign_id IS NOT NULL
  GROUP BY COALESCE(ie.company_id, fp.company_id), campaign_id
),
replies_from_followups AS (
  -- Simple estimate: replies that came after any follow-up was sent
  -- This is a placeholder - can be refined later by checking timestamps vs follow_up_logs
  SELECT
    fp.company_id,
    fp.campaign_id,
    COUNT(DISTINCT ie.id) AS replies_from_followups
  FROM public.inbound_emails ie
  INNER JOIN public.follow_up_profiles fp
    ON ie.contact_id = fp.contact_id
    AND ie.campaign_id = fp.campaign_id
  WHERE ie.campaign_id IS NOT NULL
    AND fp.current_stage != 'none'  -- At least one follow-up was sent
    AND fp.last_outbound_at IS NOT NULL  -- We have a follow-up timestamp
    AND ie.received_at > fp.last_outbound_at  -- Reply came after follow-up
  GROUP BY fp.company_id, fp.campaign_id
)
SELECT
  c.id AS campaign_id,
  COALESCE(p.company_id, eo.company_id, r.company_id) AS company_id,

  COALESCE(eo.initial_sent, 0) AS initial_sent,
  COALESCE(eo.follow_ups_sent, 0) AS follow_ups_sent,

  COALESCE(r.replies_total, 0) AS replies_total,
  COALESCE(rff.replies_from_followups, 0) AS replies_from_followups,

  COALESCE(p.hot_leads, 0) AS hot_leads,
  COALESCE(p.warm_leads, 0) AS warm_leads,
  COALESCE(p.not_interested_leads, 0) AS not_interested_leads,

  CASE
    WHEN COALESCE(eo.initial_sent, 0) = 0 THEN 0
    ELSE ROUND((COALESCE(r.replies_total, 0)::numeric / eo.initial_sent::numeric) * 100, 2)
  END AS reply_rate,

  CASE
    WHEN COALESCE(r.replies_total, 0) = 0 THEN 0
    ELSE ROUND((COALESCE(p.hot_leads, 0)::numeric / r.replies_total::numeric) * 100, 2)
  END AS hot_lead_rate

FROM public.campaigns c
LEFT JOIN profiles p
  ON p.campaign_id = c.id
LEFT JOIN emails_out eo
  ON eo.campaign_id = c.id
LEFT JOIN replies r
  ON r.campaign_id = c.id
LEFT JOIN replies_from_followups rff
  ON rff.campaign_id = c.id;

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE public.campaign_follow_up_stats ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for Edge Functions / cron)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'campaign_follow_up_stats'
      AND policyname = 'campaign_follow_up_stats_service_role'
  ) THEN
    CREATE POLICY "campaign_follow_up_stats_service_role"
      ON public.campaign_follow_up_stats
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Comments
COMMENT ON TABLE public.campaign_follow_up_stats IS 'Block 21712: Cached follow-up metrics per campaign (optional cache for UI performance)';
COMMENT ON VIEW public.campaign_follow_up_stats_view IS 'Block 21712: Live computed follow-up metrics per campaign from follow_up_profiles, email_send_queue, and inbound_emails';

