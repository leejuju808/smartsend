-- Block 273 — Lead Scoring v1
-- Add score columns to leads table

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS score int DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  ADD COLUMN IF NOT EXISTS score_data jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS score_updated_at timestamptz DEFAULT now();

-- Create index for score-based queries
CREATE INDEX IF NOT EXISTS idx_leads_score ON public.leads(score DESC) WHERE score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_score_updated ON public.leads(score_updated_at DESC);

-- Update score_updated_at trigger
CREATE OR REPLACE FUNCTION public.update_score_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.score IS DISTINCT FROM OLD.score THEN
    NEW.score_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_score_timestamp ON public.leads;
CREATE TRIGGER trg_update_score_timestamp
BEFORE UPDATE ON public.leads
FOR EACH ROW
WHEN (NEW.score IS DISTINCT FROM OLD.score)
EXECUTE FUNCTION public.update_score_timestamp();








