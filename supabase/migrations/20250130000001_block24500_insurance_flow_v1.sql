-- =========================================================
-- Block 24500 — SmartSend Roofing Insurance Flow v1
-- (ACV/RCV Tracking • Supplement Management • Adjuster Coordination • Insurance Templates • Making Roofers Win More Insurance Jobs With Less Stress)
-- =========================================================
-- 
-- THE FULL INSURANCE ENGINE — ZERO FLUFF.
-- 
-- Insurance is where roofers make their BIGGEST money — and also lose the MOST money from:
-- ❌ missed supplements
-- ❌ slow homeowners
-- ❌ confused adjusters
-- ❌ forgotten depreciation
-- ❌ lost documentation
-- ❌ poor follow-up
-- ❌ roofing companies not knowing the process
--
-- SmartSend Insurance Flow v1 turns chaos into a clean, step-by-step system that roofers can rely on.

-- ============================================================================
-- PART 1 — CREATE job_insurance_flow TABLE
-- ============================================================================
-- This table tracks the complete 6-step insurance workflow for each job
-- Every job with insurance gets a dedicated Insurance Tab showing all this info

CREATE TABLE IF NOT EXISTS public.job_insurance_flow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Insurance Type & Basic Info
  insurance_type text CHECK (insurance_type IN ('homeowners', 'commercial', 'other')) DEFAULT 'homeowners',
  carrier text,
  claim_number text,
  
  -- Step 1: Initial Claim Filed
  claim_filed_date date,
  claim_filed boolean DEFAULT false,
  homeowner_filed_claim boolean DEFAULT false,
  
  -- Step 2: Adjuster Inspection Scheduled
  adjuster_name text,
  adjuster_phone text,
  adjuster_email text,
  adjuster_inspection_scheduled_date date,
  adjuster_inspection_completed_date date,
  inspection_prep_checklist_completed boolean DEFAULT false,
  
  -- Step 3: ACV Payment Tracking
  acv_amount numeric(12,2) DEFAULT 0,
  acv_received boolean DEFAULT false,
  acv_received_date date,
  acv_deposited boolean DEFAULT false,
  acv_deposited_date date,
  
  -- Step 4: Supplement Management
  supplement_submitted_date date,
  supplement_amount numeric(12,2) DEFAULT 0,
  supplement_status text CHECK (supplement_status IN ('not_submitted', 'submitted', 'pending', 'approved', 'denied')) DEFAULT 'not_submitted',
  supplement_approved_date date,
  supplement_denied_date date,
  supplement_denied_reason text,
  
  -- Step 5: Depreciation (RCV) Tracking
  rcv_amount numeric(12,2) DEFAULT 0,
  deductible numeric(12,2) DEFAULT 0,
  depreciation_owed numeric(12,2) DEFAULT 0,
  final_invoice_sent_date date,
  depreciation_approved_date date,
  depreciation_payment_received boolean DEFAULT false,
  depreciation_payment_received_date date,
  
  -- Step 6: Final Insurance Cleanup
  final_photos_uploaded boolean DEFAULT false,
  completion_certificate_uploaded boolean DEFAULT false,
  final_invoice_sent_to_insurance boolean DEFAULT false,
  depreciation_reminder_sent_to_homeowner boolean DEFAULT false,
  insurance_complete boolean DEFAULT false,
  insurance_completed_date date,
  
  -- Next Required Action (Auto-calculated)
  next_required_action text,
  next_required_action_due_date date,
  
  -- Insurance Health Score (0-100)
  insurance_health_score integer CHECK (insurance_health_score >= 0 AND insurance_health_score <= 100),
  
  -- Documentation (references to documents/photos)
  documentation_metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Notes
  notes text,
  
  -- Meta
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(job_id)
);

CREATE INDEX IF NOT EXISTS job_insurance_flow_job_idx ON public.job_insurance_flow(job_id);
CREATE INDEX IF NOT EXISTS job_insurance_flow_workspace_idx ON public.job_insurance_flow(workspace_id);
CREATE INDEX IF NOT EXISTS job_insurance_flow_health_score_idx ON public.job_insurance_flow(workspace_id, insurance_health_score DESC) WHERE insurance_health_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS job_insurance_flow_next_action_idx ON public.job_insurance_flow(workspace_id, next_required_action_due_date) WHERE next_required_action_due_date IS NOT NULL;

