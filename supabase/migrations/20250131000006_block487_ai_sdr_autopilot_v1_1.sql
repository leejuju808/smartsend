-- Block 487 — AI SDR Autopilot v1.1
-- Playbooks: auto-follow-up templates based on intent_label + stage

-- 1) Leads: allow "never email again"
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN DEFAULT FALSE;

-- 2) Playbook rules table
CREATE TABLE IF NOT EXISTS sdr_playbook_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NULL, -- if you don't have orgs, leave it null / ignore
  intent_label TEXT NOT NULL,       -- e.g. 'needs_info', 'ready_to_meet', 'not_interested'
  pipeline_stage TEXT NOT NULL,     -- e.g. 'new', 'interested', 'qualified', 'any'
  delay_minutes INTEGER NOT NULL DEFAULT 0,      -- when to send follow-up
  template_key TEXT NOT NULL,                   -- which template to use
  stop_outreach BOOLEAN NOT NULL DEFAULT FALSE, -- true = no more emails
  update_pipeline_stage TEXT NULL,              -- optional override (e.g. 'dead')
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- one rule per (org_id, intent_label, pipeline_stage)
CREATE UNIQUE INDEX IF NOT EXISTS sdr_playbook_rules_org_intent_stage_idx
ON sdr_playbook_rules (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), intent_label, pipeline_stage);

-- 3) Autopilot queue: AI SDR scheduled sends
CREATE TABLE IF NOT EXISTS sdr_autopilot_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  reply_id UUID NULL REFERENCES lead_replies(id) ON DELETE SET NULL,
  rule_id UUID NULL REFERENCES sdr_playbook_rules(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'email', -- future: 'sms', 'whatsapp', etc.
  template_key TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'sent' | 'skipped' | 'cancelled'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sdr_autopilot_queue_status_scheduled_idx
ON sdr_autopilot_queue (status, scheduled_at);

CREATE INDEX IF NOT EXISTS sdr_autopilot_queue_lead_id_idx
ON sdr_autopilot_queue (lead_id);

-- RLS policies
ALTER TABLE sdr_playbook_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdr_autopilot_queue ENABLE ROW LEVEL SECURITY;

-- Service role can manage playbook rules
CREATE POLICY "service_role_manage_playbook_rules" ON sdr_playbook_rules
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Service role can manage autopilot queue
CREATE POLICY "service_role_manage_autopilot_queue" ON sdr_autopilot_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Users can view playbook rules for their org
CREATE POLICY "users_view_playbook_rules" ON sdr_playbook_rules
  FOR SELECT TO authenticated
  USING (
    org_id IS NULL OR
    org_id IN (
      SELECT org_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can view autopilot queue for their leads
CREATE POLICY "users_view_autopilot_queue" ON sdr_autopilot_queue
  FOR SELECT TO authenticated
  USING (
    lead_id IN (
      SELECT l.id FROM leads l
      INNER JOIN workspace_members wm ON l.workspace_id = wm.workspace_id
      WHERE wm.user_id = auth.uid()
    )
  );

-- Updated_at trigger for playbook_rules
CREATE OR REPLACE FUNCTION update_sdr_playbook_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sdr_playbook_rules_updated_at ON sdr_playbook_rules;
CREATE TRIGGER trg_sdr_playbook_rules_updated_at
  BEFORE UPDATE ON sdr_playbook_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_sdr_playbook_rules_updated_at();

-- Seed default global rules (org_id = NULL, pipeline_stage 'any' means fallback)
INSERT INTO sdr_playbook_rules (org_id, intent_label, pipeline_stage, delay_minutes, template_key, stop_outreach, update_pipeline_stage)
VALUES
  -- Hard NOs
  (NULL, 'unsubscribe',    'any', 0,  'unsubscribe_ack', TRUE,  'dead'),
  (NULL, 'not_interested', 'any', 0,  'no_followup',     TRUE,  'dead'),

  -- Needs info → answer in 30 minutes
  (NULL, 'needs_info', 'any', 30, 'answer_questions', FALSE, NULL),

  -- "Ping me later" → bump in 7 days
  (NULL, 'follow_up_later', 'any', 7 * 24 * 60, 'check_back_later', FALSE, NULL),

  -- Soft interest → gentle nudge in 2 days
  (NULL, 'open_to_chat', 'any', 2 * 24 * 60, 'nudge_to_meeting', FALSE, NULL),

  -- Ready to meet → fast reply in 15 minutes
  (NULL, 'ready_to_meet', 'any', 15, 'confirm_meeting', FALSE, 'meeting_booked'),

  -- Referral → reach out to referred contact ASAP (you'll hook later)
  (NULL, 'referral', 'any', 60, 'referral_followup', FALSE, NULL),

  -- OOO → re-ping 3 days after
  (NULL, 'out_of_office', 'any', 3 * 24 * 60, 'after_ooo_followup', FALSE, NULL)

ON CONFLICT DO NOTHING;

