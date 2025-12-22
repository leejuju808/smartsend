-- =========================================================
-- Block 25180 — SmartSend Roofing Job Completion Engine v1
-- (Final Invoices • Cleanup Confirmation • Photo Uploads • Warranty Automation • Review & Referral Engine)
-- =========================================================
-- 
-- THE MONEY-COLLECTION + FINISH-STRONG SYSTEM — ZERO FLUFF.
-- 
-- Roofers LOSE more money at the end of the job than anywhere else because:
-- ❌ They forget final invoices
-- ❌ Homeowners delay payment
-- ❌ Crews forget cleanup photos
-- ❌ Warranties don't get sent
-- ❌ No review request
-- ❌ No referral request
-- ❌ No closing message
-- ❌ No "showcase photos" for marketing
-- ❌ No completion checklist
--
-- SmartSend's Job Completion Engine v1 SOLVES ALL OF THIS.
--
-- This is where roofers get PAID, protect reputation, and turn homeowners into referral machines.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE job_completion_tracking TABLE
-- ============================================================================
-- Central tracking table for all completion-related activities

CREATE TABLE IF NOT EXISTS public.job_completion_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Completion milestones
  install_completed_at timestamptz,
  install_completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  cleanup_completed_at timestamptz,
  cleanup_confirmed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  homeowner_cleanup_confirmed_at timestamptz,
  
  photos_uploaded_at timestamptz,
  photos_required_count integer DEFAULT 0,
  photos_uploaded_count integer DEFAULT 0,
  
  final_invoice_sent_at timestamptz,
  final_invoice_id uuid REFERENCES public.job_invoices(id) ON DELETE SET NULL,
  final_invoice_paid_at timestamptz,
  
  warranty_delivered_at timestamptz,
  warranty_document_url text,
  
  review_requested_at timestamptz,
  review_received_at timestamptz,
  review_rating integer CHECK (review_rating >= 1 AND review_rating <= 5),
  review_platform text, -- 'google', 'facebook', 'bbb', 'private'
  
  referral_requested_at timestamptz,
  referral_received boolean DEFAULT false,
  referral_count integer DEFAULT 0,
  
  -- Overall completion status
  completion_status text NOT NULL CHECK (completion_status IN (
    'not_started',
    'install_complete',
    'cleanup_pending',
    'photos_pending',
    'invoice_pending',
    'invoice_sent',
    'payment_pending',
    'warranty_pending',
    'review_pending',
    'referral_pending',
    'fully_complete'
  )) DEFAULT 'not_started',
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_completion_tracking_job ON public.job_completion_tracking(job_id);
CREATE INDEX IF NOT EXISTS idx_job_completion_tracking_workspace ON public.job_completion_tracking(workspace_id);
CREATE INDEX IF NOT EXISTS idx_job_completion_tracking_status ON public.job_completion_tracking(completion_status);
CREATE INDEX IF NOT EXISTS idx_job_completion_tracking_invoice_pending ON public.job_completion_tracking(workspace_id, completion_status) WHERE completion_status IN ('invoice_pending', 'invoice_sent', 'payment_pending');

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.set_job_completion_tracking_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_job_completion_tracking_updated_at ON public.job_completion_tracking;
CREATE TRIGGER trg_job_completion_tracking_updated_at
BEFORE UPDATE ON public.job_completion_tracking
FOR EACH ROW
EXECUTE FUNCTION public.set_job_completion_tracking_updated_at();

-- ============================================================================
-- PART 2 — CREATE cleanup_confirmation_checklist TABLE
-- ============================================================================
-- Crew checklist for cleanup completion

CREATE TABLE IF NOT EXISTS public.cleanup_confirmation_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Cleanup checklist items
  nails_swept boolean DEFAULT false,
  magnet_rolled boolean DEFAULT false,
  driveway_clean boolean DEFAULT false,
  yard_clean boolean DEFAULT false,
  gutters_cleared boolean DEFAULT false,
  photos_uploaded boolean DEFAULT false,
  
  -- Photo requirements
  completion_photos_uploaded boolean DEFAULT false,
  cleanup_photos_uploaded boolean DEFAULT false,
  drone_photos_uploaded boolean DEFAULT false,
  
  -- Homeowner confirmation
  homeowner_confirmed boolean DEFAULT false,
  homeowner_confirmed_at timestamptz,
  homeowner_notes text,
  
  -- Status
  status text NOT NULL CHECK (status IN (
    'pending',
    'in_progress',
    'crew_complete',
    'homeowner_confirmed',
    'issues_reported'
  )) DEFAULT 'pending',
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Unique constraint: one checklist per job
  UNIQUE(job_id)
);

