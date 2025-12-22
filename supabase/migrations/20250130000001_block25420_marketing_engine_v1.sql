-- =========================================================
-- Block 25420 — SmartSend Roofing Marketing Engine v1
-- (Email Campaigns • Local Targeting • Referral Automation • 
--  Seasonal Templates • Storm Outbound • Lead Nurture)
-- =========================================================

-- ============================================================================
-- 1. MARKETING_CAMPAIGNS TABLE
-- ============================================================================
-- Extended campaigns table for marketing-specific campaigns

CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Campaign basics
  name text NOT NULL,
  campaign_type text NOT NULL CHECK (campaign_type IN (
    'inspection',
    'insurance_education',
    'previous_estimates',
    'referral',
    'seasonal',
    'storm_outbound',
    'lead_nurture',
    'newsletter',
    'customer_database',
    'custom'
  )),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled')),
  
  -- Targeting configuration
  targeting_type text CHECK (targeting_type IN ('all', 'zip', 'neighborhood', 'county', 'storm_path', 'customer_cluster', 'custom')),
  targeting_config jsonb DEFAULT '{}'::jsonb, -- { zips: [], neighborhoods: [], counties: [], radius_miles: 5 }
  
  -- Audience filters
  audience_filters jsonb DEFAULT '{}'::jsonb, -- { lead_age_months: 18, customer_years: [2021,2024], job_types: ['replacement', 'repair'] }
  
  -- Campaign content
  subject_template text NOT NULL,
  body_template text NOT NULL,
  from_email_account_id uuid REFERENCES public.email_accounts(id) ON DELETE SET NULL,
  sending_identity_id uuid REFERENCES public.sending_identities(id) ON DELETE SET NULL,
  
  -- Scheduling
  start_date timestamptz,
  end_date timestamptz,
  timezone text DEFAULT 'America/Los_Angeles',
  sending_window_start time,
  sending_window_end time,
  daily_send_cap integer,
  
  -- Sequence configuration (for multi-step campaigns)
  sequence_steps jsonb DEFAULT '[]'::jsonb, -- Array of { step_order, delay_days, subject, body }
  
  -- Storm-specific fields
  storm_event_id uuid REFERENCES public.storm_events(id) ON DELETE SET NULL,
  storm_zip text,
  storm_severity text,
  
  -- Seasonal fields
  season text CHECK (season IN ('spring', 'summer', 'fall', 'winter')),
  
  -- Referral-specific fields
  referral_incentive_type text CHECK (referral_incentive_type IN ('gift_card', 'discount', 'free_service', 'none')),
  referral_incentive_value text, -- e.g., "$50 gift card", "10% off", "Free gutter cleaning"
  
  -- Analytics
  total_recipients integer DEFAULT 0,
  total_sent integer DEFAULT 0,
  total_opens integer DEFAULT 0,
  total_clicks integer DEFAULT 0,
  total_replies integer DEFAULT 0,
  total_bookings integer DEFAULT 0,
  total_revenue numeric(12,2) DEFAULT 0,
  total_unsubscribes integer DEFAULT 0,
  
  -- Metadata
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_workspace ON public.marketing_campaigns(workspace_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_type ON public.marketing_campaigns(campaign_type);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status ON public.marketing_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_storm ON public.marketing_campaigns(storm_event_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_season ON public.marketing_campaigns(season);

-- ============================================================================
-- 2. MARKETING_CAMPAIGN_RECIPIENTS TABLE
-- ============================================================================
-- Tracks which contacts/leads are enrolled in marketing campaigns

CREATE TABLE IF NOT EXISTS public.marketing_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  
  -- Recipient info (denormalized for performance)
  email text NOT NULL,
  first_name text,
  last_name text,
  zip text,
  city text,
  state text,
  
  -- Status tracking
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'sent', 'opened', 'clicked', 'replied', 'booked', 'unsubscribed', 'bounced', 'skipped')),
  
  -- Step tracking (for multi-step campaigns)
  current_step integer DEFAULT 0,
  last_step_sent_at timestamptz,
  next_step_scheduled_at timestamptz,
  
  -- Engagement tracking
  opened_at timestamptz,
  clicked_at timestamptz,
  replied_at timestamptz,
  booked_at timestamptz,
  unsubscribed_at timestamptz,
  
  -- Conversion tracking
  booking_id uuid,
  revenue numeric(12,2),
  
  -- Metadata
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_campaign_recipients_unique 
  ON public.marketing_campaign_recipients(campaign_id, email);
