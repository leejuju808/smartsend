-- ============================================================================
-- Block 24940 — SmartSend Roofing Messaging Hub v1
-- (Unified Inbox • Multi-Channel Messaging • AI Templates • Snippets • Fast Sales & Ops Replies)
-- ============================================================================
-- THE FULL MESSAGING HUB — ZERO FLUFF.
-- This is the communication command center for roofers.
-- Every message from every homeowner, adjuster, supplier, crew member, or lead flows into ONE place.
-- ============================================================================

-- ============================================================================
-- PART 1 — UNIFIED MESSAGES TABLE
-- ============================================================================
-- Single table for ALL messages across ALL channels (Email, SMS, Website Forms, Campaign Replies, Internal Notes, Owner Escalations)

CREATE TABLE IF NOT EXISTS public.unified_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Message linking (flexible - can link to lead, job, contact, thread, or campaign)
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  job_id UUID REFERENCES public.roofing_jobs(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  thread_id UUID REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  
  -- Channel and direction
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'webform', 'campaign_reply', 'internal_note', 'owner_escalation', 'insurance_request')),
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  
  -- Message content
  from_address TEXT, -- email or phone number
  to_address TEXT,   -- email or phone number
  subject TEXT,
  body_text TEXT,
  body_html TEXT,
  
  -- Message metadata
  external_id TEXT, -- provider message ID (e.g., email message ID, SMS SID)
  external_provider TEXT, -- 'gmail', 'resend', 'twilio', 'webform', etc.
  external_metadata JSONB DEFAULT '{}'::jsonb, -- raw provider payload
  
  -- Status tracking
  status TEXT DEFAULT 'delivered' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed', 'bounced')),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  
  -- AI classification
  ai_intent TEXT, -- 'hot_lead', 'scheduling', 'question', 'objection', 'payment', 'insurance', etc.
  ai_priority TEXT DEFAULT 'normal' CHECK (ai_priority IN ('low', 'normal', 'high', 'urgent')),
  ai_confidence NUMERIC(3,2), -- 0.00 to 1.00
  
  -- Routing
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  routed_to_role TEXT, -- 'sales', 'insurance', 'crew', 'operations', 'owner'
  
  -- Labels and tags (stored as JSONB array for flexibility)
  labels TEXT[] DEFAULT '{}',
  
  -- Follow-up tracking
  needs_follow_up BOOLEAN DEFAULT FALSE,
  follow_up_due_at TIMESTAMPTZ,
  
  -- Timestamps
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Ensure at least one link exists
  CONSTRAINT unified_message_has_link CHECK (
    lead_id IS NOT NULL OR job_id IS NOT NULL OR contact_id IS NOT NULL OR thread_id IS NOT NULL
  )
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_unified_messages_workspace ON public.unified_messages(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unified_messages_lead ON public.unified_messages(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_unified_messages_job ON public.unified_messages(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_unified_messages_contact ON public.unified_messages(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_unified_messages_thread ON public.unified_messages(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_unified_messages_channel ON public.unified_messages(channel);
CREATE INDEX IF NOT EXISTS idx_unified_messages_direction ON public.unified_messages(direction);
CREATE INDEX IF NOT EXISTS idx_unified_messages_status ON public.unified_messages(status);
CREATE INDEX IF NOT EXISTS idx_unified_messages_assigned ON public.unified_messages(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_unified_messages_routed_role ON public.unified_messages(routed_to_role) WHERE routed_to_role IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_unified_messages_needs_followup ON public.unified_messages(needs_follow_up, follow_up_due_at) WHERE needs_follow_up = TRUE;
CREATE INDEX IF NOT EXISTS idx_unified_messages_ai_priority ON public.unified_messages(ai_priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unified_messages_labels ON public.unified_messages USING GIN(labels);
CREATE INDEX IF NOT EXISTS idx_unified_messages_external ON public.unified_messages(external_provider, external_id);

-- ============================================================================
-- PART 2 — MESSAGE LABELS TABLE
-- ============================================================================
-- Predefined and custom labels for organizing messages

CREATE TABLE IF NOT EXISTS public.message_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  label_key TEXT NOT NULL, -- 'hot_lead', 'insurance', 'needs_quote', 'waiting_on_homeowner', 'payment_pending', 'job_scheduled', 'at_risk'
  label_name TEXT NOT NULL, -- Human-readable name
  label_color TEXT DEFAULT '#3B82F6', -- Hex color for UI
  is_system BOOLEAN DEFAULT FALSE, -- System labels vs custom labels
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(workspace_id, label_key)
);

CREATE INDEX IF NOT EXISTS idx_message_labels_workspace ON public.message_labels(workspace_id, is_active);

-- Seed default system labels
INSERT INTO public.message_labels (workspace_id, label_key, label_name, label_color, is_system)
VALUES
  ('00000000-0000-0000-0000-000000000000'::uuid, 'hot_lead', 'Hot Lead', '#EF4444', TRUE),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'insurance', 'Insurance', '#3B82F6', TRUE),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'needs_quote', 'Needs Quote', '#F59E0B', TRUE),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'waiting_on_homeowner', 'Waiting on Homeowner', '#8B5CF6', TRUE),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'payment_pending', 'Payment Pending', '#10B981', TRUE),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'job_scheduled', 'Job Scheduled', '#06B6D4', TRUE),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'at_risk', 'At Risk', '#F97316', TRUE)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 3 — INTERNAL COMMENTS TABLE
