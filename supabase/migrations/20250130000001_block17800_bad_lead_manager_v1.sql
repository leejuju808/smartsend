-- =========================================================
-- Block 17800 — SmartSend Bad Lead Manager v1
-- (Automated Cleanup System: Bounces, Spam, Dead Emails, Not-Interested Detection, Time-Wasters & Global Suppression Controls)
-- =========================================================

-- ============================================
-- 1) Core Bad Leads Table
-- ============================================

CREATE TABLE IF NOT EXISTS public.bad_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  org_id uuid, -- Optional org-level tracking
  
  -- Lead identification
  email text NOT NULL,
  phone text,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  
  -- Bad lead category
  category text NOT NULL CHECK (category IN (
    'hard_bounce',
    'soft_bounce',
    'spam_complaint',
    'not_interested',
    'time_waster',
    'duplicate',
    'bad_data',
    'unsubscribed',
    'invalid_email',
    'disposable_email',
    'role_account'
  )),
  
  -- Details
  reason text, -- Human-readable reason
  detection_method text DEFAULT 'system', -- 'system', 'manual', 'ai', 'webhook', 'reply'
  detected_at timestamptz NOT NULL DEFAULT now(),
  
  -- Context
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  source_campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb, -- Store bounce codes, complaint details, detection patterns, etc.
  notes text, -- Manual notes
  
  -- Status
  is_suppressed boolean DEFAULT true, -- Auto-suppressed when detected
  suppression_level text DEFAULT 'global' CHECK (suppression_level IN ('global', 'list', 'campaign')),
  suppressed_at timestamptz,
  
  -- Revival tracking
  revival_attempts int DEFAULT 0,
  last_revival_at timestamptz,
  can_revive boolean DEFAULT false, -- Some categories can't be revived (hard bounce, spam)
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_bad_leads_workspace_email 
  ON public.bad_leads(workspace_id, lower(email));

CREATE INDEX IF NOT EXISTS idx_bad_leads_category 
  ON public.bad_leads(category);

CREATE INDEX IF NOT EXISTS idx_bad_leads_workspace_category 
  ON public.bad_leads(workspace_id, category);

CREATE INDEX IF NOT EXISTS idx_bad_leads_suppressed 
  ON public.bad_leads(workspace_id, is_suppressed) WHERE is_suppressed = true;

CREATE INDEX IF NOT EXISTS idx_bad_leads_campaign 
  ON public.bad_leads(campaign_id) WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bad_leads_detected_at 
  ON public.bad_leads(detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_bad_leads_lead_id 
  ON public.bad_leads(lead_id) WHERE lead_id IS NOT NULL;

-- Unique constraint: one bad lead record per workspace + email + category
CREATE UNIQUE INDEX IF NOT EXISTS idx_bad_leads_unique 
  ON public.bad_leads(workspace_id, lower(email), category);

-- ============================================
-- 2) Enhanced Suppression List (extends existing)
-- ============================================

-- Ensure suppression_list table exists with required columns
DO $$
BEGIN
  -- Add workspace_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'suppression_list' 
    AND column_name = 'workspace_id'
  ) THEN
    ALTER TABLE public.suppression_list 
      ADD COLUMN workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE;
  END IF;

  -- Add bad_lead_id reference if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'suppression_list' 
    AND column_name = 'bad_lead_id'
  ) THEN
    ALTER TABLE public.suppression_list 
      ADD COLUMN bad_lead_id uuid REFERENCES public.bad_leads(id) ON DELETE SET NULL;
  END IF;

  -- Add suppression_level if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'suppression_list' 
    AND column_name = 'suppression_level'
  ) THEN
    ALTER TABLE public.suppression_list 
      ADD COLUMN suppression_level text DEFAULT 'global' CHECK (suppression_level IN ('global', 'list', 'campaign'));
  END IF;

  -- Add expires_at if missing (for temporary suppressions)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'suppression_list' 
    AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE public.suppression_list 
      ADD COLUMN expires_at timestamptz;
  END IF;
END $$;

-- ============================================
-- 3) Bounce Events (extends existing, adds bad_lead tracking)
-- ============================================

-- Ensure bounce_events has bad_lead_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'bounce_events' 
    AND column_name = 'bad_lead_id'
  ) THEN
    ALTER TABLE public.bounce_events 
      ADD COLUMN bad_lead_id uuid REFERENCES public.bad_leads(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================
-- 4) Complaint Events (extends existing, adds bad_lead tracking)
-- ============================================

