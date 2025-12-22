-- Block 29: Send Queue Polish (Per-Mailbox Pacing + Window Scheduling)
-- Adds per-mailbox pacing controls and daily send windows to existing send_queue

-- 1. Ensure mailbox-level pacing columns exist on mailboxes table
DO $$ 
BEGIN
  -- Add hourly_limit if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'mailboxes' AND column_name = 'hourly_limit'
  ) THEN
    ALTER TABLE public.mailboxes ADD COLUMN hourly_limit int DEFAULT 40;
  END IF;

  -- Add send_start time if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'mailboxes' AND column_name = 'send_start'
  ) THEN
    ALTER TABLE public.mailboxes ADD COLUMN send_start time DEFAULT '09:00';
  END IF;

  -- Add send_end time if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'mailboxes' AND column_name = 'send_end'
  ) THEN
    ALTER TABLE public.mailboxes ADD COLUMN send_end time DEFAULT '18:00';
  END IF;

  -- Add daily_limit if not exists (as safety check)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'mailboxes' AND column_name = 'daily_limit'
  ) THEN
    ALTER TABLE public.mailboxes ADD COLUMN daily_limit int DEFAULT 200;
  END IF;
END $$;

-- 2. Ensure send_queue has all required columns for polish
DO $$ 
BEGIN
  -- Add mailbox_id if not exists (should already exist from send_queue_system migration)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'send_queue' AND column_name = 'mailbox_id'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN mailbox_id uuid REFERENCES public.mailboxes(id) ON DELETE CASCADE;
  END IF;

  -- Add attempts if not exists (rename from attempt if it exists)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'send_queue' AND column_name = 'attempt'
  ) THEN
    -- Rename attempt to attempts for consistency
    ALTER TABLE public.send_queue RENAME COLUMN attempt TO attempts;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'send_queue' AND column_name = 'attempts'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN attempts int DEFAULT 0;
  END IF;

  -- Ensure scheduled_at exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'send_queue' AND column_name = 'scheduled_at'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN scheduled_at timestamptz NOT NULL DEFAULT now();
  END IF;

  -- Ensure sent_at exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'send_queue' AND column_name = 'sent_at'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN sent_at timestamptz;
  END IF;

  -- Ensure error column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'send_queue' AND column_name = 'error'
  ) THEN
    ALTER TABLE public.send_queue ADD COLUMN error text;
  END IF;

  -- Ensure status has correct check constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'send_queue_status_check'
  ) THEN
    -- Drop old constraint
    ALTER TABLE public.send_queue DROP CONSTRAINT send_queue_status_check;
  END IF;

  -- Add correct status constraint
  ALTER TABLE public.send_queue ADD CONSTRAINT send_queue_status_check 
    CHECK (status IN ('pending','sending','sent','failed'));
END $$;

-- 3. Create indexes for efficient queue processing
CREATE INDEX IF NOT EXISTS send_queue_mailbox_status_scheduled_idx 
  ON public.send_queue (mailbox_id, status, scheduled_at)
  WHERE status IN ('pending', 'sending');

CREATE INDEX IF NOT EXISTS send_queue_created_at_idx 
  ON public.send_queue (created_at DESC);

-- 4. Add comment for documentation
COMMENT ON COLUMN public.mailboxes.hourly_limit IS 'Maximum emails per hour for this mailbox';
COMMENT ON COLUMN public.mailboxes.daily_limit IS 'Maximum emails per day for this mailbox';
COMMENT ON COLUMN public.mailboxes.send_start IS 'Start time of daily send window (HH:MM format)';
COMMENT ON COLUMN public.mailboxes.send_end IS 'End time of daily send window (HH:MM format)';

-- 5. Ensure trigger function exists for updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at() 
RETURNS TRIGGER 
LANGUAGE plpgsql AS $$
BEGIN 
  NEW.updated_at = now(); 
  RETURN NEW; 
END; 
$$;

-- Create/update trigger for send_queue
DROP TRIGGER IF EXISTS trg_send_queue_updated ON public.send_queue;
CREATE TRIGGER trg_send_queue_updated 
  BEFORE UPDATE ON public.send_queue
  FOR EACH ROW 
  EXECUTE FUNCTION public.touch_updated_at();

