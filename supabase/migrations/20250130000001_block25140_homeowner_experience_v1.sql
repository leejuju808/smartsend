-- =========================================================
-- Block 25140 — SmartSend Roofing Homeowner Experience v1
-- (Homeowner Confirmations • Customer Portal Preview • Clear Communication • Trust-Building System • Smooth Job Experience)
-- =========================================================
--
-- THE HOMEOWNER EXPERIENCE ENGINE — ZERO FLUFF.
--
-- If roofers want more 5-star reviews, fewer cancellations, and smoother jobs,
-- the homeowner's experience MUST be clean, clear, predictable, and professional.
--
-- This block implements:
-- 1. Homeowner Confirmation Flow (automated messages at every stage)
-- 2. Install Day Experience (scripted + automated updates)
-- 3. Customer Portal Preview (enhanced dashboard)
-- 4. Trust-Building Features (identity verification, cleanup checklist, warranty, reviews)
-- 5. Insurance Homeowner Experience (simplified explanations)
-- 6. Homeowner Messaging Personalization (based on personality types)
-- 7. Homeowner Feedback Loop (rating system with escalation)
-- =========================================================

-- ============================================================================
-- PART 1 — HOMEOWNER CONFIRMATION FLOW TRACKING
-- ============================================================================
-- Tracks which confirmation messages have been sent to homeowners

