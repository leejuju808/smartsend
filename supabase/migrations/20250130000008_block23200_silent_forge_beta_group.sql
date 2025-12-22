-- =========================================================
-- Block 23200 — SmartSend Silent Forge Beta Group v1
-- "5–10 Roofing Companies • Invitation-Only • Real-World Testing"
-- =========================================================

-- Silent Forge Beta Group Registry
-- Tracks the elite 5-10 roofing companies in the Silent Forge program
CREATE TABLE IF NOT EXISTS public.silent_forge_beta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Company Information
  company_name text NOT NULL,
  contact_person text NOT NULL,
  contact_phone text,
  contact_email text NOT NULL,
  service_area text,
  
  -- Qualification Criteria (from Block 23200 requirements)
  annual_revenue_range text CHECK (annual_revenue_range IN ('500K-1M', '1M-2M', '2M-3M', '3M+')),
  has_crew boolean DEFAULT false,
  crew_count int DEFAULT 0,
  has_office_person boolean DEFAULT false,
  owner_is_organized boolean DEFAULT false,
  uses_email_daily boolean DEFAULT false,
  uses_phone_daily boolean DEFAULT false,
  hungry_for_improvement boolean DEFAULT false,
  agreed_to_rules boolean DEFAULT false,
  
  -- Beta Status
  status text NOT NULL DEFAULT 'invited' CHECK (status IN (
    'invited',           -- Invited but not yet accepted
    'qualified',         -- Met qualification criteria
    'onboarding',        -- In onboarding process
    'active',            -- Actively using on real jobs
    'paused',            -- Temporarily paused
    'completed',         -- Beta period completed
    'removed'            -- Removed for violating rules
  )),
  
  -- Pricing & Terms
  tier text NOT NULL CHECK (tier IN ('growth', 'domination')),
  lifetime_discount_percent numeric(5,2) DEFAULT 50.00, -- 50% off locked forever
  locked_price_monthly numeric(10,2), -- Calculated: Growth $99.50 or Domination $199.50
  
  -- Timeline Tracking
  invited_at timestamptz,
  qualified_at timestamptz,
  onboarding_started_at timestamptz,
  onboarding_completed_at timestamptz,
  first_real_job_at timestamptz,
  beta_started_at timestamptz,
  beta_ends_at timestamptz,
  
  -- Onboarding Kit Completion
  onboarding_call_completed boolean DEFAULT false,
  jobs_migrated_count int DEFAULT 0,
  campaign_setup_completed boolean DEFAULT false,
  automations_configured_count int DEFAULT 0,
  stripe_connected boolean DEFAULT false,
  supplier_setup_completed boolean DEFAULT false,
  crew_onboarded boolean DEFAULT false,
  homeowner_portal_walkthrough_completed boolean DEFAULT false,
  
  -- Rules Compliance
  using_real_jobs boolean DEFAULT false,
  public_talk_violation boolean DEFAULT false,
  weekly_feedback_compliant boolean DEFAULT true,
  last_feedback_at timestamptz,
  feedback_missed_count int DEFAULT 0,
  
  -- Notes & Feedback
  admin_notes text,
  satisfaction_rating int CHECK (satisfaction_rating >= 1 AND satisfaction_rating <= 5),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(account_id),
  UNIQUE(contact_email)
);

CREATE INDEX IF NOT EXISTS idx_silent_forge_account ON public.silent_forge_beta(account_id);
CREATE INDEX IF NOT EXISTS idx_silent_forge_status ON public.silent_forge_beta(status);
CREATE INDEX IF NOT EXISTS idx_silent_forge_email ON public.silent_forge_beta(contact_email);
CREATE INDEX IF NOT EXISTS idx_silent_forge_tier ON public.silent_forge_beta(tier);

