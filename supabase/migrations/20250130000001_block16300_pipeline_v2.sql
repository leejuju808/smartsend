-- =========================================================
-- Block 16300 — SmartSend Pipeline v2
-- The True Roofing Sales Pipeline: Insurance Column, Storm Column, Appointment Stage, Re-Quote Stage, Auto-Movement, Value Tracking & Lead Heat Indicators
-- =========================================================

-- ============================================================================
-- 1. UPDATE PIPELINE_STAGES TO V2 (9 Roofing-Specific Columns)
-- ============================================================================

-- First, let's create the new v2 stages for existing workspaces
-- We'll keep the old stages but add the new ones

-- Delete old default stages and create new v2 stages
DO $$
DECLARE
  v_workspace_id uuid;
BEGIN
  FOR v_workspace_id IN SELECT id FROM public.workspaces LOOP
    -- Delete old stages
    DELETE FROM public.pipeline_stages 
    WHERE workspace_id = v_workspace_id 
    AND key IN ('new', 'attempting', 'warm', 'hot', 'won', 'lost');
    
    -- Insert new v2 stages
    INSERT INTO public.pipeline_stages (workspace_id, key, label, position) VALUES
      (v_workspace_id, 'new_leads', 'New Leads', 1),
      (v_workspace_id, 'warm_leads', 'Warm Leads', 2),
      (v_workspace_id, 'hot_leads', 'Hot Leads 🔥', 3),
      (v_workspace_id, 'appointment_booked', 'Appointment Booked', 4),
      (v_workspace_id, 'inspection_completed', 'Inspection Completed', 5),
      (v_workspace_id, 'insurance_opportunity', 'Insurance Opportunity', 6),
      (v_workspace_id, 'quote_sent', 'Quote Sent', 7),
      (v_workspace_id, 'requote_revival', 'Re-Quote / Revival', 8),
      (v_workspace_id, 'not_interested', 'Not Interested', 9)
    ON CONFLICT (workspace_id, key) DO UPDATE SET
      label = EXCLUDED.label,
      position = EXCLUDED.position;
  END LOOP;
END $$;

-- Update the trigger function to create v2 stages for new workspaces
CREATE OR REPLACE FUNCTION public.create_default_pipeline_stages()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.pipeline_stages (workspace_id, key, label, position) VALUES
    (new.id, 'new_leads', 'New Leads', 1),
    (new.id, 'warm_leads', 'Warm Leads', 2),
    (new.id, 'hot_leads', 'Hot Leads 🔥', 3),
    (new.id, 'appointment_booked', 'Appointment Booked', 4),
    (new.id, 'inspection_completed', 'Inspection Completed', 5),
    (new.id, 'insurance_opportunity', 'Insurance Opportunity', 6),
    (new.id, 'quote_sent', 'Quote Sent', 7),
    (new.id, 'requote_revival', 'Re-Quote / Revival', 8),
    (new.id, 'not_interested', 'Not Interested', 9)
  ON CONFLICT (workspace_id, key) DO NOTHING;
  RETURN new;
END;
$$;

