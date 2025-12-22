-- =========================================================
-- Block 21739 — SmartSend Roofing Lead Notes & Internal Mentions v1
-- (Estimator Notes • @Mentions • Owner Oversight • Timeline Integration)
-- =========================================================

-- ============================================================================
-- STEP 1 — Ensure lead_notes Table Has Required Structure
-- ============================================================================

-- Ensure lead_notes table exists with basic structure
CREATE TABLE IF NOT EXISTS public.lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  content text NOT NULL,
  mentions uuid[] DEFAULT '{}'::uuid[], -- array of mentioned users
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add columns if they don't exist (for existing tables)
DO $$
BEGIN
  -- Add created_by if missing (might be author_user_id or author_id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'lead_notes' 
    AND column_name = 'created_by'
  ) THEN
    -- Check if author_user_id exists and migrate it
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'lead_notes' 
      AND column_name = 'author_user_id'
    ) THEN
      ALTER TABLE public.lead_notes 
      ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
      UPDATE public.lead_notes SET created_by = author_user_id WHERE created_by IS NULL;
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'lead_notes' 
      AND column_name = 'author_id'
    ) THEN
      ALTER TABLE public.lead_notes 
      ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
      UPDATE public.lead_notes SET created_by = author_id WHERE created_by IS NULL;
    ELSE
      ALTER TABLE public.lead_notes 
      ADD COLUMN created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
  END IF;

  -- Add content column if missing (might be body)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'lead_notes' 
    AND column_name = 'content'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'lead_notes' 
      AND column_name = 'body'
    ) THEN
      ALTER TABLE public.lead_notes 
      ADD COLUMN content text;
      UPDATE public.lead_notes SET content = body WHERE content IS NULL;
      ALTER TABLE public.lead_notes ALTER COLUMN content SET NOT NULL;
    ELSE
      ALTER TABLE public.lead_notes 
      ADD COLUMN content text NOT NULL;
    END IF;
  END IF;

  -- Add mentions column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'lead_notes' 
    AND column_name = 'mentions'
  ) THEN
    ALTER TABLE public.lead_notes 
    ADD COLUMN mentions uuid[] DEFAULT '{}'::uuid[];
  END IF;

  -- Ensure created_by is NOT NULL after migration
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'lead_notes' 
    AND column_name = 'created_by'
    AND is_nullable = 'YES'
  ) THEN
    -- Set a default user for any null values (or handle differently)
    -- For now, we'll allow nullable during migration but enforce at app level
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id
ON public.lead_notes (lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_notes_created_at
ON public.lead_notes (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_notes_mentions
ON public.lead_notes USING gin (mentions);

CREATE INDEX IF NOT EXISTS idx_lead_notes_created_by
ON public.lead_notes (created_by);

-- ============================================================================
-- STEP 2 — Trigger Function to Log Notes to Timeline
-- ============================================================================

CREATE OR REPLACE FUNCTION log_lead_note_to_timeline()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO lead_timeline_events (
    lead_id,
    event_type,
    event_subtype,
    message,
    metadata
  )
  VALUES (
    NEW.lead_id,
    'note',
    'manual',
    'New internal note added',
    jsonb_build_object(
      'note_id', NEW.id,
      'content', NEW.content,
      'created_by', NEW.created_by,
      'mentions', NEW.mentions
    )
  );
  RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_lead_notes_to_timeline ON public.lead_notes;

-- Create trigger
CREATE TRIGGER trg_lead_notes_to_timeline
AFTER INSERT ON public.lead_notes
FOR EACH ROW
EXECUTE FUNCTION log_lead_note_to_timeline();

-- ============================================================================
-- STEP 3 — RLS Policies (if not already set)
-- ============================================================================

ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view notes for leads in their workspace
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'lead_notes'
    AND policyname = 'lead_notes_select_workspace'
  ) THEN
    CREATE POLICY "lead_notes_select_workspace"
    ON public.lead_notes
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.leads l
        JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
        WHERE l.id = lead_notes.lead_id
        AND wm.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.leads l
        JOIN public.workspaces w ON w.id = l.workspace_id
        WHERE l.id = lead_notes.lead_id
        AND w.owner_id = auth.uid()
      )
    );
  END IF;

  -- Policy: Users can insert notes for leads in their workspace
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'lead_notes'
    AND policyname = 'lead_notes_insert_workspace'
  ) THEN
    CREATE POLICY "lead_notes_insert_workspace"
    ON public.lead_notes
    FOR INSERT
    WITH CHECK (
      EXISTS (
        SELECT 1
        FROM public.leads l
        JOIN public.workspace_members wm ON wm.workspace_id = l.workspace_id
        WHERE l.id = lead_notes.lead_id
        AND wm.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.leads l
        JOIN public.workspaces w ON w.id = l.workspace_id
        WHERE l.id = lead_notes.lead_id
        AND w.owner_id = auth.uid()
      )
      AND created_by = auth.uid()
    );
  END IF;
END $$;

COMMENT ON TABLE public.lead_notes IS 'Block 21739: Internal notes system with @mentions for team coordination';
COMMENT ON COLUMN public.lead_notes.mentions IS 'Array of user IDs mentioned in the note (for notifications)';
COMMENT ON COLUMN public.lead_notes.content IS 'Note content (supports @mentions)';










































