-- =========================================================
-- Block 9990 — Pre-Launch QA Checklist v1
-- (Every System Must Pass Before We Let Roofers Touch SmartSend)
-- =========================================================

-- A. Create qa_check_categories enum
CREATE TYPE qa_check_category AS ENUM (
  'core_system',
  'billing_guard',
  'campaign_engine',
  'template_library',
  'ai_personalization',
  'reply_ai',
  'smart_routing',
  'sms_forwarding',
  'lead_timeline',
  'system_health',
  'frontend_quality',
  'performance',
  'security'
);

-- B. Create qa_check_status enum
CREATE TYPE qa_check_status AS ENUM (
  'pending',
  'pass',
  'fail',
  'warning',
  'skipped'
);

-- C. Create qa_checks table (master checklist items)
CREATE TABLE IF NOT EXISTS public.qa_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_code text NOT NULL UNIQUE,  -- e.g., 'A1', 'B2', 'C3'
  category qa_check_category NOT NULL,
  name text NOT NULL,
  description text,
  critical boolean NOT NULL DEFAULT true,  -- If true, failure blocks launch
  check_function text,  -- Name of function to call for automated check
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- D. Create qa_check_results table (actual test results)
CREATE TABLE IF NOT EXISTS public.qa_check_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  check_id uuid NOT NULL REFERENCES public.qa_checks(id) ON DELETE CASCADE,
  account_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL = system-wide check
  status qa_check_status NOT NULL DEFAULT 'pending',
  message text,  -- Success/failure message
  details jsonb DEFAULT '{}'::jsonb,  -- Additional details (errors, metrics, etc.)
  checked_at timestamptz DEFAULT now(),
  checked_by uuid REFERENCES auth.users(id),  -- Who ran the check
  created_at timestamptz DEFAULT now()
);

-- E. Create qa_check_runs table (track full QA runs)
CREATE TABLE IF NOT EXISTS public.qa_check_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL = system-wide
  run_type text NOT NULL DEFAULT 'full',  -- 'full', 'category', 'single'
  category qa_check_category,  -- NULL if full run
  check_id uuid REFERENCES public.qa_checks(id),  -- NULL if full run
  status qa_check_status NOT NULL DEFAULT 'pending',
  total_checks int DEFAULT 0,
  passed_checks int DEFAULT 0,
  failed_checks int DEFAULT 0,
  warning_checks int DEFAULT 0,
  critical_failures int DEFAULT 0,
  can_launch boolean DEFAULT false,  -- True only if all critical checks pass
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  run_by uuid REFERENCES auth.users(id),
  notes text
);

