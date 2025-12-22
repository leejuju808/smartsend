-- =========================================================
-- Block 21779 — SmartSend Roofing Lead Heat Score v1
-- 🔥 The Homeowner Intent Engine
-- =========================================================
-- Automatically score each homeowner lead so roofers instantly know:
-- 🔥 Who is ready to book right now
-- ⚠️ Who needs more follow-up
-- ❄️ Who is low-intent or dead

-- 1) Add heat_score and heat_category columns to leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS heat_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heat_category TEXT DEFAULT 'cold';

-- Add index for fast filtering/sorting by heat score
CREATE INDEX IF NOT EXISTS idx_leads_heat_score ON public.leads(heat_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_heat_category ON public.leads(heat_category);

-- Add comment for documentation
COMMENT ON COLUMN public.leads.heat_score IS 'Block 21779: Lead heat score (0-100) indicating buying intent. Higher = hotter lead.';
COMMENT ON COLUMN public.leads.heat_category IS 'Block 21779: Heat category: hot (80-100), warm (50-79), cold (0-49), dead (<0)';

-- 2) Ensure job_type column exists (for job type scoring)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS job_type TEXT;

-- Add comment for job_type
COMMENT ON COLUMN public.leads.job_type IS 'Block 21779: Type of roofing job: emergency, insurance, replacement, repair, or null';

-- 3) Helper function to compute heat category from score
CREATE OR REPLACE FUNCTION public.compute_heat_category(p_score INTEGER)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_score >= 80 THEN
    RETURN 'hot';
  ELSIF p_score >= 50 THEN
    RETURN 'warm';
  ELSIF p_score >= 0 THEN
    RETURN 'cold';
  ELSE
    RETURN 'dead';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.compute_heat_category IS 'Block 21779: Converts heat score (0-100) to category: hot/warm/cold/dead';

-- 4) Database function to compute heat score (can be called from triggers or edge function)
-- Note: This is a simplified version. Full logic is in the edge function.
-- This function can be enhanced with more complex SQL-based scoring if needed.
CREATE OR REPLACE FUNCTION public.compute_lead_heat_score(p_lead_id UUID)
RETURNS TABLE(heat_score INTEGER, heat_category TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_score INTEGER := 0;
  v_category TEXT;
  v_lead RECORD;
  v_reply_count INTEGER;
  v_source TEXT;
  v_job_type TEXT;
BEGIN
  -- Get lead data
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found: %', p_lead_id;
  END IF;

  -- Count replies (simplified - can be enhanced)
  SELECT COUNT(*) INTO v_reply_count
  FROM public.reply_threads
  WHERE lead_id = p_lead_id
    AND last_message_at IS NOT NULL;

  -- Source scoring
  v_source := LOWER(COALESCE(v_lead.source, ''));
  IF v_source = 'website' OR v_source = 'website_form' THEN
    v_score := v_score + 10;
  ELSIF v_source = 'referral' OR v_source = 'homeowner_referral' THEN
    v_score := v_score + 20;
  ELSIF v_source = 'purchased_list' OR v_source = 'list' THEN
    v_score := v_score - 10;
  END IF;

  -- Job type scoring
  v_job_type := LOWER(COALESCE(v_lead.job_type, ''));
  IF v_job_type = 'emergency' OR v_job_type = 'leak' THEN
    v_score := v_score + 40;
  ELSIF v_job_type = 'insurance' OR v_job_type = 'insurance_claim' THEN
    v_score := v_score + 25;
  ELSIF v_job_type = 'replacement' OR v_job_type = 'full_replacement' OR v_job_type = 'full_roof' THEN
    v_score := v_score + 20;
  ELSIF v_job_type = 'repair' OR v_job_type = 'small_repair' THEN
    v_score := v_score + 10;
  END IF;

  -- Reply count scoring
  IF v_reply_count >= 2 THEN
    v_score := v_score + 20;
  ELSIF v_reply_count = 1 THEN
    v_score := v_score + 10;
  ELSE
    v_score := v_score - 10;
  END IF;

  -- Clamp score
  IF v_score > 100 THEN v_score := 100; END IF;
  IF v_score < -50 THEN v_score := -50; END IF;

  -- Compute category
  v_category := public.compute_heat_category(v_score);

  -- Update lead
  UPDATE public.leads
  SET heat_score = v_score, heat_category = v_category
  WHERE id = p_lead_id;

  RETURN QUERY SELECT v_score, v_category;
END;
$$;

COMMENT ON FUNCTION public.compute_lead_heat_score IS 'Block 21779: Computes and updates heat score for a lead. Full scoring logic is in edge function compute-heat-score.';

