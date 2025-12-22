-- 26_send_queue.sql
-- Send Queue Refactor for High-Volume Processing
-- Supports 10,000+ automated sends/day across multiple channels

-- Ensure send_queue has required columns for scaling
DO $$ 
BEGIN
  -- Add org_id if not exists (for multi-org support)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'send_queue' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN org_id uuid;
  END IF;

  -- Add channel column if not exists (email/linkedin/whatsapp)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'send_queue' AND column_name = 'channel'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN channel text DEFAULT 'email' CHECK (channel IN ('email', 'linkedin', 'whatsapp', 'sms'));
  END IF;

  -- Add message column if not exists (the actual message content)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'send_queue' AND column_name = 'message'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN message text;
  END IF;

  -- Add retries column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'send_queue' AND column_name = 'retries'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN retries int DEFAULT 0;
  END IF;

  -- Add scheduled_for column if not exists (alias for scheduled_at)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'send_queue' AND column_name = 'scheduled_for'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN scheduled_for timestamptz DEFAULT now();
  END IF;

  -- Ensure status column exists with correct default
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'send_queue' AND column_name = 'status'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN status text DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed'));
  ELSE
    -- Update default if column exists
    ALTER TABLE public.send_queue ALTER COLUMN status SET DEFAULT 'queued';
  END IF;
END $$;

-- Create/ensure send_queue table exists with core structure
CREATE TABLE IF NOT EXISTS public.send_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,
  campaign_id uuid,
  lead_id uuid,
  message text,
  channel text DEFAULT 'email' CHECK (channel IN ('email', 'linkedin', 'whatsapp', 'sms')),
  status text DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed')),
  retries int DEFAULT 0,
  scheduled_for timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Indexes for performance (10k+ daily sends)
CREATE INDEX IF NOT EXISTS idx_send_queue_status_scheduled 
  ON public.send_queue (status, scheduled_for) 
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_send_queue_org_id 
  ON public.send_queue (org_id) 
  WHERE org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_send_queue_channel 
  ON public.send_queue (channel, status);

-- Function logs table for monitoring
CREATE TABLE IF NOT EXISTS public.function_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fn_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'error', 'warning')),
  runtime_ms int,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Index for function_logs queries
CREATE INDEX IF NOT EXISTS idx_function_logs_fn_name_created 
  ON public.function_logs (fn_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_function_logs_status 
  ON public.function_logs (status, created_at DESC);

-- Archive table for old logs
CREATE TABLE IF NOT EXISTS public.function_logs_archive (
  LIKE public.function_logs INCLUDING ALL
);

-- RLS policies
ALTER TABLE public.send_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.function_logs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access for processing
CREATE POLICY IF NOT EXISTS "service_role_full_access_send_queue"
  ON public.send_queue FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "service_role_full_access_function_logs"
  ON public.function_logs FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Allow users to read their org's send queue
CREATE POLICY IF NOT EXISTS "users_read_org_send_queue"
  ON public.send_queue FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members om
      WHERE om.org_id = send_queue.org_id
      AND om.user_id = auth.uid()
    )
  );

-- Allow users to read function logs (for monitoring)
CREATE POLICY IF NOT EXISTS "users_read_function_logs"
  ON public.function_logs FOR SELECT
  TO authenticated
  USING (true);