-- ============================================================================
-- Team notes on conversations (never sent to homeowner)

CREATE TABLE IF NOT EXISTS public.message_internal_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.unified_messages(id) ON DELETE CASCADE,
  thread_id UUID REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  
  -- Comment content
  body TEXT NOT NULL,
  
  -- Author
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_comments_message ON public.message_internal_comments(message_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_comments_thread ON public.message_internal_comments(thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_comments_workspace ON public.message_internal_comments(workspace_id);

-- ============================================================================
-- PART 4 — MESSAGE ROUTING RULES TABLE
-- ============================================================================
-- Auto-triage rules for routing messages to team members

CREATE TABLE IF NOT EXISTS public.message_routing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Rule configuration
  rule_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0, -- Higher priority = evaluated first
  
  -- Conditions (JSONB for flexibility)
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb, -- e.g., {"channel": "email", "ai_intent": "insurance", "keywords": ["adjuster", "claim"]}
  
  -- Actions
  route_to_role TEXT, -- 'sales', 'insurance', 'crew', 'operations', 'owner'
  route_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  apply_label TEXT, -- Label to apply
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_routing_rules_workspace ON public.message_routing_rules(workspace_id, is_active, priority DESC);

-- ============================================================================
-- PART 5 — QUICK SNIPPETS TABLE
-- ============================================================================
-- Pre-written roofing responses for instant replies

CREATE TABLE IF NOT EXISTS public.message_snippets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE, -- NULL = global snippet
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE, -- Legacy support
  
  -- Snippet configuration
  snippet_key TEXT NOT NULL, -- 'inspection_availability', 'price_range_explanation', 'insurance_process', etc.
  snippet_name TEXT NOT NULL, -- Human-readable name
  snippet_text TEXT NOT NULL, -- The actual snippet text
  
  -- Categorization
  category TEXT, -- 'scheduling', 'pricing', 'insurance', 'general', etc.
  
  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid), snippet_key)
);

CREATE INDEX IF NOT EXISTS idx_message_snippets_workspace ON public.message_snippets(workspace_id);
CREATE INDEX IF NOT EXISTS idx_message_snippets_category ON public.message_snippets(category);

-- Seed default roofing snippets
INSERT INTO public.message_snippets (workspace_id, snippet_key, snippet_name, snippet_text, category)
VALUES
  ('00000000-0000-0000-0000-000000000000'::uuid, 'inspection_availability', 'Inspection Availability', 'Absolutely — we have openings at 10 AM or 2 PM. Which works best?', 'scheduling'),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'price_range_explanation', 'Price Range Explanation', 'I understand completely — roofing is a big investment. Want me to walk you through what''s included so you can compare apples to apples?', 'pricing'),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'insurance_process', 'Insurance Process', 'We check for storm-related damage, document everything for the adjuster, and help you through the entire claim.', 'insurance'),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'storm_damage_message', 'Storm Damage Message', 'Got your message — we''ll get right back to you. In the meantime, want to schedule an inspection?', 'general'),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'deposit_reminder', 'Deposit Reminder', 'Just a reminder — the deposit for your project is still outstanding. Once received, we''ll secure your spot on the schedule!', 'payment'),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'scheduling_confirmation', 'Scheduling Confirmation', 'Perfect — I''ve got you scheduled for [DATE] at [TIME]. I''ll send a confirmation email with all the details.', 'scheduling'),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'permit_explanation', 'Permit Explanation', 'We handle all permits for you — it''s included in the project. No need to worry about it.', 'general'),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'warranty_overview', 'Warranty Overview', 'All our work comes with a [X]-year warranty. We stand behind everything we do.', 'general'),
  ('00000000-0000-0000-0000-000000000000'::uuid, 'still_want_help_revival', 'Still Want Help? Revival Message', 'Hey [NAME], just checking back in — still need help with your roof?', 'followup')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 6 — AUTO-REPLY RULES TABLE
