-- =========================================================
-- Block 11400 — SmartSend Roofing Status Labels v1
-- (The Simple Lead Status System Roofers Actually Understand and Use)
-- =========================================================

-- 1. CREATE LEAD_STATUS ENUM TYPE
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'roofing_lead_status'
  ) THEN
    CREATE TYPE public.roofing_lead_status AS ENUM (
      'NEW',
      'HOT',
      'WARM',
      'FOLLOW_UP',
      'NOT_INTERESTED',
      'OUT_OF_SCOPE'
    );
  END IF;
END $$;

-- 2. CREATE LEAD_STATUS TABLE
CREATE TABLE IF NOT EXISTS public.lead_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  status public.roofing_lead_status NOT NULL DEFAULT 'NEW',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_system boolean DEFAULT false, -- true if updated by AI/system, false if by user
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- One status per lead (most recent)
  UNIQUE(lead_id)
);

-- 3. CREATE INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_lead_status_lead_id 
  ON public.lead_status(lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_status_status 
  ON public.lead_status(status);

CREATE INDEX IF NOT EXISTS idx_lead_status_updated_at 
  ON public.lead_status(updated_at DESC);

-- Index for dashboard queries (status + updated_at)
CREATE INDEX IF NOT EXISTS idx_lead_status_status_updated 
  ON public.lead_status(status, updated_at DESC);

-- 4. FUNCTION TO UPDATE UPDATED_AT TIMESTAMP
CREATE OR REPLACE FUNCTION public.set_lead_status_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trg_lead_status_updated_at ON public.lead_status;
CREATE TRIGGER trg_lead_status_updated_at
  BEFORE UPDATE ON public.lead_status
  FOR EACH ROW
  EXECUTE FUNCTION public.set_lead_status_updated_at();

-- 5. FUNCTION TO UPSERT LEAD STATUS (INSERT OR UPDATE)
CREATE OR REPLACE FUNCTION public.upsert_lead_status(
  p_lead_id uuid,
  p_status public.roofing_lead_status,
  p_updated_by uuid DEFAULT NULL,
  p_updated_by_system boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status_id uuid;
BEGIN
  INSERT INTO public.lead_status (
    lead_id,
    status,
    updated_by,
    updated_by_system
  )
  VALUES (
    p_lead_id,
    p_status,
    p_updated_by,
    p_updated_by_system
  )
  ON CONFLICT (lead_id)
  DO UPDATE SET
    status = EXCLUDED.status,
    updated_by = EXCLUDED.updated_by,
    updated_by_system = EXCLUDED.updated_by_system,
    updated_at = now()
  RETURNING id INTO v_status_id;
  
  RETURN v_status_id;
END;
$$;

-- 6. FUNCTION TO AUTO-UPDATE STATUS FROM AI INTENT CLASSIFICATION
-- This function maps AI intent classifications to roofing status labels
CREATE OR REPLACE FUNCTION public.update_lead_status_from_intent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead_id uuid;
  v_status public.roofing_lead_status;
BEGIN
  -- Get lead_id from thread
  IF TG_TABLE_NAME = 'reply_threads' THEN
    v_lead_id := NEW.lead_id;
  ELSIF TG_TABLE_NAME = 'lead_intents' THEN
    v_lead_id := NEW.lead_id;
  ELSE
    RETURN NEW;
  END IF;
  
  -- Skip if no lead_id
  IF v_lead_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Map AI intent to roofing status
  -- latest_intent values: 'hot', 'warm', 'follow_up', 'not_interested', 'unclassified'
  IF TG_TABLE_NAME = 'reply_threads' THEN
    CASE UPPER(COALESCE(NEW.latest_intent, ''))
      WHEN 'HOT' THEN
        v_status := 'HOT';
      WHEN 'WARM' THEN
        v_status := 'WARM';
      WHEN 'FOLLOW_UP' THEN
        v_status := 'FOLLOW_UP';
      WHEN 'NOT_INTERESTED' THEN
        v_status := 'NOT_INTERESTED';
      WHEN 'OUT_OF_SCOPE' THEN
        v_status := 'OUT_OF_SCOPE';
      ELSE
        -- If unclassified or null, check if there's a reply
        -- If there's a reply but unclassified, set to FOLLOW_UP
        -- If no reply yet, keep as NEW
        IF NEW.last_message_at IS NOT NULL AND NEW.last_direction = 'inbound' THEN
          v_status := 'FOLLOW_UP'; -- Has replied but unclear intent
        ELSE
          v_status := 'NEW'; -- No reply yet
        END IF;
    END CASE;
  ELSIF TG_TABLE_NAME = 'lead_intents' THEN
    -- Map from lead_intents.classification
    CASE UPPER(COALESCE(NEW.classification, ''))
      WHEN 'HOT' THEN
        v_status := 'HOT';
      WHEN 'WARM' THEN
        v_status := 'WARM';
      WHEN 'FOLLOW_UP' THEN
        v_status := 'FOLLOW_UP';
      WHEN 'NOT_INTERESTED' THEN
        v_status := 'NOT_INTERESTED';
      WHEN 'OUT_OF_SCOPE' THEN
        v_status := 'OUT_OF_SCOPE';
      ELSE
        v_status := 'FOLLOW_UP'; -- Default for unclassified replies
    END CASE;
  END IF;
  
  -- Upsert the status (only if we have a valid status)
  IF v_status IS NOT NULL THEN
    PERFORM public.upsert_lead_status(
      v_lead_id,
      v_status,
      NULL, -- updated_by (system update)
      true  -- updated_by_system
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- 7. TRIGGERS TO AUTO-UPDATE STATUS FROM AI CLASSIFICATION
-- Trigger on reply_threads when latest_intent changes
DROP TRIGGER IF EXISTS trg_update_lead_status_from_thread_intent ON public.reply_threads;
CREATE TRIGGER trg_update_lead_status_from_thread_intent
  AFTER INSERT OR UPDATE OF latest_intent, lead_id, last_message_at, last_direction
  ON public.reply_threads
  FOR EACH ROW
  WHEN (NEW.lead_id IS NOT NULL)
  EXECUTE FUNCTION public.update_lead_status_from_intent();

-- Trigger on lead_intents when classification is created/updated
DROP TRIGGER IF EXISTS trg_update_lead_status_from_intent ON public.lead_intents;
CREATE TRIGGER trg_update_lead_status_from_intent
  AFTER INSERT OR UPDATE OF classification, lead_id
  ON public.lead_intents
  FOR EACH ROW
  WHEN (NEW.lead_id IS NOT NULL)
  EXECUTE FUNCTION public.update_lead_status_from_intent();

-- 8. FUNCTION TO LOG STATUS CHANGES TO ACTIVITY LOG
CREATE OR REPLACE FUNCTION public.log_lead_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead_workspace_id uuid;
BEGIN
  -- Get workspace_id from lead
  SELECT workspace_id INTO v_lead_workspace_id
  FROM public.leads
  WHERE id = NEW.lead_id;
  
  -- Only log if status actually changed
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  -- Log to activity_events if table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'activity_events'
  ) THEN
    INSERT INTO public.activity_events (
      org_id,
      user_id,
      type,
      title,
      description,
      contact_id,
      metadata,
      created_at
    )
    VALUES (
      v_lead_workspace_id,
      NEW.updated_by,
      'status_change',
      'Lead Status Updated',
      'Status changed from ' || COALESCE(OLD.status::text, 'NULL') || ' to ' || NEW.status::text,
      NEW.lead_id,
      jsonb_build_object(
        'old_status', COALESCE(OLD.status::text, 'NULL'),
        'new_status', NEW.status::text,
        'updated_by_system', NEW.updated_by_system
      ),
      now()
    );
  END IF;
  
  -- Also log to lead_activity_events if table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'lead_activity_events'
  ) THEN
    INSERT INTO public.lead_activity_events (
      lead_id,
      event_type,
      source,
      payload,
      created_at
    )
    VALUES (
      NEW.lead_id,
      'status_changed',
      CASE WHEN NEW.updated_by_system THEN 'system' ELSE 'user' END,
      jsonb_build_object(
        'old_status', COALESCE(OLD.status::text, 'NULL'),
        'new_status', NEW.status::text,
        'updated_by', NEW.updated_by
      ),
      now()
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to log status changes
DROP TRIGGER IF EXISTS trg_log_lead_status_change ON public.lead_status;
CREATE TRIGGER trg_log_lead_status_change
  AFTER INSERT OR UPDATE OF status
  ON public.lead_status
  FOR EACH ROW
  EXECUTE FUNCTION public.log_lead_status_change();

-- 9. RLS POLICIES
ALTER TABLE public.lead_status ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read lead status for leads in their workspace
DROP POLICY IF EXISTS "Users can read lead status for their workspace" ON public.lead_status;
CREATE POLICY "Users can read lead status for their workspace"
  ON public.lead_status
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_status.lead_id
      AND l.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );

-- Policy: Users can update lead status for leads in their workspace
DROP POLICY IF EXISTS "Users can update lead status for their workspace" ON public.lead_status;
CREATE POLICY "Users can update lead status for their workspace"
  ON public.lead_status
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_status.lead_id
      AND l.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_status.lead_id
      AND l.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );

