-- =========================================================
-- Block 97000 — Lead Heat Scoring + Hot Lead Fastlane System
-- =========================================================
-- This block is critical because it directly increases booked estimates.
-- Roofers don't lose jobs because of pricing — they lose them because of slow responses.
-- This system eliminates that weakness.

-- 1) LEAD HEAT EVENTS TABLE
-- Tracks every classification event for analytics and audit trail
CREATE TABLE IF NOT EXISTS public.lead_heat_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,  -- References email_replies.id or inbound_messages.id
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid,  -- For workspace-scoped queries
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  intent text NOT NULL CHECK (intent IN ('hot', 'warm', 'cold', 'not_interested')),
  confidence numeric NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  message_text text,  -- Store snippet for context
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_lead_heat_events_user_created 
  ON public.lead_heat_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_heat_events_message 
  ON public.lead_heat_events(message_id);
CREATE INDEX IF NOT EXISTS idx_lead_heat_events_lead 
  ON public.lead_heat_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_heat_events_intent 
  ON public.lead_heat_events(intent, created_at DESC) WHERE intent = 'hot';
CREATE INDEX IF NOT EXISTS idx_lead_heat_events_workspace 
  ON public.lead_heat_events(workspace_id, intent, created_at DESC) WHERE workspace_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.lead_heat_events ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "lead_heat_events_select_own" ON public.lead_heat_events
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "lead_heat_events_insert_service" ON public.lead_heat_events
  FOR INSERT TO service_role
  WITH CHECK (true);

-- 2) ADD HEAT_SCORE TO LEADS TABLE
-- Update leads table to include heat_score column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'leads' 
    AND column_name = 'heat_score'
  ) THEN
    ALTER TABLE public.leads 
    ADD COLUMN heat_score text DEFAULT 'cold' 
    CHECK (heat_score IN ('hot', 'warm', 'cold', 'not_interested'));
  END IF;
END $$;

-- Index for filtering hot leads
CREATE INDEX IF NOT EXISTS idx_leads_heat_score 
  ON public.leads(heat_score, updated_at DESC) 
  WHERE heat_score = 'hot';

-- 3) HOT REPLY TEMPLATES TABLE
-- One-click response templates for hot leads
CREATE TABLE IF NOT EXISTS public.hot_reply_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,  -- null = global template
  title text NOT NULL,
  body text NOT NULL,
  subject text,  -- Optional subject line
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_hot_reply_templates_workspace 
  ON public.hot_reply_templates(workspace_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_hot_reply_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_hot_reply_templates_updated_at
BEFORE UPDATE ON public.hot_reply_templates
FOR EACH ROW
EXECUTE FUNCTION update_hot_reply_templates_updated_at();

-- Enable RLS
ALTER TABLE public.hot_reply_templates ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "hot_reply_templates_select_authenticated" ON public.hot_reply_templates
  FOR SELECT TO authenticated
  USING (workspace_id IS NULL OR workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "hot_reply_templates_insert_service" ON public.hot_reply_templates
  FOR INSERT TO service_role
  WITH CHECK (true);

-- Seed default templates (global)
INSERT INTO public.hot_reply_templates (workspace_id, title, body, subject)
VALUES
  (NULL, 'Book Estimate Fast', 
   'We can stop by today or tomorrow. What time works for you?', 
   'Re: Your Roof Estimate Request'),
  (NULL, 'Address Request', 
   'Can you send me the full address so I can check access + prep equipment?', 
   'Re: Your Roof Estimate Request'),
  (NULL, 'Scheduling Confirmation', 
   'Got it. I''ll lock you in for ____. See you then.', 
   'Re: Your Roof Estimate Request')
ON CONFLICT DO NOTHING;

-- 4) LEAD RESPONSE TIMES TABLE
-- Tracks how fast roofers respond to hot leads for performance analytics
CREATE TABLE IF NOT EXISTS public.lead_response_times (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid,
  message_id uuid,  -- The original hot lead message
  reply_message_id uuid,  -- The reply sent by roofer
  seconds int NOT NULL,  -- Response time in seconds
  heat_score text,  -- The heat score when they replied
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for analytics
CREATE INDEX IF NOT EXISTS idx_lead_response_times_user 
  ON public.lead_response_times(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_response_times_workspace 
  ON public.lead_response_times(workspace_id, created_at DESC) WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_response_times_lead 
  ON public.lead_response_times(lead_id);

-- Enable RLS
ALTER TABLE public.lead_response_times ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "lead_response_times_select_own" ON public.lead_response_times
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "lead_response_times_insert_service" ON public.lead_response_times
  FOR INSERT TO service_role
  WITH CHECK (true);

-- 5) HELPER VIEW: HOT LEADS SUMMARY
-- Quick view of hot leads for dashboard
CREATE OR REPLACE VIEW public.hot_leads_summary AS
SELECT 
  l.id as lead_id,
  l.email,
  l.first_name,
  l.last_name,
  l.heat_score,
  l.updated_at as last_updated,
  MAX(lhe.created_at) as last_hot_event_at,
  MAX(lhe.confidence) as max_confidence
FROM public.leads l
LEFT JOIN public.lead_heat_events lhe ON l.id = lhe.lead_id AND lhe.intent = 'hot'
WHERE l.heat_score = 'hot'
GROUP BY l.id, l.email, l.first_name, l.last_name, l.heat_score, l.updated_at;

-- Grant access
GRANT SELECT ON public.hot_leads_summary TO authenticated;

-- 6) HELPER FUNCTION: Get average response time for user
CREATE OR REPLACE FUNCTION public.get_avg_response_time(p_user_id uuid, p_days int DEFAULT 30)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(AVG(seconds), 0)
  FROM public.lead_response_times
  WHERE user_id = p_user_id
    AND created_at >= now() - (p_days || ' days')::interval
    AND heat_score = 'hot';
$$;

-- 7) HELPER FUNCTION: Get hot leads count for workspace
CREATE OR REPLACE FUNCTION public.get_hot_leads_count(p_workspace_id uuid)
RETURNS int
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)
  FROM public.leads l
  WHERE l.heat_score = 'hot'
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = p_workspace_id
        AND wm.user_id = (SELECT user_id FROM public.leads WHERE id = l.id LIMIT 1)
    );
$$;


























