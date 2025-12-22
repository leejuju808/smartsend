-- =========================================================
-- Block 271200 — SmartSend Operator Continuity Sprint
-- Owner Away Mode + Crew-ready Job Handoffs + Continuity Tracking
-- =========================================================

-- ============================================================================
-- 1) OWNER AWAY SESSIONS (history + reporting window)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.owner_away_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  enabled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ended_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  notes text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owner_away_sessions_workspace_started
  ON public.owner_away_sessions(workspace_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_owner_away_sessions_workspace_active
  ON public.owner_away_sessions(workspace_id)
  WHERE ended_at IS NULL;

COMMENT ON TABLE public.owner_away_sessions IS
  'Block 271200: Tracks Owner Away periods so the system can prove continuity (outreach ran, replies handled, jobs moved).';

-- Timestamp trigger (reuse shared helper if present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at_column'
      AND pg_function_is_visible(oid)
  ) THEN
    CREATE OR REPLACE FUNCTION public.update_updated_at_column()
    RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_owner_away_sessions_updated_at ON public.owner_away_sessions;
CREATE TRIGGER trg_owner_away_sessions_updated_at
BEFORE UPDATE ON public.owner_away_sessions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.owner_away_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_away_sessions_select_workspace_members" ON public.owner_away_sessions;
CREATE POLICY "owner_away_sessions_select_workspace_members"
  ON public.owner_away_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = owner_away_sessions.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "owner_away_sessions_modify_owner_admin" ON public.owner_away_sessions;
CREATE POLICY "owner_away_sessions_modify_owner_admin"
  ON public.owner_away_sessions
  FOR INSERT, UPDATE, DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = owner_away_sessions.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = owner_away_sessions.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_away_sessions TO authenticated;

-- ============================================================================
-- 2) INBOX MESSAGE HOLD FIELDS (so we can "hold replies" during away)
-- ============================================================================

ALTER TABLE IF EXISTS public.inbox_messages
  ADD COLUMN IF NOT EXISTS held_for_owner boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS held_reason text,
  ADD COLUMN IF NOT EXISTS owner_away_session_id uuid REFERENCES public.owner_away_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inbox_messages_held_for_owner
  ON public.inbox_messages(held_for_owner)
  WHERE held_for_owner = true;

CREATE INDEX IF NOT EXISTS idx_inbox_messages_owner_away_session
  ON public.inbox_messages(owner_away_session_id)
  WHERE owner_away_session_id IS NOT NULL;

COMMENT ON COLUMN public.inbox_messages.held_for_owner IS
  'Block 271200: True if this inbound reply was held during Owner Away mode (not escalated unless urgent/hot).';

-- ============================================================================
-- 3) CREW-READY JOB HANDOFFS (generated when a job is marked Booked)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.job_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  job_type text,
  location text,
  notes text,
  source text NOT NULL DEFAULT 'inbox_mark_booked',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_handoffs_workspace_created
  ON public.job_handoffs(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_handoffs_thread
  ON public.job_handoffs(thread_id);

ALTER TABLE public.job_handoffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_handoffs_select_workspace_members" ON public.job_handoffs;
CREATE POLICY "job_handoffs_select_workspace_members"
  ON public.job_handoffs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = job_handoffs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "job_handoffs_insert_workspace_members" ON public.job_handoffs;
CREATE POLICY "job_handoffs_insert_workspace_members"
  ON public.job_handoffs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = job_handoffs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "job_handoffs_modify_owner_admin" ON public.job_handoffs;
CREATE POLICY "job_handoffs_modify_owner_admin"
  ON public.job_handoffs
  FOR UPDATE, DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = job_handoffs.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = job_handoffs.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_handoffs TO authenticated;

COMMENT ON TABLE public.job_handoffs IS
  'Block 271200: Crew-ready handoff snapshots generated when a job is booked so work moves without inbox digging.';