-- Ensure complaint_events has bad_lead_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'complaint_events' 
    AND column_name = 'bad_lead_id'
  ) THEN
    ALTER TABLE public.complaint_events 
      ADD COLUMN bad_lead_id uuid REFERENCES public.bad_leads(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================
-- 5) Duplicate Links Table
-- ============================================

CREATE TABLE IF NOT EXISTS public.duplicate_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Primary lead (kept)
  primary_lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  primary_email text NOT NULL,
  
  -- Duplicate lead (merged into primary)
  duplicate_lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  duplicate_email text NOT NULL,
  
  -- Detection method
  detection_method text DEFAULT 'email_match' CHECK (detection_method IN ('email_match', 'phone_match', 'name_email_match', 'manual')),
  
  -- Merge status
  merged boolean DEFAULT false,
  merged_at timestamptz,
  
  -- Merge metadata
  merge_metadata jsonb DEFAULT '{}'::jsonb, -- What was merged: timeline, photos, notes, etc.
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_duplicate_links_workspace 
  ON public.duplicate_links(workspace_id);

CREATE INDEX IF NOT EXISTS idx_duplicate_links_primary 
  ON public.duplicate_links(primary_lead_id);

CREATE INDEX IF NOT EXISTS idx_duplicate_links_duplicate 
  ON public.duplicate_links(duplicate_lead_id);

CREATE INDEX IF NOT EXISTS idx_duplicate_links_merged 
  ON public.duplicate_links(workspace_id, merged) WHERE merged = false;

-- ============================================
-- 6) Bad Data Contacts Table
-- ============================================

CREATE TABLE IF NOT EXISTS public.bad_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Contact identification
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  email text,
  
  -- Data quality issues
  issues text[] NOT NULL, -- ['missing_name', 'invalid_address', 'junk_chars', 'disposable_email', 'no_enrichment_match', 'invalid_phone']
  
  -- Details
  issue_details jsonb DEFAULT '{}'::jsonb, -- Specific details about each issue
  data_quality_score int CHECK (data_quality_score >= 0 AND data_quality_score <= 100),
  
  -- Status
  is_excluded_from_campaigns boolean DEFAULT true,
  suggested_action text, -- 'cleanup', 'enrich', 'remove'
  
  detected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bad_data_workspace 
  ON public.bad_data(workspace_id);

CREATE INDEX IF NOT EXISTS idx_bad_data_contact 
  ON public.bad_data(contact_id) WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bad_data_lead 
  ON public.bad_data(lead_id) WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bad_data_email 
  ON public.bad_data(lower(email)) WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bad_data_excluded 
  ON public.bad_data(workspace_id, is_excluded_from_campaigns) WHERE is_excluded_from_campaigns = true;

-- ============================================
-- 7) Not-Interested Detection Patterns
-- ============================================

CREATE TABLE IF NOT EXISTS public.not_interested_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL UNIQUE, -- Regex pattern or keyword
  pattern_type text DEFAULT 'keyword' CHECK (pattern_type IN ('keyword', 'regex', 'phrase')),
  language text DEFAULT 'en', -- For multi-language support
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default patterns
INSERT INTO public.not_interested_patterns (pattern, pattern_type, language) VALUES
  ('stop emailing', 'phrase', 'en'),
  ('not interested', 'phrase', 'en'),
  ('remove me', 'phrase', 'en'),
  ('do not contact', 'phrase', 'en'),
  ('go away', 'phrase', 'en'),
  ('unsubscribe', 'keyword', 'en'),
  ('opt out', 'phrase', 'en'),
  ('stop sending', 'phrase', 'en'),
  ('remove from list', 'phrase', 'en'),
  ('do not email', 'phrase', 'en'),
  ('wrong person', 'phrase', 'en'),
  ('no thanks', 'phrase', 'en'),
  ('not a homeowner', 'phrase', 'en'),
  ('renting', 'keyword', 'en')
ON CONFLICT (pattern) DO NOTHING;

-- ============================================
-- 8) Time Waster Detection Patterns
-- ============================================