-- ============================================================================
-- 2. CREATE lead_heat_score TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.lead_heat_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Heat Score (0-100)
  heat_score integer NOT NULL DEFAULT 0 CHECK (heat_score >= 0 AND heat_score <= 100),
  heat_level text NOT NULL CHECK (heat_level IN ('hot', 'warm', 'cold')) DEFAULT 'cold',
  
  -- Score Components (for debugging/transparency)
  reply_tone_score integer DEFAULT 0 CHECK (reply_tone_score >= 0 AND reply_tone_score <= 30),
  reply_keywords_score integer DEFAULT 0 CHECK (reply_keywords_score >= 0 AND reply_keywords_score <= 20),
  storm_risk_score integer DEFAULT 0 CHECK (storm_risk_score >= 0 AND storm_risk_score <= 20),
  insurance_intent_score integer DEFAULT 0 CHECK (insurance_intent_score >= 0 AND insurance_intent_score <= 15),
  booking_clicks_score integer DEFAULT 0 CHECK (booking_clicks_score >= 0 AND booking_clicks_score <= 10),
  personalization_match_score integer DEFAULT 0 CHECK (personalization_match_score >= 0 AND personalization_match_score <= 5),
  
  -- Metadata
  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One score per contact
  UNIQUE(contact_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_lead_heat_scores_contact ON public.lead_heat_scores(contact_id);
CREATE INDEX IF NOT EXISTS idx_lead_heat_scores_workspace ON public.lead_heat_scores(workspace_id);
CREATE INDEX IF NOT EXISTS idx_lead_heat_scores_heat_score ON public.lead_heat_scores(workspace_id, heat_score DESC);
CREATE INDEX IF NOT EXISTS idx_lead_heat_scores_heat_level ON public.lead_heat_scores(workspace_id, heat_level);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_lead_heat_scores_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_lead_heat_scores_updated_at ON public.lead_heat_scores;
CREATE TRIGGER trg_set_lead_heat_scores_updated_at
  BEFORE UPDATE ON public.lead_heat_scores
  FOR EACH ROW
  EXECUTE FUNCTION public.set_lead_heat_scores_updated_at();

-- ============================================================================
-- 3. CREATE insurance_metadata TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insurance_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Insurance Detection
  has_insurance_claim boolean DEFAULT false,
  claim_number text,
  adjuster_name text,
  adjuster_phone text,
  adjuster_email text,
  claim_date date,
  claim_status text CHECK (claim_status IN ('filed', 'pending', 'approved', 'denied', 'unknown')),
  
  -- Storm-Related Insurance
  storm_related boolean DEFAULT false,
  storm_date date,
  storm_type text, -- 'hail', 'wind', 'hurricane', etc.
  
  -- Detection Sources
  detected_from_reply boolean DEFAULT false,
  detected_from_scheduler boolean DEFAULT false,
  detected_from_weather boolean DEFAULT false,
  detected_manually boolean DEFAULT false,
  
  -- Notes
  notes text,
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- One metadata record per contact
  UNIQUE(contact_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_insurance_metadata_contact ON public.insurance_metadata(contact_id);
CREATE INDEX IF NOT EXISTS idx_insurance_metadata_workspace ON public.insurance_metadata(workspace_id);
CREATE INDEX IF NOT EXISTS idx_insurance_metadata_has_claim ON public.insurance_metadata(workspace_id, has_insurance_claim) WHERE has_insurance_claim = true;
CREATE INDEX IF NOT EXISTS idx_insurance_metadata_storm_related ON public.insurance_metadata(workspace_id, storm_related) WHERE storm_related = true;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_insurance_metadata_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_insurance_metadata_updated_at ON public.insurance_metadata;
CREATE TRIGGER trg_set_insurance_metadata_updated_at
  BEFORE UPDATE ON public.insurance_metadata
  FOR EACH ROW
  EXECUTE FUNCTION public.set_insurance_metadata_updated_at();

-- ============================================================================
-- 4. ADD PIPELINE V2 COLUMNS TO CONTACTS TABLE
-- ============================================================================

ALTER TABLE public.contacts
  -- Pipeline tracking
  ADD COLUMN IF NOT EXISTS pipeline_stage_key text, -- 'new_leads', 'warm_leads', etc.
  ADD COLUMN IF NOT EXISTS moved_to_stage_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_auto_moved_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_move_reason text,
  
  -- Appointment tracking
  ADD COLUMN IF NOT EXISTS last_appointment_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_appointment_at timestamptz,
  ADD COLUMN IF NOT EXISTS total_appointments integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inspection_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS inspection_notes text,
  
  -- Quote tracking
  ADD COLUMN IF NOT EXISTS quote_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS quote_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS quote_pdf_url text,
  ADD COLUMN IF NOT EXISTS is_requote boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_quote_at timestamptz,
  
  -- Follow-up tracking
  ADD COLUMN IF NOT EXISTS follow_up_reminder_date date,
  ADD COLUMN IF NOT EXISTS last_follow_up_at timestamptz,
  
  -- Pipeline warnings
  ADD COLUMN IF NOT EXISTS pipeline_warning text, -- 'stuck_in_warm', 'quote_no_reply', etc.
  ADD COLUMN IF NOT EXISTS pipeline_warning_at timestamptz;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_pipeline_stage_key ON public.contacts(workspace_id, pipeline_stage_key) WHERE pipeline_stage_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_moved_to_stage_at ON public.contacts(workspace_id, moved_to_stage_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_next_appointment_at ON public.contacts(workspace_id, next_appointment_at) WHERE next_appointment_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_quote_sent_at ON public.contacts(workspace_id, quote_sent_at DESC) WHERE quote_sent_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_follow_up_reminder_date ON public.contacts(workspace_id, follow_up_reminder_date) WHERE follow_up_reminder_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_pipeline_warning ON public.contacts(workspace_id, pipeline_warning) WHERE pipeline_warning IS NOT NULL;

-- ============================================================================
-- 5. FUNCTION: Calculate Lead Heat Score
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calculate_lead_heat_score(
  p_contact_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_record RECORD;
  v_total_score integer := 0;
  v_reply_tone_score integer := 0;
  v_reply_keywords_score integer := 0;
  v_storm_risk_score integer := 0;
  v_insurance_intent_score integer := 0;
  v_booking_clicks_score integer := 0;
  v_personalization_match_score integer := 0;
  v_latest_reply RECORD;
  v_storm_impact RECORD;
  v_insurance_meta RECORD;
BEGIN
  -- Get contact record
  SELECT * INTO v_contact_record
  FROM public.contacts
  WHERE id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- 1. Reply Tone Score (0-30)
  -- Check latest reply for positive/urgent language
  SELECT * INTO v_latest_reply
  FROM public.inbox_messages
  WHERE contact_id = p_contact_id
    AND direction = 'in'
  ORDER BY received_at DESC
  LIMIT 1;
  
  IF v_latest_reply IS NOT NULL THEN
    -- Positive/urgent keywords boost score
    IF v_latest_reply.body_text ~* '(yes|interested|urgent|asap|soon|ready|when can|schedule|book)' THEN
      v_reply_tone_score := 20;
    ELSIF v_latest_reply.body_text ~* '(maybe|possibly|think about|consider)' THEN
      v_reply_tone_score := 10;
    END IF;
  END IF;
  
  -- 2. Reply Keywords Score (0-20)
  IF v_latest_reply IS NOT NULL THEN
    -- High-intent keywords
    IF v_latest_reply.body_text ~* '(roof|damage|leak|inspection|estimate|quote|insurance|claim|adjuster|storm|hail|wind)' THEN
      v_reply_keywords_score := 15;
    ELSIF v_latest_reply.body_text ~* '(need|want|help|problem|issue)' THEN
      v_reply_keywords_score := 8;
    END IF;
  END IF;
  
  -- 3. Storm Risk Score (0-20)
  SELECT * INTO v_storm_impact
  FROM public.contact_storm_impacts
  WHERE contact_id = p_contact_id
  ORDER BY detected_at DESC
  LIMIT 1;
  
  IF v_storm_impact IS NOT NULL THEN
    v_storm_risk_score := LEAST(v_storm_impact.storm_risk_score / 5, 20);
  END IF;
  
  -- Also check contacts.storm_risk_score
  IF v_contact_record.storm_risk_score IS NOT NULL THEN
    v_storm_risk_score := GREATEST(v_storm_risk_score, LEAST(v_contact_record.storm_risk_score / 5, 20));
  END IF;
  
  -- 4. Insurance Intent Score (0-15)
  SELECT * INTO v_insurance_meta
  FROM public.insurance_metadata
  WHERE contact_id = p_contact_id;
  
  IF v_insurance_meta IS NOT NULL THEN
    IF v_insurance_meta.has_insurance_claim THEN
      v_insurance_intent_score := 15;
    ELSIF v_insurance_meta.storm_related THEN
      v_insurance_intent_score := 10;
    END IF;
  END IF;
  
  -- Check reply for insurance keywords
  IF v_latest_reply IS NOT NULL AND v_latest_reply.body_text ~* '(insurance|claim|adjuster|coverage)' THEN
    v_insurance_intent_score := GREATEST(v_insurance_intent_score, 8);
  END IF;
  
  -- 5. Booking Clicks Score (0-10)
  -- Check if contact has clicked booking links (would need tracking table)
  -- For now, check if they have appointments
  IF v_contact_record.next_appointment_at IS NOT NULL THEN
    v_booking_clicks_score := 10;
  ELSIF v_contact_record.last_appointment_at IS NOT NULL THEN
    v_booking_clicks_score := 5;
  END IF;
  
  -- 6. Personalization Match Score (0-5)
  -- If contact has been personalized (tags, enrichment, etc.)
  IF v_contact_record.tags IS NOT NULL AND array_length(v_contact_record.tags, 1) > 0 THEN
    v_personalization_match_score := 3;
  END IF;
  
  -- Calculate total score
  v_total_score := v_reply_tone_score + v_reply_keywords_score + v_storm_risk_score + 
                   v_insurance_intent_score + v_booking_clicks_score + v_personalization_match_score;
  
  -- Cap at 100
  v_total_score := LEAST(v_total_score, 100);
  
  -- Insert or update lead_heat_scores
  INSERT INTO public.lead_heat_scores (
    contact_id,
    workspace_id,
    heat_score,
    heat_level,
    reply_tone_score,
    reply_keywords_score,
    storm_risk_score,
    insurance_intent_score,
    booking_clicks_score,
    personalization_match_score,
    last_calculated_at
  )
  VALUES (
    p_contact_id,
    v_contact_record.workspace_id,
    v_total_score,
    CASE 
      WHEN v_total_score >= 80 THEN 'hot'
      WHEN v_total_score >= 50 THEN 'warm'
      ELSE 'cold'
    END,
    v_reply_tone_score,
    v_reply_keywords_score,
    v_storm_risk_score,
    v_insurance_intent_score,
    v_booking_clicks_score,
    v_personalization_match_score,
    now()
  )
  ON CONFLICT (contact_id) DO UPDATE SET
    heat_score = EXCLUDED.heat_score,
    heat_level = EXCLUDED.heat_level,
    reply_tone_score = EXCLUDED.reply_tone_score,
    reply_keywords_score = EXCLUDED.reply_keywords_score,
    storm_risk_score = EXCLUDED.storm_risk_score,
    insurance_intent_score = EXCLUDED.insurance_intent_score,
    booking_clicks_score = EXCLUDED.booking_clicks_score,
    personalization_match_score = EXCLUDED.personalization_match_score,
    last_calculated_at = EXCLUDED.last_calculated_at;
  
  RETURN v_total_score;
END;
$$;

-- ============================================================================
-- 6. FUNCTION: Create Tasks on Pipeline Stage Movement
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_pipeline_tasks(
  p_contact_id uuid,
  p_new_stage_key text,
  p_workspace_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_record RECORD;
  v_user_id uuid;
BEGIN
  -- Get contact record
  SELECT * INTO v_contact_record
  FROM public.contacts
  WHERE id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Get workspace owner/user_id (first workspace member)
  SELECT user_id INTO v_user_id
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
  LIMIT 1;
  
  -- Create tasks based on new stage
  CASE p_new_stage_key
    WHEN 'appointment_booked' THEN
      -- Task: Prepare for Inspection
      INSERT INTO public.tasks (
        workspace_id,
        contact_id,
        assigned_to,
        title,
        description,
        type,
        status,
        due_at,
        auto_generated,
        auto_type
      )
      VALUES (
        p_workspace_id,
        p_contact_id,
        v_user_id,
        'Prepare for Inspection',
        'Review contact info and prepare inspection materials for ' || COALESCE(v_contact_record.first_name || ' ' || v_contact_record.last_name, v_contact_record.email),
        'inspection',
        'open',
        COALESCE(v_contact_record.next_appointment_at, now() + interval '1 day'),
        true,
        'pipeline_appointment_booked'
      )
      ON CONFLICT DO NOTHING;
      
    WHEN 'quote_sent' THEN
      -- Task: Follow-up on Quote in 48 hours
      INSERT INTO public.tasks (
        workspace_id,
        contact_id,
        assigned_to,
        title,
        description,
        type,
        status,
        due_at,
        auto_generated,
        auto_type
      )
      VALUES (
        p_workspace_id,
        p_contact_id,
        v_user_id,
        'Follow-up on Quote',
        'Check in with ' || COALESCE(v_contact_record.first_name || ' ' || v_contact_record.last_name, v_contact_record.email) || ' about the quote sent',
        'follow_up',
        'open',
        COALESCE(v_contact_record.quote_sent_at, now()) + interval '48 hours',
        true,
        'pipeline_quote_sent'
      )
      ON CONFLICT DO NOTHING;
      
    WHEN 'insurance_opportunity' THEN
      -- Task: Upload adjuster date / Insurance support
      INSERT INTO public.tasks (
        workspace_id,
        contact_id,
        assigned_to,
        title,
        description,
        type,
        status,
        due_at,
        auto_generated,
        auto_type
      )
      VALUES (
        p_workspace_id,
        p_contact_id,
        v_user_id,
        'Insurance Support Needed',
        'Assist ' || COALESCE(v_contact_record.first_name || ' ' || v_contact_record.last_name, v_contact_record.email) || ' with insurance claim process',
        'insurance_support',
        'open',
        now() + interval '1 day',
        true,
        'pipeline_insurance_opportunity'
      )
      ON CONFLICT DO NOTHING;
      
    WHEN 'inspection_completed' THEN
      -- Task: Send Quote / Follow-up
      INSERT INTO public.tasks (
        workspace_id,
        contact_id,
        assigned_to,
        title,
        description,
        type,
        status,
        due_at,
        auto_generated,
        auto_type
      )
      VALUES (
        p_workspace_id,
        p_contact_id,
        v_user_id,
        'Send Quote After Inspection',
        'Send quote to ' || COALESCE(v_contact_record.first_name || ' ' || v_contact_record.last_name, v_contact_record.email) || ' based on inspection',
        'send_estimate',
        'open',
        now() + interval '1 day',
        true,
        'pipeline_inspection_completed'
      )
      ON CONFLICT DO NOTHING;
      
    WHEN 'requote_revival' THEN
      -- Task: Re-engage with old quote
      INSERT INTO public.tasks (
        workspace_id,
        contact_id,
        assigned_to,
        title,
        description,
        type,
        status,
        due_at,
        auto_generated,
        auto_type
      )
      VALUES (
        p_workspace_id,
        p_contact_id,
        v_user_id,
        'Re-engage Old Quote',
        'Follow up with ' || COALESCE(v_contact_record.first_name || ' ' || v_contact_record.last_name, v_contact_record.email) || ' about previous quote',
        're_engage',
        'open',
        now() + interval '3 days',
        true,
        'pipeline_requote_revival'
      )
      ON CONFLICT DO NOTHING;
      
    ELSE
      -- No task for other stages
      NULL;
  END CASE;
END;
$$;

-- ============================================================================
-- 7. FUNCTION: Auto-Move Pipeline Stage Based on Triggers (with Task Creation)
-- ============================================================================

-- ============================================================================
-- 7. FUNCTION: Check and Set Pipeline Warnings
-- ============================================================================

CREATE OR REPLACE FUNCTION public.check_pipeline_warnings(
  p_workspace_id uuid
)
RETURNS integer -- Returns count of warnings set
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_warning_count integer := 0;
BEGIN
  -- 1. Lead stuck in Warm > 7 days
  UPDATE public.contacts
  SET
    pipeline_warning = 'stuck_in_warm',
    pipeline_warning_at = now()
  WHERE workspace_id = p_workspace_id
    AND pipeline_stage_key = 'warm_leads'
    AND moved_to_stage_at < now() - interval '7 days'
    AND (pipeline_warning IS NULL OR pipeline_warning != 'stuck_in_warm');
  
  GET DIAGNOSTICS v_warning_count = ROW_COUNT;
  
  -- 2. Quote Sent but no reply in 3 days
  UPDATE public.contacts
  SET
    pipeline_warning = 'quote_no_reply',
    pipeline_warning_at = now()
  WHERE workspace_id = p_workspace_id
    AND pipeline_stage_key = 'quote_sent'
    AND quote_sent_at < now() - interval '3 days'
    AND (last_follow_up_at IS NULL OR last_follow_up_at < quote_sent_at)
    AND (pipeline_warning IS NULL OR pipeline_warning != 'quote_no_reply');
  
  -- 3. Insurance lead not booked
  UPDATE public.contacts
  SET
    pipeline_warning = 'insurance_not_booked',
    pipeline_warning_at = now()
  WHERE workspace_id = p_workspace_id
    AND pipeline_stage_key = 'insurance_opportunity'
    AND EXISTS (
      SELECT 1 FROM public.insurance_metadata
      WHERE contact_id = contacts.id
        AND has_insurance_claim = true
    )
    AND next_appointment_at IS NULL
    AND (pipeline_warning IS NULL OR pipeline_warning != 'insurance_not_booked');
  
  -- 4. Storm-affected lead not scheduled
  UPDATE public.contacts
  SET
    pipeline_warning = 'storm_not_scheduled',
    pipeline_warning_at = now()
  WHERE workspace_id = p_workspace_id
    AND storm_risk_score >= 70
    AND next_appointment_at IS NULL
    AND moved_to_stage_at < now() - interval '3 days'
    AND (pipeline_warning IS NULL OR pipeline_warning != 'storm_not_scheduled');
  
  -- 5. Appointment missed but no recovery follow-up
  UPDATE public.contacts
  SET
    pipeline_warning = 'appointment_missed',
    pipeline_warning_at = now()
  WHERE workspace_id = p_workspace_id
    AND last_appointment_at < now() - interval '1 day'
    AND next_appointment_at IS NULL
    AND last_follow_up_at < last_appointment_at
    AND (pipeline_warning IS NULL OR pipeline_warning != 'appointment_missed');
  
  RETURN v_warning_count;
END;
$$;

-- ============================================================================
-- 8. RLS POLICIES
-- ============================================================================

ALTER TABLE public.lead_heat_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_metadata ENABLE ROW LEVEL SECURITY;

-- Lead heat scores: workspace members can view
CREATE POLICY "lead_heat_scores_select_workspace"
  ON public.lead_heat_scores
  FOR SELECT
  USING (
    exists (
      select 1 from public.workspace_members
      where workspace_id = lead_heat_scores.workspace_id
      and user_id = auth.uid()
    )
  );

-- Insurance metadata: workspace members can view
CREATE POLICY "insurance_metadata_select_workspace"
  ON public.insurance_metadata
  FOR SELECT
  USING (
    exists (
      select 1 from public.workspace_members
      where workspace_id = insurance_metadata.workspace_id
      and user_id = auth.uid()
    )
  );

-- ============================================================================
-- 9. FUNCTION: Create Tasks on Pipeline Stage Movement
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_pipeline_tasks(
  p_contact_id uuid,
  p_new_stage_key text,
  p_workspace_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_record RECORD;
  v_user_id uuid;
BEGIN
  -- Get contact record
  SELECT * INTO v_contact_record
  FROM public.contacts
  WHERE id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Get workspace owner/user_id (first workspace member)
  SELECT user_id INTO v_user_id
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
  LIMIT 1;
  
  -- Create tasks based on new stage
  CASE p_new_stage_key
    WHEN 'appointment_booked' THEN
      -- Task: Prepare for Inspection
      INSERT INTO public.tasks (
        workspace_id,
        contact_id,
        assigned_to,
        title,
        description,
        type,
        status,
        due_at,
        auto_generated,
        auto_type
      )
      VALUES (
        p_workspace_id,
        p_contact_id,
        v_user_id,
        'Prepare for Inspection',
        'Review contact info and prepare inspection materials for ' || COALESCE(v_contact_record.first_name || ' ' || v_contact_record.last_name, v_contact_record.email),
        'inspection',
        'open',
        COALESCE(v_contact_record.next_appointment_at, now() + interval '1 day'),
        true,
        'pipeline_appointment_booked'
      )
      ON CONFLICT DO NOTHING;
      
    WHEN 'quote_sent' THEN
      -- Task: Follow-up on Quote in 48 hours
      INSERT INTO public.tasks (
        workspace_id,
        contact_id,
        assigned_to,
        title,
        description,
        type,
        status,
        due_at,
        auto_generated,
        auto_type
      )
      VALUES (
        p_workspace_id,
        p_contact_id,
        v_user_id,
        'Follow-up on Quote',
        'Check in with ' || COALESCE(v_contact_record.first_name || ' ' || v_contact_record.last_name, v_contact_record.email) || ' about the quote sent',
        'follow_up',
        'open',
        COALESCE(v_contact_record.quote_sent_at, now()) + interval '48 hours',
        true,
        'pipeline_quote_sent'
      )
      ON CONFLICT DO NOTHING;
      
    WHEN 'insurance_opportunity' THEN
      -- Task: Upload adjuster date / Insurance support
      INSERT INTO public.tasks (
        workspace_id,
        contact_id,
        assigned_to,
        title,
        description,
        type,
        status,
        due_at,
        auto_generated,
        auto_type
      )
      VALUES (
        p_workspace_id,
        p_contact_id,
        v_user_id,
        'Insurance Support Needed',
        'Assist ' || COALESCE(v_contact_record.first_name || ' ' || v_contact_record.last_name, v_contact_record.email) || ' with insurance claim process',
        'insurance_support',
        'open',
        now() + interval '1 day',
        true,
        'pipeline_insurance_opportunity'
      )
      ON CONFLICT DO NOTHING;
      
    WHEN 'inspection_completed' THEN
      -- Task: Send Quote / Follow-up
      INSERT INTO public.tasks (
        workspace_id,
        contact_id,
        assigned_to,
        title,
        description,
        type,
        status,
        due_at,
        auto_generated,
        auto_type
      )
      VALUES (
        p_workspace_id,
        p_contact_id,
        v_user_id,
        'Send Quote After Inspection',
        'Send quote to ' || COALESCE(v_contact_record.first_name || ' ' || v_contact_record.last_name, v_contact_record.email) || ' based on inspection',
        'send_estimate',
        'open',
        now() + interval '1 day',
        true,
        'pipeline_inspection_completed'
      )
      ON CONFLICT DO NOTHING;
      
    WHEN 'requote_revival' THEN
      -- Task: Re-engage with old quote
      INSERT INTO public.tasks (
        workspace_id,
        contact_id,
        assigned_to,
        title,
        description,
        type,
        status,
        due_at,
        auto_generated,
        auto_type
      )
      VALUES (
        p_workspace_id,
        p_contact_id,
        v_user_id,
        'Re-engage Old Quote',
        'Follow up with ' || COALESCE(v_contact_record.first_name || ' ' || v_contact_record.last_name, v_contact_record.email) || ' about previous quote',
        're_engage',
        'open',
        now() + interval '3 days',
        true,
        'pipeline_requote_revival'
      )
      ON CONFLICT DO NOTHING;
      
    ELSE
      -- No task for other stages
      NULL;
  END CASE;
END;
$$;

-- Update auto_move_pipeline_stage to create tasks
CREATE OR REPLACE FUNCTION public.auto_move_pipeline_stage(
  p_contact_id uuid,
  p_trigger_type text, -- 'reply', 'scheduler', 'quote', 'weather', 'user_action'
  p_trigger_data jsonb DEFAULT '{}'::jsonb
)
RETURNS text -- Returns new stage key
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_contact_record RECORD;
  v_new_stage_key text;
  v_current_stage_key text;
  v_reply_text text;
  v_has_booking boolean := false;
  v_has_insurance boolean := false;
  v_has_storm boolean := false;
  v_quote_amount numeric;
BEGIN
  -- Get contact record
  SELECT * INTO v_contact_record
  FROM public.contacts
  WHERE id = p_contact_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  v_current_stage_key := COALESCE(v_contact_record.pipeline_stage_key, 'new_leads');
  
  -- Determine new stage based on trigger type
  CASE p_trigger_type
    WHEN 'reply' THEN
      -- Reply Brain triggers
      v_reply_text := COALESCE(p_trigger_data->>'reply_text', '');
      
      -- Check for booking intent
      IF v_reply_text ~* '(yes.*inspection|schedule|book|appointment|when can|available)' THEN
        v_new_stage_key := 'appointment_booked';
      -- Check for insurance
      ELSIF v_reply_text ~* '(insurance|claim|adjuster|coverage)' THEN
        v_new_stage_key := 'insurance_opportunity';
        -- Also create insurance metadata
        INSERT INTO public.insurance_metadata (
          contact_id,
          workspace_id,
          has_insurance_claim,
          detected_from_reply,
          notes
        )
        VALUES (
          p_contact_id,
          v_contact_record.workspace_id,
          true,
          true,
          'Detected from reply: ' || substring(v_reply_text, 1, 200)
        )
        ON CONFLICT (contact_id) DO UPDATE SET
          has_insurance_claim = true,
          detected_from_reply = true,
          updated_at = now();
      -- Check for yes to inspection
      ELSIF v_reply_text ~* '(yes|interested|sure|ok|okay)' THEN
        v_new_stage_key := 'appointment_booked';
      -- Check for questions (warm)
      ELSIF v_reply_text ~* '\?' THEN
        v_new_stage_key := 'warm_leads';
      -- Check for storm damage
      ELSIF v_reply_text ~* '(storm|hail|wind|damage|leak)' THEN
        v_new_stage_key := 'hot_leads';
      ELSE
        v_new_stage_key := 'warm_leads';
      END IF;
      
    WHEN 'scheduler' THEN
      -- Scheduler triggers
      IF p_trigger_data->>'action' = 'booked' THEN
        v_new_stage_key := 'appointment_booked';
      ELSIF p_trigger_data->>'action' = 'completed' THEN
        v_new_stage_key := 'inspection_completed';
      END IF;
      
    WHEN 'quote' THEN
      -- Revenue Engine triggers
      IF p_trigger_data->>'action' = 'created' THEN
        v_new_stage_key := 'quote_sent';
      ELSIF p_trigger_data->>'action' = 'revived' THEN
        v_new_stage_key := 'requote_revival';
      END IF;
      
    WHEN 'weather' THEN
      -- Weather Engine triggers
      IF (p_trigger_data->>'storm_risk_score')::integer >= 70 THEN
        v_new_stage_key := 'hot_leads';
      ELSIF (p_trigger_data->>'storm_risk_score')::integer >= 40 THEN
        v_new_stage_key := 'warm_leads';
      END IF;
      
      -- Check for insurance opportunity
      IF p_trigger_data->>'has_insurance' = 'true' THEN
        v_new_stage_key := 'insurance_opportunity';
      END IF;
      
    WHEN 'user_action' THEN
      -- User manual actions
      IF p_trigger_data->>'action' = 'sent_quote' THEN
        v_new_stage_key := 'quote_sent';
      ELSIF p_trigger_data->>'action' = 'marked_not_interested' THEN
        v_new_stage_key := 'not_interested';
      ELSIF p_trigger_data->>'action' = 'marked_inspection_complete' THEN
        v_new_stage_key := 'inspection_completed';
      END IF;
      
    ELSE
      -- Default: don't change stage
      v_new_stage_key := v_current_stage_key;
  END CASE;
  
  -- Only update if stage changed
  IF v_new_stage_key IS NOT NULL AND v_new_stage_key != v_current_stage_key THEN
    -- Get pipeline_stage_id
    UPDATE public.contacts
    SET
      pipeline_stage_key = v_new_stage_key,
      pipeline_stage_id = (
        SELECT id FROM public.pipeline_stages
        WHERE workspace_id = v_contact_record.workspace_id
          AND key = v_new_stage_key
        LIMIT 1
      ),
      moved_to_stage_at = now(),
      last_auto_moved_at = now(),
      auto_move_reason = p_trigger_type || ': ' || COALESCE(p_trigger_data->>'reason', 'auto-detected'),
      updated_at = now()
    WHERE id = p_contact_id;
    
    -- Recalculate heat score
    PERFORM public.calculate_lead_heat_score(p_contact_id);
    
    -- Create tasks for new stage
    PERFORM public.create_pipeline_tasks(
      p_contact_id,
      v_new_stage_key,
      v_contact_record.workspace_id
    );
  END IF;
  
  RETURN v_new_stage_key;
END;
$$;

-- ============================================================================
-- 10. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.lead_heat_scores IS 'Lead Heat Score (0-100) tracking for each contact. Updated automatically based on replies, storms, insurance, bookings, etc.';
COMMENT ON TABLE public.insurance_metadata IS 'Insurance claim and adjuster information for contacts. Used to identify high-value insurance jobs.';
COMMENT ON FUNCTION public.calculate_lead_heat_score IS 'Calculates and updates lead heat score (0-100) for a contact based on multiple factors.';
COMMENT ON FUNCTION public.auto_move_pipeline_stage IS 'Automatically moves a contact to the appropriate pipeline stage based on triggers (reply, scheduler, quote, weather, user_action) and creates tasks.';
COMMENT ON FUNCTION public.check_pipeline_warnings IS 'Checks for pipeline issues (stuck leads, missed appointments, etc.) and sets warning flags.';
COMMENT ON FUNCTION public.create_pipeline_tasks IS 'Creates tasks automatically when a contact moves to a new pipeline stage.';