-- Policy: Users can insert lead status for leads in their workspace
DROP POLICY IF EXISTS "Users can insert lead status for their workspace" ON public.lead_status;
CREATE POLICY "Users can insert lead status for their workspace"
  ON public.lead_status
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_status.lead_id
      AND l.workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );

-- 10. VIEW FOR EASY STATUS QUERIES WITH LEAD INFO
CREATE OR REPLACE VIEW public.lead_status_view AS
SELECT 
  ls.id,
  ls.lead_id,
  ls.status,
  ls.updated_at,
  ls.updated_by,
  ls.updated_by_system,
  ls.created_at,
  l.workspace_id,
  l.email as lead_email,
  l.first_name,
  l.last_name,
  l.name as lead_name,
  u.email as updated_by_email
FROM public.lead_status ls
JOIN public.leads l ON l.id = ls.lead_id
LEFT JOIN auth.users u ON u.id = ls.updated_by;

-- 11. INITIALIZE STATUS FOR EXISTING LEADS
-- Set all existing leads without status to NEW
INSERT INTO public.lead_status (lead_id, status, updated_by_system)
SELECT 
  id,
  'NEW',
  true
FROM public.leads
WHERE id NOT IN (SELECT lead_id FROM public.lead_status)
ON CONFLICT (lead_id) DO NOTHING;

-- 12. COMMENTS
COMMENT ON TABLE public.lead_status IS 'Simple roofing lead status system: NEW, HOT, WARM, FOLLOW_UP, NOT_INTERESTED, OUT_OF_SCOPE';
COMMENT ON COLUMN public.lead_status.status IS 'Roofing lead status: NEW (no reply), HOT (wants estimate/appointment), WARM (interested but not urgent), FOLLOW_UP (needs info), NOT_INTERESTED (declined), OUT_OF_SCOPE (not a roofing lead)';
COMMENT ON COLUMN public.lead_status.updated_by_system IS 'True if status was updated by AI/system, false if updated manually by user';
COMMENT ON FUNCTION public.upsert_lead_status IS 'Upserts lead status (inserts or updates existing status for a lead)';
COMMENT ON FUNCTION public.update_lead_status_from_intent IS 'Automatically updates lead status when AI classifies a reply intent';
COMMENT ON VIEW public.lead_status_view IS 'View combining lead_status with lead information for easy querying';























































