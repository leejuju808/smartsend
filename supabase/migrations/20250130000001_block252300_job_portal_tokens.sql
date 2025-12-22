-- =========================================================
-- Block 252300 — Job Portal Tokens (Supporting Migration)
-- Creates short tokenized URLs for customer portal access
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE job_portal_tokens TABLE
-- ============================================================================
-- Maps short codes to job IDs for public portal access

CREATE TABLE IF NOT EXISTS public.job_portal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  short_code text NOT NULL UNIQUE, -- e.g., "ABC123"
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz, -- Optional expiration
  is_active boolean DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_job_portal_tokens_job ON public.job_portal_tokens(job_id);
CREATE INDEX IF NOT EXISTS idx_job_portal_tokens_code ON public.job_portal_tokens(short_code) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_portal_tokens_code_unique ON public.job_portal_tokens(short_code);

COMMENT ON TABLE public.job_portal_tokens IS 'Short codes for customer portal access (Block 252300)';

-- ============================================================================
-- PART 2 — FUNCTION: Generate Short Code
-- ============================================================================
-- Generates a unique short code for a job

CREATE OR REPLACE FUNCTION public.generate_job_portal_code(p_job_id uuid)
RETURNS text AS $$
DECLARE
  v_code text;
  v_exists boolean;
BEGIN
  LOOP
    -- Generate 6-character alphanumeric code
    v_code := upper(
      substring(
        encode(gen_random_bytes(4), 'base64') 
        from 1 for 6
      )
    );
    
    -- Replace any non-alphanumeric characters
    v_code := regexp_replace(v_code, '[^A-Z0-9]', '', 'g');
    
    -- Ensure it's exactly 6 characters
    IF length(v_code) < 6 THEN
      v_code := v_code || upper(substring(md5(random()::text) from 1 for (6 - length(v_code))));
    END IF;
    v_code := substring(v_code from 1 for 6);
    
    -- Check if code already exists
    SELECT EXISTS(
      SELECT 1 FROM public.job_portal_tokens 
      WHERE short_code = v_code AND is_active = true
    ) INTO v_exists;
    
    EXIT WHEN NOT v_exists;
  END LOOP;
  
  -- Insert token
  INSERT INTO public.job_portal_tokens (job_id, short_code)
  VALUES (p_job_id, v_code)
  ON CONFLICT (short_code) DO NOTHING;
  
  RETURN v_code;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 3 — FUNCTION: Get Job ID from Code
-- ============================================================================
-- Looks up job_id from short code

CREATE OR REPLACE FUNCTION public.get_job_from_portal_code(p_code text)
RETURNS uuid AS $$
DECLARE
  v_job_id uuid;
BEGIN
  SELECT job_id INTO v_job_id
  FROM public.job_portal_tokens
  WHERE short_code = upper(p_code)
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now());
  
  RETURN v_job_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PART 4 — TRIGGER: Auto-generate portal code when job is approved
-- ============================================================================
-- Automatically creates portal code when job moves to approved/scheduled

CREATE OR REPLACE FUNCTION public.auto_generate_portal_code()
RETURNS TRIGGER AS $$
DECLARE
  v_code_exists boolean;
BEGIN
  -- Only generate if job is approved/scheduled and code doesn't exist
  IF NEW.status IN ('approved', 'scheduled', 'in_progress') THEN
    SELECT EXISTS(
      SELECT 1 FROM public.job_portal_tokens
      WHERE job_id = NEW.id AND is_active = true
    ) INTO v_code_exists;
    
    IF NOT v_code_exists THEN
      PERFORM public.generate_job_portal_code(NEW.id);
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_generate_portal_code ON public.jobs;
CREATE TRIGGER trg_auto_generate_portal_code
AFTER UPDATE ON public.jobs
FOR EACH ROW
WHEN (NEW.status IN ('approved', 'scheduled', 'in_progress'))
EXECUTE FUNCTION public.auto_generate_portal_code();

COMMENT ON FUNCTION public.generate_job_portal_code IS 'Generates short code for customer portal (Block 252300)';
COMMENT ON FUNCTION public.get_job_from_portal_code IS 'Gets job_id from portal code (Block 252300)';
