CREATE INDEX IF NOT EXISTS idx_cleanup_confirmation_job ON public.cleanup_confirmation_checklist(job_id);
CREATE INDEX IF NOT EXISTS idx_cleanup_confirmation_status ON public.cleanup_confirmation_checklist(status) WHERE status != 'homeowner_confirmed';

-- ============================================================================
-- PART 3 — CREATE job_completion_photos TABLE
-- ============================================================================
-- Tracks required vs uploaded photos for completion

CREATE TABLE IF NOT EXISTS public.job_completion_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Photo category
  photo_category text NOT NULL CHECK (photo_category IN (
    'before_damage',
    'before_shingles',
    'before_decking',
    'before_flashing',
    'during_tearoff',
    'during_decking_exposed',
    'during_dryin',
    'after_finished_roof',
    'after_ridge',
    'after_flashing',
    'after_vents',
    'cleanup_driveway',
    'cleanup_yard',
    'cleanup_final',
    'drone_overview',
    'drone_closeup'
  )),
  
  -- Photo reference
  field_photo_id uuid REFERENCES public.job_field_photos(id) ON DELETE SET NULL,
  photo_url text,
  storage_path text,
  
  -- Status
  is_required boolean DEFAULT true,
  is_uploaded boolean DEFAULT false,
  uploaded_at timestamptz,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Timestamps
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_completion_photos_job ON public.job_completion_photos(job_id);
CREATE INDEX IF NOT EXISTS idx_job_completion_photos_category ON public.job_completion_photos(photo_category);
CREATE INDEX IF NOT EXISTS idx_job_completion_photos_required ON public.job_completion_photos(job_id, is_required) WHERE is_required = true AND is_uploaded = false;

-- ============================================================================
-- PART 4 — CREATE warranty_packages TABLE
-- ============================================================================
-- Warranty package generation and delivery tracking

CREATE TABLE IF NOT EXISTS public.warranty_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Warranty details
  roof_system_info text,
  shingle_brand text,
  shingle_color text,
  install_date date,
  crew_details text,
  
  -- Documents
  warranty_pdf_url text,
  manufacturer_warranty_url text,
  company_warranty_url text,
  
  -- Photo set
  photo_set_url text, -- Link to photo gallery
  
  -- Delivery status
  status text NOT NULL CHECK (status IN (
    'pending',
    'generating',
    'ready',
    'delivered',
    'failed'
  )) DEFAULT 'pending',
  
  delivered_at timestamptz,
  delivered_to_email text,
  delivery_method text CHECK (delivery_method IN ('email', 'portal', 'manual')),
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warranty_packages_job ON public.warranty_packages(job_id);
CREATE INDEX IF NOT EXISTS idx_warranty_packages_status ON public.warranty_packages(status) WHERE status IN ('pending', 'generating');

-- ============================================================================
-- PART 5 — CREATE review_tracking TABLE
-- ============================================================================
-- Review request and tracking system

CREATE TABLE IF NOT EXISTS public.review_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  
  -- Review request
  review_requested_at timestamptz,
  review_request_sent boolean DEFAULT false,
  review_request_email_id uuid,
  
  -- Private rating (before public review)
  private_rating integer CHECK (private_rating >= 1 AND private_rating <= 5),
  private_feedback_text text,
  private_feedback_received_at timestamptz,
  
  -- Public review
  public_review_submitted boolean DEFAULT false,
  review_platform text CHECK (review_platform IN ('google', 'facebook', 'bbb', 'other')),
  review_url text,
  review_rating integer CHECK (review_rating >= 1 AND review_rating <= 5),
  review_text text,
  review_submitted_at timestamptz,
  
  -- Status
  status text NOT NULL CHECK (status IN (
    'not_requested',
    'requested',
    'private_rating_received',
    'private_rating_low', -- < 4 stars, don't ask for public review
    'public_review_received',
    'skipped'
  )) DEFAULT 'not_requested',
  
  -- Owner alert for low ratings
  owner_alerted boolean DEFAULT false,
  owner_alerted_at timestamptz,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_tracking_job ON public.review_tracking(job_id);
