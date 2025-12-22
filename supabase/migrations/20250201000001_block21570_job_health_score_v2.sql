-- =========================================================
-- Block 21570 — SmartSend Roofing Job Health Score v2
-- (Stage-Aware + Reply-Aware + Value-Aware)
-- =========================================================
-- 
-- This turns every lead/job into one simple number (0–100) that answers:
-- "How healthy is this deal, and should I care about it today?"
--
-- The score is driven by:
-- - Pipeline stage (how far along)
-- - Reply intent (hot / warm / not interested)
-- - Overdue tasks (are we dropping the ball?)
-- - Job value (is this a $3k repair or a $25k replacement?)
-- - Recency of activity
-- =========================================================

-- ============================================================================
-- 1. ADD JOB HEALTH SCORE COLUMN TO LEADS TABLE
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS job_health_score numeric(5,2);

-- Add index for efficient sorting and filtering
CREATE INDEX IF NOT EXISTS idx_leads_job_health_score 
  ON public.leads(job_health_score DESC NULLS LAST)
  WHERE job_health_score IS NOT NULL;

-- Add comment
COMMENT ON COLUMN public.leads.job_health_score IS 
  'Job health score (0-100) combining pipeline stage, reply intent, job value, recency, and overdue tasks. Higher = healthier deal.';

-- ============================================================================
-- 2. CREATE COMPUTE_JOB_HEALTH FUNCTION
-- ============================================================================
-- Computes the health score for a single lead based on:
-- - Base from pipeline stage (0–70 pts)
-- - Reply intent modifier (-20 to +20 pts)
-- - Value modifier (0–15 pts)
-- - Recency decay (0 to -25 pts)
-- - Task penalty (0 to -20 pts)
-- Final score is clamped to [0, 100]

CREATE OR REPLACE FUNCTION compute_job_health(p_lead_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_stage text;
  v_last_intent text;
  v_last_reply_at timestamptz;
  v_base_amount numeric;
  v_overdue_tasks int;
  v_now timestamptz := now();
  v_stage_score int := 0;
  v_intent_score int := 0;
  v_value_score int := 0;
  v_recency_score int := 0;
  v_task_penalty int := 0;
  v_days_since_reply int := 999;
  v_total int;
  v_lead_email text;
BEGIN
  -- 1) Lead core data
  SELECT pipeline_stage, last_intent, last_reply_at, email
  INTO v_stage, v_last_intent, v_last_reply_at, v_lead_email
  FROM leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- 2) Stage score (0-70 pts, but won can be 100)
  v_stage := coalesce(v_stage, 'new');

  v_stage_score := CASE v_stage
    WHEN 'new' THEN 15
    WHEN 'contacted' THEN 25
    WHEN 'replied' THEN 35
    WHEN 'interested' THEN 50
    WHEN 'estimate_scheduled' THEN 60
    WHEN 'estimate_completed' THEN 65
    WHEN 'verbal_yes' THEN 80
    WHEN 'contract_sent' THEN 85
    WHEN 'won' THEN 100
    WHEN 'lost' THEN 0
    ELSE 15
  END;

  -- If won or lost, return immediately (no modifiers)
  IF v_stage IN ('won', 'lost') THEN
    RETURN v_stage_score;
  END IF;

  -- 3) Intent score (-20 to +20 pts)
  v_last_intent := coalesce(v_last_intent, '');

  v_intent_score := CASE v_last_intent
    WHEN 'hot_lead' THEN 15
    WHEN 'warm_lead' THEN 10
    WHEN 'question' THEN 5
    WHEN 'not_interested' THEN -20
    WHEN 'autoresponder' THEN 0
    WHEN 'spam_noise' THEN -5
    ELSE 0
  END;

  -- 4) Value score (0-15 pts)
  -- First try estimated_job_value directly on leads table
  SELECT estimated_job_value
  INTO v_base_amount
  FROM leads
  WHERE id = p_lead_id;

  -- If not found on leads, try job_value_estimates view via contacts (by email)
  IF v_base_amount IS NULL OR v_base_amount = 0 THEN
    SELECT base_amount
    INTO v_base_amount
    FROM job_value_estimates jve
    JOIN contacts c ON c.id = jve.id
    WHERE lower(c.email) = lower(v_lead_email)
    ORDER BY jve.updated_at DESC
    LIMIT 1;
  END IF;

  v_base_amount := coalesce(v_base_amount, 0);

  v_value_score := CASE
    WHEN v_base_amount >= 20000 THEN 15
    WHEN v_base_amount >= 10000 THEN 10
    WHEN v_base_amount >= 5000 THEN 5
    ELSE 0
  END;

  -- 5) Recency decay (0 to -25 pts)
  IF v_last_reply_at IS NOT NULL THEN
    v_days_since_reply := greatest(0, floor(extract(epoch from (v_now - v_last_reply_at)) / 86400)::int);
  END IF;

  v_recency_score := CASE
    WHEN v_days_since_reply <= 2 THEN 0
    WHEN v_days_since_reply <= 7 THEN -5
    WHEN v_days_since_reply <= 14 THEN -10
    WHEN v_days_since_reply <= 30 THEN -15
    ELSE -25
  END;

  -- 6) Overdue tasks penalty (0 to -20 pts)
  SELECT count(*)
  INTO v_overdue_tasks
  FROM tasks
  WHERE lead_id = p_lead_id
    AND status IN ('open', 'pending', 'todo', 'in_progress')
    AND (due_date < current_date OR (due_date IS NULL AND due_at < v_now));

  v_overdue_tasks := coalesce(v_overdue_tasks, 0);

  v_task_penalty := CASE
    WHEN v_overdue_tasks = 0 THEN 0
    WHEN v_overdue_tasks = 1 THEN -5
    WHEN v_overdue_tasks BETWEEN 2 AND 3 THEN -10
    WHEN v_overdue_tasks >= 4 THEN -20
    ELSE 0
  END;

  -- 7) Combine all scores
  v_total := v_stage_score + v_intent_score + v_value_score + v_recency_score + v_task_penalty;

  -- Clamp to [0, 100]
  IF v_total < 0 THEN
    v_total := 0;
  ELSIF v_total > 100 THEN
    v_total := 100;
  END IF;

  RETURN v_total;
