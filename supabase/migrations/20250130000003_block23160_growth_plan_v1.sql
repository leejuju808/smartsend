-- =========================================================
-- Block 23160 — SmartSend Roofing GROWTH Plan v1
-- "3 Campaigns • 2,000 Emails • Advanced AI • Production Tools • Priority Support — $199/mo."
-- =========================================================
--
-- This is the CORE plan.
-- The one 70% of roofing companies will buy.
-- The "sweet spot" between Starter ($99) and Domination ($399).
--
-- Growth Plan Purpose:
-- - For roofers doing $500K–$2M/year
-- - 3–8 employees
-- - Office manager + owner working together
-- - Constantly losing money from bad scheduling, slow follow-up, poor documentation
-- - Not enough structure, too many fires
-- - Current CRM isn't giving them what they need
--
-- Growth gives them:
-- - A true operating system — without the full AI forecasting suite
-- - They get 70% of SmartSend's power
-- - Domination gives the last 30% (the elite features)
--
-- This migration defines the Growth Plan as the middle tier between Starter and Domination
-- Growth unlocks advanced AI, production tools, and priority support for growing roofing companies

-- Update subscription_plans table with Growth Plan details
UPDATE public.subscription_plans
SET 
  name = 'SmartSend Roofing Growth Plan',
  price_cents = 19900,
  currency = 'usd',
  max_campaigns = 3,
  max_emails_per_month = 2000
WHERE id = 'growth';

-- ============================================================================
-- Growth Plan Features — 8 Pillars Breakdown
-- ============================================================================
--
-- 🧠 Pillar 1 — Advanced AI Outreach (FULL)
--   - 3 active campaigns
--   - 2,000 emails/month
--   - AI personalized first lines
--   - Roofing-specific tonality
--   - Auto warm follow-up
--   - Lead categorization
--   - AI routing (e.g., "Book job," "Estimate request," "Insurance claim")
--   Starter gives a taste. Growth gives the full system.
--
-- 📅 Pillar 2 — Production Tools (Unlocked from here up)
--   - AI-assisted scheduling
--   - Crew assignment
--   - Drag-and-drop calendar
--   - Job preparation checklist
--   - Field check-in + productivity feed
--   - Daily job list for the crew
--   - Material delivery sync calendar
--   - Job delays flagged in calendar
--   Starter could only "add a job." Growth actually runs production.
--
-- 🧾 Pillar 3 — Document Engine (Advanced)
--   - Contract templates
--   - Dynamic auto-fill fields
--   - Change order creation
--   - Change order e-sign
--   - Multi-version document handling
--   - Document timeline inside the job
--   This saves hours per job and keeps the company legally protected.
--
-- 💳 Pillar 4 — Payments Engine (Advanced)
--   - Multi-invoice schedules
--   - Progress payments
--   - Payment reminders (automation)
--   - Stripe link tracking
--   - Partial payments
--   - Deposit + final invoice workflow
--   - Payment status on job timeline
--   Starter only allows a single payment link. Growth gives full revenue control.
--
-- 🤖 Pillar 5 — AI Intelligence (Partial)
--   - Margin risk (basic)
--   - Schedule risk (basic)
--   - Material delay prediction (basic)
--   - Homeowner communication score
--   - Job health alerts
--   Growth gets enough intelligence to feel powerful — but wants more.
--   Domination gets: Forecast corrections, Company-wide analysis, Crew performance
--   intelligence, Supplier ranking, Weekly reports
--
-- ⚙️ Pillar 6 — Automations (Advanced)
--   - 6 automation rules (Starter: 1, Domination: unlimited)
--   - Overdue invoice reminders
--   - Job completion → review requests
--   - Crew arrival → homeowner notification
--   - Material delay → internal alert
--   - Lead reply → office notification
--   - New signed contract → scheduling task
--   This is where roofers start saying: "Damn… this actually does the admin work for me."
--
-- 🏠 Pillar 7 — Homeowner Portal (Full)
--   - Messaging
--   - Photo gallery
--   - Signed documents
--   - Progress updates
--   - Payments center
--   - Review request flow
--   Starter has the "lite" version. Growth gives the real communication hub.
--
-- ⭐ Pillar 8 — Priority Support
--   - Faster response
--   - Setup guidance
--   - "Done with you" onboarding
--   Domination gets VIP. Growth gets priority.
--
-- ============================================================================

