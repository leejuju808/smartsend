-- Block 494 — Human Notes → Next AI Move
-- Adds note_type, title, score_delta, is_pinned, created_by_name to lead_notes
-- Enables AI follow-ups to see notes and scoring to get manual adjustments

-- Add new columns to lead_notes table if they don't exist
DO $$
BEGIN
  -- Add note_type column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lead_notes'
    AND column_name = 'note_type'
  ) THEN
    ALTER TABLE public.lead_notes
    ADD COLUMN note_type TEXT NOT NULL DEFAULT 'context';
  END IF;

  -- Add title column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lead_notes'
    AND column_name = 'title'
  ) THEN
    ALTER TABLE public.lead_notes
    ADD COLUMN title TEXT NULL;
  END IF;

  -- Add score_delta column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lead_notes'
    AND column_name = 'score_delta'
  ) THEN
    ALTER TABLE public.lead_notes
    ADD COLUMN score_delta INTEGER NULL;
  END IF;

  -- Add is_pinned column (may already exist as 'pinned')
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lead_notes'
    AND column_name = 'is_pinned'
  ) THEN
    -- Check if 'pinned' exists and migrate it
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'lead_notes'
      AND column_name = 'pinned'
    ) THEN
      ALTER TABLE public.lead_notes
      ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
      UPDATE public.lead_notes
      SET is_pinned = pinned
      WHERE pinned IS NOT NULL;
    ELSE
      ALTER TABLE public.lead_notes
      ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
  END IF;

  -- Add created_by_name column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lead_notes'
    AND column_name = 'created_by_name'
  ) THEN
    ALTER TABLE public.lead_notes
    ADD COLUMN created_by_name TEXT NULL;
  END IF;

  -- Add author_id column (may already exist as user_id)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'lead_notes'
    AND column_name = 'author_id'
  ) THEN
    -- Check if user_id exists and use it as author_id
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'lead_notes'
      AND column_name = 'user_id'
    ) THEN
      ALTER TABLE public.lead_notes
      ADD COLUMN author_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;
      UPDATE public.lead_notes
      SET author_id = user_id
      WHERE user_id IS NOT NULL;
    ELSE
      ALTER TABLE public.lead_notes
      ADD COLUMN author_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Add constraint for note_type values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lead_notes_note_type_check'
  ) THEN
    ALTER TABLE public.lead_notes
    ADD CONSTRAINT lead_notes_note_type_check
    CHECK (note_type IN ('context', 'objection', 'playbook_hint', 'do_not_mention', 'priority'));
  END IF;
END $$;

-- Create index for lead_notes queries (pinned first, then by created_at)
CREATE INDEX IF NOT EXISTS lead_notes_lead_created_idx
ON public.lead_notes (lead_id, created_at DESC);

-- Create index for score_delta queries
CREATE INDEX IF NOT EXISTS lead_notes_score_delta_idx
ON public.lead_notes (lead_id, score_delta)
WHERE score_delta IS NOT NULL;

