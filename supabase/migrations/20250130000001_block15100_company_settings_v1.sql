-- =========================================================
-- Block 15100 — SmartSend Company Settings v1
-- (Global Workspace Settings, Branding, Default Preferences & Core Identity Controls)
-- =========================================================

-- ============================================
-- 1) Company Settings Table (General Settings)
-- ============================================
CREATE TABLE IF NOT EXISTS public.company_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Company Info
  company_name text,
  owner_name text,
  company_phone text,
  company_email text,
  website text,
  address text,
  timezone text NOT NULL DEFAULT 'America/New_York',
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_company_settings_workspace ON public.company_settings(workspace_id);

-- ============================================
-- 2) Company Branding Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.company_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  logo_url text,
  brand_primary_color text DEFAULT '#1E40AF', -- Default blue
  brand_accent_color text DEFAULT '#3B82F6',
  button_color text DEFAULT '#2563EB',
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_company_branding_workspace ON public.company_branding(workspace_id);

-- ============================================
-- 3) Company Notifications Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.company_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Notification toggles
  notify_new_reply boolean DEFAULT true,
  notify_hot_lead boolean DEFAULT true,
  notify_insurance_signals boolean DEFAULT true,
  notify_appointment_booked boolean DEFAULT true,
  notify_appointment_canceled boolean DEFAULT false,
  notify_task_overdue boolean DEFAULT true,
  notify_domain_health_warnings boolean DEFAULT true,
  notify_billing_issues boolean DEFAULT true,
  notify_team_member_actions boolean DEFAULT false,
  -- Notification methods
  notify_via_email boolean DEFAULT true,
  notify_via_sms boolean DEFAULT false, -- v2
  notify_via_in_app boolean DEFAULT true,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_company_notifications_workspace ON public.company_notifications(workspace_id);

-- ============================================
-- 4) Company Scheduler Settings Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.company_scheduler_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Business hours (stored as JSON: { "monday": { "start": "09:00", "end": "17:00", "enabled": true }, ... })
  business_hours jsonb DEFAULT '{
    "monday": {"start": "09:00", "end": "17:00", "enabled": true},
    "tuesday": {"start": "09:00", "end": "17:00", "enabled": true},
    "wednesday": {"start": "09:00", "end": "17:00", "enabled": true},
    "thursday": {"start": "09:00", "end": "17:00", "enabled": true},
    "friday": {"start": "09:00", "end": "17:00", "enabled": true},
    "saturday": {"start": "09:00", "end": "13:00", "enabled": false},
    "sunday": {"start": "09:00", "end": "13:00", "enabled": false}
  }'::jsonb,
  -- Appointment settings
  default_appointment_duration_minutes integer DEFAULT 30,
  max_appointments_per_day integer DEFAULT 10,
  -- Blocked days (array of dates as ISO strings)
  blocked_days text[] DEFAULT ARRAY[]::text[],
  -- Default appointment type
  default_appointment_type text DEFAULT 'estimate',
  -- Lead assignment rule for bookings
  booking_assignment_rule text DEFAULT 'manual', -- 'manual', 'round_robin', 'by_pipeline_stage', 'by_region'
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_company_scheduler_settings_workspace ON public.company_scheduler_settings(workspace_id);

-- ============================================
-- 5) Company Pipeline Settings Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.company_pipeline_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Default new lead status
  default_new_lead_status text DEFAULT 'cold', -- 'cold', 'warm', 'hot'
  -- Auto-status rules (stored as JSON)
  auto_status_on_import jsonb DEFAULT '{}'::jsonb,
  auto_status_on_task_completion jsonb DEFAULT '{}'::jsonb,
  -- Lead score → pipeline mapping (JSON: { "threshold": 70, "status": "hot" })
  lead_score_pipeline_mapping jsonb DEFAULT '[
    {"min_score": 0, "max_score": 30, "status": "cold"},
    {"min_score": 31, "max_score": 60, "status": "warm"},
    {"min_score": 61, "max_score": 100, "status": "hot"}
  ]'::jsonb,
  -- Permissions
  allow_staff_to_move_leads boolean DEFAULT true,
  -- Auto-follow-up pause rules
  auto_followup_pause_on_reply boolean DEFAULT true,
  -- Not Interested timeout (days)
  not_interested_timeout_days integer DEFAULT 90,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_company_pipeline_settings_workspace ON public.company_pipeline_settings(workspace_id);

