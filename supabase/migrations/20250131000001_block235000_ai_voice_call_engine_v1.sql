-- =========================================================
-- Block 235000 — SmartSend Roofing AI Voice & Call Engine v1
-- "AI Voice & Call Engine — Missed Call → Text Back, AI Answering, Call Summaries, Phone Routing"
-- =========================================================
-- 
-- This is THE competitive edge for SmartSend roofing CRM.
-- This block makes SmartSend unfair compared to every roofing CRM on the market.
-- 
-- Features:
-- ✔ AI Auto-Answer (24/7 Virtual Receptionist)
-- ✔ Missed Call → Instant Text Back
-- ✔ AI Lead Qualification by Phone
-- ✔ Call Routing (Sales / Production / Accounting)
-- ✔ Transcribe every call
-- ✔ Summarize every call
-- ✔ Detect lead intent
-- ✔ Auto-create lead from unknown callers
-- ✔ Auto-log call inside SmartSend
-- 
-- This extends Block 87000 with advanced routing, templates, and job linking.
-- =========================================================

-- ============================================================================
-- PART 1 — ADD JOB LINKING TO CALL LOGS
-- ============================================================================
-- Link calls to roofing jobs for production tracking

ALTER TABLE IF EXISTS public.call_logs
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES public.roofing_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_call_logs_job ON public.call_logs(job_id) WHERE job_id IS NOT NULL;

-- ============================================================================
-- PART 2 — CALL ROUTING RULES TABLE
-- ============================================================================
-- Intelligent call routing based on time, keywords, caller type, etc.

CREATE TABLE IF NOT EXISTS public.call_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Rule Configuration
  name text NOT NULL,                          -- "Sales Hours", "Leak Emergency", "Payment Calls"
  rule_type text NOT NULL CHECK (rule_type IN (
    'time_based',                              -- Route based on time of day
    'keyword_based',                           -- Route based on keywords in speech
    'number_based',                            -- Route based on caller phone number
    'customer_type',                           -- Route based on existing customer vs new
    'after_hours',                             -- Route all after-hours calls
    'storm_mode'                               -- Route during storm mode
  )),
  
  -- Conditions (JSONB for flexible matching)
  -- Examples:
  -- {"time_start": "08:00", "time_end": "17:00", "days": [1,2,3,4,5]}
  -- {"keywords": ["leak", "emergency", "water"], "match_all": false}
  -- {"phone_prefix": "+1214"}
  -- {"customer_type": "existing"}
  condition jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- Actions (JSONB for flexible routing)
  -- Examples:
  -- {"route_to": "sales", "phone_number": "+12145551234"}
  -- {"route_to": "ai_assistant", "greeting": "Thanks for calling..."}
  -- {"route_to": "voicemail", "message": "Leave a message..."}
  -- {"route_to": "missed_call_text", "template_id": "uuid"}
  action jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- Priority (lower number = higher priority)
  priority integer DEFAULT 100,
  
  -- Enable/Disable
  is_active boolean DEFAULT true,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure unique rule names per company
  CONSTRAINT unique_routing_rule_name UNIQUE (company_id, name) WHERE company_id IS NOT NULL,
  CONSTRAINT unique_routing_rule_name_org UNIQUE (org_id, name) WHERE org_id IS NOT NULL,
  CONSTRAINT unique_routing_rule_name_workspace UNIQUE (workspace_id, name) WHERE workspace_id IS NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_call_routing_rules_company ON public.call_routing_rules(company_id, is_active, priority) WHERE company_id IS NOT NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_call_routing_rules_org ON public.call_routing_rules(org_id, is_active, priority) WHERE org_id IS NOT NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_call_routing_rules_workspace ON public.call_routing_rules(workspace_id, is_active, priority) WHERE workspace_id IS NOT NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_call_routing_rules_type ON public.call_routing_rules(rule_type, is_active) WHERE is_active = true;

