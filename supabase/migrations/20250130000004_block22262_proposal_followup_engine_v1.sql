-- =========================================================
-- Block 22262 — SmartSend Roofing Proposal Follow-Up Engine v1
-- (FULL THROTTLE. NO BULLSHIT. THIS IS WHERE PROPOSALS TURN INTO JOBS.)
-- =========================================================
-- 
-- This block makes sure every proposal gets chased down automatically 
-- with smart, roofing-specific follow-ups.
-- 
-- If Block 22261 = "Proposal Brain",
-- then Block 22262 = "Follow-Up Muscle".

-- ============================================================================
-- PART 1 — CREATE proposal_followup_templates TABLE
-- ============================================================================
-- Contractor-level "recipes" for follow-ups based on intent (HOT / WARM / COLD / NO_INTENT).

CREATE TABLE IF NOT EXISTS public.proposal_followup_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Which type of proposal / homeowner intent this applies to
  intent text CHECK (intent IN ('HOT','WARM','COLD','NO_INTENT')) NOT NULL,
  
  -- Step in the sequence (1,2,3,...)
  step_number int NOT NULL,
  
  -- Delay after trigger (in hours) before this step should send
  delay_hours int NOT NULL,
  
  -- Email templates (we'll still AI-personalize these)
  subject_template text NOT NULL,
  body_template text NOT NULL,
  
  is_active boolean DEFAULT true,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure unique step_number per workspace + intent
  UNIQUE(workspace_id, intent, step_number)
);

CREATE INDEX IF NOT EXISTS proposal_followup_templates_workspace_intent_idx
  ON public.proposal_followup_templates (workspace_id, intent, step_number);

CREATE INDEX IF NOT EXISTS proposal_followup_templates_active_idx
  ON public.proposal_followup_templates (workspace_id, intent, step_number)
  WHERE is_active = true;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_update_proposal_followup_templates_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_update_proposal_followup_templates_updated_at
BEFORE UPDATE ON public.proposal_followup_templates
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_proposal_followup_templates_updated_at();

-- ============================================================================
-- PART 2 — CREATE proposal_followups TABLE
-- ============================================================================
-- Concrete scheduled follow-ups tied to a specific proposal.

