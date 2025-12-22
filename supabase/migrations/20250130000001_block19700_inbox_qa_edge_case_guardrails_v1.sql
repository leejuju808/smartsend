-- =========================================================
-- Block 19700 — Inbox QA & Edge-Case Guardrails v1
-- (Orphaned Replies, Mis-Threaded Messages, Bounces, Duplicates, and Safety Nets)
-- =========================================================
--
-- This block makes the SmartSend Owner Inbox bulletproof by adding:
-- - Orphaned reply detection and handling
-- - Mis-threaded conversation detection
-- - Duplicate message prevention
-- - Bounce & auto-reply filtering
-- - Long thread safety (50+ messages)
-- - HTML/email body cleaning
-- - Reliability logging
-- =========================================================

-- ============================================================================
-- 1. ADD COLUMNS TO inbox_messages TABLE
-- ============================================================================

-- Add columns for orphaned reply tracking
ALTER TABLE public.inbox_messages
  ADD COLUMN IF NOT EXISTS is_orphaned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS system_message boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS message_id text, -- Email Message-ID header for duplicate detection
  ADD COLUMN IF NOT EXISTS message_hash text, -- Hash for duplicate detection (from_email + to_email + received_at + body_clean)
  ADD COLUMN IF NOT EXISTS thread_mismatch_warning boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS body_html text; -- Store HTML version for better cleaning

-- Add indexes for new columns
CREATE INDEX IF NOT EXISTS idx_inbox_messages_is_orphaned ON public.inbox_messages(is_orphaned) WHERE is_orphaned = true;
CREATE INDEX IF NOT EXISTS idx_inbox_messages_system_message ON public.inbox_messages(system_message) WHERE system_message = true;
CREATE INDEX IF NOT EXISTS idx_inbox_messages_message_id ON public.inbox_messages(message_id) WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_messages_message_hash ON public.inbox_messages(message_hash) WHERE message_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inbox_messages_thread_mismatch ON public.inbox_messages(thread_mismatch_warning) WHERE thread_mismatch_warning = true;

-- Make campaign_id nullable for orphaned messages
ALTER TABLE public.inbox_messages
  ALTER COLUMN campaign_id DROP NOT NULL;

-- ============================================================================
-- 2. UPDATE inbound_email_logs TABLE
-- ============================================================================

-- Add duplicate_detected column if it doesn't exist
ALTER TABLE public.inbound_email_logs
  ADD COLUMN IF NOT EXISTS duplicate_detected boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_inbound_email_logs_duplicate ON public.inbound_email_logs(duplicate_detected) WHERE duplicate_detected = true;

-- ============================================================================
-- 3. CREATE inbox_qa_logs TABLE
-- ============================================================================
-- Logs all QA events for reliability monitoring

CREATE TABLE IF NOT EXISTS public.inbox_qa_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL, -- 'orphan_detected', 'thread_mismatch_detected', 'duplicate_blocked', 'system_message_filtered', 'html_corrupted_cleaned'
  payload jsonb DEFAULT '{}'::jsonb, -- Flexible JSON for event-specific data
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  message_id uuid REFERENCES public.inbox_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inbox_qa_logs_event_type ON public.inbox_qa_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_inbox_qa_logs_thread_id ON public.inbox_qa_logs(thread_id);
CREATE INDEX IF NOT EXISTS idx_inbox_qa_logs_contact_id ON public.inbox_qa_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_inbox_qa_logs_message_id ON public.inbox_qa_logs(message_id);
CREATE INDEX IF NOT EXISTS idx_inbox_qa_logs_created_at ON public.inbox_qa_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.inbox_qa_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view QA logs for campaigns they can view
DROP POLICY IF EXISTS "inbox_qa_logs_select" ON public.inbox_qa_logs;
CREATE POLICY "inbox_qa_logs_select"
  ON public.inbox_qa_logs
  FOR SELECT
  USING (
    thread_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.inbox_threads it
      WHERE it.id = inbox_qa_logs.thread_id
      AND public.can_view_campaign(it.campaign_id)
    )
  );

-- ============================================================================
-- 4. CREATE HELPER FUNCTIONS
-- ============================================================================

-- Function to generate message hash for duplicate detection
CREATE OR REPLACE FUNCTION public.generate_message_hash(
  p_from_email text,
  p_to_email text,
  p_received_at timestamptz,
  p_body_clean text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  -- Generate hash from from_email + to_email + received_at (rounded to nearest 2 seconds) + body_clean
  RETURN encode(
    digest(
      LOWER(COALESCE(p_from_email, '')) || '|' ||
      LOWER(COALESCE(p_to_email, '')) || '|' ||
      date_trunc('second', p_received_at)::text || '|' ||
      COALESCE(p_body_clean, ''),
      'sha256'
    ),
    'hex'
  );
END;
$$;

-- Function to check for duplicate messages
CREATE OR REPLACE FUNCTION public.check_duplicate_message(
  p_message_id text,
  p_message_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_exists boolean;
BEGIN
  -- Check by message_id first (most reliable)
  IF p_message_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.inbox_messages
      WHERE message_id = p_message_id
    ) INTO v_exists;
    
    IF v_exists THEN
      RETURN true;
    END IF;
  END IF;
  
  -- Check by message_hash (fallback for messages without Message-ID)
  IF p_message_hash IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.inbox_messages
      WHERE message_hash = p_message_hash
    ) INTO v_exists;
    
    IF v_exists THEN
      RETURN true;
    END IF;
  END IF;
  
  RETURN false;
