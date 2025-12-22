-- Block 78000 — SmartSend Roofing
-- "Campaign Scheduler + Smart Send Times Engine" v1
-- Complete scheduling system with smart timing, behavior learning, and wave-based sending

-- ============================================================================
-- PART 1 — CAMPAIGN SCHEDULES TABLE
-- ============================================================================
-- Stores scheduling configuration for campaigns

CREATE TABLE IF NOT EXISTS public.campaign_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid, -- References roofing_companies or organizations
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  
  -- Schedule Type
  schedule_type text NOT NULL CHECK (schedule_type IN ('specific_time', 'smart_send', 'interval')),
  
  -- Specific Time Mode
  send_time time, -- for specific_time mode
  
  -- Date Range
  start_date date,
  end_date date,
  
  -- Interval Mode
  interval_minutes integer, -- for interval mode (e.g., send 1 email every 15 minutes)
  emails_per_hour integer, -- alternative: send X emails per hour
  
  -- Smart Send Settings
  smart_send_enabled boolean DEFAULT false,
  smart_send_min_hour integer DEFAULT 9 CHECK (smart_send_min_hour >= 0 AND smart_send_min_hour <= 23),
  smart_send_max_hour integer DEFAULT 17 CHECK (smart_send_max_hour >= 0 AND smart_send_max_hour <= 23),
  smart_send_days_of_week integer[] DEFAULT ARRAY[1,2,3,4,5], -- 0=Sun, 1=Mon, etc.
  
  -- Wave Configuration
  wave_size integer DEFAULT 50, -- emails per wave
  wave_interval_minutes integer DEFAULT 30, -- minutes between waves
  
  -- Multi-Domain Staggering
  enable_domain_staggering boolean DEFAULT false,
  domain_stagger_minutes integer DEFAULT 15, -- minutes between domains
  
  -- Weather-Based Scheduling
  enable_weather_scheduling boolean DEFAULT false,
  weather_priority_zipcodes text[], -- ZIP codes to prioritize during weather events
  
  -- Status
  status text DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_campaign_schedules_campaign ON public.campaign_schedules(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_schedules_workspace ON public.campaign_schedules(workspace_id);
CREATE INDEX IF NOT EXISTS idx_campaign_schedules_status ON public.campaign_schedules(status);
CREATE INDEX IF NOT EXISTS idx_campaign_schedules_type ON public.campaign_schedules(schedule_type);

-- RLS
ALTER TABLE public.campaign_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaign_schedules_select"
  ON public.campaign_schedules
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "campaign_schedules_insert"
  ON public.campaign_schedules
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "campaign_schedules_update"
  ON public.campaign_schedules
  FOR UPDATE
  TO authenticated
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

-- ============================================================================
-- PART 2 — OPEN BEHAVIOR TABLE (AI Training Data)
-- ============================================================================
-- Tracks when emails are opened/replied by ZIP code, day, and hour
-- This data powers the Smart Send algorithm

CREATE TABLE IF NOT EXISTS public.open_behavior (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid, -- References roofing_companies or organizations
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Geographic Targeting
  zipcode text,
  
  -- Time Patterns
  day_of_week integer NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sun, 1=Mon, etc.
  hour integer NOT NULL CHECK (hour >= 0 AND hour <= 23),
  
  -- Engagement Metrics
  opens integer DEFAULT 0,
  replies integer DEFAULT 0,
  sends integer DEFAULT 0,
  
  -- Calculated Performance
  open_rate numeric(5,4) GENERATED ALWAYS AS (
    CASE WHEN sends > 0 THEN (opens::numeric / sends) ELSE 0 END
  ) STORED,
  reply_rate numeric(5,4) GENERATED ALWAYS AS (
    CASE WHEN sends > 0 THEN (replies::numeric / sends) ELSE 0 END
  ) STORED,
  
  -- Device Type (if available from tracking)
  device_type text, -- 'mobile', 'desktop', 'tablet', null
  
  -- Last Updated
  last_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Unique constraint: one record per workspace+zipcode+day+hour
  UNIQUE(workspace_id, zipcode, day_of_week, hour)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_open_behavior_workspace_zip ON public.open_behavior(workspace_id, zipcode);
CREATE INDEX IF NOT EXISTS idx_open_behavior_day_hour ON public.open_behavior(day_of_week, hour);
CREATE INDEX IF NOT EXISTS idx_open_behavior_performance ON public.open_behavior(workspace_id, open_rate DESC, reply_rate DESC);
CREATE INDEX IF NOT EXISTS idx_open_behavior_updated ON public.open_behavior(last_updated_at DESC);

-- RLS
ALTER TABLE public.open_behavior ENABLE ROW LEVEL SECURITY;

CREATE POLICY "open_behavior_select"
  ON public.open_behavior
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "open_behavior_insert"
  ON public.open_behavior
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "open_behavior_update"
  ON public.open_behavior
  FOR UPDATE
  TO authenticated
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

-- ============================================================================
-- PART 3 — SEND WAVES TABLE (Smart Batching)
-- ============================================================================
-- Manages wave-based sending to protect deliverability and maximize engagement

CREATE TABLE IF NOT EXISTS public.send_waves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid REFERENCES public.campaign_schedules(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Wave Information
  wave_number integer NOT NULL,
  send_at timestamptz NOT NULL,
  
  -- Wave Status
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'cancelled', 'failed')),
  
  -- Wave Metrics
  total_recipients integer DEFAULT 0,
  sent_count integer DEFAULT 0,
  failed_count integer DEFAULT 0,
  
  -- Smart Send Data
  selected_hour integer, -- the hour selected by Smart Send algorithm
  selected_day_of_week integer, -- the day selected
  zipcode_distribution jsonb, -- breakdown of ZIP codes in this wave
  
  -- Execution Metadata
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_send_waves_schedule ON public.send_waves(schedule_id);
CREATE INDEX IF NOT EXISTS idx_send_waves_campaign ON public.send_waves(campaign_id);
CREATE INDEX IF NOT EXISTS idx_send_waves_workspace ON public.send_waves(workspace_id);
CREATE INDEX IF NOT EXISTS idx_send_waves_status ON public.send_waves(status);
CREATE INDEX IF NOT EXISTS idx_send_waves_send_at ON public.send_waves(send_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_send_waves_wave_number ON public.send_waves(campaign_id, wave_number);

-- RLS
ALTER TABLE public.send_waves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "send_waves_select"
  ON public.send_waves
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "send_waves_insert"
  ON public.send_waves
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "send_waves_update"
  ON public.send_waves
  FOR UPDATE
  TO authenticated
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

-- ============================================================================
-- PART 4 — WAVE RECIPIENTS TABLE
-- ============================================================================
-- Links recipients to specific waves for tracking and execution

CREATE TABLE IF NOT EXISTS public.wave_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wave_id uuid REFERENCES public.send_waves(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  zipcode text,
  
  -- Status
  status text DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  
  -- Timing
  scheduled_send_at timestamptz,
  sent_at timestamptz,
  
  -- Error Tracking
  error_message text,
  retry_count integer DEFAULT 0,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wave_recipients_wave ON public.wave_recipients(wave_id);
CREATE INDEX IF NOT EXISTS idx_wave_recipients_campaign ON public.wave_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_wave_recipients_lead ON public.wave_recipients(lead_id);
CREATE INDEX IF NOT EXISTS idx_wave_recipients_status ON public.wave_recipients(wave_id, status);
CREATE INDEX IF NOT EXISTS idx_wave_recipients_scheduled ON public.wave_recipients(scheduled_send_at) WHERE status = 'queued';

-- RLS
ALTER TABLE public.wave_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wave_recipients_select"
  ON public.wave_recipients
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.send_waves sw
      JOIN public.workspace_members wm ON wm.workspace_id = sw.workspace_id
      WHERE sw.id = wave_recipients.wave_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "wave_recipients_insert"
  ON public.wave_recipients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.send_waves sw
      JOIN public.workspace_members wm ON wm.workspace_id = sw.workspace_id
      WHERE sw.id = wave_recipients.wave_id
      AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "wave_recipients_update"
  ON public.wave_recipients
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.send_waves sw
      JOIN public.workspace_members wm ON wm.workspace_id = sw.workspace_id
      WHERE sw.id = wave_recipients.wave_id
      AND wm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.send_waves sw
      JOIN public.workspace_members wm ON wm.workspace_id = sw.workspace_id
      WHERE sw.id = wave_recipients.wave_id
      AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 5 — HELPER FUNCTIONS
-- ============================================================================

-- Function to update open_behavior when an email is opened/replied
CREATE OR REPLACE FUNCTION public.record_email_engagement(
  p_workspace_id uuid,
  p_zipcode text,
  p_day_of_week integer,
  p_hour integer,
  p_event_type text -- 'open' or 'reply'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.open_behavior (
    workspace_id,
    zipcode,
    day_of_week,
    hour,
    opens,
    replies,
    sends
  )
  VALUES (
    p_workspace_id,
    p_zipcode,
    p_day_of_week,
    p_hour,
    CASE WHEN p_event_type = 'open' THEN 1 ELSE 0 END,
    CASE WHEN p_event_type = 'reply' THEN 1 ELSE 0 END,
    0 -- sends tracked separately
  )
  ON CONFLICT (workspace_id, zipcode, day_of_week, hour)
  DO UPDATE SET
    opens = open_behavior.opens + CASE WHEN p_event_type = 'open' THEN 1 ELSE 0 END,
    replies = open_behavior.replies + CASE WHEN p_event_type = 'reply' THEN 1 ELSE 0 END,
    last_updated_at = now();
END;
$$;

-- Function to increment sends count
CREATE OR REPLACE FUNCTION public.increment_behavior_sends(
  p_workspace_id uuid,
  p_zipcode text,
  p_day_of_week integer,
  p_hour integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.open_behavior (
    workspace_id,
    zipcode,
    day_of_week,
    hour,
    opens,
    replies,
    sends
  )
  VALUES (
    p_workspace_id,
    p_zipcode,
    p_day_of_week,
    p_hour,
    0,
    0,
    1
  )
  ON CONFLICT (workspace_id, zipcode, day_of_week, hour)
  DO UPDATE SET
    sends = open_behavior.sends + 1,
    last_updated_at = now();
END;
$$;

-- Function to get best send times for a ZIP code
CREATE OR REPLACE FUNCTION public.get_best_send_times(
  p_workspace_id uuid,
  p_zipcode text,
  p_limit integer DEFAULT 5
)
RETURNS TABLE (
  day_of_week integer,
  hour integer,
  open_rate numeric,
  reply_rate numeric,
  score numeric
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    ob.day_of_week,
    ob.hour,
    ob.open_rate,
    ob.reply_rate,
    (ob.open_rate * 0.6 + ob.reply_rate * 0.4) as score
  FROM public.open_behavior ob
  WHERE ob.workspace_id = p_workspace_id
    AND (p_zipcode IS NULL OR ob.zipcode = p_zipcode)
    AND ob.sends >= 10 -- minimum data threshold
  ORDER BY score DESC, ob.sends DESC
  LIMIT p_limit;
$$;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Triggers for updated_at
CREATE TRIGGER update_campaign_schedules_updated_at
  BEFORE UPDATE ON public.campaign_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_send_waves_updated_at
  BEFORE UPDATE ON public.send_waves
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- PART 6 — VIEWS FOR ANALYTICS
-- ============================================================================

-- View: Best send times by ZIP code
CREATE OR REPLACE VIEW public.v_best_send_times AS
SELECT
  ob.workspace_id,
  ob.zipcode,
  ob.day_of_week,
  ob.hour,
  ob.open_rate,
  ob.reply_rate,
  ob.sends,
  (ob.open_rate * 0.6 + ob.reply_rate * 0.4) as performance_score
FROM public.open_behavior ob
WHERE ob.sends >= 10
ORDER BY ob.workspace_id, ob.zipcode, performance_score DESC;

-- View: Wave performance summary
CREATE OR REPLACE VIEW public.v_wave_performance AS
SELECT
  sw.campaign_id,
  sw.wave_number,
  sw.send_at,
  sw.status,
  sw.total_recipients,
  sw.sent_count,
  sw.failed_count,
  CASE 
    WHEN sw.total_recipients > 0 
    THEN (sw.sent_count::numeric / sw.total_recipients * 100)
    ELSE 0 
  END as success_rate
FROM public.send_waves sw
ORDER BY sw.campaign_id, sw.wave_number;



























