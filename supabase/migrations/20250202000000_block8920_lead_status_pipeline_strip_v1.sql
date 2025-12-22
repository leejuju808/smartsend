-- =========================================================
-- Block 8920 — Lead Status & Pipeline Strip v1
-- Hot/Warm/Cold Labels + Simple Roofing Stages
-- =========================================================

-- 1. Create lead_status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lead_status') THEN
    CREATE TYPE lead_status AS ENUM (
      'new',           -- never replied
      'hot',
      'warm',
      'neutral',
      'cold',
      'not_interested',
      'unsubscribed'
    );
  END IF;
END$$;

-- 2. Create pipeline_stage enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pipeline_stage') THEN
    CREATE TYPE pipeline_stage AS ENUM (
      'new',
      'contacted',
      'estimate_scheduled',
      'estimate_sent',
      'follow_up',
      'won',
      'lost'
    );
  END IF;
END$$;

-- 3. Extend lead_auto_follow_up_stats table
-- Add lead_status column (migrate from text to enum)
DO $$
BEGIN
  -- Add lead_status column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'lead_auto_follow_up_stats' 
    AND column_name = 'lead_status'
  ) THEN
    ALTER TABLE public.lead_auto_follow_up_stats
      ADD COLUMN lead_status lead_status NOT NULL DEFAULT 'new';
  END IF;

  -- Add pipeline_stage column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'lead_auto_follow_up_stats' 
    AND column_name = 'pipeline_stage'
  ) THEN
    ALTER TABLE public.lead_auto_follow_up_stats
      ADD COLUMN pipeline_stage pipeline_stage NOT NULL DEFAULT 'new';
  END IF;
END$$;

-- Migrate existing data from current_pipeline_stage text to pipeline_stage enum
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN 
    SELECT id, current_pipeline_stage 
    FROM public.lead_auto_follow_up_stats 
    WHERE current_pipeline_stage IS NOT NULL
  LOOP
    BEGIN
      -- Try to map existing text values to enum
      UPDATE public.lead_auto_follow_up_stats
      SET pipeline_stage = CASE
        WHEN rec.current_pipeline_stage = 'new' THEN 'new'::pipeline_stage
        WHEN rec.current_pipeline_stage = 'quoted' THEN 'estimate_sent'::pipeline_stage
        WHEN rec.current_pipeline_stage = 'won' THEN 'won'::pipeline_stage
        WHEN rec.current_pipeline_stage = 'lost' THEN 'lost'::pipeline_stage
        ELSE 'new'::pipeline_stage
      END
      WHERE id = rec.id;
    EXCEPTION WHEN OTHERS THEN
      -- If mapping fails, keep default 'new'
      UPDATE public.lead_auto_follow_up_stats
      SET pipeline_stage = 'new'::pipeline_stage
      WHERE id = rec.id;
    END;
  END LOOP;
END$$;

-- Migrate existing data from last_intent text to lead_status enum
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN 
    SELECT id, last_intent 
    FROM public.lead_auto_follow_up_stats 
    WHERE last_intent IS NOT NULL
  LOOP
    BEGIN
      -- Map intent to lead_status
      UPDATE public.lead_auto_follow_up_stats
      SET lead_status = CASE
        WHEN rec.last_intent = 'hot' OR rec.last_intent = 'hot_lead' THEN 'hot'::lead_status
        WHEN rec.last_intent = 'warm' OR rec.last_intent = 'warm_lead' THEN 'warm'::lead_status
        WHEN rec.last_intent = 'neutral' OR rec.last_intent = 'follow_up' THEN 'neutral'::lead_status
        WHEN rec.last_intent = 'not_interested' OR rec.last_intent = 'negative' THEN 'not_interested'::lead_status
        WHEN rec.last_intent = 'unsubscribe' THEN 'unsubscribed'::lead_status
        ELSE 'neutral'::lead_status
      END
      WHERE id = rec.id;
    EXCEPTION WHEN OTHERS THEN
      -- If mapping fails, keep default 'neutral'
      UPDATE public.lead_auto_follow_up_stats
      SET lead_status = 'neutral'::lead_status
      WHERE id = rec.id;
    END;
  END LOOP;
