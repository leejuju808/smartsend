-- =========================================================
-- Block 23080 — SmartSend Roofing Starter Plan v1
-- "1 Campaign • 500 Emails • Basic AI • Limited Automations — $99/mo."
-- The gateway plan. The low-friction entry point.
-- =========================================================

-- Expand plan_limits table to include comprehensive feature flags
-- This captures all Starter Plan capabilities and limitations

DO $$
BEGIN
  -- Add new columns for detailed feature tracking if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'plan_limits' 
    AND column_name = 'cold_email_basic_ai'
  ) THEN
    ALTER TABLE public.plan_limits ADD COLUMN cold_email_basic_ai boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN cold_email_advanced_ai boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN cold_email_reply_detection boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN cold_email_lead_labeling boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN cold_email_basic_followup boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN cold_email_multi_step_followup boolean NOT NULL DEFAULT false;
    
    ALTER TABLE public.plan_limits ADD COLUMN scheduling_add_jobs boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN scheduling_basic_calendar boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN scheduling_crew_assignment_manual boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN scheduling_ai_scheduling boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN scheduling_material_driven boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN scheduling_overlap_detection boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN scheduling_multi_crew boolean NOT NULL DEFAULT false;
    
    ALTER TABLE public.plan_limits ADD COLUMN documents_upload_contracts boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN documents_send_to_homeowner boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN documents_basic_esign boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN documents_multi_version boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN documents_change_order_automation boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN documents_templates boolean NOT NULL DEFAULT false;
    
    ALTER TABLE public.plan_limits ADD COLUMN payments_deposit_requests boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN payments_stripe_links boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN payments_mark_manually boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN payments_ach boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN payments_job_balance_intelligence boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN payments_automation boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN payments_invoice_aging_kpis boolean NOT NULL DEFAULT false;
    
    ALTER TABLE public.plan_limits ADD COLUMN ai_intelligence_daily_summary boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN ai_intelligence_insights_per_job int NOT NULL DEFAULT 0;
    ALTER TABLE public.plan_limits ADD COLUMN ai_intelligence_risk_detection boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN ai_intelligence_margin_analysis boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN ai_intelligence_schedule_predictions boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN ai_intelligence_supplier_intelligence boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN ai_intelligence_daily_briefings boolean NOT NULL DEFAULT false;
    
    ALTER TABLE public.plan_limits ADD COLUMN automations_max_rules int NOT NULL DEFAULT 0;
    ALTER TABLE public.plan_limits ADD COLUMN automations_multi_step_workflows boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN automations_production_alerts boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN automations_material_delay_alerts boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN automations_review_requests boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN automations_custom_conditions boolean NOT NULL DEFAULT false;
    
    ALTER TABLE public.plan_limits ADD COLUMN field_app_photo_uploads boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN field_app_notes boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN field_app_crew_checkin boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN field_app_productivity_scoring boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN field_app_forecast_updates boolean NOT NULL DEFAULT false;
    
    ALTER TABLE public.plan_limits ADD COLUMN homeowner_portal_documents boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN homeowner_portal_payments boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN homeowner_portal_progress_photos boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN homeowner_portal_messaging boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN homeowner_portal_review_request boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN homeowner_portal_ai_summaries boolean NOT NULL DEFAULT false;
    
    ALTER TABLE public.plan_limits ADD COLUMN dashboard_leads boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN dashboard_replies boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN dashboard_estimates_sent boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN dashboard_basic_pipeline boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN dashboard_profit_dashboard boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN dashboard_margin_tracking boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN dashboard_crew_kpis boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN dashboard_supplier_reliability boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN dashboard_forecast_trends boolean NOT NULL DEFAULT false;
    
    ALTER TABLE public.plan_limits ADD COLUMN material_tracking boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN crew_productivity_scores boolean NOT NULL DEFAULT false;
    ALTER TABLE public.plan_limits ADD COLUMN profit_forecasting boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Update subscription_plans table with Starter Plan details
UPDATE public.subscription_plans
SET 
  name = 'SmartSend Roofing Starter Plan',
  price_cents = 9900,
  currency = 'usd',
  max_campaigns = 1,
  max_emails_per_month = 500
WHERE id = 'starter';