END;
$$;

-- Add comment
COMMENT ON FUNCTION compute_job_health IS 
  'Computes job health score (0-100) for a lead based on pipeline stage, reply intent, job value, recency, and overdue tasks.';

-- ============================================================================
-- 3. CREATE REFRESH_JOB_HEALTH_FOR_USER FUNCTION
-- ============================================================================
-- Updates job_health_score for all leads belonging to a user
-- Can be called nightly (cron), after bulk imports, or after big events

CREATE OR REPLACE FUNCTION refresh_job_health_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  r record;
  v_updated_count int := 0;
BEGIN
  FOR r IN
    SELECT id FROM leads WHERE user_id = p_user_id
  LOOP
    UPDATE leads
    SET job_health_score = compute_job_health(r.id)
    WHERE id = r.id;
    
    v_updated_count := v_updated_count + 1;
  END LOOP;
  
  -- Log completion (optional, can be removed if not needed)
  RAISE NOTICE 'Updated job health scores for % leads for user %', v_updated_count, p_user_id;
END;
$$;

-- Add comment
COMMENT ON FUNCTION refresh_job_health_for_user IS 
  'Refreshes job_health_score for all leads belonging to a user. Call this nightly, after bulk imports, or after big events.';

-- ============================================================================
-- 4. CREATE REFRESH_JOB_HEALTH_FOR_WORKSPACE FUNCTION (Alternative)
-- ============================================================================
-- Some leads might be workspace-scoped instead of user-scoped
-- This function refreshes all leads for a workspace

CREATE OR REPLACE FUNCTION refresh_job_health_for_workspace(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  r record;
  v_updated_count int := 0;
BEGIN
  FOR r IN
    SELECT id FROM leads WHERE workspace_id = p_workspace_id
  LOOP
    UPDATE leads
    SET job_health_score = compute_job_health(r.id)
    WHERE id = r.id;
    
    v_updated_count := v_updated_count + 1;
  END LOOP;
  
  RAISE NOTICE 'Updated job health scores for % leads for workspace %', v_updated_count, p_workspace_id;
END;
$$;

-- Add comment
COMMENT ON FUNCTION refresh_job_health_for_workspace IS 
  'Refreshes job_health_score for all leads belonging to a workspace.';

-- ============================================================================
-- 5. CREATE TRIGGER TO AUTO-UPDATE SCORE ON LEAD CHANGES
-- ============================================================================
-- Automatically recalculate health score when relevant fields change

CREATE OR REPLACE FUNCTION update_job_health_score()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Recalculate health score if any relevant field changed
  IF (
    OLD.pipeline_stage IS DISTINCT FROM NEW.pipeline_stage
    OR OLD.last_intent IS DISTINCT FROM NEW.last_intent
    OR OLD.last_reply_at IS DISTINCT FROM NEW.last_reply_at
  ) THEN
    NEW.job_health_score := compute_job_health(NEW.id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trg_update_job_health_score ON public.leads;
CREATE TRIGGER trg_update_job_health_score
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION update_job_health_score();

-- ============================================================================
-- 6. INITIAL BACKFILL (Optional - can be run separately)
-- ============================================================================
-- Uncomment to backfill scores for existing leads
-- This might take a while for large datasets, so consider running in batches

-- DO $$
-- DECLARE
--   r record;
--   v_count int := 0;
-- BEGIN
--   FOR r IN
--     SELECT id FROM leads WHERE job_health_score IS NULL
--     LIMIT 1000  -- Process in batches
--   LOOP
--     UPDATE leads
--     SET job_health_score = compute_job_health(r.id)
--     WHERE id = r.id;
--     
--     v_count := v_count + 1;
--   END LOOP;
--   
--   RAISE NOTICE 'Backfilled % lead health scores', v_count;
-- END;
-- $$;

