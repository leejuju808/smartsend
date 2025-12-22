-- File: supabase/migrations/20251016000000_create_messages_table.sql
-- Migration: Create messages table for inbox reply webhook system

-- Create enum for message direction if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_direction') THEN
    CREATE TYPE public.message_direction AS ENUM ('outbound', 'inbound');
  END IF;
END$$;

-- messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL, -- future: map inbound "to" to workspace owner
  direction public.message_direction NOT NULL DEFAULT 'inbound',

  from_email text,
  to_email text,
  subject text,
  body_text text,
  body_html text,

  reply_intent text NULL,               -- e.g., MEETING_INTENT, NO_INTENT, OOO, Follow Up Later
  intent_updated_at timestamptz NULL,

  reply_received_at timestamptz NULL,
  provider text NULL,                   -- resend, mailgun, sendgrid, other
  provider_message_id text NULL,
  thread_id text NULL,

  reply_raw jsonb,                      -- raw provider payload for audit/debug
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for analytics & lookups
CREATE INDEX IF NOT EXISTS idx_messages_userid_created ON public.messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_direction ON public.messages(direction);
CREATE INDEX IF NOT EXISTS idx_messages_intent ON public.messages(reply_intent);
CREATE INDEX IF NOT EXISTS idx_messages_provider_msgid ON public.messages(provider_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_from_email ON public.messages(from_email);
CREATE INDEX IF NOT EXISTS idx_messages_to_email ON public.messages(to_email);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies:
-- Authenticated users can see only their rows (where user_id = auth.uid()).
-- For now inbound rows may have user_id = NULL (inserted by service role). Those are not visible to end users.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='messages' AND policyname='Select own messages'
  ) THEN
    CREATE POLICY "Select own messages"
      ON public.messages
      FOR SELECT
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='messages' AND policyname='Insert own messages'
  ) THEN
    CREATE POLICY "Insert own messages"
      ON public.messages
      FOR INSERT
      WITH CHECK (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='messages' AND policyname='Update own messages'
  ) THEN
    CREATE POLICY "Update own messages"
      ON public.messages
      FOR UPDATE
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END$$;

-- Comment for documentation
COMMENT ON TABLE public.messages IS 'Stores inbound and outbound messages for analytics and reply intent detection';
COMMENT ON COLUMN public.messages.user_id IS 'NULL for inbound webhooks (to be resolved via to_email mapping), or the authenticated user for outbound messages';
COMMENT ON COLUMN public.messages.reply_intent IS 'Classified intent: MEETING_INTENT, NO_INTENT, etc.';
COMMENT ON COLUMN public.messages.reply_raw IS 'Full raw webhook payload for debugging and audit trail';