-- ============================================================================
-- PART 3 — AUTO-REPLY TEMPLATES TABLE
-- ============================================================================
-- SMS templates for missed calls, after hours, voicemail follow-ups

CREATE TABLE IF NOT EXISTS public.auto_reply_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Template Configuration
  name text NOT NULL,                          -- "Standard Missed Call", "After Hours", "Storm Mode"
  template_type text NOT NULL CHECK (template_type IN (
    'missed_call',                             -- Sent when call is missed
    'after_hours',                             -- Sent during after-hours calls
    'voicemail',                               -- Sent after voicemail left
    'ai_answered',                             -- Follow-up after AI answered
    'callback_request',                        -- When customer requests callback
    'custom'                                   -- Custom template
  )),
  
  -- SMS Message Template
  -- Supports variables: {{company_name}}, {{caller_name}}, {{time}}, {{date}}
  sms_body text NOT NULL,
  
  -- When to use this template
  use_conditions jsonb DEFAULT '{}'::jsonb,    -- {"time_of_day": "after_hours", "day_of_week": [6,7]}
  
  -- Enable/Disable
  is_active boolean DEFAULT true,
  is_default boolean DEFAULT false,            -- Default template for this type
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_reply_templates_company ON public.auto_reply_templates(company_id, template_type, is_active) WHERE company_id IS NOT NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_auto_reply_templates_org ON public.auto_reply_templates(org_id, template_type, is_active) WHERE org_id IS NOT NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_auto_reply_templates_workspace ON public.auto_reply_templates(workspace_id, template_type, is_active) WHERE workspace_id IS NOT NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_auto_reply_templates_type ON public.auto_reply_templates(template_type, is_default) WHERE is_default = true;

-- ============================================================================
-- PART 4 — ENHANCE CALL LOGS WITH ROUTING INFO
-- ============================================================================
-- Track which routing rule was applied

ALTER TABLE IF EXISTS public.call_logs
  ADD COLUMN IF NOT EXISTS routing_rule_id uuid REFERENCES public.call_routing_rules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS routed_to text,     -- "sales", "production", "accounting", "ai", "voicemail"
  ADD COLUMN IF NOT EXISTS ai_confidence numeric, -- 0-1 confidence score from AI
  ADD COLUMN IF NOT EXISTS extracted_data jsonb DEFAULT '{}'::jsonb; -- Name, address, email, etc. extracted by AI

CREATE INDEX IF NOT EXISTS idx_call_logs_routing_rule ON public.call_logs(routing_rule_id) WHERE routing_rule_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_logs_routed_to ON public.call_logs(routed_to);

-- ============================================================================
-- PART 5 — ENHANCE PHONE NUMBERS WITH TYPE
-- ============================================================================
-- Track phone number types (main, sales, support, service)

ALTER TABLE IF EXISTS public.phone_numbers
  ADD COLUMN IF NOT EXISTS type text CHECK (type IN ('main', 'sales', 'support', 'service', 'dispatch')),
  ADD COLUMN IF NOT EXISTS label text;         -- "Main Office", "Sales Line", "24/7 Emergency"

-- Update existing records to have type = 'main' if null
UPDATE public.phone_numbers SET type = 'main' WHERE type IS NULL;

CREATE INDEX IF NOT EXISTS idx_phone_numbers_type ON public.phone_numbers(type, is_active) WHERE is_active = true;

-- ============================================================================
-- PART 6 — UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_call_routing_rules_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_auto_reply_templates_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_call_routing_rules_updated_at ON public.call_routing_rules;
CREATE TRIGGER trg_call_routing_rules_updated_at
BEFORE UPDATE ON public.call_routing_rules
FOR EACH ROW
EXECUTE FUNCTION public.set_call_routing_rules_updated_at();

DROP TRIGGER IF EXISTS trg_auto_reply_templates_updated_at ON public.auto_reply_templates;
CREATE TRIGGER trg_auto_reply_templates_updated_at
BEFORE UPDATE ON public.auto_reply_templates
FOR EACH ROW
EXECUTE FUNCTION public.set_auto_reply_templates_updated_at();

