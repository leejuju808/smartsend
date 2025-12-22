-- ============================================================
-- Block 94000 — Automation Logic for Experience Engine
-- Auto-update milestones and handle feedback actions
-- ============================================================

-- ============================================================
-- PART 1 — AUTO-UPDATE MILESTONES FUNCTION
-- ============================================================
-- Automatically update experience milestones based on job events

CREATE OR REPLACE FUNCTION auto_update_experience_milestones()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_portal_id uuid;
  v_milestone_type text;
BEGIN
  -- Get portal for this job
  SELECT id INTO v_portal_id
  FROM public.homeowner_portals
  WHERE job_id = NEW.job_id
    AND is_active = true
  LIMIT 1;

  IF v_portal_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Determine milestone type based on what changed
  IF TG_TABLE_NAME = 'roofing_jobs' THEN
    -- Job status changes
    IF NEW.status = 'scheduled' AND (OLD.status IS NULL OR OLD.status != 'scheduled') THEN
      v_milestone_type := 'estimate_scheduled';
    ELSIF NEW.status = 'in_progress' AND (OLD.status IS NULL OR OLD.status != 'in_progress') THEN
      v_milestone_type := 'install_day';
    ELSIF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
      v_milestone_type := 'cleanup_complete';
    END IF;

    -- Crew assignment
    IF NEW.crew_name IS NOT NULL AND (OLD.crew_name IS NULL OR OLD.crew_name != NEW.crew_name) THEN
      v_milestone_type := 'crew_assigned';
    END IF;

    -- Scheduled date
    IF NEW.scheduled_date IS NOT NULL AND (OLD.scheduled_date IS NULL OR OLD.scheduled_date != NEW.scheduled_date) THEN
      v_milestone_type := 'materials_scheduled';
    END IF;
  END IF;

  -- Update or create milestone
  IF v_milestone_type IS NOT NULL THEN
    INSERT INTO public.experience_milestones (
      portal_id,
      job_id,
      milestone_type,
      status
    )
    VALUES (
      v_portal_id,
      NEW.job_id,
      v_milestone_type,
      CASE
        WHEN v_milestone_type = 'install_day' THEN 'in_progress'
        WHEN v_milestone_type = 'cleanup_complete' THEN 'completed'
        ELSE 'in_progress'
      END
    )
    ON CONFLICT (job_id, milestone_type) DO UPDATE
    SET
      status = EXCLUDED.status,
      updated_at = now(),
      completed_at = CASE
        WHEN EXCLUDED.status = 'completed' AND experience_milestones.completed_at IS NULL THEN now()
        ELSE experience_milestones.completed_at
      END;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger on roofing_jobs updates
DROP TRIGGER IF EXISTS trg_auto_update_experience_milestones ON public.roofing_jobs;
CREATE TRIGGER trg_auto_update_experience_milestones
AFTER UPDATE ON public.roofing_jobs
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM NEW.status OR
  OLD.crew_name IS DISTINCT FROM NEW.crew_name OR
  OLD.scheduled_date IS DISTINCT FROM NEW.scheduled_date
)
EXECUTE FUNCTION auto_update_experience_milestones();

-- ============================================================
-- PART 2 — FEEDBACK ACTIONS FUNCTION
-- ============================================================
-- Handle promoter/at-risk actions when feedback is submitted

CREATE OR REPLACE FUNCTION handle_feedback_actions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id uuid;
  v_workspace_id uuid;
  v_portal_id uuid;