-- Insert/Update Starter Plan limits with all feature flags
INSERT INTO public.plan_limits (
  plan,
  max_campaigns,
  max_emails_per_month,
  has_advanced_ai,
  has_revenue_dashboard,
  has_priority_support,
  has_vip_onboarding,
  -- Cold Email Engine (Basic)
  cold_email_basic_ai,
  cold_email_advanced_ai,
  cold_email_reply_detection,
  cold_email_lead_labeling,
  cold_email_basic_followup,
  cold_email_multi_step_followup,
  -- Scheduling (Lite)
  scheduling_add_jobs,
  scheduling_basic_calendar,
  scheduling_crew_assignment_manual,
  scheduling_ai_scheduling,
  scheduling_material_driven,
  scheduling_overlap_detection,
  scheduling_multi_crew,
  -- Documents (Lite)
  documents_upload_contracts,
  documents_send_to_homeowner,
  documents_basic_esign,
  documents_multi_version,
  documents_change_order_automation,
  documents_templates,
  -- Payments (Lite)
  payments_deposit_requests,
  payments_stripe_links,
  payments_mark_manually,
  payments_ach,
  payments_job_balance_intelligence,
  payments_automation,
  payments_invoice_aging_kpis,
  -- AI Intelligence (Lite)
  ai_intelligence_daily_summary,
  ai_intelligence_insights_per_job,
  ai_intelligence_risk_detection,
  ai_intelligence_margin_analysis,
  ai_intelligence_schedule_predictions,
  ai_intelligence_supplier_intelligence,
  ai_intelligence_daily_briefings,
  -- Automations (Lite)
  automations_max_rules,
  automations_multi_step_workflows,
  automations_production_alerts,
  automations_material_delay_alerts,
  automations_review_requests,
  automations_custom_conditions,
  -- Field App (Lite)
  field_app_photo_uploads,
  field_app_notes,
  field_app_crew_checkin,
  field_app_productivity_scoring,
  field_app_forecast_updates,
  -- Homeowner Portal (Lite)
  homeowner_portal_documents,
  homeowner_portal_payments,
  homeowner_portal_progress_photos,
  homeowner_portal_messaging,
  homeowner_portal_review_request,
  homeowner_portal_ai_summaries,
  -- Dashboard (Lite)
  dashboard_leads,
  dashboard_replies,
  dashboard_estimates_sent,
  dashboard_basic_pipeline,
  dashboard_profit_dashboard,
  dashboard_margin_tracking,
  dashboard_crew_kpis,
  dashboard_supplier_reliability,
  dashboard_forecast_trends,
  -- Additional Features
  material_tracking,
  crew_productivity_scores,
  profit_forecasting
)
VALUES (
  'starter',
  1,      -- max_campaigns
  500,    -- max_emails_per_month
  false,  -- has_advanced_ai
  false,  -- has_revenue_dashboard
  false,  -- has_priority_support
  false,  -- has_vip_onboarding
  -- Cold Email Engine (Basic) ✅ INCLUDED
  true,   -- cold_email_basic_ai (subject line + opener)
  false,  -- cold_email_advanced_ai ❌ UPSELL
  true,   -- cold_email_reply_detection ✅ INCLUDED
  true,   -- cold_email_lead_labeling (hot/warm/not interested) ✅ INCLUDED
  true,   -- cold_email_basic_followup ✅ INCLUDED
  false,  -- cold_email_multi_step_followup ❌ UPSELL
  -- Scheduling (Lite) ✅ INCLUDED
  true,   -- scheduling_add_jobs ✅ INCLUDED
  true,   -- scheduling_basic_calendar ✅ INCLUDED
  true,   -- scheduling_crew_assignment_manual ✅ INCLUDED
  false,  -- scheduling_ai_scheduling ❌ UPSELL
  false,  -- scheduling_material_driven ❌ UPSELL
  false,  -- scheduling_overlap_detection ❌ UPSELL
  false,  -- scheduling_multi_crew ❌ UPSELL
  -- Documents (Lite) ✅ INCLUDED
  true,   -- documents_upload_contracts ✅ INCLUDED
  true,   -- documents_send_to_homeowner ✅ INCLUDED
  true,   -- documents_basic_esign ✅ INCLUDED
  false,  -- documents_multi_version ❌ UPSELL
  false,  -- documents_change_order_automation ❌ UPSELL
  false,  -- documents_templates ❌ UPSELL
  -- Payments (Lite) ✅ INCLUDED
  true,   -- payments_deposit_requests ✅ INCLUDED
  true,   -- payments_stripe_links ✅ INCLUDED
  true,   -- payments_mark_manually ✅ INCLUDED
  false,  -- payments_ach ❌ UPSELL
  false,  -- payments_job_balance_intelligence ❌ UPSELL
  false,  -- payments_automation ❌ UPSELL
  false,  -- payments_invoice_aging_kpis ❌ UPSELL
  -- AI Intelligence (Lite) ✅ INCLUDED
  true,   -- ai_intelligence_daily_summary ✅ INCLUDED
  2,      -- ai_intelligence_insights_per_job (1-2 insights) ✅ INCLUDED
  false,  -- ai_intelligence_risk_detection ❌ UPSELL
  false,  -- ai_intelligence_margin_analysis ❌ UPSELL
  false,  -- ai_intelligence_schedule_predictions ❌ UPSELL
  false,  -- ai_intelligence_supplier_intelligence ❌ UPSELL
  false,  -- ai_intelligence_daily_briefings ❌ UPSELL
  -- Automations (Lite) ✅ INCLUDED
  1,      -- automations_max_rules (1 automation rule) ✅ INCLUDED
  false,  -- automations_multi_step_workflows ❌ UPSELL
  false,  -- automations_production_alerts ❌ UPSELL
  false,  -- automations_material_delay_alerts ❌ UPSELL
  false,  -- automations_review_requests ❌ UPSELL
  false,  -- automations_custom_conditions ❌ UPSELL
  -- Field App (Lite) ✅ INCLUDED
  true,   -- field_app_photo_uploads ✅ INCLUDED
  true,   -- field_app_notes ✅ INCLUDED
  true,   -- field_app_crew_checkin ✅ INCLUDED
  false,  -- field_app_productivity_scoring ❌ UPSELL
  false,  -- field_app_forecast_updates ❌ UPSELL
  -- Homeowner Portal (Lite) ✅ INCLUDED
  true,   -- homeowner_portal_documents ✅ INCLUDED
  true,   -- homeowner_portal_payments ✅ INCLUDED
  true,   -- homeowner_portal_progress_photos ✅ INCLUDED
  false,  -- homeowner_portal_messaging ❌ UPSELL
  false,  -- homeowner_portal_review_request ❌ UPSELL
  false,  -- homeowner_portal_ai_summaries ❌ UPSELL
  -- Dashboard (Lite) ✅ INCLUDED
  true,   -- dashboard_leads ✅ INCLUDED
  true,   -- dashboard_replies ✅ INCLUDED
  true,   -- dashboard_estimates_sent ✅ INCLUDED
  true,   -- dashboard_basic_pipeline ✅ INCLUDED
  false,  -- dashboard_profit_dashboard ❌ UPSELL
  false,  -- dashboard_margin_tracking ❌ UPSELL
  false,  -- dashboard_crew_kpis ❌ UPSELL
  false,  -- dashboard_supplier_reliability ❌ UPSELL
  false,  -- dashboard_forecast_trends ❌ UPSELL
  -- Additional Features ❌ UPSELL
  false,  -- material_tracking ❌ UPSELL
  false,  -- crew_productivity_scores ❌ UPSELL
  false   -- profit_forecasting ❌ UPSELL
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

-- Add description column to subscription_plans if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'subscription_plans' 
    AND column_name = 'description'
  ) THEN
    ALTER TABLE public.subscription_plans ADD COLUMN description text;
    ALTER TABLE public.subscription_plans ADD COLUMN tagline text;
  END IF;
