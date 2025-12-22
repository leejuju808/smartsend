-- =========================================================
-- Block 19820 — Inbox Settings Center v1
-- (Quiet Hours, Notifications, Lead Score Weights, Default Actions, Inbox Layout Preferences — Full Control Panel)
-- =========================================================

-- ============================================================================
-- 1. EXTEND INBOX_SETTINGS TABLE WITH ALL NEW FIELDS
-- ============================================================================

-- Notification settings (per type and channel)
ALTER TABLE public.inbox_settings
  -- Hot lead alerts
  ADD COLUMN IF NOT EXISTS notify_hot_leads_push boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_hot_leads_email boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_hot_leads_desktop boolean DEFAULT true,
  
  -- Warm lead alerts
  ADD COLUMN IF NOT EXISTS notify_warm_leads_push boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_warm_leads_email boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_warm_leads_desktop boolean DEFAULT true,
  
  -- Task reminders
  ADD COLUMN IF NOT EXISTS notify_task_reminders_push boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_task_reminders_email boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_task_reminders_desktop boolean DEFAULT true,
  
  -- Daily follow-up digest
  ADD COLUMN IF NOT EXISTS notify_daily_digest_email boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_daily_digest_hour integer DEFAULT 7 CHECK (notify_daily_digest_hour >= 0 AND notify_daily_digest_hour <= 23),
  
  -- Weekly pipeline summary
  ADD COLUMN IF NOT EXISTS notify_weekly_summary_email boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_weekly_summary_day integer DEFAULT 1 CHECK (notify_weekly_summary_day >= 0 AND notify_weekly_summary_day <= 6), -- 0=Sunday, 6=Saturday
  
  -- Booked job alerts
  ADD COLUMN IF NOT EXISTS notify_booked_jobs_push boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_booked_jobs_email boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_booked_jobs_desktop boolean DEFAULT true,
  
  -- New activity feed items
  ADD COLUMN IF NOT EXISTS notify_activity_feed_push boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_activity_feed_email boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_activity_feed_desktop boolean DEFAULT true;

-- Quiet hours enhancements
ALTER TABLE public.inbox_settings
  ADD COLUMN IF NOT EXISTS quiet_hours_days integer[] DEFAULT ARRAY[0,1,2,3,4,5,6]::integer[], -- All days by default (0=Sunday, 6=Saturday)
  ADD COLUMN IF NOT EXISTS quiet_hours_emergency_override boolean DEFAULT false; -- Allow emergency notifications during quiet hours

-- Lead scoring weights (detailed breakdown)
ALTER TABLE public.inbox_settings
  ADD COLUMN IF NOT EXISTS lead_score_weight_leak_detected numeric(3,1) DEFAULT 5.0 CHECK (lead_score_weight_leak_detected >= 0 AND lead_score_weight_leak_detected <= 5),
  ADD COLUMN IF NOT EXISTS lead_score_weight_active_damage numeric(3,1) DEFAULT 5.0 CHECK (lead_score_weight_active_damage >= 0 AND lead_score_weight_active_damage <= 5),
  ADD COLUMN IF NOT EXISTS lead_score_weight_storm_event numeric(3,1) DEFAULT 4.0 CHECK (lead_score_weight_storm_event >= 0 AND lead_score_weight_storm_event <= 5),
  ADD COLUMN IF NOT EXISTS lead_score_weight_insurance_claim numeric(3,1) DEFAULT 4.5 CHECK (lead_score_weight_insurance_claim >= 0 AND lead_score_weight_insurance_claim <= 5),
  ADD COLUMN IF NOT EXISTS lead_score_weight_replacement_request numeric(3,1) DEFAULT 4.0 CHECK (lead_score_weight_replacement_request >= 0 AND lead_score_weight_replacement_request <= 5),
  ADD COLUMN IF NOT EXISTS lead_score_weight_budget_check numeric(3,1) DEFAULT 3.0 CHECK (lead_score_weight_budget_check >= 0 AND lead_score_weight_budget_check <= 5),
  ADD COLUMN IF NOT EXISTS lead_score_weight_price_shopper numeric(3,1) DEFAULT 2.0 CHECK (lead_score_weight_price_shopper >= 0 AND lead_score_weight_price_shopper <= 5),
  ADD COLUMN IF NOT EXISTS lead_score_weight_urgency numeric(3,1) DEFAULT 4.5 CHECK (lead_score_weight_urgency >= 0 AND lead_score_weight_urgency <= 5),
  ADD COLUMN IF NOT EXISTS lead_score_weight_multiple_messages numeric(3,1) DEFAULT 3.5 CHECK (lead_score_weight_multiple_messages >= 0 AND lead_score_weight_multiple_messages <= 5),
  ADD COLUMN IF NOT EXISTS lead_score_weight_phone_included numeric(3,1) DEFAULT 3.0 CHECK (lead_score_weight_phone_included >= 0 AND lead_score_weight_phone_included <= 5);