-- ============================================================================
-- Adaptive auto-replies for after-hours/busy times

CREATE TABLE IF NOT EXISTS public.auto_reply_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Rule configuration
  rule_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Trigger conditions
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('after_hours', 'busy_hours', 'weekend', 'holiday', 'always')),
  trigger_time_start TIME, -- e.g., '18:00:00' for after-hours
  trigger_time_end TIME,   -- e.g., '09:00:00' for after-hours
  trigger_days INTEGER[], -- Array of day numbers (0=Sunday, 6=Saturday)
  
  -- Message content
  reply_subject TEXT,
  reply_body TEXT NOT NULL,
  
  -- Conditions
  only_for_channels TEXT[], -- ['email', 'sms'] - only apply to these channels
  only_for_intents TEXT[], -- ['scheduling', 'question'] - only apply to these intents
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_reply_rules_workspace ON public.auto_reply_rules(workspace_id, is_active);

-- ============================================================================
-- PART 7 — AI MESSAGE SUGGESTIONS TABLE
-- ============================================================================
-- Store AI-generated reply suggestions for messages

CREATE TABLE IF NOT EXISTS public.ai_message_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.unified_messages(id) ON DELETE CASCADE,
  
  -- Suggestion types
  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('short_reply', 'long_reply', 'tone_matched', 'scheduling', 'insurance_explanation', 'deposit_reminder', 'quote_followup', 'objection_handling')),
  
  -- Suggestion content
  suggested_text TEXT NOT NULL,
  suggested_subject TEXT,
  
  -- AI metadata
  ai_model TEXT, -- 'gpt-4o-mini', 'gpt-4', etc.
  ai_tokens_used INTEGER,
  ai_confidence NUMERIC(3,2),
  
  -- Usage tracking
  was_used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_message ON public.ai_message_suggestions(message_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_workspace ON public.ai_message_suggestions(workspace_id);

-- ============================================================================
-- PART 8 — MESSAGE TASK CREATION LOG
-- ============================================================================
-- Track tasks created from messages (for audit and analytics)

CREATE TABLE IF NOT EXISTS public.message_task_creations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES public.unified_messages(id) ON DELETE CASCADE,
  task_id UUID, -- Reference to tasks table (flexible - could be different task tables)
  
  -- Task details
  task_title TEXT NOT NULL,
  task_description TEXT,
  task_due_at TIMESTAMPTZ,
  task_assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Detection method
  detection_method TEXT DEFAULT 'ai' CHECK (detection_method IN ('ai', 'keyword', 'manual')),
  detected_action_item TEXT, -- What action item was detected
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_task_creations_message ON public.message_task_creations(message_id);
CREATE INDEX IF NOT EXISTS idx_message_task_creations_workspace ON public.message_task_creations(workspace_id);

-- ============================================================================
-- PART 9 — FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_unified_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_unified_messages_updated_at
BEFORE UPDATE ON public.unified_messages
FOR EACH ROW
EXECUTE FUNCTION update_unified_messages_updated_at();

-- Function to auto-apply labels based on message content
CREATE OR REPLACE FUNCTION auto_apply_message_labels()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-apply 'hot_lead' label if AI priority is urgent
  IF NEW.ai_priority = 'urgent' THEN
    NEW.labels = array_append(COALESCE(NEW.labels, '{}'), 'hot_lead');
  END IF;
  
  -- Auto-apply 'insurance' label if AI intent contains insurance
  IF NEW.ai_intent LIKE '%insurance%' OR NEW.ai_intent LIKE '%adjuster%' OR NEW.ai_intent LIKE '%claim%' THEN
    NEW.labels = array_append(COALESCE(NEW.labels, '{}'), 'insurance');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_apply_message_labels
BEFORE INSERT OR UPDATE ON public.unified_messages
FOR EACH ROW
EXECUTE FUNCTION auto_apply_message_labels();

-- Function to create job timeline event from message
CREATE OR REPLACE FUNCTION create_timeline_event_from_message()
RETURNS TRIGGER AS $$
DECLARE
  v_lead_id UUID;
  v_job_id UUID;
BEGIN
  -- Determine lead_id or job_id
  v_lead_id := NEW.lead_id;
  v_job_id := NEW.job_id;
  
  -- Create timeline event if we have a lead or job
  IF v_lead_id IS NOT NULL OR v_job_id IS NOT NULL THEN
    INSERT INTO public.job_timelines (
      workspace_id,
      lead_id,
      job_id,
      event_type,
      event_subtype,
      message,
      metadata,
      created_at
    ) VALUES (
      NEW.workspace_id,
      v_lead_id,
      v_job_id,
      CASE 
        WHEN NEW.direction = 'inbound' THEN 'homeowner_message_inbound'
        ELSE 'homeowner_message_outbound'
      END,
      NEW.channel,
      COALESCE(NEW.subject, 'Message'),
      jsonb_build_object(
        'message_id', NEW.id,
        'channel', NEW.channel,
        'from_address', NEW.from_address,
        'to_address', NEW.to_address,
        'ai_intent', NEW.ai_intent,
        'ai_priority', NEW.ai_priority
      ),
      NEW.created_at
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_create_timeline_event_from_message
AFTER INSERT ON public.unified_messages
FOR EACH ROW
EXECUTE FUNCTION create_timeline_event_from_message();

-- ============================================================================
-- PART 10 — VIEWS FOR FILTERING
-- ============================================================================

-- View for messages filtered by type (Homeowners, Leads, Insurance, Suppliers, Crews)
CREATE OR REPLACE VIEW v_messaging_hub_messages AS
SELECT 
  um.*,
  c.name as contact_name,
  c.email as contact_email,
  c.phone as contact_phone,
  l.status as lead_status,
  l.estimated_job_value,
  rj.status as job_status,
  rj.job_value,
  rj.current_stage as job_stage
FROM public.unified_messages um
LEFT JOIN public.contacts c ON um.contact_id = c.id
LEFT JOIN public.leads l ON um.lead_id = l.id
LEFT JOIN public.roofing_jobs rj ON um.job_id = rj.id;

-- ============================================================================
-- PART 11 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.unified_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_internal_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_snippets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_reply_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_message_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_task_creations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for unified_messages
CREATE POLICY "workspace_members_can_view_messages"
  ON public.unified_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = unified_messages.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_can_insert_messages"
  ON public.unified_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = unified_messages.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_can_update_messages"
  ON public.unified_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = unified_messages.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policies for message_labels
CREATE POLICY "workspace_members_can_manage_labels"
  ON public.message_labels FOR ALL
  USING (
    workspace_id = '00000000-0000-0000-0000-000000000000'::uuid OR
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = message_labels.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policies for message_internal_comments
CREATE POLICY "workspace_members_can_view_comments"
  ON public.message_internal_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = message_internal_comments.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_can_create_comments"
  ON public.message_internal_comments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = message_internal_comments.workspace_id
        AND wm.user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );

-- RLS Policies for message_routing_rules
CREATE POLICY "workspace_members_can_manage_routing_rules"
  ON public.message_routing_rules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = message_routing_rules.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policies for message_snippets
CREATE POLICY "workspace_members_can_view_snippets"
  ON public.message_snippets FOR SELECT
  USING (
    workspace_id IS NULL OR
    workspace_id = '00000000-0000-0000-0000-000000000000'::uuid OR
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = message_snippets.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "workspace_members_can_manage_snippets"
  ON public.message_snippets FOR ALL
  USING (
    workspace_id IS NULL OR
    workspace_id = '00000000-0000-0000-0000-000000000000'::uuid OR
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = message_snippets.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policies for auto_reply_rules
CREATE POLICY "workspace_members_can_manage_auto_replies"
  ON public.auto_reply_rules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = auto_reply_rules.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policies for ai_message_suggestions
CREATE POLICY "workspace_members_can_view_suggestions"
  ON public.ai_message_suggestions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = ai_message_suggestions.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- RLS Policies for message_task_creations
CREATE POLICY "workspace_members_can_view_task_creations"
  ON public.message_task_creations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = message_task_creations.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================






