-- Insert/Update Growth Plan limits with all feature flags
INSERT INTO public.plan_limits (
  plan,
  max_campaigns,
  max_emails_per_month,
  has_advanced_ai,
  has_revenue_dashboard,
  has_priority_support,
  has_vip_onboarding,
  -- Pillar 1: Advanced AI Outreach (FULL)
  cold_email_basic_ai,
  cold_email_advanced_ai,
  cold_email_reply_detection,
  cold_email_lead_labeling,
  cold_email_basic_followup,
  cold_email_multi_step_followup,
  -- Pillar 2: Production Tools (Unlocked from here up)
  scheduling_add_jobs,
  scheduling_basic_calendar,
  scheduling_crew_assignment_manual,
  scheduling_ai_scheduling,
  scheduling_material_driven,
  scheduling_overlap_detection,
  scheduling_multi_crew,
  -- Pillar 3: Document Engine (Advanced)
  documents_upload_contracts,
  documents_send_to_homeowner,
  documents_basic_esign,
  documents_multi_version,
  documents_change_order_automation,
  documents_templates,
  -- Pillar 4: Payments Engine (Advanced)
  payments_deposit_requests,
  payments_stripe_links,
  payments_mark_manually,
  payments_ach,
  payments_job_balance_intelligence,
  payments_automation,
  payments_invoice_aging_kpis,
  -- Pillar 5: AI Intelligence (Partial)
  ai_intelligence_daily_summary,
  ai_intelligence_insights_per_job,
  ai_intelligence_risk_detection,
  ai_intelligence_margin_analysis,
  ai_intelligence_schedule_predictions,
  ai_intelligence_supplier_intelligence,
  ai_intelligence_daily_briefings,
  -- Pillar 6: Automations (Advanced) — 6 rules
  automations_max_rules,
  automations_multi_step_workflows,
  automations_production_alerts,
  automations_material_delay_alerts,
  automations_review_requests,
  automations_custom_conditions,
  -- Pillar 7: Homeowner Portal (Full)
  field_app_photo_uploads,
  field_app_notes,
  field_app_crew_checkin,
  field_app_productivity_scoring,
  field_app_forecast_updates,
  homeowner_portal_documents,
  homeowner_portal_payments,
  homeowner_portal_progress_photos,
  homeowner_portal_messaging,
  homeowner_portal_review_request,
  homeowner_portal_ai_summaries,
  -- Pillar 8: Priority Support + Dashboard
  dashboard_leads,
  dashboard_replies,
  dashboard_estimates_sent,
  dashboard_basic_pipeline,
  dashboard_profit_dashboard,
  dashboard_margin_tracking,
  dashboard_crew_kpis,
  dashboard_supplier_reliability,
  dashboard_forecast_trends,
  -- Additional Production Features
  material_tracking,
  crew_productivity_scores,
  profit_forecasting
)
VALUES (
  'growth',
  3,      -- max_campaigns
  2000,   -- max_emails_per_month
  true,   -- has_advanced_ai ✅ INCLUDED
  false,  -- has_revenue_dashboard ❌ UPSELL TO DOMINATION
  true,   -- has_priority_support ✅ INCLUDED
  false,  -- has_vip_onboarding ❌ UPSELL TO DOMINATION
  -- Pillar 1: Advanced AI Outreach (FULL) ✅ INCLUDED
  true,   -- cold_email_basic_ai ✅ INCLUDED
  true,   -- cold_email_advanced_ai ✅ INCLUDED (AI personalized first lines, roofing-specific tonality)
  true,   -- cold_email_reply_detection ✅ INCLUDED
  true,   -- cold_email_lead_labeling ✅ INCLUDED (Lead categorization, AI routing)
  true,   -- cold_email_basic_followup ✅ INCLUDED
  true,   -- cold_email_multi_step_followup ✅ INCLUDED (Auto warm follow-up)
  -- Pillar 2: Production Tools (Unlocked from here up) ✅ INCLUDED
  true,   -- scheduling_add_jobs ✅ INCLUDED
  true,   -- scheduling_basic_calendar ✅ INCLUDED (Drag-and-drop calendar)
  true,   -- scheduling_crew_assignment_manual ✅ INCLUDED (Crew assignment)
  true,   -- scheduling_ai_scheduling ✅ INCLUDED (AI-assisted scheduling)
  true,   -- scheduling_material_driven ✅ INCLUDED (Material delivery sync calendar)
  true,   -- scheduling_overlap_detection ✅ INCLUDED (Job delays flagged in calendar)
  false,  -- scheduling_multi_crew ❌ UPSELL TO DOMINATION (multi-crew optimization)
  -- Pillar 3: Document Engine (Advanced) ✅ INCLUDED
  true,   -- documents_upload_contracts ✅ INCLUDED
  true,   -- documents_send_to_homeowner ✅ INCLUDED
  true,   -- documents_basic_esign ✅ INCLUDED
  true,   -- documents_multi_version ✅ INCLUDED (Multi-version document handling, Document timeline)
  true,   -- documents_change_order_automation ✅ INCLUDED (Change order creation + e-sign)
  true,   -- documents_templates ✅ INCLUDED (Contract templates, Dynamic auto-fill fields)
  -- Pillar 4: Payments Engine (Advanced) ✅ INCLUDED
  true,   -- payments_deposit_requests ✅ INCLUDED (Deposit + final invoice workflow)
  true,   -- payments_stripe_links ✅ INCLUDED (Stripe link tracking)
  true,   -- payments_mark_manually ✅ INCLUDED
  true,   -- payments_ach ✅ INCLUDED (lower fees)
  true,   -- payments_job_balance_intelligence ✅ INCLUDED (Payment status on job timeline)
  true,   -- payments_automation ✅ INCLUDED (Payment reminders, Multi-invoice schedules, Progress payments, Partial payments)
  false,  -- payments_invoice_aging_kpis ❌ UPSELL TO DOMINATION (full invoice aging dashboard)
  -- Pillar 5: AI Intelligence (Partial) ✅ INCLUDED
  true,   -- ai_intelligence_daily_summary ✅ INCLUDED
  5,      -- ai_intelligence_insights_per_job (5 insights per job) ✅ INCLUDED
  true,   -- ai_intelligence_risk_detection ✅ INCLUDED (Margin risk basic, Schedule risk basic, Material delay prediction basic)
  true,   -- ai_intelligence_margin_analysis ✅ INCLUDED
  true,   -- ai_intelligence_schedule_predictions ✅ INCLUDED
  false,  -- ai_intelligence_supplier_intelligence ❌ UPSELL TO DOMINATION (Supplier ranking, Supplier performance insights)
  true,   -- ai_intelligence_daily_briefings ✅ INCLUDED (Homeowner communication score, Job health alerts)
  -- Pillar 6: Automations (Advanced) — 6 rules ✅ INCLUDED
  6,      -- automations_max_rules (6 automation rules) ✅ INCLUDED
  true,   -- automations_multi_step_workflows ✅ INCLUDED
  true,   -- automations_production_alerts ✅ INCLUDED
  true,   -- automations_material_delay_alerts ✅ INCLUDED (Material delay → internal alert)
  true,   -- automations_review_requests ✅ INCLUDED (Job completion → review requests)
  true,   -- automations_custom_conditions ✅ INCLUDED (Overdue invoice reminders, Crew arrival → homeowner notification, Lead reply → office notification, New signed contract → scheduling task)
  -- Pillar 7: Homeowner Portal (Full) + Field App ✅ INCLUDED
  true,   -- field_app_photo_uploads ✅ INCLUDED (Photo gallery)
  true,   -- field_app_notes ✅ INCLUDED
  true,   -- field_app_crew_checkin ✅ INCLUDED (Field check-in + productivity feed, Daily job list for the crew)
  true,   -- field_app_productivity_scoring ✅ INCLUDED
  true,   -- field_app_forecast_updates ✅ INCLUDED
  true,   -- homeowner_portal_documents ✅ INCLUDED (Signed documents)
  true,   -- homeowner_portal_payments ✅ INCLUDED (Payments center)
  true,   -- homeowner_portal_progress_photos ✅ INCLUDED (Photo gallery, Progress updates)
  true,   -- homeowner_portal_messaging ✅ INCLUDED (Messaging)
  true,   -- homeowner_portal_review_request ✅ INCLUDED (Review request flow)
  false,  -- homeowner_portal_ai_summaries ❌ UPSELL TO DOMINATION
  -- Pillar 8: Priority Support + Dashboard ✅ INCLUDED
  true,   -- dashboard_leads ✅ INCLUDED
  true,   -- dashboard_replies ✅ INCLUDED
  true,   -- dashboard_estimates_sent ✅ INCLUDED
  true,   -- dashboard_basic_pipeline ✅ INCLUDED
  false,  -- dashboard_profit_dashboard ❌ UPSELL TO DOMINATION (full profit dashboard)
  false,  -- dashboard_margin_tracking ❌ UPSELL TO DOMINATION (real-time margin tracking)
  false,  -- dashboard_crew_kpis ❌ UPSELL TO DOMINATION (crew efficiency KPIs, Crew performance intelligence)
  false,  -- dashboard_supplier_reliability ❌ UPSELL TO DOMINATION (supplier reliability dashboard, Supplier ranking)
  false,  -- dashboard_forecast_trends ❌ UPSELL TO DOMINATION (forecast vs actual trends, Forecast corrections, Company-wide analysis, Weekly reports)
  -- Additional Production Features ✅ INCLUDED
  true,   -- material_tracking ✅ INCLUDED
  false,  -- crew_productivity_scores ❌ UPSELL TO DOMINATION (full crew optimization scoring)
  false   -- profit_forecasting ❌ UPSELL TO DOMINATION (company-level revenue forecasting)
)
ON CONFLICT (plan) DO UPDATE SET
  max_campaigns = EXCLUDED.max_campaigns,
  max_emails_per_month = EXCLUDED.max_emails_per_month,
  has_advanced_ai = EXCLUDED.has_advanced_ai,
  has_revenue_dashboard = EXCLUDED.has_revenue_dashboard,
  has_priority_support = EXCLUDED.has_priority_support,
  has_vip_onboarding = EXCLUDED.has_vip_onboarding,
  -- Cold Email Engine
  cold_email_basic_ai = EXCLUDED.cold_email_basic_ai,
  cold_email_advanced_ai = EXCLUDED.cold_email_advanced_ai,
  cold_email_reply_detection = EXCLUDED.cold_email_reply_detection,
  cold_email_lead_labeling = EXCLUDED.cold_email_lead_labeling,
  cold_email_basic_followup = EXCLUDED.cold_email_basic_followup,
  cold_email_multi_step_followup = EXCLUDED.cold_email_multi_step_followup,
  -- Scheduling
  scheduling_add_jobs = EXCLUDED.scheduling_add_jobs,
  scheduling_basic_calendar = EXCLUDED.scheduling_basic_calendar,
  scheduling_crew_assignment_manual = EXCLUDED.scheduling_crew_assignment_manual,
  scheduling_ai_scheduling = EXCLUDED.scheduling_ai_scheduling,
  scheduling_material_driven = EXCLUDED.scheduling_material_driven,
  scheduling_overlap_detection = EXCLUDED.scheduling_overlap_detection,
  scheduling_multi_crew = EXCLUDED.scheduling_multi_crew,
  -- Documents
  documents_upload_contracts = EXCLUDED.documents_upload_contracts,
  documents_send_to_homeowner = EXCLUDED.documents_send_to_homeowner,
  documents_basic_esign = EXCLUDED.documents_basic_esign,
  documents_multi_version = EXCLUDED.documents_multi_version,
  documents_change_order_automation = EXCLUDED.documents_change_order_automation,
  documents_templates = EXCLUDED.documents_templates,
  -- Payments
  payments_deposit_requests = EXCLUDED.payments_deposit_requests,
  payments_stripe_links = EXCLUDED.payments_stripe_links,
  payments_mark_manually = EXCLUDED.payments_mark_manually,
  payments_ach = EXCLUDED.payments_ach,
  payments_job_balance_intelligence = EXCLUDED.payments_job_balance_intelligence,
  payments_automation = EXCLUDED.payments_automation,
  payments_invoice_aging_kpis = EXCLUDED.payments_invoice_aging_kpis,
  -- AI Intelligence
  ai_intelligence_daily_summary = EXCLUDED.ai_intelligence_daily_summary,
  ai_intelligence_insights_per_job = EXCLUDED.ai_intelligence_insights_per_job,
  ai_intelligence_risk_detection = EXCLUDED.ai_intelligence_risk_detection,
  ai_intelligence_margin_analysis = EXCLUDED.ai_intelligence_margin_analysis,
  ai_intelligence_schedule_predictions = EXCLUDED.ai_intelligence_schedule_predictions,
  ai_intelligence_supplier_intelligence = EXCLUDED.ai_intelligence_supplier_intelligence,
  ai_intelligence_daily_briefings = EXCLUDED.ai_intelligence_daily_briefings,
  -- Automations
  automations_max_rules = EXCLUDED.automations_max_rules,
  automations_multi_step_workflows = EXCLUDED.automations_multi_step_workflows,
  automations_production_alerts = EXCLUDED.automations_production_alerts,
  automations_material_delay_alerts = EXCLUDED.automations_material_delay_alerts,
  automations_review_requests = EXCLUDED.automations_review_requests,
  automations_custom_conditions = EXCLUDED.automations_custom_conditions,
  -- Field App
  field_app_photo_uploads = EXCLUDED.field_app_photo_uploads,
  field_app_notes = EXCLUDED.field_app_notes,
  field_app_crew_checkin = EXCLUDED.field_app_crew_checkin,
  field_app_productivity_scoring = EXCLUDED.field_app_productivity_scoring,
  field_app_forecast_updates = EXCLUDED.field_app_forecast_updates,
  -- Homeowner Portal
  homeowner_portal_documents = EXCLUDED.homeowner_portal_documents,
  homeowner_portal_payments = EXCLUDED.homeowner_portal_payments,
  homeowner_portal_progress_photos = EXCLUDED.homeowner_portal_progress_photos,
  homeowner_portal_messaging = EXCLUDED.homeowner_portal_messaging,
  homeowner_portal_review_request = EXCLUDED.homeowner_portal_review_request,
  homeowner_portal_ai_summaries = EXCLUDED.homeowner_portal_ai_summaries,
  -- Dashboard
  dashboard_leads = EXCLUDED.dashboard_leads,
  dashboard_replies = EXCLUDED.dashboard_replies,
  dashboard_estimates_sent = EXCLUDED.dashboard_estimates_sent,
  dashboard_basic_pipeline = EXCLUDED.dashboard_basic_pipeline,
  dashboard_profit_dashboard = EXCLUDED.dashboard_profit_dashboard,
  dashboard_margin_tracking = EXCLUDED.dashboard_margin_tracking,
  dashboard_crew_kpis = EXCLUDED.dashboard_crew_kpis,
  dashboard_supplier_reliability = EXCLUDED.dashboard_supplier_reliability,
  dashboard_forecast_trends = EXCLUDED.dashboard_forecast_trends,
  -- Additional Features
  material_tracking = EXCLUDED.material_tracking,
  crew_productivity_scores = EXCLUDED.crew_productivity_scores,
  profit_forecasting = EXCLUDED.profit_forecasting;