BEGIN
  -- Get job and workspace info
  SELECT job_id, portal_id INTO v_job_id, v_portal_id
  FROM public.experience_feedback_events
  WHERE id = NEW.id;

  IF v_job_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get workspace from portal
  SELECT workspace_id INTO v_workspace_id
  FROM public.homeowner_portals
  WHERE id = v_portal_id;

  -- Promoter actions (rating >= 9)
  IF NEW.is_promoter = true THEN
    -- Mark for review/referral engine (Block 84000)
    -- This will be picked up by the review/referral system
    PERFORM pg_notify('promoter_feedback', json_build_object(
      'job_id', v_job_id,
      'rating', NEW.rating,
      'comment', NEW.comment,
      'trigger_type', NEW.trigger_type
    )::text);

    -- Log action
    INSERT INTO public.homeowner_messages (
      portal_id,
      job_id,
      direction,
      channel,
      body
    )
    VALUES (
      v_portal_id,
      v_job_id,
      'outgoing',
      'portal',
      'Thank you for the excellent feedback! We appreciate your trust in our work.'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- At-risk actions (rating <= 6)
  IF NEW.is_at_risk = true THEN
    -- Notify owner/ops (via notification or message)
    PERFORM pg_notify('at_risk_feedback', json_build_object(
      'job_id', v_job_id,
      'workspace_id', v_workspace_id,
      'rating', NEW.rating,
      'comment', NEW.comment,
      'trigger_type', NEW.trigger_type
    )::text);

    -- Create internal message/alert for owner
    -- This could be stored in a notifications table or sent via email
    -- For now, we'll create a message that shows up in the experience dashboard
  END IF;

  -- 30-day checkin with issue → suggest service ticket (Block 92000)
  IF NEW.trigger_type = '30_day_checkin' AND NEW.rating <= 6 AND NEW.comment IS NOT NULL THEN
    -- Check if comment mentions issues
    IF NEW.comment ILIKE '%leak%' OR 
       NEW.comment ILIKE '%problem%' OR 
       NEW.comment ILIKE '%issue%' OR
       NEW.comment ILIKE '%concern%' OR
       NEW.comment ILIKE '%fix%' THEN
      
      PERFORM pg_notify('suggest_service_ticket', json_build_object(
        'job_id', v_job_id,
        'workspace_id', v_workspace_id,
        'feedback_id', NEW.id,
        'comment', NEW.comment
      )::text);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger on feedback events insert
DROP TRIGGER IF EXISTS trg_handle_feedback_actions ON public.experience_feedback_events;
CREATE TRIGGER trg_handle_feedback_actions
AFTER INSERT ON public.experience_feedback_events
FOR EACH ROW
EXECUTE FUNCTION handle_feedback_actions();

-- ============================================================
-- PART 3 — AUTO-CREATE MILESTONES ON PORTAL CREATION
-- ============================================================
-- When a portal is created, initialize default milestones

CREATE OR REPLACE FUNCTION auto_create_initial_milestones()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Create initial milestones for new portal
  INSERT INTO public.experience_milestones (
    portal_id,
    job_id,
    milestone_type,
    status
  )
  VALUES
    (NEW.id, NEW.job_id, 'estimate_scheduled', 'pending'),
    (NEW.id, NEW.job_id, 'crew_assigned', 'pending'),
    (NEW.id, NEW.job_id, 'materials_scheduled', 'pending'),
    (NEW.id, NEW.job_id, 'install_day', 'pending'),
    (NEW.id, NEW.job_id, 'cleanup_complete', 'pending'),
    (NEW.id, NEW.job_id, 'final_walkthrough', 'pending')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- Trigger on portal creation
DROP TRIGGER IF EXISTS trg_auto_create_initial_milestones ON public.homeowner_portals;
CREATE TRIGGER trg_auto_create_initial_milestones
AFTER INSERT ON public.homeowner_portals
FOR EACH ROW
WHEN (NEW.is_active = true)
EXECUTE FUNCTION auto_create_initial_milestones();

-- ============================================================
-- PART 4 — COMMENTS
-- ============================================================

COMMENT ON FUNCTION auto_update_experience_milestones() IS 'Block 94000: Auto-update experience milestones based on job status/crew/schedule changes';
COMMENT ON FUNCTION handle_feedback_actions() IS 'Block 94000: Handle promoter/at-risk actions and service ticket suggestions';
COMMENT ON FUNCTION auto_create_initial_milestones() IS 'Block 94000: Auto-create initial milestones when portal is created';



