CREATE INDEX IF NOT EXISTS idx_review_tracking_status ON public.review_tracking(status) WHERE status IN ('requested', 'private_rating_received');
CREATE INDEX IF NOT EXISTS idx_review_tracking_low_rating ON public.review_tracking(owner_alerted) WHERE owner_alerted = false AND status = 'private_rating_low';

-- ============================================================================
-- PART 6 — CREATE referral_tracking TABLE
-- ============================================================================
-- Referral request and tracking system

CREATE TABLE IF NOT EXISTS public.referral_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  
  -- Referral request
  referral_requested_at timestamptz,
  referral_request_sent boolean DEFAULT false,
  referral_request_email_id uuid,
  
  -- Referral reward
  reward_type text CHECK (reward_type IN ('gift_card', 'gutter_cleaning', 'roof_tuneup', 'none')),
  reward_amount numeric(10,2),
  reward_description text,
  
  -- Referrals received
  referral_count integer DEFAULT 0,
  referral_contacts jsonb DEFAULT '[]'::jsonb, -- Array of referred contact info
  
  -- Status
  status text NOT NULL CHECK (status IN (
    'not_requested',
    'requested',
    'referral_received',
    'skipped'
  )) DEFAULT 'not_requested',
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_tracking_job ON public.referral_tracking(job_id);
CREATE INDEX IF NOT EXISTS idx_referral_tracking_status ON public.referral_tracking(status) WHERE status = 'requested';

-- ============================================================================
-- PART 7 — CREATE completion_timeline_events TABLE
-- ============================================================================
-- Auto-built timeline of completion events

