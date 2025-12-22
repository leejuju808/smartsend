-- =========================================================
-- Block 21715 — SmartSend Roofing Follow-Up Engine RLS + Security v1
-- =========================================================
-- 
-- This locks down the entire Follow-Up Brain so:
-- - Each roofing company only sees their own leads
-- - Dashboard + metrics don't leak across accounts
-- - Everything works clean with Supabase client SDK
--
-- This block is pure SQL: RLS + policies for the new tables + views.

-- ============================================================================
-- 1. Auth Helper Function — auth_company_id()
-- ============================================================================
-- Extracts company_id from JWT custom claims

CREATE OR REPLACE FUNCTION public.auth_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT (auth.jwt() ->> 'company_id')::uuid;
$$;

COMMENT ON FUNCTION public.auth_company_id() IS 'Block 21715: Returns company_id from JWT custom claims for RLS policies';

-- ============================================================================
-- 2. Enable RLS + Policies — follow_up_profiles
-- ============================================================================

ALTER TABLE public.follow_up_profiles ENABLE ROW LEVEL SECURITY;

-- SELECT
DROP POLICY IF EXISTS "Follow-up profiles are company scoped (read)" ON public.follow_up_profiles;
CREATE POLICY "Follow-up profiles are company scoped (read)"
ON public.follow_up_profiles
FOR SELECT
TO authenticated
USING (company_id = auth_company_id());

-- INSERT
DROP POLICY IF EXISTS "Follow-up profiles are company scoped (insert)" ON public.follow_up_profiles;
CREATE POLICY "Follow-up profiles are company scoped (insert)"
ON public.follow_up_profiles
FOR INSERT
TO authenticated
WITH CHECK (company_id = auth_company_id());

-- UPDATE
DROP POLICY IF EXISTS "Follow-up profiles are company scoped (update)" ON public.follow_up_profiles;
CREATE POLICY "Follow-up profiles are company scoped (update)"
ON public.follow_up_profiles
FOR UPDATE
TO authenticated
USING (company_id = auth_company_id())
WITH CHECK (company_id = auth_company_id());

-- DELETE
DROP POLICY IF EXISTS "Follow-up profiles are company scoped (delete)" ON public.follow_up_profiles;
CREATE POLICY "Follow-up profiles are company scoped (delete)"
ON public.follow_up_profiles
FOR DELETE
TO authenticated
USING (company_id = auth_company_id());

-- ============================================================================
-- 3. RLS + Policies — follow_up_logs
-- ============================================================================

ALTER TABLE public.follow_up_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Follow-up logs are company scoped (read)" ON public.follow_up_logs;
CREATE POLICY "Follow-up logs are company scoped (read)"
ON public.follow_up_logs
FOR SELECT
TO authenticated
USING (company_id = auth_company_id());

DROP POLICY IF EXISTS "Follow-up logs are company scoped (insert)" ON public.follow_up_logs;
CREATE POLICY "Follow-up logs are company scoped (insert)"
ON public.follow_up_logs
FOR INSERT
TO authenticated
WITH CHECK (company_id = auth_company_id());

-- ============================================================================
-- 4. RLS + Policies — email_send_queue
-- ============================================================================
-- You probably won't insert into this from the client (only via Edge Functions),
-- but roofers may need to see "pending" / "sent" at some point.

ALTER TABLE public.email_send_queue ENABLE ROW LEVEL SECURITY;

-- SELECT only, so they can see their queue if needed
DROP POLICY IF EXISTS "Send queue read scoped by company" ON public.email_send_queue;
CREATE POLICY "Send queue read scoped by company"
ON public.email_send_queue
FOR SELECT
TO authenticated
USING (company_id = auth_company_id());

-- No insert/update from client – leave that to service-role Edge Functions.
-- (Service role policies already exist from previous migrations)

-- ============================================================================
-- 5. RLS + Policies — inbound_emails
-- ============================================================================

ALTER TABLE public.inbound_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Inbound emails are company scoped (read)" ON public.inbound_emails;
CREATE POLICY "Inbound emails are company scoped (read)"
ON public.inbound_emails
FOR SELECT
TO authenticated
USING (company_id = auth_company_id());

