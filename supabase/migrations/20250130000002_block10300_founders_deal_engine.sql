-- =========================================================
-- Block 10300 — SmartSend Founders Deal Engine v1
-- (How We Convert 5–10 Roofers Into Paid Clients Immediately)
-- =========================================================

-- Add founder flag to workspace_subscriptions
ALTER TABLE IF EXISTS public.workspace_subscriptions
  ADD COLUMN IF NOT EXISTS is_founder boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_founder 
  ON public.workspace_subscriptions(is_founder) WHERE is_founder = true;

-- Founders deal eligibility tracking
CREATE TABLE IF NOT EXISTS public.founders_deal_eligibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Eligibility criteria (must meet all)
  workspace_created_at timestamptz NOT NULL,
  first_homeowner_reply_at timestamptz,
  first_warm_lead_at timestamptz,
  first_job_value_shown_at timestamptz, -- when dashboard shows estimated job value > 0
  
  -- Eligibility status
  is_eligible boolean NOT NULL DEFAULT false,
  eligibility_checked_at timestamptz,
  
  -- Founders deal offer
  offer_sent_at timestamptz,
  offer_viewed_at timestamptz,
  
  -- Conversion tracking
  converted_at timestamptz,
  converted_plan_id text REFERENCES public.subscription_plans(id),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_founders_deal_eligibility_workspace 
  ON public.founders_deal_eligibility(workspace_id);

CREATE INDEX IF NOT EXISTS idx_founders_deal_eligibility_eligible 
  ON public.founders_deal_eligibility(is_eligible) WHERE is_eligible = true;

CREATE INDEX IF NOT EXISTS idx_founders_deal_eligibility_user 
  ON public.founders_deal_eligibility(user_id);

-- Function to check founders deal eligibility
-- Eligible if: workspace created > 72 hours ago AND (has homeowner reply OR warm lead OR job value shown)
CREATE OR REPLACE FUNCTION public.check_founders_deal_eligibility(p_workspace_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_created_at timestamptz;
  v_has_reply boolean;
  v_has_warm_lead boolean;
  v_has_job_value boolean;
  v_is_eligible boolean;
BEGIN
  -- Get workspace creation time
  SELECT created_at INTO v_workspace_created_at
  FROM public.workspaces
  WHERE id = p_workspace_id;
  
  IF v_workspace_created_at IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if 72 hours have passed
  IF v_workspace_created_at > now() - interval '72 hours' THEN
    RETURN false;
  END IF;
  
  -- Check for homeowner reply (from reply_threads)
  SELECT EXISTS(
    SELECT 1 FROM public.reply_threads rt
    INNER JOIN public.campaigns c ON c.id = rt.campaign_id
    WHERE c.workspace_id = p_workspace_id
      AND rt.latest_intent IN ('hot', 'warm', 'cold')
      AND rt.created_at > v_workspace_created_at
  ) INTO v_has_reply;
  
  -- Check for warm lead (from lead_auto_follow_up_stats or reply_threads with warm intent)
  SELECT EXISTS(
    SELECT 1 FROM public.reply_threads rt
    INNER JOIN public.campaigns c ON c.id = rt.campaign_id
    WHERE c.workspace_id = p_workspace_id
      AND rt.latest_intent = 'warm'
      AND rt.created_at > v_workspace_created_at
  ) INTO v_has_warm_lead;
  
  -- Check for job value shown (from lead_auto_follow_up_stats with potential_job_value > 0)
  SELECT EXISTS(
    SELECT 1 FROM public.lead_auto_follow_up_stats lafs
    INNER JOIN public.campaigns c ON c.id = lafs.campaign_id
    WHERE c.workspace_id = p_workspace_id
      AND lafs.potential_job_value > 0
      AND lafs.created_at > v_workspace_created_at
  ) INTO v_has_job_value;
  
  -- Eligible if has reply OR warm lead OR job value
  v_is_eligible := v_has_reply OR v_has_warm_lead OR v_has_job_value;
  
  -- Update eligibility record
  INSERT INTO public.founders_deal_eligibility (
    workspace_id,
    user_id,
    workspace_created_at,
    first_homeowner_reply_at,
    first_warm_lead_at,
    first_job_value_shown_at,
    is_eligible,
    eligibility_checked_at
  )
  SELECT 
    p_workspace_id,
    w.owner_id,
    v_workspace_created_at,
    CASE WHEN v_has_reply THEN now() ELSE NULL END,
    CASE WHEN v_has_warm_lead THEN now() ELSE NULL END,
    CASE WHEN v_has_job_value THEN now() ELSE NULL END,
    v_is_eligible,
    now()
  FROM public.workspaces w
  WHERE w.id = p_workspace_id
  ON CONFLICT (workspace_id) DO UPDATE SET
    is_eligible = v_is_eligible,
    eligibility_checked_at = now(),
    updated_at = now();
  
  RETURN v_is_eligible;
END;
$$;

-- RLS for founders_deal_eligibility
ALTER TABLE public.founders_deal_eligibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own founders deal eligibility"
  ON public.founders_deal_eligibility
  FOR SELECT
  USING (user_id = auth.uid());

-- Comments
COMMENT ON TABLE public.founders_deal_eligibility IS 'Tracks eligibility for founders deal offer (72 hours + results)';
COMMENT ON COLUMN public.workspace_subscriptions.is_founder IS 'True if this subscription was created through founders deal (lifetime pricing)';























































