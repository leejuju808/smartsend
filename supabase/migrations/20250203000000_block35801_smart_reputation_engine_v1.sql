-- =========================================================
-- Block 35801 — SmartSend Roofing "Smart Reputation Engine + Review Booster v1"
-- (Auto-collect 5-star reviews • Prevent bad reviews • Route happy customers to Google/Yelp/Facebook • Turn reviews into referrals + new leads automatically)
-- =========================================================
-- 
-- THE REPUTATION SYSTEM THAT PRINTS MONEY FOR ROOFERS.
-- 
-- Roofers live and die by reviews. But the REALITY:
-- ❌ Contractors forget to ask
-- ❌ Happy customers don't leave reviews
-- ❌ Only angry customers leave reviews
-- ❌ No centralized system
-- ❌ No automation
-- ❌ No tracking who left one
-- ❌ No NPS (satisfaction) scoring
-- ❌ No referral prompts
-- ❌ No way to prevent bad reviews
-- ❌ No way to convert 5-star customers into referrals
--
-- SmartSend becomes the full review, satisfaction, and referral engine.
-- This turns finished jobs into: 5-star reviews, stronger local reputation, automatic referral leads, more booked jobs.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE review_requests TABLE
-- ============================================================================
-- Tracks all review requests sent to customers

CREATE TABLE IF NOT EXISTS public.review_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Review request tracking
  rating int CHECK (rating >= 1 AND rating <= 5),
  review_platform text, -- 'google', 'yelp', 'facebook', 'bbb', 'other'
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'sent',
    'opened',
    'clicked',
    'completed',
    'declined',
    'negative_feedback'
  )),
  
  -- SMS/Email tracking
  sms_sent_at timestamptz,
  email_sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  completed_at timestamptz,
  
  -- Review link tracking
  review_link_clicked boolean DEFAULT false,
  review_url text, -- Link to actual review on platform
  
  -- Timestamps
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Unique constraint: one active review request per job
  UNIQUE(job_id)
);