END $$;

-- Update Starter Plan description
UPDATE public.subscription_plans
SET 
  description = 'The gateway plan. The low-friction entry point. Get your first booked jobs with SmartSend. Zero risk. Once they feel the results, they WILL upgrade.',
  tagline = '1 Campaign • 500 Emails • Basic AI • Limited Automations'
WHERE id = 'starter';

-- Create helper function to check Starter Plan feature access
CREATE OR REPLACE FUNCTION public.can_access_starter_feature(
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

-- Create helper function to get Starter Plan automation limit
CREATE OR REPLACE FUNCTION public.get_automation_limit(p_user_id uuid)
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

-- Create helper function to get Starter Plan AI insights limit per job
CREATE OR REPLACE FUNCTION public.get_ai_insights_limit_per_job(p_user_id uuid)
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

-- Comments
COMMENT ON TABLE public.plan_limits IS 'Block 23080: Comprehensive plan limits including Starter Plan feature flags';
COMMENT ON FUNCTION public.can_access_starter_feature(uuid, text) IS 'Block 23080: Check if user can access a specific Starter Plan feature (returns false for upsell features)';
COMMENT ON FUNCTION public.get_automation_limit(uuid) IS 'Block 23080: Get maximum automation rules allowed for user plan';
COMMENT ON FUNCTION public.get_ai_insights_limit_per_job(uuid) IS 'Block 23080: Get maximum AI insights per job for user plan';







