-- Follow-up defaults
ALTER TABLE public.inbox_settings
  ADD COLUMN IF NOT EXISTS followup_default_timing_hours integer DEFAULT 24 CHECK (followup_default_timing_hours >= 1 AND followup_default_timing_hours <= 168), -- 1 hour to 7 days
  ADD COLUMN IF NOT EXISTS followup_auto_reminder_hours integer DEFAULT 48 CHECK (followup_auto_reminder_hours >= 1 AND followup_auto_reminder_hours <= 168),
  ADD COLUMN IF NOT EXISTS followup_warm_lead_sequence_delay_hours integer DEFAULT 72 CHECK (followup_warm_lead_sequence_delay_hours >= 1 AND followup_warm_lead_sequence_delay_hours <= 336), -- Up to 2 weeks
  ADD COLUMN IF NOT EXISTS followup_no_response_trigger_hours integer DEFAULT 96 CHECK (followup_no_response_trigger_hours >= 1 AND followup_no_response_trigger_hours <= 336),
  ADD COLUMN IF NOT EXISTS followup_tone text DEFAULT 'balanced' CHECK (followup_tone IN ('aggressive', 'balanced', 'gentle'));

-- Task defaults
ALTER TABLE public.inbox_settings
  ADD COLUMN IF NOT EXISTS task_default_priority text DEFAULT 'medium' CHECK (task_default_priority IN ('low', 'medium', 'high', 'urgent')),
  ADD COLUMN IF NOT EXISTS task_default_due_hours integer DEFAULT 24 CHECK (task_default_due_hours >= 1 AND task_default_due_hours <= 168),
  ADD COLUMN IF NOT EXISTS task_default_assignee text DEFAULT 'auto' CHECK (task_default_assignee IN ('owner', 'rep', 'auto')),
  ADD COLUMN IF NOT EXISTS task_auto_mark_in_progress_on_open boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS task_auto_close_on_booked boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS task_auto_cancel_on_reply boolean DEFAULT false;

-- Inbox layout preferences
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inbox_layout_mode') THEN
    CREATE TYPE inbox_layout_mode AS ENUM ('compact', 'comfortable');
  END IF;
END$$;

ALTER TABLE public.inbox_settings
  ADD COLUMN IF NOT EXISTS layout_default_tab inbox_default_tab DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS layout_thread_preview_length integer DEFAULT 150 CHECK (layout_thread_preview_length >= 50 AND layout_thread_preview_length <= 500),
  ADD COLUMN IF NOT EXISTS layout_mode inbox_layout_mode DEFAULT 'comfortable',
  ADD COLUMN IF NOT EXISTS layout_show_lead_score boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS layout_show_contact_phone boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS layout_show_tags boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS layout_show_activity_feed boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS layout_show_ai_summary boolean DEFAULT true;

-- Team access & permissions (stored as JSONB for flexibility)
ALTER TABLE public.inbox_settings
  ADD COLUMN IF NOT EXISTS team_permissions jsonb DEFAULT '{}'::jsonb;

-- AI personalization options
ALTER TABLE public.inbox_settings
  ADD COLUMN IF NOT EXISTS ai_tone text DEFAULT 'professional' CHECK (ai_tone IN ('friendly', 'professional', 'direct')),
  ADD COLUMN IF NOT EXISTS ai_industry_variant text DEFAULT 'roofing' CHECK (ai_industry_variant IN ('roofing', 'gutters', 'solar', 'siding', 'windows', 'general')),
  ADD COLUMN IF NOT EXISTS ai_region_zip text,
  ADD COLUMN IF NOT EXISTS ai_insurance_heavy boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_retail_heavy boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_pricing_guidance_sensitivity numeric(3,1) DEFAULT 3.0 CHECK (ai_pricing_guidance_sensitivity >= 0 AND ai_pricing_guidance_sensitivity <= 5);

-- Mobile behavior preferences
ALTER TABLE public.inbox_settings
  ADD COLUMN IF NOT EXISTS mobile_notifications_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS mobile_vibrate_on_hot_lead boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS mobile_sound_enabled boolean DEFAULT true;

