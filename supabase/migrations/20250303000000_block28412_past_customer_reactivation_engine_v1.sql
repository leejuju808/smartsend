-- =========================================================
-- Block 28412 — SmartSend Roofing "Past Customer Reactivation Engine" v1
-- (Wake up dead files • Auto-detect old customers • Send offers • Generate repeat revenue for roofers)
-- =========================================================
-- 
-- Roofers lose millions collectively because they never re-engage their old customers.
-- SmartSend fixes that by:
-- - Waking up every past job
-- - Auto-sending seasonal offers
-- - Detecting roofs at "replacement age"
-- - Turning ignored homeowners into fresh booked estimates
-- - Creating repeat & referral revenue with zero ad spend
--
-- ============================================================================
-- PART 1 — CREATE past_customers TABLE
-- ============================================================================
-- Stores past customer data when a job is completed

CREATE TABLE IF NOT EXISTS public.past_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  
  -- Job completion info
  job_completed_at date NOT NULL,
  
  -- Roof details
  roof_type text, -- 'asphalt', 'metal', 'flat', 'tile', etc.
  home_age int, -- Age of home at time of job
  warranty_years int, -- Warranty period in years
  
  -- Additional info
  notes text, -- Notes from installer
  job_value numeric(12,2), -- Original job value
  
  -- Contact info (denormalized for quick access)
  homeowner_name text,
  email text,
  phone text,
  address text,
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure one record per job
  UNIQUE(job_id)
);

CREATE INDEX IF NOT EXISTS idx_past_customers_workspace ON public.past_customers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_past_customers_lead ON public.past_customers(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_past_customers_job ON public.past_customers(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_past_customers_completed_at ON public.past_customers(job_completed_at);
CREATE INDEX IF NOT EXISTS idx_past_customers_workspace_completed ON public.past_customers(workspace_id, job_completed_at);

COMMENT ON TABLE public.past_customers IS 'Block 28412: Past customers from completed roofing jobs for reactivation campaigns';
COMMENT ON COLUMN public.past_customers.job_completed_at IS 'Block 28412: Date when the roofing job was completed';
COMMENT ON COLUMN public.past_customers.roof_type IS 'Block 28412: Type of roof installed (asphalt, metal, flat, tile, etc.)';
COMMENT ON COLUMN public.past_customers.warranty_years IS 'Block 28412: Warranty period in years for the installed roof';

-- ============================================================================
-- PART 2 — CREATE reactivation_events TABLE
-- ============================================================================
-- Tracks scheduled and sent reactivation messages

CREATE TABLE IF NOT EXISTS public.reactivation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  past_customer_id uuid NOT NULL REFERENCES public.past_customers(id) ON DELETE CASCADE,
  
  -- Event type
  type text NOT NULL CHECK (type IN ('3m', '1y', '3y', '5y', '7y', '10y', 'seasonal')),
  
  -- Status tracking
  status text DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'replied', 'booked', 'cancelled')),
  
  -- Scheduling
  scheduled_at timestamptz NOT NULL,
  sent_at timestamptz,
  
  -- Response tracking
  replied_at timestamptz,
  booked_at timestamptz,
  booked_estimate_id uuid, -- Link to new estimate/job if booked
  
  -- Message details
  message_text text,
  message_sent_via text, -- 'sms', 'email', 'both'
  
  -- Revenue tracking
  estimated_revenue numeric(12,2), -- Estimated revenue if this converts
  
  -- Metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Prevent duplicate events for same customer and type
  UNIQUE(past_customer_id, type, scheduled_at::date)
);

