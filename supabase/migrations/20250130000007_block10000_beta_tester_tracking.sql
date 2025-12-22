-- =========================================================
-- Block 10000 — Silent Beta Playbook
-- Beta Tester Tracking & Performance Monitoring
-- =========================================================

-- Beta tester registry (tracks the 3-5 roofing companies)
CREATE TABLE IF NOT EXISTS public.beta_testers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  contact_person text NOT NULL,
  contact_phone text,
  contact_email text NOT NULL,
  service_area text,
  employee_count_range text CHECK (employee_count_range IN ('3-5', '6-10', '11-20', '20+')),
  beta_status text NOT NULL DEFAULT 'invited' CHECK (beta_status IN ('invited', 'onboarding', 'active', 'paused', 'cancelled', 'completed')),
  founders_beta_price_locked numeric(10,2) DEFAULT 99.00, -- $99/mo locked forever
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  first_campaign_launched_at timestamptz,
  first_hot_lead_at timestamptz,
  first_estimate_booked_at timestamptz,
  converted_to_paid_at timestamptz,
  onboarding_completed_at timestamptz,
  feedback_notes text,
  satisfaction_rating int CHECK (satisfaction_rating >= 1 AND satisfaction_rating <= 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beta_testers_account ON public.beta_testers(account_id);
CREATE INDEX IF NOT EXISTS idx_beta_testers_status ON public.beta_testers(beta_status);
CREATE INDEX IF NOT EXISTS idx_beta_testers_email ON public.beta_testers(contact_email);

-- Beta performance metrics (aggregated per tester)
CREATE TABLE IF NOT EXISTS public.beta_performance_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beta_tester_id uuid NOT NULL REFERENCES public.beta_testers(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  metric_date date NOT NULL DEFAULT CURRENT_DATE,
  
  -- Campaign metrics
  emails_sent int DEFAULT 0,
  replies_received int DEFAULT 0,
  hot_leads int DEFAULT 0,
  
  -- Business metrics
  booked_estimates int DEFAULT 0,
  jobs_closed int DEFAULT 0,
  revenue_influenced numeric(12,2) DEFAULT 0,
  
  -- System metrics
  bugs_found int DEFAULT 0,
  feature_requests int DEFAULT 0,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(beta_tester_id, metric_date, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_beta_metrics_tester ON public.beta_performance_metrics(beta_tester_id);
CREATE INDEX IF NOT EXISTS idx_beta_metrics_account ON public.beta_performance_metrics(account_id);
CREATE INDEX IF NOT EXISTS idx_beta_metrics_date ON public.beta_performance_metrics(metric_date);

-- Beta bugs & feedback log
CREATE TABLE IF NOT EXISTS public.beta_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beta_tester_id uuid NOT NULL REFERENCES public.beta_testers(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  feedback_type text NOT NULL CHECK (feedback_type IN ('bug', 'feature_request', 'testimonial', 'general')),
  title text NOT NULL,
  description text,
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'fixed', 'closed', 'wont_fix')),
  fixed_at timestamptz,
  fixed_in_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_beta_feedback_tester ON public.beta_feedback(beta_tester_id);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_status ON public.beta_feedback(status);
CREATE INDEX IF NOT EXISTS idx_beta_feedback_type ON public.beta_feedback(feedback_type);

-- Beta success metrics summary view
CREATE OR REPLACE VIEW public.beta_success_metrics AS
SELECT 
  bt.id as beta_tester_id,
  bt.company_name,
  bt.beta_status,
  bt.onboarding_completed_at IS NOT NULL as onboarding_completed,
  bt.first_campaign_launched_at IS NOT NULL as campaign_launched,
  bt.first_hot_lead_at IS NOT NULL as got_hot_leads,
  bt.first_estimate_booked_at IS NOT NULL as booked_estimates,
  bt.converted_to_paid_at IS NOT NULL as converted_to_paid,
  bt.satisfaction_rating,
  
  -- Aggregated metrics
  COALESCE(SUM(bpm.emails_sent), 0) as total_emails_sent,
  COALESCE(SUM(bpm.replies_received), 0) as total_replies,
  COALESCE(SUM(bpm.hot_leads), 0) as total_hot_leads,
  COALESCE(SUM(bpm.booked_estimates), 0) as total_booked_estimates,
  COALESCE(SUM(bpm.jobs_closed), 0) as total_jobs_closed,
  COALESCE(SUM(bpm.revenue_influenced), 0) as total_revenue_influenced,
  COALESCE(SUM(bpm.bugs_found), 0) as total_bugs_found,
  COALESCE(SUM(bpm.feature_requests), 0) as total_feature_requests
  
FROM public.beta_testers bt
LEFT JOIN public.beta_performance_metrics bpm ON bpm.beta_tester_id = bt.id
GROUP BY bt.id, bt.company_name, bt.beta_status, bt.onboarding_completed_at, 
         bt.first_campaign_launched_at, bt.first_hot_lead_at, bt.first_estimate_booked_at,
         bt.converted_to_paid_at, bt.satisfaction_rating;

-- Function to update beta tester status milestones
CREATE OR REPLACE FUNCTION public.update_beta_tester_milestone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update first_campaign_launched_at when campaign is created/started
  IF NEW.status = 'active' AND OLD.status != 'active' THEN
    UPDATE public.beta_testers
    SET first_campaign_launched_at = COALESCE(first_campaign_launched_at, now()),
        updated_at = now()
    WHERE account_id = NEW.account_id
      AND first_campaign_launched_at IS NULL;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger for campaign status changes (if campaigns table exists)
-- Note: This assumes campaigns table has account_id and status columns
-- Adjust based on your actual schema

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_beta_tester_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_beta_testers_updated_at
  BEFORE UPDATE ON public.beta_testers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_beta_tester_updated_at();

CREATE TRIGGER trg_beta_performance_metrics_updated_at
  BEFORE UPDATE ON public.beta_performance_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_beta_tester_updated_at();

CREATE TRIGGER trg_beta_feedback_updated_at
  BEFORE UPDATE ON public.beta_feedback
  FOR EACH ROW
  EXECUTE FUNCTION public.update_beta_tester_updated_at();

-- RLS Policies
ALTER TABLE public.beta_testers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_feedback ENABLE ROW LEVEL SECURITY;

-- Policy: Beta testers can view their own data
CREATE POLICY "Beta testers can view own data"
  ON public.beta_testers
  FOR SELECT
  USING (
    account_id IN (
      SELECT id FROM public.accounts WHERE owner_user_id = auth.uid()
    )
  );

-- Policy: Service role can manage all beta data (for admin/internal use)
CREATE POLICY "Service role can manage beta data"
  ON public.beta_testers
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage beta metrics"
  ON public.beta_performance_metrics
  FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can manage beta feedback"
  ON public.beta_feedback
  FOR ALL
  USING (auth.role() = 'service_role');

-- Comments
COMMENT ON TABLE public.beta_testers IS 'Registry of 3-5 beta testing roofing companies for Silent Beta Playbook';
COMMENT ON COLUMN public.beta_testers.founders_beta_price_locked IS 'Locked-in price for Founders Beta ($99/mo forever)';
COMMENT ON COLUMN public.beta_testers.beta_status IS 'Current status: invited, onboarding, active, paused, cancelled, completed';
COMMENT ON TABLE public.beta_performance_metrics IS 'Daily aggregated performance metrics per beta tester';
COMMENT ON TABLE public.beta_feedback IS 'Bugs, feature requests, and testimonials from beta testers';
COMMENT ON VIEW public.beta_success_metrics IS 'Summary view of beta success metrics for monitoring beta program health';
























