END$$;

-- 4. Create indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_lead_auto_follow_up_stats_status 
  ON public.lead_auto_follow_up_stats (account_id, campaign_id, lead_status);

CREATE INDEX IF NOT EXISTS idx_lead_auto_follow_up_stats_pipeline_stage 
  ON public.lead_auto_follow_up_stats (account_id, campaign_id, pipeline_stage);

CREATE INDEX IF NOT EXISTS idx_lead_auto_follow_up_stats_status_stage 
  ON public.lead_auto_follow_up_stats (account_id, campaign_id, lead_status, pipeline_stage);

-- 5. Create function to map intent to lead_status
CREATE OR REPLACE FUNCTION public.map_intent_to_lead_status(intent text)
RETURNS lead_status
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE
    WHEN intent IN ('hot', 'hot_lead', 'positive', 'interested', 'scheduling') THEN 'hot'::lead_status
    WHEN intent IN ('warm', 'warm_lead', 'question', 'referral') THEN 'warm'::lead_status
    WHEN intent IN ('neutral', 'follow_up', 'ooo', 'other', 'unknown') THEN 'neutral'::lead_status
    WHEN intent IN ('not_interested', 'negative', 'spam') THEN 'not_interested'::lead_status
    WHEN intent = 'unsubscribe' THEN 'unsubscribed'::lead_status
    ELSE 'neutral'::lead_status
  END;
END;
$$;

