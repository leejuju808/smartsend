-- =========================================================
-- Block 10700 — SmartSend Scheduler & Send Queue v1
-- The sending backbone of SmartSend
-- =========================================================

-- 1. Ensure send_queue table exists with all required fields
CREATE TABLE IF NOT EXISTS public.send_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  message_body text NOT NULL,
  subject text,
  send_at timestamptz NOT NULL,
  sent boolean DEFAULT false,
  attempts int DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Sequence tracking
  sequence_step int DEFAULT 1, -- 1, 2, 3 for message position
  step_label text, -- 'initial', 'followup-1', 'followup-2'
  
  -- Status tracking
  status text DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'canceled', 'skipped')),
  
  -- Retry tracking
  max_attempts int DEFAULT 3,
  next_retry_at timestamptz,
  
  -- Provider tracking
  provider_message_id text,
  sent_at timestamptz
);

-- Add columns if table already exists (idempotent)
DO $$
BEGIN
  -- Add user_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'send_queue' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  -- Add contact_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'send_queue' AND column_name = 'contact_id'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
  END IF;

  -- Add message_body if missing (may exist as body_html or body)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'send_queue' AND column_name = 'message_body'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN message_body text;
    -- Copy from existing body columns if they exist
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'send_queue' AND column_name = 'body_html'
    ) THEN
      UPDATE public.send_queue SET message_body = body_html WHERE message_body IS NULL AND body_html IS NOT NULL;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'send_queue' AND column_name = 'body'
    ) THEN
      UPDATE public.send_queue SET message_body = body WHERE message_body IS NULL AND body IS NOT NULL;
    END IF;
  END IF;

  -- Add send_at if missing (may exist as scheduled_at or not_before)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'send_queue' AND column_name = 'send_at'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN send_at timestamptz;
    -- Copy from existing scheduling columns
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'send_queue' AND column_name = 'scheduled_at'
    ) THEN
      UPDATE public.send_queue SET send_at = scheduled_at WHERE send_at IS NULL AND scheduled_at IS NOT NULL;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'send_queue' AND column_name = 'not_before'
    ) THEN
      UPDATE public.send_queue SET send_at = not_before WHERE send_at IS NULL AND not_before IS NOT NULL;
    ELSE
      UPDATE public.send_queue SET send_at = created_at WHERE send_at IS NULL;
    END IF;
    ALTER TABLE public.send_queue ALTER COLUMN send_at SET NOT NULL;
  END IF;

  -- Add sent boolean if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'send_queue' AND column_name = 'sent'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN sent boolean DEFAULT false;
    -- Set sent = true for rows with status = 'sent'
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'send_queue' AND column_name = 'status'
    ) THEN
      UPDATE public.send_queue SET sent = true WHERE status = 'sent';
    END IF;
  END IF;

  -- Add attempts if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'send_queue' AND column_name = 'attempts'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN attempts int DEFAULT 0;
    -- Copy from attempt if it exists
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'send_queue' AND column_name = 'attempt'
    ) THEN
      UPDATE public.send_queue SET attempts = attempt WHERE attempts = 0 AND attempt IS NOT NULL;
    END IF;
  END IF;

  -- Add error if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'send_queue' AND column_name = 'error'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN error text;
  END IF;

  -- Add sequence_step if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'send_queue' AND column_name = 'sequence_step'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN sequence_step int DEFAULT 1;
  END IF;

  -- Add step_label if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'send_queue' AND column_name = 'step_label'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN step_label text;
  END IF;

  -- Add status if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'send_queue' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN status text DEFAULT 'queued';
    -- Set status based on sent field
    UPDATE public.send_queue SET status = 'sent' WHERE sent = true AND status = 'queued';
    UPDATE public.send_queue SET status = 'failed' WHERE error IS NOT NULL AND status = 'queued';
  END IF;

  -- Add max_attempts if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'send_queue' AND column_name = 'max_attempts'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN max_attempts int DEFAULT 3;
  END IF;

  -- Add next_retry_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'send_queue' AND column_name = 'next_retry_at'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN next_retry_at timestamptz;
  END IF;

  -- Add provider_message_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'send_queue' AND column_name = 'provider_message_id'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN provider_message_id text;
  END IF;

  -- Add sent_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'send_queue' AND column_name = 'sent_at'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN sent_at timestamptz;
  END IF;

  -- Add updated_at trigger if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'send_queue' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- Update status constraint
DO $$
BEGIN
  -- Drop existing constraint if it exists
  ALTER TABLE public.send_queue DROP CONSTRAINT IF EXISTS send_queue_status_check;
  -- Add new constraint
  ALTER TABLE public.send_queue 
    ADD CONSTRAINT send_queue_status_check 
    CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'canceled', 'skipped'));
END $$;

-- 2. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_send_queue_user ON public.send_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_send_queue_campaign ON public.send_queue(campaign_id);
CREATE INDEX IF NOT EXISTS idx_send_queue_contact ON public.send_queue(contact_id);
CREATE INDEX IF NOT EXISTS idx_send_queue_send_at ON public.send_queue(send_at);
CREATE INDEX IF NOT EXISTS idx_send_queue_status ON public.send_queue(status);
CREATE INDEX IF NOT EXISTS idx_send_queue_sent ON public.send_queue(sent);
CREATE INDEX IF NOT EXISTS idx_send_queue_ready ON public.send_queue(send_at, status) 
  WHERE sent = false AND status IN ('queued', 'sending');