-- ============================================
-- 6) Company Lead Assignment Rules Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.company_lead_assignment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Assignment logic type
  assignment_logic text DEFAULT 'manual', -- 'manual', 'round_robin', 'by_pipeline_stage', 'by_region', 'by_appointment_type'
  -- Round-robin settings (JSON: { "enabled": true, "last_assigned_user_id": "uuid" })
  round_robin_config jsonb DEFAULT '{"enabled": false}'::jsonb,
  -- Pipeline stage → staff mapping (JSON: { "warm": "user_id_1", "hot": "user_id_2", "insurance": "owner_id" })
  pipeline_stage_mapping jsonb DEFAULT '{}'::jsonb,
  -- Region/zip → staff mapping (JSON: { "98001": "user_id_1", "98002": "user_id_2" })
  region_mapping jsonb DEFAULT '{}'::jsonb,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_company_lead_assignment_rules_workspace ON public.company_lead_assignment_rules(workspace_id);

-- ============================================
-- 7) Company Revenue Settings Table
-- ============================================
CREATE TABLE IF NOT EXISTS public.company_revenue_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Default value ranges (stored as JSON: { "min": 5000, "max": 15000 })
  default_repair_value_range jsonb DEFAULT '{"min": 5000, "max": 15000}'::jsonb,
  default_replacement_value_range jsonb DEFAULT '{"min": 15000, "max": 35000}'::jsonb,
  default_insurance_claim_range jsonb DEFAULT '{"min": 20000, "max": 50000}'::jsonb,
  -- Adjustments
  neighborhood_premium_percent numeric(5,2) DEFAULT 0.00, -- +/- percentage
  urgency_multiplier numeric(5,2) DEFAULT 1.00,
  -- Confidence thresholds (0-100)
  confidence_threshold_low integer DEFAULT 30,
  confidence_threshold_medium integer DEFAULT 60,
  confidence_threshold_high integer DEFAULT 80,
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_company_revenue_settings_workspace ON public.company_revenue_settings(workspace_id);

-- ============================================
-- 8) Updated_at Triggers
-- ============================================
CREATE OR REPLACE FUNCTION public.set_company_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_settings_updated_at ON public.company_settings;
CREATE TRIGGER trg_company_settings_updated_at
BEFORE UPDATE ON public.company_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_company_settings_updated_at();

DROP TRIGGER IF EXISTS trg_company_branding_updated_at ON public.company_branding;
CREATE TRIGGER trg_company_branding_updated_at
BEFORE UPDATE ON public.company_branding
FOR EACH ROW
EXECUTE FUNCTION public.set_company_settings_updated_at();

DROP TRIGGER IF EXISTS trg_company_notifications_updated_at ON public.company_notifications;
CREATE TRIGGER trg_company_notifications_updated_at
BEFORE UPDATE ON public.company_notifications
FOR EACH ROW
EXECUTE FUNCTION public.set_company_settings_updated_at();

DROP TRIGGER IF EXISTS trg_company_scheduler_settings_updated_at ON public.company_scheduler_settings;
CREATE TRIGGER trg_company_scheduler_settings_updated_at
BEFORE UPDATE ON public.company_scheduler_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_company_settings_updated_at();

DROP TRIGGER IF EXISTS trg_company_pipeline_settings_updated_at ON public.company_pipeline_settings;
CREATE TRIGGER trg_company_pipeline_settings_updated_at
BEFORE UPDATE ON public.company_pipeline_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_company_settings_updated_at();

DROP TRIGGER IF EXISTS trg_company_lead_assignment_rules_updated_at ON public.company_lead_assignment_rules;
CREATE TRIGGER trg_company_lead_assignment_rules_updated_at
BEFORE UPDATE ON public.company_lead_assignment_rules
FOR EACH ROW
EXECUTE FUNCTION public.set_company_settings_updated_at();

DROP TRIGGER IF EXISTS trg_company_revenue_settings_updated_at ON public.company_revenue_settings;
CREATE TRIGGER trg_company_revenue_settings_updated_at
BEFORE UPDATE ON public.company_revenue_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_company_settings_updated_at();

-- ============================================
-- 9) RLS Policies
-- ============================================
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_scheduler_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_pipeline_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_lead_assignment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_revenue_settings ENABLE ROW LEVEL SECURITY;