CREATE INDEX IF NOT EXISTS idx_marketing_campaign_recipients_campaign ON public.marketing_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_campaign_recipients_status ON public.marketing_campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_marketing_campaign_recipients_zip ON public.marketing_campaign_recipients(zip);

-- ============================================================================
-- 3. SEASONAL_TEMPLATES TABLE
-- ============================================================================
-- Pre-built seasonal email templates for roofing

CREATE TABLE IF NOT EXISTS public.seasonal_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE, -- NULL = global template
  
  -- Template identification
  season text NOT NULL CHECK (season IN ('spring', 'summer', 'fall', 'winter')),
  template_name text NOT NULL, -- e.g., "Spring Leak Prevention", "Summer Heat Damage"
  
  -- Template content
  subject_template text NOT NULL,
  body_template text NOT NULL,
  
  -- Template metadata
  description text,
  use_case text, -- e.g., "leak_prevention", "heat_damage", "winter_prep", "emergency_repair"
  tags text[] DEFAULT '{}',
  
  -- Usage stats
  times_used integer DEFAULT 0,
  avg_open_rate numeric(5,2),
  avg_reply_rate numeric(5,2),
  
  -- Metadata
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, season, template_name)
);

CREATE INDEX IF NOT EXISTS idx_seasonal_templates_workspace ON public.seasonal_templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_seasonal_templates_season ON public.seasonal_templates(season);

-- ============================================================================
-- 4. REFERRAL_AUTOMATION TABLE
-- ============================================================================
-- Tracks referral automation campaigns and triggers

CREATE TABLE IF NOT EXISTS public.referral_automation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Trigger configuration
  trigger_type text NOT NULL CHECK (trigger_type IN ('job_completion', 'lead_creation', 'manual', 'scheduled')),
  trigger_delay_days integer DEFAULT 0, -- Days after trigger to send referral request
  
  -- Campaign content
  subject_template text NOT NULL,
  body_template text NOT NULL,
  
  -- Incentive configuration
  incentive_type text CHECK (incentive_type IN ('gift_card', 'discount', 'free_service', 'none')),
  incentive_value text,
  incentive_description text,
  
  -- Status
  is_active boolean DEFAULT true,
  
  -- Tracking
  total_sent integer DEFAULT 0,
  total_referrals_received integer DEFAULT 0,
  total_leads_generated integer DEFAULT 0,
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_automation_workspace ON public.referral_automation(workspace_id);
CREATE INDEX IF NOT EXISTS idx_referral_automation_active ON public.referral_automation(workspace_id, is_active);

-- ============================================================================
-- 5. REFERRAL_TRACKING TABLE (Enhanced)
-- ============================================================================
-- Tracks individual referral requests and responses