-- Silent Forge Testing Buckets Metrics
-- Tracks performance across the 7 testing buckets
CREATE TABLE IF NOT EXISTS public.silent_forge_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beta_id uuid NOT NULL REFERENCES public.silent_forge_beta(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  metric_date date NOT NULL DEFAULT CURRENT_DATE,
  
  -- Bucket 1: Outreach Performance
  emails_sent int DEFAULT 0,
  emails_landed int DEFAULT 0,
  replies_received int DEFAULT 0,
  reply_accuracy_percent numeric(5,2) DEFAULT 0, -- AI labeling accuracy
  followups_sent int DEFAULT 0,
  followups_correct int DEFAULT 0,
  leads_booked_estimates int DEFAULT 0,
  
  -- Bucket 2: Scheduling & Production
  calendar_events_created int DEFAULT 0,
  calendar_events_completed int DEFAULT 0,
  crew_checkins int DEFAULT 0,
  crew_checkouts int DEFAULT 0,
  delays_handled_automatically int DEFAULT 0,
  job_board_confusion_reports int DEFAULT 0,
  
  -- Bucket 3: Material Orders
  material_orders_created int DEFAULT 0,
  material_orders_tracked int DEFAULT 0,
  supplier_updates_received int DEFAULT 0,
  delays_detected int DEFAULT 0,
  delays_flagged_correctly int DEFAULT 0,
  timeline_updates_accurate int DEFAULT 0,
  
  -- Bucket 4: Homeowner Portal
  homeowner_portal_views int DEFAULT 0,
  homeowner_messages_sent int DEFAULT 0,
  homeowner_messages_opened int DEFAULT 0,
  homeowner_payments_collected int DEFAULT 0,
  homeowner_payment_time_hours numeric(10,2) DEFAULT 0,
  homeowner_satisfaction_score numeric(5,2) DEFAULT 0,
  
  -- Bucket 5: Payments
  deposits_collected int DEFAULT 0,
  deposits_collected_smoothly int DEFAULT 0,
  invoices_sent int DEFAULT 0,
  invoices_confused_count int DEFAULT 0,
  payment_flow_breaks int DEFAULT 0,
  routing_intuitive_score numeric(5,2) DEFAULT 0, -- 1-5 rating
  
  -- Bucket 6: Field App
  crew_photos_uploaded int DEFAULT 0,
  photos_uploaded_easily int DEFAULT 0,
  checkin_breaks int DEFAULT 0,
  checkout_breaks int DEFAULT 0,
  progress_updates_natural int DEFAULT 0,
  daily_feed_makes_sense_score numeric(5,2) DEFAULT 0, -- 1-5 rating
  
  -- Bucket 7: AI Intelligence + Automations
  ai_insights_generated int DEFAULT 0,
  ai_insights_accurate int DEFAULT 0,
  alerts_sent int DEFAULT 0,
  alerts_timely int DEFAULT 0,
  automations_fired int DEFAULT 0,
  automations_reliable int DEFAULT 0,
  owner_trusts_ai_score numeric(5,2) DEFAULT 0, -- 1-5 rating
  
  -- Overall System Metrics
  system_uptime_percent numeric(5,2) DEFAULT 100.00,
  bugs_found int DEFAULT 0,
  bugs_critical int DEFAULT 0,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(beta_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_silent_forge_metrics_beta ON public.silent_forge_metrics(beta_id);
CREATE INDEX IF NOT EXISTS idx_silent_forge_metrics_account ON public.silent_forge_metrics(account_id);
CREATE INDEX IF NOT EXISTS idx_silent_forge_metrics_date ON public.silent_forge_metrics(metric_date);

-- Silent Forge Weekly Feedback
-- Weekly feedback collection from beta testers
CREATE TABLE IF NOT EXISTS public.silent_forge_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beta_id uuid NOT NULL REFERENCES public.silent_forge_beta(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  
  feedback_week_start date NOT NULL,
  feedback_week_end date NOT NULL,
  
  -- Feedback Categories
  outreach_performance_notes text,
  scheduling_production_notes text,
  material_orders_notes text,
  homeowner_portal_notes text,
  payments_notes text,
  field_app_notes text,
  ai_automations_notes text,
  
  -- Wins & Issues
  biggest_wins text,
  biggest_issues text,
  critical_blockers text,
  
  -- Feature Requests (only business-critical)
  feature_requests text,
  feature_request_business_critical boolean DEFAULT false,
  
  -- Overall Rating
  overall_satisfaction int CHECK (overall_satisfaction >= 1 AND overall_satisfaction <= 5),
  would_recommend boolean,
  
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(beta_id, feedback_week_start)
);

CREATE INDEX IF NOT EXISTS idx_silent_forge_feedback_beta ON public.silent_forge_feedback(beta_id);
CREATE INDEX IF NOT EXISTS idx_silent_forge_feedback_week ON public.silent_forge_feedback(feedback_week_start, feedback_week_end);

-- Silent Forge Case Studies & Testimonials
-- Collect testimonials and case study data during beta
CREATE TABLE IF NOT EXISTS public.silent_forge_testimonials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beta_id uuid NOT NULL REFERENCES public.silent_forge_beta(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  
  testimonial_type text NOT NULL CHECK (testimonial_type IN (
    'quote',           -- Short quote for marketing
    'video',           -- Video testimonial
    'case_study',      -- Full case study
    'screenshot',      -- Profit/success screenshots
    'homeowner_praise' -- Homeowner feedback
  )),
  
  content text NOT NULL,
  content_url text, -- For video/screenshot URLs
  approved_for_public boolean DEFAULT false,
  use_in_launch boolean DEFAULT false,
  
  -- Metrics for case studies
  before_chaos_score numeric(5,2), -- 1-10 rating
  after_chaos_score numeric(5,2), -- 1-10 rating
  jobs_scheduled_count int,
  profit_change_percent numeric(10,2),
  ai_insights_success_stories text,
  automation_savings_hours numeric(10,2),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_silent_forge_testimonials_beta ON public.silent_forge_testimonials(beta_id);
CREATE INDEX IF NOT EXISTS idx_silent_forge_testimonials_approved ON public.silent_forge_testimonials(approved_for_public, use_in_launch);

-- Silent Forge Qualification Application
-- Tracks applications from roofing companies wanting to join
CREATE TABLE IF NOT EXISTS public.silent_forge_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Company Information
  company_name text NOT NULL,
  contact_person text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  service_area text,
  
  -- Qualification Answers
  annual_revenue text,
  has_crew boolean,
  crew_count int,
  has_office_person boolean,
  owner_is_organized boolean,
  uses_email_daily boolean,
  uses_phone_daily boolean,
  hungry_for_improvement boolean,
  agreed_to_rules boolean,
  
  -- Application Status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Submitted, awaiting review
    'reviewing',    -- Under review
    'qualified',   -- Meets criteria
    'rejected',     -- Does not meet criteria
    'invited',      -- Invited to join
    'accepted',     -- Accepted invitation
    'declined'      -- Declined invitation
  )),
  
  review_notes text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_silent_forge_applications_status ON public.silent_forge_applications(status);
CREATE INDEX IF NOT EXISTS idx_silent_forge_applications_email ON public.silent_forge_applications(contact_email);
CREATE INDEX IF NOT EXISTS idx_silent_forge_applications_created ON public.silent_forge_applications(created_at DESC);

-- Function to calculate locked price based on tier and discount
CREATE OR REPLACE FUNCTION public.calculate_silent_forge_price(
  p_tier text,
  p_discount_percent numeric DEFAULT 50.00
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  base_price numeric;
BEGIN
  IF p_tier = 'growth' THEN
    base_price := 199.00;
  ELSIF p_tier = 'domination' THEN
    base_price := 399.00;
  ELSE
    RETURN NULL;
  END IF;
  
  RETURN base_price * (1 - (p_discount_percent / 100));
END;
$$;

-- Function to check if beta group is full (5-10 limit)
CREATE OR REPLACE FUNCTION public.is_silent_forge_full()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  active_count int;
BEGIN
  SELECT COUNT(*) INTO active_count
  FROM public.silent_forge_beta
  WHERE status IN ('onboarding', 'active');
  
  RETURN active_count >= 10;
END;
$$;

-- Function to auto-update locked price when tier changes
CREATE OR REPLACE FUNCTION public.update_silent_forge_locked_price()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tier IS NOT NULL AND (NEW.tier != COALESCE(OLD.tier, '') OR NEW.lifetime_discount_percent != COALESCE(OLD.lifetime_discount_percent, 50.00)) THEN
    NEW.locked_price_monthly := public.calculate_silent_forge_price(NEW.tier, NEW.lifetime_discount_percent);
  END IF;
  
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_silent_forge_update_price
  BEFORE INSERT OR UPDATE ON public.silent_forge_beta
  FOR EACH ROW
  EXECUTE FUNCTION public.update_silent_forge_locked_price();

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_silent_forge_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_silent_forge_beta_updated_at
  BEFORE UPDATE ON public.silent_forge_beta
  FOR EACH ROW
  EXECUTE FUNCTION public.update_silent_forge_updated_at();

CREATE TRIGGER trg_silent_forge_metrics_updated_at
  BEFORE UPDATE ON public.silent_forge_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_silent_forge_updated_at();

CREATE TRIGGER trg_silent_forge_feedback_updated_at
  BEFORE UPDATE ON public.silent_forge_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.update_silent_forge_updated_at();

CREATE TRIGGER trg_silent_forge_testimonials_updated_at
  BEFORE UPDATE ON public.silent_forge_testimonials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_silent_forge_updated_at();

CREATE TRIGGER trg_silent_forge_applications_updated_at
  BEFORE UPDATE ON public.silent_forge_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.update_silent_forge_updated_at();

-- RLS Policies
ALTER TABLE public.silent_forge_beta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silent_forge_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silent_forge_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silent_forge_testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.silent_forge_applications ENABLE ROW LEVEL SECURITY;

-- Policy: Beta testers can view their own data
CREATE POLICY "Silent Forge beta can view own data"
  ON public.silent_forge_beta
  FOR SELECT
  USING (
    account_id IN (
      SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()
    )
  );

-- Policy: Beta testers can view their own metrics
CREATE POLICY "Silent Forge beta can view own metrics"
  ON public.silent_forge_metrics
  FOR SELECT
  USING (
    account_id IN (
      SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()
    )
  );

-- Policy: Beta testers can submit feedback
CREATE POLICY "Silent Forge beta can submit feedback"
  ON public.silent_forge_feedback
  FOR INSERT
  WITH CHECK (
    beta_id IN (
      SELECT id FROM public.silent_forge_beta
      WHERE account_id IN (
        SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()
      )
    )
  );

-- Policy: Beta testers can view their own feedback
CREATE POLICY "Silent Forge beta can view own feedback"
  ON public.silent_forge_feedback
  FOR SELECT
  USING (
    account_id IN (
      SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()
    )
  );

-- Policy: Anyone can submit applications (public)
CREATE POLICY "Anyone can submit Silent Forge application"
  ON public.silent_forge_applications
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Policy: Service role can manage all Silent Forge data
CREATE POLICY "Service role can manage Silent Forge"
  ON public.silent_forge_beta
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage Silent Forge metrics"
  ON public.silent_forge_metrics
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage Silent Forge feedback"
  ON public.silent_forge_feedback
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage Silent Forge testimonials"
  ON public.silent_forge_testimonials
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage Silent Forge applications"
  ON public.silent_forge_applications
  FOR ALL
  USING (auth.role() = 'service_role');

-- Comments
COMMENT ON TABLE public.silent_forge_beta IS 'Elite 5-10 roofing companies in Silent Forge Beta Group (Block 23200)';
COMMENT ON TABLE public.silent_forge_metrics IS 'Daily metrics tracking across 7 testing buckets for Silent Forge';
COMMENT ON TABLE public.silent_forge_feedback IS 'Weekly feedback collection from Silent Forge beta testers';
COMMENT ON TABLE public.silent_forge_testimonials IS 'Testimonials and case studies collected during Silent Forge beta';
COMMENT ON TABLE public.silent_forge_applications IS 'Applications from roofing companies wanting to join Silent Forge';







































