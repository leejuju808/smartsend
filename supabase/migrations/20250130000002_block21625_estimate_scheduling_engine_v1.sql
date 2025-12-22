-- =========================================================
-- Block 21625 — SmartSend Roofing Estimate Scheduling Engine v1
-- (Booking Link + Auto-Tasks + Stage Movement)
-- =========================================================

-- 1) CREATE ESTIMATES TABLE
-- =========================================================

CREATE TABLE IF NOT EXISTS public.estimates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  start_time timestamptz NOT NULL,
  end_time timestamptz,
  source text NOT NULL CHECK (source IN ('booking_link', 'manual', 'import')),
  location text,
  notes text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'no_show', 'canceled')),
  external_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS estimates_user_idx ON public.estimates (user_id, start_time);
CREATE INDEX IF NOT EXISTS estimates_lead_idx ON public.estimates (lead_id, start_time);
CREATE INDEX IF NOT EXISTS estimates_status_idx ON public.estimates (status) WHERE status = 'scheduled';

-- Enable RLS
ALTER TABLE public.estimates ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view estimates for leads they have access to
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'estimates' 
    AND policyname = 'Users can view estimates for their leads'
  ) THEN
    CREATE POLICY "Users can view estimates for their leads"
      ON public.estimates
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = estimates.lead_id
          AND (
            -- If leads table has user_id
            (l.user_id = auth.uid())
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

-- RLS Policy: Users can insert estimates for leads they have access to
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'estimates' 
    AND policyname = 'Users can insert estimates for their leads'
  ) THEN
    CREATE POLICY "Users can insert estimates for their leads"
      ON public.estimates
      FOR INSERT
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = estimates.lead_id
          AND (
            (l.user_id = auth.uid())
            OR
            EXISTS (
              SELECT 1 FROM public.workspace_members wm
              WHERE wm.workspace_id = l.workspace_id
              AND wm.user_id = auth.uid()
            )
            OR
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

-- RLS Policy: Users can update estimates for leads they have access to
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'estimates' 
    AND policyname = 'Users can update estimates for their leads'
  ) THEN
    CREATE POLICY "Users can update estimates for their leads"
      ON public.estimates
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.leads l
          WHERE l.id = estimates.lead_id
          AND (
            (l.user_id = auth.uid())
            OR
            EXISTS (
              SELECT 1 FROM public.workspace_members wm
              WHERE wm.workspace_id = l.workspace_id
              AND wm.user_id = auth.uid()
            )
            OR
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
GRANT ALL ON public.estimates TO service_role;

-- 2) EXTEND LEADS TABLE WITH ESTIMATE FIELDS
-- =========================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS next_estimate_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_estimate_at timestamptz;

-- Create index for next_estimate_at queries
CREATE INDEX IF NOT EXISTS idx_leads_next_estimate_at 
  ON public.leads(next_estimate_at) 
  WHERE next_estimate_at IS NOT NULL;

-- 3) CREATE PIPELINE UPDATE FUNCTION
-- =========================================================

CREATE OR REPLACE FUNCTION public.mark_estimate_scheduled(
  p_lead_id uuid,
  p_when timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage text;
  v_user_id uuid;
BEGIN
  -- Get current pipeline stage and user_id
  SELECT pipeline_stage, COALESCE(user_id, (SELECT user_id FROM public.workspace_members wm 
                                            JOIN public.leads l ON l.workspace_id = wm.workspace_id 
                                            WHERE l.id = p_lead_id LIMIT 1))
  INTO v_stage, v_user_id
  FROM public.leads
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Only move forward, do not move backwards from later stages
  IF v_stage IN ('won', 'lost', 'contract_sent', 'estimate_completed') THEN
    UPDATE public.leads
    SET next_estimate_at = p_when
    WHERE id = p_lead_id;
  ELSE
    UPDATE public.leads
    SET pipeline_stage = 'estimate_scheduled',
        next_estimate_at = p_when
    WHERE id = p_lead_id;
  END IF;

  -- Insert activity log entry
  INSERT INTO public.activity_log (lead_id, user_id, type, message)
  VALUES (
    p_lead_id,
    v_user_id,
    'stage_change',
    'Estimate scheduled for ' || to_char(p_when, 'YYYY-MM-DD HH24:MI')
  );
END;
$$;

-- Grant execute permission to authenticated users and service role
GRANT EXECUTE ON FUNCTION public.mark_estimate_scheduled(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_estimate_scheduled(uuid, timestamptz) TO service_role;

-- 4) CREATE TRIGGER FOR UPDATED_AT ON ESTIMATES
-- =========================================================

CREATE OR REPLACE FUNCTION public.set_estimates_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_estimates_updated_at ON public.estimates;
CREATE TRIGGER trg_set_estimates_updated_at
BEFORE UPDATE ON public.estimates
FOR EACH ROW
EXECUTE FUNCTION public.set_estimates_updated_at();














































