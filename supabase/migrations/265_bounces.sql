-- Block 249 — Bounce Monitoring Center v1
-- Enterprise-grade bounce intelligence with bounce types, reasons, mailbox health, lead health, and auto-stop rules

-- 1. Enhanced bounces table with workspace_id and all required fields
CREATE TABLE IF NOT EXISTS public.bounces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  mailbox_id uuid REFERENCES public.mailboxes(id) ON DELETE SET NULL,
  email text NOT NULL,
  bounce_type text NOT NULL CHECK (bounce_type IN ('hard', 'soft')),
  reason text NOT NULL,
  raw jsonb,
  created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bounces_workspace ON public.bounces(workspace_id);
CREATE INDEX IF NOT EXISTS idx_bounces_lead ON public.bounces(lead_id);
CREATE INDEX IF NOT EXISTS idx_bounces_campaign ON public.bounces(campaign_id);
CREATE INDEX IF NOT EXISTS idx_bounces_mailbox ON public.bounces(mailbox_id);
CREATE INDEX IF NOT EXISTS idx_bounces_email ON public.bounces(email);
CREATE INDEX IF NOT EXISTS idx_bounces_type ON public.bounces(bounce_type);
CREATE INDEX IF NOT EXISTS idx_bounces_created_at ON public.bounces(created_at DESC);

-- 2. Add reachability column to leads table
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS reachability text DEFAULT 'unknown' CHECK (reachability IN ('unknown', 'valid', 'risky', 'invalid'));

CREATE INDEX IF NOT EXISTS idx_leads_reachability ON public.leads(reachability);

-- 3. Add health_score column to mailboxes table
ALTER TABLE public.mailboxes
  ADD COLUMN IF NOT EXISTS health_score int DEFAULT 100 CHECK (health_score >= 0 AND health_score <= 100);

CREATE INDEX IF NOT EXISTS idx_mailboxes_health_score ON public.mailboxes(health_score);

