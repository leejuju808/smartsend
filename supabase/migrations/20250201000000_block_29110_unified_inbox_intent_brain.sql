-- Block 29110 — SmartSend Roofing "AI Inbox + Intent Brain" v1
-- Unified inbox with AI intent classification for roofing contractors
-- One unified inbox • Auto-classify homeowner intent • Detect hot leads instantly

-- =========================================================
-- 1. INBOX_MESSAGES TABLE (Unified inbox)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.inbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  subject text,
  body text,
  body_html text,
  sender text NOT NULL,
  sender_email text NOT NULL,
  recipient text,
  recipient_email text,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  intent text DEFAULT 'unknown' CHECK (intent IN (
    'hot_lead',
    'warm_lead',
    'not_interested',
    'follow_up_required',
    'appointment_request',
    'price_question',
    'referral',
    'general',
    'unknown'
  )),
  replied boolean DEFAULT false,
  requires_followup boolean DEFAULT false,
  thread_id text, -- For grouping messages in threads
  provider_message_id text, -- External provider message ID
  provider text, -- 'gmail', 'outlook', 'smtp', etc.
  metadata jsonb DEFAULT '{}'::jsonb, -- Additional metadata
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  read_at timestamptz,
  classified_at timestamptz -- When AI classified the intent
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inbox_messages_workspace_id ON public.inbox_messages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_lead_id ON public.inbox_messages(lead_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_campaign_id ON public.inbox_messages(campaign_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_direction ON public.inbox_messages(direction);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_intent ON public.inbox_messages(intent);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_thread_id ON public.inbox_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_created_at ON public.inbox_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_unread ON public.inbox_messages(workspace_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_messages_requires_followup ON public.inbox_messages(workspace_id, requires_followup) WHERE requires_followup = true;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_inbox_messages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inbox_messages_updated_at ON public.inbox_messages;
CREATE TRIGGER trg_inbox_messages_updated_at
  BEFORE UPDATE ON public.inbox_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_inbox_messages_updated_at();

-- =========================================================
-- 2. INTENT_LOGS TABLE (AI classification audit trail)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.intent_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.inbox_messages(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  predicted_intent text NOT NULL,
  confidence numeric CHECK (confidence >= 0 AND confidence <= 1),
  previous_intent text, -- For tracking intent changes
  ai_model text DEFAULT 'gpt-4o-mini',
  classification_prompt text, -- Store the prompt used
  raw_ai_response jsonb, -- Store raw AI response for debugging
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intent_logs_message_id ON public.intent_logs(message_id);
CREATE INDEX IF NOT EXISTS idx_intent_logs_workspace_id ON public.intent_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_intent_logs_intent ON public.intent_logs(predicted_intent);
CREATE INDEX IF NOT EXISTS idx_intent_logs_created_at ON public.intent_logs(created_at DESC);

-- =========================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- =========================================================

ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intent_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Inbox messages are scoped to workspace members
CREATE POLICY "inbox_messages_workspace_members"
  ON public.inbox_messages
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Intent logs are scoped to workspace members
CREATE POLICY "intent_logs_workspace_members"
  ON public.intent_logs
  FOR ALL
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- =========================================================
-- 4. HELPER FUNCTIONS FOR WORKFLOW TRIGGERS
-- =========================================================

-- Mark lead as priority when hot_lead intent is detected
CREATE OR REPLACE FUNCTION public.mark_priority_lead(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.leads
  SET status = 'hot_lead',
      updated_at = now()
  WHERE id = p_lead_id;
  
  -- Create a task if tasks table exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks') THEN
    INSERT INTO public.tasks (lead_id, title, description, priority, status, created_at)
    VALUES (
      p_lead_id,
      'Call immediately - Hot lead',
      'Hot lead detected from inbox message. Call immediately.',
      'high',
      'pending',
      now()
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- Send booking link for appointment requests
CREATE OR REPLACE FUNCTION public.send_booking_link(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead_email text;
  v_lead_name text;
BEGIN
  SELECT email, COALESCE(first_name || ' ' || last_name, name, 'Homeowner')
  INTO v_lead_email, v_lead_name
  FROM public.leads
  WHERE id = p_lead_id;
  
  -- In a real implementation, this would trigger an email send
  -- For now, we just log it via a notification or task
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks') THEN
    INSERT INTO public.tasks (lead_id, title, description, priority, status, created_at)
    VALUES (
      p_lead_id,
      'Send booking link',
      'Appointment request detected. Send booking link to ' || v_lead_email,
      'medium',
      'pending',
      now()
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- Send pricing information for price questions
CREATE OR REPLACE FUNCTION public.send_pricing_info(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead_email text;
BEGIN
  SELECT email INTO v_lead_email
  FROM public.leads
  WHERE id = p_lead_id;
  
  -- Create task to send pricing guide
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks') THEN
    INSERT INTO public.tasks (lead_id, title, description, priority, status, created_at)
    VALUES (
      p_lead_id,
      'Send pricing guide',
      'Price question detected. Send pricing information to ' || COALESCE(v_lead_email, 'lead'),
      'medium',
      'pending',
      now()
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- Schedule follow-up for follow_up_required intent
CREATE OR REPLACE FUNCTION public.schedule_followup(p_lead_id uuid, p_followup_date timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update lead with follow-up date
  UPDATE public.leads
  SET updated_at = now()
  WHERE id = p_lead_id;
  
  -- Create follow-up task
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks') THEN
    INSERT INTO public.tasks (lead_id, title, description, priority, status, due_date, created_at)
    VALUES (
      p_lead_id,
      'Follow-up scheduled',
      'Follow-up required. Check back with lead.',
      'low',
      'pending',
      p_followup_date,
      now()
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- Archive lead for not_interested intent
CREATE OR REPLACE FUNCTION public.archive_lead(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.leads
  SET status = 'not_interested',
      updated_at = now()
  WHERE id = p_lead_id;
  
  -- Optionally pause any active campaigns for this lead
  -- This would need campaign management logic
END;
$$;

-- Log referral intent
CREATE OR REPLACE FUNCTION public.log_referral_intent(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Create a high-priority task to follow up on referral
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks') THEN
    INSERT INTO public.tasks (lead_id, title, description, priority, status, created_at)
    VALUES (
      p_lead_id,
      'Referral detected - Follow up',
      'Referral message detected. Follow up immediately to get referral details.',
      'high',
      'pending',
      now()
    )
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- =========================================================
-- 5. VIEW: Unified inbox with latest messages per thread
-- =========================================================

CREATE OR REPLACE VIEW public.v_unified_inbox AS
SELECT DISTINCT ON (im.thread_id, im.lead_id)
  im.id,
  im.workspace_id,
  im.lead_id,
  im.campaign_id,
  im.subject,
  im.body,
  im.sender,
  im.sender_email,
  im.direction,
  im.intent,
  im.replied,
  im.requires_followup,
  im.thread_id,
  im.provider,
  im.created_at,
  im.read_at,
  im.classified_at,
  l.first_name,
  l.last_name,
  l.email as lead_email,
  l.status as lead_status,
  c.name as campaign_name,
  COUNT(*) FILTER (WHERE im2.read_at IS NULL AND im2.direction = 'inbound') OVER (PARTITION BY im.thread_id, im.lead_id) as unread_count
FROM public.inbox_messages im
LEFT JOIN public.leads l ON l.id = im.lead_id
LEFT JOIN public.campaigns c ON c.id = im.campaign_id
LEFT JOIN public.inbox_messages im2 ON im2.thread_id = im.thread_id
WHERE im.direction = 'inbound'
ORDER BY im.thread_id, im.lead_id, im.created_at DESC;

-- =========================================================
-- 6. FUNCTION: Get AI reply suggestions
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_reply_suggestions(p_message_id uuid)
RETURNS TABLE (
  suggestion_type text,
  subject text,
  body text
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_message public.inbox_messages%ROWTYPE;
  v_lead public.leads%ROWTYPE;
BEGIN
  -- Get message and lead data
  SELECT * INTO v_message FROM public.inbox_messages WHERE id = p_message_id;
  SELECT * INTO v_lead FROM public.leads WHERE id = v_message.lead_id;
  
  -- This function will be called from the API layer where AI generates suggestions
  -- For now, return placeholder structure
  RETURN QUERY
  SELECT
    'fast'::text as suggestion_type,
    'Re: ' || COALESCE(v_message.subject, 'Your message') as subject,
    'Thanks for reaching out!' as body
  UNION ALL
  SELECT
    'relationship'::text,
    'Re: ' || COALESCE(v_message.subject, 'Your message'),
    'I appreciate you taking the time to write. Let me help you with that.' as body
  UNION ALL
  SELECT
    'close'::text,
    'Re: ' || COALESCE(v_message.subject, 'Your message'),
    'I''d love to help you move forward. Can we schedule a quick call?' as body;
END;
$$;

COMMENT ON TABLE public.inbox_messages IS 'Unified inbox for all messages - SmartSend sequences, direct replies, referrals, etc.';
COMMENT ON TABLE public.intent_logs IS 'AI intent classification audit trail';
COMMENT ON FUNCTION public.mark_priority_lead IS 'Mark lead as priority when hot_lead intent detected';
COMMENT ON FUNCTION public.send_booking_link IS 'Trigger booking link for appointment requests';
COMMENT ON FUNCTION public.send_pricing_info IS 'Send pricing information for price questions';
COMMENT ON FUNCTION public.schedule_followup IS 'Schedule follow-up task for follow_up_required intent';
COMMENT ON FUNCTION public.archive_lead IS 'Archive lead when not_interested intent detected';
COMMENT ON FUNCTION public.log_referral_intent IS 'Log and create task for referral intent';


































