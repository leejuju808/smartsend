-- =========================================================
-- Block 20590 — SmartSend Adjuster Communication Engine v1
-- (Supplement Requests • Missing Items Emails • Approval Nudges • Professional Templates)
-- =========================================================
--
-- This block turns SmartSend into something NO cold email tool or CRM does:
-- SmartSend starts emailing the INSURANCE ADJUSTER on behalf of the roofer.
-- Automatically. Professionally. Insurance-accurate.
--
-- This is where roofers go from "waiting on insurance" → closing jobs faster.
-- =========================================================

-- ============================================================================
-- PART 1 — Add Adjuster Email Field to inbox_threads
-- ============================================================================

ALTER TABLE IF EXISTS public.inbox_threads
  ADD COLUMN IF NOT EXISTS insurance_adjuster_email text DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_threads_adjuster_email ON public.inbox_threads(insurance_adjuster_email) WHERE insurance_adjuster_email IS NOT NULL;

COMMENT ON COLUMN public.inbox_threads.insurance_adjuster_email IS 'Email address of the insurance adjuster assigned to the claim';

-- ============================================================================
-- PART 2 — Add ADJUSTER_CONTACTED Event Type to insurance_timeline_events
-- ============================================================================

-- First, drop the constraint temporarily to add the new event type
ALTER TABLE IF EXISTS public.insurance_timeline_events
  DROP CONSTRAINT IF EXISTS insurance_timeline_events_event_type_check;

-- Recreate constraint with ADJUSTER_CONTACTED added
ALTER TABLE IF EXISTS public.insurance_timeline_events
  ADD CONSTRAINT insurance_timeline_events_event_type_check 
  CHECK (event_type IN (
    'STORM_EVENT',
    'CLAIM_FILED',
    'ADJUSTER_ASSIGNED',
    'ADJUSTER_VISIT',
    'CLAIM_APPROVED',
    'CLAIM_DENIED',
    'SCOPE_PARSED',
    'INSTALL_READY',
    'FOLLOW_UP_SENT',
    'QUOTE_SENT',
    'DEPRECIATION_RELEASED',
    'SUPPLEMENT_SUBMITTED',
    'MANUAL_STAGE_UPDATE',
    'ADJUSTER_CONTACTED'
  ));