-- ============================================================================
-- PART 7 — HELPER FUNCTIONS
-- ============================================================================

-- Function to evaluate call routing rules and return best match
CREATE OR REPLACE FUNCTION public.evaluate_call_routing(
  p_company_id uuid DEFAULT NULL,
  p_org_id uuid DEFAULT NULL,
  p_workspace_id uuid DEFAULT NULL,
  p_from_number text DEFAULT NULL,
  p_transcript text DEFAULT NULL,
  p_is_after_hours boolean DEFAULT false,
  p_is_storm_mode boolean DEFAULT false
)
RETURNS TABLE (
  rule_id uuid,
  rule_name text,
  action jsonb,
  priority integer
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_rules RECORD;
  v_matches boolean;
  v_condition jsonb;
  v_time_of_day time;
  v_day_of_week integer;
BEGIN
  -- Get current time info
  v_time_of_day := (now() AT TIME ZONE 'America/Chicago')::time;
  v_day_of_week := EXTRACT(DOW FROM now() AT TIME ZONE 'America/Chicago')::integer;
  
  -- Loop through all active routing rules for this company
  FOR v_rules IN
    SELECT * FROM public.call_routing_rules
    WHERE is_active = true
      AND (
        (p_company_id IS NOT NULL AND company_id = p_company_id)
        OR (p_org_id IS NOT NULL AND org_id = p_org_id)
        OR (p_workspace_id IS NOT NULL AND workspace_id = p_workspace_id)
      )
    ORDER BY priority ASC, created_at ASC
  LOOP
    v_matches := false;
    v_condition := v_rules.condition;
    
    -- Check rule type and evaluate conditions
    CASE v_rules.rule_type
      WHEN 'time_based' THEN
        -- Check if current time matches
        IF v_condition ? 'time_start' AND v_condition ? 'time_end' THEN
          IF v_time_of_day >= (v_condition->>'time_start')::time 
             AND v_time_of_day <= (v_condition->>'time_end')::time THEN
            IF v_condition ? 'days' THEN
              -- Check if current day is in allowed days
              IF v_day_of_week = ANY((v_condition->'days')::integer[]) THEN
                v_matches := true;
              END IF;
            ELSE
              v_matches := true;
            END IF;
          END IF;
        END IF;
        
      WHEN 'keyword_based' THEN
        -- Check if transcript contains keywords
        IF p_transcript IS NOT NULL AND v_condition ? 'keywords' THEN
          DECLARE
            v_keyword text;
            v_match_all boolean := COALESCE((v_condition->>'match_all')::boolean, false);
            v_found_count integer := 0;
            v_required_count integer := 1;
          BEGIN
            IF v_match_all THEN
              v_required_count := jsonb_array_length(v_condition->'keywords');
            END IF;
            
            FOR v_keyword IN SELECT jsonb_array_elements_text(v_condition->'keywords')
            LOOP
              IF lower(p_transcript) LIKE '%' || lower(v_keyword) || '%' THEN
                v_found_count := v_found_count + 1;
              END IF;
            END LOOP;
            
            IF v_found_count >= v_required_count THEN
              v_matches := true;
            END IF;
          END;
        END IF;
        
      WHEN 'number_based' THEN
        -- Check if caller number matches
        IF p_from_number IS NOT NULL AND v_condition ? 'phone_prefix' THEN
          IF p_from_number LIKE (v_condition->>'phone_prefix') || '%' THEN
            v_matches := true;
          END IF;
        END IF;
        
      WHEN 'after_hours' THEN
        -- Match if after hours
        IF p_is_after_hours THEN
          v_matches := true;
        END IF;
        
      WHEN 'storm_mode' THEN
        -- Match if storm mode
        IF p_is_storm_mode THEN
          v_matches := true;
        END IF;
        
      ELSE
        -- Unknown rule type
        v_matches := false;
    END CASE;
    
    -- If rule matches, return it
    IF v_matches THEN
      RETURN QUERY SELECT v_rules.id, v_rules.name, v_rules.action, v_rules.priority;
      RETURN; -- Return first match (highest priority)
    END IF;
  END LOOP;
  
  -- No match found
  RETURN;
END;
$$;

-- Function to get auto-reply template
CREATE OR REPLACE FUNCTION public.get_auto_reply_template(
  p_company_id uuid DEFAULT NULL,
  p_org_id uuid DEFAULT NULL,
  p_workspace_id uuid DEFAULT NULL,
  p_template_type text,
  p_use_conditions jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  template_id uuid,
  sms_body text
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_template RECORD;
BEGIN
  -- Try to find a template matching conditions first
  FOR v_template IN
    SELECT id, sms_body FROM public.auto_reply_templates
    WHERE is_active = true
      AND template_type = p_template_type
      AND (
        (p_company_id IS NOT NULL AND company_id = p_company_id)
        OR (p_org_id IS NOT NULL AND org_id = p_org_id)
        OR (p_workspace_id IS NOT NULL AND workspace_id = p_workspace_id)
      )
    ORDER BY is_default DESC, created_at ASC
    LIMIT 1
  LOOP
    RETURN QUERY SELECT v_template.id, v_template.sms_body;
    RETURN;
  END LOOP;
  
  -- Return empty if no template found
  RETURN;
END;
$$;

-- ============================================================================
-- PART 8 — ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.call_routing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_reply_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies for call_routing_rules
DROP POLICY IF EXISTS "call_routing_rules_select" ON public.call_routing_rules;
CREATE POLICY "call_routing_rules_select" ON public.call_routing_rules
  FOR SELECT
  USING (
    has_phone_access(company_id, org_id, workspace_id)
  );

DROP POLICY IF EXISTS "call_routing_rules_modify" ON public.call_routing_rules;
CREATE POLICY "call_routing_rules_modify" ON public.call_routing_rules
  FOR ALL
  USING (
    has_phone_access(company_id, org_id, workspace_id)
  )
  WITH CHECK (
    has_phone_access(company_id, org_id, workspace_id)
  );

-- RLS Policies for auto_reply_templates
DROP POLICY IF EXISTS "auto_reply_templates_select" ON public.auto_reply_templates;
CREATE POLICY "auto_reply_templates_select" ON public.auto_reply_templates
  FOR SELECT
  USING (
    has_phone_access(company_id, org_id, workspace_id)
  );

DROP POLICY IF EXISTS "auto_reply_templates_modify" ON public.auto_reply_templates;
CREATE POLICY "auto_reply_templates_modify" ON public.auto_reply_templates
  FOR ALL
  USING (
    has_phone_access(company_id, org_id, workspace_id)
  )
  WITH CHECK (
    has_phone_access(company_id, org_id, workspace_id)
  );

-- ============================================================================
-- PART 9 — GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.call_routing_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_reply_templates TO authenticated;

GRANT EXECUTE ON FUNCTION public.evaluate_call_routing(uuid, uuid, uuid, text, text, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_auto_reply_template(uuid, uuid, uuid, text, jsonb) TO authenticated;

-- ============================================================================
-- PART 10 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.call_routing_rules IS 'Intelligent call routing rules for SmartSend AI Call Engine (Block 235000)';
COMMENT ON TABLE public.auto_reply_templates IS 'SMS templates for missed calls and follow-ups (Block 235000)';
COMMENT ON COLUMN public.call_logs.job_id IS 'Link to roofing job if call relates to existing job';
COMMENT ON COLUMN public.call_logs.routing_rule_id IS 'Which routing rule was applied to this call';
COMMENT ON COLUMN public.call_logs.routed_to IS 'Where the call was routed (sales, production, ai, etc.)';
COMMENT ON COLUMN public.call_logs.ai_confidence IS 'AI confidence score (0-1) for transcription/summarization';
COMMENT ON COLUMN public.call_logs.extracted_data IS 'JSONB with extracted information: name, address, email, issue, etc.';

























