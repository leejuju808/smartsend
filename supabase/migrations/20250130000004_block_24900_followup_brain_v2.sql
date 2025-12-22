-- ============================================================================
-- Block 24900 — SmartSend Roofing Follow-Up Brain v2
-- (Adaptive Follow-Up • NLP Reply Understanding • Hot Lead Activation • 
--  Personality-Based Sequences • True AI Follow-Up That Books More Roofing Jobs)
-- ============================================================================

-- ============================================================================
-- 1. NLP REPLY DETECTION TABLE
-- ============================================================================
-- Stores detailed NLP classification of every homeowner reply
-- 5 Types: hot_lead, warm_lead, not_ready, objection, not_interested

CREATE TABLE IF NOT EXISTS followup_nlp_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  email_reply_id UUID, -- Reference to email_replies if available
  email_log_id UUID,   -- Reference to email_logs if available
  detection_type TEXT NOT NULL CHECK (detection_type IN (
    'hot_lead',
    'warm_lead', 
    'not_ready',
    'objection',
    'not_interested'
  )),
  confidence_score DECIMAL(3,2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  detected_phrases TEXT[], -- Array of phrases that triggered detection
  detected_intent TEXT,     -- More specific intent (e.g., "urgent_leak", "price_question")
  homeowner_tone TEXT,      -- 'decisive', 'nervous', 'logical', 'curious', 'frustrated'
  urgency_level INTEGER CHECK (urgency_level >= 1 AND urgency_level <= 10),
  extracted_info JSONB DEFAULT '{}'::jsonb, -- Store any extracted details (dates, prices, etc.)
  raw_reply_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followup_nlp_lead_id ON followup_nlp_detections(lead_id);
CREATE INDEX IF NOT EXISTS idx_followup_nlp_type ON followup_nlp_detections(detection_type);
CREATE INDEX IF NOT EXISTS idx_followup_nlp_created ON followup_nlp_detections(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_followup_nlp_hot_leads ON followup_nlp_detections(lead_id, detection_type) 
  WHERE detection_type = 'hot_lead';

-- ============================================================================
-- 2. ADAPTIVE FOLLOW-UP MODES TABLE
-- ============================================================================
-- Tracks which follow-up mode to use for each lead based on personality/tone

CREATE TABLE IF NOT EXISTS followup_modes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  mode_type TEXT NOT NULL CHECK (mode_type IN (
    'direct',      -- Short, fast, no fluff (decisive homeowners)
    'reassurance', -- Warm, comforting, educational (nervous homeowners)
    'authority',   -- Professional, detailed, proof-driven (logical homeowners)
    'revival'      -- Curiosity-based (unresponsive homeowners)
  )),
  personality_profile JSONB DEFAULT '{}'::jsonb, -- Store personality traits
  tone_history TEXT[], -- History of detected tones
  mode_confidence DECIMAL(3,2) CHECK (mode_confidence >= 0 AND mode_confidence <= 1),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_followup_modes_lead_unique ON followup_modes(lead_id);
CREATE INDEX IF NOT EXISTS idx_followup_modes_type ON followup_modes(mode_type);

-- ============================================================================
-- 3. HOT LEAD ACTIVATION LOG
-- ============================================================================
-- Tracks when hot leads are detected and what actions were taken

CREATE TABLE IF NOT EXISTS hot_lead_activations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  detection_id UUID REFERENCES followup_nlp_detections(id) ON DELETE SET NULL,
  activation_trigger TEXT NOT NULL, -- What triggered activation (e.g., "urgent_leak", "asap_request")
  notification_sent BOOLEAN DEFAULT FALSE,
  owner_notified_at TIMESTAMPTZ,
  rep_notified_at TIMESTAMPTZ,
  auto_reply_sent BOOLEAN DEFAULT FALSE,
  auto_reply_sent_at TIMESTAMPTZ,
  priority_tagged BOOLEAN DEFAULT FALSE,
  booking_prompt_sent BOOLEAN DEFAULT FALSE,
  actions_taken JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hot_lead_activations_lead_id ON hot_lead_activations(lead_id);
CREATE INDEX IF NOT EXISTS idx_hot_lead_activations_created ON hot_lead_activations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hot_lead_activations_pending ON hot_lead_activations(lead_id) 
  WHERE notification_sent = FALSE;

-- ============================================================================
-- 4. BEHAVIOR-ADAPTIVE TIMING TRACKER
-- ============================================================================
-- Tracks homeowner behavior patterns for optimal timing

CREATE TABLE IF NOT EXISTS homeowner_behavior_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  open_times TIMESTAMPTZ[], -- Array of email open timestamps
  reply_times TIMESTAMPTZ[], -- Array of reply timestamps
  avg_reply_delay_hours DECIMAL(5,2), -- Average hours between email and reply
  preferred_hours INTEGER[], -- Preferred hours of day (0-23)
  preferred_days INTEGER[], -- Preferred days of week (0-6, Sunday=0)
  timezone TEXT,
  last_activity_at TIMESTAMPTZ,
  behavior_score DECIMAL(3,2) CHECK (behavior_score >= 0 AND behavior_score <= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_behavior_patterns_lead_unique ON homeowner_behavior_patterns(lead_id);
CREATE INDEX IF NOT EXISTS idx_behavior_patterns_last_activity ON homeowner_behavior_patterns(last_activity_at DESC);

-- ============================================================================
-- 5. FOLLOW-UP SEQUENCES TABLE
-- ============================================================================
-- Defines the 4 sequence types: Inspection Booking, Quote Follow-Up, 
-- Insurance Nurture, Dormant Lead Revival

CREATE TABLE IF NOT EXISTS followup_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID, -- NULL = global default
  sequence_type TEXT NOT NULL CHECK (sequence_type IN (
    'inspection_booking',
    'quote_followup',
    'insurance_nurture',
    'dormant_revival'
  )),
  sequence_name TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  delay_hours INTEGER NOT NULL DEFAULT 0, -- Hours to wait before sending this step
  template_key TEXT, -- Reference to email_templates.template_key
  subject_template TEXT,
  body_template TEXT,
  conditions JSONB DEFAULT '{}'::jsonb, -- Conditions for when to send this step
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followup_sequences_type ON followup_sequences(sequence_type);
CREATE INDEX IF NOT EXISTS idx_followup_sequences_workspace ON followup_sequences(workspace_id);
CREATE INDEX IF NOT EXISTS idx_followup_sequences_order ON followup_sequences(sequence_type, step_order);

-- ============================================================================
-- 6. FOLLOW-UP SEQUENCE EXECUTION LOG
-- ============================================================================
-- Tracks which sequence steps have been sent to which leads

CREATE TABLE IF NOT EXISTS followup_sequence_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  sequence_id UUID NOT NULL REFERENCES followup_sequences(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  email_log_id UUID, -- Reference to email_logs if sent
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'skipped', 'cancelled')),
  skip_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sequence_executions_lead ON followup_sequence_executions(lead_id);
CREATE INDEX IF NOT EXISTS idx_sequence_executions_scheduled ON followup_sequence_executions(scheduled_for) 
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_sequence_executions_sequence ON followup_sequence_executions(sequence_id);

-- ============================================================================
-- 7. NLP OBJECTION HANDLING TABLE
-- ============================================================================
-- Stores detected objections and auto-generated replies

CREATE TABLE IF NOT EXISTS objection_handling (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  detection_id UUID REFERENCES followup_nlp_detections(id) ON DELETE SET NULL,
  objection_type TEXT NOT NULL CHECK (objection_type IN (
    'price_too_high',
    'already_have_contractor',
    'not_now',
    'maybe_later',
    'insurance_delay',
    'other'
  )),
  objection_text TEXT,
  auto_reply_generated TEXT,
  auto_reply_sent BOOLEAN DEFAULT FALSE,
  auto_reply_sent_at TIMESTAMPTZ,
  email_log_id UUID, -- Reference to email_logs if reply was sent
  handled BOOLEAN DEFAULT FALSE,
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_objection_handling_lead ON objection_handling(lead_id);
CREATE INDEX IF NOT EXISTS idx_objection_handling_type ON objection_handling(objection_type);
CREATE INDEX IF NOT EXISTS idx_objection_handling_unhandled ON objection_handling(lead_id) 
  WHERE handled = FALSE;

-- ============================================================================
-- 8. FOLLOW-UP PRIORITY STACK
-- ============================================================================
-- Organizes leads into 4 urgency tiers

CREATE TABLE IF NOT EXISTS followup_priority_stack (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  priority_tier INTEGER NOT NULL CHECK (priority_tier IN (1, 2, 3, 4)),
  -- Tier 1: HOT LEADS (needs immediate follow-up)
  -- Tier 2: WARM LEADS (needs nurturing)
  -- Tier 3: INSURANCE LEADS (needs steady check-ins)
  -- Tier 4: DORMANT LEADS (needs revival)
  tier_reason TEXT, -- Why this lead is in this tier
  priority_score DECIMAL(5,2) CHECK (priority_score >= 0 AND priority_score <= 100),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_priority_stack_lead_unique ON followup_priority_stack(lead_id);
CREATE INDEX IF NOT EXISTS idx_priority_stack_tier ON followup_priority_stack(priority_tier, priority_score DESC);
CREATE INDEX IF NOT EXISTS idx_priority_stack_hot ON followup_priority_stack(lead_id) 
  WHERE priority_tier = 1;

-- ============================================================================
-- 9. FOLLOW-UP BRAIN SCORE (DIAGNOSTICS)
-- ============================================================================
-- Tracks follow-up effectiveness metrics per workspace/lead

CREATE TABLE IF NOT EXISTS followup_brain_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  score_period_start TIMESTAMPTZ NOT NULL,
  score_period_end TIMESTAMPTZ NOT NULL,
  overall_score DECIMAL(5,2) CHECK (overall_score >= 0 AND overall_score <= 100),
  avg_reply_time_minutes DECIMAL(6,2),
  auto_followups_sent INTEGER DEFAULT 0,
  hot_leads_caught INTEGER DEFAULT 0,
  missed_leads INTEGER DEFAULT 0,
  reply_rate DECIMAL(5,2), -- Percentage
  conversion_rate DECIMAL(5,2), -- Percentage
  metrics JSONB DEFAULT '{}'::jsonb, -- Additional metrics
  alerts JSONB DEFAULT '[]'::jsonb, -- Array of alert messages
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followup_scores_workspace ON followup_brain_scores(workspace_id);
CREATE INDEX IF NOT EXISTS idx_followup_scores_lead ON followup_brain_scores(lead_id);
CREATE INDEX IF NOT EXISTS idx_followup_scores_period ON followup_brain_scores(score_period_start, score_period_end);

-- ============================================================================
-- 10. MOMENTUM TRACKING
-- ============================================================================
-- Tracks conversation momentum to determine when to escalate or back off

CREATE TABLE IF NOT EXISTS conversation_momentum (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  momentum_score DECIMAL(3,2) CHECK (momentum_score >= 0 AND momentum_score <= 1),
  -- 0.0 = cold/dead, 0.5 = neutral, 1.0 = hot/active
  trend_direction TEXT CHECK (trend_direction IN ('increasing', 'decreasing', 'stable')),
  last_interaction_at TIMESTAMPTZ,
  interaction_count INTEGER DEFAULT 0,
  reply_velocity DECIMAL(5,2), -- Replies per day
  engagement_level TEXT CHECK (engagement_level IN ('high', 'medium', 'low', 'none')),
  next_action_recommended TEXT, -- What SmartSend recommends next
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_momentum_lead_unique ON conversation_momentum(lead_id);
CREATE INDEX IF NOT EXISTS idx_momentum_score ON conversation_momentum(momentum_score DESC);
CREATE INDEX IF NOT EXISTS idx_momentum_high_engagement ON conversation_momentum(lead_id) 
  WHERE engagement_level IN ('high', 'medium');

-- ============================================================================
-- 11. HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate optimal send time based on behavior patterns
CREATE OR REPLACE FUNCTION calculate_optimal_send_time(p_lead_id UUID)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_pattern homeowner_behavior_patterns%ROWTYPE;
  v_preferred_hour INTEGER;
  v_preferred_day INTEGER;
  v_base_time TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO v_pattern
  FROM homeowner_behavior_patterns
  WHERE lead_id = p_lead_id;
  
  IF NOT FOUND THEN
    -- Default: send in 2 hours during business hours (9 AM - 5 PM)
    RETURN (v_base_time + INTERVAL '2 hours');
  END IF;
  
  -- Use preferred hours if available
  IF array_length(v_pattern.preferred_hours, 1) > 0 THEN
    v_preferred_hour := v_pattern.preferred_hours[1];
    -- Set to next occurrence of preferred hour
    RETURN date_trunc('day', v_base_time) + (v_preferred_hour || ' hours')::interval;
  END IF;
  
  -- Default: add average delay or 2 hours
  IF v_pattern.avg_reply_delay_hours IS NOT NULL THEN
    RETURN v_base_time + (v_pattern.avg_reply_delay_hours || ' hours')::interval;
  END IF;
  
  RETURN v_base_time + INTERVAL '2 hours';
END;
$$ LANGUAGE plpgsql;

-- Function to update priority tier based on latest detection
CREATE OR REPLACE FUNCTION update_lead_priority_tier(p_lead_id UUID)
RETURNS VOID AS $$
DECLARE
  v_latest_detection followup_nlp_detections%ROWTYPE;
  v_new_tier INTEGER;
  v_reason TEXT;
BEGIN
  -- Get latest detection
  SELECT * INTO v_latest_detection
  FROM followup_nlp_detections
  WHERE lead_id = p_lead_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  IF NOT FOUND THEN
    -- No detection yet, default to tier 4 (dormant)
    v_new_tier := 4;
    v_reason := 'No reply detected yet';
  ELSE
    -- Determine tier based on detection type
    CASE v_latest_detection.detection_type
      WHEN 'hot_lead' THEN
        v_new_tier := 1;
        v_reason := 'Hot lead detected: ' || COALESCE(v_latest_detection.detected_intent, 'urgent');
      WHEN 'warm_lead' THEN
        v_new_tier := 2;
        v_reason := 'Warm lead: ' || COALESCE(v_latest_detection.detected_intent, 'interested');
      WHEN 'not_ready' THEN
        v_new_tier := 3;
        v_reason := 'Waiting: ' || COALESCE(v_latest_detection.detected_intent, 'insurance/not ready');
      WHEN 'objection' THEN
        v_new_tier := 2; -- Still warm, needs handling
        v_reason := 'Objection detected: ' || COALESCE(v_latest_detection.detected_intent, 'needs response');
      WHEN 'not_interested' THEN
        v_new_tier := 4;
        v_reason := 'Not interested';
      ELSE
        v_new_tier := 4;
        v_reason := 'Unknown';
    END CASE;
  END IF;
  
  -- Upsert priority stack
  INSERT INTO followup_priority_stack (lead_id, priority_tier, tier_reason, priority_score, last_updated_at)
  VALUES (
    p_lead_id,
    v_new_tier,
    v_reason,
    CASE v_new_tier
      WHEN 1 THEN 90.0
      WHEN 2 THEN 60.0
      WHEN 3 THEN 40.0
      WHEN 4 THEN 20.0
    END,
    now()
  )
  ON CONFLICT (lead_id) DO UPDATE SET
    priority_tier = EXCLUDED.priority_tier,
    tier_reason = EXCLUDED.tier_reason,
    priority_score = EXCLUDED.priority_score,
    last_updated_at = EXCLUDED.last_updated_at;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 12. TRIGGERS
-- ============================================================================

-- Auto-update priority tier when new detection is created
CREATE OR REPLACE FUNCTION trigger_update_priority_on_detection()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM update_lead_priority_tier(NEW.lead_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_priority_on_detection ON followup_nlp_detections;
CREATE TRIGGER trg_update_priority_on_detection
  AFTER INSERT ON followup_nlp_detections
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_priority_on_detection();

-- ============================================================================
-- 13. RLS POLICIES
-- ============================================================================

ALTER TABLE followup_nlp_detections ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_modes ENABLE ROW LEVEL SECURITY;
ALTER TABLE hot_lead_activations ENABLE ROW LEVEL SECURITY;
ALTER TABLE homeowner_behavior_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_sequence_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE objection_handling ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_priority_stack ENABLE ROW LEVEL SECURITY;
ALTER TABLE followup_brain_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_momentum ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "service_role_all_access" ON followup_nlp_detections FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_access" ON followup_modes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_access" ON hot_lead_activations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_access" ON homeowner_behavior_patterns FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_access" ON followup_sequences FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_access" ON followup_sequence_executions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_access" ON objection_handling FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_access" ON followup_priority_stack FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_access" ON followup_brain_scores FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_access" ON conversation_momentum FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Workspace members can view their workspace data
CREATE POLICY "workspace_members_view" ON followup_nlp_detections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE l.id = followup_nlp_detections.lead_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_view" ON followup_modes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE l.id = followup_modes.lead_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_view" ON hot_lead_activations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE l.id = hot_lead_activations.lead_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_view" ON homeowner_behavior_patterns FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE l.id = homeowner_behavior_patterns.lead_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_view" ON followup_sequences FOR SELECT
  USING (
    workspace_id IS NULL OR
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = followup_sequences.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_view" ON followup_sequence_executions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE l.id = followup_sequence_executions.lead_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_view" ON objection_handling FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE l.id = objection_handling.lead_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_view" ON followup_priority_stack FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE l.id = followup_priority_stack.lead_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_view" ON followup_brain_scores FOR SELECT
  USING (
    workspace_id IS NULL OR
    EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = followup_brain_scores.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_view" ON conversation_momentum FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE l.id = conversation_momentum.lead_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- 14. SEED DEFAULT FOLLOW-UP SEQUENCES
-- ============================================================================

-- Inspection Booking Sequence
INSERT INTO followup_sequences (sequence_type, sequence_name, step_order, delay_hours, template_key, subject_template, body_template)
VALUES
  ('inspection_booking', 'Inspection Booking - Step 1', 1, 0, 'hot_lead_response', 
   'Perfect — let''s get you booked', 
   'Thanks for getting back to me! Want morning or afternoon?'),
  ('inspection_booking', 'Inspection Booking - Step 2', 2, 24, NULL,
   'We''re opening tomorrow afternoon — want that spot?',
   'We have an opening tomorrow afternoon. Want me to save that spot for you?'),
  ('inspection_booking', 'Inspection Booking - Step 3', 3, 48, NULL,
   'Before weather hits next week, we can take a look',
   'Before weather hits next week, we can take a look. What works best for you?')
ON CONFLICT DO NOTHING;

-- Quote Follow-Up Sequence
INSERT INTO followup_sequences (sequence_type, sequence_name, step_order, delay_hours, template_key, subject_template, body_template)
VALUES
  ('quote_followup', 'Quote Follow-Up - Step 1', 1, 24, NULL,
   'Any questions about the options?',
   'Any questions about the quote options I sent? Happy to walk through anything.'),
  ('quote_followup', 'Quote Follow-Up - Step 2', 2, 72, NULL,
   'Want me to compare your insurance estimate with ours?',
   'Want me to compare your insurance estimate with ours? I can help make sure everything is covered.'),
  ('quote_followup', 'Quote Follow-Up - Step 3', 3, 168, NULL,
   'We can lock in pricing for 7 days if helpful',
   'We can lock in pricing for 7 days if helpful. Let me know if you want to move forward.')
ON CONFLICT DO NOTHING;

-- Insurance Nurture Sequence
INSERT INTO followup_sequences (sequence_type, sequence_name, step_order, delay_hours, template_key, subject_template, body_template)
VALUES
  ('insurance_nurture', 'Insurance Nurture - Step 1', 1, 168, NULL,
   'Any update from adjuster?',
   'Any update from your insurance adjuster? We can help if there are delays.'),
  ('insurance_nurture', 'Insurance Nurture - Step 2', 2, 336, NULL,
   'We can help with documentation if needed',
   'We can help with documentation if needed. Want me to review what you have?'),
  ('insurance_nurture', 'Insurance Nurture - Step 3', 3, 504, NULL,
   'Want us to call the insurance company with you?',
   'Want us to call the insurance company with you? Sometimes a quick call speeds things up.')
ON CONFLICT DO NOTHING;

-- Dormant Lead Revival Sequence
INSERT INTO followup_sequences (sequence_type, sequence_name, step_order, delay_hours, template_key, subject_template, body_template)
VALUES
  ('dormant_revival', 'Dormant Revival - Step 1', 1, 0, NULL,
   'Still need help with your roof?',
   'Still need help with your roof? We''re doing free inspections this week.'),
  ('dormant_revival', 'Dormant Revival - Step 2', 2, 168, NULL,
   'We''re doing free inspections this week',
   'We''re doing free inspections this week. Want me to save you a spot?'),
  ('dormant_revival', 'Dormant Revival - Step 3', 3, 336, NULL,
   'Prices rise soon — want the current rate?',
   'Prices rise soon — want the current rate? Let me know if you want to lock it in.')
ON CONFLICT DO NOTHING;






