-- ============================================================================
-- 2. UPDATE DEFAULT SETTINGS FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_default_inbox_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.inbox_settings (
    user_id,
    default_tab,
    notify_new_hot,
    notify_new_warm,
    notify_new_follow_up,
    notify_booked,
    lead_priority_weight_hot,
    lead_priority_weight_warm,
    lead_priority_weight_followup,
    -- New notification defaults
    notify_hot_leads_push,
    notify_hot_leads_email,
    notify_hot_leads_desktop,
    notify_warm_leads_push,
    notify_warm_leads_email,
    notify_warm_leads_desktop,
    notify_task_reminders_push,
    notify_task_reminders_email,
    notify_task_reminders_desktop,
    notify_daily_digest_email,
    notify_daily_digest_hour,
    notify_weekly_summary_email,
    notify_weekly_summary_day,
    notify_booked_jobs_push,
    notify_booked_jobs_email,
    notify_booked_jobs_desktop,
    notify_activity_feed_push,
    notify_activity_feed_email,
    notify_activity_feed_desktop,
    -- Quiet hours
    quiet_hours_days,
    quiet_hours_emergency_override,
    -- Lead scoring weights
    lead_score_weight_leak_detected,
    lead_score_weight_active_damage,
    lead_score_weight_storm_event,
    lead_score_weight_insurance_claim,
    lead_score_weight_replacement_request,
    lead_score_weight_budget_check,
    lead_score_weight_price_shopper,
    lead_score_weight_urgency,
    lead_score_weight_multiple_messages,
    lead_score_weight_phone_included,
    -- Follow-up defaults
    followup_default_timing_hours,
    followup_auto_reminder_hours,
    followup_warm_lead_sequence_delay_hours,
    followup_no_response_trigger_hours,
    followup_tone,
    -- Task defaults
    task_default_priority,
    task_default_due_hours,
    task_default_assignee,
    task_auto_mark_in_progress_on_open,
    task_auto_close_on_booked,
    task_auto_cancel_on_reply,
    -- Layout preferences
    layout_default_tab,
    layout_thread_preview_length,
    layout_mode,
    layout_show_lead_score,
    layout_show_contact_phone,
    layout_show_tags,
    layout_show_activity_feed,
    layout_show_ai_summary,
    -- AI personalization
    ai_tone,
    ai_industry_variant,
    ai_insurance_heavy,
    ai_retail_heavy,
    ai_pricing_guidance_sensitivity,
    -- Mobile
    mobile_notifications_enabled,
    mobile_vibrate_on_hot_lead,
    mobile_sound_enabled
  ) VALUES (
    NEW.id,
    'all',
    true, true, true, true,
    100, 70, 50,
    -- Notifications
    true, true, true,
    true, true, true,
    true, true, true,
    true, 7,
    true, 1,
    true, true, true,
    false, false, true,
    -- Quiet hours
    ARRAY[0,1,2,3,4,5,6]::integer[],
    false,
    -- Lead scoring
    5.0, 5.0, 4.0, 4.5, 4.0, 3.0, 2.0, 4.5, 3.5, 3.0,
    -- Follow-up
    24, 48, 72, 96, 'balanced',
    -- Tasks
    'medium', 24, 'auto', true, true, false,
    -- Layout
    'all', 150, 'comfortable', true, true, true, true, true,
    -- AI
    'professional', 'roofing', false, true, 3.0,
    -- Mobile
    true, true, true
  )
  ON CONFLICT (user_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. UPDATE GET OR CREATE FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_or_create_inbox_settings(p_user_id uuid)
RETURNS public.inbox_settings
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_settings public.inbox_settings;
BEGIN
  -- Try to get existing settings
  SELECT * INTO v_settings
  FROM public.inbox_settings
  WHERE user_id = p_user_id;
  
  -- If no settings exist, create defaults
  IF v_settings IS NULL THEN
    INSERT INTO public.inbox_settings (
      user_id,
      default_tab,
      notify_new_hot,
      notify_new_warm,
      notify_new_follow_up,
      notify_booked,
      lead_priority_weight_hot,
      lead_priority_weight_warm,
      lead_priority_weight_followup
    ) VALUES (
      p_user_id,
      'all',
      true,
      true,
      true,
      true,
      100,
      70,
      50
    )
    RETURNING * INTO v_settings;
  END IF;
  
  RETURN v_settings;
END;
$$;

-- ============================================================================
-- 4. COMMENTS
-- ============================================================================

COMMENT ON COLUMN public.inbox_settings.notify_hot_leads_push IS 'Push notifications for hot leads';
COMMENT ON COLUMN public.inbox_settings.notify_hot_leads_email IS 'Email notifications for hot leads';
COMMENT ON COLUMN public.inbox_settings.notify_hot_leads_desktop IS 'Desktop notifications for hot leads';
COMMENT ON COLUMN public.inbox_settings.notify_daily_digest_hour IS 'Hour of day (0-23) to send daily follow-up digest';
COMMENT ON COLUMN public.inbox_settings.notify_weekly_summary_day IS 'Day of week (0=Sunday, 6=Saturday) to send weekly pipeline summary';
COMMENT ON COLUMN public.inbox_settings.quiet_hours_days IS 'Array of day numbers (0-6) when quiet hours apply';
COMMENT ON COLUMN public.inbox_settings.quiet_hours_emergency_override IS 'Allow emergency notifications during quiet hours';
COMMENT ON COLUMN public.inbox_settings.lead_score_weight_leak_detected IS 'Weight (0-5) for leak detected signals in lead scoring';
COMMENT ON COLUMN public.inbox_settings.followup_tone IS 'Default tone for follow-up messages: aggressive, balanced, or gentle';
COMMENT ON COLUMN public.inbox_settings.task_default_assignee IS 'Default assignee for new tasks: owner, rep, or auto';
COMMENT ON COLUMN public.inbox_settings.layout_mode IS 'Inbox layout density: compact or comfortable';
COMMENT ON COLUMN public.inbox_settings.ai_tone IS 'AI tone preference: friendly, professional, or direct';
COMMENT ON COLUMN public.inbox_settings.ai_industry_variant IS 'Industry variant for AI personalization';
COMMENT ON COLUMN public.inbox_settings.ai_pricing_guidance_sensitivity IS 'Sensitivity level (0-5) for AI pricing guidance';



















































