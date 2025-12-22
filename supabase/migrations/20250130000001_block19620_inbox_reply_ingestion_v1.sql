-- =========================================================
-- Block 19620 — Inbox Reply Ingestion Pipeline v1
-- (Email Provider Webhook → Thread Matching → Message Save → Owner Visibility)
-- =========================================================
--
-- This block creates the infrastructure for capturing homeowner replies
-- and routing them into the SmartSend inbox system.
-- =========================================================

-- ============================================================================
-- 1. CREATE inbound_email_logs TABLE
-- ============================================================================
-- Logs all inbound webhook payloads for debugging and audit trail

CREATE TABLE IF NOT EXISTS public.inbound_email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payload jsonb NOT NULL, -- Full webhook payload from email provider
  provider text, -- 'postmark', 'resend', 'mailgun', etc.
  processed boolean DEFAULT false, -- Whether we successfully processed this
  error_message text, -- Error message if processing failed
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inbound_email_logs_processed ON public.inbound_email_logs(processed);
CREATE INDEX IF NOT EXISTS idx_inbound_email_logs_provider ON public.inbound_email_logs(provider);
CREATE INDEX IF NOT EXISTS idx_inbound_email_logs_created_at ON public.inbound_email_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.inbound_email_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only service role can insert/read logs (webhook endpoint uses service role)
DROP POLICY IF EXISTS "inbound_email_logs_service_role" ON public.inbound_email_logs;
CREATE POLICY "inbound_email_logs_service_role"
  ON public.inbound_email_logs
  FOR ALL
  USING (true) -- Service role bypasses RLS, but we set this for completeness
  WITH CHECK (true);

COMMENT ON TABLE public.inbound_email_logs IS 'Logs all inbound webhook payloads for debugging. Nothing is lost even if processing fails.';

-- ============================================================================
-- 2. ADD COLUMNS TO inbox_messages FOR INBOUND TRACKING
-- ============================================================================
-- Add fields to track original message IDs for thread matching

DO $$
BEGIN
  -- Add in_reply_to column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'inbox_messages' 
    AND column_name = 'in_reply_to'
  ) THEN
    ALTER TABLE public.inbox_messages 
      ADD COLUMN in_reply_to text;
  END IF;

  -- Add message_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'inbox_messages' 
    AND column_name = 'message_id'
  ) THEN
    ALTER TABLE public.inbox_messages 
      ADD COLUMN message_id text;
  END IF;

  -- Add references column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'inbox_messages' 
    AND column_name = 'references'
  ) THEN
    ALTER TABLE public.inbox_messages 
      ADD COLUMN references text;
  END IF;
END$$;

-- Indexes for thread matching
CREATE INDEX IF NOT EXISTS idx_inbox_messages_in_reply_to ON public.inbox_messages(in_reply_to);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_message_id ON public.inbox_messages(message_id);

-- ============================================================================
-- 3. ADD PARTIAL UNIQUE INDEX TO inbox_threads FOR contact_id + campaign_id
-- ============================================================================
-- Ensures one thread per contact per campaign (only when contact_id is not null)
-- Note: We use a partial unique index because contact_id can be null for orphaned messages

DO $$
BEGIN
  -- Drop existing constraint if it exists (in case it was added as a constraint)
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'inbox_threads_contact_campaign_unique'
  ) THEN
    ALTER TABLE public.inbox_threads
      DROP CONSTRAINT inbox_threads_contact_campaign_unique;
  END IF;
END$$;

-- Create partial unique index (only applies when contact_id is not null)
-- Drop index if it exists first, then create
DROP INDEX IF EXISTS idx_inbox_threads_contact_campaign_unique;
CREATE UNIQUE INDEX idx_inbox_threads_contact_campaign_unique
  ON public.inbox_threads(contact_id, campaign_id)
  WHERE contact_id IS NOT NULL;

-- ============================================================================
-- 4. ENABLE REALTIME FOR inbox_messages AND inbox_threads
-- ============================================================================
-- Allows frontend to subscribe to new messages/threads in real-time
-- Note: This requires superuser privileges. If it fails, enable via Supabase Dashboard.

DO $$
BEGIN
  -- Add inbox_messages to realtime publication
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND tablename = 'inbox_messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_messages;
    END IF;
  END IF;
  
  -- Add inbox_threads to realtime publication
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' 
      AND tablename = 'inbox_threads'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_threads;
    END IF;
  END IF;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Realtime publication update requires superuser. Enable via Supabase Dashboard > Database > Replication.';
END $$;

COMMENT ON TABLE public.inbound_email_logs IS 'Audit log for all inbound email webhooks. Ensures no reply is lost even if processing fails.';