-- ============================================================================
-- PART 3 — Create adjuster_emails Table (Specialized Outbound Messages)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.adjuster_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Links to thread/contact/lead
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Adjuster and homeowner info
  adjuster_name text,
  adjuster_email text NOT NULL,
  homeowner_name text NOT NULL,
  claim_number text,
  
  -- Email type
  email_type text NOT NULL CHECK (email_type IN (
    'supplement_request',
    'approval_nudge',
    'pricing_dispute',
    'missing_items_dispute',
    'documentation_upload',
    'general_follow_up'
  )),
  
  -- Email content
  subject text NOT NULL,
  body_html text NOT NULL,
  body_text text NOT NULL,
  
  -- Status tracking
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'queued', 'sent', 'failed')),
  
  -- Trigger reason (why this email was generated)
  trigger_reason text CHECK (trigger_reason IN (
    'missing_items_detected',
    'supplement_opportunity',
    'approval_pending_too_long',
    'manual_trigger',
    'homeowner_forwarded_adjuster_info'
  )),
  
  -- Related data from other blocks
  missing_items jsonb DEFAULT '[]'::jsonb, -- From 20380
  supplement_value_estimate numeric(12,2), -- From 20490
  days_since_last_activity integer, -- Calculated
  insurance_rcv numeric(12,2), -- From 20360
  insurance_acv numeric(12,2), -- From 20360
  smart_send_estimate numeric(12,2), -- From 20490
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  
  -- Provider tracking (for outbound message linking)
  provider_message_id text,
  provider_thread_id text
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_adjuster_emails_thread ON public.adjuster_emails(thread_id);
CREATE INDEX IF NOT EXISTS idx_adjuster_emails_status ON public.adjuster_emails(status);
CREATE INDEX IF NOT EXISTS idx_adjuster_emails_type ON public.adjuster_emails(email_type);
CREATE INDEX IF NOT EXISTS idx_adjuster_emails_created ON public.adjuster_emails(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_adjuster_emails_queued ON public.adjuster_emails(status, created_at) WHERE status = 'queued';

COMMENT ON TABLE public.adjuster_emails IS 'Tracks all adjuster communication emails generated and sent by SmartSend';
COMMENT ON COLUMN public.adjuster_emails.email_type IS 'Type of adjuster email: supplement_request, approval_nudge, pricing_dispute, missing_items_dispute, documentation_upload, general_follow_up';
COMMENT ON COLUMN public.adjuster_emails.trigger_reason IS 'Reason why this email was generated: missing_items_detected, supplement_opportunity, approval_pending_too_long, manual_trigger, homeowner_forwarded_adjuster_info';

-- ============================================================================
-- PART 4 — Function: Detect Missing Items from 20380 (Scope Parser)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.detect_adjuster_email_triggers(
  p_thread_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread record;
  v_missing_items jsonb := '[]'::jsonb;
  v_supplement_opportunity boolean := false;
  v_approval_pending boolean := false;
  v_days_since_activity integer;
  v_triggers jsonb := '[]'::jsonb;
  v_trigger jsonb;
BEGIN
  -- Get thread data with scope and profitability signals
  SELECT 
    t.*,
    t.profitability_signals->>'missing_items' as missing_items_json,
    (t.profitability_signals->>'supplement_opportunity')::boolean as supplement_flag,
    t.insurance_claim_status,
    t.insurance_adjuster_email,
    t.insurance_adjuster_name,
    t.insurance_claim_number,
    t.claim_financials,
    t.roof_scope,
    -- Calculate days since last adjuster activity
    EXTRACT(DAY FROM (NOW() - COALESCE(
      (SELECT MAX(created_at) FROM public.insurance_timeline_events 
       WHERE thread_id = t.id 
       AND event_type IN ('ADJUSTER_VISIT', 'ADJUSTER_CONTACTED', 'CLAIM_APPROVED', 'SCOPE_PARSED')),
      t.created_at
    )))::integer as days_since_activity
  INTO v_thread
  FROM public.inbox_threads t
  WHERE t.id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Thread not found');
  END IF;
  
  -- Check if adjuster email is available
  IF v_thread.insurance_adjuster_email IS NULL OR v_thread.insurance_adjuster_email = '' THEN
    RETURN jsonb_build_object(
      'triggers', '[]'::jsonb,
      'error', 'Adjuster email not available'
    );
  END IF;
  
  -- Parse missing items from profitability_signals
  IF v_thread.missing_items_json IS NOT NULL AND v_thread.missing_items_json != 'null' THEN
    BEGIN
      v_missing_items := v_thread.missing_items_json::jsonb;
    EXCEPTION WHEN OTHERS THEN
      v_missing_items := '[]'::jsonb;
    END;
  END IF;
  
  -- Trigger 1: Missing Items Detected (from 20380)
  IF jsonb_array_length(v_missing_items) > 0 THEN
    v_trigger := jsonb_build_object(
      'type', 'missing_items_detected',
      'priority', 'high',
      'recommended_action', 'Send Supplement Request Email',
      'missing_items', v_missing_items,
      'email_type', 'supplement_request'
    );
    v_triggers := v_triggers || v_trigger;
  END IF;
  
  -- Trigger 2: Supplement Opportunity (from 20490)
  IF v_thread.supplement_flag = true THEN
    v_trigger := jsonb_build_object(
      'type', 'supplement_opportunity',
      'priority', 'high',
      'recommended_action', 'Send Supplement Request Email',
      'email_type', 'supplement_request'
    );
    v_triggers := v_triggers || v_trigger;
  END IF;
  
  -- Trigger 3: Approval Pending Too Long (from 20460)
  IF v_thread.insurance_claim_status IN ('under_review', 'supplements_needed') 
     AND v_thread.days_since_activity >= 7 THEN
    v_trigger := jsonb_build_object(
      'type', 'approval_pending_too_long',
      'priority', 'medium',
      'recommended_action', 'Send Approval Nudge Email',
      'days_since_activity', v_thread.days_since_activity,
      'email_type', 'approval_nudge'
    );
    v_triggers := v_triggers || v_trigger;
  END IF;
  
  -- Trigger 4: Pricing Dispute (if SmartSend estimate > Insurance RCV)
  IF v_thread.claim_financials IS NOT NULL THEN
    DECLARE
      v_insurance_rcv numeric;
      v_smart_send_estimate numeric;
    BEGIN
      v_insurance_rcv := (v_thread.claim_financials->>'rcv_total')::numeric;
      
      -- Get SmartSend estimate from roof_estimates (Block 20490)
      SELECT final_bid_price INTO v_smart_send_estimate
      FROM public.roof_estimates
      WHERE thread_id = p_thread_id
      AND status = 'draft'
      ORDER BY created_at DESC
      LIMIT 1;
      
      -- If SmartSend estimate is significantly higher (>10%), suggest pricing dispute
      IF v_smart_send_estimate IS NOT NULL 
         AND v_insurance_rcv IS NOT NULL 
         AND v_smart_send_estimate > v_insurance_rcv * 1.10 THEN
        v_trigger := jsonb_build_object(
          'type', 'pricing_dispute',
          'priority', 'medium',
          'recommended_action', 'Send Pricing Clarification Email',
          'insurance_rcv', v_insurance_rcv,
          'smart_send_estimate', v_smart_send_estimate,
          'difference', v_smart_send_estimate - v_insurance_rcv,
          'email_type', 'pricing_dispute'
        );
        v_triggers := v_triggers || v_trigger;
      END IF;
    END;
  END IF;
  
  RETURN jsonb_build_object(
    'triggers', v_triggers,
    'adjuster_name', v_thread.insurance_adjuster_name,
    'adjuster_email', v_thread.insurance_adjuster_email,
    'claim_number', v_thread.insurance_claim_number,
    'days_since_activity', v_thread.days_since_activity
  );
END;
$$;

COMMENT ON FUNCTION public.detect_adjuster_email_triggers IS 'Detects triggers for adjuster email generation: missing items, supplements, pending approvals, pricing disputes (Block 20590)';

-- ============================================================================
-- PART 5 — Function: Generate Adjuster Email Content (AI-Powered)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_adjuster_email_content(
  p_thread_id uuid,
  p_email_type text,
  p_trigger_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread record;
  v_contact record;
  v_contractor record;
  v_missing_items jsonb := '[]'::jsonb;
  v_subject text;
  v_body_html text;
  v_body_text text;
  v_adjuster_name text;
  v_homeowner_name text;
  v_claim_number text;
  v_carrier text;
  v_result jsonb;
BEGIN
  -- Get thread and contact data
  SELECT 
    t.*,
    t.profitability_signals->>'missing_items' as missing_items_json,
    t.claim_financials,
    t.roof_scope,
    c.name as contact_name,
    c.email as contact_email
  INTO v_thread
  FROM public.inbox_threads t
  LEFT JOIN public.contacts c ON c.id = t.contact_id
  WHERE t.id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Thread not found');
  END IF;
  
  -- Get contractor info (from workspace or user profile)
  SELECT 
    w.name as company_name,
    w.phone as company_phone,
    w.email as company_email
  INTO v_contractor
  FROM public.workspaces w
  WHERE w.id = v_thread.workspace_id
  LIMIT 1;
  
  -- Parse missing items
  IF v_thread.missing_items_json IS NOT NULL AND v_thread.missing_items_json != 'null' THEN
    BEGIN
      v_missing_items := v_thread.missing_items_json::jsonb;
    EXCEPTION WHEN OTHERS THEN
      v_missing_items := '[]'::jsonb;
    END;
  END IF;
  
  -- Set variables
  v_adjuster_name := COALESCE(v_thread.insurance_adjuster_name, 'Sir/Madam');
  v_homeowner_name := COALESCE(v_contact.contact_name, 'Homeowner');
  v_claim_number := COALESCE(v_thread.insurance_claim_number, 'N/A');
  v_carrier := COALESCE(v_thread.insurance_carrier, 'Insurance Company');
  
  -- Generate email based on type
  CASE p_email_type
    WHEN 'supplement_request' THEN
      -- Supplement Request Email
      v_subject := format('Supplement Request — Missing Items on Claim #%s', v_claim_number);
      
      v_body_text := format(
        'Hi %s,' || E'\n\n' ||
        'This is %s with %s, assisting %s with their %s claim (#%s).' || E'\n\n' ||
        'After reviewing the approved scope of loss, we noticed several code-required items and safety-required components that are missing:' || E'\n\n' ||
        'Missing Items:' || E'\n%s' || E'\n\n' ||
        'These items are required by local building code and standard roofing practices.' || E'\n\n' ||
        'We''ve attached our detailed estimate and photos. Please review and advise — we are requesting approval for these additions.' || E'\n\n' ||
        'Thanks,' || E'\n%s' || E'\n%s' || E'\n%s',
        v_adjuster_name,
        COALESCE(v_contractor.company_name, 'Our Team'),
        COALESCE(v_contractor.company_name, 'Our Roofing Company'),
        v_homeowner_name,
        v_carrier,
        v_claim_number,
        COALESCE(
          (SELECT string_agg('- ' || item::text, E'\n') 
           FROM jsonb_array_elements_text(v_missing_items) item),
          '- Please review attached estimate'
        ),
        COALESCE(v_contractor.company_name, 'Our Team'),
        COALESCE(v_contractor.company_phone, ''),
        COALESCE(v_contractor.company_email, '')
      );
      
      v_body_html := format(
        '<p>Hi %s,</p>' ||
        '<p>This is %s with <strong>%s</strong>, assisting %s with their %s claim (#%s).</p>' ||
        '<p>After reviewing the approved scope of loss, we noticed several code-required items and safety-required components that are missing:</p>' ||
        '<p><strong>Missing Items:</strong></p>' ||
        '<ul>%s</ul>' ||
        '<p>These items are required by local building code and standard roofing practices.</p>' ||
        '<p>We''ve attached our detailed estimate and photos. Please review and advise — we are requesting approval for these additions.</p>' ||
        '<p>Thanks,<br>%s<br>%s<br>%s</p>',
        v_adjuster_name,
        COALESCE(v_contractor.company_name, 'Our Team'),
        COALESCE(v_contractor.company_name, 'Our Roofing Company'),
        v_homeowner_name,
        v_carrier,
        v_claim_number,
        COALESCE(
          (SELECT string_agg('<li>' || item::text || '</li>', '') 
           FROM jsonb_array_elements_text(v_missing_items) item),
          '<li>Please review attached estimate</li>'
        ),
        COALESCE(v_contractor.company_name, 'Our Team'),
        COALESCE(v_contractor.company_phone, ''),
        COALESCE(v_contractor.company_email, '')
      );
      
    WHEN 'approval_nudge' THEN
      -- Approval Nudge Email
      v_subject := format('Follow-Up — Claim #%s (Pending Approval)', v_claim_number);
      
      DECLARE
        v_days_since integer;
        v_last_activity_date date;
      BEGIN
        SELECT 
          EXTRACT(DAY FROM (NOW() - MAX(created_at)))::integer,
          MAX(created_at)::date
        INTO v_days_since, v_last_activity_date
        FROM public.insurance_timeline_events
        WHERE thread_id = p_thread_id
        AND event_type IN ('ADJUSTER_VISIT', 'ADJUSTER_CONTACTED', 'SCOPE_PARSED');
        
        v_days_since := COALESCE(v_days_since, 7);
        
        v_body_text := format(
          'Hi %s,' || E'\n\n' ||
          'Following up on %s''s claim (#%s).' || E'\n\n' ||
          'We submitted additional documentation on %s. Please advise on the status of the review — the homeowner is waiting to proceed with repairs.' || E'\n\n' ||
          'Let us know if you need anything else.' || E'\n\n' ||
          'Thanks,' || E'\n%s' || E'\n%s' || E'\n%s',
          v_adjuster_name,
          v_homeowner_name,
          v_claim_number,
          COALESCE(v_last_activity_date::text, 'recently'),
          COALESCE(v_contractor.company_name, 'Our Team'),
          COALESCE(v_contractor.company_phone, ''),
          COALESCE(v_contractor.company_email, '')
        );
        
        v_body_html := format(
          '<p>Hi %s,</p>' ||
          '<p>Following up on %s''s claim (#%s).</p>' ||
          '<p>We submitted additional documentation on %s. Please advise on the status of the review — the homeowner is waiting to proceed with repairs.</p>' ||
          '<p>Let us know if you need anything else.</p>' ||
          '<p>Thanks,<br>%s<br>%s<br>%s</p>',
          v_adjuster_name,
          v_homeowner_name,
          v_claim_number,
          COALESCE(v_last_activity_date::text, 'recently'),
          COALESCE(v_contractor.company_name, 'Our Team'),
          COALESCE(v_contractor.company_phone, ''),
          COALESCE(v_contractor.company_email, '')
        );
      END;
      
    WHEN 'pricing_dispute' THEN
      -- Pricing Dispute Email
      v_subject := format('Pricing Clarification — Claim #%s', v_claim_number);
      
      DECLARE
        v_insurance_rcv numeric;
        v_smart_send_estimate numeric;
        v_roof_squares numeric;
        v_steep_charge boolean;
        v_two_story boolean;
      BEGIN
        v_insurance_rcv := (v_thread.claim_financials->>'rcv_total')::numeric;
        v_roof_squares := (v_thread.roof_scope->>'total_squares')::numeric;
        v_steep_charge := COALESCE((v_thread.roof_scope->>'steep_charge')::boolean, false);
        v_two_story := COALESCE((v_thread.roof_scope->>'stories')::integer, 1) >= 2;
        
        SELECT final_bid_price INTO v_smart_send_estimate
        FROM public.roof_estimates
        WHERE thread_id = p_thread_id
        ORDER BY created_at DESC
        LIMIT 1;
        
        v_body_text := format(
          'Hi %s,' || E'\n\n' ||
          'After reviewing the approved RCV of $%s, we''ve compared it to the required scope:' || E'\n\n' ||
          '%s' || E'\n\n' ||
          'The current RCV does not reflect standard market rates for this scope.' || E'\n\n' ||
          'Our estimate (attached) is $%s, which aligns with local pricing. Please review and advise on revised pricing.' || E'\n\n' ||
          'Thank you,' || E'\n%s' || E'\n%s' || E'\n%s',
          v_adjuster_name,
          COALESCE(v_insurance_rcv::text, 'N/A'),
          COALESCE(
            format('%s squares%s%s',
              COALESCE(v_roof_squares::text, 'N/A'),
              CASE WHEN v_steep_charge THEN E'\n- Steep roof' ELSE '' END,
              CASE WHEN v_two_story THEN E'\n- 2-story' ELSE '' END
            ),
            'Please review attached estimate'
          ),
          COALESCE(v_smart_send_estimate::text, 'N/A'),
          COALESCE(v_contractor.company_name, 'Our Team'),
          COALESCE(v_contractor.company_phone, ''),
          COALESCE(v_contractor.company_email, '')
        );
        
        v_body_html := format(
          '<p>Hi %s,</p>' ||
          '<p>After reviewing the approved RCV of <strong>$%s</strong>, we''ve compared it to the required scope:</p>' ||
          '<ul>%s</ul>' ||
          '<p>The current RCV does not reflect standard market rates for this scope.</p>' ||
          '<p>Our estimate (attached) is <strong>$%s</strong>, which aligns with local pricing. Please review and advise on revised pricing.</p>' ||
          '<p>Thank you,<br>%s<br>%s<br>%s</p>',
          v_adjuster_name,
          COALESCE(v_insurance_rcv::text, 'N/A'),
          COALESCE(
            format('<li>%s squares</li>%s%s',
              COALESCE(v_roof_squares::text, 'N/A'),
              CASE WHEN v_steep_charge THEN '<li>Steep roof</li>' ELSE '' END,
              CASE WHEN v_two_story THEN '<li>2-story</li>' ELSE '' END
            ),
            '<li>Please review attached estimate</li>'
          ),
          COALESCE(v_smart_send_estimate::text, 'N/A'),
          COALESCE(v_contractor.company_name, 'Our Team'),
          COALESCE(v_contractor.company_phone, ''),
          COALESCE(v_contractor.company_email, '')
        );
      END;
      
    WHEN 'general_follow_up' THEN
      -- General Follow-Up Email
      v_subject := format('Follow-Up — Claim #%s', v_claim_number);
      
      v_body_text := format(
        'Hi %s,' || E'\n\n' ||
        'Following up on %s''s claim (#%s).' || E'\n\n' ||
        'Please let us know if you need any additional information or documentation.' || E'\n\n' ||
        'Thank you,' || E'\n%s' || E'\n%s' || E'\n%s',
        v_adjuster_name,
        v_homeowner_name,
        v_claim_number,
        COALESCE(v_contractor.company_name, 'Our Team'),
        COALESCE(v_contractor.company_phone, ''),
        COALESCE(v_contractor.company_email, '')
      );
      
      v_body_html := format(
        '<p>Hi %s,</p>' ||
        '<p>Following up on %s''s claim (#%s).</p>' ||
        '<p>Please let us know if you need any additional information or documentation.</p>' ||
        '<p>Thank you,<br>%s<br>%s<br>%s</p>',
        v_adjuster_name,
        v_homeowner_name,
        v_claim_number,
        COALESCE(v_contractor.company_name, 'Our Team'),
        COALESCE(v_contractor.company_phone, ''),
        COALESCE(v_contractor.company_email, '')
      );
      
    ELSE
      RETURN jsonb_build_object('error', format('Unknown email type: %s', p_email_type));
  END CASE;
  
  RETURN jsonb_build_object(
    'subject', v_subject,
    'body_html', v_body_html,
    'body_text', v_body_text,
    'adjuster_name', v_adjuster_name,
    'homeowner_name', v_homeowner_name,
    'claim_number', v_claim_number
  );
END;
$$;

COMMENT ON FUNCTION public.generate_adjuster_email_content IS 'Generates professional adjuster email content based on email type (supplement_request, approval_nudge, pricing_dispute) (Block 20590)';

-- ============================================================================
-- PART 6 — Function: Create Timeline Event When Adjuster Email Sent
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_adjuster_contacted_event(
  p_thread_id uuid,
  p_email_type text,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id uuid;
  v_thread record;
BEGIN
  -- Get thread data
  SELECT * INTO v_thread
  FROM public.inbox_threads
  WHERE id = p_thread_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Thread not found';
  END IF;
  
  -- Create timeline event
  INSERT INTO public.insurance_timeline_events (
    thread_id,
    contact_id,
    lead_id,
    event_type,
    event_payload,
    event_date,
    detected_from,
    detection_confidence
  ) VALUES (
    p_thread_id,
    v_thread.contact_id,
    v_thread.lead_id,
    'ADJUSTER_CONTACTED',
    jsonb_build_object(
      'email_type', p_email_type,
      'reason', p_reason,
      'adjuster_name', v_thread.insurance_adjuster_name,
      'adjuster_email', v_thread.insurance_adjuster_email
    ),
    CURRENT_DATE,
    'trigger',
    0.9
  )
  RETURNING id INTO v_event_id;
  
  RETURN v_event_id;
END;
$$;

COMMENT ON FUNCTION public.create_adjuster_contacted_event IS 'Creates ADJUSTER_CONTACTED timeline event when adjuster email is sent (Block 20590)';

-- ============================================================================
-- PART 7 — Trigger: Update Updated_At Timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_adjuster_emails_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_adjuster_emails_updated_at ON public.adjuster_emails;
CREATE TRIGGER trg_adjuster_emails_updated_at
  BEFORE UPDATE ON public.adjuster_emails
  FOR EACH ROW
  EXECUTE FUNCTION public.update_adjuster_emails_timestamp();

-- ============================================================================
-- PART 8 — Enable Row Level Security
-- ============================================================================

ALTER TABLE public.adjuster_emails ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS adjuster_emails_select ON public.adjuster_emails;
DROP POLICY IF EXISTS adjuster_emails_insert ON public.adjuster_emails;
DROP POLICY IF EXISTS adjuster_emails_update ON public.adjuster_emails;

-- Policy: Users can only see adjuster emails for threads in their workspace
CREATE POLICY adjuster_emails_select ON public.adjuster_emails
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.inbox_threads t
      JOIN public.workspaces w ON w.id = t.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE t.id = adjuster_emails.thread_id
      AND wm.user_id = auth.uid()
    )
  );

-- Policy: Users can insert adjuster emails for threads in their workspace
CREATE POLICY adjuster_emails_insert ON public.adjuster_emails
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.inbox_threads t
      JOIN public.workspaces w ON w.id = t.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE t.id = adjuster_emails.thread_id
      AND wm.user_id = auth.uid()
    )
  );

-- Policy: Users can update adjuster emails for threads in their workspace
CREATE POLICY adjuster_emails_update ON public.adjuster_emails
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.inbox_threads t
      JOIN public.workspaces w ON w.id = t.workspace_id
      JOIN public.workspace_members wm ON wm.workspace_id = w.id
      WHERE t.id = adjuster_emails.thread_id
      AND wm.user_id = auth.uid()
    )
  );

