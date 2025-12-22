-- =========================================================
-- Block 19650 — Inbox Actions & Job Funnel Hooks v1
-- (From Reply → Call → Booked Job: Action Buttons That Actually Move Money)
-- =========================================================
--
-- This block makes the Inbox do something.
-- When a roofing owner clicks action buttons, we log it, update the thread,
-- and start a simple job funnel. This is the first step toward the Revenue Dashboard.
-- =========================================================

-- ============================================================================
-- 1. UPDATE inbox_action_type ENUM
-- ============================================================================
-- Add 'send_estimate_link' to match the spec (currently has 'send_estimate')

DO $$
BEGIN
  -- Check if enum exists and add new value if needed
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inbox_action_type') THEN
    -- Add send_estimate_link if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'send_estimate_link' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'inbox_action_type')
    ) THEN
      ALTER TYPE inbox_action_type ADD VALUE IF NOT EXISTS 'send_estimate_link';
    END IF;
  END IF;
END$$;

-- ============================================================================
-- 2. ADD contact_id TO inbox_actions
-- ============================================================================
-- Add contact_id field to inbox_actions for better tracking

ALTER TABLE IF EXISTS public.inbox_actions
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inbox_actions_contact_id ON public.inbox_actions(contact_id);

-- ============================================================================
-- 3. ADD closed_reason TO inbox_threads
-- ============================================================================
-- Track why a thread was closed (e.g., 'booked_estimate')

ALTER TABLE IF EXISTS public.inbox_threads
  ADD COLUMN IF NOT EXISTS closed_reason text;

CREATE INDEX IF NOT EXISTS idx_inbox_threads_closed_reason ON public.inbox_threads(closed_reason);

-- ============================================================================
-- 4. CREATE jobs_conversions TABLE
-- ============================================================================
-- Simple revenue hook that feeds the revenue dashboard later

CREATE TYPE IF NOT EXISTS conversion_type AS ENUM ('booked_estimate', 'won_job');

CREATE TABLE IF NOT EXISTS public.jobs_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  conversion_type conversion_type NOT NULL,
  estimated_value numeric(12,2), -- nullable for now
  notes text,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_conversions_thread_id ON public.jobs_conversions(thread_id);
CREATE INDEX IF NOT EXISTS idx_jobs_conversions_contact_id ON public.jobs_conversions(contact_id);
CREATE INDEX IF NOT EXISTS idx_jobs_conversions_campaign_id ON public.jobs_conversions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_jobs_conversions_conversion_type ON public.jobs_conversions(conversion_type);
CREATE INDEX IF NOT EXISTS idx_jobs_conversions_created_at ON public.jobs_conversions(created_at DESC);

-- ============================================================================
-- 5. ENABLE ROW LEVEL SECURITY FOR jobs_conversions
-- ============================================================================

ALTER TABLE public.jobs_conversions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: jobs_conversions SELECT
-- Users can only see conversions for campaigns they can view
DROP POLICY IF EXISTS "jobs_conversions_select" ON public.jobs_conversions;
CREATE POLICY "jobs_conversions_select"
  ON public.jobs_conversions
  FOR SELECT
  USING (public.can_view_campaign(campaign_id));

-- RLS Policy: jobs_conversions INSERT
-- Users can only create conversions for campaigns they can edit
DROP POLICY IF EXISTS "jobs_conversions_insert" ON public.jobs_conversions;
CREATE POLICY "jobs_conversions_insert"
  ON public.jobs_conversions
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND public.can_edit_campaign(campaign_id)
  );

-- RLS Policy: jobs_conversions UPDATE/DELETE
-- Users can only modify conversions for campaigns they can edit
DROP POLICY IF EXISTS "jobs_conversions_modify" ON public.jobs_conversions;
CREATE POLICY "jobs_conversions_modify"
  ON public.jobs_conversions
  FOR ALL
  USING (public.can_edit_campaign(campaign_id))
  WITH CHECK (public.can_edit_campaign(campaign_id));

-- ============================================================================
-- 6. COMMENTS
-- ============================================================================

COMMENT ON TABLE public.jobs_conversions IS 'Tracks job conversions from SmartSend inbox actions. Feeds the Revenue Dashboard.';
COMMENT ON COLUMN public.jobs_conversions.conversion_type IS 'Type of conversion: booked_estimate (when Mark as Booked clicked) or won_job (future)';
COMMENT ON COLUMN public.jobs_conversions.estimated_value IS 'Estimated job value in dollars (nullable for now)';
COMMENT ON COLUMN public.inbox_actions.contact_id IS 'Contact associated with this action (nullable but preferred)';
COMMENT ON COLUMN public.inbox_threads.closed_reason IS 'Reason thread was closed (e.g., booked_estimate, archived, etc.)';



















































