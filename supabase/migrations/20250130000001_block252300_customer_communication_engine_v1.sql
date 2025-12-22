-- =========================================================
-- Block 252300 — SmartSend Customer Communication Engine v1
-- "Auto Job Updates, Photo Messaging, Appointment Confirmations, Completion Messages, Review Requests"
-- =========================================================
-- 
-- This block is what makes SmartSend feel like a premium homeowner experience platform,
-- not just a contractor tool.
-- 
-- Roofers will say:
-- "Our customers LOVE SmartSend messages.
-- We finally look professional instead of chaotic."
-- 
-- Homeowners will say:
-- "This is the most organized contractor we've ever hired."
-- 
-- This is a MASSIVE differentiator. No CRM communicates like this.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE communication_events TABLE
-- ============================================================================
-- Tracks all automated messages sent to customers

CREATE TABLE IF NOT EXISTS public.communication_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE CASCADE,
  customer_id uuid, -- References customers/contacts (flexible reference)
  event_type text NOT NULL,  -- 'appointment_confirmed', 'crew_on_way', 'job_started', 'material_delivered', 'job_completed', 'review_request', 'photo_update'
  message_body text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  channel text DEFAULT 'sms' CHECK (channel IN ('sms', 'email')),
  recipient_phone text,
  recipient_email text,
  status text DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'failed', 'delivered')),
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb, -- Store photo URLs, links, etc.
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_communication_events_job ON public.communication_events(job_id);
CREATE INDEX IF NOT EXISTS idx_communication_events_customer ON public.communication_events(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_communication_events_event_type ON public.communication_events(event_type);
CREATE INDEX IF NOT EXISTS idx_communication_events_sent_at ON public.communication_events(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_communication_events_status ON public.communication_events(status);

COMMENT ON TABLE public.communication_events IS 'Tracks all automated customer communication messages (Block 252300)';
COMMENT ON COLUMN public.communication_events.event_type IS 'Type: appointment_confirmed, crew_on_way, job_started, material_delivered, job_completed, review_request, photo_update';
COMMENT ON COLUMN public.communication_events.channel IS 'Channel: sms or email';

-- ============================================================================
-- PART 2 — CREATE message_templates TABLE
-- ============================================================================
-- Editable message templates per company

CREATE TABLE IF NOT EXISTS public.message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  template text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_message_templates_company ON public.message_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_message_templates_event_type ON public.message_templates(event_type);
CREATE INDEX IF NOT EXISTS idx_message_templates_active ON public.message_templates(company_id, is_active) WHERE is_active = true;

COMMENT ON TABLE public.message_templates IS 'Editable message templates per company (Block 252300)';

-- ============================================================================
-- PART 3 — INSERT DEFAULT MESSAGE TEMPLATES
-- ============================================================================
-- These are system-wide defaults. Companies can override with their own templates.

INSERT INTO public.message_templates (company_id, event_type, template, is_active)
VALUES
  -- Appointment Confirmed
  (NULL, 'appointment_confirmed', 
   'Hi {{customer_name}}, your roofing appointment for {{date}} is confirmed. Your technician: {{foreman_name}}. We will notify you when we''re on the way.',
   true),
  
  -- Crew On The Way
  (NULL, 'crew_on_way',
   'Good news! Our crew is heading to your home now. Estimated arrival: {{eta}}.',
   true),
  
  -- Job Start (with photo)
  (NULL, 'job_started',
   'Your roofing project has officially begun! Here''s a photo of the starting condition.',
   true),
  
  -- Material Delivered
  (NULL, 'material_delivered',
   'Materials have been delivered for your project. Installation will begin on {{start_date}}.',
   true),
  
  -- Job Complete
  (NULL, 'job_completed',
   'Your roofing project is complete! Thank you for trusting us. Your warranty packet is available here: {{warranty_link}}.',
   true),
  
  -- Review Request
  (NULL, 'review_request',
   'We enjoyed working on your home! If you had a great experience, would you mind leaving a quick review? {{review_link}}',
   true),
  
  -- Photo Update (Before)
  (NULL, 'photo_update_before',
   'Here''s a photo of your roof before we begin work.',
   true),
  
  -- Photo Update (During)
  (NULL, 'photo_update_during',
   'Progress update: Here''s how your roof looks now.',
   true),
  
  -- Photo Update (After)
  (NULL, 'photo_update_after',
   'Your new roof is complete! Here are the final photos.',
   true)
ON CONFLICT (company_id, event_type) DO NOTHING;

-- ============================================================================
-- PART 4 — HELPER FUNCTION: Send Customer Message
-- ============================================================================
-- This function handles message template rendering and sending

CREATE OR REPLACE FUNCTION public.send_customer_message(
  p_job_id uuid,
  p_event_type text,
  p_template_vars jsonb DEFAULT '{}'::jsonb,
  p_channel text DEFAULT 'sms',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid AS $$
DECLARE
  v_company_id uuid;
  v_customer_id uuid;
  v_customer_name text;
  v_customer_phone text;
  v_customer_email text;
  v_template text;
  v_message_body text;
  v_event_id uuid;
  v_rendered_template text;
BEGIN
  -- Get job and company info
  SELECT j.company_id, j.contact_id, j.homeowner_name, j.homeowner_phone, j.homeowner_email
  INTO v_company_id, v_customer_id, v_customer_name, v_customer_phone, v_customer_email
  FROM public.jobs j
  WHERE j.id = p_job_id;
  
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Job not found or missing company_id';
  END IF;
  
  -- Get template (company-specific first, then system default)
  SELECT template INTO v_template
  FROM public.message_templates
  WHERE event_type = p_event_type
    AND (company_id = v_company_id OR company_id IS NULL)
    AND is_active = true
  ORDER BY company_id NULLS LAST
  LIMIT 1;
  
  IF v_template IS NULL THEN
    RAISE EXCEPTION 'No template found for event_type: %', p_event_type;
  END IF;
  
  -- Render template with variables
  v_rendered_template := v_template;
  
  -- Replace template variables
  IF p_template_vars ? 'customer_name' THEN
    v_rendered_template := replace(v_rendered_template, '{{customer_name}}', p_template_vars->>'customer_name');
  ELSIF v_customer_name IS NOT NULL THEN
    v_rendered_template := replace(v_rendered_template, '{{customer_name}}', v_customer_name);
  END IF;
  
  IF p_template_vars ? 'date' THEN
    v_rendered_template := replace(v_rendered_template, '{{date}}', p_template_vars->>'date');
  END IF;
  
  IF p_template_vars ? 'foreman_name' THEN
    v_rendered_template := replace(v_rendered_template, '{{foreman_name}}', p_template_vars->>'foreman_name');
  END IF;
  
  IF p_template_vars ? 'eta' THEN
    v_rendered_template := replace(v_rendered_template, '{{eta}}', p_template_vars->>'eta');
  END IF;
  
  IF p_template_vars ? 'start_date' THEN
    v_rendered_template := replace(v_rendered_template, '{{start_date}}', p_template_vars->>'start_date');
  END IF;
  
  IF p_template_vars ? 'warranty_link' THEN
    v_rendered_template := replace(v_rendered_template, '{{warranty_link}}', p_template_vars->>'warranty_link');
  END IF;
  
  IF p_template_vars ? 'review_link' THEN
    v_rendered_template := replace(v_rendered_template, '{{review_link}}', p_template_vars->>'review_link');
  END IF;
  
  -- Create communication event
  INSERT INTO public.communication_events (
    job_id,
    customer_id,
    event_type,
    message_body,
    channel,
    recipient_phone,
    recipient_email,
    status,
    metadata
  )
  VALUES (
    p_job_id,
    v_customer_id,
    p_event_type,
    v_rendered_template,
    p_channel,
    v_customer_phone,
    v_customer_email,
    'pending', -- Will be updated when actually sent via API
    p_metadata
  )
  RETURNING id INTO v_event_id;
  
  -- TODO: In production, this would call Twilio/SendGrid API to actually send
  -- For now, we just log it
  RAISE NOTICE 'Message queued: job_id=%, event_type=%, channel=%, message=%', p_job_id, p_event_type, p_channel, v_rendered_template;
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 5 — TRIGGER: Appointment Confirmed
-- ============================================================================
-- When job.scheduled_date is set → send appointment confirmation

CREATE OR REPLACE FUNCTION public.trigger_appointment_confirmed()
RETURNS TRIGGER AS $$
DECLARE
  v_foreman_name text;
  v_scheduled_date text;
BEGIN
  -- Only trigger if scheduled_date was just set (was NULL before)
  IF OLD.scheduled_date IS NULL AND NEW.scheduled_date IS NOT NULL THEN
    -- Format date
    v_scheduled_date := to_char(NEW.scheduled_date, 'Month DD, YYYY');
    
    -- Get foreman name if crew is assigned
    SELECT CONCAT(we.first_name, ' ', we.last_name) INTO v_foreman_name
    FROM public.jobs j
    LEFT JOIN public.crews c ON j.crew_id = c.id
    LEFT JOIN public.workforce_employees we ON c.foreman_id = we.id
    WHERE j.id = NEW.id;
    
    -- Send message
    PERFORM public.send_customer_message(
      p_job_id := NEW.id,
      p_event_type := 'appointment_confirmed',
      p_template_vars := jsonb_build_object(
        'date', v_scheduled_date,
        'foreman_name', COALESCE(v_foreman_name, 'our team')
      ),
      p_channel := 'sms'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_appointment_confirmed ON public.jobs;
CREATE TRIGGER trg_appointment_confirmed
AFTER UPDATE ON public.jobs
FOR EACH ROW
WHEN (OLD.scheduled_date IS NULL AND NEW.scheduled_date IS NOT NULL)
EXECUTE FUNCTION public.trigger_appointment_confirmed();

-- ============================================================================
-- PART 6 — TRIGGER: Material Delivered
-- ============================================================================
-- When a material_delivery_record is created → send notification

CREATE OR REPLACE FUNCTION public.trigger_material_delivered()
RETURNS TRIGGER AS $$
DECLARE
  v_job jobs%ROWTYPE;
  v_start_date text;
BEGIN
  -- Get job info
  SELECT * INTO v_job FROM public.jobs WHERE id = NEW.job_id;
  
  IF v_job.id IS NOT NULL THEN
    -- Get start date from job schedule or production date
    IF v_job.production_date IS NOT NULL THEN
      v_start_date := to_char(v_job.production_date, 'Month DD, YYYY');
    ELSIF v_job.scheduled_date IS NOT NULL THEN
      v_start_date := to_char(v_job.scheduled_date, 'Month DD, YYYY');
    ELSE
      v_start_date := 'soon';
    END IF;
    
    -- Send message
    PERFORM public.send_customer_message(
      p_job_id := NEW.job_id,
      p_event_type := 'material_delivered',
      p_template_vars := jsonb_build_object(
        'start_date', v_start_date
      ),
      p_channel := 'sms',
      p_metadata := jsonb_build_object(
        'delivery_record_id', NEW.id,
        'supplier', NEW.supplier
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_material_delivered ON public.material_delivery_records;
CREATE TRIGGER trg_material_delivered
AFTER INSERT ON public.material_delivery_records
FOR EACH ROW
EXECUTE FUNCTION public.trigger_material_delivered();

-- ============================================================================
-- PART 7 — TRIGGER: Job Started (First Milestone "Tear-Off" in progress)
-- ============================================================================
-- When first milestone "Tear-Off" marked in-progress → send job started message

CREATE OR REPLACE FUNCTION public.trigger_job_started()
RETURNS TRIGGER AS $$
DECLARE
  v_is_first_milestone boolean;
  v_tearoff_milestone_id uuid;
BEGIN
  -- Check if this is the "Tear-Off" milestone and it's the first one being started
  IF NEW.status = 'in_progress' AND OLD.status != 'in_progress' THEN
    -- Check if this is a Tear-Off milestone
    IF LOWER(NEW.name) LIKE '%tear%off%' OR LOWER(NEW.name) LIKE '%tearoff%' THEN
      -- Check if this is the first milestone being started for this job
      SELECT COUNT(*) = 0 INTO v_is_first_milestone
      FROM public.production_milestones
      WHERE job_id = NEW.job_id
        AND status = 'in_progress'
        AND id != NEW.id;
      
      IF v_is_first_milestone THEN
        -- Send job started message
        PERFORM public.send_customer_message(
          p_job_id := NEW.job_id,
          p_event_type := 'job_started',
          p_channel := 'sms',
          p_metadata := jsonb_build_object(
            'milestone_id', NEW.id,
            'milestone_name', NEW.name
          )
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_job_started ON public.production_milestones;
CREATE TRIGGER trg_job_started
AFTER UPDATE ON public.production_milestones
FOR EACH ROW
WHEN (OLD.status != 'in_progress' AND NEW.status = 'in_progress')
EXECUTE FUNCTION public.trigger_job_started();

-- ============================================================================
-- PART 8 — TRIGGER: Job Completed
-- ============================================================================
-- When milestone "Job Complete" marked completed → send completion message

CREATE OR REPLACE FUNCTION public.trigger_job_completed()
RETURNS TRIGGER AS $$
DECLARE
  v_warranty_link text;
  v_job jobs%ROWTYPE;
BEGIN
  -- Check if this is a "Job Complete" milestone
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    IF LOWER(NEW.name) LIKE '%complete%' OR LOWER(NEW.name) LIKE '%finished%' THEN
      -- Get job info
      SELECT * INTO v_job FROM public.jobs WHERE id = NEW.job_id;
      
      -- Generate warranty link (tokenized portal link)
      -- In production, this would generate a proper portal token
      v_warranty_link := format('https://smartsend.app/customer/j/%s', encode(gen_random_bytes(8), 'base64'));
      
      -- Send completion message
      PERFORM public.send_customer_message(
        p_job_id := NEW.job_id,
        p_event_type := 'job_completed',
        p_template_vars := jsonb_build_object(
          'warranty_link', v_warranty_link
        ),
        p_channel := 'sms',
        p_metadata := jsonb_build_object(
          'milestone_id', NEW.id,
          'completed_at', NEW.completed_date
        )
      );
      
      -- Schedule review request for 24 hours later
      -- This will be handled by a scheduled job/edge function
      PERFORM pg_notify('job_completed', json_build_object(
        'job_id', NEW.job_id,
        'completed_at', NEW.completed_date
      )::text);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_job_completed ON public.production_milestones;
CREATE TRIGGER trg_job_completed
AFTER UPDATE ON public.production_milestones
FOR EACH ROW
WHEN (OLD.status != 'completed' AND NEW.status = 'completed')
EXECUTE FUNCTION public.trigger_job_completed();

-- ============================================================================
-- PART 9 — TRIGGER: Photo Updates
-- ============================================================================
-- When crew uploads photos → send to customer automatically

CREATE OR REPLACE FUNCTION public.trigger_photo_update()
RETURNS TRIGGER AS $$
DECLARE
  v_event_type text;
  v_photo_url text;
BEGIN
  -- Determine event type based on stage
  IF NEW.stage = 'before' THEN
    v_event_type := 'photo_update_before';
  ELSIF NEW.stage = 'during' THEN
    v_event_type := 'photo_update_during';
  ELSIF NEW.stage = 'after' THEN
    v_event_type := 'photo_update_after';
  ELSE
    RETURN NEW; -- Unknown stage, skip
  END IF;
  
  -- Send photo update message
  PERFORM public.send_customer_message(
    p_job_id := NEW.job_id,
    p_event_type := v_event_type,
    p_channel := 'sms',
    p_metadata := jsonb_build_object(
      'photo_id', NEW.id,
      'photo_url', NEW.url,
      'photo_stage', NEW.stage,
      'photo_label', NEW.label
    )
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_photo_update ON public.job_photo_entries;
CREATE TRIGGER trg_photo_update
AFTER INSERT ON public.job_photo_entries
FOR EACH ROW
EXECUTE FUNCTION public.trigger_photo_update();

-- ============================================================================
-- PART 10 — FUNCTION: Send Review Request
-- ============================================================================
-- Called 24 hours after job completion or after customer sign-off

CREATE OR REPLACE FUNCTION public.send_review_request(p_job_id uuid)
RETURNS uuid AS $$
DECLARE
  v_company_id uuid;
  v_review_link text;
  v_event_id uuid;
BEGIN
  -- Get company info
  SELECT company_id INTO v_company_id FROM public.jobs WHERE id = p_job_id;
  
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Job not found';
  END IF;
  
  -- Generate review link (in production, this would be company-specific)
  -- For now, use a generic Google review link format
  v_review_link := format('https://g.page/r/YOUR_GOOGLE_PLACE_ID/review');
  
  -- Send review request
  SELECT public.send_customer_message(
    p_job_id := p_job_id,
    p_event_type := 'review_request',
    p_template_vars := jsonb_build_object(
      'review_link', v_review_link
    ),
    p_channel := 'sms',
    p_metadata := jsonb_build_object(
      'review_type', 'google',
      'sent_after_completion', true
    )
  ) INTO v_event_id;
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 11 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.communication_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;

-- Communication events: Company members can view their company's events
CREATE POLICY "communication_events_select_company"
  ON public.communication_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.jobs j
      JOIN public.companies c ON j.company_id = c.id
      WHERE j.id = communication_events.job_id
        AND c.id IN (
          SELECT company_id FROM public.companies
          WHERE workspace_id IN (
            SELECT workspace_id FROM public.workspace_members
            WHERE user_id = auth.uid()
          )
        )
    )
  );

-- Message templates: Company members can view/edit their company's templates
CREATE POLICY "message_templates_select_company"
  ON public.message_templates FOR SELECT
  USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
    OR company_id IS NULL -- System defaults are readable by all
  );

CREATE POLICY "message_templates_insert_company"
  ON public.message_templates FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT id FROM public.companies
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY "message_templates_update_company"
  ON public.message_templates FOR UPDATE
  USING (
    company_id IN (
      SELECT id FROM public.companies
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================================
-- PART 12 — INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_communication_events_job_event ON public.communication_events(job_id, event_type);
CREATE INDEX IF NOT EXISTS idx_communication_events_created_at ON public.communication_events(created_at DESC);

COMMENT ON FUNCTION public.send_customer_message IS 'Sends a customer message using templates (Block 252300)';
COMMENT ON FUNCTION public.send_review_request IS 'Sends review request to customer (Block 252300)';
























