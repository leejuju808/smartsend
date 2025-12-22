-- =========================================================
-- Block 16700 — SmartSend Settings & Company Profile v2
-- (Branding, Sending Domains, Team Roles, Service Areas, Time Windows, Safety Controls, & Billing Integration)
-- =========================================================

-- ============================================
-- 1) Sending Domains Table (Elite-Level Safety)
-- ============================================
CREATE TABLE IF NOT EXISTS public.sending_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Domain information
  connected_domain text NOT NULL,
  -- DNS configuration
  dns_instructions text,
  spf_record text,
  dkim_record text,
  dmarc_record text,
  -- Domain health monitoring
  domain_health_score integer DEFAULT 0 CHECK (domain_health_score >= 0 AND domain_health_score <= 100),
  warmup_progress integer DEFAULT 0 CHECK (warmup_progress >= 0 AND warmup_progress <= 100),
  -- Send rate controls
  send_rate_cap integer DEFAULT 50,
  bounce_rate numeric(5,2) DEFAULT 0.00,
  spam_complaint_rate numeric(5,2) DEFAULT 0.00,
  -- Repair Domain button functionality
  repair_domain_enabled boolean DEFAULT false,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id, connected_domain)
);

CREATE INDEX IF NOT EXISTS idx_sending_domains_workspace ON public.sending_domains(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sending_domains_domain ON public.sending_domains(connected_domain);

-- ============================================
-- 2) Service Areas Table (Roofing-Specific)
-- ============================================
CREATE TABLE IF NOT EXISTS public.service_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Primary service area
  primary_city text,
  zip_codes_served text[], -- Array of zip codes
  service_radius_miles integer DEFAULT 25 CHECK (service_radius_miles >= 5 AND service_radius_miles <= 50),
  neighborhoods text[], -- Array of neighborhood names
  -- Feeds personalization engine
  personalization_enabled boolean DEFAULT true,
  -- Feeds scheduler rules
  scheduler_rules_enabled boolean DEFAULT true,
  -- Feeds travel time calculations
  travel_time_enabled boolean DEFAULT true,
  -- Feeds weather engine
  weather_enabled boolean DEFAULT true,
  -- Feeds campaign templates
  campaign_templates_enabled boolean DEFAULT true,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_service_areas_workspace ON public.service_areas(workspace_id);

-- ============================================
-- 3) Time Settings Table (Critical)
-- ============================================
CREATE TABLE IF NOT EXISTS public.time_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Time zone configuration
  timezone text NOT NULL DEFAULT 'America/New_York',
  -- Business hours
  business_hours_start time DEFAULT '09:00:00',
  business_hours_end time DEFAULT '17:00:00',
  -- Blackout times
  weekends_enabled boolean DEFAULT true,
  storm_emergency_exceptions jsonb DEFAULT '[]'::jsonb,
  -- Affects scheduler availability
  scheduler_availability_enabled boolean DEFAULT true,
  -- Affects campaign send windows
  campaign_send_windows_enabled boolean DEFAULT true,
  -- Affects auto-follow-ups
  auto_followups_enabled boolean DEFAULT true,
  -- Affects reminders
  reminders_enabled boolean DEFAULT true,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_time_settings_workspace ON public.time_settings(workspace_id);

-- ============================================
-- 4) Scheduler Rules Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.scheduler_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Default inspection duration
  default_inspection_duration_minutes integer DEFAULT 60 CHECK (default_inspection_duration_minutes > 0),
  -- Travel time multiplier
  travel_time_multiplier numeric(5,2) DEFAULT 1.50,
  -- Buffer between appointments
  buffer_between_appointments_minutes integer DEFAULT 15 CHECK (buffer_between_appointments_minutes >= 0),
  -- Max daily appointments
  max_daily_appointments integer DEFAULT 8 CHECK (max_daily_appointments > 0),
  -- Weather-block logic
  weather_block_enabled boolean DEFAULT true,
  -- Homeowner pre-form
  homeowner_preform_enabled boolean DEFAULT true,
  -- SMS reminders
  sms_reminders_enabled boolean DEFAULT true,
  -- Prep checklist
  prep_checklist_enabled boolean DEFAULT true,
  -- Shapes the entire scheduler
  scheduler_shaping_enabled boolean DEFAULT true,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_scheduler_rules_workspace ON public.scheduler_rules(workspace_id);

-- ============================================
-- 5) Integrations Table (v2)
-- ============================================
CREATE TABLE IF NOT EXISTS public.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Available integrations
  google_calendar_enabled boolean DEFAULT false,
  gmail_enabled boolean DEFAULT false,
  outlook_enabled boolean DEFAULT false,
  webhooks_enabled boolean DEFAULT false,
  zapier_enabled boolean DEFAULT false,
  jobnimbus_export_enabled boolean DEFAULT false,
  -- Integration status
  integration_status jsonb DEFAULT '{}'::jsonb,
  -- Makes SmartSend "stickier"
  stickiness_enabled boolean DEFAULT true,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_integrations_workspace ON public.integrations(workspace_id);

