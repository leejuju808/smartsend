-- =========================================================
-- Block 33155 — SmartSend Roofing "Smart Financing Engine + Homeowner Offer Flow" v1
-- (Auto-offer financing • Increase close rates • Integrate payment plans • Track approvals • Add financing buttons to proposals & invoices)
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE financing_profiles TABLE
-- ============================================================================
-- Stores contractor financing provider settings

CREATE TABLE IF NOT EXISTS public.financing_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contractor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Financing provider settings
  provider text NOT NULL CHECK (provider IN ('wisetack', 'sunlight', 'enhancify', 'credit_for_home_services')),
  api_key text, -- Encrypted API key for provider
  api_secret text, -- Encrypted API secret if needed
  
  -- Financing limits
  min_amount numeric(12,2) DEFAULT 500,
  max_amount numeric(12,2) DEFAULT 50000,
  
  -- Provider-specific settings
  provider_settings jsonb DEFAULT '{}'::jsonb,
  
  -- Active status
  is_active boolean DEFAULT true,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One active profile per workspace/provider combination
  UNIQUE(workspace_id, provider) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS idx_financing_profiles_workspace ON public.financing_profiles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_financing_profiles_contractor ON public.financing_profiles(contractor_id);
CREATE INDEX IF NOT EXISTS idx_financing_profiles_provider ON public.financing_profiles(provider);
CREATE INDEX IF NOT EXISTS idx_financing_profiles_active ON public.financing_profiles(workspace_id, is_active) WHERE is_active = true;

-- ============================================================================
-- PART 2 — CREATE financing_applications TABLE
-- ============================================================================
-- Tracks financing applications from homeowners

CREATE TABLE IF NOT EXISTS public.financing_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Financing provider info
  financing_provider text NOT NULL CHECK (financing_provider IN ('wisetack', 'sunlight', 'enhancify', 'credit_for_home_services')),
  financing_profile_id uuid REFERENCES public.financing_profiles(id) ON DELETE SET NULL,
  
  -- Application details
  amount_requested numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'started' CHECK (status IN (
    'started',
    'submitted',
    'approved',
    'preapproved',
    'declined',
    'needs_docs',
    'expired',
    'cancelled'
  )),
  
  -- Payment estimates
  monthly_payment_estimate numeric(12,2),
  term_months integer, -- 6, 12, 24, 36, etc.
  apr numeric(5,4), -- Annual percentage rate
  
  -- Provider response data
  decision jsonb DEFAULT '{}'::jsonb, -- Full provider response
  provider_application_id text, -- External provider's application ID
  
  -- Homeowner application data (stored securely)
  application_data jsonb DEFAULT '{}'::jsonb, -- Name, address, SSN last 4, income range, etc.
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  declined_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_financing_applications_lead ON public.financing_applications(lead_id);
CREATE INDEX IF NOT EXISTS idx_financing_applications_job ON public.financing_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_financing_applications_proposal ON public.financing_applications(proposal_id);
CREATE INDEX IF NOT EXISTS idx_financing_applications_workspace ON public.financing_applications(workspace_id);
CREATE INDEX IF NOT EXISTS idx_financing_applications_status ON public.financing_applications(status);
CREATE INDEX IF NOT EXISTS idx_financing_applications_provider ON public.financing_applications(financing_provider);
CREATE INDEX IF NOT EXISTS idx_financing_applications_created ON public.financing_applications(created_at DESC);

-- ============================================================================
-- PART 3 — CREATE financing_click_events TABLE
-- ============================================================================
-- Tracks when homeowners click financing buttons/links

CREATE TABLE IF NOT EXISTS public.financing_click_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Event details
  event_type text NOT NULL CHECK (event_type IN (
    'clicked_financing_button',
    'viewed_calculator',
    'started_application',
    'abandoned_application'
  )),
  
  -- Context
  source text, -- 'proposal', 'invoice', 'contract', 'email', 'follow_up'
  amount numeric(12,2), -- Amount shown when clicked
  
  -- Tracking
  ip_address inet,
  user_agent text,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financing_clicks_lead ON public.financing_click_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_financing_clicks_job ON public.financing_click_events(job_id);
CREATE INDEX IF NOT EXISTS idx_financing_clicks_proposal ON public.financing_click_events(proposal_id);
CREATE INDEX IF NOT EXISTS idx_financing_clicks_workspace ON public.financing_click_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_financing_clicks_type ON public.financing_click_events(event_type);
CREATE INDEX IF NOT EXISTS idx_financing_clicks_created ON public.financing_click_events(created_at DESC);

-- ============================================================================
-- PART 4 — TRIGGERS
-- ============================================================================

-- Update updated_at on financing_profiles
CREATE OR REPLACE FUNCTION public.tg_update_financing_profile_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_update_financing_profile_updated_at
BEFORE UPDATE ON public.financing_profiles
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_financing_profile_updated_at();

-- Update updated_at on financing_applications
CREATE OR REPLACE FUNCTION public.tg_update_financing_application_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_update_financing_application_updated_at
BEFORE UPDATE ON public.financing_applications
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_financing_application_updated_at();