-- Update Growth Plan description
UPDATE public.subscription_plans
SET 
  description = 'The bridge plan. The production-ready upgrade. For roofing companies ready to scale with advanced AI, production tools, and priority support. This is where SmartSend becomes your daily operations engine. Starter books jobs. Growth runs jobs. Domination perfects the business.',
  tagline = '3 Campaigns • 2,000 Emails • Advanced AI • Production Tools • Priority Support'
WHERE id = 'growth';

-- Create helper function to check Growth Plan feature access
CREATE OR REPLACE FUNCTION public.can_access_growth_feature(
  p_user_id uuid,
  p_feature_name text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription public.subscriptions%ROWTYPE;
  v_limits public.plan_limits%ROWTYPE;
BEGIN
  -- Get user subscription
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'trialing')
  LIMIT 1;

  -- If no active subscription, deny
  IF v_subscription IS NULL THEN
    RETURN false;
  END IF;

  -- Get plan limits
  SELECT * INTO v_limits
  FROM public.plan_limits
  WHERE plan = v_subscription.plan;

  -- Check feature based on feature name
  CASE p_feature_name
    WHEN 'cold_email_advanced_ai' THEN RETURN v_limits.cold_email_advanced_ai;
    WHEN 'cold_email_multi_step_followup' THEN RETURN v_limits.cold_email_multi_step_followup;
    WHEN 'scheduling_ai_scheduling' THEN RETURN v_limits.scheduling_ai_scheduling;
    WHEN 'scheduling_material_driven' THEN RETURN v_limits.scheduling_material_driven;
    WHEN 'scheduling_overlap_detection' THEN RETURN v_limits.scheduling_overlap_detection;
    WHEN 'scheduling_multi_crew' THEN RETURN v_limits.scheduling_multi_crew;
    WHEN 'documents_multi_version' THEN RETURN v_limits.documents_multi_version;
    WHEN 'documents_change_order_automation' THEN RETURN v_limits.documents_change_order_automation;
    WHEN 'documents_templates' THEN RETURN v_limits.documents_templates;
    WHEN 'payments_ach' THEN RETURN v_limits.payments_ach;
    WHEN 'payments_job_balance_intelligence' THEN RETURN v_limits.payments_job_balance_intelligence;
    WHEN 'payments_automation' THEN RETURN v_limits.payments_automation;
    WHEN 'payments_invoice_aging_kpis' THEN RETURN v_limits.payments_invoice_aging_kpis;
    WHEN 'ai_intelligence_risk_detection' THEN RETURN v_limits.ai_intelligence_risk_detection;
    WHEN 'ai_intelligence_margin_analysis' THEN RETURN v_limits.ai_intelligence_margin_analysis;
    WHEN 'ai_intelligence_schedule_predictions' THEN RETURN v_limits.ai_intelligence_schedule_predictions;
    WHEN 'ai_intelligence_supplier_intelligence' THEN RETURN v_limits.ai_intelligence_supplier_intelligence;
    WHEN 'ai_intelligence_daily_briefings' THEN RETURN v_limits.ai_intelligence_daily_briefings;
    WHEN 'automations_multi_step_workflows' THEN RETURN v_limits.automations_multi_step_workflows;
    WHEN 'automations_production_alerts' THEN RETURN v_limits.automations_production_alerts;
    WHEN 'automations_material_delay_alerts' THEN RETURN v_limits.automations_material_delay_alerts;
    WHEN 'automations_review_requests' THEN RETURN v_limits.automations_review_requests;
    WHEN 'automations_custom_conditions' THEN RETURN v_limits.automations_custom_conditions;
    WHEN 'field_app_productivity_scoring' THEN RETURN v_limits.field_app_productivity_scoring;
    WHEN 'field_app_forecast_updates' THEN RETURN v_limits.field_app_forecast_updates;
    WHEN 'homeowner_portal_messaging' THEN RETURN v_limits.homeowner_portal_messaging;
    WHEN 'homeowner_portal_review_request' THEN RETURN v_limits.homeowner_portal_review_request;
    WHEN 'homeowner_portal_ai_summaries' THEN RETURN v_limits.homeowner_portal_ai_summaries;
    WHEN 'dashboard_profit_dashboard' THEN RETURN v_limits.dashboard_profit_dashboard;
    WHEN 'dashboard_margin_tracking' THEN RETURN v_limits.dashboard_margin_tracking;
    WHEN 'dashboard_crew_kpis' THEN RETURN v_limits.dashboard_crew_kpis;
    WHEN 'dashboard_supplier_reliability' THEN RETURN v_limits.dashboard_supplier_reliability;
    WHEN 'dashboard_forecast_trends' THEN RETURN v_limits.dashboard_forecast_trends;
    WHEN 'material_tracking' THEN RETURN v_limits.material_tracking;
    WHEN 'crew_productivity_scores' THEN RETURN v_limits.crew_productivity_scores;
    WHEN 'profit_forecasting' THEN RETURN v_limits.profit_forecasting;
    ELSE RETURN false;
  END CASE;