-- Helper function to check workspace membership and role
CREATE OR REPLACE FUNCTION public.is_workspace_member_with_role(
  p_workspace_id uuid,
  p_user_id uuid,
  p_required_role text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = p_user_id
      AND (p_required_role IS NULL OR role = p_required_role)
  );
$$;

-- Company Settings: Owners/Admins can read/write, staff can read
CREATE POLICY IF NOT EXISTS "company_settings_read"
ON public.company_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = company_settings.workspace_id
      AND user_id = auth.uid()
  )
);

CREATE POLICY IF NOT EXISTS "company_settings_write"
ON public.company_settings
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = company_settings.workspace_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = company_settings.workspace_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
);

-- Company Branding: Same as settings
CREATE POLICY IF NOT EXISTS "company_branding_read"
ON public.company_branding
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = company_branding.workspace_id
      AND user_id = auth.uid()
  )
);

CREATE POLICY IF NOT EXISTS "company_branding_write"
ON public.company_branding
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = company_branding.workspace_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = company_branding.workspace_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
);

-- Company Notifications: Owners/Admins can read/write, managers limited, staff read-only
CREATE POLICY IF NOT EXISTS "company_notifications_read"
ON public.company_notifications
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = company_notifications.workspace_id
      AND user_id = auth.uid()
  )
);

CREATE POLICY IF NOT EXISTS "company_notifications_write"
ON public.company_notifications
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = company_notifications.workspace_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = company_notifications.workspace_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'manager')
  )
);

-- Company Scheduler Settings: Owners/Admins can read/write, managers limited, staff read-only
CREATE POLICY IF NOT EXISTS "company_scheduler_settings_read"
ON public.company_scheduler_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = company_scheduler_settings.workspace_id
      AND user_id = auth.uid()
  )
);

CREATE POLICY IF NOT EXISTS "company_scheduler_settings_write"
ON public.company_scheduler_settings
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = company_scheduler_settings.workspace_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = company_scheduler_settings.workspace_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'manager')
  )
);

-- Company Pipeline Settings: Owners/Admins can read/write, managers limited, staff read-only
CREATE POLICY IF NOT EXISTS "company_pipeline_settings_read"
ON public.company_pipeline_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = company_pipeline_settings.workspace_id
      AND user_id = auth.uid()
  )
);

CREATE POLICY IF NOT EXISTS "company_pipeline_settings_write"
ON public.company_pipeline_settings
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = company_pipeline_settings.workspace_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = company_pipeline_settings.workspace_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'manager')
  )
);

-- Company Lead Assignment Rules: Owners/Admins only
CREATE POLICY IF NOT EXISTS "company_lead_assignment_rules_read"
ON public.company_lead_assignment_rules
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = company_lead_assignment_rules.workspace_id
      AND user_id = auth.uid()
  )
);

CREATE POLICY IF NOT EXISTS "company_lead_assignment_rules_write"
ON public.company_lead_assignment_rules
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = company_lead_assignment_rules.workspace_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = company_lead_assignment_rules.workspace_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
);

-- Company Revenue Settings: Owners/Admins only
CREATE POLICY IF NOT EXISTS "company_revenue_settings_read"
ON public.company_revenue_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = company_revenue_settings.workspace_id
      AND user_id = auth.uid()
  )
);

CREATE POLICY IF NOT EXISTS "company_revenue_settings_write"
ON public.company_revenue_settings
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = company_revenue_settings.workspace_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = company_revenue_settings.workspace_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  )
);

-- ============================================
-- 10) Comments
-- ============================================
COMMENT ON TABLE public.company_settings IS 'Company information and basic settings (name, contact, timezone)';
COMMENT ON TABLE public.company_branding IS 'Company branding assets (logo, colors) for scheduler, emails, and public pages';
COMMENT ON TABLE public.company_notifications IS 'Notification preferences for company events';
COMMENT ON TABLE public.company_scheduler_settings IS 'Default scheduler configuration (business hours, appointment types, assignment rules)';
COMMENT ON TABLE public.company_pipeline_settings IS 'Pipeline behavior defaults (auto-status rules, lead scoring, follow-up rules)';
COMMENT ON TABLE public.company_lead_assignment_rules IS 'Lead assignment logic configuration (round-robin, pipeline-based, region-based)';
COMMENT ON TABLE public.company_revenue_settings IS 'Revenue estimation defaults and adjustments (value ranges, premiums, multipliers)';





















