CREATE TABLE IF NOT EXISTS public.completion_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Event details
  event_type text NOT NULL CHECK (event_type IN (
    'install_started',
    'crew_checkin',
    'materials_arrived',
    'weather_clear',
    'install_complete',
    'cleanup_complete',
    'photos_uploaded',
    'final_invoice_sent',
    'final_invoice_paid',
    'warranty_delivered',
    'review_requested',
    'review_received',
    'referral_asked',
    'referral_received'
  )),
  
  event_message text,
  event_metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  occurred_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_completion_timeline_job ON public.completion_timeline_events(job_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_completion_timeline_workspace ON public.completion_timeline_events(workspace_id, occurred_at DESC);

-- ============================================================================
-- PART 8 — CREATE FUNCTION: trigger_completion_workflow_on_install
-- ============================================================================
-- Triggers completion workflow when job is marked as "installed" or "completed"

CREATE OR REPLACE FUNCTION public.trigger_completion_workflow_on_install()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_completion_id uuid;
  v_contact_id uuid;
  v_homeowner_email text;
  v_homeowner_name text;
  v_job_value numeric;
  v_final_invoice_amount numeric;
  v_org_id uuid;
BEGIN
  -- Only trigger when status changes to 'completed' or 'in_progress' -> 'completed'
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  -- Only process when job is marked as completed
  IF NEW.status != 'completed' THEN
    RETURN NEW;
  END IF;
  
  -- Get homeowner contact info
  SELECT l.id, l.email, l.first_name || ' ' || l.last_name
  INTO v_contact_id, v_homeowner_email, v_homeowner_name
  FROM public.leads l
  WHERE l.id = NEW.lead_id
  LIMIT 1;
  
  -- Get job value
  SELECT job_value INTO v_job_value
  FROM public.roofing_jobs
  WHERE id = NEW.id;
  
  -- Get org_id from workspace (try to find from existing invoices)
  SELECT org_id INTO v_org_id
  FROM public.job_invoices ji
  JOIN public.roofing_jobs rj ON rj.id = ji.job_id
  WHERE rj.workspace_id = NEW.workspace_id
  LIMIT 1;
  
  -- Create or update completion tracking
  INSERT INTO public.job_completion_tracking (
    job_id,
    workspace_id,
    install_completed_at,
    completion_status
  )
  VALUES (
    NEW.id,
    NEW.workspace_id,
    now(),
    'install_complete'
  )
  ON CONFLICT (job_id) DO UPDATE SET
    install_completed_at = now(),
    completion_status = 'install_complete',
    updated_at = now()
  RETURNING id INTO v_completion_id;
  
  -- Create cleanup confirmation checklist (if not exists)
  INSERT INTO public.cleanup_confirmation_checklist (
    job_id,
    workspace_id,
    status
  )
  VALUES (
    NEW.id,
    NEW.workspace_id,
    'pending'
  )
  ON CONFLICT (job_id) DO UPDATE SET
    status = 'pending',
    updated_at = now();
  
  -- Log timeline event
  INSERT INTO public.completion_timeline_events (
    job_id,
    workspace_id,
    event_type,
    event_message
  )
  VALUES (
    NEW.id,
    NEW.workspace_id,
    'install_complete',
    'Installation completed - cleanup and final steps initiated'
  );
  
  -- Auto-create final invoice if payment is pending
  IF v_org_id IS NOT NULL THEN
    -- Calculate final invoice amount (job value minus payments received)
    SELECT GREATEST(COALESCE(v_job_value, 0) - COALESCE((
      SELECT SUM(amount) FROM public.job_payments WHERE job_id = NEW.id
    ), 0), 0) INTO v_final_invoice_amount;
    
    -- Only create invoice if there's a balance
    IF v_final_invoice_amount > 0 THEN
      -- Check if final invoice already exists
      IF NOT EXISTS (
        SELECT 1 FROM public.job_invoices
        WHERE job_id = NEW.id
        AND payment_type = 'final_invoice'
      ) THEN
        -- Create final invoice (draft - will be sent via automation)
        INSERT INTO public.job_invoices (
          org_id,
          job_id,
          payment_type,
          type,
          amount,
          status,
          due_date,
          notes
        )
        VALUES (
          v_org_id,
          NEW.id,
          'final_invoice',
          'final',
          v_final_invoice_amount,
          'draft',
          current_date + interval '14 days',
          'Auto-created by Job Completion Engine when install completed'
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_completion_workflow_on_install ON public.roofing_jobs;
CREATE TRIGGER trg_completion_workflow_on_install
  AFTER UPDATE ON public.roofing_jobs
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed')
  EXECUTE FUNCTION public.trigger_completion_workflow_on_install();

COMMENT ON FUNCTION public.trigger_completion_workflow_on_install IS 'Block 25180: Triggers completion workflow when job is marked as installed/completed';

-- ============================================================================
-- PART 9 — CREATE FUNCTION: send_final_invoice_automation
-- ============================================================================
-- Auto-sends final invoice when job is completed

CREATE OR REPLACE FUNCTION public.send_final_invoice_automation(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_invoice record;
  v_job record;
  v_contact record;
  v_template_key text := 'homeowner_install_completion';
  v_subject text;
  v_body text;
BEGIN
  -- Get final invoice
  SELECT * INTO v_invoice
  FROM public.job_invoices
  WHERE job_id = p_job_id
  AND payment_type = 'final_invoice'
  AND status = 'draft'
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Get job and contact info
  SELECT rj.*, l.email as homeowner_email, l.first_name, l.last_name
  INTO v_job
  FROM public.roofing_jobs rj
  LEFT JOIN public.leads l ON l.id = rj.lead_id
  WHERE rj.id = p_job_id;
  
  IF v_job.homeowner_email IS NULL THEN
    RETURN;
  END IF;
  
  -- Update invoice status to 'sent' (actual sending happens via API/edge function)
  UPDATE public.job_invoices
  SET status = 'sent',
      updated_at = now()
  WHERE id = v_invoice.id;
  
  -- Update completion tracking
  UPDATE public.job_completion_tracking
  SET final_invoice_sent_at = now(),
      final_invoice_id = v_invoice.id,
      completion_status = CASE 
        WHEN completion_status = 'install_complete' THEN 'invoice_sent'
        ELSE completion_status
      END,
      updated_at = now()
  WHERE job_id = p_job_id;
  
  -- Log timeline event
  INSERT INTO public.completion_timeline_events (
    job_id,
    workspace_id,
    event_type,
    event_message,
    event_metadata
  )
  VALUES (
    p_job_id,
    v_job.workspace_id,
    'final_invoice_sent',
    'Final invoice sent to homeowner',
    jsonb_build_object('invoice_id', v_invoice.id, 'amount', v_invoice.amount)
  );
  
  -- Schedule payment reminders (Day 1, Day 3, Day 7)
  PERFORM public.schedule_payment_reminder(p_job_id, v_invoice.id, 'final_invoice_reminder', 1);
  PERFORM public.schedule_payment_reminder(p_job_id, v_invoice.id, 'final_invoice_reminder', 3);
  PERFORM public.schedule_payment_reminder(p_job_id, v_invoice.id, 'final_invoice_reminder', 7);
END;
$$;

COMMENT ON FUNCTION public.send_final_invoice_automation IS 'Block 25180: Auto-sends final invoice when job is completed';

-- ============================================================================
-- PART 10 — CREATE FUNCTION: generate_warranty_package
-- ============================================================================
-- Auto-generates warranty package after payment is received

CREATE OR REPLACE FUNCTION public.generate_warranty_package(p_job_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_warranty_id uuid;
  v_job record;
  v_install_date date;
BEGIN
  -- Check if warranty already exists
  SELECT id INTO v_warranty_id
  FROM public.warranty_packages
  WHERE job_id = p_job_id
  LIMIT 1;
  
  IF v_warranty_id IS NOT NULL THEN
    RETURN v_warranty_id;
  END IF;
  
  -- Get job details
  SELECT rj.*, 
         COALESCE(rj.scheduled_start_date::date, CURRENT_DATE) as install_date
  INTO v_job
  FROM public.roofing_jobs rj
  WHERE rj.id = p_job_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found';
  END IF;
  
  -- Create warranty package
  INSERT INTO public.warranty_packages (
    job_id,
    workspace_id,
    install_date,
    status
  )
  VALUES (
    p_job_id,
    v_job.workspace_id,
    v_job.install_date,
    'generating'
  )
  RETURNING id INTO v_warranty_id;
  
  -- Update completion tracking
  UPDATE public.job_completion_tracking
  SET warranty_delivered_at = now(),
      completion_status = CASE 
        WHEN completion_status = 'payment_pending' THEN 'warranty_pending'
        ELSE completion_status
      END,
      updated_at = now()
  WHERE job_id = p_job_id;
  
  -- Log timeline event
  INSERT INTO public.completion_timeline_events (
    job_id,
    workspace_id,
    event_type,
    event_message
  )
  VALUES (
    p_job_id,
    v_job.workspace_id,
    'warranty_delivered',
    'Warranty package generated and ready for delivery'
  );
  
  RETURN v_warranty_id;
END;
$$;

COMMENT ON FUNCTION public.generate_warranty_package IS 'Block 25180: Auto-generates warranty package after payment is received';

-- ============================================================================
-- PART 11 — CREATE FUNCTION: request_review_automation
-- ============================================================================
-- Requests review after completion confirmation

CREATE OR REPLACE FUNCTION public.request_review_automation(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job record;
  v_contact_id uuid;
  v_review_id uuid;
BEGIN
  -- Get job and contact info
  SELECT rj.*, l.id as contact_id
  INTO v_job
  FROM public.roofing_jobs rj
  LEFT JOIN public.leads l ON l.id = rj.lead_id
  WHERE rj.id = p_job_id;
  
  IF NOT FOUND OR v_job.contact_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Check if review already requested
  SELECT id INTO v_review_id
  FROM public.review_tracking
  WHERE job_id = p_job_id
  LIMIT 1;
  
  IF v_review_id IS NULL THEN
    -- Create review tracking
    INSERT INTO public.review_tracking (
      job_id,
      workspace_id,
      contact_id,
      status,
      review_requested_at
    )
    VALUES (
      p_job_id,
      v_job.workspace_id,
      v_job.contact_id,
      'requested',
      now()
    )
    RETURNING id INTO v_review_id;
  ELSE
    -- Update existing tracking
    UPDATE public.review_tracking
    SET review_requested_at = now(),
        status = 'requested',
        updated_at = now()
    WHERE id = v_review_id;
  END IF;
  
  -- Update completion tracking
  UPDATE public.job_completion_tracking
  SET review_requested_at = now(),
      completion_status = CASE 
        WHEN completion_status IN ('warranty_pending', 'payment_pending') THEN 'review_pending'
        ELSE completion_status
      END,
      updated_at = now()
  WHERE job_id = p_job_id;
  
  -- Log timeline event
  INSERT INTO public.completion_timeline_events (
    job_id,
    workspace_id,
    event_type,
    event_message
  )
  VALUES (
    p_job_id,
    v_job.workspace_id,
    'review_requested',
    'Review request sent to homeowner'
  );
END;
$$;

COMMENT ON FUNCTION public.request_review_automation IS 'Block 25180: Requests review after completion confirmation';

-- ============================================================================
-- PART 12 — CREATE FUNCTION: request_referral_automation
-- ============================================================================
-- Requests referral after review is completed or private rating is positive

CREATE OR REPLACE FUNCTION public.request_referral_automation(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job record;
  v_contact_id uuid;
  v_review record;
  v_referral_id uuid;
BEGIN
  -- Get job and contact info
  SELECT rj.*, l.id as contact_id
  INTO v_job
  FROM public.roofing_jobs rj
  LEFT JOIN public.leads l ON l.id = rj.lead_id
  WHERE rj.id = p_job_id;
  
  IF NOT FOUND OR v_job.contact_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Check review status - only request referral if review is positive
  SELECT * INTO v_review
  FROM public.review_tracking
  WHERE job_id = p_job_id
  LIMIT 1;
  
  -- Only request referral if:
  -- 1. Review received with 4+ stars, OR
  -- 2. Private rating received with 4+ stars, OR
  -- 3. Public review submitted
  IF v_review IS NOT NULL AND (
    (v_review.review_rating IS NOT NULL AND v_review.review_rating >= 4) OR
    (v_review.private_rating IS NOT NULL AND v_review.private_rating >= 4) OR
    v_review.public_review_submitted = true
  ) THEN
    -- Check if referral already requested
    SELECT id INTO v_referral_id
    FROM public.referral_tracking
    WHERE job_id = p_job_id
    LIMIT 1;
    
    IF v_referral_id IS NULL THEN
      -- Create referral tracking
      INSERT INTO public.referral_tracking (
        job_id,
        workspace_id,
        contact_id,
        status,
        referral_requested_at
      )
      VALUES (
        p_job_id,
        v_job.workspace_id,
        v_job.contact_id,
        'requested',
        now()
      )
      RETURNING id INTO v_referral_id;
    ELSE
      -- Update existing tracking
      UPDATE public.referral_tracking
      SET referral_requested_at = now(),
          status = 'requested',
          updated_at = now()
      WHERE id = v_referral_id;
    END IF;
    
    -- Update completion tracking
    UPDATE public.job_completion_tracking
    SET referral_requested_at = now(),
        completion_status = CASE 
          WHEN completion_status = 'review_pending' THEN 'referral_pending'
          ELSE completion_status
        END,
        updated_at = now()
    WHERE job_id = p_job_id;
    
    -- Log timeline event
    INSERT INTO public.completion_timeline_events (
      job_id,
      workspace_id,
      event_type,
      event_message
    )
    VALUES (
      p_job_id,
      v_job.workspace_id,
      'referral_asked',
      'Referral request sent to homeowner'
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.request_referral_automation IS 'Block 25180: Requests referral after positive review';

-- ============================================================================
-- PART 13 — CREATE FUNCTION: update_completion_status
-- ============================================================================
-- Updates overall completion status based on milestones

CREATE OR REPLACE FUNCTION public.update_completion_status(p_job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tracking record;
  v_new_status text;
BEGIN
  -- Get current tracking
  SELECT * INTO v_tracking
  FROM public.job_completion_tracking
  WHERE job_id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Determine new status based on milestones
  IF v_tracking.final_invoice_paid_at IS NOT NULL 
     AND v_tracking.warranty_delivered_at IS NOT NULL
     AND v_tracking.review_received_at IS NOT NULL THEN
    v_new_status := 'fully_complete';
  ELSIF v_tracking.referral_requested_at IS NOT NULL THEN
    v_new_status := 'referral_pending';
  ELSIF v_tracking.review_requested_at IS NOT NULL THEN
    v_new_status := 'review_pending';
  ELSIF v_tracking.warranty_delivered_at IS NOT NULL THEN
    v_new_status := 'warranty_pending';
  ELSIF v_tracking.final_invoice_paid_at IS NOT NULL THEN
    v_new_status := 'payment_pending';
  ELSIF v_tracking.final_invoice_sent_at IS NOT NULL THEN
    v_new_status := 'invoice_sent';
  ELSIF v_tracking.final_invoice_id IS NOT NULL THEN
    v_new_status := 'invoice_pending';
  ELSIF v_tracking.photos_uploaded_at IS NOT NULL THEN
    v_new_status := 'photos_pending';
  ELSIF v_tracking.cleanup_completed_at IS NOT NULL THEN
    v_new_status := 'cleanup_pending';
  ELSIF v_tracking.install_completed_at IS NOT NULL THEN
    v_new_status := 'install_complete';
  ELSE
    v_new_status := 'not_started';
  END IF;
  
  -- Update if status changed
  IF v_tracking.completion_status != v_new_status THEN
    UPDATE public.job_completion_tracking
    SET completion_status = v_new_status,
        updated_at = now()
    WHERE job_id = p_job_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_completion_status IS 'Block 25180: Updates overall completion status based on milestones';

-- ============================================================================
-- PART 14 — CREATE FUNCTION: get_completion_dashboard
-- ============================================================================
-- Returns completion dashboard data for owners

CREATE OR REPLACE FUNCTION public.get_completion_dashboard(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result jsonb;
  v_pending_completions jsonb;
  v_completed_today jsonb;
  v_money_collected_today numeric;
BEGIN
  -- Pending completions
  SELECT jsonb_agg(
    jsonb_build_object(
      'job_id', jct.job_id,
      'job_title', rj.title,
      'missing_items', jsonb_build_array(
        CASE WHEN jct.photos_uploaded_count < jct.photos_required_count THEN 'photos' END,
        CASE WHEN jct.cleanup_completed_at IS NULL THEN 'cleanup_confirmation' END,
        CASE WHEN jct.final_invoice_sent_at IS NULL THEN 'final_invoice' END,
        CASE WHEN jct.warranty_delivered_at IS NULL THEN 'warranty_file' END
      ) - 'null',
      'completion_status', jct.completion_status
    )
  ) INTO v_pending_completions
  FROM public.job_completion_tracking jct
  JOIN public.roofing_jobs rj ON rj.id = jct.job_id
  WHERE jct.workspace_id = p_workspace_id
  AND jct.completion_status != 'fully_complete'
  AND rj.status = 'completed';
  
  -- Completed today
  SELECT jsonb_agg(
    jsonb_build_object(
      'job_id', jct.job_id,
      'job_title', rj.title,
      'completed_at', jct.updated_at
    )
  ) INTO v_completed_today
  FROM public.job_completion_tracking jct
  JOIN public.roofing_jobs rj ON rj.id = jct.job_id
  WHERE jct.workspace_id = p_workspace_id
  AND jct.completion_status = 'fully_complete'
  AND DATE(jct.updated_at) = CURRENT_DATE;
  
  -- Money collected today
  SELECT COALESCE(SUM(jp.amount), 0) INTO v_money_collected_today
  FROM public.job_payments jp
  JOIN public.roofing_jobs rj ON rj.id = jp.job_id
  WHERE rj.workspace_id = p_workspace_id
  AND DATE(jp.created_at) = CURRENT_DATE;
  
  -- Build result
  v_result := jsonb_build_object(
    'pending_completions', COALESCE(v_pending_completions, '[]'::jsonb),
    'completed_today', COALESCE(v_completed_today, '[]'::jsonb),
    'money_collected_today', v_money_collected_today
  );
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_completion_dashboard IS 'Block 25180: Returns completion dashboard data for owners';

-- ============================================================================
-- PART 15 — CREATE TRIGGER: auto_send_final_invoice_on_completion
-- ============================================================================
-- Auto-sends final invoice when completion tracking is created

CREATE OR REPLACE FUNCTION public.trigger_auto_send_final_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Auto-send final invoice when install is completed
  IF NEW.install_completed_at IS NOT NULL AND OLD.install_completed_at IS NULL THEN
    PERFORM public.send_final_invoice_automation(NEW.job_id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_send_final_invoice ON public.job_completion_tracking;
CREATE TRIGGER trg_auto_send_final_invoice
  AFTER INSERT OR UPDATE ON public.job_completion_tracking
  FOR EACH ROW
  WHEN (NEW.install_completed_at IS NOT NULL AND (OLD.install_completed_at IS NULL OR OLD.install_completed_at IS DISTINCT FROM NEW.install_completed_at))
  EXECUTE FUNCTION public.trigger_auto_send_final_invoice();

-- ============================================================================
-- PART 16 — CREATE TRIGGER: auto_generate_warranty_on_payment
-- ============================================================================
-- Auto-generates warranty when final invoice is paid

CREATE OR REPLACE FUNCTION public.trigger_auto_generate_warranty()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Auto-generate warranty when payment is received
  IF NEW.final_invoice_paid_at IS NOT NULL AND OLD.final_invoice_paid_at IS NULL THEN
    PERFORM public.generate_warranty_package(NEW.job_id);
    PERFORM public.request_review_automation(NEW.job_id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_generate_warranty ON public.job_completion_tracking;
CREATE TRIGGER trg_auto_generate_warranty
  AFTER UPDATE ON public.job_completion_tracking
  FOR EACH ROW
  WHEN (NEW.final_invoice_paid_at IS NOT NULL AND OLD.final_invoice_paid_at IS NULL)
  EXECUTE FUNCTION public.trigger_auto_generate_warranty();

-- ============================================================================
-- PART 17 — CREATE TRIGGER: auto_request_referral_on_review
-- ============================================================================
-- Auto-requests referral when review is received

CREATE OR REPLACE FUNCTION public.trigger_auto_request_referral()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Auto-request referral when review is received
  IF NEW.review_received_at IS NOT NULL AND OLD.review_received_at IS NULL THEN
    PERFORM public.request_referral_automation(NEW.job_id);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_request_referral ON public.job_completion_tracking;
CREATE TRIGGER trg_auto_request_referral
  AFTER UPDATE ON public.job_completion_tracking
  FOR EACH ROW
  WHEN (NEW.review_received_at IS NOT NULL AND OLD.review_received_at IS NULL)
  EXECUTE FUNCTION public.trigger_auto_request_referral();

-- ============================================================================
-- PART 18 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

ALTER TABLE public.job_completion_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cleanup_confirmation_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_completion_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranty_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.completion_timeline_events ENABLE ROW LEVEL SECURITY;

-- Job completion tracking policies
CREATE POLICY "Users can view completion tracking in their workspace"
  ON public.job_completion_tracking
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage completion tracking in their workspace"
  ON public.job_completion_tracking
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Cleanup confirmation checklist policies
CREATE POLICY "Users can view cleanup checklist in their workspace"
  ON public.cleanup_confirmation_checklist
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage cleanup checklist in their workspace"
  ON public.cleanup_confirmation_checklist
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Job completion photos policies
CREATE POLICY "Users can view completion photos in their workspace"
  ON public.job_completion_photos
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage completion photos in their workspace"
  ON public.job_completion_photos
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Warranty packages policies
CREATE POLICY "Users can view warranty packages in their workspace"
  ON public.warranty_packages
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage warranty packages in their workspace"
  ON public.warranty_packages
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Review tracking policies
CREATE POLICY "Users can view review tracking in their workspace"
  ON public.review_tracking
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage review tracking in their workspace"
  ON public.review_tracking
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Referral tracking policies
CREATE POLICY "Users can view referral tracking in their workspace"
  ON public.referral_tracking
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage referral tracking in their workspace"
  ON public.referral_tracking
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Completion timeline events policies
CREATE POLICY "Users can view timeline events in their workspace"
  ON public.completion_timeline_events
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert timeline events"
  ON public.completion_timeline_events
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- PART 19 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.job_completion_tracking TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cleanup_confirmation_checklist TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.job_completion_photos TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.warranty_packages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.review_tracking TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.referral_tracking TO authenticated;
GRANT SELECT, INSERT ON public.completion_timeline_events TO authenticated;

GRANT EXECUTE ON FUNCTION public.send_final_invoice_automation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_warranty_package(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_review_automation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_referral_automation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_completion_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_completion_dashboard(uuid) TO authenticated;

-- ============================================================================
-- PART 20 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.job_completion_tracking IS 'Block 25180: Central tracking table for all completion-related activities';
COMMENT ON TABLE public.cleanup_confirmation_checklist IS 'Block 25180: Crew checklist for cleanup completion';
COMMENT ON TABLE public.job_completion_photos IS 'Block 25180: Tracks required vs uploaded photos for completion';
COMMENT ON TABLE public.warranty_packages IS 'Block 25180: Warranty package generation and delivery tracking';
COMMENT ON TABLE public.review_tracking IS 'Block 25180: Review request and tracking system';
COMMENT ON TABLE public.referral_tracking IS 'Block 25180: Referral request and tracking system';
COMMENT ON TABLE public.completion_timeline_events IS 'Block 25180: Auto-built timeline of completion events';