CREATE INDEX IF NOT EXISTS idx_review_requests_lead ON public.review_requests(lead_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_job ON public.review_requests(job_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_workspace ON public.review_requests(workspace_id);
CREATE INDEX IF NOT EXISTS idx_review_requests_status ON public.review_requests(status);
CREATE INDEX IF NOT EXISTS idx_review_requests_rating ON public.review_requests(rating) WHERE rating IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_review_requests_sent_at ON public.review_requests(sent_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.set_review_requests_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_review_requests_updated_at ON public.review_requests;
CREATE TRIGGER trg_review_requests_updated_at
BEFORE UPDATE ON public.review_requests
FOR EACH ROW
EXECUTE FUNCTION public.set_review_requests_updated_at();

-- ============================================================================
-- PART 2 — CREATE satisfaction_feedback TABLE
-- ============================================================================
-- Tracks all satisfaction feedback (NPS-style scoring)

CREATE TABLE IF NOT EXISTS public.satisfaction_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Rating and feedback
  rating int NOT NULL CHECK (rating >= 1 AND rating <= 5),
  category text NOT NULL CHECK (category IN ('positive', 'negative')),
  comments text,
  
  -- Escalation tracking
  escalated boolean DEFAULT false,
  escalated_at timestamptz,
  escalated_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Issue tracking (for negative feedback)
  issue_created boolean DEFAULT false,
  issue_task_id uuid, -- References inbox_tasks or similar
  
  -- Resolution tracking
  resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolution_notes text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_satisfaction_feedback_lead ON public.satisfaction_feedback(lead_id);
CREATE INDEX IF NOT EXISTS idx_satisfaction_feedback_job ON public.satisfaction_feedback(job_id);
CREATE INDEX IF NOT EXISTS idx_satisfaction_feedback_workspace ON public.satisfaction_feedback(workspace_id);
CREATE INDEX IF NOT EXISTS idx_satisfaction_feedback_category ON public.satisfaction_feedback(category);
CREATE INDEX IF NOT EXISTS idx_satisfaction_feedback_rating ON public.satisfaction_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_satisfaction_feedback_escalated ON public.satisfaction_feedback(escalated) WHERE escalated = true;
CREATE INDEX IF NOT EXISTS idx_satisfaction_feedback_resolved ON public.satisfaction_feedback(resolved) WHERE resolved = false;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.set_satisfaction_feedback_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_satisfaction_feedback_updated_at ON public.satisfaction_feedback;
CREATE TRIGGER trg_satisfaction_feedback_updated_at
BEFORE UPDATE ON public.satisfaction_feedback
FOR EACH ROW
EXECUTE FUNCTION public.set_satisfaction_feedback_updated_at();

-- ============================================================================
-- PART 3 — CREATE referral_leads TABLE
-- ============================================================================
-- Tracks referral leads generated from 5-star reviews

CREATE TABLE IF NOT EXISTS public.referral_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Source information
  source_lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  source_job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  source_review_id uuid REFERENCES public.review_requests(id) ON DELETE SET NULL,
  
  -- Referred contact information
  referred_name text NOT NULL,
  referred_phone text,
  referred_email text,
  referred_address text,
  
  -- Referral status
  status text NOT NULL DEFAULT 'new' CHECK (status IN (
    'new',
    'contacted',
    'qualified',
    'estimate_scheduled',
    'proposal_sent',
    'won',
    'lost',
    'duplicate'
  )),
  
  -- Conversion tracking
  converted_to_job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  job_value numeric(12,2),
  
  -- Reward tracking
  reward_sent boolean DEFAULT false,
  reward_type text, -- 'gift_card', 'discount', 'cash', 'other'
  reward_amount numeric(12,2),
  reward_sent_at timestamptz,
  
  -- Notes and metadata
  notes text,
  referral_source text DEFAULT 'review', -- 'review', 'direct', 'other'
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_leads_workspace ON public.referral_leads(workspace_id);
CREATE INDEX IF NOT EXISTS idx_referral_leads_source_lead ON public.referral_leads(source_lead_id);
CREATE INDEX IF NOT EXISTS idx_referral_leads_source_job ON public.referral_leads(source_job_id);
CREATE INDEX IF NOT EXISTS idx_referral_leads_status ON public.referral_leads(status);
CREATE INDEX IF NOT EXISTS idx_referral_leads_phone ON public.referral_leads(referred_phone) WHERE referred_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_referral_leads_email ON public.referral_leads(referred_email) WHERE referred_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_referral_leads_created_at ON public.referral_leads(created_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.set_referral_leads_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referral_leads_updated_at ON public.referral_leads;
CREATE TRIGGER trg_referral_leads_updated_at
BEFORE UPDATE ON public.referral_leads
FOR EACH ROW
EXECUTE FUNCTION public.set_referral_leads_updated_at();

-- ============================================================================
-- PART 4 — CREATE review_followups TABLE
-- ============================================================================
-- Tracks follow-up sequences for review completion

CREATE TABLE IF NOT EXISTS public.review_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_request_id uuid NOT NULL REFERENCES public.review_requests(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Follow-up tracking
  followup_sequence int NOT NULL DEFAULT 1, -- 1, 2, 3 (Day 1, Day 3, Day 7)
  message_type text NOT NULL CHECK (message_type IN ('sms', 'email')),
  message_text text NOT NULL,
  
  -- Send tracking
  scheduled_send_at timestamptz NOT NULL,
  sent_at timestamptz,
  sent boolean DEFAULT false,
  
  -- Response tracking
  clicked boolean DEFAULT false,
  clicked_at timestamptz,
  
  -- Timestamps
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_followups_review_request ON public.review_followups(review_request_id);
CREATE INDEX IF NOT EXISTS idx_review_followups_workspace ON public.review_followups(workspace_id);
CREATE INDEX IF NOT EXISTS idx_review_followups_scheduled_send_at ON public.review_followups(scheduled_send_at) WHERE sent = false;

-- ============================================================================
-- PART 5 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.satisfaction_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_followups ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Workspace-scoped access
DO $$
BEGIN
  -- review_requests policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'review_requests'
      AND policyname = 'Review requests are scoped to workspace'
  ) THEN
    CREATE POLICY "Review requests are scoped to workspace"
    ON public.review_requests
    FOR ALL
    USING (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    );
  END IF;

  -- satisfaction_feedback policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'satisfaction_feedback'
      AND policyname = 'Satisfaction feedback is scoped to workspace'
  ) THEN
    CREATE POLICY "Satisfaction feedback is scoped to workspace"
    ON public.satisfaction_feedback
    FOR ALL
    USING (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    );
  END IF;

  -- referral_leads policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'referral_leads'
      AND policyname = 'Referral leads are scoped to workspace'
  ) THEN
    CREATE POLICY "Referral leads are scoped to workspace"
    ON public.referral_leads
    FOR ALL
    USING (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    );
  END IF;

  -- review_followups policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'review_followups'
      AND policyname = 'Review followups are scoped to workspace'
  ) THEN
    CREATE POLICY "Review followups are scoped to workspace"
    ON public.review_followups
    FOR ALL
    USING (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    );
  END IF;
END;
$$;

-- ============================================================================
-- PART 6 — CREATE FUNCTION: send_review_request_automation
-- ============================================================================
-- Auto-sends review request when job is completed

CREATE OR REPLACE FUNCTION public.send_review_request_automation(p_job_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job record;
  v_lead record;
  v_review_request_id uuid;
  v_review_link text;
BEGIN
  -- Get job and lead info
  SELECT rj.*, l.id as lead_id, l.email, l.first_name, l.last_name, l.phone, l.name
  INTO v_job
  FROM public.roofing_jobs rj
  LEFT JOIN public.leads l ON l.id = rj.lead_id
  WHERE rj.id = p_job_id;
  
  IF NOT FOUND OR v_job.lead_id IS NULL THEN
    RAISE EXCEPTION 'Job or lead not found';
  END IF;
  
  -- Check if review request already exists
  SELECT id INTO v_review_request_id
  FROM public.review_requests
  WHERE job_id = p_job_id;
  
  IF v_review_request_id IS NOT NULL THEN
    RETURN v_review_request_id;
  END IF;
  
  -- Create review request record
  INSERT INTO public.review_requests (
    lead_id,
    job_id,
    workspace_id,
    status
  )
  VALUES (
    v_job.lead_id,
    p_job_id,
    v_job.workspace_id,
    'pending'
  )
  RETURNING id INTO v_review_request_id;
  
  -- Generate review link with tracking
  v_review_link := format(
    'https://app.smartsend.ai/review/%s/%s',
    v_review_request_id,
    encode(gen_random_bytes(16), 'hex')
  );
  
  -- Update review request with link
  UPDATE public.review_requests
  SET review_url = v_review_link
  WHERE id = v_review_request_id;
  
  -- Update completion tracking
  UPDATE public.job_completion_tracking
  SET 
    review_requested_at = now(),
    completion_status = CASE 
      WHEN completion_status IN ('invoice_pending', 'payment_pending') THEN completion_status
      ELSE 'review_pending'
    END,
    updated_at = now()
  WHERE job_id = p_job_id;
  
  -- Queue SMS/Email sending (will be handled by API/webhook)
  -- This function just creates the record - actual sending happens via API
  
  RETURN v_review_request_id;
END;
$$;

COMMENT ON FUNCTION public.send_review_request_automation IS 'Block 35801: Auto-creates review request when job completes';

-- ============================================================================
-- PART 7 — CREATE FUNCTION: handle_review_rating_response
-- ============================================================================
-- Handles star rating response (1-5) and routes to appropriate path

CREATE OR REPLACE FUNCTION public.handle_review_rating_response(
  p_review_request_id uuid,
  p_rating int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review_request record;
  v_lead record;
  v_job record;
  v_feedback_id uuid;
  v_task_id uuid;
  v_result jsonb;
BEGIN
  -- Validate rating
  IF p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;
  
  -- Get review request
  SELECT rr.*, l.id as lead_id, l.email, l.first_name, l.last_name, l.phone, l.name,
         rj.id as job_id, rj.workspace_id
  INTO v_review_request
  FROM public.review_requests rr
  LEFT JOIN public.leads l ON l.id = rr.lead_id
  LEFT JOIN public.roofing_jobs rj ON rj.id = rr.job_id
  WHERE rr.id = p_review_request_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review request not found';
  END IF;
  
  -- Update review request with rating
  UPDATE public.review_requests
  SET 
    rating = p_rating,
    status = CASE 
      WHEN p_rating >= 4 THEN 'clicked'
      ELSE 'negative_feedback'
    END,
    updated_at = now()
  WHERE id = p_review_request_id;
  
  -- Create satisfaction feedback record
  INSERT INTO public.satisfaction_feedback (
    lead_id,
    job_id,
    workspace_id,
    rating,
    category
  )
  VALUES (
    v_review_request.lead_id,
    v_review_request.job_id,
    v_review_request.workspace_id,
    p_rating,
    CASE WHEN p_rating >= 4 THEN 'positive' ELSE 'negative' END
  )
  RETURNING id INTO v_feedback_id;
  
  -- HIGH RATING PATH (4-5 stars) → Send review platform links
  IF p_rating >= 4 THEN
    -- Update completion tracking
    UPDATE public.job_completion_tracking
    SET review_rating = p_rating
    WHERE job_id = v_review_request.job_id;
    
    -- Prepare result for API to send review platform links
    v_result := jsonb_build_object(
      'status', 'positive',
      'rating', p_rating,
      'action', 'send_review_links',
      'review_request_id', p_review_request_id,
      'lead_id', v_review_request.lead_id,
      'job_id', v_review_request.job_id
    );
  ELSE
    -- LOW RATING PATH (1-3 stars) → Damage control
    -- Create high-priority task (if inbox_tasks table exists)
    BEGIN
      -- Check if inbox_tasks table exists
      IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'inbox_tasks'
      ) THEN
        INSERT INTO public.inbox_tasks (
          lead_id,
          workspace_id,
          description,
          priority,
          due_at,
          status
        )
        VALUES (
          v_review_request.lead_id,
          v_review_request.workspace_id,
          format('Follow up on negative review feedback (Rating: %s/5) - Job ID: %s', p_rating, v_review_request.job_id),
          'high',
          now() + interval '1 hour',
          'pending'
        )
        RETURNING id INTO v_task_id;
      ELSE
        v_task_id := NULL;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Table might not exist or have different schema, continue without task creation
      v_task_id := NULL;
    END;
    
    -- Mark feedback as escalated
    UPDATE public.satisfaction_feedback
    SET 
      escalated = true,
      escalated_at = now(),
      issue_created = (v_task_id IS NOT NULL),
      issue_task_id = v_task_id
    WHERE id = v_feedback_id;
    
    -- Prepare result for API to send damage control message
    v_result := jsonb_build_object(
      'status', 'negative',
      'rating', p_rating,
      'action', 'send_damage_control',
      'review_request_id', p_review_request_id,
      'lead_id', v_review_request.lead_id,
      'job_id', v_review_request.job_id,
      'task_id', v_task_id,
      'feedback_id', v_feedback_id
    );
  END IF;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.handle_review_rating_response IS 'Block 35801: Handles star rating response and routes to review links or damage control';

-- ============================================================================
-- PART 8 — CREATE FUNCTION: create_referral_lead_from_review
-- ============================================================================
-- Creates referral lead after 5-star review completion

CREATE OR REPLACE FUNCTION public.create_referral_lead_from_review(
  p_review_request_id uuid,
  p_referred_name text,
  p_referred_phone text DEFAULT NULL,
  p_referred_email text DEFAULT NULL,
  p_referred_address text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review_request record;
  v_referral_lead_id uuid;
BEGIN
  -- Get review request (must be 5-star and completed)
  SELECT rr.*, rj.workspace_id
  INTO v_review_request
  FROM public.review_requests rr
  LEFT JOIN public.roofing_jobs rj ON rj.id = rr.job_id
  WHERE rr.id = p_review_request_id
    AND rr.rating = 5
    AND rr.status = 'completed';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Review request not found or not eligible for referral';
  END IF;
  
  -- Create referral lead
  INSERT INTO public.referral_leads (
    workspace_id,
    source_lead_id,
    source_job_id,
    source_review_id,
    referred_name,
    referred_phone,
    referred_email,
    referred_address,
    notes,
    referral_source
  )
  VALUES (
    v_review_request.workspace_id,
    v_review_request.lead_id,
    v_review_request.job_id,
    p_review_request_id,
    p_referred_name,
    p_referred_phone,
    p_referred_email,
    p_referred_address,
    p_notes,
    'review'
  )
  RETURNING id INTO v_referral_lead_id;
  
  -- Update completion tracking
  UPDATE public.job_completion_tracking
  SET 
    referral_count = COALESCE(referral_count, 0) + 1,
    referral_received = true,
    updated_at = now()
  WHERE job_id = v_review_request.job_id;
  
  RETURN v_referral_lead_id;
END;
$$;

COMMENT ON FUNCTION public.create_referral_lead_from_review IS 'Block 35801: Creates referral lead from 5-star review';

-- ============================================================================
-- PART 9 — CREATE FUNCTION: schedule_review_followups
-- ============================================================================
-- Schedules follow-up messages for review completion

CREATE OR REPLACE FUNCTION public.schedule_review_followups(p_review_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review_request record;
  v_workspace_id uuid;
BEGIN
  -- Get review request
  SELECT rr.*, rj.workspace_id
  INTO v_review_request
  FROM public.review_requests rr
  LEFT JOIN public.roofing_jobs rj ON rj.id = rr.job_id
  WHERE rr.id = p_review_request_id
    AND rr.status IN ('sent', 'opened', 'clicked');
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  v_workspace_id := v_review_request.workspace_id;
  
  -- Schedule follow-ups (only if rating is 4-5 stars)
  IF v_review_request.rating >= 4 THEN
    -- Day 1 follow-up
    INSERT INTO public.review_followups (
      review_request_id,
      workspace_id,
      followup_sequence,
      message_type,
      message_text,
      scheduled_send_at
    )
    VALUES (
      p_review_request_id,
      v_workspace_id,
      1,
      'sms',
      'Thanks again for your feedback! Here''s the review link in case you missed it: ' || COALESCE(v_review_request.review_url, ''),
      now() + interval '1 day'
    );
    
    -- Day 3 follow-up
    INSERT INTO public.review_followups (
      review_request_id,
      workspace_id,
      followup_sequence,
      message_type,
      message_text,
      scheduled_send_at
    )
    VALUES (
      p_review_request_id,
      v_workspace_id,
      2,
      'sms',
      'Reviews help local homeowners feel confident. We''d really appreciate your support! ' || COALESCE(v_review_request.review_url, ''),
      now() + interval '3 days'
    );
    
    -- Day 7 follow-up (final)
    INSERT INTO public.review_followups (
      review_request_id,
      workspace_id,
      followup_sequence,
      message_type,
      message_text,
      scheduled_send_at
    )
    VALUES (
      p_review_request_id,
      v_workspace_id,
      3,
      'sms',
      'Last reminder: Your review would mean a lot to us! ' || COALESCE(v_review_request.review_url, ''),
      now() + interval '7 days'
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.schedule_review_followups IS 'Block 35801: Schedules follow-up messages for review completion';

-- ============================================================================
-- PART 10 — UPDATE EXISTING TRIGGER to call review automation
-- ============================================================================
-- Extend existing job completion trigger to auto-send review request

-- Note: The trigger already exists in block25180_job_completion_engine_v1.sql
-- We'll add a call to send_review_request_automation in a separate function
-- that can be called after the completion tracking is created

CREATE OR REPLACE FUNCTION public.trigger_review_request_on_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger when job status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Wait 24 hours before sending review request (job just completed)
    -- This will be handled by a scheduled job/API call
    -- For now, we'll create the review request record immediately
    -- The actual SMS/Email sending can be delayed via API
    
    PERFORM public.send_review_request_automation(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Add this trigger if it doesn't conflict with existing one
-- We'll use a database function call instead to avoid trigger conflicts
DROP TRIGGER IF EXISTS trg_review_request_on_completion ON public.roofing_jobs;
CREATE TRIGGER trg_review_request_on_completion
  AFTER UPDATE ON public.roofing_jobs
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed')
  EXECUTE FUNCTION public.trigger_review_request_on_completion();

COMMENT ON FUNCTION public.trigger_review_request_on_completion IS 'Block 35801: Triggers review request automation when job completes';

-- ============================================================================
-- PART 11 — CREATE HELPER FUNCTION: get_review_dashboard_metrics
-- ============================================================================
-- Returns dashboard metrics for review system

CREATE OR REPLACE FUNCTION public.get_review_dashboard_metrics(
  p_workspace_id uuid,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_metrics jsonb;
  v_start_date timestamptz;
  v_end_date timestamptz;
BEGIN
  -- Set defaults
  v_start_date := COALESCE(p_start_date, now() - interval '30 days');
  v_end_date := COALESCE(p_end_date, now());
  
  SELECT jsonb_build_object(
    'reviews_collected_this_week', (
      SELECT COUNT(*)::int
      FROM public.review_requests
      WHERE workspace_id = p_workspace_id
        AND status = 'completed'
        AND completed_at >= date_trunc('week', now())
    ),
    'avg_rating', (
      SELECT ROUND(AVG(rating)::numeric, 2)
      FROM public.review_requests
      WHERE workspace_id = p_workspace_id
        AND rating IS NOT NULL
        AND sent_at >= v_start_date
        AND sent_at <= v_end_date
    ),
    'review_conversion_rate', (
      SELECT 
        CASE 
          WHEN COUNT(*) FILTER (WHERE status IN ('sent', 'opened', 'clicked', 'completed')) > 0 
          THEN ROUND(
            (COUNT(*) FILTER (WHERE status = 'completed')::numeric / 
             COUNT(*) FILTER (WHERE status IN ('sent', 'opened', 'clicked', 'completed'))::numeric) * 100,
            2
          )
          ELSE 0
        END
      FROM public.review_requests
      WHERE workspace_id = p_workspace_id
        AND sent_at >= v_start_date
        AND sent_at <= v_end_date
    ),
    'negative_feedback_percentage', (
      SELECT 
        CASE 
          WHEN COUNT(*) > 0 
          THEN ROUND(
            (COUNT(*) FILTER (WHERE rating < 4)::numeric / COUNT(*)::numeric) * 100,
            2
          )
          ELSE 0
        END
      FROM public.satisfaction_feedback
      WHERE workspace_id = p_workspace_id
        AND created_at >= v_start_date
        AND created_at <= v_end_date
    ),
    'jobs_without_review_prompt', (
      SELECT COUNT(*)::int
      FROM public.roofing_jobs rj
      LEFT JOIN public.review_requests rr ON rr.job_id = rj.id
      WHERE rj.workspace_id = p_workspace_id
        AND rj.status = 'completed'
        AND rr.id IS NULL
        AND rj.updated_at >= v_start_date
    ),
    'referral_leads_generated', (
      SELECT COUNT(*)::int
      FROM public.referral_leads
      WHERE workspace_id = p_workspace_id
        AND created_at >= v_start_date
        AND created_at <= v_end_date
    ),
    'referral_revenue', (
      SELECT COALESCE(SUM(job_value), 0)::numeric
      FROM public.referral_leads
      WHERE workspace_id = p_workspace_id
        AND status = 'won'
        AND converted_to_job_id IS NOT NULL
        AND created_at >= v_start_date
        AND created_at <= v_end_date
    ),
    'platform_distribution', (
      SELECT jsonb_object_agg(
        COALESCE(review_platform, 'unknown'),
        count
      )
      FROM (
        SELECT review_platform, COUNT(*)::int as count
        FROM public.review_requests
        WHERE workspace_id = p_workspace_id
          AND review_platform IS NOT NULL
          AND completed_at >= v_start_date
          AND completed_at <= v_end_date
        GROUP BY review_platform
      ) platform_counts
    )
  ) INTO v_metrics;
  
  RETURN v_metrics;
END;
$$;

COMMENT ON FUNCTION public.get_review_dashboard_metrics IS 'Block 35801: Returns review dashboard metrics for a workspace';

-- ============================================================================
-- END OF BLOCK 35801
-- ============================================================================
































