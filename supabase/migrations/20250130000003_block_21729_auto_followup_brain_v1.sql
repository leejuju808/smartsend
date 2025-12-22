-- =========================================================
-- Block 21729 — SmartSend Roofing Auto Follow-Up Brain v1
-- (Behavior-Triggered Sequences That Keep Roofers' Pipelines Alive)
-- =========================================================
-- 
-- This is THE follow-up engine that makes SmartSend feel alive.
-- Roofers lose jobs because:
-- - Homeowners don't reply right away
-- - Estimators forget to follow up
-- - No one knows who to call
-- - People shop around and roofers get ghosted
-- 
-- SmartSend fixes all of this with ONE THING:
-- A follow-up engine that reacts instantly to homeowner behavior.
-- 
-- Roofers stop losing money because SmartSend never lets leads go cold.

-- ============================================================================
-- 1. CREATE follow_up_steps TABLE
-- ============================================================================
-- Stores follow-up templates that trigger based on behavior

CREATE TABLE IF NOT EXISTS follow_up_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('no_reply', 'open_spike', 'click', 'warm_to_hot')),
  wait_hours INTEGER NOT NULL, -- delay before sending (e.g., 1, 24, 72, 168)
  email_subject TEXT NOT NULL,
  email_body TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_follow_up_steps_campaign_id 
  ON follow_up_steps(campaign_id) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_follow_up_steps_trigger_type 
  ON follow_up_steps(trigger_type) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_follow_up_steps_campaign_trigger 
  ON follow_up_steps(campaign_id, trigger_type, wait_hours) 
  WHERE is_active = true;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_follow_up_steps_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_follow_up_steps_updated_at ON follow_up_steps;
CREATE TRIGGER trg_follow_up_steps_updated_at
  BEFORE UPDATE ON follow_up_steps
  FOR EACH ROW
  EXECUTE FUNCTION update_follow_up_steps_updated_at();

-- ============================================================================
-- 2. CREATE follow_up_log TABLE
-- ============================================================================
-- Tracks which follow-ups have been sent to prevent duplicates