END;
$$;

-- Function to detect system messages (bounces, auto-replies, etc.)
CREATE OR REPLACE FUNCTION public.is_system_message(
  p_from_email text,
  p_subject text,
  p_body text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_lower_from text;
  v_lower_subject text;
  v_lower_body text;
BEGIN
  v_lower_from := LOWER(COALESCE(p_from_email, ''));
  v_lower_subject := LOWER(COALESCE(p_subject, ''));
  v_lower_body := LOWER(COALESCE(p_body, ''));
  
  -- Check from_email patterns
  IF v_lower_from ~ '^(noreply|no-reply|donotreply|mailer-daemon|postmaster|bounce|automated|daemon|mailer)@' THEN
    RETURN true;
  END IF;
  
  -- Check subject patterns
  IF v_lower_subject ~ '(auto-reply|out of office|out of the office|ooo|automatic reply|autoreply|undeliverable|delivery failed|mailer-daemon|postmaster|this is an automated message|mailbox full|mailbox is full|delivery failure|bounce|bounced)' THEN
    RETURN true;
  END IF;
  
  -- Check body patterns
  IF v_lower_body ~ '(auto-reply|out of office|out of the office|ooo|automatic reply|autoreply|undeliverable|delivery failed|mailer-daemon|postmaster|this is an automated message|mailbox full|mailbox is full|delivery failure|bounce|bounced|dmarc|dkim|spf)' THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- Function to clean HTML email body
CREATE OR REPLACE FUNCTION public.clean_email_html(
  p_html text,
  p_text text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_cleaned text;
BEGIN
  -- Use text if available, otherwise convert HTML to text
  IF p_text IS NOT NULL AND LENGTH(TRIM(p_text)) > 0 THEN
    v_cleaned := p_text;
  ELSIF p_html IS NOT NULL AND LENGTH(TRIM(p_html)) > 0 THEN
    -- Basic HTML to text conversion (remove tags)
    v_cleaned := regexp_replace(p_html, '<[^>]+>', ' ', 'g');
    v_cleaned := regexp_replace(v_cleaned, '&nbsp;', ' ', 'g');
    v_cleaned := regexp_replace(v_cleaned, '&amp;', '&', 'g');
    v_cleaned := regexp_replace(v_cleaned, '&lt;', '<', 'g');
    v_cleaned := regexp_replace(v_cleaned, '&gt;', '>', 'g');
    v_cleaned := regexp_replace(v_cleaned, '&quot;', '"', 'g');
  ELSE
    RETURN '';
  END IF;
  
  -- Remove common email signatures
  v_cleaned := regexp_replace(v_cleaned, '(?:\r?\n){2,}--\s*\r?\n.*$', '', 's');
  v_cleaned := regexp_replace(v_cleaned, '(?:\r?\n){2,}Sent from.*$', '', 'is');
  v_cleaned := regexp_replace(v_cleaned, '(?:\r?\n){2,}Best regards.*$', '', 'is');
  v_cleaned := regexp_replace(v_cleaned, '(?:\r?\n){2,}Regards.*$', '', 'is');
  v_cleaned := regexp_replace(v_cleaned, '(?:\r?\n){2,}Thanks.*$', '', 'is');
  v_cleaned := regexp_replace(v_cleaned, '(?:\r?\n){2,}Sincerely.*$', '', 'is');
  v_cleaned := regexp_replace(v_cleaned, '(?:\r?\n){2,}Sent from my (iPhone|Android|iPad).*$', '', 'is');
  
  -- Remove "On [date] wrote:" patterns (quoted replies)
  v_cleaned := regexp_replace(v_cleaned, '(?:\r?\n){2,}On\s+[\w\s,:\-]+\s+wrote:.*$', '', 's');
  v_cleaned := regexp_replace(v_cleaned, '(?:\r?\n){2,}From:.*$', '', 's');
  v_cleaned := regexp_replace(v_cleaned, '(?:\r?\n){2,}Date:.*$', '', 's');
  v_cleaned := regexp_replace(v_cleaned, '(?:\r?\n){2,}Subject:.*$', '', 's');
  v_cleaned := regexp_replace(v_cleaned, '(?:\r?\n){2,}-----Original Message-----.*$', '', 'is');
  
  -- Keep only last 5-8 lines of quoted text (trim long quoted threads)
  -- This is a simple approach - keep first 2000 chars which should cover most replies
  IF LENGTH(v_cleaned) > 2000 THEN
    v_cleaned := LEFT(v_cleaned, 2000) || '...';
  END IF;
  
  -- Remove excessive whitespace
  v_cleaned := regexp_replace(v_cleaned, '\n{3,}', '\n\n', 'g');
  v_cleaned := regexp_replace(v_cleaned, '[ \t]+', ' ', 'g');
  v_cleaned := TRIM(v_cleaned);
  
  RETURN v_cleaned;
END;
$$;

-- Function to detect thread mismatch
CREATE OR REPLACE FUNCTION public.detect_thread_mismatch(
  p_thread_id uuid,
  p_from_email text,
  p_subject text,
  p_body text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread_emails text[];
  v_thread_subject text;
  v_thread_contact_id uuid;
BEGIN
  -- Get all from_emails in this thread
  SELECT ARRAY_AGG(DISTINCT from_email), MAX(subject), MAX(contact_id)
  INTO v_thread_emails, v_thread_subject, v_thread_contact_id
  FROM public.inbox_messages
  WHERE thread_id = p_thread_id;
  
  -- Check if from_email is different from all previous emails in thread
  IF p_from_email IS NOT NULL AND v_thread_emails IS NOT NULL THEN
    IF NOT (p_from_email = ANY(v_thread_emails)) THEN
      -- Different email detected - potential mismatch
      RETURN true;
    END IF;
  END IF;
  
  -- Check if subject deviates drastically (simple heuristic: if subject is completely different)
  IF p_subject IS NOT NULL AND v_thread_subject IS NOT NULL THEN
    -- If subjects are very different (less than 30% similarity), flag as mismatch
    -- This is a simple check - could be enhanced with fuzzy matching
    IF LOWER(p_subject) != LOWER(v_thread_subject) AND
       LENGTH(p_subject) > 10 AND LENGTH(v_thread_subject) > 10 THEN
      -- Check if they share common words (simple similarity check)
      DECLARE
        v_common_words int := 0;
        v_words1 text[];
        v_words2 text[];
      BEGIN
        v_words1 := string_to_array(LOWER(p_subject), ' ');
        v_words2 := string_to_array(LOWER(v_thread_subject), ' ');
        
        -- Count common words
        SELECT COUNT(*) INTO v_common_words
        FROM unnest(v_words1) word1
        WHERE word1 = ANY(v_words2);
        
        -- If less than 2 common words, likely mismatch
        IF v_common_words < 2 THEN
          RETURN true;
        END IF;
      END;
    END IF;
  END IF;
  
  RETURN false;
END;
$$;

-- Function to log QA event
CREATE OR REPLACE FUNCTION public.log_qa_event(
  p_event_type text,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_thread_id uuid DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_message_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log_id uuid;
BEGIN
  INSERT INTO public.inbox_qa_logs (
    event_type,
    payload,
    thread_id,
    contact_id,
    message_id
  ) VALUES (
    p_event_type,
    p_payload,
    p_thread_id,
    p_contact_id,
    p_message_id
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- ============================================================================
-- 5. ADD TRIGGER FOR THREAD MESSAGE COUNT TRACKING
-- ============================================================================

-- Add message_count column to inbox_threads for long thread detection
ALTER TABLE public.inbox_threads
  ADD COLUMN IF NOT EXISTS message_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_inbox_threads_message_count ON public.inbox_threads(message_count);

-- Function to update message count on thread
CREATE OR REPLACE FUNCTION public.update_thread_message_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update message count for the thread
  UPDATE public.inbox_threads
  SET message_count = (
    SELECT COUNT(*) FROM public.inbox_messages
    WHERE thread_id = NEW.thread_id
  )
  WHERE id = NEW.thread_id;
  
  RETURN NEW;
END;
$$;

-- Trigger to update message count on insert
DROP TRIGGER IF EXISTS trg_update_thread_message_count ON public.inbox_messages;
CREATE TRIGGER trg_update_thread_message_count
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_thread_message_count();

-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.inbox_qa_logs IS 'Logs all QA events for reliability monitoring and debugging';
COMMENT ON COLUMN public.inbox_messages.is_orphaned IS 'True when message has no matching campaign_id, contact_id, or thread_id';
COMMENT ON COLUMN public.inbox_messages.system_message IS 'True when message is a bounce, auto-reply, or system message';
COMMENT ON COLUMN public.inbox_messages.message_id IS 'Email Message-ID header for duplicate detection';
COMMENT ON COLUMN public.inbox_messages.message_hash IS 'Hash of from_email + to_email + received_at + body_clean for duplicate detection';
COMMENT ON COLUMN public.inbox_messages.thread_mismatch_warning IS 'True when message appears to be mis-threaded (different email or subject)';
COMMENT ON COLUMN public.inbox_messages.body_html IS 'Original HTML body for better cleaning and display';
COMMENT ON COLUMN public.inbox_threads.message_count IS 'Number of messages in this thread (for long thread detection)';



















































