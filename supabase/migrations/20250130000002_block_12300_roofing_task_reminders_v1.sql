-- =========================================================
-- Block 12300 — SmartSend Roofing Task Reminders v1
-- (The Simple Follow-Up Reminder System That Makes Roofers Never Miss a Money Call Again)
-- =========================================================

-- 1. Create roofing_task_type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'roofing_task_type') THEN
    CREATE TYPE public.roofing_task_type AS ENUM (
      'callback',
      'appointment',
      'quote_followup'
    );
  END IF;
END $$;

-- 2. Add lead_id column to tasks table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'tasks' 
    AND column_name = 'lead_id'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE;
    
    -- Create index for lead_id
    CREATE INDEX IF NOT EXISTS idx_tasks_lead_id ON public.tasks(lead_id) WHERE lead_id IS NOT NULL;
  END IF;
END $$;

-- 3. Add type column to tasks table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'tasks' 
    AND column_name = 'type'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN type public.roofing_task_type;
  END IF;
END $$;

-- 4. Add status column if it doesn't exist (for open/completed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'tasks' 
    AND column_name = 'status'
  ) THEN
    ALTER TABLE public.tasks ADD COLUMN status text DEFAULT 'open' CHECK (status IN ('open', 'completed'));
  END IF;
END $$;

-- 5. Update existing tasks to have status based on completed flag
DO $$
BEGIN
  UPDATE public.tasks 
  SET status = CASE 
    WHEN completed = true THEN 'completed'
    ELSE 'open'
  END
  WHERE status IS NULL;
END $$;

