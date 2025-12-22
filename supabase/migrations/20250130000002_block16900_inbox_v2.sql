-- =========================================================
-- Block 16900 — SmartSend Inbox v2
-- (Threaded Conversations, AI Triage, Next-Step Buttons, Attachment Handling, Booking Prompts, & Pipeline Sync)
-- =========================================================

-- ============================================================================
-- 1. AI REPLY ANALYSIS TABLE
-- ============================================================================
-- Stores comprehensive AI analysis for each message/thread

CREATE TABLE IF NOT EXISTS public.ai_reply_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  message_id uuid, -- References inbox_messages or similar
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Intent Classification
  intent_type text CHECK (intent_type IN (
    'yes_wants_estimate', 'yes_come_inspect', 'booking_link_clicked', 
    'insurance_claim_active', 'adjuster_coming_soon', 'has_question', 
    'wants_pricing', 'wants_availability', 'wants_more_info', 'needs_photos',
    'considering_not_sure', 'not_now_maybe_later', 'checking_around',
    'already_got_quotes', 'not_interested', 'wrong_person', 'stop_messaging',
    'urgent_roof_damage'
  )),
  intent_confidence numeric(3,2) CHECK (intent_confidence >= 0 AND intent_confidence <= 1),
  
  -- Emotional Analysis
  emotional_tone text CHECK (emotional_tone IN (
    'neutral', 'curious', 'confused', 'annoyed', 'interested', 
    'excited', 'urgent', 'frustrated', 'skeptical', 'demanding'
  )),
  tone_confidence numeric(3,2) CHECK (tone_confidence >= 0 AND tone_confidence <= 1),
  urgency_level text CHECK (urgency_level IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  
  -- Question Extraction
  extracted_questions jsonb DEFAULT '[]'::jsonb, -- Array of {question, type, confidence}
  
  -- Insurance Detection
  has_insurance_intent boolean DEFAULT false,
  insurance_keywords text[],
  insurance_confidence numeric(3,2) CHECK (insurance_confidence >= 0 AND insurance_confidence <= 1),
  
  -- Booking Detection
  has_booking_intent boolean DEFAULT false,
  booking_confidence numeric(3,2) CHECK (booking_confidence >= 0 AND booking_confidence <= 1),
  
  -- Storm Damage Detection
  has_storm_damage boolean DEFAULT false,
  storm_keywords text[],
  urgency_score numeric(3,2) CHECK (urgency_score >= 0 AND urgency_score <= 1),
  
  -- Objections
  has_objection boolean DEFAULT false,
  objection_type text CHECK (objection_type IN (
    'price_too_high', 'getting_other_quotes', 'not_needed', 
    'wrong_person', 'timing', 'competitor', 'other'
  )),
  objection_text text,
  
  -- Job Type Guess
  job_type_guess text, -- e.g., 'full_roof_replacement', 'repair', 'inspection', 'insurance_claim'
  
  -- Next-Step Recommendations
  suggested_actions jsonb DEFAULT '[]'::jsonb, -- Array of {action, priority, reasoning}
  suggested_reply_templates text[],
  suggested_pipeline_stage text CHECK (suggested_pipeline_stage IN ('HOT', 'WARM', 'COLD', 'NOT_INTERESTED')),
  
  -- Tags
  suggested_tags text[],
  
  -- Reasoning
  reasoning text,
  
  -- Metadata
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_reply_analysis_thread ON public.ai_reply_analysis(thread_id);
CREATE INDEX IF NOT EXISTS idx_ai_reply_analysis_contact ON public.ai_reply_analysis(contact_id);
CREATE INDEX IF NOT EXISTS idx_ai_reply_analysis_workspace ON public.ai_reply_analysis(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ai_reply_analysis_intent ON public.ai_reply_analysis(intent_type);
CREATE INDEX IF NOT EXISTS idx_ai_reply_analysis_insurance ON public.ai_reply_analysis(has_insurance_intent) WHERE has_insurance_intent = true;
CREATE INDEX IF NOT EXISTS idx_ai_reply_analysis_booking ON public.ai_reply_analysis(has_booking_intent) WHERE has_booking_intent = true;
CREATE INDEX IF NOT EXISTS idx_ai_reply_analysis_storm ON public.ai_reply_analysis(has_storm_damage) WHERE has_storm_damage = true;

-- ============================================================================
-- 2. INBOX SUGGESTIONS TABLE
-- ============================================================================
-- Stores AI-generated suggestions for replies and actions

CREATE TABLE IF NOT EXISTS public.inbox_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Suggested Replies (Top 3)
  suggested_replies jsonb DEFAULT '[]'::jsonb, -- Array of {text, type, confidence}
  
  -- Pipeline Actions
  suggested_pipeline_stage text CHECK (suggested_pipeline_stage IN (
    'warm', 'hot', 'appointment', 'insurance', 're_quote', 'not_interested'
  )),
  
  -- Task Suggestions
  suggested_tasks jsonb DEFAULT '[]'::jsonb, -- Array of {title, due_date, priority}
  
  -- Booking Suggestions
  booking_suggestions jsonb DEFAULT '[]'::jsonb, -- Array of {time, date, type}
  
  -- Insurance Actions
  insurance_actions jsonb DEFAULT '[]'::jsonb, -- Array of {action, template}
  
  -- Storm Actions
  storm_actions jsonb DEFAULT '[]'::jsonb, -- Array of {action, template, urgency}
  
  -- Metadata
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inbox_suggestions_thread ON public.inbox_suggestions(thread_id);
CREATE INDEX IF NOT EXISTS idx_inbox_suggestions_contact ON public.inbox_suggestions(contact_id);
CREATE INDEX IF NOT EXISTS idx_inbox_suggestions_workspace ON public.inbox_suggestions(workspace_id);

-- ============================================================================
-- 3. ENHANCE INBOX_THREADS TABLE
-- ============================================================================
-- Add columns for v2 features

ALTER TABLE IF EXISTS public.inbox_threads
  ADD COLUMN IF NOT EXISTS pipeline_stage_key text,
  ADD COLUMN IF NOT EXISTS lead_heat_score integer CHECK (lead_heat_score >= 0 AND lead_heat_score <= 100),
  ADD COLUMN IF NOT EXISTS has_storm_damage boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_insurance_claim boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_appointment boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_quote boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority_color text CHECK (priority_color IN ('red', 'orange', 'yellow', 'green', 'blue')) DEFAULT 'blue',
  ADD COLUMN IF NOT EXISTS last_message_snippet text,
  ADD COLUMN IF NOT EXISTS homeowner_name text;

CREATE INDEX IF NOT EXISTS idx_inbox_threads_pipeline_stage ON public.inbox_threads(pipeline_stage_key);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_heat_score ON public.inbox_threads(lead_heat_score DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_threads_storm ON public.inbox_threads(has_storm_damage) WHERE has_storm_damage = true;
CREATE INDEX IF NOT EXISTS idx_inbox_threads_insurance ON public.inbox_threads(has_insurance_claim) WHERE has_insurance_claim = true;
CREATE INDEX IF NOT EXISTS idx_inbox_threads_appointment ON public.inbox_threads(has_appointment) WHERE has_appointment = true;

-- ============================================================================
-- 4. MESSAGE ATTACHMENTS TABLE
-- ============================================================================
-- Store attachments for messages

CREATE TABLE IF NOT EXISTS public.message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL, -- References inbox_messages or similar
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  file_name text NOT NULL,
  file_type text NOT NULL, -- 'photo', 'video', 'pdf', 'insurance_doc', 'roof_image'
  file_url text NOT NULL,
  file_size integer, -- bytes
  mime_type text,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_attachments_message ON public.message_attachments(message_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_thread ON public.message_attachments(thread_id);
CREATE INDEX IF NOT EXISTS idx_message_attachments_workspace ON public.message_attachments(workspace_id);

-- ============================================================================
-- 5. EMAIL DELIVERABILITY STATUS TABLE
-- ============================================================================
-- Track email delivery status for sent messages

CREATE TABLE IF NOT EXISTS public.email_deliverability_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  status text NOT NULL CHECK (status IN ('delivered', 'opened', 'link_clicked', 'bounced', 'marked_spam', 'queued', 'sent')),
  status_updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Provider-specific data
  provider text, -- 'resend', 'mailgun', 'sendgrid', etc.
  provider_message_id text,
  provider_event_data jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_deliverability_message ON public.email_deliverability_status(message_id);
CREATE INDEX IF NOT EXISTS idx_email_deliverability_thread ON public.email_deliverability_status(thread_id);
CREATE INDEX IF NOT EXISTS idx_email_deliverability_workspace ON public.email_deliverability_status(workspace_id);
CREATE INDEX IF NOT EXISTS idx_email_deliverability_status ON public.email_deliverability_status(status);

-- ============================================================================
-- 6. FUNCTION: Update Thread Metadata from Analysis
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_thread_from_analysis(
  p_thread_id uuid,
  p_analysis_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_analysis RECORD;
  v_thread RECORD;
BEGIN
  -- Get analysis
  SELECT * INTO v_analysis
  FROM public.ai_reply_analysis
  WHERE id = p_analysis_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Get thread
  SELECT * INTO v_thread
  FROM public.inbox_threads
  WHERE id = p_thread_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Update thread with analysis insights
  UPDATE public.inbox_threads
  SET
    has_storm_damage = COALESCE(v_analysis.has_storm_damage, false),
    has_insurance_claim = COALESCE(v_analysis.has_insurance_intent, false),
    priority_color = CASE
      WHEN v_analysis.urgency_level = 'critical' THEN 'red'
      WHEN v_analysis.urgency_level = 'high' THEN 'orange'
      WHEN v_analysis.has_booking_intent THEN 'yellow'
      ELSE 'blue'
    END,
    updated_at = now()
  WHERE id = p_thread_id;
END;
$$;

-- ============================================================================
-- 7. FUNCTION: Auto-create Tasks from Analysis
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_tasks_from_analysis(
  p_analysis_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_analysis RECORD;
  v_suggestion RECORD;
  v_task_title text;
  v_task_due_date timestamptz;
BEGIN
  -- Get analysis
  SELECT * INTO v_analysis
  FROM public.ai_reply_analysis
  WHERE id = p_analysis_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  -- Create task for urgent storm damage
  IF v_analysis.has_storm_damage AND v_analysis.urgency_score > 0.7 THEN
    v_task_title := 'URGENT: Storm damage detected - Schedule inspection ASAP';
    v_task_due_date := now() + interval '2 hours';
    
    -- Insert task (assuming tasks table exists)
    INSERT INTO public.tasks (
      workspace_id,
      contact_id,
      title,
      due_date,
      priority,
      task_type,
      created_at
    )
    VALUES (
      v_analysis.workspace_id,
      v_analysis.contact_id,
      v_task_title,
      v_task_due_date,
      'urgent',
      'follow_up',
      now()
    )
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Create task for insurance claim
  IF v_analysis.has_insurance_intent AND v_analysis.insurance_confidence > 0.7 THEN
    v_task_title := 'Insurance claim detected - Prepare adjuster materials';
    v_task_due_date := now() + interval '1 day';
    
    INSERT INTO public.tasks (
      workspace_id,
      contact_id,
      title,
      due_date,
      priority,
      task_type,
      created_at
    )
    VALUES (
      v_analysis.workspace_id,
      v_analysis.contact_id,
      v_task_title,
      v_task_due_date,
      'high',
      'insurance',
      now()
    )
    ON CONFLICT DO NOTHING;
  END IF;
  
  -- Create task for booking intent
  IF v_analysis.has_booking_intent AND v_analysis.booking_confidence > 0.7 THEN
    v_task_title := 'Ready to book - Offer inspection times';
    v_task_due_date := now() + interval '4 hours';
    
    INSERT INTO public.tasks (
      workspace_id,
      contact_id,
      title,
      due_date,
      priority,
      task_type,
      created_at
    )
    VALUES (
      v_analysis.workspace_id,
      v_analysis.contact_id,
      v_task_title,
      v_task_due_date,
      'high',
      'booking',
      now()
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- ============================================================================
-- 8. TRIGGER: Auto-update thread when analysis is created
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trigger_update_thread_from_analysis()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.thread_id IS NOT NULL THEN
    PERFORM public.update_thread_from_analysis(NEW.thread_id, NEW.id);
    PERFORM public.create_tasks_from_analysis(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_thread_from_analysis ON public.ai_reply_analysis;
CREATE TRIGGER trg_update_thread_from_analysis
  AFTER INSERT ON public.ai_reply_analysis
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_update_thread_from_analysis();

-- ============================================================================
-- 9. RLS POLICIES
-- ============================================================================

ALTER TABLE public.ai_reply_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_deliverability_status ENABLE ROW LEVEL SECURITY;

-- RLS policies (workspace-scoped)
DROP POLICY IF EXISTS "ai_reply_analysis_workspace_access" ON public.ai_reply_analysis;
CREATE POLICY "ai_reply_analysis_workspace_access" ON public.ai_reply_analysis
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "inbox_suggestions_workspace_access" ON public.inbox_suggestions;
CREATE POLICY "inbox_suggestions_workspace_access" ON public.inbox_suggestions
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "message_attachments_workspace_access" ON public.message_attachments;
CREATE POLICY "message_attachments_workspace_access" ON public.message_attachments
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "email_deliverability_workspace_access" ON public.email_deliverability_status;
CREATE POLICY "email_deliverability_workspace_access" ON public.email_deliverability_status
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- 10. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.ai_reply_analysis IS 'Comprehensive AI analysis of homeowner replies including intent, tone, questions, insurance, booking, storm damage, and next-step recommendations';
COMMENT ON TABLE public.inbox_suggestions IS 'AI-generated suggestions for replies, pipeline actions, tasks, booking times, and insurance/storm actions';
COMMENT ON TABLE public.message_attachments IS 'File attachments for inbox messages (photos, videos, PDFs, insurance docs, roof images)';
COMMENT ON TABLE public.email_deliverability_status IS 'Email delivery status tracking (delivered, opened, clicked, bounced, spam) for sent messages';
COMMENT ON FUNCTION public.update_thread_from_analysis IS 'Updates thread metadata based on AI analysis results';
COMMENT ON FUNCTION public.create_tasks_from_analysis IS 'Automatically creates tasks based on AI analysis (storm damage, insurance, booking intent)';





















































