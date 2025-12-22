-- =========================================================
-- Block 21386 — SmartSend Roofing Job Health Storyline
-- Timeline table for Health Score events
-- =========================================================

-- ============================================================================
-- PART 1 — Create roofing_job_health_timeline table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.roofing_job_health_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,

  -- what triggered this change: 'email_sent', 'email_open', 'email_click',
  -- 'email_reply', 'followup_sent', 'manual_update', etc.
  source_event_type text NOT NULL,

  -- short label: "Homeowner opened email", "Clicked estimate link", etc.
  title text NOT NULL,

  -- more detail: "Opened your 'Roof inspection estimate' email."
  description text,

  -- score info
  latest_score integer NOT NULL CHECK (latest_score >= 0 AND latest_score <= 100),
  engagement_score integer NOT NULL CHECK (engagement_score >= 0 AND engagement_score <= 100),
  intent_score integer NOT NULL CHECK (intent_score >= 0 AND intent_score <= 100),
  follow_up_score integer NOT NULL CHECK (follow_up_score >= 0 AND follow_up_score <= 100),
  timeliness_score integer NOT NULL CHECK (timeliness_score >= 0 AND timeliness_score <= 100),
  score_bucket text NOT NULL CHECK (score_bucket IN ('cold', 'warm', 'hot')),

  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- PART 2 — Indexes for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_roofing_job_health_timeline_org_job
  ON public.roofing_job_health_timeline (org_id, job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_roofing_job_health_timeline_job_created
  ON public.roofing_job_health_timeline (job_id, created_at DESC);

-- ============================================================================
-- PART 3 — Row Level Security
-- ============================================================================

ALTER TABLE public.roofing_job_health_timeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can select their health timeline"
ON public.roofing_job_health_timeline
FOR SELECT
USING (public.is_org_member_for_rls(org_id));

-- ============================================================================
-- PART 4 — Comments
-- ============================================================================

COMMENT ON TABLE public.roofing_job_health_timeline IS 'Stores chronological timeline of health score changes for each roofing job. Each entry represents a scoring event (email open, click, reply, etc.) with the resulting score breakdown.';















































