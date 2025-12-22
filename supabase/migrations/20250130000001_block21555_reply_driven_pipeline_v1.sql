-- =========================================================
-- Block 21555 — SmartSend Reply-Driven Pipeline Engine v1
-- (Hot/Warm/Cold Classifier + Pipeline Stages)
-- =========================================================

-- 1) ADD PIPELINE FIELDS TO LEADS TABLE
-- =========================================================

-- Add pipeline_stage column with check constraint
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS pipeline_stage text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS last_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_intent text,
  ADD COLUMN IF NOT EXISTS last_message text;

-- Add check constraint for valid pipeline_stage values
DO $$
BEGIN
  -- Drop existing constraint if it exists with different values
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'leads_pipeline_stage_check'
  ) THEN
    ALTER TABLE public.leads DROP CONSTRAINT leads_pipeline_stage_check;
  END IF;
  
  -- Add new constraint with all required values
  ALTER TABLE public.leads
    ADD CONSTRAINT leads_pipeline_stage_check 
    CHECK (pipeline_stage IN (
      'new',
      'contacted',
      'replied',
      'interested',
      'estimate_scheduled',
      'estimate_completed',
      'verbal_yes',
      'contract_sent',
      'won',
      'lost'
    ));
END $$;

-- Create index for pipeline_stage queries
CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage 
  ON public.leads(pipeline_stage);

CREATE INDEX IF NOT EXISTS idx_leads_last_reply_at 
  ON public.leads(last_reply_at DESC) 
  WHERE last_reply_at IS NOT NULL;

-- 2) CREATE ACTIVITY LOG TABLE (if not exists)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN (
    'reply',
    'stage_change',
    'task_created',
    'note',
    'system'
  )),
  message text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create index for lead lookups
CREATE INDEX IF NOT EXISTS activity_log_lead_idx 
  ON public.activity_log(lead_id);

CREATE INDEX IF NOT EXISTS activity_log_created_idx 
  ON public.activity_log(created_at DESC);

-- Enable RLS
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view activity logs for leads they have access to
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'activity_log' 
    AND policyname = 'Users can view activity logs for their leads'
  ) THEN
    CREATE POLICY "Users can view activity logs for their leads"
      ON public.activity_log
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = activity_log.lead_id
          AND (
            -- If leads table has user_id
            l.user_id = auth.uid()
            OR
            -- If leads table has workspace_id
            EXISTS (
              SELECT 1 FROM public.workspace_members wm
              WHERE wm.workspace_id = l.workspace_id
              AND wm.user_id = auth.uid()
            )
            OR
            -- If leads table has team_id
            EXISTS (
              SELECT 1 FROM public.teams t
              JOIN public.team_members tm ON tm.team_id = t.id
              WHERE t.id = l.team_id
              AND tm.user_id = auth.uid()
            )
          )
        )
      );
  END IF;
END $$;

-- Grant service role full access for edge functions
GRANT ALL ON public.activity_log TO service_role;