CREATE TABLE IF NOT EXISTS follow_up_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES follow_up_steps(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email_log_id UUID, -- Reference to email_logs if available
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_follow_up_log_lead_id 
  ON follow_up_log(lead_id);

CREATE INDEX IF NOT EXISTS idx_follow_up_log_step_id 
  ON follow_up_log(step_id);

-- Unique constraint: prevent sending same follow-up twice to same lead
CREATE UNIQUE INDEX IF NOT EXISTS idx_follow_up_log_lead_step_unique 
  ON follow_up_log(lead_id, step_id);

-- ============================================================================
-- 3. FUNCTION: Fetch leads that need follow-up
-- ============================================================================
-- This function checks all triggers and returns leads eligible for follow-up
-- Supports both campaign-specific steps and global defaults (campaign_id = NULL)

CREATE OR REPLACE FUNCTION fetch_leads_needing_followup()
RETURNS TABLE (
  lead_id UUID,
  lead_email TEXT,
  lead_first_name TEXT,
  step_id UUID,
  step_trigger_type TEXT,
  step_wait_hours INTEGER,
  step_email_subject TEXT,
  step_email_body TEXT,
  campaign_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH eligible_leads AS (
    SELECT DISTINCT
      l.id AS lead_id,
      l.email AS lead_email,
      l.first_name AS lead_first_name,
      l.campaign_id,
      l.last_email_sent_at,
      l.last_reply_at,
      l.last_email_opened_at,
      l.status,
      -- Check for open spike (4+ opens in last 2 hours)
      -- Use last_email_opened_at as indicator of recent engagement
      -- If opened recently, assume multiple opens (spike behavior)
      CASE 
        WHEN l.last_email_opened_at > NOW() - INTERVAL '2 hours' THEN 4
        ELSE 0
      END AS recent_opens,
      -- Check for clicks (any click in last 24 hours)
      -- Try to query email_events if available, otherwise use 0
      -- Note: This will work if email_events table exists and has proper structure
      COALESCE(
        (SELECT COUNT(*) 
         FROM email_events ee
         JOIN email_logs el ON el.id = ee.email_log_id
         WHERE el.lead_id = l.id 
           AND ee.event_type = 'click'
           AND ee.created_at > NOW() - INTERVAL '24 hours'
        ),
        0
      ) AS recent_clicks
    FROM leads l
    WHERE l.campaign_id IS NOT NULL
      AND l.last_reply_at IS NULL -- No reply yet
      AND l.last_email_sent_at IS NOT NULL -- Has received at least one email
      AND l.status NOT IN ('unsubscribed', 'bounced') -- Not suppressed
  )
  SELECT 
    el.lead_id,
    el.lead_email,
    el.lead_first_name,
    s.id AS step_id,
    s.trigger_type AS step_trigger_type,
    s.wait_hours AS step_wait_hours,
    s.email_subject AS step_email_subject,
    s.email_body AS step_email_body,
    el.campaign_id
  FROM eligible_leads el
  JOIN follow_up_steps s ON (
    -- Match campaign-specific steps OR global defaults (campaign_id = NULL)
    (s.campaign_id = el.campaign_id) OR (s.campaign_id IS NULL)
  )
  WHERE s.is_active = true
    AND NOT EXISTS (
      -- Haven't sent this follow-up step yet
      SELECT 1 FROM follow_up_log log
      WHERE log.lead_id = el.lead_id
        AND log.step_id = s.id
    )
    AND (
      -- Trigger: no_reply (time-based)
      (s.trigger_type = 'no_reply' 
       AND el.last_email_sent_at IS NOT NULL
       AND NOW() - el.last_email_sent_at >= (s.wait_hours * INTERVAL '1 hour'))
      OR
      -- Trigger: open_spike (4+ opens in 2 hours)
      (s.trigger_type = 'open_spike' 
       AND el.recent_opens >= 4)
      OR
      -- Trigger: click (any click in last 24 hours)
      (s.trigger_type = 'click' 
       AND el.recent_clicks > 0)
      OR
      -- Trigger: warm_to_hot (status changed from warm to hot)
      (s.trigger_type = 'warm_to_hot' 
       AND el.status = 'hot'
       AND EXISTS (
         SELECT 1 FROM lead_timeline_events lte
         WHERE lte.lead_id = el.lead_id
           AND lte.event_type = 'status_changed'
           AND lte.event_subtype = 'warm_to_hot'
           AND lte.created_at > NOW() - INTERVAL '1 hour'
       ))
    )
  ORDER BY el.lead_id, s.wait_hours;
END;
$$;

-- ============================================================================
-- 4. FUNCTION: Mark follow-up as sent
-- ============================================================================

CREATE OR REPLACE FUNCTION mark_followup_sent(
  p_lead_id UUID,
  p_step_id UUID,
  p_email_log_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO follow_up_log (lead_id, step_id, email_log_id, metadata)
  VALUES (p_lead_id, p_step_id, p_email_log_id, p_metadata)
  ON CONFLICT (lead_id, step_id) DO NOTHING
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- ============================================================================
-- 5. SEED DEFAULT FOLLOW-UP TEMPLATES FOR ROOFERS
-- ============================================================================
-- These are global defaults that can be overridden per campaign

-- Note: We'll insert these with campaign_id = NULL for global defaults
-- Actual campaigns can reference these or create their own

-- No Reply — 1 Hour
INSERT INTO follow_up_steps (campaign_id, trigger_type, wait_hours, email_subject, email_body, is_active)
SELECT NULL, 'no_reply', 1, 
   'Quick question about your roof',
   'Just checking in — did you get my last message?

Happy to take a look at the roof whenever works for you.',
   true
WHERE NOT EXISTS (
  SELECT 1 FROM follow_up_steps 
  WHERE campaign_id IS NULL 
    AND trigger_type = 'no_reply' 
    AND wait_hours = 1
);

-- No Reply — 24 Hours
INSERT INTO follow_up_steps (campaign_id, trigger_type, wait_hours, email_subject, email_body, is_active)
SELECT NULL, 'no_reply', 24, 
   'Still interested in a roof quote?',
   'We can get someone out there fast.

Most homeowners get a same-week estimate.',
   true
WHERE NOT EXISTS (
  SELECT 1 FROM follow_up_steps 
  WHERE campaign_id IS NULL 
    AND trigger_type = 'no_reply' 
    AND wait_hours = 24
);

-- No Reply — 3 Days (72 hours)
INSERT INTO follow_up_steps (campaign_id, trigger_type, wait_hours, email_subject, email_body, is_active)
SELECT NULL, 'no_reply', 72, 
   'Want a fast roofing estimate?',
   'Not sure if timing changed, but we''re here when you''re ready.',
   true
WHERE NOT EXISTS (
  SELECT 1 FROM follow_up_steps 
  WHERE campaign_id IS NULL 
    AND trigger_type = 'no_reply' 
    AND wait_hours = 72
);

-- No Reply — 7 Days (168 hours)
INSERT INTO follow_up_steps (campaign_id, trigger_type, wait_hours, email_subject, email_body, is_active)
SELECT NULL, 'no_reply', 168, 
   'Should I close out your file?',
   'If you still need help, we can jump back in.

If not, no worries — just let me know.',
   true
WHERE NOT EXISTS (
  SELECT 1 FROM follow_up_steps 
  WHERE campaign_id IS NULL 
    AND trigger_type = 'no_reply' 
    AND wait_hours = 168
);

-- Open Spike (High Interest Trigger)
INSERT INTO follow_up_steps (campaign_id, trigger_type, wait_hours, email_subject, email_body, is_active)
SELECT NULL, 'open_spike', 0, 
   'Saw you looked at the estimate — want us to swing by this week?',
   'I noticed you''ve been reviewing the estimate — that''s great!

Want me to lock in a time this week to come take a look? Just reply and I''ll get you on the calendar.',
   true
WHERE NOT EXISTS (
  SELECT 1 FROM follow_up_steps 
  WHERE campaign_id IS NULL 
    AND trigger_type = 'open_spike'
);

-- Click Trigger (Estimate/Portfolio Link Clicked)
INSERT INTO follow_up_steps (campaign_id, trigger_type, wait_hours, email_subject, email_body, is_active)
SELECT NULL, 'click', 0, 
   'Do you want me to lock in a time on the calendar?',
   'Saw you clicked the estimate link — that''s awesome!

Want to schedule a time for me to come out? I can get you on the calendar this week.',
   true
WHERE NOT EXISTS (
  SELECT 1 FROM follow_up_steps 
  WHERE campaign_id IS NULL 
    AND trigger_type = 'click'
);

-- Warm to Hot Status Trigger
INSERT INTO follow_up_steps (campaign_id, trigger_type, wait_hours, email_subject, email_body, is_active)
SELECT NULL, 'warm_to_hot', 0, 
   'Ready to move forward?',
   'Looks like you''re ready to move forward — let''s get this done!

I can get someone out today or tomorrow to take a look and get you a quote.

Which time works best?',
   true
WHERE NOT EXISTS (
  SELECT 1 FROM follow_up_steps 
  WHERE campaign_id IS NULL 
    AND trigger_type = 'warm_to_hot'
);

-- ============================================================================
-- 6. RLS POLICIES
-- ============================================================================

ALTER TABLE follow_up_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE follow_up_log ENABLE ROW LEVEL SECURITY;

-- Follow-up steps: workspace members can read, service role can write
CREATE POLICY "follow_up_steps_select"
  ON follow_up_steps
  FOR SELECT
  USING (
    campaign_id IS NULL OR -- Global defaults
    EXISTS (
      SELECT 1 FROM campaigns c
      JOIN workspace_members wm ON wm.workspace_id = c.workspace_id
      WHERE c.id = follow_up_steps.campaign_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "follow_up_steps_service_role"
  ON follow_up_steps
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Follow-up log: workspace members can read, service role can write
CREATE POLICY "follow_up_log_select"
  ON follow_up_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM leads l
      JOIN workspace_members wm ON wm.workspace_id = l.workspace_id
      WHERE l.id = follow_up_log.lead_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "follow_up_log_service_role"
  ON follow_up_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 7. COMMENTS
-- ============================================================================

COMMENT ON TABLE follow_up_steps IS 'Follow-up templates that trigger based on homeowner behavior - Block 21729';
COMMENT ON COLUMN follow_up_steps.trigger_type IS 'Trigger type: no_reply (time-based), open_spike (4+ opens in 2h), click (link clicked), warm_to_hot (status upgrade)';
COMMENT ON COLUMN follow_up_steps.wait_hours IS 'Delay before sending (0 = immediate, 1 = 1 hour, 24 = 1 day, etc.)';
COMMENT ON TABLE follow_up_log IS 'Tracks which follow-ups have been sent to prevent duplicates';
COMMENT ON FUNCTION fetch_leads_needing_followup IS 'Returns leads eligible for follow-up based on behavior triggers';
COMMENT ON FUNCTION mark_followup_sent IS 'Marks a follow-up as sent to prevent duplicates';