END;
$$;

-- Create helper function to get Growth Plan automation limit
CREATE OR REPLACE FUNCTION public.get_growth_automation_limit(p_user_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription public.subscriptions%ROWTYPE;
  v_limits public.plan_limits%ROWTYPE;
BEGIN
  -- Get user subscription
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'trialing')
  LIMIT 1;

  -- If no active subscription, return 0
  IF v_subscription IS NULL THEN
    RETURN 0;
  END IF;

  -- Get plan limits
  SELECT * INTO v_limits
  FROM public.plan_limits
  WHERE plan = v_subscription.plan;

  RETURN v_limits.automations_max_rules;
END;
$$;

-- Create helper function to get Growth Plan AI insights limit per job
CREATE OR REPLACE FUNCTION public.get_growth_ai_insights_limit_per_job(p_user_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription public.subscriptions%ROWTYPE;
  v_limits public.plan_limits%ROWTYPE;
BEGIN
  -- Get user subscription
  SELECT * INTO v_subscription
  FROM public.subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'trialing')
  LIMIT 1;

  -- If no active subscription, return 0
  IF v_subscription IS NULL THEN
    RETURN 0;
  END IF;

  -- Get plan limits
  SELECT * INTO v_limits
  FROM public.plan_limits
  WHERE plan = v_subscription.plan;

  RETURN v_limits.ai_intelligence_insights_per_job;
