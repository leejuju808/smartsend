-- =========================================================
-- Block 21381 — SmartSend Roofing Job Health Score Storage + RPC (v1)
-- (Store and update health scores for each roofing job)
-- =========================================================

-- ============================================================================
-- PART 1 — Ensure roofing_jobs has org_id
-- ============================================================================

-- Add org_id to roofing_jobs if it doesn't exist
-- We'll derive it from campaign_id or lead_id
ALTER TABLE IF EXISTS public.roofing_jobs
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Create index for org_id lookups
CREATE INDEX IF NOT EXISTS idx_roofing_jobs_org_id 
  ON public.roofing_jobs(org_id) 
  WHERE org_id IS NOT NULL;

-- Backfill org_id from campaign_id or lead_id if org_id is null
-- This is a one-time update for existing rows
UPDATE public.roofing_jobs rj
SET org_id = COALESCE(
  (SELECT org_id FROM public.campaigns WHERE id = rj.campaign_id),
  (SELECT org_id FROM public.leads WHERE id = rj.lead_id)
)
WHERE rj.org_id IS NULL
  AND (rj.campaign_id IS NOT NULL OR rj.lead_id IS NOT NULL);

-- ============================================================================
-- PART 2 — Create roofing_job_health_scores table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.roofing_job_health_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.roofing_jobs(id) ON DELETE CASCADE,

  latest_score integer NOT NULL CHECK (latest_score >= 0 AND latest_score <= 100),
  engagement_score integer NOT NULL CHECK (engagement_score >= 0 AND engagement_score <= 100),
  intent_score integer NOT NULL CHECK (intent_score >= 0 AND intent_score <= 100),
  follow_up_score integer NOT NULL CHECK (follow_up_score >= 0 AND follow_up_score <= 100),
  timeliness_score integer NOT NULL CHECK (timeliness_score >= 0 AND timeliness_score <= 100),

  score_bucket text NOT NULL CHECK (score_bucket IN ('cold', 'warm', 'hot')),

  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (org_id, job_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_roofing_job_health_scores_org_job
  ON public.roofing_job_health_scores (org_id, job_id);

CREATE INDEX IF NOT EXISTS idx_roofing_job_health_scores_bucket
  ON public.roofing_job_health_scores (score_bucket);

CREATE INDEX IF NOT EXISTS idx_roofing_job_health_scores_latest_score
  ON public.roofing_job_health_scores (latest_score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_roofing_job_health_scores_org_score
  ON public.roofing_job_health_scores (org_id, latest_score DESC NULLS LAST);

-- Simple trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_timestamp_roofing_job_health_scores()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_roofing_job_health_scores_set_timestamp
ON public.roofing_job_health_scores;

CREATE TRIGGER trg_roofing_job_health_scores_set_timestamp
BEFORE UPDATE ON public.roofing_job_health_scores
FOR EACH ROW 
EXECUTE FUNCTION public.set_timestamp_roofing_job_health_scores();

-- ============================================================================
-- PART 3 — RLS Policies
-- ============================================================================

ALTER TABLE public.roofing_job_health_scores ENABLE ROW LEVEL SECURITY;

-- Helper function to check org membership (works with both org_memberships and org_members tables)
CREATE OR REPLACE FUNCTION public.is_org_member_for_rls(check_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_memberships
    WHERE org_id = check_org_id
      AND user_id = auth.uid()
      AND status = 'active'
  )
  OR EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = check_org_id
      AND user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = check_org_id
      AND owner_id = auth.uid()
  );
$$;

-- Policy: org members can see their own scores
DROP POLICY IF EXISTS "org members can select their roofing job health scores"
ON public.roofing_job_health_scores;

CREATE POLICY "org members can select their roofing job health scores"
ON public.roofing_job_health_scores
FOR SELECT
USING (public.is_org_member_for_rls(org_id));

-- Policy: org members can insert their roofing job health scores
DROP POLICY IF EXISTS "org members can insert their roofing job health scores"
ON public.roofing_job_health_scores;

CREATE POLICY "org members can insert their roofing job health scores"
ON public.roofing_job_health_scores
FOR INSERT
WITH CHECK (public.is_org_member_for_rls(org_id));

-- Policy: org members can update their roofing job health scores
DROP POLICY IF EXISTS "org members can update their roofing job health scores"
ON public.roofing_job_health_scores;

CREATE POLICY "org members can update their roofing job health scores"
ON public.roofing_job_health_scores
FOR UPDATE
USING (public.is_org_member_for_rls(org_id))
WITH CHECK (public.is_org_member_for_rls(org_id));

-- ============================================================================
-- PART 4 — RPC Function to Save Health Score
-- ============================================================================

CREATE OR REPLACE FUNCTION public.save_roofing_job_health_score(
  _org_id uuid,
  _job_id uuid,
  _latest_score integer,
  _engagement_score integer,
  _intent_score integer,
  _follow_up_score integer,
  _timeliness_score integer,
  _score_bucket text
)
RETURNS public.roofing_job_health_scores
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _record public.roofing_job_health_scores;
BEGIN
  INSERT INTO public.roofing_job_health_scores (
    org_id,
    job_id,
    latest_score,
    engagement_score,
    intent_score,
    follow_up_score,
    timeliness_score,
    score_bucket,
    last_calculated_at
  )
  VALUES (
    _org_id,
    _job_id,
    _latest_score,
    _engagement_score,
    _intent_score,
    _follow_up_score,
    _timeliness_score,
    _score_bucket,
    now()
  )
  ON CONFLICT (org_id, job_id)
  DO UPDATE SET
    latest_score        = excluded.latest_score,
    engagement_score    = excluded.engagement_score,
    intent_score        = excluded.intent_score,
    follow_up_score     = excluded.follow_up_score,
    timeliness_score    = excluded.timeliness_score,
    score_bucket        = excluded.score_bucket,
    last_calculated_at  = now()
  RETURNING * INTO _record;

  RETURN _record;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.save_roofing_job_health_score TO authenticated;

-- ============================================================================
-- PART 5 — Comments
-- ============================================================================

COMMENT ON TABLE public.roofing_job_health_scores IS 'Stores per-job health scores for roofing companies. Updated as new events come in (opens, replies, follow-ups).';
COMMENT ON COLUMN public.roofing_job_health_scores.latest_score IS 'Total health score (0-100) - Higher = higher priority';
COMMENT ON COLUMN public.roofing_job_health_scores.engagement_score IS 'Engagement component score (0-100)';
COMMENT ON COLUMN public.roofing_job_health_scores.intent_score IS 'Intent component score (0-100)';
COMMENT ON COLUMN public.roofing_job_health_scores.follow_up_score IS 'Follow-up component score (0-100)';
COMMENT ON COLUMN public.roofing_job_health_scores.timeliness_score IS 'Timeliness component score (0-100)';
COMMENT ON COLUMN public.roofing_job_health_scores.score_bucket IS 'Score bucket: cold (<40), warm (40-74), hot (>=75)';
COMMENT ON FUNCTION public.save_roofing_job_health_score IS 'RPC function to upsert roofing job health scores. Called from Edge Functions after calculating scores.';