CREATE TABLE IF NOT EXISTS public.time_waster_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL UNIQUE,
  pattern_type text DEFAULT 'keyword' CHECK (pattern_type IN ('keyword', 'regex', 'phrase', 'behavior')),
  category text DEFAULT 'general' CHECK (category IN ('general', 'no_show', 'endless_questions', 'zero_intent', 'rude', 'not_homeowner', 'fake_info')),
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default patterns
INSERT INTO public.time_waster_patterns (pattern, pattern_type, category) VALUES
  ('not a homeowner', 'phrase', 'not_homeowner'),
  ('renting', 'keyword', 'not_homeowner'),
  ('renter', 'keyword', 'not_homeowner'),
  ('fake insurance', 'phrase', 'fake_info'),
  ('wrong insurance', 'phrase', 'fake_info'),
  ('no show', 'phrase', 'no_show'),
  ('missed appointment', 'phrase', 'no_show')
ON CONFLICT (pattern) DO NOTHING;

-- ============================================
-- 9) Helper Functions
-- ============================================

-- Function: Detect and create bad lead record
CREATE OR REPLACE FUNCTION public.detect_bad_lead(
  p_workspace_id uuid,
  p_email text,
  p_category text,
  p_reason text DEFAULT NULL,
  p_lead_id uuid DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bad_lead_id uuid;
  v_suppression_level text;
BEGIN
  -- Determine suppression level based on category
  v_suppression_level := CASE p_category
    WHEN 'hard_bounce' THEN 'global'
    WHEN 'spam_complaint' THEN 'global'
    WHEN 'not_interested' THEN 'global'
    WHEN 'unsubscribed' THEN 'global'
    WHEN 'soft_bounce' THEN 'list' -- Can retry later
    WHEN 'time_waster' THEN 'campaign' -- Optional suppression
    ELSE 'global'
  END;

  -- Insert or update bad lead
  INSERT INTO public.bad_leads (
    workspace_id,
    email,
    category,
    reason,
    detection_method,
    lead_id,
    campaign_id,
    metadata,
    is_suppressed,
    suppression_level,
    suppressed_at,
    can_revive
  ) VALUES (
    p_workspace_id,
    p_email,
    p_category,
    p_reason,
    'system',
    p_lead_id,
    p_campaign_id,
    p_metadata,
    true,
    v_suppression_level,
    now(),
    CASE p_category WHEN 'hard_bounce' THEN false WHEN 'spam_complaint' THEN false ELSE true END
  )
  ON CONFLICT (workspace_id, lower(email), category) 
  DO UPDATE SET
    reason = EXCLUDED.reason,
    metadata = EXCLUDED.metadata,
    updated_at = now()
  RETURNING id INTO v_bad_lead_id;

  -- Auto-suppress if global suppression level
  IF v_suppression_level = 'global' THEN
    INSERT INTO public.suppression_list (
      workspace_id,
      email,
      reason,
      source,
      bad_lead_id,
      suppression_level
    ) VALUES (
      p_workspace_id,
      p_email,
      p_category,
      'system',
      v_bad_lead_id,
      'global'
    )
    ON CONFLICT DO NOTHING; -- May already exist
  END IF;

  RETURN v_bad_lead_id;
END;
$$;

-- Function: Check if email is a bad lead
CREATE OR REPLACE FUNCTION public.is_bad_lead(
  p_workspace_id uuid,
  p_email text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_bad_lead_record record;
BEGIN
  SELECT * INTO v_bad_lead_record
  FROM public.bad_leads
  WHERE workspace_id = p_workspace_id
    AND lower(email) = lower(p_email)
    AND is_suppressed = true
  ORDER BY detected_at DESC
  LIMIT 1;

  IF v_bad_lead_record IS NULL THEN
    RETURN jsonb_build_object('is_bad_lead', false);
  END IF;

  RETURN jsonb_build_object(
    'is_bad_lead', true,
    'category', v_bad_lead_record.category,
    'reason', v_bad_lead_record.reason,
    'suppression_level', v_bad_lead_record.suppression_level,
    'can_revive', v_bad_lead_record.can_revive,
    'detected_at', v_bad_lead_record.detected_at
  );
END;
$$;

-- Function: Detect not-interested from text
CREATE OR REPLACE FUNCTION public.detect_not_interested(
  p_text text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_pattern record;
  v_text_lower text;
BEGIN
  v_text_lower := lower(p_text);

  -- Check against patterns
  FOR v_pattern IN 
    SELECT pattern, pattern_type 
    FROM public.not_interested_patterns 
    WHERE is_active = true
  LOOP
    IF v_pattern.pattern_type = 'keyword' THEN
      IF v_text_lower LIKE '%' || v_pattern.pattern || '%' THEN
        RETURN true;
      END IF;
    ELSIF v_pattern.pattern_type = 'phrase' THEN
      IF v_text_lower LIKE '%' || v_pattern.pattern || '%' THEN
        RETURN true;
      END IF;
    ELSIF v_pattern.pattern_type = 'regex' THEN
      -- Basic regex matching (PostgreSQL)
      IF v_text_lower ~ v_pattern.pattern THEN
        RETURN true;
      END IF;
    END IF;
  END LOOP;

  RETURN false;
END;
$$;

-- Function: Detect time waster from text/behavior
CREATE OR REPLACE FUNCTION public.detect_time_waster(
  p_text text DEFAULT NULL,
  p_behavior jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_pattern record;
  v_text_lower text;
  v_detected_categories text[] := '{}';
BEGIN
  -- Check text patterns
  IF p_text IS NOT NULL THEN
    v_text_lower := lower(p_text);

    FOR v_pattern IN 
      SELECT pattern, pattern_type, category 
      FROM public.time_waster_patterns 
      WHERE is_active = true
    LOOP
      IF v_pattern.pattern_type IN ('keyword', 'phrase') THEN
        IF v_text_lower LIKE '%' || v_pattern.pattern || '%' THEN
          v_detected_categories := array_append(v_detected_categories, v_pattern.category);
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Check behavior patterns
  IF p_behavior ? 'no_shows' AND (p_behavior->>'no_shows')::int >= 2 THEN
    v_detected_categories := array_append(v_detected_categories, 'no_show');
  END IF;

  IF p_behavior ? 'reply_count' AND (p_behavior->>'reply_count')::int > 10 THEN
    v_detected_categories := array_append(v_detected_categories, 'endless_questions');
  END IF;

  IF array_length(v_detected_categories, 1) > 0 THEN
    RETURN jsonb_build_object(
      'is_time_waster', true,
      'categories', v_detected_categories
    );
  END IF;

  RETURN jsonb_build_object('is_time_waster', false);
END;
$$;

-- Function: Clean up bad leads before sending (pre-flight check)
CREATE OR REPLACE FUNCTION public.cleanup_bad_leads_before_send(
  p_workspace_id uuid,
  p_lead_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead_id uuid;
  v_email text;
  v_bad_count int := 0;
  v_cleaned_lead_ids uuid[] := '{}';
BEGIN
  -- Check each lead
  FOREACH v_lead_id IN ARRAY p_lead_ids
  LOOP
    -- Get lead email
    SELECT email INTO v_email
    FROM public.leads
    WHERE id = v_lead_id AND workspace_id = p_workspace_id;

    IF v_email IS NULL THEN
      CONTINUE;
    END IF;

    -- Check if bad lead
    IF EXISTS (
      SELECT 1 FROM public.bad_leads
      WHERE workspace_id = p_workspace_id
        AND lower(email) = lower(v_email)
        AND is_suppressed = true
    ) THEN
      v_bad_count := v_bad_count + 1;
    ELSIF EXISTS (
      SELECT 1 FROM public.suppression_list
      WHERE workspace_id = p_workspace_id
        AND lower(email) = lower(v_email)
    ) THEN
      v_bad_count := v_bad_count + 1;
    ELSE
      v_cleaned_lead_ids := array_append(v_cleaned_lead_ids, v_lead_id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'cleaned_count', v_bad_count,
    'remaining_count', array_length(v_cleaned_lead_ids, 1),
    'cleaned_lead_ids', v_cleaned_lead_ids
  );
END;
$$;

-- ============================================
-- 10) Triggers
-- ============================================

-- Update updated_at on bad_leads
CREATE OR REPLACE FUNCTION public.set_bad_leads_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_bad_leads_updated_at ON public.bad_leads;
CREATE TRIGGER trg_set_bad_leads_updated_at
  BEFORE UPDATE ON public.bad_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_bad_leads_updated_at();

-- Auto-create bad lead on hard bounce
CREATE OR REPLACE FUNCTION public.auto_detect_bad_lead_on_bounce()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_bad_lead_id uuid;
BEGIN
  -- Get workspace_id from campaign or lead
  IF NEW.campaign_id IS NOT NULL THEN
    SELECT workspace_id INTO v_workspace_id
    FROM public.campaigns
    WHERE id = NEW.campaign_id;
  END IF;

  IF v_workspace_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Create bad lead record
  IF NEW.bounce_type = 'hard' THEN
    v_bad_lead_id := public.detect_bad_lead(
      v_workspace_id,
      NEW.email,
      'hard_bounce',
      NEW.bounce_reason,
      NULL,
      NEW.campaign_id,
      jsonb_build_object(
        'smtp_code', NEW.smtp_code,
        'dsn_code', NEW.dsn_code,
        'provider', NEW.provider
      )
    );

    -- Link bounce event to bad lead
    NEW.bad_lead_id := v_bad_lead_id;
  ELSIF NEW.bounce_type = 'soft' THEN
    -- Check if 3+ soft bounces in last 7 days
    IF (
      SELECT COUNT(*) FROM public.bounce_events
      WHERE workspace_id = v_workspace_id
        AND lower(email) = lower(NEW.email)
        AND bounce_type = 'soft'
        AND created_at > now() - interval '7 days'
    ) >= 3 THEN
      v_bad_lead_id := public.detect_bad_lead(
        v_workspace_id,
        NEW.email,
        'soft_bounce',
        'Too many soft bounces (3+)',
        NULL,
        NEW.campaign_id,
        jsonb_build_object('bounce_count', 3)
      );
      NEW.bad_lead_id := v_bad_lead_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_detect_bad_lead_on_bounce ON public.bounce_events;
CREATE TRIGGER trg_auto_detect_bad_lead_on_bounce
  AFTER INSERT ON public.bounce_events
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_detect_bad_lead_on_bounce();

-- Auto-create bad lead on complaint
CREATE OR REPLACE FUNCTION public.auto_detect_bad_lead_on_complaint()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_bad_lead_id uuid;
BEGIN
  -- Get workspace_id from campaign
  IF NEW.campaign_id IS NOT NULL THEN
    SELECT workspace_id INTO v_workspace_id
    FROM public.campaigns
    WHERE id = NEW.campaign_id;
  END IF;

  IF v_workspace_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Create bad lead record
  v_bad_lead_id := public.detect_bad_lead(
    v_workspace_id,
    NEW.email,
    'spam_complaint',
    NEW.feedback,
    NULL,
    NEW.campaign_id,
    jsonb_build_object(
      'complaint_type', NEW.complaint_type,
      'provider', NEW.provider
    )
  );

  -- Link complaint event to bad lead
  NEW.bad_lead_id := v_bad_lead_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_detect_bad_lead_on_complaint ON public.complaint_events;
CREATE TRIGGER trg_auto_detect_bad_lead_on_complaint
  AFTER INSERT ON public.complaint_events
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_detect_bad_lead_on_complaint();

-- ============================================
-- 11) RLS Policies
-- ============================================

ALTER TABLE public.bad_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duplicate_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bad_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.not_interested_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_waster_patterns ENABLE ROW LEVEL SECURITY;

-- Bad leads: workspace members can read
CREATE POLICY "bad_leads_read" ON public.bad_leads
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Bad leads: workspace members can insert
CREATE POLICY "bad_leads_insert" ON public.bad_leads
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Bad leads: workspace members can update
CREATE POLICY "bad_leads_update" ON public.bad_leads
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Duplicate links: workspace members can read
CREATE POLICY "duplicate_links_read" ON public.duplicate_links
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Duplicate links: workspace members can insert/update
CREATE POLICY "duplicate_links_write" ON public.duplicate_links
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Bad data: workspace members can read
CREATE POLICY "bad_data_read" ON public.bad_data
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Bad data: workspace members can write
CREATE POLICY "bad_data_write" ON public.bad_data
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Patterns: readable by all authenticated users
CREATE POLICY "patterns_read" ON public.not_interested_patterns
  FOR SELECT
  USING (true);

CREATE POLICY "patterns_read" ON public.time_waster_patterns
  FOR SELECT
  USING (true);

-- ============================================
-- 12) Comments
-- ============================================

COMMENT ON TABLE public.bad_leads IS 'Centralized bad lead tracking - all categories of problematic leads';
COMMENT ON TABLE public.duplicate_links IS 'Tracks duplicate leads for smart merging';
COMMENT ON TABLE public.bad_data IS 'Tracks contacts with data quality issues';
COMMENT ON TABLE public.not_interested_patterns IS 'Patterns for detecting not-interested responses';
COMMENT ON TABLE public.time_waster_patterns IS 'Patterns for detecting time-waster leads';





















