END;
$$;

-- ============================================================================
-- Growth Plan Positioning & Value Proposition
-- ============================================================================
--
-- This is the "real OS" plan.
--
-- How to explain it to roofers:
--   "Starter gets you booked jobs. Growth runs your company."
--   "Growth is where SmartSend replaces JobNimbus."
--   "This is your office manager + job coordinator in one system."
--   "If you have crews in the field, you need Growth."
--
-- What Growth Solves (In Real Life):
--   - No-show scheduling
--   - Missed homeowner calls
--   - Missing documents
--   - Lost change orders
--   - Margin leaks
--   - Payment delays
--   - Supplier confusion
--   - Crew miscommunication
--   - Double-booking
--   - Production chaos
--   - Office overwhelm
--
-- The owner feels: "SmartSend runs the shop. I just approve things."
-- This plan delivers control, which roofers crave.
--
-- Why Growth Leads to Domination:
--   Once roofers are in Growth, upgrading to Domination is easy because:
--   Growth owners SEE:
--     - margins slipping
--     - supplier delays
--     - crew inefficiencies
--     - missing change orders
--     - incomplete forecasting
--     - low-quality insights
--   Domination solves:
--     - full forecasting
--     - full AI analysis
--     - deep automations
--     - unlimited campaigns
--     - unlimited intelligence
--     - complete KPI suite
--     - real-time margin engine
--     - operations intelligence
--   The upgrade becomes self-evident.
--
-- Single Message Roofers MUST Hear:
--   "Starter books jobs. Growth runs jobs. Domination perfects the business."
--   Growth is the middle that solves 80% of roofing pain.
--
-- ============================================================================

-- Comments
COMMENT ON TABLE public.plan_limits IS 'Block 23160: Comprehensive plan limits including Growth Plan feature flags';
COMMENT ON FUNCTION public.can_access_growth_feature(uuid, text) IS 'Block 23160: Check if user can access a specific Growth Plan feature';
COMMENT ON FUNCTION public.get_growth_automation_limit(uuid) IS 'Block 23160: Get maximum automation rules allowed for Growth Plan (6 rules)';
COMMENT ON FUNCTION public.get_growth_ai_insights_limit_per_job(uuid) IS 'Block 23160: Get maximum AI insights per job for Growth Plan (5 insights)';

