-- Block 485 — AI SDR Intent Scoring v2
-- Multi-Signal Conversion Score + Pipeline Stage Autoclassifier

-- Add new columns to leads table
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS conversion_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS pipeline_stage TEXT DEFAULT 'new',
ADD COLUMN IF NOT EXISTS last_signal JSONB DEFAULT '{}'::jsonb;

-- Add constraint for pipeline_stage values
ALTER TABLE public.leads
DROP CONSTRAINT IF EXISTS leads_pipeline_stage_check;

ALTER TABLE public.leads
ADD CONSTRAINT leads_pipeline_stage_check
CHECK (pipeline_stage IN ('new', 'engaged', 'interested', 'qualified', 'meeting_booked', 'dead'));

-- Create index for pipeline_stage filtering
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage
ON public.leads (pipeline_stage);

-- Create index for conversion_score sorting
CREATE INDEX IF NOT EXISTS idx_leads_conversion_score
ON public.leads (conversion_score DESC);