CREATE TABLE IF NOT EXISTS public.referral_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Source (who we're asking for referrals)
  source_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  source_lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  source_job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  
  -- Referral automation that triggered this
  referral_automation_id uuid REFERENCES public.referral_automation(id) ON DELETE SET NULL,
  
  -- Referral request status
  request_sent_at timestamptz,
  request_status text DEFAULT 'pending' CHECK (request_status IN ('pending', 'sent', 'replied', 'converted', 'expired')),
  
  -- Referral details (if received)
  referral_contacts jsonb DEFAULT '[]'::jsonb, -- Array of { name, email, phone, notes }
  referral_count integer DEFAULT 0,
  
  -- Conversion tracking
  leads_created jsonb DEFAULT '[]'::jsonb, -- Array of lead IDs created from referrals
  bookings_created jsonb DEFAULT '[]'::jsonb, -- Array of booking IDs
  
  -- Incentive tracking
  incentive_awarded boolean DEFAULT false,
  incentive_awarded_at timestamptz,
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_tracking_workspace ON public.referral_tracking(workspace_id);
CREATE INDEX IF NOT EXISTS idx_referral_tracking_source_contact ON public.referral_tracking(source_contact_id);
CREATE INDEX IF NOT EXISTS idx_referral_tracking_source_job ON public.referral_tracking(source_job_id);
CREATE INDEX IF NOT EXISTS idx_referral_tracking_status ON public.referral_tracking(request_status);

-- ============================================================================
-- 6. STORM_CAMPAIGN_TRIGGERS TABLE
-- ============================================================================
-- Links storm events to marketing campaigns

CREATE TABLE IF NOT EXISTS public.storm_campaign_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  storm_event_id uuid REFERENCES public.storm_events(id) ON DELETE SET NULL,
  
  -- Campaign configuration
  campaign_template_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL, -- Template to use
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL, -- Actual campaign created
  
  -- Trigger configuration
  auto_create boolean DEFAULT false, -- Auto-create campaign on storm detection
  requires_approval boolean DEFAULT true, -- Require approval before sending
  approval_status text DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'sent')),
  
  -- Targeting
  affected_zips text[] DEFAULT '{}',
  affected_neighborhoods text[] DEFAULT '{}',
  radius_miles integer DEFAULT 5,
  
  -- Metadata
  detected_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storm_campaign_triggers_workspace ON public.storm_campaign_triggers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_storm_campaign_triggers_storm ON public.storm_campaign_triggers(storm_event_id);
CREATE INDEX IF NOT EXISTS idx_storm_campaign_triggers_status ON public.storm_campaign_triggers(approval_status);

-- ============================================================================
-- 7. LEAD_NURTURE_SEQUENCES TABLE
-- ============================================================================
-- Pre-configured nurture sequences for leads