-- 4. RPC function to increment bounce counters for mailbox
CREATE OR REPLACE FUNCTION public.increment_bounce(p_mailbox_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- This function can be extended to update mailbox bounce counters
  -- For now, it's a placeholder that can be called from the webhook
  -- The mailbox health score will be recalculated separately
  NULL;
END;
$$;

-- 5. RPC function to stop campaigns for a lead (auto-stop rule)
CREATE OR REPLACE FUNCTION public.stop_campaign_for_lead(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign_ids uuid[];
BEGIN
  -- Find all active campaigns for this lead from send_queue
  SELECT ARRAY_AGG(DISTINCT campaign_id)
  INTO v_campaign_ids
  FROM public.send_queue
  WHERE lead_id = p_lead_id
    AND status IN ('pending', 'queued', 'scheduled');
  
  -- Also check send_logs for campaigns that recently sent to this lead
  SELECT ARRAY_AGG(DISTINCT campaign_id)
  INTO v_campaign_ids
  FROM public.send_logs
  WHERE lead_id = p_lead_id
    AND campaign_id NOT IN (SELECT unnest(COALESCE(v_campaign_ids, ARRAY[]::uuid[])))
    AND sent_at >= CURRENT_DATE - INTERVAL '7 days';
  
  -- Pause campaigns that have this lead
  IF v_campaign_ids IS NOT NULL AND array_length(v_campaign_ids, 1) > 0 THEN
    UPDATE public.campaigns
    SET status = 'paused'
    WHERE id = ANY(v_campaign_ids)
      AND status IN ('active', 'running', 'sending', 'scheduled');
  END IF;
  
  -- Cancel pending queue items for this lead
  -- Note: This assumes send_queue has a status column that can be set to 'canceled'
  -- If your schema uses different status values, adjust accordingly
  UPDATE public.send_queue
  SET status = 'canceled'
  WHERE lead_id = p_lead_id
    AND status IN ('pending', 'queued', 'scheduled');
  
  -- Also pause any sequences/enrollments for this lead
  -- This depends on your sequence system structure
  -- Example: UPDATE sequence_enrollments SET status = 'paused' WHERE lead_id = p_lead_id;
END;
$$;

-- 6. RPC function to update mailbox health score
CREATE OR REPLACE FUNCTION public.update_mailbox_health(p_mailbox_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hard_bounces int;
  v_soft_bounces int;
  v_total_bounces int;
  v_score int := 100;
  v_last_30_days date := CURRENT_DATE - INTERVAL '30 days';
  v_mailbox_email text;
BEGIN
  -- Get mailbox email for matching sends
  SELECT from_email INTO v_mailbox_email
  FROM public.mailboxes
  WHERE id = p_mailbox_id;
  
  IF v_mailbox_email IS NULL THEN
    RETURN;
  END IF;
  
  -- Count bounces in last 30 days for this mailbox
  SELECT 
    COUNT(*) FILTER (WHERE bounce_type = 'hard'),
    COUNT(*) FILTER (WHERE bounce_type = 'soft'),
    COUNT(*)
  INTO v_hard_bounces, v_soft_bounces, v_total_bounces
  FROM public.bounces
  WHERE mailbox_id = p_mailbox_id
    AND created_at >= v_last_30_days;
  
  -- Calculate health score
  -- Start at 100, deduct points for issues
  v_score := 100;
  v_score := v_score - (v_hard_bounces * 5);  -- Hard bounces are severe
  v_score := v_score - (v_soft_bounces * 1);  -- Soft bounces are less severe
  
  -- Additional penalty for high bounce volume
  IF v_total_bounces > 20 THEN
    v_score := v_score - 15;  -- Very high bounce volume
  ELSIF v_total_bounces > 10 THEN
    v_score := v_score - 10;  -- High bounce volume
  ELSIF v_total_bounces > 5 THEN
    v_score := v_score - 5;   -- Moderate bounce volume
  END IF;
  
  -- Ensure score stays within bounds
  v_score := GREATEST(0, LEAST(100, v_score));
  
  -- Update mailbox health score
  UPDATE public.mailboxes
  SET health_score = v_score
  WHERE id = p_mailbox_id;
END;
$$;

-- 7. Trigger to auto-update lead reachability on bounce
CREATE OR REPLACE FUNCTION public.update_lead_reachability_on_bounce()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hard_bounce_count int;
  v_soft_bounce_count int;
BEGIN
  -- If hard bounce, mark as invalid immediately
  IF NEW.bounce_type = 'hard' THEN
    UPDATE public.leads
    SET reachability = 'invalid'
    WHERE id = NEW.lead_id;
    
    -- Auto-stop campaigns for this lead
    PERFORM public.stop_campaign_for_lead(NEW.lead_id);
    
    -- Add DNC tag
    UPDATE public.leads
    SET tags = CASE 
      WHEN tags IS NULL THEN ARRAY['dnc']::text[]
      WHEN NOT ('dnc' = ANY(tags)) THEN tags || 'dnc'
      ELSE tags
    END
    WHERE id = NEW.lead_id;
  ELSE
    -- For soft bounces, check if we have repeated soft bounces
    SELECT 
      COUNT(*) FILTER (WHERE bounce_type = 'hard'),
      COUNT(*) FILTER (WHERE bounce_type = 'soft')
    INTO v_hard_bounce_count, v_soft_bounce_count
    FROM public.bounces
    WHERE lead_id = NEW.lead_id;
    
    -- If 3+ soft bounces, mark as risky
    IF v_soft_bounce_count >= 3 THEN
      UPDATE public.leads
      SET reachability = 'risky'
      WHERE id = NEW.lead_id AND reachability != 'invalid';
    END IF;
  END IF;
  
  -- Update mailbox health score
  IF NEW.mailbox_id IS NOT NULL THEN
    PERFORM public.update_mailbox_health(NEW.mailbox_id);
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_lead_reachability_on_bounce
AFTER INSERT ON public.bounces
FOR EACH ROW
EXECUTE FUNCTION public.update_lead_reachability_on_bounce();

-- 8. RLS policies for bounces table
ALTER TABLE public.bounces ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "bounces_select_workspace" ON public.bounces;
DROP POLICY IF EXISTS "bounces_insert_service" ON public.bounces;
DROP POLICY IF EXISTS "bounces_select_own" ON public.bounces;

-- Policy: Users can view bounces for their workspace
CREATE POLICY "bounces_select_workspace" ON public.bounces
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Policy: Service role can insert bounces
CREATE POLICY "bounces_insert_service" ON public.bounces
  FOR INSERT
  WITH CHECK (true);

-- Helper function to lookup workspace_id from email
CREATE OR REPLACE FUNCTION public.lookup_workspace_from_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  -- Try to find workspace_id from leads table
  SELECT workspace_id INTO v_workspace_id
  FROM public.leads
  WHERE email = LOWER(p_email)
  LIMIT 1;
  
  -- If not found, try to find from send_logs
  IF v_workspace_id IS NULL THEN
    SELECT workspace_id INTO v_workspace_id
    FROM public.send_logs
    WHERE to_email = LOWER(p_email)
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;
  
  RETURN v_workspace_id;
END;
$$;

-- Helper function to lookup lead_id from email
CREATE OR REPLACE FUNCTION public.lookup_lead_from_email(p_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_lead_id uuid;
BEGIN
  SELECT id INTO v_lead_id
  FROM public.leads
  WHERE email = LOWER(p_email)
  LIMIT 1;
  
  RETURN v_lead_id;
END;
$$;

-- Helper function to lookup campaign_id from message_id
CREATE OR REPLACE FUNCTION public.lookup_campaign_from_message_id(p_message_id text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_campaign_id uuid;
BEGIN
  -- Try send_logs first
  SELECT campaign_id INTO v_campaign_id
  FROM public.send_logs
  WHERE provider_message_id = p_message_id
  LIMIT 1;
  
  -- If not found, try campaign_logs
  IF v_campaign_id IS NULL THEN
    SELECT campaign_id INTO v_campaign_id
    FROM public.campaign_logs
    WHERE message_id = p_message_id
    LIMIT 1;
  END IF;
  
  RETURN v_campaign_id;
END;
$$;

-- Helper function to lookup mailbox_id from recipient email
CREATE OR REPLACE FUNCTION public.lookup_mailbox_from_recipient(p_recipient_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_mailbox_id uuid;
BEGIN
  -- Try to match by from_email in mailboxes
  SELECT id INTO v_mailbox_id
  FROM public.mailboxes
  WHERE from_email = LOWER(p_recipient_email)
    AND is_active = true
  LIMIT 1;
  
  RETURN v_mailbox_id;
END;
$$;

