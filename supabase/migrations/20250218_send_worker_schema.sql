-- Send Worker Schema: Ensure email_jobs and send_logs support provider-aware sending with retries

-- 1. Ensure email_jobs has next_run_at field (for retry scheduling)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'email_jobs' 
    AND column_name = 'next_run_at'
  ) THEN
    ALTER TABLE public.email_jobs ADD COLUMN next_run_at timestamptz;
  END IF;
END $$;

-- Create index for efficient due job queries
CREATE INDEX IF NOT EXISTS idx_email_jobs_next_run_at 
  ON public.email_jobs(status, next_run_at) 
  WHERE status = 'queued';

-- 2. Ensure send_logs table exists with job_id field (references email_jobs)
CREATE TABLE IF NOT EXISTS public.send_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.email_jobs(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  message text NOT NULL,
  provider text,
  message_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for send_logs
CREATE INDEX IF NOT EXISTS idx_send_logs_job_id ON public.send_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_send_logs_created_at ON public.send_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.send_logs ENABLE ROW LEVEL SECURITY;

-- Service role can insert logs
DROP POLICY IF EXISTS "send_logs_insert_service" ON public.send_logs;
CREATE POLICY "send_logs_insert_service" ON public.send_logs
  FOR INSERT TO service_role
  USING (true) WITH CHECK (true);

-- Users can read logs for their workspace jobs
DROP POLICY IF EXISTS "send_logs_select_workspace" ON public.send_logs;
CREATE POLICY "send_logs_select_workspace" ON public.send_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.email_jobs ej
      WHERE ej.id = send_logs.job_id
      AND ej.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members 
        WHERE user_id = auth.uid()
      )
    )
  );

-- 3. Ensure user_connections table exists for OAuth tokens
-- (This might already exist, but we ensure the necessary fields are present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'user_connections'
  ) THEN
    CREATE TABLE public.user_connections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      provider text NOT NULL CHECK (provider IN ('gmail', 'outlook')),
      email_address text NOT NULL,
      access_token text,
      refresh_token text,
      expires_at timestamptz,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_user_connections_user_provider 
      ON public.user_connections(user_id, provider);
  ELSE
    -- Add columns if they don't exist
    ALTER TABLE public.user_connections 
      ADD COLUMN IF NOT EXISTS email_address text,
      ADD COLUMN IF NOT EXISTS expires_at timestamptz;
  END IF;
END $$;
