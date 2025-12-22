-- =========================================================
-- Block 25700 — SmartSend Roofing Homeowner Experience Engine v1
-- (Status Updates • Automated Communication • Homeowner Portal UX • Trust Messaging • Education • Satisfaction Tracking)
-- =========================================================
--
-- THE HOMEOWNER EXPERIENCE ENGINE — ZERO FLUFF.
--
-- THIS is the engine that turns roofers into brands homeowners trust,
-- reduces angry calls, reduces confusion, reduces friction —
-- AND increases approvals, reviews, and referrals.
--
-- This block implements:
-- 1. Complete Status Update System (A-J stages)
-- 2. Trust Messaging System (tarp landscaping, magnet collection, certified suppliers)
-- 3. Education Engine (roofing process explanations)
-- 4. Expectation Setting (noise, debris, dumpster, vehicle access, pet safety)
-- 5. Enhanced Satisfaction Tracking (post-inspection, post-install, post-invoice, post-warranty)
-- 6. Homeowner Playbook System (explains all stages)
-- 7. Communication Inbox Routing (sales/ops/owner separation)
-- =========================================================

-- ============================================================================
-- PART 1 — EXTEND HOMEOWNER CONFIRMATIONS WITH NEW STATUS TYPES
-- ============================================================================

-- Add new confirmation types to existing homeowner_confirmations table
DO $$ 
BEGIN
  -- Add new confirmation types if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'homeowner_confirmations' 
    AND column_name = 'confirmation_type'
  ) THEN
    -- Table doesn't exist yet, will be created by Block 25140 migration
    NULL;
  ELSE
    -- Extend the check constraint to include new types
    ALTER TABLE public.homeowner_confirmations
      DROP CONSTRAINT IF EXISTS homeowner_confirmations_confirmation_type_check;
    
    ALTER TABLE public.homeowner_confirmations
      ADD CONSTRAINT homeowner_confirmations_confirmation_type_check
      CHECK (confirmation_type IN (
        -- Existing types (Block 25140)
        'inspection_booked',
        'day_before_reminder',
        'after_inspection',
        'quote_sent',
        'job_approved',
        'install_confirmed',
        'install_morning',
        'install_midday',
        'install_completion',
        'cleanup_checklist',
        'warranty_delivered',
        'review_request',
        -- New types (Block 25700)
        'lead_stage',              -- A. Lead Stage
        'pre_inspection',         -- B. Pre-Inspection
        'material_delivery_reminder', -- F. Material Delivery Reminder
        'final_invoice',          -- H. Final Invoice
        'trust_message',          -- Trust messaging
        'education_content',       -- Education content
        'expectation_setting',     -- Expectation setting
        'playbook_sent'            -- Homeowner playbook
      ));
  END IF;
END $$;

-- ============================================================================
-- PART 2 — TRUST MESSAGING SYSTEM
-- ============================================================================
-- Tracks trust-building messages sent to homeowners

