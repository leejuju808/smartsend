-- 0.1 Ensure required columns exist
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS email citext,
  ADD COLUMN IF NOT EXISTS campaign_id uuid,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS attempts int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts int DEFAULT 3,
  ADD COLUMN IF NOT EXISTS suppressed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- 0.2 Guardrail: block duplicates per campaign (email lowercase)
CREATE EXTENSION IF NOT EXISTS citext;
ALTER TABLE public.leads
  ALTER COLUMN email TYPE citext;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_leads_campaign_email
  ON public.leads (campaign_id, lower(email));

-- 0.3 campaign_logs helper (if not exists)
CREATE TABLE IF NOT EXISTS public.campaign_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  lead_id uuid,
  event text NOT NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- 0.4 Simple status check enum (optional)
-- CREATE TYPE lead_status AS ENUM ('queued','sending','sent','failed','replied');
-- ALTER TABLE public.leads ALTER COLUMN status TYPE lead_status USING status::lead_status;

-- 0.5 RPC: retry_failed_batch
CREATE OR REPLACE FUNCTION public.retry_failed_batch(p_campaign uuid, p_lead_ids uuid[])
RETURNS TABLE(lead_id uuid, attempts int, status text) AS $$
BEGIN
  UPDATE public.leads l
     SET status = 'queued',
         attempts = l.attempts + 1
   WHERE l.campaign_id = p_campaign
     AND l.id = ANY(p_lead_ids)
     AND l.suppressed = false
     AND l.attempts < COALESCE(l.max_attempts, 3)
   RETURNING l.id, l.attempts, l.status INTO TEMP TABLE _ret;

  INSERT INTO public.campaign_logs (campaign_id, lead_id, event, meta)
  SELECT p_campaign, r.lead_id, 'retry_queued', jsonb_build_object('attempts', r.attempts)
  FROM _ret r;

  RETURN QUERY SELECT * FROM _ret;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_leads_campaign_status ON public.leads(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);

-- 0.1 Ensure required columns exist
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS campaign_id uuid,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS attempts int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts int DEFAULT 3,
  ADD COLUMN IF NOT EXISTS suppressed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- 0.2 Guardrail: block duplicates per campaign (email lowercase)
CREATE EXTENSION IF NOT EXISTS citext;
ALTER TABLE public.leads
  ALTER COLUMN email TYPE citext;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_leads_campaign_email
  ON public.leads (campaign_id, lower(email));

-- 0.3 campaign_logs helper (if not exists)
CREATE TABLE IF NOT EXISTS public.campaign_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  lead_id uuid,
  event text NOT NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- 0.5 RPC: retry_failed_batch
CREATE OR REPLACE FUNCTION public.retry_failed_batch(p_campaign uuid, p_lead_ids uuid[])
RETURNS TABLE(lead_id uuid, attempts int, status text) AS $$
BEGIN
  UPDATE public.leads l
     SET status = 'queued',
         attempts = l.attempts + 1
   WHERE l.campaign_id = p_campaign
     AND l.id = ANY(p_lead_ids)
     AND l.suppressed = false
     AND l.attempts < COALESCE(l.max_attempts, 3)
   RETURNING l.id, l.attempts, l.status INTO TEMP TABLE _ret;

  INSERT INTO public.campaign_logs (campaign_id, lead_id, event, meta)
  SELECT p_campaign, r.lead_id, 'retry_queued', jsonb_build_object('attempts', r.attempts)
  FROM _ret r;

  RETURN QUERY SELECT * FROM _ret;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_leads_campaign_status ON public.leads(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON public.leads(created_at DESC);

-- RLS policies (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'campaign_logs' 
    AND policyname = 'Users can read their campaign logs'
  ) THEN
    ALTER TABLE public.campaign_logs ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

CREATE POLICY IF NOT EXISTS "Users can read their campaign logs" 
  ON public.campaign_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c 
      WHERE c.id = campaign_logs.campaign_id 
      AND c.user_id = auth.uid()
    )
  );