CREATE TABLE IF NOT EXISTS public.lead_nurture_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE, -- NULL = global template
  
  -- Sequence identification
  name text NOT NULL,
  description text,
  
  -- Sequence steps
  steps jsonb NOT NULL DEFAULT '[]'::jsonb, -- Array of { step_order, delay_days, subject, body }
  
  -- Targeting
  target_lead_age_days integer DEFAULT 30, -- Target leads older than X days
  target_statuses text[] DEFAULT '{}', -- Which lead statuses to target
  
  -- Status
  is_active boolean DEFAULT true,
  
  -- Usage stats
  total_enrolled integer DEFAULT 0,
  total_completed integer DEFAULT 0,
  avg_completion_rate numeric(5,2),
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_nurture_sequences_workspace ON public.lead_nurture_sequences(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_nurture_sequences_active ON public.lead_nurture_sequences(workspace_id, is_active);

-- ============================================================================
-- 8. LEAD_NURTURE_ENROLLMENTS TABLE
-- ============================================================================
-- Tracks which leads are enrolled in nurture sequences

CREATE TABLE IF NOT EXISTS public.lead_nurture_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id uuid NOT NULL REFERENCES public.lead_nurture_sequences(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  
  -- Enrollment status
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled', 'converted')),
  
  -- Step tracking
  current_step integer DEFAULT 0,
  last_step_sent_at timestamptz,
  next_step_scheduled_at timestamptz,
  
  -- Conversion tracking
  converted_at timestamptz,
  converted_to_booking boolean DEFAULT false,
  booking_id uuid,
  
  -- Metadata
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_nurture_enrollments_unique 
  ON public.lead_nurture_enrollments(sequence_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_nurture_enrollments_sequence ON public.lead_nurture_enrollments(sequence_id);
CREATE INDEX IF NOT EXISTS idx_lead_nurture_enrollments_lead ON public.lead_nurture_enrollments(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_nurture_enrollments_status ON public.lead_nurture_enrollments(status);

-- ============================================================================
-- 9. MARKETING_ANALYTICS TABLE
-- ============================================================================
-- Aggregated analytics for marketing campaigns

CREATE TABLE IF NOT EXISTS public.marketing_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  
  -- Date range
  date date NOT NULL,
  
  -- Metrics
  recipients integer DEFAULT 0,
  sent integer DEFAULT 0,
  delivered integer DEFAULT 0,
  opened integer DEFAULT 0,
  clicked integer DEFAULT 0,
  replied integer DEFAULT 0,
  booked integer DEFAULT 0,
  unsubscribed integer DEFAULT 0,
  bounced integer DEFAULT 0,
  
  -- Revenue metrics
  revenue numeric(12,2) DEFAULT 0,
  projected_revenue numeric(12,2) DEFAULT 0,
  
  -- Calculated rates
  open_rate numeric(5,2),
  click_rate numeric(5,2),
  reply_rate numeric(5,2),
  booking_rate numeric(5,2),
  unsubscribe_rate numeric(5,2),
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, campaign_id, date)
);

CREATE INDEX IF NOT EXISTS idx_marketing_analytics_workspace ON public.marketing_analytics(workspace_id);
CREATE INDEX IF NOT EXISTS idx_marketing_analytics_campaign ON public.marketing_analytics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_analytics_date ON public.marketing_analytics(date);

-- ============================================================================
-- 10. LOCAL_TARGETING_CONFIG TABLE
-- ============================================================================
-- Configuration for local targeting rules

CREATE TABLE IF NOT EXISTS public.local_targeting_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Targeting type
  targeting_type text NOT NULL CHECK (targeting_type IN ('zip', 'neighborhood', 'county', 'storm_path', 'customer_cluster', 'radius')),
  
  -- Targeting values
  zip_codes text[] DEFAULT '{}',
  neighborhoods text[] DEFAULT '{}',
  counties text[] DEFAULT '{}',
  center_latitude numeric(10,7),
  center_longitude numeric(10,7),
  radius_miles integer,
  
  -- Customer cluster targeting
  min_completed_jobs integer DEFAULT 0,
  cluster_radius_miles integer DEFAULT 2,
  
  -- Status
  is_active boolean DEFAULT true,
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_local_targeting_config_workspace ON public.local_targeting_config(workspace_id);
CREATE INDEX IF NOT EXISTS idx_local_targeting_config_active ON public.local_targeting_config(workspace_id, is_active);

-- ============================================================================
-- 11. RLS POLICIES
-- ============================================================================

ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasonal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_automation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.storm_campaign_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_nurture_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_nurture_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_targeting_config ENABLE ROW LEVEL SECURITY;

-- Marketing campaigns: workspace members can access
CREATE POLICY "marketing_campaigns_workspace_access"
ON public.marketing_campaigns
FOR ALL
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
);

-- Marketing campaign recipients: via campaign access
CREATE POLICY "marketing_campaign_recipients_access"
ON public.marketing_campaign_recipients
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.marketing_campaigns mc
    JOIN public.workspace_members wm ON wm.workspace_id = mc.workspace_id
    WHERE mc.id = campaign_id AND wm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.marketing_campaigns mc
    JOIN public.workspace_members wm ON wm.workspace_id = mc.workspace_id
    WHERE mc.id = campaign_id AND wm.user_id = auth.uid()
  )
);

-- Seasonal templates: workspace or global
CREATE POLICY "seasonal_templates_access"
ON public.seasonal_templates
FOR ALL
USING (
  workspace_id IS NULL OR
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  workspace_id IS NULL OR
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
);