-- ============================================================================
-- PART 2 — CREATE insurance_flow_timeline TABLE
-- ============================================================================
-- Visual timeline showing all insurance stages and their status

CREATE TABLE IF NOT EXISTS public.insurance_flow_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Stage Info
  stage text NOT NULL CHECK (stage IN (
    'claim_filed',
    'adjuster_inspection_scheduled',
    'acv_payment_tracking',
    'supplement_management',
    'depreciation_tracking',
    'final_insurance_cleanup'
  )),
  
  -- Status
  status text NOT NULL CHECK (status IN ('not_started', 'in_progress', 'completed', 'blocked')) DEFAULT 'not_started',
  
  -- Dates
  started_date date,
  completed_date date,
  due_date date,
  
  -- Stage-specific data
  stage_data jsonb DEFAULT '{}'::jsonb,
  
  -- Notes
  notes text,
  
  -- Meta
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS insurance_flow_timeline_job_idx ON public.insurance_flow_timeline(job_id, stage);
CREATE INDEX IF NOT EXISTS insurance_flow_timeline_workspace_idx ON public.insurance_flow_timeline(workspace_id);
CREATE INDEX IF NOT EXISTS insurance_flow_timeline_status_idx ON public.insurance_flow_timeline(workspace_id, status);

-- ============================================================================
-- PART 3 — CREATE insurance_flow_alerts TABLE
-- ============================================================================
-- Early-warning alerts for insurance issues