CREATE TABLE IF NOT EXISTS public.proposal_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  template_id uuid REFERENCES public.proposal_followup_templates(id),
  intent text CHECK (intent IN ('HOT','WARM','COLD','NO_INTENT')) NOT NULL,
  
  step_number int NOT NULL,
  channel text CHECK (channel IN ('email')) DEFAULT 'email',
  
  send_at timestamptz NOT NULL,
  
  status text CHECK (status IN ('pending','sent','cancelled','failed')) DEFAULT 'pending',
  last_error text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS proposal_followups_send_at_idx
  ON public.proposal_followups (status, send_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS proposal_followups_proposal_idx
  ON public.proposal_followups (proposal_id, status);

CREATE INDEX IF NOT EXISTS proposal_followups_lead_idx
  ON public.proposal_followups (lead_id, status);

CREATE INDEX IF NOT EXISTS proposal_followups_workspace_idx
  ON public.proposal_followups (workspace_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_update_proposal_followups_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER tr_update_proposal_followups_updated_at
BEFORE UPDATE ON public.proposal_followups
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_proposal_followups_updated_at();

-- ============================================================================
-- PART 3 — SEED DEFAULT ROOFING FOLLOW-UP RECIPES
-- ============================================================================
-- Default templates for workspace_id = '00000000-0000-0000-0000-000000000000' (global/system defaults)
-- Individual workspaces can override these later

-- HOT: homeowner clearly wants to move forward
INSERT INTO public.proposal_followup_templates
  (workspace_id, intent, step_number, delay_hours, subject_template, body_template)
VALUES
  (
    '00000000-0000-0000-0000-000000000000'::uuid, -- special "global" / system workspace
    'HOT', 1, 12,
    'Let''s Get Your Roof Scheduled',
    'Hi {{first_name}},

Thanks for your reply about the roof proposal. Let''s lock in a day that works best for you.

We currently have openings on {{next_open_slots}}.

Reply with a day/time that works or call/text us at {{company_phone}}.

– {{company_name}}'
  )
ON CONFLICT (workspace_id, intent, step_number) DO NOTHING;

-- WARM: questions / comparing quotes
INSERT INTO public.proposal_followup_templates
  (workspace_id, intent, step_number, delay_hours, subject_template, body_template)
VALUES
  (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'WARM', 1, 24,
    'Questions about your roof estimate?',
    'Hi {{first_name}},

Just checking in to see if you had any questions about the roofing estimate we sent over for {{property_city}}.

Most homeowners ask about materials, warranty, and timing — happy to walk through anything.

You can reply here or call/text {{company_phone}}.

– {{company_name}}'
  ),
  (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'WARM', 2, 72,
    'Still deciding on your roof project?',
    'Hi {{first_name}},

Roof projects are a big decision. If you''re comparing quotes, I''m happy to explain how our workmanship and warranty compare so you feel confident.

Would you like a quick 5–10 min call this week?

– {{company_name}}'
  )
ON CONFLICT (workspace_id, intent, step_number) DO NOTHING;

-- COLD: no response / delaying
INSERT INTO public.proposal_followup_templates
  (workspace_id, intent, step_number, delay_hours, subject_template, body_template)
VALUES
  (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'COLD', 1, 48,
    'Quick check-in on your roof estimate',
    'Hi {{first_name}},

Just wanted to quickly check in about the roof estimate for {{property_address}}.

No rush — I know life gets busy. If the timing isn''t right, just let us know. We can always revisit closer to your ideal date.

– {{company_name}}'
  )
ON CONFLICT (workspace_id, intent, step_number) DO NOTHING;

-- NO_INTENT: initial proposal sent, no reply yet
INSERT INTO public.proposal_followup_templates
  (workspace_id, intent, step_number, delay_hours, subject_template, body_template)
VALUES
  (
    '00000000-0000-0000-0000-000000000000'::uuid,
    'NO_INTENT', 1, 48,
    'Did you get a chance to review the roof proposal?',
    'Hi {{first_name}},

Just wanted to make sure you received the roof proposal we sent for {{property_address}}.

If you have any questions or want to discuss next steps, just reply here or call/text {{company_phone}}.

– {{company_name}}'
  )
ON CONFLICT (workspace_id, intent, step_number) DO NOTHING;

-- ============================================================================
-- PART 4 — FUNCTION: Create Follow-Ups for a Proposal
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_followups_for_proposal(
  p_proposal_id uuid, 
  p_intent text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_proposal record;
  v_template record;
  v_workspace_id uuid;
BEGIN
  -- Get proposal details
  SELECT * INTO v_proposal 
  FROM public.proposals 
  WHERE id = p_proposal_id;
  
  IF NOT FOUND THEN
    RETURN;
  END IF;
  
  v_workspace_id := v_proposal.workspace_id;
  
  -- Clear existing pending followups for this proposal
  UPDATE public.proposal_followups
  SET status = 'cancelled', updated_at = now()
  WHERE proposal_id = p_proposal_id AND status = 'pending';
  
  -- First try workspace-specific templates, then fall back to global defaults
  FOR v_template IN
    SELECT *
    FROM public.proposal_followup_templates
    WHERE (
      (workspace_id = v_workspace_id AND intent = p_intent AND is_active = true)
      OR
      (workspace_id = '00000000-0000-0000-0000-000000000000'::uuid AND intent = p_intent AND is_active = true)
    )
    ORDER BY 
      CASE WHEN workspace_id = v_workspace_id THEN 0 ELSE 1 END, -- workspace-specific first
      step_number
  LOOP
    -- Skip if we already have a workspace-specific template for this step
    IF EXISTS (
      SELECT 1 FROM public.proposal_followup_templates
      WHERE workspace_id = v_workspace_id 
        AND intent = p_intent 
        AND step_number = v_template.step_number
        AND is_active = true
    ) AND v_template.workspace_id != v_workspace_id THEN
      CONTINUE;
    END IF;
    
    INSERT INTO public.proposal_followups (
      proposal_id,
      lead_id,
      workspace_id,
      template_id,
      intent,
      step_number,
      send_at
    ) VALUES (
      v_proposal.id,
      v_proposal.lead_id,
      v_proposal.workspace_id,
      v_template.id,
      p_intent,
      v_template.step_number,
      now() + (v_template.delay_hours || ' hours')::interval
    );
  END LOOP;
END;
$$;

-- ============================================================================
-- PART 5 — TRIGGERS: Auto-Create Follow-Ups
-- ============================================================================

-- Trigger when proposal is first created (status = 'sent')
CREATE OR REPLACE FUNCTION public.proposals_after_insert_followups()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only create follow-ups if proposal is sent
  IF NEW.status = 'sent' THEN
    PERFORM public.create_followups_for_proposal(NEW.id, 'NO_INTENT');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proposals_after_insert_followups_trigger ON public.proposals;
CREATE TRIGGER proposals_after_insert_followups_trigger
AFTER INSERT ON public.proposals
FOR EACH ROW
WHEN (NEW.status = 'sent')
EXECUTE FUNCTION public.proposals_after_insert_followups();

-- Trigger when AI sets / updates intent
CREATE OR REPLACE FUNCTION public.proposals_after_update_followups()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- If proposal is DECLINE we cancel followups instead of creating
  IF NEW.intent = 'DECLINE' THEN
    UPDATE public.proposal_followups
    SET status = 'cancelled', updated_at = now()
    WHERE proposal_id = NEW.id AND status = 'pending';
    RETURN NEW;
  END IF;
  
  -- For HOT/WARM/COLD, re-generate followups using the new intent recipe
  IF NEW.intent IN ('HOT','WARM','COLD') THEN
    PERFORM public.create_followups_for_proposal(NEW.id, NEW.intent);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proposals_after_update_followups_trigger ON public.proposals;
CREATE TRIGGER proposals_after_update_followups_trigger
AFTER UPDATE ON public.proposals
FOR EACH ROW
WHEN (OLD.intent IS DISTINCT FROM NEW.intent)
EXECUTE FUNCTION public.proposals_after_update_followups();

-- ============================================================================
-- PART 6 — TRIGGER: Cancel Follow-Ups When Job Is Won or Lost
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_followups_on_lead_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('won','lost') THEN
    UPDATE public.proposal_followups
    SET status = 'cancelled', updated_at = now()
    WHERE lead_id = NEW.id AND status = 'pending';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cancel_followups_on_lead_status_trigger ON public.leads;
CREATE TRIGGER cancel_followups_on_lead_status_trigger
AFTER UPDATE ON public.leads
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.cancel_followups_on_lead_status();

-- ============================================================================
-- PART 7 — ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.proposal_followup_templates ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view templates in their workspace
CREATE POLICY "Users can view templates in their workspace"
  ON public.proposal_followup_templates FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
    OR workspace_id = '00000000-0000-0000-0000-000000000000'::uuid -- global defaults
  );

-- Policy: Users can manage templates in their workspace
CREATE POLICY "Users can manage templates in their workspace"
  ON public.proposal_followup_templates FOR ALL
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

ALTER TABLE public.proposal_followups ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view follow-ups in their workspace
CREATE POLICY "Users can view follow-ups in their workspace"
  ON public.proposal_followups FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Policy: System can insert/update follow-ups
CREATE POLICY "System can manage follow-ups"
  ON public.proposal_followups FOR ALL
  WITH CHECK (true);

-- ============================================================================
-- PART 8 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.proposal_followup_templates IS 'Block 22262: Contractor-level recipes for follow-ups based on intent (HOT/WARM/COLD/NO_INTENT)';
COMMENT ON TABLE public.proposal_followups IS 'Block 22262: Concrete scheduled follow-ups tied to specific proposals';
COMMENT ON FUNCTION public.create_followups_for_proposal IS 'Block 22262: Creates scheduled follow-ups for a proposal based on intent templates';








