-- ============================================
-- 6) Security Section Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.security_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- 2FA
  two_factor_enabled boolean DEFAULT false,
  -- Session history
  session_history_enabled boolean DEFAULT true,
  -- Device management
  device_management_enabled boolean DEFAULT true,
  -- Password reset
  password_reset_enabled boolean DEFAULT true,
  -- Login notifications
  login_notifications_enabled boolean DEFAULT true,
  -- Professional SaaS quality
  professional_saas_quality boolean DEFAULT true,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_security_settings_workspace ON public.security_settings(workspace_id);

-- ============================================
-- 7) Data Export Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.data_export_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Export options
  export_contacts boolean DEFAULT true,
  export_tasks boolean DEFAULT true,
  export_pipeline boolean DEFAULT true,
  export_quotes boolean DEFAULT true,
  export_appointments boolean DEFAULT true,
  export_activity_logs boolean DEFAULT true,
  export_revenue_data boolean DEFAULT true,
  -- Builds TRUST
  trust_building_enabled boolean DEFAULT true,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_data_export_settings_workspace ON public.data_export_settings(workspace_id);

-- ============================================
-- 8) Enhanced Company Profile (v2) - Add new fields to existing table
-- ============================================
ALTER TABLE IF EXISTS public.company_settings
  ADD COLUMN IF NOT EXISTS license_number text,
  ADD COLUMN IF NOT EXISTS insurance_info text,
  ADD COLUMN IF NOT EXISTS service_type text CHECK (service_type IN ('Roofing', 'General Contractor', NULL));

-- ============================================
-- 9) Updated_at Triggers
-- ============================================
CREATE OR REPLACE FUNCTION public.set_settings_v2_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sending_domains_updated_at ON public.sending_domains;
CREATE TRIGGER trg_sending_domains_updated_at
BEFORE UPDATE ON public.sending_domains
FOR EACH ROW
EXECUTE FUNCTION public.set_settings_v2_updated_at();

DROP TRIGGER IF EXISTS trg_service_areas_updated_at ON public.service_areas;
CREATE TRIGGER trg_service_areas_updated_at
BEFORE UPDATE ON public.service_areas
FOR EACH ROW
EXECUTE FUNCTION public.set_settings_v2_updated_at();

DROP TRIGGER IF EXISTS trg_time_settings_updated_at ON public.time_settings;
CREATE TRIGGER trg_time_settings_updated_at
BEFORE UPDATE ON public.time_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_settings_v2_updated_at();

DROP TRIGGER IF EXISTS trg_scheduler_rules_updated_at ON public.scheduler_rules;
CREATE TRIGGER trg_scheduler_rules_updated_at
BEFORE UPDATE ON public.scheduler_rules
FOR EACH ROW
EXECUTE FUNCTION public.set_settings_v2_updated_at();

DROP TRIGGER IF EXISTS trg_integrations_updated_at ON public.integrations;
CREATE TRIGGER trg_integrations_updated_at
BEFORE UPDATE ON public.integrations
FOR EACH ROW
EXECUTE FUNCTION public.set_settings_v2_updated_at();

DROP TRIGGER IF EXISTS trg_security_settings_updated_at ON public.security_settings;
CREATE TRIGGER trg_security_settings_updated_at
BEFORE UPDATE ON public.security_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_settings_v2_updated_at();

DROP TRIGGER IF EXISTS trg_data_export_settings_updated_at ON public.data_export_settings;
CREATE TRIGGER trg_data_export_settings_updated_at
BEFORE UPDATE ON public.data_export_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_settings_v2_updated_at();

-- ============================================
-- 10) Comments
-- ============================================
COMMENT ON TABLE public.sending_domains IS 'Elite-level domain safety controls: DNS, SPF, DKIM, DMARC, health monitoring';
COMMENT ON TABLE public.service_areas IS 'Roofing-specific service territories: cities, zip codes, neighborhoods, radius';
COMMENT ON TABLE public.time_settings IS 'Critical time controls: timezone, business hours, blackout times, storm exceptions';
COMMENT ON TABLE public.scheduler_rules IS 'Scheduler configuration: inspection duration, travel time, buffers, weather blocks';
COMMENT ON TABLE public.integrations IS 'Available integrations: Google Calendar, Gmail/Outlook, Webhooks, Zapier, JobNimbus';
COMMENT ON TABLE public.security_settings IS 'Security controls: 2FA, session history, device management, password reset';
COMMENT ON TABLE public.data_export_settings IS 'Data export options: contacts, tasks, pipeline, quotes, appointments, activity logs, revenue data';





















