CREATE TABLE IF NOT EXISTS public.homeowner_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  
  -- Confirmation types
  confirmation_type text NOT NULL CHECK (confirmation_type IN (
    'inspection_booked',      -- When inspection is scheduled
    'day_before_reminder',    -- Day-before inspection reminder
    'after_inspection',        -- After inspection completed
    'quote_sent',             -- When quote/estimate is sent
    'job_approved',            -- When homeowner approves job
    'install_confirmed',       -- When install is scheduled
    'install_morning',         -- Morning of install (crew on way)
    'install_midday',          -- Midday update during install
    'install_completion',      -- When install is complete
    'cleanup_checklist',       -- Cleanup checklist sent
    'warranty_delivered',      -- Warranty + final photos sent
    'review_request'           -- Review request sent
  )),
  
  -- Message details
  message_sent_at timestamptz,
  message_channel text CHECK (message_channel IN ('email', 'sms', 'both')) DEFAULT 'email',
  message_subject text,
  message_body text,
  message_template_key text, -- References email_templates.template_key
  
  -- Status
  status text CHECK (status IN ('pending', 'sent', 'failed', 'skipped')) DEFAULT 'pending',
  error_message text,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb, -- Store inspector name, crew info, etc.
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homeowner_confirmations_job_id 
  ON public.homeowner_confirmations(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_confirmations_lead_id 
  ON public.homeowner_confirmations(lead_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_confirmations_contact_id 
  ON public.homeowner_confirmations(contact_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_confirmations_type_status 
  ON public.homeowner_confirmations(confirmation_type, status);
CREATE INDEX IF NOT EXISTS idx_homeowner_confirmations_workspace 
  ON public.homeowner_confirmations(workspace_id);

COMMENT ON TABLE public.homeowner_confirmations IS 'Block 25140: Tracks homeowner confirmation messages sent at each stage of the job';

-- ============================================================================
-- PART 2 — HOMEOWNER PERSONALITY & COMMUNICATION PREFERENCES
-- ============================================================================
-- Tracks homeowner personality type for personalized messaging

CREATE TABLE IF NOT EXISTS public.homeowner_communication_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  
  -- Personality type (detected or manually set)
  personality_type text CHECK (personality_type IN (
    'direct',      -- Short texts → brief, clear messages
    'nervous',     -- Extra reassurance + clarity
    'curious',     -- More details + education
    'passive'      -- Gentle reminders + simple choices
  )),
  
  -- Communication preferences
  preferred_channel text CHECK (preferred_channel IN ('email', 'sms', 'both')) DEFAULT 'email',
  message_length_preference text CHECK (message_length_preference IN ('short', 'medium', 'detailed')) DEFAULT 'medium',
  response_speed text CHECK (response_speed IN ('fast', 'normal', 'slow')) DEFAULT 'normal',
  
  -- Detection metadata
  detection_confidence numeric(3,2) CHECK (detection_confidence >= 0 AND detection_confidence <= 1.0) DEFAULT 0.5,
  detection_method text CHECK (detection_method IN ('ai_analysis', 'manual', 'behavior_pattern')) DEFAULT 'behavior_pattern',
  last_analyzed_at timestamptz,
  
  -- Behavior patterns (for AI detection)
  behavior_signals jsonb DEFAULT '{}'::jsonb, -- e.g., {"asks_many_questions": true, "quick_replies": false}
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(contact_id)
);

CREATE INDEX IF NOT EXISTS idx_homeowner_comm_profiles_contact 
  ON public.homeowner_communication_profiles(contact_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_comm_profiles_personality 
  ON public.homeowner_communication_profiles(personality_type);
CREATE INDEX IF NOT EXISTS idx_homeowner_comm_profiles_workspace 
  ON public.homeowner_communication_profiles(workspace_id);

COMMENT ON TABLE public.homeowner_communication_profiles IS 'Block 25140: Stores homeowner personality and communication preferences for personalized messaging';

-- ============================================================================
-- PART 3 — HOMEOWNER FEEDBACK LOOP
-- ============================================================================
-- Tracks homeowner feedback and ratings

CREATE TABLE IF NOT EXISTS public.homeowner_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  
  -- Rating (1-5 stars)
  rating integer CHECK (rating >= 1 AND rating <= 5),
  
  -- Feedback text
  feedback_text text,
  feedback_category text CHECK (feedback_category IN (
    'communication',
    'timeliness',
    'quality',
    'cleanup',
    'pricing',
    'overall',
    'other'
  )),
  
  -- Status
  status text CHECK (status IN ('submitted', 'acknowledged', 'escalated', 'resolved')) DEFAULT 'submitted',
  
  -- Escalation
  escalated_at timestamptz,
  escalated_to_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  escalation_reason text,
  
  -- Response
  owner_response text,
  owner_response_at timestamptz,
  
  -- Review links (if positive feedback)
  review_links jsonb DEFAULT '{}'::jsonb, -- {"google": "url", "facebook": "url", "bbb": "url"}
  review_submitted boolean DEFAULT false,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homeowner_feedback_job_id 
  ON public.homeowner_feedback(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_feedback_contact_id 
  ON public.homeowner_feedback(contact_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_feedback_rating 
  ON public.homeowner_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_homeowner_feedback_status 
  ON public.homeowner_feedback(status);
CREATE INDEX IF NOT EXISTS idx_homeowner_feedback_workspace 
  ON public.homeowner_feedback(workspace_id);

COMMENT ON TABLE public.homeowner_feedback IS 'Block 25140: Stores homeowner feedback and ratings with escalation workflow';

-- ============================================================================
-- PART 4 — TRUST-BUILDING FEATURES
-- ============================================================================
-- Identity verification, cleanup checklist, warranty delivery tracking

CREATE TABLE IF NOT EXISTS public.homeowner_trust_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  
  -- Identity verification (who is on the job)
  project_manager_name text,
  project_manager_photo_url text,
  crew_contact_name text,
  crew_contact_phone text,
  identity_shared_at timestamptz,
  
  -- Cleanup checklist
  cleanup_checklist_sent_at timestamptz,
  cleanup_verified boolean DEFAULT false,
  cleanup_verified_at timestamptz,
  cleanup_issues_reported text, -- If homeowner reports issues
  
  -- Warranty delivery
  warranty_delivered_at timestamptz,
  warranty_document_url text,
  final_photos_sent_at timestamptz,
  final_photo_urls text[], -- Array of photo URLs
  
  -- Review request
  review_request_sent_at timestamptz,
  review_request_channel text CHECK (review_request_channel IN ('email', 'sms', 'both')),
  review_links_provided jsonb DEFAULT '{}'::jsonb, -- {"google": "url", "facebook": "url", "bbb": "url"}
  review_submitted boolean DEFAULT false,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(job_id)
);

CREATE INDEX IF NOT EXISTS idx_homeowner_trust_features_job_id 
  ON public.homeowner_trust_features(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_trust_features_workspace 
  ON public.homeowner_trust_features(workspace_id);

COMMENT ON TABLE public.homeowner_trust_features IS 'Block 25140: Tracks trust-building features (identity verification, cleanup, warranty, reviews)';

-- ============================================================================
-- PART 5 — INSURANCE HOMEOWNER EXPERIENCE TRACKING
-- ============================================================================
-- Tracks insurance-related communications sent to homeowners

CREATE TABLE IF NOT EXISTS public.homeowner_insurance_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  
  -- Communication type
  communication_type text NOT NULL CHECK (communication_type IN (
    'acv_explanation',        -- ACV explanation sent
    'depreciation_timeline',  -- Depreciation timeline explained
    'supplement_process',     -- Supplement process explained
    'adjuster_prep',          -- Adjuster appointment prep
    'check_issuance',          -- How checks get issued explained
    'insurance_update'         -- General insurance update
  )),
  
  -- Message details
  message_sent_at timestamptz,
  message_channel text CHECK (message_channel IN ('email', 'sms', 'both')) DEFAULT 'email',
  message_subject text,
  message_body text,
  message_template_key text,
  
  -- Status
  status text CHECK (status IN ('pending', 'sent', 'failed', 'skipped')) DEFAULT 'pending',
  error_message text,
  
  -- Metadata (claim info, amounts, etc.)
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homeowner_insurance_comm_job_id 
  ON public.homeowner_insurance_communications(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_insurance_comm_type 
  ON public.homeowner_insurance_communications(communication_type, status);
CREATE INDEX IF NOT EXISTS idx_homeowner_insurance_comm_workspace 
  ON public.homeowner_insurance_communications(workspace_id);

COMMENT ON TABLE public.homeowner_insurance_communications IS 'Block 25140: Tracks insurance-related communications sent to homeowners';

-- ============================================================================
-- PART 6 — CUSTOMER PORTAL ENHANCEMENTS
-- ============================================================================
-- Extend homeowner_portals table with additional features

ALTER TABLE public.homeowner_portals
  ADD COLUMN IF NOT EXISTS portal_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS portal_view_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS messages_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS document_access_enabled boolean DEFAULT true;

COMMENT ON COLUMN public.homeowner_portals.portal_viewed_at IS 'Block 25140: First time homeowner viewed portal';
COMMENT ON COLUMN public.homeowner_portals.portal_view_count IS 'Block 25140: Number of times portal has been viewed';
COMMENT ON COLUMN public.homeowner_portals.messages_enabled IS 'Block 25140: Whether homeowner can send messages via portal';
COMMENT ON COLUMN public.homeowner_portals.document_access_enabled IS 'Block 25140: Whether homeowner can access documents via portal';

-- ============================================================================
-- PART 7 — PORTAL TIMELINE EVENTS
-- ============================================================================
-- Track timeline events shown in customer portal

CREATE TABLE IF NOT EXISTS public.homeowner_portal_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  portal_id uuid REFERENCES public.homeowner_portals(id) ON DELETE CASCADE,
  
  -- Event type
  event_type text NOT NULL CHECK (event_type IN (
    'inspection_completed',
    'materials_delivered',
    'installation_started',
    'installation_finished',
    'cleanup_completed',
    'warranty_delivered',
    'payment_received',
    'status_changed',
    'crew_assigned',
    'update_posted'
  )),
  
  -- Event details
  event_title text NOT NULL,
  event_description text,
  event_date timestamptz NOT NULL DEFAULT now(),
  
  -- Visual elements
  icon_name text, -- e.g., "check", "truck", "hammer", "check-circle"
  color text, -- e.g., "green", "blue", "yellow"
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_timeline_job_id 
  ON public.homeowner_portal_timeline_events(job_id);
CREATE INDEX IF NOT EXISTS idx_portal_timeline_portal_id 
  ON public.homeowner_portal_timeline_events(portal_id);
CREATE INDEX IF NOT EXISTS idx_portal_timeline_event_date 
  ON public.homeowner_portal_timeline_events(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_portal_timeline_workspace 
  ON public.homeowner_portal_timeline_events(workspace_id);

COMMENT ON TABLE public.homeowner_portal_timeline_events IS 'Block 25140: Timeline events shown in customer portal';

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- homeowner_confirmations
ALTER TABLE public.homeowner_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homeowner_confirmations_select"
  ON public.homeowner_confirmations FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "homeowner_confirmations_insert"
  ON public.homeowner_confirmations FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "homeowner_confirmations_update"
  ON public.homeowner_confirmations FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- homeowner_communication_profiles
ALTER TABLE public.homeowner_communication_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homeowner_comm_profiles_select"
  ON public.homeowner_communication_profiles FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "homeowner_comm_profiles_insert"
  ON public.homeowner_communication_profiles FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "homeowner_comm_profiles_update"
  ON public.homeowner_communication_profiles FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- homeowner_feedback
ALTER TABLE public.homeowner_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homeowner_feedback_select"
  ON public.homeowner_feedback FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "homeowner_feedback_insert"
  ON public.homeowner_feedback FOR INSERT
  WITH CHECK (true); -- Allow public inserts (homeowners can submit feedback)

CREATE POLICY "homeowner_feedback_update"
  ON public.homeowner_feedback FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- homeowner_trust_features
ALTER TABLE public.homeowner_trust_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homeowner_trust_features_select"
  ON public.homeowner_trust_features FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "homeowner_trust_features_insert"
  ON public.homeowner_trust_features FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "homeowner_trust_features_update"
  ON public.homeowner_trust_features FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- homeowner_insurance_communications
ALTER TABLE public.homeowner_insurance_communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homeowner_insurance_comm_select"
  ON public.homeowner_insurance_communications FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "homeowner_insurance_comm_insert"
  ON public.homeowner_insurance_communications FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "homeowner_insurance_comm_update"
  ON public.homeowner_insurance_communications FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- homeowner_portal_timeline_events
ALTER TABLE public.homeowner_portal_timeline_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portal_timeline_select"
  ON public.homeowner_portal_timeline_events FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "portal_timeline_insert"
  ON public.homeowner_portal_timeline_events FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "portal_timeline_update"
  ON public.homeowner_portal_timeline_events FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id IN (
      SELECT id FROM public.workspaces 
      WHERE owner_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 9 — TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE OR REPLACE FUNCTION update_homeowner_experience_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_homeowner_confirmations_updated_at
  BEFORE UPDATE ON public.homeowner_confirmations
  FOR EACH ROW EXECUTE FUNCTION update_homeowner_experience_updated_at();

CREATE TRIGGER trg_homeowner_comm_profiles_updated_at
  BEFORE UPDATE ON public.homeowner_communication_profiles
  FOR EACH ROW EXECUTE FUNCTION update_homeowner_experience_updated_at();

CREATE TRIGGER trg_homeowner_feedback_updated_at
  BEFORE UPDATE ON public.homeowner_feedback
  FOR EACH ROW EXECUTE FUNCTION update_homeowner_experience_updated_at();

CREATE TRIGGER trg_homeowner_trust_features_updated_at
  BEFORE UPDATE ON public.homeowner_trust_features
  FOR EACH ROW EXECUTE FUNCTION update_homeowner_experience_updated_at();

CREATE TRIGGER trg_homeowner_insurance_comm_updated_at
  BEFORE UPDATE ON public.homeowner_insurance_communications
  FOR EACH ROW EXECUTE FUNCTION update_homeowner_experience_updated_at();

-- ============================================================================
-- PART 10 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.homeowner_confirmations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.homeowner_communication_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.homeowner_feedback TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.homeowner_trust_features TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.homeowner_insurance_communications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.homeowner_portal_timeline_events TO authenticated;

-- Allow public inserts for feedback (homeowners can submit via portal)
GRANT INSERT ON public.homeowner_feedback TO anon;