-- F. Indexes
CREATE INDEX IF NOT EXISTS idx_qa_checks_category ON public.qa_checks(category);
CREATE INDEX IF NOT EXISTS idx_qa_checks_code ON public.qa_checks(check_code);
CREATE INDEX IF NOT EXISTS idx_qa_check_results_check ON public.qa_check_results(check_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_check_results_account ON public.qa_check_results(account_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_check_runs_account ON public.qa_check_runs(account_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_qa_check_runs_status ON public.qa_check_runs(status, can_launch);

-- G. RLS Policies
ALTER TABLE public.qa_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_check_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qa_check_runs ENABLE ROW LEVEL SECURITY;

-- qa_checks: Read-only for authenticated users
CREATE POLICY "qa_checks_read" ON public.qa_checks
  FOR SELECT USING (auth.role() = 'authenticated');

-- qa_check_results: Users can see their own org's results
CREATE POLICY "qa_check_results_read" ON public.qa_check_results
  FOR SELECT USING (
    account_id IS NULL OR 
    account_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.organizations o
      JOIN public.org_memberships om ON om.org_id = o.id
      WHERE om.user_id = auth.uid() AND o.owner_id = qa_check_results.account_id
    )
  );

CREATE POLICY "qa_check_results_insert" ON public.qa_check_results
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- qa_check_runs: Users can see their own org's runs
CREATE POLICY "qa_check_runs_read" ON public.qa_check_runs
  FOR SELECT USING (
    account_id IS NULL OR 
    account_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.organizations o
      JOIN public.org_memberships om ON om.org_id = o.id
      WHERE om.user_id = auth.uid() AND o.owner_id = qa_check_runs.account_id
    )
  );

CREATE POLICY "qa_check_runs_insert" ON public.qa_check_runs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- H. Function to check if account can launch (all critical checks must pass)
CREATE OR REPLACE FUNCTION public.can_account_launch(p_account_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_latest_run_id uuid;
  v_can_launch boolean;
BEGIN
  -- Get latest full run for this account
  SELECT id, can_launch INTO v_latest_run_id, v_can_launch
  FROM public.qa_check_runs
  WHERE account_id = p_account_id
    AND run_type = 'full'
    AND status IN ('pass', 'fail', 'warning')
  ORDER BY started_at DESC
  LIMIT 1;
  
  -- If no run found, cannot launch
  IF v_latest_run_id IS NULL THEN
    RETURN false;
  END IF;
  
  RETURN COALESCE(v_can_launch, false);
END;
$$;

COMMENT ON FUNCTION public.can_account_launch(uuid) IS 'Returns true if account has passed all critical QA checks';

-- I. Insert master checklist items
INSERT INTO public.qa_checks (check_code, category, name, description, critical, check_function) VALUES
-- A. CORE SYSTEM CHECKS
('A1', 'core_system', 'Sign up works', 'User can create account', true, 'check_signup'),
('A2', 'core_system', 'Login works', 'User can log in', true, 'check_login'),
('A3', 'core_system', 'Password reset works', 'Password reset flow functions', true, 'check_password_reset'),
('A4', 'core_system', 'Owner role assigned correctly', 'New users get owner role', true, 'check_owner_role'),
('A5', 'core_system', 'Invite flow works for Manager + Viewer', 'Team invites function correctly', true, 'check_invite_flow'),
('A6', 'core_system', 'Company profile saved', 'Account settings save correctly', true, 'check_company_profile'),
('A7', 'core_system', 'Service area saved', 'Service area configuration works', true, 'check_service_area'),
('A8', 'core_system', 'Sending identity configured', 'Email sending identity can be set', true, 'check_sending_identity'),
('A9', 'core_system', 'Notifications page works', 'Notifications settings accessible', true, 'check_notifications_page'),
('A10', 'core_system', 'Owner phone validated', 'Owner phone number validation works', true, 'check_owner_phone'),
('A11', 'core_system', 'Quiet hours do not break routing', 'Quiet hours respect routing logic', true, 'check_quiet_hours'),

-- B. BILLING GUARD CHECKS
('B1', 'billing_guard', 'Starter plan limits enforced', 'Starter: 1 campaign, 500 emails/month', true, 'check_starter_limits'),
('B2', 'billing_guard', 'Growth plan limits enforced', 'Growth: 3 campaigns, 2000 emails/month', true, 'check_growth_limits'),
('B3', 'billing_guard', 'Domination plan unlimited', 'Domination: unlimited campaigns/emails', true, 'check_domination_unlimited'),
('B4', 'billing_guard', 'Campaign creation blocked when limit exceeded', 'Cannot create campaign over limit', true, 'check_campaign_limit_block'),
('B5', 'billing_guard', 'Email sends blocked when limit exceeded', 'Cannot send emails over limit', true, 'check_email_limit_block'),
('B6', 'billing_guard', 'Follow-up engine disabled when limit exceeded', 'Follow-ups stop at limit', true, 'check_followup_limit_block'),
('B7', 'billing_guard', 'Upgrade modal appears', 'Upgrade prompt shows when needed', false, 'check_upgrade_modal'),
('B8', 'billing_guard', 'Stripe subscription creates + syncs to plan', 'Billing integration works', true, 'check_stripe_sync'),
('B9', 'billing_guard', 'Payment failure locks account correctly', 'Failed payment blocks sending', true, 'check_payment_failure_lock'),

-- C. CAMPAIGN ENGINE CHECKS
('C1', 'campaign_engine', 'Create campaign', 'Campaign creation works', true, 'check_create_campaign'),
('C2', 'campaign_engine', 'Add contacts', 'Contacts can be added to campaigns', true, 'check_add_contacts'),
('C3', 'campaign_engine', 'Pick templates', 'Template selection works', true, 'check_pick_templates'),
('C4', 'campaign_engine', 'Reorder steps', 'Step reordering works', true, 'check_reorder_steps'),
('C5', 'campaign_engine', 'Preview send', 'Email preview works', true, 'check_preview_send'),
('C6', 'campaign_engine', 'Queue message', 'Messages can be queued', true, 'check_queue_message'),
('C7', 'campaign_engine', 'Process queue', 'Queue processing works', true, 'check_process_queue'),
('C8', 'campaign_engine', 'Email delivered', 'Emails are actually sent', true, 'check_email_delivered'),
('C9', 'campaign_engine', 'Record sent event', 'Send events are logged', true, 'check_record_sent_event'),
('C10', 'campaign_engine', 'Suppression list applied correctly', 'Suppressed contacts not sent', true, 'check_suppression_applied'),
('C11', 'campaign_engine', 'Unsubscribes → auto-suppress', 'Unsubscribes added to suppression', true, 'check_unsubscribe_suppress'),
('C12', 'campaign_engine', 'Hard bounces → auto-suppress', 'Bounces added to suppression', true, 'check_bounce_suppress'),

-- D. TEMPLATE LIBRARY CHECKS
('D1', 'template_library', 'Roofing recipes appear', 'Template library shows roofing templates', true, 'check_roofing_recipes'),
('D2', 'template_library', '"Use template" works', 'Template cloning works', true, 'check_use_template'),
('D3', 'template_library', 'Snippet insertion works', 'Snippets can be inserted', true, 'check_snippet_insertion'),
('D4', 'template_library', 'Token replacement is correct', 'Tokens replaced accurately', true, 'check_token_replacement'),
('D5', 'template_library', 'Templates editable per campaign', 'Campaign templates can be edited', true, 'check_template_editable'),

-- E. AI PERSONALIZATION ENGINE CHECKS
('E1', 'ai_personalization', 'Tokens replaced correctly', 'Personalization tokens work', true, 'check_personalization_tokens'),
('E2', 'ai_personalization', 'Weather/local info inserted', 'Dynamic data inserted', true, 'check_weather_insertion'),
('E3', 'ai_personalization', 'Human rewrite sounds natural', 'AI rewrite quality good', true, 'check_human_rewrite'),
('E4', 'ai_personalization', 'No spammy phrases', 'Spam detection works', true, 'check_spam_phrases'),
('E5', 'ai_personalization', 'Under 130 words', 'Length limits enforced', true, 'check_word_limit'),
('E6', 'ai_personalization', 'Storm campaign output makes sense', 'Storm templates work', true, 'check_storm_campaign'),
('E7', 'ai_personalization', 'Tune-up output makes sense', 'Tune-up templates work', true, 'check_tuneup_campaign'),
('E8', 'ai_personalization', 'Gutter bundle output makes sense', 'Gutter templates work', true, 'check_gutter_campaign'),

-- F. REPLY AI CHECKS
('F1', 'reply_ai', 'HOT classification correct', 'Hot leads classified correctly', true, 'check_hot_classification'),
('F2', 'reply_ai', 'WARM classification correct', 'Warm leads classified correctly', true, 'check_warm_classification'),
('F3', 'reply_ai', 'Neutral classification correct', 'Neutral replies classified correctly', true, 'check_neutral_classification'),
('F4', 'reply_ai', 'Not interested classification correct', 'Not interested detected', true, 'check_not_interested'),
('F5', 'reply_ai', 'Unsubscribe classification correct', 'Unsubscribes detected', true, 'check_unsubscribe_classification'),
('F6', 'reply_ai', 'Spam/OOO classification correct', 'Spam detected', true, 'check_spam_classification'),
('F7', 'reply_ai', 'Bounce classification correct', 'Bounces detected', true, 'check_bounce_classification'),
('F8', 'reply_ai', 'Hot → stop follow-ups', 'Hot replies stop sequences', true, 'check_hot_stop_followups'),
('F9', 'reply_ai', 'Warm → stop follow-ups', 'Warm replies stop sequences', true, 'check_warm_stop_followups'),
('F10', 'reply_ai', 'Not interested → stop follow-ups', 'Not interested stops sequences', true, 'check_not_interested_stop'),
('F11', 'reply_ai', 'Unsubscribe → suppress contact', 'Unsubscribes suppress contacts', true, 'check_unsubscribe_suppress'),

-- G. SMART ROUTING CHECKS
('G1', 'smart_routing', 'Hot reply → owner gets alert', 'Hot leads trigger alerts', true, 'check_hot_alert'),
('G2', 'smart_routing', 'Warm reply → owner gets alert (if enabled)', 'Warm alerts work when enabled', true, 'check_warm_alert'),
('G3', 'smart_routing', 'Priority flag set', 'Priority flags work', true, 'check_priority_flag'),
('G4', 'smart_routing', 'Lead jumps to top', 'Priority sorting works', true, 'check_lead_jump_top'),
('G5', 'smart_routing', 'Pipeline updated to "contacted"', 'Pipeline updates correctly', true, 'check_pipeline_update'),
('G6', 'smart_routing', 'Follow-ups stopped', 'Follow-ups stop on reply', true, 'check_followups_stopped'),

-- H. SMS FORWARDING CHECKS
('H1', 'sms_forwarding', 'Owner phone validated', 'Phone validation works', true, 'check_sms_phone_validation'),
('H2', 'sms_forwarding', 'SMS enabled toggle works', 'SMS toggle functions', true, 'check_sms_toggle'),
('H3', 'sms_forwarding', 'Hot SMS arrives instantly', 'Hot lead SMS sent immediately', true, 'check_hot_sms_instant'),
('H4', 'sms_forwarding', 'Warm SMS arrives if enabled', 'Warm SMS sent when enabled', true, 'check_warm_sms'),
('H5', 'sms_forwarding', 'Quiet hours respected', 'Quiet hours block SMS', true, 'check_sms_quiet_hours'),
('H6', 'sms_forwarding', 'Rate limiting works', 'SMS rate limits enforced', true, 'check_sms_rate_limit'),

-- I. LEAD TIMELINE CHECKS
('I1', 'lead_timeline', 'Timeline shows outbound emails', 'Outbound emails appear', true, 'check_timeline_outbound'),
('I2', 'lead_timeline', 'Timeline shows inbound emails', 'Inbound emails appear', true, 'check_timeline_inbound'),
('I3', 'lead_timeline', 'Timeline shows AI intent', 'Intent classifications appear', true, 'check_timeline_intent'),
('I4', 'lead_timeline', 'Timeline shows routing events', 'Routing events appear', true, 'check_timeline_routing'),
('I5', 'lead_timeline', 'Timeline shows SMS notifications', 'SMS events appear', true, 'check_timeline_sms'),
('I6', 'lead_timeline', 'Timeline shows follow-up events', 'Follow-up events appear', true, 'check_timeline_followups'),
('I7', 'lead_timeline', 'Timeline shows bounce/suppression events', 'Bounce events appear', true, 'check_timeline_bounces'),
('I8', 'lead_timeline', 'Timeline sorts by descending date', 'Sorting works correctly', true, 'check_timeline_sort'),

-- J. SYSTEM HEALTH MONITOR CHECKS
('J1', 'system_health', 'Sent counts correct', 'Send metrics accurate', true, 'check_sent_counts'),
('J2', 'system_health', 'Bounce counts correct', 'Bounce metrics accurate', true, 'check_bounce_counts'),
('J3', 'system_health', 'Suppression counts correct', 'Suppression metrics accurate', true, 'check_suppression_counts'),
('J4', 'system_health', 'Error counts correct', 'Error metrics accurate', true, 'check_error_counts'),
('J5', 'system_health', 'High score when system is clean', 'Health score calculation works', true, 'check_health_score_high'),
('J6', 'system_health', 'Score drops correctly on issues', 'Health score reflects problems', true, 'check_health_score_drops'),
('J7', 'system_health', 'Health bar visible', 'Health UI displays', true, 'check_health_bar_visible'),
('J8', 'system_health', 'Campaign health drawer works', 'Health drawer functions', true, 'check_health_drawer'),
('J9', 'system_health', 'Issue feed shows problems', 'Issue feed displays correctly', true, 'check_issue_feed'),

-- K. FRONTEND QUALITY CHECKS
('K1', 'frontend_quality', 'All modals work', 'Modals open/close correctly', true, 'check_modals'),
('K2', 'frontend_quality', 'Mobile responsive enough', 'Mobile UI functional', false, 'check_mobile_responsive'),
('K3', 'frontend_quality', 'No broken links', 'Links work correctly', true, 'check_broken_links'),
('K4', 'frontend_quality', 'No 500 errors on UI actions', 'UI actions don''t crash', true, 'check_500_errors'),
('K5', 'frontend_quality', 'Important buttons disabled when unauthorized', 'Permission checks work', true, 'check_button_permissions'),
('K6', 'frontend_quality', 'No infinite spinners', 'Loading states work', true, 'check_infinite_spinners'),

-- L. PERFORMANCE CHECKS
('L1', 'performance', 'Campaign send queue processes within 1-2 minutes', 'Queue processing fast', true, 'check_queue_performance'),
('L2', 'performance', 'UI loads within 1s on major pages', 'Page load times acceptable', true, 'check_ui_load_time'),
('L3', 'performance', 'Timeline loads under 2s', 'Timeline performance good', true, 'check_timeline_performance'),
('L4', 'performance', 'Health drawer loads under 1.5s', 'Health drawer fast', true, 'check_health_drawer_performance'),

-- M. SECURITY CHECKS
('M1', 'security', 'API routes protected', 'API authentication works', true, 'check_api_protection'),
('M2', 'security', 'Permissions enforced for roles', 'Role-based access works', true, 'check_role_permissions'),
('M3', 'security', 'Billing endpoints owner-only', 'Billing access restricted', true, 'check_billing_security'),
('M4', 'security', 'Suppression list owner-only', 'Suppression access restricted', true, 'check_suppression_security'),
('M5', 'security', 'Invite acceptance secure', 'Invite flow secure', true, 'check_invite_security'),
('M6', 'security', 'No cross-account access', 'Data isolation works', true, 'check_cross_account_security')
ON CONFLICT (check_code) DO NOTHING;

-- J. Comments
COMMENT ON TABLE public.qa_checks IS 'Master checklist of all QA checks that must pass before launch';
COMMENT ON TABLE public.qa_check_results IS 'Results of individual QA checks';
COMMENT ON TABLE public.qa_check_runs IS 'Full QA check runs (tracks overall pass/fail status)';
COMMENT ON COLUMN public.qa_checks.critical IS 'If true, failure of this check blocks launch';
COMMENT ON COLUMN public.qa_check_runs.can_launch IS 'True only if all critical checks passed';
























