-- Referral automation: workspace access
CREATE POLICY "referral_automation_access"
ON public.referral_automation
FOR ALL
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
);

-- Referral tracking: workspace access
CREATE POLICY "referral_tracking_access"
ON public.referral_tracking
FOR ALL
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
);

-- Storm campaign triggers: workspace access
CREATE POLICY "storm_campaign_triggers_access"
ON public.storm_campaign_triggers
FOR ALL
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
);

-- Lead nurture sequences: workspace or global
CREATE POLICY "lead_nurture_sequences_access"
ON public.lead_nurture_sequences
FOR ALL
USING (
  workspace_id IS NULL OR
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  workspace_id IS NULL OR
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
);

-- Lead nurture enrollments: via sequence access
CREATE POLICY "lead_nurture_enrollments_access"
ON public.lead_nurture_enrollments
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.lead_nurture_sequences lns
    LEFT JOIN public.workspace_members wm ON wm.workspace_id = lns.workspace_id
    WHERE lns.id = sequence_id 
      AND (lns.workspace_id IS NULL OR wm.user_id = auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.lead_nurture_sequences lns
    LEFT JOIN public.workspace_members wm ON wm.workspace_id = lns.workspace_id
    WHERE lns.id = sequence_id 
      AND (lns.workspace_id IS NULL OR wm.user_id = auth.uid())
  )
);

-- Marketing analytics: workspace access
CREATE POLICY "marketing_analytics_access"
ON public.marketing_analytics
FOR ALL
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
);

-- Local targeting config: workspace access
CREATE POLICY "local_targeting_config_access"
ON public.local_targeting_config
FOR ALL
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
);

-- ============================================================================
-- 12. FUNCTIONS & TRIGGERS
-- ============================================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_marketing_campaigns_updated_at
  BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_seasonal_templates_updated_at
  BEFORE UPDATE ON public.seasonal_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_referral_automation_updated_at
  BEFORE UPDATE ON public.referral_automation
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_referral_tracking_updated_at
  BEFORE UPDATE ON public.referral_tracking
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lead_nurture_sequences_updated_at
  BEFORE UPDATE ON public.lead_nurture_sequences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_marketing_analytics_updated_at
  BEFORE UPDATE ON public.marketing_analytics
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_local_targeting_config_updated_at
  BEFORE UPDATE ON public.local_targeting_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 13. SEED DATA: Default Seasonal Templates
-- ============================================================================

INSERT INTO public.seasonal_templates (workspace_id, season, template_name, subject_template, body_template, description, use_case, tags)
VALUES
  -- Spring Templates
  (NULL, 'spring', 'Leak Prevention Campaign', 
   'Rain season is coming — make sure your roof is ready',
   'Hi {{first_name}},\n\nSpring showers are on the way, and now is the perfect time to ensure your roof is ready for the wet season.\n\nA small leak can quickly become a major problem. We offer free roof inspections to catch issues before they become costly repairs.\n\nWould you like to schedule a free inspection this week?\n\nBest regards,\n{{company_name}}',
   'Spring leak prevention campaign targeting homeowners before rainy season',
   'leak_prevention',
   ARRAY['spring', 'leak', 'inspection', 'preventive']),
  
  -- Summer Templates
  (NULL, 'summer', 'Heat Damage Campaign',
   'Shingle cracking is common in high heat. Free inspection this week',
   'Hi {{first_name}},\n\nSummer heat can take a toll on your roof. High temperatures cause shingles to expand and contract, leading to cracking and granule loss.\n\nWe''re offering free roof inspections this week to check for heat damage. Early detection can save you thousands.\n\nReply to schedule your free inspection.\n\nBest regards,\n{{company_name}}',
   'Summer heat damage awareness campaign',
   'heat_damage',
   ARRAY['summer', 'heat', 'shingles', 'inspection']),
  
  -- Fall Templates
  (NULL, 'fall', 'Winter Prep Campaign',
   'Snow and ice damage roofs. Let us check ventilation + flashing',
   'Hi {{first_name}},\n\nWinter is coming, and snow and ice can cause serious damage to roofs. Proper ventilation and flashing are critical.\n\nWe''re offering free inspections to check your roof''s readiness for winter. Let us ensure your home is protected.\n\nSchedule your free inspection today.\n\nBest regards,\n{{company_name}}',
   'Fall winter preparation campaign',
   'winter_prep',
   ARRAY['fall', 'winter', 'preparation', 'ventilation']),
  
  -- Winter Templates
  (NULL, 'winter', 'Emergency Repair Campaign',
   'If your roof leaks this winter, we offer emergency tarping + repair',
   'Hi {{first_name}},\n\nWinter storms can cause sudden roof leaks. If you experience a leak, we offer 24/7 emergency tarping and repair services.\n\nDon''t let a small leak turn into major water damage. We''re here to help.\n\nCall us anytime for emergency roof repairs.\n\nBest regards,\n{{company_name}}',
   'Winter emergency repair campaign',
   'emergency_repair',
   ARRAY['winter', 'emergency', 'repair', 'leak'])
