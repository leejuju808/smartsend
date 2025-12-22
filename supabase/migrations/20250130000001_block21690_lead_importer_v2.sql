-- =========================================================
-- Block 21690 — SmartSend Roofing Lead Importer v2
-- (AI Column Mapping + De-Dupe Engine)
-- =========================================================
-- 
-- This migration creates staging tables and functions for the Lead Importer v2:
-- - Staging tables for CSV import sessions and rows
-- - De-duplication function
-- - RLS policies for security
-- =========================================================

-- ============================================
-- 1) LEAD IMPORT SESSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.lead_import_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  filename text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'mapping', 'ready', 'importing', 'completed', 'failed')),
  raw_headers text[] NOT NULL,
  column_mapping jsonb,  -- { "full_name": "Name", "email": "EM", ... }
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_import_sessions_user_idx 
  ON public.lead_import_sessions (user_id, created_at DESC);

-- ============================================
-- 2) LEAD IMPORT ROWS TABLE (staging rows)
-- ============================================
CREATE TABLE IF NOT EXISTS public.lead_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.lead_import_sessions(id) ON DELETE CASCADE,
  raw_data jsonb NOT NULL, -- full row as { "ColumnHeader": "value", ... }
  is_duplicate boolean DEFAULT false,
  duplicate_lead_id uuid, -- if matched to existing lead
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_import_rows_session_idx 
  ON public.lead_import_rows (session_id);

CREATE INDEX IF NOT EXISTS lead_import_rows_duplicate_idx 
  ON public.lead_import_rows (session_id, is_duplicate);

-- ============================================
-- 3) UPDATED_AT TRIGGER FOR SESSIONS
-- ============================================
CREATE OR REPLACE FUNCTION public.update_lead_import_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lead_import_sessions_updated_at ON public.lead_import_sessions;
CREATE TRIGGER trg_lead_import_sessions_updated_at
  BEFORE UPDATE ON public.lead_import_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_lead_import_sessions_updated_at();

-- ============================================
-- 4) DE-DUPLICATION FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION public.mark_import_duplicates(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r record;
  v_email text;
  v_match_lead_id uuid;
  v_user_id uuid;
BEGIN
  -- Get user_id from session
  SELECT user_id INTO v_user_id
  FROM public.lead_import_sessions
  WHERE id = p_session_id;
  
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  -- Mark duplicates within the session (same email appears multiple times)
  UPDATE public.lead_import_rows
  SET is_duplicate = true
  WHERE session_id = p_session_id
    AND id IN (
      SELECT id
      FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY lower(coalesce(raw_data->>'email', ''))
                 ORDER BY created_at
               ) as rn
        FROM public.lead_import_rows
        WHERE session_id = p_session_id
          AND lower(coalesce(raw_data->>'email', '')) != ''
      ) sub
      WHERE rn > 1
    );

  -- Mark duplicates against existing leads (by email)
  FOR r IN
    SELECT id, raw_data->>'email' as email
    FROM public.lead_import_rows
    WHERE session_id = p_session_id
      AND is_duplicate = false
  LOOP
    v_email := lower(coalesce(r.email, ''));
    
    IF v_email = '' THEN
      CONTINUE;
    END IF;

    -- Check for existing lead with same email (scoped to user)
    SELECT id
    INTO v_match_lead_id
    FROM public.leads
    WHERE lower(email) = v_email
      AND user_id = v_user_id
    LIMIT 1;

    IF v_match_lead_id IS NOT NULL THEN
      UPDATE public.lead_import_rows
      SET is_duplicate = true,
          duplicate_lead_id = v_match_lead_id
      WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;

-- ============================================
-- 5) ROW LEVEL SECURITY
-- ============================================
ALTER TABLE public.lead_import_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_import_rows ENABLE ROW LEVEL SECURITY;

-- Sessions: users can only access their own sessions
DROP POLICY IF EXISTS "lead_import_sessions_user_access" ON public.lead_import_sessions;
CREATE POLICY "lead_import_sessions_user_access"
  ON public.lead_import_sessions
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Rows: users can only access rows from their own sessions
DROP POLICY IF EXISTS "lead_import_rows_user_access" ON public.lead_import_rows;
CREATE POLICY "lead_import_rows_user_access"
  ON public.lead_import_rows
  FOR ALL
  USING (
    session_id IN (
      SELECT id FROM public.lead_import_sessions WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM public.lead_import_sessions WHERE user_id = auth.uid()
    )
  );

-- Allow service role full access
DROP POLICY IF EXISTS "lead_import_sessions_service_role" ON public.lead_import_sessions;
CREATE POLICY "lead_import_sessions_service_role"
  ON public.lead_import_sessions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "lead_import_rows_service_role" ON public.lead_import_rows;
CREATE POLICY "lead_import_rows_service_role"
  ON public.lead_import_rows
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);