-- (Inserts come from webhook Edge Functions under service role → they bypass RLS.)

-- ============================================================================
-- 6. RLS + Policies — campaign_follow_up_settings
-- ============================================================================
-- Roofers will read + update these from the app.

ALTER TABLE public.campaign_follow_up_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Campaign follow-up settings read scoped by company" ON public.campaign_follow_up_settings;
CREATE POLICY "Campaign follow-up settings read scoped by company"
ON public.campaign_follow_up_settings
FOR SELECT
TO authenticated
USING (company_id = auth_company_id());

DROP POLICY IF EXISTS "Campaign follow-up settings upsert scoped by company" ON public.campaign_follow_up_settings;
CREATE POLICY "Campaign follow-up settings upsert scoped by company"
ON public.campaign_follow_up_settings
FOR INSERT, UPDATE
TO authenticated
USING (company_id = auth_company_id())
WITH CHECK (company_id = auth_company_id());

-- ============================================================================
-- 7. RLS — campaign_follow_up_stats (if you use the table)
-- ============================================================================

ALTER TABLE public.campaign_follow_up_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Follow-up stats read scoped by company" ON public.campaign_follow_up_stats;
CREATE POLICY "Follow-up stats read scoped by company"
ON public.campaign_follow_up_stats
FOR SELECT
TO authenticated
USING (company_id = auth_company_id());

-- ============================================================================
-- 8. Security for the View — campaign_follow_up_stats_view
-- ============================================================================
-- Views in Supabase inherit RLS from underlying tables.
-- You don't enable RLS on the view itself, but you do want to ensure
-- the view only returns the current company's rows.
--
-- Simplest: filter by company_id = auth_company_id() inside the view definition.

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
  WHERE company_id = auth_company_id()
  GROUP BY company_id, campaign_id
),
emails_out AS (
  SELECT
    company_id,
    campaign_id,
    COUNT(*) FILTER (WHERE follow_up_stage IS NULL) AS initial_sent,
    COUNT(*) FILTER (WHERE follow_up_stage IS NOT NULL) AS follow_ups_sent
  FROM public.email_send_queue
  WHERE status IN ('pending', 'sent', 'processing')
    AND company_id = auth_company_id()
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
    AND COALESCE(ie.company_id, fp.company_id) = auth_company_id()
  GROUP BY COALESCE(ie.company_id, fp.company_id), campaign_id
)
SELECT
  c.id AS campaign_id,
  COALESCE(p.company_id, eo.company_id, r.company_id) AS company_id,

  COALESCE(eo.initial_sent, 0) AS initial_sent,
  COALESCE(eo.follow_ups_sent, 0) AS follow_ups_sent,

  COALESCE(r.replies_total, 0) AS replies_total,
  0::int AS replies_from_followups,

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
WHERE COALESCE(p.company_id, eo.company_id, r.company_id) = auth_company_id();

COMMENT ON VIEW public.campaign_follow_up_stats_view IS 'Block 21715: Live computed follow-up metrics per campaign, company-scoped for RLS';

-- ============================================================================
-- 9. Comments
-- ============================================================================

COMMENT ON FUNCTION public.auth_company_id() IS 'Block 21715: Helper function for RLS policies - extracts company_id from JWT claims';
COMMENT ON TABLE public.follow_up_profiles IS 'Block 21715: RLS enabled - each roofing company only sees their own follow-up profiles';
COMMENT ON TABLE public.follow_up_logs IS 'Block 21715: RLS enabled - audit trail scoped by company_id';
COMMENT ON TABLE public.email_send_queue IS 'Block 21715: RLS enabled - send queue read access scoped by company_id';
COMMENT ON TABLE public.inbound_emails IS 'Block 21715: RLS enabled - inbound emails scoped by company_id';
COMMENT ON TABLE public.campaign_follow_up_settings IS 'Block 21715: RLS enabled - campaign settings scoped by company_id';
COMMENT ON TABLE public.campaign_follow_up_stats IS 'Block 21715: RLS enabled - cached stats scoped by company_id';

