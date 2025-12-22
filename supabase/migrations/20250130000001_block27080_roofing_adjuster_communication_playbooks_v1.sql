-- =========================================================
-- Block 27080 — SmartSend Roofing Adjuster Communication Playbooks v1
-- (Pre-written adjuster emails • Dispute scripts • Documentation requests • Tone ladder • One-click send)
-- =========================================================
-- 
-- This block transforms SmartSend into the roofer's insurance negotiation assistant.
-- 
-- Roofers LOSE MONEY because:
-- - They don't know how to talk to adjusters
-- - Their emails sound angry or unprofessional
-- - They fail to provide the right documentation
-- - They don't know how to dispute properly
-- - They don't know the "tone ladder" (soft → firm → escalation)
-- - They forget key language adjusters require
-- 
-- SmartSend will now auto-generate perfect adjuster communication:
-- - Professional, clean, respectful, assertive, and legally safe.
-- 
-- This is the bridge between the Supplement Builder v1 and actual approval.

-- ============================================================================
-- PART 1 — CREATE roofing_adjuster_playbooks TABLE
-- ============================================================================
-- Stores email templates for different adjuster communication scenarios

CREATE TABLE IF NOT EXISTS public.roofing_adjuster_playbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_name text NOT NULL,
  tone text CHECK (tone IN ('friendly', 'firm', 'assertive', 'escalation')) NOT NULL,
  subject_template text NOT NULL,
  body_template text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_roofing_adjuster_playbooks_tone ON public.roofing_adjuster_playbooks(tone);
CREATE INDEX IF NOT EXISTS idx_roofing_adjuster_playbooks_created_at ON public.roofing_adjuster_playbooks(created_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.tg_update_roofing_adjuster_playbooks_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_roofing_adjuster_playbooks_updated_at
BEFORE UPDATE ON public.roofing_adjuster_playbooks
FOR EACH ROW
EXECUTE FUNCTION public.tg_update_roofing_adjuster_playbooks_updated_at();

-- ============================================================================
-- PART 2 — SEED DEFAULT PLAYBOOK TEMPLATES
-- ============================================================================

INSERT INTO public.roofing_adjuster_playbooks (playbook_name, tone, subject_template, body_template)
VALUES
('Initial Supplement Submission', 'friendly',
 'Additional Documentation for Claim {{claim_number}}',
 'Hi {{adjuster_name}},

Attached is our supplemental documentation for {{property_address}}.

After completing our field inspection, we identified several necessary items that were not included in the initial estimate. These items are required for proper installation and code compliance.

Key items included in this supplement:
{{supplement_items}}

We have attached:
- Field photos documenting the damage
- Code references where applicable
- Manufacturer specifications where required

Please review and let us know if you need any additional information.

Thank you for your time and attention to this matter.

Best regards,
{{company_name}}'),

('Request for Missing Items Approval', 'firm',
 'Request for Review – Omitted Line Items for {{claim_number}}',
 'Hi {{adjuster_name}},

After reviewing the initial estimate for {{property_address}}, we noticed a few necessary items missing that are required for proper installation and code compliance.

Missing items include:
{{supplement_items}}

These items are necessary because:
{{supplement_rationale}}

We have attached supporting documentation including:
- Field photos showing the damage
- Code references ({{code_references}})
- Manufacturer specifications

We respectfully request a review of these items. Please let us know if you need any additional documentation or clarification.

Thank you for your consideration.

Best regards,
{{company_name}}'),

('Dispute – Underpaid Scope', 'assertive',
 'Request for Re-Evaluation – Scope Concerns for {{claim_number}}',
 'Hi {{adjuster_name}},

Based on our field inspection and documented damage at {{property_address}}, we have concerns regarding the scope of work outlined in the initial estimate.

Our inspection revealed additional damage that was not accounted for in the estimate:
{{supplement_items}}

Supporting documentation:
- Detailed field photos showing all damage
- Code requirements ({{code_references}})
- Manufacturer specifications
- Inspection summary

We believe these items are necessary to restore the property to its pre-loss condition and ensure code compliance.

We respectfully request a re-evaluation of the scope. We are happy to provide any additional documentation or schedule a reinspection if needed.

Thank you for your attention to this matter.

Best regards,
{{company_name}}'),

('Reinspection Request', 'assertive',
 'Reinspection Request – New Evidence for {{claim_number}}',
 'Hi {{adjuster_name}},

We have updated field photos that clearly show additional damage at {{property_address}} that was not visible during the initial inspection.

New evidence includes:
{{supplement_items}}

We have attached:
- Updated field photos with timestamps
- Detailed documentation of the damage
- Code references where applicable

We respectfully request a reinspection to review this new evidence. We are available to meet at your convenience.

Thank you for your consideration.

Best regards,
{{company_name}}'),

('Supervisor Escalation Notice', 'escalation',
 'Request for Supervisor Review – Claim {{claim_number}}',
 'Hello,

We respectfully request a supervisor review of the claim for {{property_address}} (Claim #{{claim_number}}).

Despite providing comprehensive documentation and multiple follow-ups, we have been unable to resolve concerns regarding the scope of work and missing line items.

Summary of concerns:
{{supplement_items}}

We have provided:
- Field photos documenting all damage
- Code references and manufacturer specifications
- Multiple attempts to resolve through standard channels

We believe these items are necessary to restore the property to its pre-loss condition and ensure code compliance.

We are requesting supervisor review to ensure all necessary work is properly accounted for in the claim.

Thank you for your attention to this matter.

Best regards,
{{company_name}}');

-- ============================================================================
-- PART 3 — RLS POLICIES
-- ============================================================================

ALTER TABLE public.roofing_adjuster_playbooks ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read playbooks (they are templates)
CREATE POLICY "roofing adjuster playbooks select"
  ON public.roofing_adjuster_playbooks
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Service role can do everything (for edge functions)
CREATE POLICY "roofing adjuster playbooks service role all"
  ON public.roofing_adjuster_playbooks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- PART 4 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.roofing_adjuster_playbooks IS 'Block 27080: Email templates for adjuster communication with tone ladder (friendly → firm → assertive → escalation)';
COMMENT ON COLUMN public.roofing_adjuster_playbooks.tone IS 'Block 27080: Communication tone: friendly (initial), firm (clarification), assertive (pushback), escalation (supervisor)';
COMMENT ON COLUMN public.roofing_adjuster_playbooks.subject_template IS 'Block 27080: Email subject template with placeholders like {{claim_number}}, {{property_address}}';
COMMENT ON COLUMN public.roofing_adjuster_playbooks.body_template IS 'Block 27080: Email body template with placeholders for job details, supplement items, rationale';



































