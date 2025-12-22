-- Block 24020 — SmartSend Roofing A/B Testing Engine v1
-- Automatic Subject Line Testing • Template Experiments • Smart Self-Improving Campaigns
-- Zero-config A/B testing that automatically improves campaigns for roofers

-- ============================================================================
-- 1. AB_TESTS TABLE — Main test container
-- ============================================================================
CREATE TABLE IF NOT EXISTS ab_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  test_type TEXT NOT NULL CHECK (test_type IN ('subject_line', 'opening_line', 'cta_style', 'followup_timing')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'cancelled')),
  test_split_percent INT NOT NULL DEFAULT 15 CHECK (test_split_percent BETWEEN 10 AND 20),
  min_sample_size INT NOT NULL DEFAULT 50, -- minimum emails per variant before declaring winner
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  winner_variant_id UUID, -- set when test completes
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ab_tests_campaign ON ab_tests(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ab_tests_status ON ab_tests(status);
CREATE INDEX IF NOT EXISTS idx_ab_tests_workspace ON ab_tests(workspace_id);

-- ============================================================================
-- 2. AB_TEST_VARIANTS TABLE — Test variations (A vs B)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ab_test_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ab_test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
  variant_label TEXT NOT NULL, -- 'A' or 'B'
  subject_line TEXT, -- for subject_line tests
  opening_line TEXT, -- for opening_line tests
  cta_text TEXT, -- for cta_style tests
  followup_timing_days INT, -- for followup_timing tests
  emails_sent INT NOT NULL DEFAULT 0,
  emails_opened INT NOT NULL DEFAULT 0,
  emails_replied INT NOT NULL DEFAULT 0,
  open_rate NUMERIC(5,2) DEFAULT 0, -- percentage
  reply_rate NUMERIC(5,2) DEFAULT 0, -- percentage
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ab_test_variants_test ON ab_test_variants(ab_test_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_variants_label ON ab_test_variants(ab_test_id, variant_label);

-- ============================================================================
-- 3. AB_TEST_RECIPIENTS TABLE — Track which recipients got which variant
-- ============================================================================
CREATE TABLE IF NOT EXISTS ab_test_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ab_test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES ab_test_variants(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  email_log_id UUID, -- reference to email_logs or send_queue entry
  opened_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ab_test_recipients_test ON ab_test_recipients(ab_test_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_recipients_variant ON ab_test_recipients(variant_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_recipients_lead ON ab_test_recipients(lead_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ab_test_recipients_unique ON ab_test_recipients(ab_test_id, lead_id);

-- ============================================================================
-- 4. ROOFING_BRAIN TABLE — Aggregate learnings across all roofers
-- ============================================================================
CREATE TABLE IF NOT EXISTS roofing_brain (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_type TEXT NOT NULL CHECK (learning_type IN ('subject_line', 'opening_line', 'cta_style', 'followup_timing', 'regional_pattern')),
  pattern_key TEXT NOT NULL, -- e.g., 'weather_subject_florida', 'soft_cta_washington'
  pattern_value TEXT NOT NULL, -- the actual subject/opener/cta that works
  region TEXT, -- state or city if regional
  industry TEXT DEFAULT 'roofing',
  total_tests INT NOT NULL DEFAULT 0,
  total_wins INT NOT NULL DEFAULT 0,
  avg_open_rate NUMERIC(5,2),
  avg_reply_rate NUMERIC(5,2),
  confidence_score NUMERIC(3,2) DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 1),
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_roofing_brain_pattern ON roofing_brain(learning_type, pattern_key, COALESCE(region, ''));
CREATE INDEX IF NOT EXISTS idx_roofing_brain_region ON roofing_brain(region);
CREATE INDEX IF NOT EXISTS idx_roofing_brain_confidence ON roofing_brain(confidence_score DESC);

-- ============================================================================
-- 5. AB_TEST_RESULTS TABLE — Simple results summary for roofers
-- ============================================================================
CREATE TABLE IF NOT EXISTS ab_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ab_test_id UUID NOT NULL REFERENCES ab_tests(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  winner_variant_id UUID NOT NULL REFERENCES ab_test_variants(id) ON DELETE CASCADE,
  winner_label TEXT NOT NULL, -- 'A' or 'B'
  winner_open_rate NUMERIC(5,2) NOT NULL,
  winner_reply_rate NUMERIC(5,2) NOT NULL,
  improvement_percent NUMERIC(5,2), -- % improvement over losing variant
  summary_text TEXT NOT NULL, -- "Version A wins: 12.4% reply rate vs 8.2%"
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ab_test_results_campaign ON ab_test_results(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ab_test_results_test ON ab_test_results(ab_test_id);

-- ============================================================================
-- 6. TRIGGERS — Auto-update timestamps
-- ============================================================================
CREATE OR REPLACE FUNCTION update_ab_tests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ab_tests_updated_at
BEFORE UPDATE ON ab_tests
FOR EACH ROW
EXECUTE FUNCTION update_ab_tests_updated_at();

CREATE TRIGGER trg_ab_test_variants_updated_at
BEFORE UPDATE ON ab_test_variants
FOR EACH ROW
EXECUTE FUNCTION update_ab_tests_updated_at();

-- ============================================================================
-- 7. FUNCTION — Check if campaign should auto-test
-- ============================================================================
CREATE OR REPLACE FUNCTION should_auto_test_ab(p_campaign_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_campaign RECORD;
  v_total_sent INT;
  v_open_rate NUMERIC;
  v_days_running INT;
  v_is_storm_campaign BOOLEAN;
BEGIN
  -- Get campaign details
  SELECT 
    c.*,
    COALESCE(c.name, c.title, '') LIKE '%storm%' OR COALESCE(c.name, c.title, '') LIKE '%Storm%' AS is_storm
  INTO v_campaign
  FROM campaigns c
  WHERE c.id = p_campaign_id;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Check if test already exists
  IF EXISTS (SELECT 1 FROM ab_tests WHERE campaign_id = p_campaign_id AND status = 'running') THEN
    RETURN FALSE;
  END IF;
  
  -- Count total sent emails for this campaign
  SELECT COUNT(*) INTO v_total_sent
  FROM send_queue sq
  WHERE sq.campaign_id = p_campaign_id AND sq.status = 'sent';
  
  -- Calculate open rate (simplified - check if email_events table exists via information_schema)
  -- Default to 0 if we can't calculate
  v_open_rate := 0;
  
  -- Try to calculate open rate if email_events exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'email_events'
  ) THEN
    SELECT 
      CASE 
        WHEN COUNT(DISTINCT sq.id) > 0 THEN 
          (COUNT(DISTINCT ee.id)::NUMERIC / COUNT(DISTINCT sq.id)::NUMERIC * 100)
        ELSE 0
      END
    INTO v_open_rate
    FROM send_queue sq
    LEFT JOIN email_events ee ON ee.campaign_id = sq.campaign_id 
      AND ee.lead_id = sq.lead_id 
      AND ee.event_type = 'open'
    WHERE sq.campaign_id = p_campaign_id AND sq.status = 'sent';
  END IF;
  
  -- Calculate days running
  SELECT EXTRACT(DAY FROM (now() - v_campaign.created_at)) INTO v_days_running;
  
  -- Auto-test triggers:
  -- 1. Campaign hits 1,000+ sends
  IF v_total_sent >= 1000 THEN
    RETURN TRUE;
  END IF;
  
  -- 2. Open rate drops below 25%
  IF v_open_rate < 25 AND v_total_sent >= 100 THEN
    RETURN TRUE;
  END IF;
  
  -- 3. Campaign runs for more than 3 weeks
  IF v_days_running > 21 THEN
    RETURN TRUE;
  END IF;
  
  -- 4. Storm campaign
  IF v_campaign.is_storm THEN
    RETURN TRUE;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. FUNCTION — Create A/B test automatically
-- ============================================================================
CREATE OR REPLACE FUNCTION create_auto_ab_test(
  p_campaign_id UUID,
  p_test_type TEXT DEFAULT 'subject_line'
)
RETURNS UUID AS $$
DECLARE
  v_test_id UUID;
  v_campaign RECORD;
  v_variant_a_id UUID;
  v_variant_b_id UUID;
  v_base_subject TEXT;
  v_base_body TEXT;
  v_opening_line TEXT;
  v_cta_text TEXT;
  v_subject_a TEXT;
  v_subject_b TEXT;
BEGIN
  -- Get campaign details
  SELECT c.*, w.id as workspace_id
  INTO v_campaign
  FROM campaigns c
  LEFT JOIN workspaces w ON w.id = c.workspace_id
  WHERE c.id = p_campaign_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campaign not found';
  END IF;
  
  -- Extract base content
  v_base_subject := COALESCE(v_campaign.subject, '');
  v_base_body := COALESCE(v_campaign.body_template, v_campaign.body_html, '');
  
  -- Create test
  INSERT INTO ab_tests (campaign_id, workspace_id, test_type, status)
  VALUES (p_campaign_id, v_campaign.workspace_id, p_test_type, 'running')
  RETURNING id INTO v_test_id;
  
  -- Generate variants based on test type
  IF p_test_type = 'subject_line' THEN
    -- Generate subject line variations
    v_subject_a := generate_subject_variant_a(v_base_subject, v_campaign.workspace_id);
    v_subject_b := generate_subject_variant_b(v_base_subject, v_campaign.workspace_id);
    
    INSERT INTO ab_test_variants (ab_test_id, variant_label, subject_line)
    VALUES 
      (v_test_id, 'A', v_subject_a),
      (v_test_id, 'B', v_subject_b)
    RETURNING id INTO v_variant_a_id;
    
    SELECT id INTO v_variant_b_id FROM ab_test_variants WHERE ab_test_id = v_test_id AND variant_label = 'B';
    
  ELSIF p_test_type = 'opening_line' THEN
    -- Generate opening line variations
    INSERT INTO ab_test_variants (ab_test_id, variant_label, opening_line)
    VALUES 
      (v_test_id, 'A', extract_opening_line(v_base_body) || ' (Saw you requested info earlier…)'),
      (v_test_id, 'B', extract_opening_line(v_base_body) || ' (Just reaching out about your roof…)')
    RETURNING id INTO v_variant_a_id;
    
    SELECT id INTO v_variant_b_id FROM ab_test_variants WHERE ab_test_id = v_test_id AND variant_label = 'B';
    
  ELSIF p_test_type = 'cta_style' THEN
    -- Generate CTA variations (soft vs direct)
    INSERT INTO ab_test_variants (ab_test_id, variant_label, cta_text)
    VALUES 
      (v_test_id, 'A', 'Do you still need a roof inspection?'),
      (v_test_id, 'B', 'Want us to stop by tomorrow?')
    RETURNING id INTO v_variant_a_id;
    
    SELECT id INTO v_variant_b_id FROM ab_test_variants WHERE ab_test_id = v_test_id AND variant_label = 'B';
    
  ELSIF p_test_type = 'followup_timing' THEN
    -- Generate timing variations
    INSERT INTO ab_test_variants (ab_test_id, variant_label, followup_timing_days)
    VALUES 
      (v_test_id, 'A', 2),
      (v_test_id, 'B', 3)
    RETURNING id INTO v_variant_a_id;
    
    SELECT id INTO v_variant_b_id FROM ab_test_variants WHERE ab_test_id = v_test_id AND variant_label = 'B';
  END IF;
  
  RETURN v_test_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. HELPER FUNCTIONS — Generate variants using roofing brain
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_subject_variant_a(p_base_subject TEXT, p_workspace_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_region TEXT;
  v_brain_subject TEXT;
BEGIN
  -- Try to get region from workspace/leads
  SELECT DISTINCT l.state INTO v_region
  FROM leads l
  JOIN campaign_leads cl ON cl.lead_id = l.id
  JOIN campaigns c ON c.id = cl.campaign_id
  WHERE c.workspace_id = p_workspace_id
  LIMIT 1;
  
  -- Check roofing brain for proven subject lines in this region
  SELECT pattern_value INTO v_brain_subject
  FROM roofing_brain
  WHERE learning_type = 'subject_line'
    AND (region = v_region OR region IS NULL)
    AND confidence_score > 0.7
  ORDER BY confidence_score DESC, total_wins DESC
  LIMIT 1;
  
  -- If found, use it; otherwise generate from template
  IF v_brain_subject IS NOT NULL THEN
    RETURN v_brain_subject;
  END IF;
  
  -- Default: generate from common roofing patterns
  RETURN 'Quick question about your roof in {{city}}';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION generate_subject_variant_b(p_base_subject TEXT, p_workspace_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_region TEXT;
  v_brain_subject TEXT;
BEGIN
  -- Try to get region from workspace/leads
  SELECT DISTINCT l.state INTO v_region
  FROM leads l
  JOIN campaign_leads cl ON cl.lead_id = l.id
  JOIN campaigns c ON c.id = cl.campaign_id
  WHERE c.workspace_id = p_workspace_id
  LIMIT 1;
  
  -- Check roofing brain for alternative proven subject lines
  SELECT pattern_value INTO v_brain_subject
  FROM roofing_brain
  WHERE learning_type = 'subject_line'
    AND (region = v_region OR region IS NULL)
    AND confidence_score > 0.7
  ORDER BY confidence_score DESC, total_wins DESC
  OFFSET 1
  LIMIT 1;
  
  -- If found, use it; otherwise generate from template
  IF v_brain_subject IS NOT NULL THEN
    RETURN v_brain_subject;
  END IF;
  
  -- Default: generate alternative roofing pattern
  RETURN 'About your home…';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION extract_opening_line(p_body TEXT)
RETURNS TEXT AS $$
BEGIN
  -- Extract first sentence or first 100 chars
  RETURN SUBSTRING(p_body FROM 1 FOR 100);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 10. FUNCTION — Update variant stats when email is opened/replied
-- ============================================================================
CREATE OR REPLACE FUNCTION update_ab_test_stats()
RETURNS TRIGGER AS $$
DECLARE
  v_recipient RECORD;
  v_variant_id UUID;
BEGIN
  -- Check if this email is part of an A/B test
  SELECT atr.* INTO v_recipient
  FROM ab_test_recipients atr
  WHERE atr.email_log_id = NEW.id OR atr.lead_id = NEW.lead_id
  LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  
  v_variant_id := v_recipient.variant_id;
  
  -- Update opens
  IF NEW.opened_at IS NOT NULL AND v_recipient.opened_at IS NULL THEN
    UPDATE ab_test_recipients
    SET opened_at = NEW.opened_at
    WHERE id = v_recipient.id;
    
    UPDATE ab_test_variants
    SET emails_opened = emails_opened + 1
    WHERE id = v_variant_id;
  END IF;
  
  -- Update replies
  IF NEW.replied_at IS NOT NULL AND v_recipient.replied_at IS NULL THEN
    UPDATE ab_test_recipients
    SET replied_at = NEW.replied_at
    WHERE id = v_recipient.id;
    
    UPDATE ab_test_variants
    SET emails_replied = emails_replied + 1
    WHERE id = v_variant_id;
  END IF;
  
  -- Recalculate rates
  UPDATE ab_test_variants
  SET 
    open_rate = CASE 
      WHEN emails_sent > 0 THEN (emails_opened::NUMERIC / emails_sent::NUMERIC * 100)
      ELSE 0
    END,
    reply_rate = CASE 
      WHEN emails_sent > 0 THEN (emails_replied::NUMERIC / emails_sent::NUMERIC * 100)
      ELSE 0
    END,
    updated_at = now()
  WHERE id = v_variant_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 11. FUNCTION — Check if test is ready to declare winner
-- ============================================================================
CREATE OR REPLACE FUNCTION check_ab_test_winner(p_test_id UUID)
RETURNS UUID AS $$
DECLARE
  v_test RECORD;
  v_variant_a RECORD;
  v_variant_b RECORD;
  v_winner_id UUID;
  v_min_sample INT;
BEGIN
  SELECT * INTO v_test FROM ab_tests WHERE id = p_test_id;
  
  IF NOT FOUND OR v_test.status != 'running' THEN
    RETURN NULL;
  END IF;
  
  v_min_sample := v_test.min_sample_size;
  
  -- Get both variants
  SELECT * INTO v_variant_a FROM ab_test_variants WHERE ab_test_id = p_test_id AND variant_label = 'A';
  SELECT * INTO v_variant_b FROM ab_test_variants WHERE ab_test_id = p_test_id AND variant_label = 'B';
  
  -- Check if we have enough samples
  IF v_variant_a.emails_sent < v_min_sample OR v_variant_b.emails_sent < v_min_sample THEN
    RETURN NULL;
  END IF;
  
  -- Pick winner based on reply rate (primary), then open rate (secondary)
  IF v_variant_a.reply_rate > v_variant_b.reply_rate THEN
    v_winner_id := v_variant_a.id;
  ELSIF v_variant_b.reply_rate > v_variant_a.reply_rate THEN
    v_winner_id := v_variant_b.id;
  ELSIF v_variant_a.open_rate > v_variant_b.open_rate THEN
    v_winner_id := v_variant_a.id;
  ELSE
    v_winner_id := v_variant_b.id;
  END IF;
  
  -- Update test status
  UPDATE ab_tests
  SET 
    status = 'completed',
    completed_at = now(),
    winner_variant_id = v_winner_id
  WHERE id = p_test_id;
  
  -- Create result summary
  INSERT INTO ab_test_results (
    ab_test_id,
    campaign_id,
    winner_variant_id,
    winner_label,
    winner_open_rate,
    winner_reply_rate,
    improvement_percent,
    summary_text
  )
  SELECT 
    p_test_id,
    v_test.campaign_id,
    v_winner_id,
    CASE WHEN v_winner_id = v_variant_a.id THEN 'A' ELSE 'B' END,
    CASE WHEN v_winner_id = v_variant_a.id THEN v_variant_a.open_rate ELSE v_variant_b.open_rate END,
    CASE WHEN v_winner_id = v_variant_a.id THEN v_variant_a.reply_rate ELSE v_variant_b.reply_rate END,
    CASE 
      WHEN v_winner_id = v_variant_a.id THEN 
        ((v_variant_a.reply_rate - v_variant_b.reply_rate) / NULLIF(v_variant_b.reply_rate, 0) * 100)
      ELSE 
        ((v_variant_b.reply_rate - v_variant_a.reply_rate) / NULLIF(v_variant_a.reply_rate, 0) * 100)
    END,
    CASE 
      WHEN v_winner_id = v_variant_a.id THEN 
        format('Version A wins: %.1f%% reply rate vs %.1f%%', v_variant_a.reply_rate, v_variant_b.reply_rate)
      ELSE 
        format('Version B wins: %.1f%% reply rate vs %.1f%%', v_variant_b.reply_rate, v_variant_a.reply_rate)
    END
  RETURNING id;
  
  -- Learn from this test (update roofing brain)
  PERFORM learn_from_ab_test(p_test_id);
  
  RETURN v_winner_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 12. FUNCTION — Learn from test results (update roofing brain)
-- ============================================================================
CREATE OR REPLACE FUNCTION learn_from_ab_test(p_test_id UUID)
RETURNS VOID AS $$
DECLARE
  v_test RECORD;
  v_winner RECORD;
  v_loser RECORD;
  v_region TEXT;
  v_pattern_key TEXT;
BEGIN
  SELECT * INTO v_test FROM ab_tests WHERE id = p_test_id;
  
  IF NOT FOUND OR v_test.winner_variant_id IS NULL THEN
    RETURN;
  END IF;
  
  -- Get winner and loser variants
  SELECT * INTO v_winner FROM ab_test_variants WHERE id = v_test.winner_variant_id;
  SELECT * INTO v_loser FROM ab_test_variants 
  WHERE ab_test_id = p_test_id AND id != v_test.winner_variant_id;
  
  -- Try to get region
  SELECT DISTINCT l.state INTO v_region
  FROM leads l
  JOIN campaign_leads cl ON cl.lead_id = l.id
  WHERE cl.campaign_id = v_test.campaign_id
  LIMIT 1;
  
  -- Update roofing brain based on test type
  IF v_test.test_type = 'subject_line' AND v_winner.subject_line IS NOT NULL THEN
    v_pattern_key := 'subject_' || SUBSTRING(v_winner.subject_line FROM 1 FOR 50);
    
    INSERT INTO roofing_brain (
      learning_type,
      pattern_key,
      pattern_value,
      region,
      total_tests,
      total_wins,
      avg_open_rate,
      avg_reply_rate,
      confidence_score
    )
    VALUES (
      'subject_line',
      v_pattern_key,
      v_winner.subject_line,
      v_region,
      1,
      1,
      v_winner.open_rate,
      v_winner.reply_rate,
      0.5 -- start with medium confidence
    )
    ON CONFLICT (learning_type, pattern_key, COALESCE(region, ''))
    DO UPDATE SET
      total_tests = roofing_brain.total_tests + 1,
      total_wins = roofing_brain.total_wins + 1,
      avg_open_rate = (roofing_brain.avg_open_rate * roofing_brain.total_tests + v_winner.open_rate) / (roofing_brain.total_tests + 1),
      avg_reply_rate = (roofing_brain.avg_reply_rate * roofing_brain.total_tests + v_winner.reply_rate) / (roofing_brain.total_tests + 1),
      confidence_score = LEAST(1.0, (roofing_brain.total_wins::NUMERIC / NULLIF(roofing_brain.total_tests, 0))),
      last_updated_at = now();
      
  ELSIF v_test.test_type = 'cta_style' AND v_winner.cta_text IS NOT NULL THEN
    v_pattern_key := 'cta_' || SUBSTRING(v_winner.cta_text FROM 1 FOR 50);
    
    INSERT INTO roofing_brain (
      learning_type,
      pattern_key,
      pattern_value,
      region,
      total_tests,
      total_wins,
      avg_open_rate,
      avg_reply_rate,
      confidence_score
    )
    VALUES (
      'cta_style',
      v_pattern_key,
      v_winner.cta_text,
      v_region,
      1,
      1,
      v_winner.open_rate,
      v_winner.reply_rate,
      0.5
    )
    ON CONFLICT (learning_type, pattern_key, COALESCE(region, ''))
    DO UPDATE SET
      total_tests = roofing_brain.total_tests + 1,
      total_wins = roofing_brain.total_wins + 1,
      avg_open_rate = (roofing_brain.avg_open_rate * roofing_brain.total_tests + v_winner.open_rate) / (roofing_brain.total_tests + 1),
      avg_reply_rate = (roofing_brain.avg_reply_rate * roofing_brain.total_tests + v_winner.reply_rate) / (roofing_brain.total_tests + 1),
      confidence_score = LEAST(1.0, (roofing_brain.total_wins::NUMERIC / NULLIF(roofing_brain.total_tests, 0))),
      last_updated_at = now();
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 13. FUNCTION — Get test result summary for roofer (simple view)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_ab_test_result_summary(p_campaign_id UUID)
RETURNS TABLE (
  test_id UUID,
  test_type TEXT,
  winner_label TEXT,
  winner_open_rate NUMERIC,
  winner_reply_rate NUMERIC,
  improvement_percent NUMERIC,
  summary_text TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    atr.id,
    atr.test_type,
    atr.winner_label,
    atr.winner_open_rate,
    atr.winner_reply_rate,
    atr.improvement_percent,
    atr.summary_text
  FROM ab_test_results atr
  WHERE atr.campaign_id = p_campaign_id
  ORDER BY atr.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 14. RLS POLICIES
-- ============================================================================
ALTER TABLE ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_test_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_test_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE ab_test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE roofing_brain ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "ab_tests_service_role_all" ON ab_tests FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "ab_test_variants_service_role_all" ON ab_test_variants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "ab_test_recipients_service_role_all" ON ab_test_recipients FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "ab_test_results_service_role_all" ON ab_test_results FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "roofing_brain_service_role_all" ON roofing_brain FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can read their own test results
CREATE POLICY "ab_tests_select_own" ON ab_tests FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM campaigns c 
    WHERE c.id = ab_tests.campaign_id 
    AND (c.user_id = auth.uid() OR c.workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    ))
  ));

CREATE POLICY "ab_test_results_select_own" ON ab_test_results FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM campaigns c 
    WHERE c.id = ab_test_results.campaign_id 
    AND (c.user_id = auth.uid() OR c.workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    ))
  ));

-- Roofing brain is readable by all authenticated users (shared learnings)
CREATE POLICY "roofing_brain_select_authenticated" ON roofing_brain FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- 15. HELPER FUNCTIONS — Increment variant stats
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_variant_opens(p_variant_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE ab_test_variants
  SET 
    emails_opened = emails_opened + 1,
    open_rate = CASE 
      WHEN emails_sent > 0 THEN ((emails_opened + 1)::NUMERIC / emails_sent::NUMERIC * 100)
      ELSE 0
    END,
    updated_at = now()
  WHERE id = p_variant_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_variant_replies(p_variant_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE ab_test_variants
  SET 
    emails_replied = emails_replied + 1,
    reply_rate = CASE 
      WHEN emails_sent > 0 THEN ((emails_replied + 1)::NUMERIC / emails_sent::NUMERIC * 100)
      ELSE 0
    END,
    updated_at = now()
  WHERE id = p_variant_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 16. VIEW — Simple test status for dashboard
-- ============================================================================
CREATE OR REPLACE VIEW ab_test_status_view AS
SELECT 
  at.id as test_id,
  at.campaign_id,
  at.test_type,
  at.status,
  at.started_at,
  at.completed_at,
  av_a.variant_label as variant_a_label,
  av_a.emails_sent as variant_a_sent,
  av_a.open_rate as variant_a_open_rate,
  av_a.reply_rate as variant_a_reply_rate,
  av_b.variant_label as variant_b_label,
  av_b.emails_sent as variant_b_sent,
  av_b.open_rate as variant_b_open_rate,
  av_b.reply_rate as variant_b_reply_rate,
  atr.winner_label,
  atr.summary_text
FROM ab_tests at
LEFT JOIN ab_test_variants av_a ON av_a.ab_test_id = at.id AND av_a.variant_label = 'A'
LEFT JOIN ab_test_variants av_b ON av_b.ab_test_id = at.id AND av_b.variant_label = 'B'
LEFT JOIN ab_test_results atr ON atr.ab_test_id = at.id;