ON CONFLICT (workspace_id, season, template_name) DO NOTHING;

-- ============================================================================
-- 14. SEED DATA: Default Lead Nurture Sequence
-- ============================================================================

INSERT INTO public.lead_nurture_sequences (workspace_id, name, description, steps, is_active)
VALUES
  (NULL, 'Standard Lead Nurture v1', 
   '5-step automatic nurture sequence for leads that weren''t ready yet',
   '[
     {
       "step_order": 1,
       "delay_days": 0,
       "subject": "Still thinking about a new roof? Here''s what to look for",
       "body": "Hi {{first_name}},\n\nI know you''re considering a roof replacement. Here are the key signs to look for:\n\n• Missing or damaged shingles\n• Granule loss in gutters\n• Sagging roof deck\n• Water stains on ceilings\n\nWould you like a free inspection to assess your roof''s condition?\n\nBest regards,\n{{company_name}}"
     },
     {
       "step_order": 2,
       "delay_days": 7,
       "subject": "Insurance may cover more than you think",
       "body": "Hi {{first_name}},\n\nMany homeowners don''t realize their insurance may cover roof replacement costs, especially after storms.\n\nWe can help you:\n• File insurance claims\n• Navigate ACV vs replacement cost\n• Handle supplements\n\nWant to learn more about insurance coverage?\n\nBest regards,\n{{company_name}}"
     },
     {
       "step_order": 3,
       "delay_days": 14,
       "subject": "Here''s how to check for shingle granule loss",
       "body": "Hi {{first_name}},\n\nGranule loss is a key indicator your roof needs attention. Check your gutters after rain — if you see granules, your shingles are deteriorating.\n\nWe offer free inspections to assess granule loss and overall roof health.\n\nReply to schedule your inspection.\n\nBest regards,\n{{company_name}}"
     },
     {
       "step_order": 4,
       "delay_days": 21,
       "subject": "What''s the best time of year to replace your roof?",
       "body": "Hi {{first_name}},\n\nSpring and fall are ideal times for roof replacement — moderate temperatures make installation easier and more efficient.\n\nWe''re currently booking installations for the upcoming season. Would you like to get on our schedule?\n\nBest regards,\n{{company_name}}"
     },
     {
       "step_order": 5,
       "delay_days": 28,
       "subject": "We''re offering free inspections this week",
       "body": "Hi {{first_name}},\n\nWe have availability this week for free roof inspections. No obligation, just an honest assessment of your roof''s condition.\n\nReply to schedule your free inspection.\n\nBest regards,\n{{company_name}}"
     }
   ]'::jsonb,
   true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================




































