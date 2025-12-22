-- =========================================================
-- Block 21707 — SmartSend Roofing Follow-Up Scheduler Engine v1
-- (Backend logic that actually sends the follow-ups on autopilot)
-- =========================================================
-- 
-- This is the engine that:
-- - Watches every homeowner lead
-- - Knows exactly when their next follow-up is due
-- - Drops the right email into the send queue
-- - Stops instantly when a homeowner replies
--
-- For a roofer, this feels like:
-- "I sent one email on Monday… and by Friday SmartSend had followed up 3x 
--  and booked 2 extra estimates for me — without me touching it."
--
-- This is how SmartSend prints extra jobs from the same list.

-- ============================================================================
-- A. Enum types
-- ============================================================================

-- Follow-up status lifecycle
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'follow_up_status') THEN
    CREATE TYPE follow_up_status AS ENUM (
      'active',          -- still running follow-up sequence
      'paused',          -- manually paused
      'completed',       -- finished all follow-ups
      'stopped_by_reply',-- homeowner replied
      'cold',            -- no reply after final touch
      'error'            -- something broke
    );
  END IF;
END $$;

-- Follow-up stage / step in the sequence
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'follow_up_stage') THEN
    CREATE TYPE follow_up_stage AS ENUM (
      'none',        -- initial (no follow-up sent yet)
      'fu_1',        -- 48h follow-up sent
      'fu_2',        -- 4-day follow-up sent
      'fu_3',        -- 7-day follow-up sent
      'fu_4'         -- 14-day follow-up sent (final)
    );
  END IF;
END $$;

-- Email job status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'email_job_status') THEN
    CREATE TYPE email_job_status AS ENUM (
      'pending',
      'processing',
      'sent',
      'failed'
    );
  END IF;
END $$;

-- ============================================================================
-- B. follow_up_profiles — one per contact per campaign
-- ============================================================================
-- This is the "brain record" per homeowner.

CREATE TABLE IF NOT EXISTS public.follow_up_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  contact_id uuid NOT NULL,

  -- which outbound email started this follow-up sequence
  initial_email_id uuid NOT NULL,

  current_stage follow_up_stage NOT NULL DEFAULT 'none',
  status follow_up_status NOT NULL DEFAULT 'active',

  last_outbound_email_id uuid,
  last_outbound_at timestamptz,
  last_inbound_email_id uuid,
  last_inbound_at timestamptz,

  next_run_at timestamptz,  -- when the next follow-up should be attempted

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Basic indexes
CREATE INDEX IF NOT EXISTS idx_follow_up_profiles_company
  ON public.follow_up_profiles (company_id);

CREATE INDEX IF NOT EXISTS idx_follow_up_profiles_campaign
  ON public.follow_up_profiles (campaign_id);

CREATE INDEX IF NOT EXISTS idx_follow_up_profiles_contact
  ON public.follow_up_profiles (contact_id);

CREATE INDEX IF NOT EXISTS idx_follow_up_profiles_next_run
  ON public.follow_up_profiles (status, next_run_at)
  WHERE status = 'active' AND next_run_at IS NOT NULL;

-- Unique constraint: one profile per contact per campaign
CREATE UNIQUE INDEX IF NOT EXISTS idx_follow_up_profiles_unique
  ON public.follow_up_profiles (campaign_id, contact_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_follow_up_profiles_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_follow_up_profiles_updated_at ON public.follow_up_profiles;
CREATE TRIGGER trg_set_follow_up_profiles_updated_at
  BEFORE UPDATE ON public.follow_up_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_follow_up_profiles_updated_at();

-- ============================================================================
-- C. follow_up_logs — audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.follow_up_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  follow_up_profile_id uuid NOT NULL REFERENCES public.follow_up_profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  contact_id uuid NOT NULL,

  from_stage follow_up_stage,
  to_stage follow_up_stage,
  action text NOT NULL,        -- e.g. 'scheduled_fu_1', 'sent_fu_2', 'marked_cold'
  notes text,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_follow_up_logs_profile
  ON public.follow_up_logs (follow_up_profile_id);

CREATE INDEX IF NOT EXISTS idx_follow_up_logs_campaign
  ON public.follow_up_logs (campaign_id);

CREATE INDEX IF NOT EXISTS idx_follow_up_logs_contact
  ON public.follow_up_logs (contact_id);

-- ============================================================================
-- D. email_send_queue (if you don't already have one)
-- ============================================================================
-- Minimal email_send_queue for v1

CREATE TABLE IF NOT EXISTS public.email_send_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  company_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  contact_id uuid NOT NULL,

  follow_up_profile_id uuid REFERENCES public.follow_up_profiles(id) ON DELETE SET NULL,
  follow_up_stage follow_up_stage,   -- which stage this send belongs to

  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,

  status email_job_status NOT NULL DEFAULT 'pending',
  error_message text,

  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_send_queue_status
  ON public.email_send_queue (status, scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_email_send_queue_follow_up
  ON public.email_send_queue (follow_up_profile_id);

CREATE INDEX IF NOT EXISTS idx_email_send_queue_company
  ON public.email_send_queue (company_id);

CREATE INDEX IF NOT EXISTS idx_email_send_queue_campaign
  ON public.email_send_queue (campaign_id);

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE public.follow_up_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_queue ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for Edge Functions)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'follow_up_profiles'
      AND policyname = 'follow_up_profiles_service_role'
  ) THEN
    CREATE POLICY "follow_up_profiles_service_role"
      ON public.follow_up_profiles
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'follow_up_logs'
      AND policyname = 'follow_up_logs_service_role'
  ) THEN
    CREATE POLICY "follow_up_logs_service_role"
      ON public.follow_up_logs
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'email_send_queue'
      AND policyname = 'email_send_queue_service_role'
  ) THEN
    CREATE POLICY "email_send_queue_service_role"
      ON public.email_send_queue
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Comments
COMMENT ON TABLE public.follow_up_profiles IS 'Block 21707: Brain record per homeowner for follow-up sequence tracking';
COMMENT ON COLUMN public.follow_up_profiles.current_stage IS 'Current stage: none, fu_1 (48h), fu_2 (4d), fu_3 (7d), fu_4 (14d)';
COMMENT ON COLUMN public.follow_up_profiles.next_run_at IS 'When the next follow-up should be attempted (checked by scheduler)';
COMMENT ON COLUMN public.follow_up_profiles.status IS 'Status: active, paused, completed, stopped_by_reply, cold, error';

COMMENT ON TABLE public.follow_up_logs IS 'Block 21707: Audit trail of all follow-up actions';
COMMENT ON TABLE public.email_send_queue IS 'Block 21707: Email jobs queued for sending by follow-up scheduler';











