CREATE INDEX IF NOT EXISTS idx_reactivation_events_workspace ON public.reactivation_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_reactivation_events_past_customer ON public.reactivation_events(past_customer_id);
CREATE INDEX IF NOT EXISTS idx_reactivation_events_type ON public.reactivation_events(type);
CREATE INDEX IF NOT EXISTS idx_reactivation_events_status ON public.reactivation_events(status);
CREATE INDEX IF NOT EXISTS idx_reactivation_events_scheduled ON public.reactivation_events(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_reactivation_events_workspace_scheduled ON public.reactivation_events(workspace_id, scheduled_at) WHERE status = 'scheduled';

COMMENT ON TABLE public.reactivation_events IS 'Block 28412: Scheduled and sent reactivation messages to past customers';
COMMENT ON COLUMN public.reactivation_events.type IS 'Block 28412: Reactivation window type (3m, 1y, 3y, 5y, 7y, 10y, seasonal)';
COMMENT ON COLUMN public.reactivation_events.status IS 'Block 28412: Event status (scheduled, sent, replied, booked, cancelled)';

-- ============================================================================
-- PART 3 — TRIGGER FUNCTION: Create past customer record when job completed
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_past_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead_id uuid;
  v_workspace_id uuid;
  v_lead_data record;
  v_job_value numeric(12,2);
  v_roof_type text;
  v_warranty_years int;
  v_homeowner_name text;
  v_email text;
  v_phone text;
  v_address text;
BEGIN
  -- Only trigger when status changes to 'completed'
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' THEN
    -- Get workspace_id from job (try multiple sources)
    SELECT 
      COALESCE(
        (SELECT workspace_id FROM public.roofing_jobs WHERE id = NEW.id),
        (SELECT workspace_id FROM public.job_completion_tracking WHERE job_id = NEW.id),
        (SELECT workspace_id FROM public.leads WHERE id = NEW.lead_id)
      ) INTO v_workspace_id;
    
    -- Get lead_id
    v_lead_id := NEW.lead_id;
    
    -- Get lead contact info if available
    IF v_lead_id IS NOT NULL THEN
      SELECT 
        first_name || ' ' || last_name as name,
        email,
        phone,
        address
      INTO v_lead_data
      FROM public.leads
      WHERE id = v_lead_id;
      
      IF FOUND THEN
        v_homeowner_name := v_lead_data.name;
        v_email := v_lead_data.email;
        v_phone := v_lead_data.phone;
        v_address := v_lead_data.address;
      END IF;
    END IF;
    
    -- Get job value
    SELECT job_value INTO v_job_value
    FROM public.roofing_jobs
    WHERE id = NEW.id;
    
    -- Get roof type and warranty from job or completion tracking
    SELECT 
      job_type,
      COALESCE(
        (SELECT warranty_years FROM public.roofing_warranties WHERE job_id = NEW.id ORDER BY created_at DESC LIMIT 1),
        30 -- Default warranty
      )
    INTO v_roof_type, v_warranty_years
    FROM public.roofing_jobs
    WHERE id = NEW.id;
    
    -- Only create if we have workspace_id
    IF v_workspace_id IS NOT NULL THEN
      -- Insert past customer record (ON CONFLICT to prevent duplicates)
      INSERT INTO public.past_customers (
        workspace_id,
        lead_id,
        job_id,
        job_completed_at,
        roof_type,
        warranty_years,
        job_value,
        homeowner_name,
        email,
        phone,
        address
      )
      VALUES (
        v_workspace_id,
        v_lead_id,
        NEW.id,
        COALESCE(
          (SELECT install_completed_at::date FROM public.job_completion_tracking WHERE job_id = NEW.id),
          CURRENT_DATE
        ),
        v_roof_type,
        v_warranty_years,
        v_job_value,
        v_homeowner_name,
        v_email,
        v_phone,
        v_address
      )
      ON CONFLICT (job_id) DO NOTHING;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on roofing_jobs
DROP TRIGGER IF EXISTS past_customer_trigger ON public.roofing_jobs;
CREATE TRIGGER past_customer_trigger
  AFTER UPDATE OF status ON public.roofing_jobs
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed')
  EXECUTE FUNCTION public.log_past_customer();

COMMENT ON FUNCTION public.log_past_customer IS 'Block 28412: Automatically creates past_customer record when job is marked completed';
COMMENT ON TRIGGER past_customer_trigger ON public.roofing_jobs IS 'Block 28412: Triggers past customer creation on job completion';

-- ============================================================================
-- PART 4 — FUNCTION: Generate reactivation events for past customers
-- ============================================================================
-- This function is called by the edge function to schedule reactivation events

CREATE OR REPLACE FUNCTION public.generate_reactivation_events(p_workspace_id uuid DEFAULT NULL)
RETURNS TABLE (
  events_created int,
  customers_processed int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now date;
  v_customer record;
  v_diff_years numeric;
  v_event_type text;
  v_scheduled_at timestamptz;
  v_events_created int := 0;
  v_customers_processed int := 0;
BEGIN
  v_now := CURRENT_DATE;
  
  -- Loop through past customers
  FOR v_customer IN
    SELECT 
      pc.*,
      EXTRACT(EPOCH FROM (v_now - pc.job_completed_at)) / (365.25 * 24 * 60 * 60) as years_since_completion
    FROM public.past_customers pc
    WHERE (p_workspace_id IS NULL OR pc.workspace_id = p_workspace_id)
      AND pc.job_completed_at IS NOT NULL
  LOOP
    v_customers_processed := v_customers_processed + 1;
    v_diff_years := v_customer.years_since_completion;
    
    -- Determine event type based on time since completion
    v_event_type := NULL;
    v_scheduled_at := NULL;
    
    -- 3-month follow-up (0.25 years)
    IF v_diff_years >= 0.25 AND v_diff_years < 0.3 THEN
      v_event_type := '3m';
      v_scheduled_at := (v_customer.job_completed_at + INTERVAL '3 months')::timestamptz;
    -- 1-year check-in
    ELSIF v_diff_years >= 1.0 AND v_diff_years < 1.1 THEN
      v_event_type := '1y';
      v_scheduled_at := (v_customer.job_completed_at + INTERVAL '1 year')::timestamptz;
    -- 3-year offer
    ELSIF v_diff_years >= 3.0 AND v_diff_years < 3.1 THEN
      v_event_type := '3y';
      v_scheduled_at := (v_customer.job_completed_at + INTERVAL '3 years')::timestamptz;
    -- 5-year offer
    ELSIF v_diff_years >= 5.0 AND v_diff_years < 5.1 THEN
      v_event_type := '5y';
      v_scheduled_at := (v_customer.job_completed_at + INTERVAL '5 years')::timestamptz;
    -- 7-year alert
    ELSIF v_diff_years >= 7.0 AND v_diff_years < 7.1 THEN
      v_event_type := '7y';
      v_scheduled_at := (v_customer.job_completed_at + INTERVAL '7 years')::timestamptz;
    -- 10-year alert
    ELSIF v_diff_years >= 10.0 THEN
      v_event_type := '10y';
      v_scheduled_at := (v_customer.job_completed_at + INTERVAL '10 years')::timestamptz;
    END IF;
    
    -- Create event if type determined
    IF v_event_type IS NOT NULL THEN
      INSERT INTO public.reactivation_events (
        workspace_id,
        past_customer_id,
        type,
        status,
        scheduled_at
      )
      VALUES (
        v_customer.workspace_id,
        v_customer.id,
        v_event_type,
        'scheduled',
        COALESCE(v_scheduled_at, now())
      )
      ON CONFLICT (past_customer_id, type, scheduled_at::date) DO NOTHING;
      
      IF FOUND THEN
        v_events_created := v_events_created + 1;
      END IF;
    END IF;
  END LOOP;
  
  RETURN QUERY SELECT v_events_created, v_customers_processed;
END;
$$;

COMMENT ON FUNCTION public.generate_reactivation_events IS 'Block 28412: Generates reactivation events for past customers based on time windows';

-- ============================================================================
-- PART 5 — FUNCTION: Get reactivation stats for dashboard
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_reactivation_stats(p_workspace_id uuid)
RETURNS TABLE (
  past_customers_count bigint,
  events_scheduled bigint,
  events_sent bigint,
  events_replied bigint,
  events_booked bigint,
  estimated_revenue numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*) FROM public.past_customers WHERE workspace_id = p_workspace_id) as past_customers_count,
    (SELECT COUNT(*) FROM public.reactivation_events WHERE workspace_id = p_workspace_id AND status = 'scheduled') as events_scheduled,
    (SELECT COUNT(*) FROM public.reactivation_events WHERE workspace_id = p_workspace_id AND status = 'sent') as events_sent,
    (SELECT COUNT(*) FROM public.reactivation_events WHERE workspace_id = p_workspace_id AND status = 'replied') as events_replied,
    (SELECT COUNT(*) FROM public.reactivation_events WHERE workspace_id = p_workspace_id AND status = 'booked') as events_booked,
    (SELECT COALESCE(SUM(estimated_revenue), 0) FROM public.reactivation_events WHERE workspace_id = p_workspace_id AND status = 'booked') as estimated_revenue;
END;
$$;

COMMENT ON FUNCTION public.get_reactivation_stats IS 'Block 28412: Returns reactivation statistics for dashboard';

-- ============================================================================
-- PART 6 — TRIGGERS FOR updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_past_customers_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_past_customers_updated_at ON public.past_customers;
CREATE TRIGGER trg_past_customers_updated_at
  BEFORE UPDATE ON public.past_customers
  FOR EACH ROW
  EXECUTE FUNCTION public.set_past_customers_updated_at();

CREATE OR REPLACE FUNCTION public.set_reactivation_events_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reactivation_events_updated_at ON public.reactivation_events;
CREATE TRIGGER trg_reactivation_events_updated_at
  BEFORE UPDATE ON public.reactivation_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_reactivation_events_updated_at();

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.past_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactivation_events ENABLE ROW LEVEL SECURITY;

-- Past customers policies
CREATE POLICY "Users can view past customers for their workspace"
  ON public.past_customers FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert past customers for their workspace"
  ON public.past_customers FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update past customers for their workspace"
  ON public.past_customers FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

-- Reactivation events policies
CREATE POLICY "Users can view reactivation events for their workspace"
  ON public.reactivation_events FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert reactivation events for their workspace"
  ON public.reactivation_events FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update reactivation events for their workspace"
  ON public.reactivation_events FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces WHERE owner_id = auth.uid()
    )
  );

-- Service role can manage all
CREATE POLICY "Service role can manage past customers"
  ON public.past_customers FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role can manage reactivation events"
  ON public.reactivation_events FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================================
-- PART 8 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.past_customers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.reactivation_events TO authenticated;


