CREATE TABLE IF NOT EXISTS public.insurance_flow_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Alert Info
  alert_type text NOT NULL CHECK (alert_type IN (
    'adjuster_not_responded',
    'supplement_not_submitted',
    'depreciation_not_released',
    'homeowner_not_filed_claim',
    'final_invoice_not_submitted',
    'acv_not_received',
    'supplement_pending_too_long',
    'depreciation_overdue'
  )),
  
  alert_title text NOT NULL,
  alert_message text NOT NULL,
  alert_severity text CHECK (alert_severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  
  -- Alert Status
  is_resolved boolean DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Alert Metadata
  alert_metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Meta
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS insurance_flow_alerts_job_idx ON public.insurance_flow_alerts(job_id, is_resolved);
CREATE INDEX IF NOT EXISTS insurance_flow_alerts_workspace_idx ON public.insurance_flow_alerts(workspace_id, is_resolved) WHERE is_resolved = false;
CREATE INDEX IF NOT EXISTS insurance_flow_alerts_type_idx ON public.insurance_flow_alerts(workspace_id, alert_type) WHERE is_resolved = false;

-- ============================================================================
-- PART 4 — FUNCTION: Calculate Next Required Action
-- ============================================================================
-- Automatically determines what the roofer needs to do next

CREATE OR REPLACE FUNCTION public.calculate_insurance_next_action(p_job_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_flow record;
  v_next_action text;
  v_due_date date;
BEGIN
  -- Get insurance flow data
  SELECT * INTO v_flow
  FROM public.job_insurance_flow
  WHERE job_id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Determine next action based on workflow state
  -- Step 1: Check if claim filed
  IF NOT v_flow.claim_filed THEN
    v_next_action := 'File insurance claim with homeowner';
    v_due_date := CURRENT_DATE + interval '1 day';
  -- Step 2: Check if adjuster inspection scheduled
  ELSIF v_flow.adjuster_inspection_scheduled_date IS NULL THEN
    v_next_action := 'Schedule adjuster inspection';
    v_due_date := CURRENT_DATE + interval '3 days';
  -- Step 3: Check if ACV received
  ELSIF NOT v_flow.acv_received THEN
    v_next_action := 'Follow up on ACV check';
    v_due_date := CURRENT_DATE + interval '5 days';
  -- Step 4: Check if supplement needed/submitted
  ELSIF v_flow.supplement_status = 'not_submitted' AND v_flow.supplement_amount > 0 THEN
    v_next_action := 'Submit supplement request';
    v_due_date := CURRENT_DATE + interval '2 days';
  ELSIF v_flow.supplement_status = 'pending' THEN
    v_next_action := 'Follow up on supplement status';
    v_due_date := CURRENT_DATE + interval '5 days';
  -- Step 5: Check if depreciation collected
  ELSIF NOT v_flow.depreciation_payment_received AND v_flow.depreciation_owed > 0 THEN
    v_next_action := 'Follow up on depreciation payment';
    v_due_date := CURRENT_DATE + interval '7 days';
  -- Step 6: Final cleanup
  ELSIF NOT v_flow.insurance_complete THEN
    IF NOT v_flow.final_photos_uploaded THEN
      v_next_action := 'Upload final photos';
    ELSIF NOT v_flow.completion_certificate_uploaded THEN
      v_next_action := 'Upload completion certificate';
    ELSIF NOT v_flow.final_invoice_sent_to_insurance THEN
      v_next_action := 'Send final invoice to insurance';
    ELSE
      v_next_action := 'Complete insurance documentation';
    END IF;
    v_due_date := CURRENT_DATE + interval '3 days';
  ELSE
    v_next_action := 'Insurance complete';
    v_due_date := NULL;
  END IF;
  
  -- Update next action
  UPDATE public.job_insurance_flow
  SET 
    next_required_action = v_next_action,
    next_required_action_due_date = v_due_date,
    updated_at = now()
  WHERE job_id = p_job_id;
  
  RETURN v_next_action;
END;
$$;

COMMENT ON FUNCTION public.calculate_insurance_next_action IS 'Calculates the next required action for insurance workflow';

-- ============================================================================
-- PART 5 — FUNCTION: Calculate Insurance Health Score
-- ============================================================================
-- Calculates insurance health score (0-100) based on workflow progress and issues

CREATE OR REPLACE FUNCTION public.calculate_insurance_health_score(p_job_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_flow record;
  v_score integer := 100;
  v_days_overdue integer;
  v_penalty integer;
BEGIN
  -- Get insurance flow data
  SELECT * INTO v_flow
  FROM public.job_insurance_flow
  WHERE job_id = p_job_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Start with base score of 100, deduct for issues
  
  -- Penalty: Missing ACV (-20 points)
  IF NOT v_flow.acv_received AND v_flow.acv_amount > 0 THEN
    v_days_overdue := COALESCE(EXTRACT(DAY FROM (CURRENT_DATE - v_flow.adjuster_inspection_completed_date))::integer, 0);
    IF v_days_overdue > 7 THEN
      v_score := v_score - 20;
    ELSIF v_days_overdue > 3 THEN
      v_score := v_score - 10;
    END IF;
  END IF;
  
  -- Penalty: Supplement not submitted (-15 points)
  IF v_flow.supplement_status = 'not_submitted' AND v_flow.supplement_amount > 0 THEN
    v_score := v_score - 15;
  END IF;
  
  -- Penalty: Supplement pending too long (-10 points)
  IF v_flow.supplement_status = 'pending' THEN
    v_days_overdue := COALESCE(EXTRACT(DAY FROM (CURRENT_DATE - v_flow.supplement_submitted_date))::integer, 0);
    IF v_days_overdue > 5 THEN
      v_score := v_score - 10;
    ELSIF v_days_overdue > 3 THEN
      v_score := v_score - 5;
    END IF;
  END IF;
  
  -- Penalty: Depreciation overdue (-15 points)
  IF NOT v_flow.depreciation_payment_received AND v_flow.depreciation_owed > 0 THEN
    v_days_overdue := COALESCE(EXTRACT(DAY FROM (CURRENT_DATE - v_flow.final_invoice_sent_date))::integer, 0);
    IF v_days_overdue > 14 THEN
      v_score := v_score - 15;
    ELSIF v_days_overdue > 7 THEN
      v_score := v_score - 10;
    END IF;
  END IF;
  
  -- Penalty: Adjuster not responsive (-10 points)
  IF v_flow.adjuster_inspection_scheduled_date IS NOT NULL 
     AND v_flow.adjuster_inspection_completed_date IS NULL THEN
    v_days_overdue := COALESCE(EXTRACT(DAY FROM (CURRENT_DATE - v_flow.adjuster_inspection_scheduled_date))::integer, 0);
    IF v_days_overdue > 3 THEN
      v_score := v_score - 10;
    END IF;
  END IF;
  
  -- Penalty: Homeowner hasn't filed claim (-15 points)
  IF NOT v_flow.homeowner_filed_claim AND v_flow.claim_filed_date IS NULL THEN
    v_score := v_score - 15;
  END IF;
  
  -- Penalty: Final invoice not submitted (-10 points)
  IF NOT v_flow.final_invoice_sent_to_insurance AND v_flow.insurance_complete = false THEN
    v_score := v_score - 10;
  END IF;
  
  -- Clamp to 0-100
  v_score := GREATEST(0, LEAST(100, v_score));
  
  -- Update insurance flow
  UPDATE public.job_insurance_flow
  SET 
    insurance_health_score = v_score,
    updated_at = now()
  WHERE job_id = p_job_id;
  
  RETURN v_score;
END;
$$;

COMMENT ON FUNCTION public.calculate_insurance_health_score IS 'Calculates insurance health score (0-100) based on workflow progress and issues';

-- ============================================================================
-- PART 6 — FUNCTION: Check and Create Insurance Alerts
-- ============================================================================
-- Creates early-warning alerts for insurance issues

CREATE OR REPLACE FUNCTION public.check_insurance_flow_alerts(p_job_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_flow record;
  v_alerts_created integer := 0;
  v_days integer;
BEGIN
  -- If job_id provided, check just that job; otherwise check all insurance jobs
  FOR v_flow IN
    SELECT jif.*
    FROM public.job_insurance_flow jif
    WHERE (p_job_id IS NULL OR jif.job_id = p_job_id)
  LOOP
    -- Alert: Adjuster has not responded in 3 days
    IF v_flow.adjuster_inspection_scheduled_date IS NOT NULL 
       AND v_flow.adjuster_inspection_completed_date IS NULL THEN
      v_days := EXTRACT(DAY FROM (CURRENT_DATE - v_flow.adjuster_inspection_scheduled_date))::integer;
      IF v_days >= 3 AND NOT EXISTS (
        SELECT 1 FROM public.insurance_flow_alerts
        WHERE job_id = v_flow.job_id
          AND alert_type = 'adjuster_not_responded'
          AND is_resolved = false
      ) THEN
        INSERT INTO public.insurance_flow_alerts (
          job_id, workspace_id, alert_type, alert_title, alert_message, alert_severity
        ) VALUES (
          v_flow.job_id, v_flow.workspace_id, 'adjuster_not_responded',
          'Adjuster has not responded in 3 days',
          format('Adjuster inspection was scheduled %s days ago but has not been completed.', v_days),
          'medium'
        );
        v_alerts_created := v_alerts_created + 1;
      END IF;
    END IF;
    
    -- Alert: Supplement not submitted
    IF v_flow.supplement_status = 'not_submitted' AND v_flow.supplement_amount > 0 
       AND NOT EXISTS (
         SELECT 1 FROM public.insurance_flow_alerts
         WHERE job_id = v_flow.job_id
           AND alert_type = 'supplement_not_submitted'
           AND is_resolved = false
       ) THEN
      INSERT INTO public.insurance_flow_alerts (
        job_id, workspace_id, alert_type, alert_title, alert_message, alert_severity
      ) VALUES (
        v_flow.job_id, v_flow.workspace_id, 'supplement_not_submitted',
        'Supplement not submitted',
        format('Supplement request for $%s has not been submitted yet.', v_flow.supplement_amount),
        'high'
      );
      v_alerts_created := v_alerts_created + 1;
    END IF;
    
    -- Alert: Supplement pending too long
    IF v_flow.supplement_status = 'pending' THEN
      v_days := EXTRACT(DAY FROM (CURRENT_DATE - v_flow.supplement_submitted_date))::integer;
      IF v_days >= 5 AND NOT EXISTS (
        SELECT 1 FROM public.insurance_flow_alerts
        WHERE job_id = v_flow.job_id
          AND alert_type = 'supplement_pending_too_long'
          AND is_resolved = false
      ) THEN
        INSERT INTO public.insurance_flow_alerts (
          job_id, workspace_id, alert_type, alert_title, alert_message, alert_severity
        ) VALUES (
          v_flow.job_id, v_flow.workspace_id, 'supplement_pending_too_long',
          'Supplement has been pending for 5 days',
          format('Supplement request has been pending for %s days. Want me to follow up with adjuster?', v_days),
          'medium'
        );
        v_alerts_created := v_alerts_created + 1;
      END IF;
    END IF;
    
    -- Alert: Depreciation not released
    IF NOT v_flow.depreciation_payment_received AND v_flow.depreciation_owed > 0 THEN
      v_days := COALESCE(EXTRACT(DAY FROM (CURRENT_DATE - v_flow.final_invoice_sent_date))::integer, 0);
      IF v_days >= 7 AND NOT EXISTS (
        SELECT 1 FROM public.insurance_flow_alerts
        WHERE job_id = v_flow.job_id
          AND alert_type = 'depreciation_not_released'
          AND is_resolved = false
      ) THEN
        INSERT INTO public.insurance_flow_alerts (
          job_id, workspace_id, alert_type, alert_title, alert_message, alert_severity
        ) VALUES (
          v_flow.job_id, v_flow.workspace_id, 'depreciation_not_released',
          'Depreciation is still unpaid',
          format('Depreciation payment of $%s is still unpaid after %s days. Send reminder?', v_flow.depreciation_owed, v_days),
          'high'
        );
        v_alerts_created := v_alerts_created + 1;
      END IF;
    END IF;
    
    -- Alert: Homeowner hasn't filed claim
    IF NOT v_flow.homeowner_filed_claim AND v_flow.claim_filed_date IS NULL 
       AND NOT EXISTS (
         SELECT 1 FROM public.insurance_flow_alerts
         WHERE job_id = v_flow.job_id
           AND alert_type = 'homeowner_not_filed_claim'
           AND is_resolved = false
       ) THEN
      INSERT INTO public.insurance_flow_alerts (
        job_id, workspace_id, alert_type, alert_title, alert_message, alert_severity
      ) VALUES (
        v_flow.job_id, v_flow.workspace_id, 'homeowner_not_filed_claim',
        'Homeowner hasn't filed claim',
        'Homeowner has not filed their insurance claim yet. Send claim filing guidance?',
        'medium'
      );
      v_alerts_created := v_alerts_created + 1;
    END IF;
    
    -- Alert: ACV not received
    IF NOT v_flow.acv_received AND v_flow.acv_amount > 0 THEN
      v_days := COALESCE(EXTRACT(DAY FROM (CURRENT_DATE - v_flow.adjuster_inspection_completed_date))::integer, 0);
      IF v_days >= 7 AND NOT EXISTS (
        SELECT 1 FROM public.insurance_flow_alerts
        WHERE job_id = v_flow.job_id
          AND alert_type = 'acv_not_received'
          AND is_resolved = false
      ) THEN
        INSERT INTO public.insurance_flow_alerts (
          job_id, workspace_id, alert_type, alert_title, alert_message, alert_severity
        ) VALUES (
          v_flow.job_id, v_flow.workspace_id, 'acv_not_received',
          'ACV check has NOT been recorded',
          format('ACV check of $%s has not been recorded — this delays scheduling.', v_flow.acv_amount),
          'high'
        );
        v_alerts_created := v_alerts_created + 1;
      END IF;
    END IF;
    
    -- Alert: Final invoice not submitted
    IF NOT v_flow.final_invoice_sent_to_insurance AND v_flow.insurance_complete = false 
       AND NOT EXISTS (
         SELECT 1 FROM public.insurance_flow_alerts
         WHERE job_id = v_flow.job_id
           AND alert_type = 'final_invoice_not_submitted'
           AND is_resolved = false
       ) THEN
      INSERT INTO public.insurance_flow_alerts (
        job_id, workspace_id, alert_type, alert_title, alert_message, alert_severity
      ) VALUES (
        v_flow.job_id, v_flow.workspace_id, 'final_invoice_not_submitted',
        'Final invoice not submitted',
        'Final invoice has not been submitted to insurance yet.',
        'medium'
      );
      v_alerts_created := v_alerts_created + 1;
    END IF;
  END LOOP;
  
  RETURN v_alerts_created;
END;
$$;

COMMENT ON FUNCTION public.check_insurance_flow_alerts IS 'Checks for insurance flow issues and creates early-warning alerts';

-- ============================================================================
-- PART 7 — TRIGGER: Auto-update next action and health score
-- ============================================================================

CREATE OR REPLACE FUNCTION public.insurance_flow_auto_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Recalculate next action and health score when flow changes
  PERFORM public.calculate_insurance_next_action(COALESCE(NEW.job_id, OLD.job_id));
  PERFORM public.calculate_insurance_health_score(COALESCE(NEW.job_id, OLD.job_id));
  PERFORM public.check_insurance_flow_alerts(COALESCE(NEW.job_id, OLD.job_id));
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS insurance_flow_auto_update_trigger ON public.job_insurance_flow;
CREATE TRIGGER insurance_flow_auto_update_trigger
AFTER INSERT OR UPDATE ON public.job_insurance_flow
FOR EACH ROW
EXECUTE FUNCTION public.insurance_flow_auto_update();

-- ============================================================================
-- PART 8 — ADD INSURANCE TEMPLATES TO email_templates TABLE
-- ============================================================================
-- Seed insurance-specific templates that roofers need

INSERT INTO email_templates (org_id, template_key, label, base_subject, base_body, use_ai_rewriter, tone)
VALUES
  -- To Homeowner — Claim Filing Guidance
  ('00000000-0000-0000-0000-000000000000'::uuid, 'insurance_claim_filing_guidance',
    'To Homeowner — Claim Filing Guidance',
    'Here''s how to file your roofing claim step-by-step',
    'Hey {{first_name}},

Here''s how to file your roofing claim step-by-step:

1. Contact your insurance company directly (call the number on your policy)
2. Tell them you need to file a claim for roof damage
3. They''ll assign you a claim number — please share that with us
4. They''ll schedule an adjuster to inspect your roof

Need help? We can guide you through the process or answer any questions.

Let me know once you''ve filed the claim!

Thanks,
{{sender_name}}',
    TRUE, 'casual'),

  -- To Adjuster — Supplement Request
  ('00000000-0000-0000-0000-000000000000'::uuid, 'insurance_supplement_request',
    'To Adjuster — Supplement Request',
    'Supplement Request for Claim #{{claim_number}}',
    'Hi {{adjuster_name}},

We identified additional items requiring correction that were not included in the original scope:

{{supplement_items}}

Claim Number: {{claim_number}}
Property Address: {{property_address}}

Please review and let us know if you need any additional documentation.

Thanks,
{{sender_name}}',
    TRUE, 'professional'),

  -- To Homeowner — ACV Check Reminder
  ('00000000-0000-0000-0000-000000000000'::uuid, 'insurance_acv_check_reminder',
    'To Homeowner — ACV Check Reminder',
    'Any update on the ACV payment?',
    'Hey {{first_name}},

Any update from your insurance company on the ACV check?

We can help if the adjuster needs documentation or if there are any delays.

Expected amount: ${{acv_amount}}

Let me know if you need anything!

Thanks,
{{sender_name}}',
    TRUE, 'casual'),

  -- To Insurance — Final Invoice Submission
  ('00000000-0000-0000-0000-000000000000'::uuid, 'insurance_final_invoice_submission',
    'To Insurance — Final Invoice Submission',
    'Please release depreciation funds for Claim #{{claim_number}}',
    'Hi,

Please release depreciation funds for Claim #{{claim_number}}.

Final invoice attached. All work has been completed and inspected.

Property Address: {{property_address}}
Claim Number: {{claim_number}}

Please let us know if you need any additional documentation.

Thanks,
{{sender_name}}',
    TRUE, 'professional'),

  -- To Homeowner — Depreciation Reminder
  ('00000000-0000-0000-0000-000000000000'::uuid, 'insurance_depreciation_reminder',
    'To Homeowner — Depreciation Reminder',
    'Depreciation check reminder',
    'Hey {{first_name}},

Just checking in on the depreciation check from your insurance company.

This is the final portion of your claim payment and we want to make sure you receive it.

Expected amount: ${{depreciation_amount}}

Once your insurance releases the remaining amount, we can close out the project.

If you need help following up with your adjuster, let me know!

Thanks,
{{sender_name}}',
    TRUE, 'casual')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 9 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.job_insurance_flow ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_flow_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_flow_alerts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view insurance flow in their workspace
CREATE POLICY "Users can view insurance flow in their workspace"
  ON public.job_insurance_flow FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view insurance timeline in their workspace"
  ON public.insurance_flow_timeline FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view insurance alerts in their workspace"
  ON public.insurance_flow_alerts FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can manage insurance flow in their workspace
CREATE POLICY "Users can manage insurance flow in their workspace"
  ON public.job_insurance_flow FOR ALL
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

CREATE POLICY "Users can manage insurance timeline in their workspace"
  ON public.insurance_flow_timeline FOR ALL
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

CREATE POLICY "Users can manage insurance alerts in their workspace"
  ON public.insurance_flow_alerts FOR ALL
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
-- PART 10 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_insurance_flow TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_flow_timeline TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.insurance_flow_alerts TO authenticated;

GRANT EXECUTE ON FUNCTION public.calculate_insurance_next_action(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_insurance_health_score(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_insurance_flow_alerts(uuid) TO authenticated;

-- ============================================================================
-- PART 11 — CREATE VIEW: insurance_flow_summary
-- ============================================================================
-- Convenient view showing all insurance flow data with job info

CREATE OR REPLACE VIEW public.insurance_flow_summary AS
SELECT 
  jif.*,
  rj.title as job_title,
  rj.status as job_status,
  rj.job_value,
  rj.lead_id,
  -- Calculate timeline status
  CASE 
    WHEN jif.claim_filed THEN 'Claim Filed ✓'
    ELSE 'Claim Not Filed'
  END as step_1_status,
  CASE 
    WHEN jif.adjuster_inspection_completed_date IS NOT NULL THEN 'Inspection Completed ✓'
    WHEN jif.adjuster_inspection_scheduled_date IS NOT NULL THEN 'Inspection Scheduled'
    ELSE 'Not Scheduled'
  END as step_2_status,
  CASE 
    WHEN jif.acv_received THEN 'ACV Received ✓'
    WHEN jif.acv_amount > 0 THEN 'ACV Pending'
    ELSE 'No ACV'
  END as step_3_status,
  CASE 
    WHEN jif.supplement_status = 'approved' THEN 'Supplement Approved ✓'
    WHEN jif.supplement_status = 'pending' THEN 'Supplement Pending'
    WHEN jif.supplement_status = 'denied' THEN 'Supplement Denied'
    WHEN jif.supplement_status = 'submitted' THEN 'Supplement Submitted'
    ELSE 'No Supplement'
  END as step_4_status,
  CASE 
    WHEN jif.depreciation_payment_received THEN 'Depreciation Received ✓'
    WHEN jif.depreciation_owed > 0 THEN 'Depreciation Pending'
    ELSE 'No Depreciation'
  END as step_5_status,
  CASE 
    WHEN jif.insurance_complete THEN 'Insurance Complete ✓'
    ELSE 'In Progress'
  END as step_6_status,
  -- Health score category
  CASE 
    WHEN jif.insurance_health_score >= 80 THEN '🟢 On Track'
    WHEN jif.insurance_health_score >= 60 THEN '🟡 Delays Forming'
    WHEN jif.insurance_health_score IS NOT NULL THEN '🔴 Critical Issues'
    ELSE 'Not Calculated'
  END as health_score_category,
  -- Count active alerts
  (SELECT COUNT(*) FROM public.insurance_flow_alerts 
   WHERE job_id = jif.job_id AND is_resolved = false) as active_alerts_count
FROM public.job_insurance_flow jif
JOIN public.roofing_jobs rj ON rj.id = jif.job_id;

COMMENT ON VIEW public.insurance_flow_summary IS 'Block 24500: Comprehensive view of insurance flow data with job info and calculated statuses';

-- ============================================================================
-- PART 12 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.job_insurance_flow IS 'Block 24500: Complete insurance workflow tracking for roofing jobs including ACV/RCV, supplements, depreciation, and 6-step flow';
COMMENT ON TABLE public.insurance_flow_timeline IS 'Block 24500: Visual timeline showing all insurance stages and their status';
COMMENT ON TABLE public.insurance_flow_alerts IS 'Block 24500: Early-warning alerts for insurance workflow issues';
COMMENT ON FUNCTION public.calculate_insurance_next_action IS 'Block 24500: Automatically determines what the roofer needs to do next in the insurance workflow';
COMMENT ON FUNCTION public.calculate_insurance_health_score IS 'Block 24500: Calculates insurance health score (0-100) based on workflow progress and issues';
COMMENT ON FUNCTION public.check_insurance_flow_alerts IS 'Block 24500: Creates early-warning alerts for insurance workflow issues';

