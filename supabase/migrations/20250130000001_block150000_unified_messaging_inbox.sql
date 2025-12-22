-- =========================================================
-- Block 150000 — SmartSend Unified Messaging Inbox + Multi-Channel Threads + Read/Reply System v1
-- =========================================================
-- 
-- UNIFIED MESSAGING INBOX — ALL CHANNELS IN ONE PLACE
-- 
-- This block creates a unified inbox system that gathers:
-- - Emails
-- - SMS conversations
-- - Website widget chats
-- - AI call transcripts
-- - Booking confirmations
-- - Automated follow-ups
-- 
-- All into ONE THREAD per homeowner.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE UNIFIED MESSAGES TABLE
-- ============================================================================
-- Universal message table that stores all communication channels

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Channel and direction
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'widget', 'call', 'system')),
  direction text NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  
  -- Sender information
  sender text,                -- Homeowner name or SmartSend user name
  sender_email text,          -- Email address (for email channel)
  sender_phone text,           -- Phone number (for SMS/call channels)
  
  -- Message content
  body text NOT NULL,
  subject text,               -- For email channel
  body_html text,             -- HTML version (for email)
  
  -- Metadata (JSONB for flexible channel-specific data)
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- External IDs (provider message IDs, thread IDs, etc.)
  external_id text,           -- Provider message ID (e.g., Twilio SID, Gmail message ID)
  external_thread_id text,    -- Provider thread ID (e.g., Gmail thread ID)
  
  -- Read state tracking
  read_by_users uuid[] DEFAULT '{}'::uuid[],  -- Array of user IDs who have read this message
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_messages_company_id ON public.messages(company_id);
CREATE INDEX IF NOT EXISTS idx_messages_lead_id ON public.messages(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_channel ON public.messages(channel);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON public.messages(direction);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_lead_created ON public.messages(lead_id, created_at DESC) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_company_created ON public.messages(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_external_id ON public.messages(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_external_thread_id ON public.messages(external_thread_id) WHERE external_thread_id IS NOT NULL;

-- GIN index for metadata JSONB queries
CREATE INDEX IF NOT EXISTS idx_messages_metadata ON public.messages USING GIN(metadata);

-- GIN index for read_by_users array queries
CREATE INDEX IF NOT EXISTS idx_messages_read_by_users ON public.messages USING GIN(read_by_users);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_messages_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_updated_at ON public.messages;
CREATE TRIGGER trg_messages_updated_at
BEFORE UPDATE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.update_messages_updated_at();

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Company members can view messages for their company
CREATE POLICY "messages_company_members_select"
  ON public.messages
  FOR SELECT
  USING (
    company_id IN (
      SELECT rc.id
      FROM public.roofing_companies rc
      WHERE rc.owner_id = auth.uid()
         OR rc.id IN (
           SELECT rcm.roofing_company_id
           FROM public.roofing_company_members rcm
           WHERE rcm.user_id = auth.uid()
         )
    )
  );

-- RLS Policy: Company members can insert messages
CREATE POLICY "messages_company_members_insert"
  ON public.messages
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT rc.id
      FROM public.roofing_companies rc
      WHERE rc.owner_id = auth.uid()
         OR rc.id IN (
           SELECT rcm.roofing_company_id
           FROM public.roofing_company_members rcm
           WHERE rcm.user_id = auth.uid()
         )
    )
  );

-- RLS Policy: Company members can update messages (for read state)
CREATE POLICY "messages_company_members_update"
  ON public.messages
  FOR UPDATE
  USING (
    company_id IN (
      SELECT rc.id
      FROM public.roofing_companies rc
      WHERE rc.owner_id = auth.uid()
         OR rc.id IN (
           SELECT rcm.roofing_company_id
           FROM public.roofing_company_members rcm
           WHERE rcm.user_id = auth.uid()
         )
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT rc.id
      FROM public.roofing_companies rc
      WHERE rc.owner_id = auth.uid()
         OR rc.id IN (
           SELECT rcm.roofing_company_id
           FROM public.roofing_company_members rcm
           WHERE rcm.user_id = auth.uid()
         )
    )
  );

-- Service role can do everything (for webhooks and background jobs)
CREATE POLICY "messages_service_role_all"
  ON public.messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.messages IS 'Block 150000: Unified messages table - all communication channels in one place';
COMMENT ON COLUMN public.messages.channel IS 'Communication channel: email, sms, widget, call, system';
COMMENT ON COLUMN public.messages.direction IS 'Message direction: incoming (from homeowner) or outgoing (from SmartSend)';
COMMENT ON COLUMN public.messages.read_by_users IS 'Array of user IDs who have read this message';
COMMENT ON COLUMN public.messages.metadata IS 'Channel-specific metadata (e.g., call duration, widget session ID, email headers)';

-- ============================================================================
-- PART 2 — HELPER FUNCTION: Mark messages as read
-- ============================================================================
-- Function to mark messages as read by a user

CREATE OR REPLACE FUNCTION public.mark_messages_read(
  p_lead_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update messages for this lead to include user_id in read_by_users array
  UPDATE public.messages
  SET read_by_users = array_append(read_by_users, p_user_id)
  WHERE lead_id = p_lead_id
    AND NOT (p_user_id = ANY(read_by_users));  -- Only append if not already in array
END;
$$;

COMMENT ON FUNCTION public.mark_messages_read IS 'Block 150000: Mark all messages for a lead as read by a user';

-- ============================================================================
-- PART 3 — VIEW: Latest message per lead (for inbox list)
-- ============================================================================
-- View to get the latest message for each lead for inbox display

CREATE OR REPLACE VIEW public.messages_inbox_view AS
SELECT DISTINCT ON (m.lead_id)
  m.id,
  m.company_id,
  m.lead_id,
  m.channel,
  m.direction,
  m.sender,
  m.body,
  m.subject,
  m.created_at,
  m.read_by_users,
  -- Lead information
  l.name as lead_name,
  l.email as lead_email,
  l.phone as lead_phone,
  l.address as lead_address,
  l.heat_score,
  l.status as lead_status,
  -- Unread count for this lead
  (
    SELECT COUNT(*)
    FROM public.messages m2
    WHERE m2.lead_id = m.lead_id
      AND m2.direction = 'incoming'
      AND (m2.read_by_users IS NULL OR array_length(m2.read_by_users, 1) IS NULL)
  ) as unread_count
FROM public.messages m
LEFT JOIN public.leads l ON l.id = m.lead_id
WHERE m.lead_id IS NOT NULL
ORDER BY m.lead_id, m.created_at DESC;

COMMENT ON VIEW public.messages_inbox_view IS 'Block 150000: Inbox view showing latest message per lead with unread counts';

-- Grant access to the view
GRANT SELECT ON public.messages_inbox_view TO authenticated;
GRANT SELECT ON public.messages_inbox_view TO service_role;

-- ============================================================================
-- PART 4 — INDEXES FOR PERFORMANCE
-- ============================================================================
-- Additional composite indexes for common query patterns

-- For inbox list queries (company, latest message per lead)
CREATE INDEX IF NOT EXISTS idx_messages_company_lead_created 
  ON public.messages(company_id, lead_id, created_at DESC) 
  WHERE lead_id IS NOT NULL;

-- For unread message queries
CREATE INDEX IF NOT EXISTS idx_messages_unread 
  ON public.messages(lead_id, created_at DESC) 
  WHERE direction = 'incoming' 
    AND array_length(read_by_users, 1) IS NULL;


