CREATE INDEX IF NOT EXISTS idx_send_queue_campaign_contact ON public.send_queue(campaign_id, contact_id);

-- 3. Create updated_at trigger
CREATE OR REPLACE FUNCTION public.update_send_queue_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_send_queue_updated_at ON public.send_queue;
CREATE TRIGGER trg_update_send_queue_updated_at
  BEFORE UPDATE ON public.send_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_send_queue_updated_at();

-- 4. Enable RLS
ALTER TABLE public.send_queue ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
DROP POLICY IF EXISTS "send_queue_select_own" ON public.send_queue;
CREATE POLICY "send_queue_select_own" ON public.send_queue
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "send_queue_insert_own" ON public.send_queue;
CREATE POLICY "send_queue_insert_own" ON public.send_queue
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "send_queue_update_own" ON public.send_queue;
CREATE POLICY "send_queue_update_own" ON public.send_queue
  FOR UPDATE USING (auth.uid() = user_id);

-- 6. Safety Rules: Deliverability Protection Table
CREATE TABLE IF NOT EXISTS public.send_safety_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  
  -- Rate limits
  max_sends_per_hour int DEFAULT 60,
  delay_min_seconds int DEFAULT 6,
  delay_max_seconds int DEFAULT 18,
  
  -- Auto-pause thresholds
  bounce_rate_threshold numeric(5,2) DEFAULT 5.0, -- 5%
  complaint_rate_threshold numeric(5,2) DEFAULT 0.5, -- 0.5%
  
  -- Domain warmup
  domain_warmup_days int DEFAULT 14,
  
  -- Status
  is_paused boolean DEFAULT false,
  pause_reason text,
  paused_at timestamptz,
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_send_safety_rules_user ON public.send_safety_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_send_safety_rules_campaign ON public.send_safety_rules(campaign_id);

ALTER TABLE public.send_safety_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "send_safety_rules_select_own" ON public.send_safety_rules;
CREATE POLICY "send_safety_rules_select_own" ON public.send_safety_rules
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "send_safety_rules_insert_own" ON public.send_safety_rules;
CREATE POLICY "send_safety_rules_insert_own" ON public.send_safety_rules
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "send_safety_rules_update_own" ON public.send_safety_rules;
CREATE POLICY "send_safety_rules_update_own" ON public.send_safety_rules
  FOR UPDATE USING (auth.uid() = user_id);

-- 7. Activity Logs Table (if not exists)
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  message text,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_campaign ON public.activity_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_logs_select_own" ON public.activity_logs;
CREATE POLICY "activity_logs_select_own" ON public.activity_logs
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "activity_logs_insert_own" ON public.activity_logs;
CREATE POLICY "activity_logs_insert_own" ON public.activity_logs
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 8. Helper function to check if sequence should continue
CREATE OR REPLACE FUNCTION public.should_send_sequence_step(
  p_campaign_id uuid,
  p_contact_id uuid,
  p_step_number int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_has_reply boolean;
  v_lead_status text;
  v_contact_status text;
BEGIN
  -- Check if contact has replied
  SELECT EXISTS (
    SELECT 1 FROM public.contacts c
    WHERE c.id = p_contact_id
    AND EXISTS (
      SELECT 1 FROM public.send_queue sq
      WHERE sq.contact_id = p_contact_id
      AND sq.campaign_id = p_campaign_id
      AND sq.sent = true
      AND EXISTS (
        SELECT 1 FROM public.activity_logs al
        WHERE al.contact_id = p_contact_id
        AND al.campaign_id = p_campaign_id
        AND al.event_type = 'reply_received'
      )
    )
  ) INTO v_has_reply;

  -- If reply received, don't send follow-ups
  IF v_has_reply THEN
    RETURN false;
  END IF;

  -- Check lead status (if using leads table)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'leads'
  ) THEN
    SELECT status INTO v_lead_status
    FROM public.leads
    WHERE id = (
      SELECT lead_id FROM public.contacts 
      WHERE id = p_contact_id LIMIT 1
    )
    LIMIT 1;

    -- Stop if lead is hot, warm, not_interested, or manually stopped
    IF v_lead_status IN ('hot', 'warm', 'not_interested', 'stopped') THEN
      RETURN false;
    END IF;
  END IF;

  -- Check campaign_contacts status if table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'campaign_contacts'
  ) THEN
    SELECT status INTO v_contact_status
    FROM public.campaign_contacts
    WHERE campaign_id = p_campaign_id
    AND contact_id = p_contact_id
    LIMIT 1;

    -- Stop if manually stopped
    IF v_contact_status IN ('stopped', 'paused', 'not_interested') THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

-- Comments
COMMENT ON TABLE public.send_queue IS 'The conveyor belt of SmartSend - all emails flow through this queue';
COMMENT ON COLUMN public.send_queue.send_at IS 'Exact timestamp when this message should be sent';
COMMENT ON COLUMN public.send_queue.sequence_step IS 'Position in sequence: 1=immediate, 2=after 2 days, 3=after 4 days';
COMMENT ON TABLE public.send_safety_rules IS 'Deliverability protection rules to prevent spam folder and account issues';























