-- Auto-update job stage when financing is approved
CREATE OR REPLACE FUNCTION public.auto_progress_job_on_financing_approval()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- If financing approved and job exists, move job to 'approved' stage
  IF NEW.status IN ('approved', 'preapproved') 
     AND OLD.status NOT IN ('approved', 'preapproved')
     AND NEW.job_id IS NOT NULL THEN
    UPDATE public.jobs
    SET stage = 'approved',
        updated_at = now()
    WHERE id = NEW.job_id
      AND stage = 'estimate'; -- Only auto-progress if still in estimate stage
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_auto_progress_job_on_financing_approval
AFTER UPDATE ON public.financing_applications
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.auto_progress_job_on_financing_approval();

-- ============================================================================
-- PART 5 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.financing_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financing_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financing_click_events ENABLE ROW LEVEL SECURITY;

-- Financing profiles: Workspace members can access
CREATE POLICY "financing_profiles_workspace_members"
  ON public.financing_profiles FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Financing applications: Workspace members can access
CREATE POLICY "financing_applications_workspace_members"
  ON public.financing_applications FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Financing click events: Workspace members can access
CREATE POLICY "financing_click_events_workspace_members"
  ON public.financing_click_events FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 6 — HELPER FUNCTIONS
-- ============================================================================

-- Get financing status for a lead
CREATE OR REPLACE FUNCTION public.get_lead_financing_status(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'has_application', EXISTS(
      SELECT 1 FROM public.financing_applications 
      WHERE lead_id = p_lead_id
    ),
    'latest_application', (
      SELECT jsonb_build_object(
        'id', id,
        'status', status,
        'amount_requested', amount_requested,
        'monthly_payment_estimate', monthly_payment_estimate,
        'term_months', term_months,
        'approved_at', approved_at,
        'created_at', created_at
      )
      FROM public.financing_applications
      WHERE lead_id = p_lead_id
      ORDER BY created_at DESC
      LIMIT 1
    ),
    'click_count', (
      SELECT COUNT(*) 
      FROM public.financing_click_events 
      WHERE lead_id = p_lead_id
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Get financing status for a job
CREATE OR REPLACE FUNCTION public.get_job_financing_status(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'has_application', EXISTS(
      SELECT 1 FROM public.financing_applications 
      WHERE job_id = p_job_id
    ),
    'latest_application', (
      SELECT jsonb_build_object(
        'id', id,
        'status', status,
        'amount_requested', amount_requested,
        'monthly_payment_estimate', monthly_payment_estimate,
        'term_months', term_months,
        'approved_at', approved_at
      )
      FROM public.financing_applications
      WHERE job_id = p_job_id
      ORDER BY created_at DESC
      LIMIT 1
    ),
    'is_financed', EXISTS(
      SELECT 1 FROM public.financing_applications 
      WHERE job_id = p_job_id 
      AND status IN ('approved', 'preapproved')
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- Get financing dashboard stats for a workspace
CREATE OR REPLACE FUNCTION public.get_financing_dashboard_stats(p_workspace_id uuid, p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_start_date timestamptz;
BEGIN
  v_start_date := now() - (p_days || ' days')::interval;
  
  SELECT jsonb_build_object(
    'applications_started', (
      SELECT COUNT(*) 
      FROM public.financing_applications
      WHERE workspace_id = p_workspace_id
      AND created_at >= v_start_date
    ),
    'applications_approved', (
      SELECT COUNT(*) 
      FROM public.financing_applications
      WHERE workspace_id = p_workspace_id
      AND status IN ('approved', 'preapproved')
      AND created_at >= v_start_date
    ),
    'applications_declined', (
      SELECT COUNT(*) 
      FROM public.financing_applications
      WHERE workspace_id = p_workspace_id
      AND status = 'declined'
      AND created_at >= v_start_date
    ),
    'avg_approval_amount', (
      SELECT COALESCE(AVG(amount_requested), 0)
      FROM public.financing_applications
      WHERE workspace_id = p_workspace_id
      AND status IN ('approved', 'preapproved')
      AND created_at >= v_start_date
    ),
    'jobs_won_from_financing', (
      SELECT COUNT(DISTINCT job_id)
      FROM public.financing_applications
      WHERE workspace_id = p_workspace_id
      AND status IN ('approved', 'preapproved')
      AND job_id IS NOT NULL
      AND created_at >= v_start_date
    ),
    'total_financing_clicked', (
      SELECT COUNT(*) 
      FROM public.financing_click_events
      WHERE workspace_id = p_workspace_id
      AND created_at >= v_start_date
    ),
    'conversion_rate', (
      SELECT 
        CASE 
          WHEN COUNT(*) = 0 THEN 0
          ELSE ROUND(100.0 * COUNT(*) FILTER (
            WHERE status IN ('approved', 'preapproved')
          ) / COUNT(*), 2)
        END
      FROM public.financing_applications
      WHERE workspace_id = p_workspace_id
      AND created_at >= v_start_date
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;

-- ============================================================================
-- PART 7 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.financing_profiles IS 'Contractor financing provider settings (Block 33155)';
COMMENT ON TABLE public.financing_applications IS 'Homeowner financing applications (Block 33155)';
COMMENT ON TABLE public.financing_click_events IS 'Financing button click tracking (Block 33155)';
COMMENT ON FUNCTION public.get_lead_financing_status IS 'Get financing status for a lead (Block 33155)';
COMMENT ON FUNCTION public.get_job_financing_status IS 'Get financing status for a job (Block 33155)';
COMMENT ON FUNCTION public.get_financing_dashboard_stats IS 'Get financing dashboard statistics for a workspace (Block 33155)';

