-- 6. Create index for type and status
CREATE INDEX IF NOT EXISTS idx_tasks_type_status ON public.tasks(type, status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_tasks_lead_due ON public.tasks(lead_id, due_at) WHERE completed = false AND lead_id IS NOT NULL;

-- 7. Function to create task from HOT lead (no existing task)
CREATE OR REPLACE FUNCTION public.create_task_from_hot_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_lead_id uuid;
  v_assigned_to uuid;
  v_existing_task_id uuid;
BEGIN
  -- Only process HOT status
  -- Check if status is 'HOT' (could be text or enum depending on table structure)
  IF NEW.status::text != 'HOT' THEN
    RETURN NEW;
  END IF;

  -- Get lead_id from lead_status
  v_lead_id := NEW.lead_id;

  -- Get org_id from lead
  SELECT team_id, user_id INTO v_org_id, v_assigned_to
  FROM public.leads
  WHERE id = v_lead_id
  LIMIT 1;

  -- If no org_id from team_id, try to get from campaign_leads
  IF v_org_id IS NULL THEN
    SELECT cl.campaign_id INTO v_org_id
    FROM public.campaign_leads cl
    WHERE cl.lead_id = v_lead_id
    LIMIT 1;
    
    -- Get org_id from campaign
    IF v_org_id IS NOT NULL THEN
      SELECT org_id INTO v_org_id
      FROM public.campaigns
      WHERE id = v_org_id
      LIMIT 1;
    END IF;
  END IF;

  -- Check if task already exists for this lead
  SELECT id INTO v_existing_task_id
  FROM public.tasks
  WHERE lead_id = v_lead_id
    AND status = 'open'
    AND completed = false
    AND type = 'callback'
  LIMIT 1;

  -- If task already exists, skip
  IF v_existing_task_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Get assigned_to (default to lead owner or first org member)
  IF v_assigned_to IS NULL AND v_org_id IS NOT NULL THEN
    SELECT user_id INTO v_assigned_to
    FROM public.org_members
    WHERE org_id = v_org_id
    ORDER BY created_at ASC
    LIMIT 1;
    
    IF v_assigned_to IS NULL THEN
      SELECT user_id INTO v_assigned_to
      FROM public.org_memberships
      WHERE org_id = v_org_id
      AND (status IS NULL OR status = 'active')
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;
  END IF;

  -- Create task if we have required fields
  IF v_org_id IS NOT NULL AND v_lead_id IS NOT NULL AND v_assigned_to IS NOT NULL THEN
    INSERT INTO public.tasks (
      org_id,
      lead_id,
      assigned_to,
      title,
      notes,
      type,
      due_at,
      status,
      completed,
      auto_generated,
      auto_type
    )
    VALUES (
      v_org_id,
      v_lead_id,
      v_assigned_to,
      'Call homeowner to schedule estimate',
      'Hot lead detected - follow up ASAP',
      'callback'::roofing_task_type,
      now(), -- Due today, ASAP
      'open',
      false,
      true,
      'hot_lead'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 8. Function to create task from FOLLOW_UP status
CREATE OR REPLACE FUNCTION public.create_task_from_follow_up_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_lead_id uuid;
  v_assigned_to uuid;
  v_existing_task_id uuid;
BEGIN
  -- Only process FOLLOW_UP status
  -- Check if status is 'FOLLOW_UP' (could be text or enum depending on table structure)
  IF NEW.status::text != 'FOLLOW_UP' THEN
    RETURN NEW;
  END IF;

  -- Get lead_id
  v_lead_id := NEW.lead_id;

  -- Get org_id from lead
  SELECT team_id, user_id INTO v_org_id, v_assigned_to
  FROM public.leads
  WHERE id = v_lead_id
  LIMIT 1;

  -- If no org_id, try campaign_leads
  IF v_org_id IS NULL THEN
    SELECT cl.campaign_id INTO v_org_id
    FROM public.campaign_leads cl
    WHERE cl.lead_id = v_lead_id
    LIMIT 1;
    
    IF v_org_id IS NOT NULL THEN
      SELECT org_id INTO v_org_id
      FROM public.campaigns
      WHERE id = v_org_id
      LIMIT 1;
    END IF;
  END IF;

  -- Check if task already exists
  SELECT id INTO v_existing_task_id
  FROM public.tasks
  WHERE lead_id = v_lead_id
    AND status = 'open'
    AND completed = false
    AND type = 'callback'
  LIMIT 1;

  IF v_existing_task_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Get assigned_to
  IF v_assigned_to IS NULL AND v_org_id IS NOT NULL THEN
    SELECT user_id INTO v_assigned_to
    FROM public.org_members
    WHERE org_id = v_org_id
    ORDER BY created_at ASC
    LIMIT 1;
    
    IF v_assigned_to IS NULL THEN
      SELECT user_id INTO v_assigned_to
      FROM public.org_memberships
      WHERE org_id = v_org_id
      AND (status IS NULL OR status = 'active')
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;
  END IF;

  -- Create task
  IF v_org_id IS NOT NULL AND v_lead_id IS NOT NULL AND v_assigned_to IS NOT NULL THEN
    INSERT INTO public.tasks (
      org_id,
      lead_id,
      assigned_to,
      title,
      notes,
      type,
      due_at,
      status,
      completed,
      auto_generated,
      auto_type
    )
    VALUES (
      v_org_id,
      v_lead_id,
      v_assigned_to,
      'Reply to homeowner''s question',
      'Follow-up required status detected',
      'callback'::roofing_task_type,
      now(), -- Due today
      'open',
      false,
      true,
      'follow_up_required'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 9. Function to detect quotes in notes and create quote follow-up tasks
CREATE OR REPLACE FUNCTION public.create_task_from_quote_in_notes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id uuid;
  v_lead_id uuid;
  v_assigned_to uuid;
  v_quote_amount numeric;
  v_existing_task_id uuid;
  v_note_body text;
BEGIN
  -- Get note body
  v_note_body := COALESCE(NEW.body, '');

  -- Check if note contains quote pattern (e.g., "$14,800", "estimated $14800", "$14.8k")
  -- Pattern: $ followed by numbers, or "estimated" followed by $ and numbers
  IF v_note_body !~* '(estimated|quote|estimate).*\$[\d,]+|\$[\d,]+.*(for|replacement|roof|job)' THEN
    RETURN NEW;
  END IF;

  -- Extract quote amount (simplified - just look for $ followed by numbers)
  v_quote_amount := NULL;
  BEGIN
    SELECT (regexp_match(v_note_body, '\$[\d,]+'))[1]::text INTO v_quote_amount;
    IF v_quote_amount IS NOT NULL THEN
      v_quote_amount := replace(v_quote_amount, '$', '');
      v_quote_amount := replace(v_quote_amount, ',', '');
      v_quote_amount := v_quote_amount::numeric;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_quote_amount := NULL;
  END;

  -- Get lead_id
  v_lead_id := NEW.lead_id;

  -- Get org_id from lead
  SELECT team_id, user_id INTO v_org_id, v_assigned_to
  FROM public.leads
  WHERE id = v_lead_id
  LIMIT 1;

  -- If no org_id, try campaign_leads
  IF v_org_id IS NULL THEN
    SELECT cl.campaign_id INTO v_org_id
    FROM public.campaign_leads cl
    WHERE cl.lead_id = v_lead_id
    LIMIT 1;
    
    IF v_org_id IS NOT NULL THEN
      SELECT org_id INTO v_org_id
      FROM public.campaigns
      WHERE id = v_org_id
      LIMIT 1;
    END IF;
  END IF;

  -- Check if quote follow-up task already exists
  SELECT id INTO v_existing_task_id
  FROM public.tasks
  WHERE lead_id = v_lead_id
    AND status = 'open'
    AND completed = false
    AND type = 'quote_followup'
  LIMIT 1;

  IF v_existing_task_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Get assigned_to
  IF v_assigned_to IS NULL AND v_org_id IS NOT NULL THEN
    SELECT user_id INTO v_assigned_to
    FROM public.org_members
    WHERE org_id = v_org_id
    ORDER BY created_at ASC
    LIMIT 1;
    
    IF v_assigned_to IS NULL THEN
      SELECT user_id INTO v_assigned_to
      FROM public.org_memberships
      WHERE org_id = v_org_id
      AND (status IS NULL OR status = 'active')
      ORDER BY created_at ASC
      LIMIT 1;
    END IF;
  END IF;

  -- Create quote follow-up task (due in 3 days)
  IF v_org_id IS NOT NULL AND v_lead_id IS NOT NULL AND v_assigned_to IS NOT NULL THEN
    INSERT INTO public.tasks (
      org_id,
      lead_id,
      assigned_to,
      title,
      notes,
      type,
      due_at,
      status,
      completed,
      auto_generated,
      auto_type
    )
    VALUES (
      v_org_id,
      v_lead_id,
      v_assigned_to,
      CASE 
        WHEN v_quote_amount IS NOT NULL THEN format('Follow up on $%s quote', to_char(v_quote_amount, 'FM999,999,999'))
        ELSE 'Follow up on quote'
      END,
      format('Quote identified in notes: %s', left(v_note_body, 200)),
      'quote_followup'::roofing_task_type,
      now() + interval '3 days', -- Due in 3 days
      'open',
      false,
      true,
      'quote_detected'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 10. Create trigger for HOT lead status (if lead_status table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'lead_status'
  ) THEN
    DROP TRIGGER IF EXISTS trg_create_task_from_hot_lead ON public.lead_status;
    CREATE TRIGGER trg_create_task_from_hot_lead
    AFTER INSERT OR UPDATE OF status ON public.lead_status
    FOR EACH ROW
    WHEN (NEW.status::text = 'HOT')
    EXECUTE FUNCTION public.create_task_from_hot_lead();
  END IF;
END $$;

-- 11. Create trigger for FOLLOW_UP status
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'lead_status'
  ) THEN
    DROP TRIGGER IF EXISTS trg_create_task_from_follow_up_status ON public.lead_status;
    CREATE TRIGGER trg_create_task_from_follow_up_status
    AFTER INSERT OR UPDATE OF status ON public.lead_status
    FOR EACH ROW
    WHEN (NEW.status::text = 'FOLLOW_UP')
    EXECUTE FUNCTION public.create_task_from_follow_up_status();
  END IF;
END $$;

-- 12. Create trigger for quote detection in notes (if lead_notes table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'lead_notes'
  ) THEN
    DROP TRIGGER IF EXISTS trg_create_task_from_quote_in_notes ON public.lead_notes;
    CREATE TRIGGER trg_create_task_from_quote_in_notes
    AFTER INSERT ON public.lead_notes
    FOR EACH ROW
    EXECUTE FUNCTION public.create_task_from_quote_in_notes();
  END IF;
END $$;

-- 13. Function to sync status column with completed flag
CREATE OR REPLACE FUNCTION public.sync_task_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Sync status with completed flag
  IF NEW.completed = true AND NEW.status != 'completed' THEN
    NEW.status := 'completed';
    NEW.completed_at := COALESCE(NEW.completed_at, now());
  ELSIF NEW.completed = false AND NEW.status != 'open' THEN
    NEW.status := 'open';
    NEW.completed_at := NULL;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 14. Create trigger to sync status
DROP TRIGGER IF EXISTS trg_sync_task_status ON public.tasks;
CREATE TRIGGER trg_sync_task_status
BEFORE INSERT OR UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.sync_task_status();

-- 15. Comments
COMMENT ON TYPE public.roofing_task_type IS 'Roofing-specific task types: callback, appointment, quote_followup';
COMMENT ON COLUMN public.tasks.lead_id IS 'Reference to lead (roofing-specific, alternative to contact_id)';
COMMENT ON COLUMN public.tasks.type IS 'Task type: callback, appointment, or quote_followup';
COMMENT ON COLUMN public.tasks.status IS 'Task status: open or completed';
COMMENT ON FUNCTION public.create_task_from_hot_lead IS 'Auto-creates callback task when lead status = HOT';
COMMENT ON FUNCTION public.create_task_from_follow_up_status IS 'Auto-creates callback task when lead status = FOLLOW_UP';
COMMENT ON FUNCTION public.create_task_from_quote_in_notes IS 'Auto-creates quote follow-up task when quote detected in notes';