CREATE TABLE IF NOT EXISTS public.homeowner_trust_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  
  -- Trust message type
  trust_message_type text NOT NULL CHECK (trust_message_type IN (
    'tarp_landscaping',        -- "We always tarp your landscaping before tear-off"
    'magnet_nail_collection',  -- "Our crew will walk the property magnet to collect nails"
    'certified_suppliers',     -- "All materials come from certified suppliers"
    'warranty_registered',     -- "Your warranty is registered automatically"
    'certified_professionals', -- "Your roof is installed by certified professionals"
    'cleanup_guarantee',       -- "We guarantee cleanup after completion"
    'insurance_expertise',     -- "We handle all insurance documentation"
    'lifetime_warranty'        -- "Your roof comes with lifetime warranty"
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
  
  -- Timing (when to send relative to job stage)
  send_timing text CHECK (send_timing IN (
    'before_install',      -- Before installation starts
    'during_install',      -- During installation
    'after_install',       -- After installation
    'before_materials',    -- Before materials arrive
    'after_materials',      -- After materials arrive
    'on_approval'          -- When job is approved
  )),
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homeowner_trust_messages_job_id 
  ON public.homeowner_trust_messages(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_trust_messages_type 
  ON public.homeowner_trust_messages(trust_message_type, status);
CREATE INDEX IF NOT EXISTS idx_homeowner_trust_messages_workspace 
  ON public.homeowner_trust_messages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_trust_messages_timing 
  ON public.homeowner_trust_messages(send_timing, status);

COMMENT ON TABLE public.homeowner_trust_messages IS 'Block 25700: Tracks trust-building messages sent to homeowners';

-- ============================================================================
-- PART 3 — EDUCATION ENGINE
-- ============================================================================
-- Tracks educational content delivered to homeowners

CREATE TABLE IF NOT EXISTS public.homeowner_education_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  
  -- Education topic
  education_topic text NOT NULL CHECK (education_topic IN (
    'roofing_process_overview',    -- How the roofing process works
    'tear_off_explained',          -- What "tear-off" means
    'underlayment_explained',      -- What underlayment does
    'ridge_vents_explained',      -- Why ridge vents matter
    'insurance_claims_explained',  -- How insurance claims work
    'ventilation_importance',     -- Why proper ventilation increases roof life
    'post_install_checklist',     -- What to look for after a roof replacement
    'warranty_coverage',          -- What warranty covers
    'material_types',             -- Different roofing materials explained
    'timeline_expectations'       -- How long each stage takes
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
  
  -- Timing (when to send relative to job stage)
  send_timing text CHECK (send_timing IN (
    'on_lead',           -- When lead comes in
    'pre_inspection',    -- Before inspection
    'post_inspection',   -- After inspection
    'on_approval',       -- When job is approved
    'before_install',    -- Before installation
    'during_install',    -- During installation
    'after_install'      -- After installation
  )),
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homeowner_education_job_id 
  ON public.homeowner_education_content(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_education_topic 
  ON public.homeowner_education_content(education_topic, status);
CREATE INDEX IF NOT EXISTS idx_homeowner_education_workspace 
  ON public.homeowner_education_content(workspace_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_education_timing 
  ON public.homeowner_education_content(send_timing, status);

COMMENT ON TABLE public.homeowner_education_content IS 'Block 25700: Tracks educational content delivered to homeowners';

-- ============================================================================
-- PART 4 — EXPECTATION SETTING SYSTEM
-- ============================================================================
-- Tracks expectation-setting messages sent to homeowners

CREATE TABLE IF NOT EXISTS public.homeowner_expectation_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  
  -- Expectation type
  expectation_type text NOT NULL CHECK (expectation_type IN (
    'noise_levels',           -- Noise expectations
    'debris_expectations',    -- Debris expectations
    'dumpster_placement',    -- Dumpster placement
    'vehicle_access',        -- Vehicle access requirements
    'pet_safety',            -- Pet safety recommendations
    'weather_delays',        -- Weather delay expectations
    'crew_arrival_windows',  -- Crew arrival windows
    'payment_expectations',  -- Payment expectations
    'lawn_nail_sweep',       -- Lawn nail sweep after completion
    'cleanup_timeline'       -- Cleanup timeline
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
  
  -- Timing (when to send relative to job stage)
  send_timing text CHECK (send_timing IN (
    'on_approval',       -- When job is approved
    'before_materials',  -- Before materials arrive
    'before_install',    -- Before installation
    'day_before_install' -- Day before installation
  )),
  
  -- Metadata (specific details like noise level, dumpster location, etc.)
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homeowner_expectations_job_id 
  ON public.homeowner_expectation_settings(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_expectations_type 
  ON public.homeowner_expectation_settings(expectation_type, status);
CREATE INDEX IF NOT EXISTS idx_homeowner_expectations_workspace 
  ON public.homeowner_expectation_settings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_expectations_timing 
  ON public.homeowner_expectation_settings(send_timing, status);

COMMENT ON TABLE public.homeowner_expectation_settings IS 'Block 25700: Tracks expectation-setting messages sent to homeowners';

-- ============================================================================
-- PART 5 — ENHANCED SATISFACTION TRACKING
-- ============================================================================
-- Extend homeowner_feedback to support multiple checkpoints

-- Add checkpoint field to homeowner_feedback if it doesn't exist
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'homeowner_feedback' 
    AND column_name = 'id'
  ) THEN
    -- Add checkpoint column
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_name = 'homeowner_feedback' 
      AND column_name = 'checkpoint'
    ) THEN
      ALTER TABLE public.homeowner_feedback
        ADD COLUMN checkpoint text CHECK (checkpoint IN (
          'post_inspection',   -- After inspection
          'post_install',      -- After installation
          'post_invoice',      -- After final invoice
          'post_warranty',     -- After warranty delivery
          'overall'            -- Overall satisfaction
        )) DEFAULT 'overall';
      
      CREATE INDEX IF NOT EXISTS idx_homeowner_feedback_checkpoint 
        ON public.homeowner_feedback(checkpoint);
    END IF;
  END IF;
END $$;

-- ============================================================================
-- PART 6 — HOMEOWNER PLAYBOOK SYSTEM
-- ============================================================================
-- Stores homeowner playbooks that explain the entire roofing journey

CREATE TABLE IF NOT EXISTS public.homeowner_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  
  -- Playbook content (JSON structure)
  playbook_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "stages": [
  --     {
  --       "stage_number": 1,
  --       "stage_name": "Inspection",
  --       "description": "...",
  --       "what_to_expect": "...",
  --       "timeline": "...",
  --       "questions_to_ask": [...]
  --     },
  --     ...
  --   ],
  --   "overview": "...",
  --   "contact_info": {...}
  -- }
  
  -- Message details
  message_sent_at timestamptz,
  message_channel text CHECK (message_channel IN ('email', 'sms', 'both')) DEFAULT 'email',
  message_subject text,
  message_body text,
  message_template_key text,
  
  -- Status
  status text CHECK (status IN ('pending', 'sent', 'failed', 'skipped')) DEFAULT 'pending',
  error_message text,
  
  -- When to send
  send_timing text CHECK (send_timing IN (
    'on_approval',       -- When job is approved
    'on_lead',           -- When lead comes in
    'before_inspection'  -- Before inspection
  )) DEFAULT 'on_approval',
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homeowner_playbooks_job_id 
  ON public.homeowner_playbooks(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_playbooks_workspace 
  ON public.homeowner_playbooks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_playbooks_status 
  ON public.homeowner_playbooks(status);

COMMENT ON TABLE public.homeowner_playbooks IS 'Block 25700: Stores homeowner playbooks explaining the roofing journey';

-- ============================================================================
-- PART 7 — HOMEOWNER COMMUNICATION INBOX ROUTING
-- ============================================================================
-- Extend unified_messages or create routing table for homeowner messages

CREATE TABLE IF NOT EXISTS public.homeowner_message_routing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  message_id uuid, -- References unified_messages or other message table
  job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  
  -- Routing category
  routing_category text NOT NULL CHECK (routing_category IN (
    'sales',      -- Sales-related messages
    'ops',        -- Operations/install messages
    'owner',      -- Owner escalations
    'general'     -- General inquiries
  )),
  
  -- AI classification
  ai_classified boolean DEFAULT false,
  ai_confidence numeric(3,2) CHECK (ai_confidence >= 0 AND ai_confidence <= 1.0),
  ai_reasoning text,
  
  -- Manual override
  manually_routed boolean DEFAULT false,
  routed_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  
  -- Status
  status text CHECK (status IN ('pending', 'routed', 'resolved')) DEFAULT 'pending',
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_homeowner_message_routing_message_id 
  ON public.homeowner_message_routing(message_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_message_routing_job_id 
  ON public.homeowner_message_routing(job_id);
CREATE INDEX IF NOT EXISTS idx_homeowner_message_routing_category 
  ON public.homeowner_message_routing(routing_category, status);
CREATE INDEX IF NOT EXISTS idx_homeowner_message_routing_workspace 
  ON public.homeowner_message_routing(workspace_id);

COMMENT ON TABLE public.homeowner_message_routing IS 'Block 25700: Routes homeowner messages to appropriate team members (sales/ops/owner)';

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- homeowner_trust_messages
ALTER TABLE public.homeowner_trust_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homeowner_trust_messages_select"
  ON public.homeowner_trust_messages FOR SELECT
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

CREATE POLICY "homeowner_trust_messages_insert"
  ON public.homeowner_trust_messages FOR INSERT
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

CREATE POLICY "homeowner_trust_messages_update"
  ON public.homeowner_trust_messages FOR UPDATE
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

-- homeowner_education_content
ALTER TABLE public.homeowner_education_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homeowner_education_select"
  ON public.homeowner_education_content FOR SELECT
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

CREATE POLICY "homeowner_education_insert"
  ON public.homeowner_education_content FOR INSERT
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

CREATE POLICY "homeowner_education_update"
  ON public.homeowner_education_content FOR UPDATE
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

-- homeowner_expectation_settings
ALTER TABLE public.homeowner_expectation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homeowner_expectations_select"
  ON public.homeowner_expectation_settings FOR SELECT
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

CREATE POLICY "homeowner_expectations_insert"
  ON public.homeowner_expectation_settings FOR INSERT
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

CREATE POLICY "homeowner_expectations_update"
  ON public.homeowner_expectation_settings FOR UPDATE
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

-- homeowner_playbooks
ALTER TABLE public.homeowner_playbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homeowner_playbooks_select"
  ON public.homeowner_playbooks FOR SELECT
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

CREATE POLICY "homeowner_playbooks_insert"
  ON public.homeowner_playbooks FOR INSERT
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

CREATE POLICY "homeowner_playbooks_update"
  ON public.homeowner_playbooks FOR UPDATE
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

-- homeowner_message_routing
ALTER TABLE public.homeowner_message_routing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "homeowner_message_routing_select"
  ON public.homeowner_message_routing FOR SELECT
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

CREATE POLICY "homeowner_message_routing_insert"
  ON public.homeowner_message_routing FOR INSERT
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

CREATE POLICY "homeowner_message_routing_update"
  ON public.homeowner_message_routing FOR UPDATE
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

CREATE TRIGGER trg_homeowner_trust_messages_updated_at
  BEFORE UPDATE ON public.homeowner_trust_messages
  FOR EACH ROW EXECUTE FUNCTION update_homeowner_experience_updated_at();

CREATE TRIGGER trg_homeowner_education_updated_at
  BEFORE UPDATE ON public.homeowner_education_content
  FOR EACH ROW EXECUTE FUNCTION update_homeowner_experience_updated_at();

CREATE TRIGGER trg_homeowner_expectations_updated_at
  BEFORE UPDATE ON public.homeowner_expectation_settings
  FOR EACH ROW EXECUTE FUNCTION update_homeowner_experience_updated_at();

CREATE TRIGGER trg_homeowner_playbooks_updated_at
  BEFORE UPDATE ON public.homeowner_playbooks
  FOR EACH ROW EXECUTE FUNCTION update_homeowner_experience_updated_at();

CREATE TRIGGER trg_homeowner_message_routing_updated_at
  BEFORE UPDATE ON public.homeowner_message_routing
  FOR EACH ROW EXECUTE FUNCTION update_homeowner_experience_updated_at();

-- ============================================================================
-- PART 10 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE ON public.homeowner_trust_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.homeowner_education_content TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.homeowner_expectation_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.homeowner_playbooks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.homeowner_message_routing TO authenticated;




