-- 6. Create function to update lead_status from intent
CREATE OR REPLACE FUNCTION public.update_lead_status_from_intent(
  p_account_id uuid,
  p_campaign_id uuid,
  p_contact_id uuid,
  p_intent text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead_status lead_status;
BEGIN
  -- Map intent to lead_status
  v_lead_status := public.map_intent_to_lead_status(p_intent);

  -- Upsert lead_auto_follow_up_stats
  INSERT INTO public.lead_auto_follow_up_stats (
    account_id,
    campaign_id,
    contact_id,
    lead_status,
    last_intent,
    last_inbound_at
  )
  VALUES (
    p_account_id,
    p_campaign_id,
    p_contact_id,
    v_lead_status,
    p_intent,
    now()
  )
  ON CONFLICT (campaign_id, contact_id)
  DO UPDATE SET
    lead_status = v_lead_status,
    last_intent = p_intent,
    last_inbound_at = now(),
    updated_at = now();
END;
$$;

-- 7. Create function to update pipeline_stage when first outbound is sent
CREATE OR REPLACE FUNCTION public.update_pipeline_stage_on_outbound(
  p_account_id uuid,
  p_campaign_id uuid,
  p_contact_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_stage pipeline_stage;
BEGIN
  -- Get or create stats record
  INSERT INTO public.lead_auto_follow_up_stats (
    account_id,
    campaign_id,
    contact_id,
    pipeline_stage,
    last_outbound_at
  )
  VALUES (
    p_account_id,
    p_campaign_id,
    p_contact_id,
    'new'::pipeline_stage,
    now()
  )
  ON CONFLICT (campaign_id, contact_id)
  DO UPDATE SET
    last_outbound_at = now(),
    updated_at = now(),
    -- If stage is 'new', move to 'contacted'
    pipeline_stage = CASE
      WHEN lead_auto_follow_up_stats.pipeline_stage = 'new'::pipeline_stage 
      THEN 'contacted'::pipeline_stage
      ELSE lead_auto_follow_up_stats.pipeline_stage
    END;
END;
$$;

-- 8. Create function to handle pipeline stage changes (won/lost disable follow-ups)
CREATE OR REPLACE FUNCTION public.update_pipeline_stage_with_rules(
  p_account_id uuid,
  p_campaign_id uuid,
  p_contact_id uuid,
  p_pipeline_stage pipeline_stage
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_should_disable boolean;
BEGIN
  -- Determine if follow-ups should be disabled
  v_should_disable := p_pipeline_stage IN ('won', 'lost');

  -- Update stats
  UPDATE public.lead_auto_follow_up_stats
  SET
    pipeline_stage = p_pipeline_stage,
    auto_follow_up_disabled = CASE
      WHEN v_should_disable THEN true
      ELSE auto_follow_up_disabled  -- Keep existing value if not won/lost
    END,
    updated_at = now()
  WHERE account_id = p_account_id
    AND campaign_id = p_campaign_id
    AND contact_id = p_contact_id;

  -- If no row exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.lead_auto_follow_up_stats (
      account_id,
      campaign_id,
      contact_id,
      pipeline_stage,
      auto_follow_up_disabled
    )
    VALUES (
      p_account_id,
      p_campaign_id,
      p_contact_id,
      p_pipeline_stage,
      v_should_disable
    );
  END IF;

  -- Log follow_up_event if disabling
  IF v_should_disable THEN
    INSERT INTO public.follow_up_events (
      account_id,
      campaign_id,
      contact_id,
      event_type,
      details
    )
    VALUES (
      p_account_id,
      p_campaign_id,
      p_contact_id,
      'stopped_by_pipeline_stage'::follow_up_event_type,
      jsonb_build_object(
        'pipeline_stage', p_pipeline_stage,
        'reason', 'Pipeline stage set to ' || p_pipeline_stage
      )
    );
  END IF;
END;
$$;

-- 9. Create function to get lead stats for a campaign
CREATE OR REPLACE FUNCTION public.get_campaign_lead_stats(
  p_campaign_id uuid,
  p_account_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_total int;
  v_by_status jsonb;
  v_by_stage jsonb;
BEGIN
  -- Get total count
  SELECT COUNT(*) INTO v_total
  FROM public.lead_auto_follow_up_stats
  WHERE campaign_id = p_campaign_id
    AND account_id = p_account_id;

  -- Get counts by status
  SELECT jsonb_object_agg(
    COALESCE(lead_status::text, 'new'),
    count
  ) INTO v_by_status
  FROM (
    SELECT 
      lead_status,
      COUNT(*) as count
    FROM public.lead_auto_follow_up_stats
    WHERE campaign_id = p_campaign_id
      AND account_id = p_account_id
    GROUP BY lead_status
  ) sub;

  -- Get counts by stage
  SELECT jsonb_object_agg(
    COALESCE(pipeline_stage::text, 'new'),
    count
  ) INTO v_by_stage
  FROM (
    SELECT 
      pipeline_stage,
      COUNT(*) as count
    FROM public.lead_auto_follow_up_stats
    WHERE campaign_id = p_campaign_id
      AND account_id = p_account_id
    GROUP BY pipeline_stage
  ) sub;

  -- Return combined result
  RETURN jsonb_build_object(
    'total', COALESCE(v_total, 0),
    'by_status', COALESCE(v_by_status, '{}'::jsonb),
    'by_stage', COALESCE(v_by_stage, '{}'::jsonb)
  );
END;
$$;

-- 10. Comments
COMMENT ON TYPE lead_status IS 'Intent-based status: Hot/Warm/Neutral/Cold/Not Interested/Unsubscribed';
COMMENT ON TYPE pipeline_stage IS 'Simple pipeline stage: New → Contacted → Estimate Sent → Won/Lost';
COMMENT ON FUNCTION public.map_intent_to_lead_status IS 'Maps intent text to lead_status enum';
COMMENT ON FUNCTION public.update_lead_status_from_intent IS 'Updates lead_status when reply intent is classified';
COMMENT ON FUNCTION public.update_pipeline_stage_on_outbound IS 'Updates pipeline_stage when first outbound email is sent (new → contacted)';
COMMENT ON FUNCTION public.update_pipeline_stage_with_rules IS 'Updates pipeline_stage and disables follow-ups if won/lost';
COMMENT ON FUNCTION public.get_campaign_lead_stats IS 'Returns aggregate counts by status and stage for a campaign';
























































