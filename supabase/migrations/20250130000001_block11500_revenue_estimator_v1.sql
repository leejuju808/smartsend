-- =========================================================
-- Block 11500 — SmartSend Roofing Revenue Estimator v1
-- (The Money Meter That Shows Roofers Exactly How Much Work SmartSend Can Bring In)
-- =========================================================

-- 1. Add revenue breakdown fields to dashboard_metrics table
DO $$
BEGIN
  -- Add hot_value column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dashboard_metrics' 
    AND column_name = 'hot_value'
  ) THEN
    ALTER TABLE public.dashboard_metrics 
      ADD COLUMN hot_value numeric(12, 2) NOT NULL DEFAULT 0;
  END IF;

  -- Add warm_value column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dashboard_metrics' 
    AND column_name = 'warm_value'
  ) THEN
    ALTER TABLE public.dashboard_metrics 
      ADD COLUMN warm_value numeric(12, 2) NOT NULL DEFAULT 0;
  END IF;

  -- Add follow_up_value column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dashboard_metrics' 
    AND column_name = 'follow_up_value'
  ) THEN
    ALTER TABLE public.dashboard_metrics 
      ADD COLUMN follow_up_value numeric(12, 2) NOT NULL DEFAULT 0;
  END IF;

  -- Add new_value column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dashboard_metrics' 
    AND column_name = 'new_value'
  ) THEN
    ALTER TABLE public.dashboard_metrics 
      ADD COLUMN new_value numeric(12, 2) NOT NULL DEFAULT 0;
  END IF;

  -- Add total_estimated_value column (rename from est_job_value if needed, or keep both)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dashboard_metrics' 
    AND column_name = 'total_estimated_value'
  ) THEN
    ALTER TABLE public.dashboard_metrics 
      ADD COLUMN total_estimated_value numeric(12, 2) NOT NULL DEFAULT 0;
  END IF;

  -- Add follow_up_leads count column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dashboard_metrics' 
    AND column_name = 'follow_up_leads'
  ) THEN
    ALTER TABLE public.dashboard_metrics 
      ADD COLUMN follow_up_leads int NOT NULL DEFAULT 0;
  END IF;

  -- Add new_leads count column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'dashboard_metrics' 
    AND column_name = 'new_leads'
  ) THEN
    ALTER TABLE public.dashboard_metrics 
      ADD COLUMN new_leads int NOT NULL DEFAULT 0;
  END IF;
END$$;

-- 2. Update calculate_dashboard_metrics function with new revenue formula
CREATE OR REPLACE FUNCTION public.calculate_dashboard_metrics(
  p_workspace_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_emails_sent int;
  v_replies_received int;
  v_leads_identified int;
  v_hot_leads int;
  v_warm_leads int;
  v_cold_leads int;
  v_follow_up_leads int;
  v_new_leads int;
  v_hot_value numeric(12, 2);
  v_warm_value numeric(12, 2);
  v_follow_up_value numeric(12, 2);
  v_new_value numeric(12, 2);
  v_total_estimated_value numeric(12, 2);
BEGIN
  -- Count emails sent (from send_logs via campaigns)
  SELECT COALESCE(COUNT(*), 0) INTO v_emails_sent
  FROM public.send_logs sl
  JOIN public.campaigns c ON sl.campaign_id = c.id
  WHERE c.workspace_id = p_workspace_id
    AND sl.status = 'sent';
  
  -- Fallback: try campaign_logs if send_logs count is 0
  IF v_emails_sent = 0 THEN
    SELECT COALESCE(COUNT(*), 0) INTO v_emails_sent
    FROM public.campaign_logs cl
    JOIN public.campaigns c ON cl.campaign_id = c.id
    WHERE c.workspace_id = p_workspace_id
      AND cl.event = 'sent';
  END IF;
  
  -- Count replies received (from inbound_emails)
  SELECT COALESCE(COUNT(DISTINCT id), 0) INTO v_replies_received
  FROM public.inbound_emails
  WHERE workspace_id = p_workspace_id;
  
  -- Fallback: try email_replies via send_logs -> campaigns
  IF v_replies_received = 0 THEN
    SELECT COALESCE(COUNT(DISTINCT er.id), 0) INTO v_replies_received
    FROM public.email_replies er
    JOIN public.send_logs sl ON er.send_log_id = sl.id
    JOIN public.campaigns c ON sl.campaign_id = c.id
    WHERE c.workspace_id = p_workspace_id;
  END IF;
  
  -- Count leads identified (total leads in workspace)
  SELECT COALESCE(COUNT(*), 0) INTO v_leads_identified
  FROM public.leads
  WHERE workspace_id = p_workspace_id;
  
  -- Count leads by classification from lead_intents (latest classification per lead)
  -- HOT leads
  SELECT COALESCE(COUNT(DISTINCT lead_id), 0) INTO v_hot_leads
  FROM (
    SELECT DISTINCT ON (lead_id) lead_id, classification
    FROM public.lead_intents
    WHERE workspace_id = p_workspace_id
      AND lead_id IS NOT NULL
    ORDER BY lead_id, created_at DESC
  ) latest_intents
  WHERE classification = 'HOT';
  
  -- Fallback: count from leads.classification if no lead_intents
  IF v_hot_leads = 0 THEN
    SELECT COALESCE(COUNT(*), 0) INTO v_hot_leads
    FROM public.leads
    WHERE workspace_id = p_workspace_id
      AND (LOWER(classification) = 'hot' OR LOWER(lead_status) = 'hot');
  END IF;
  
  -- WARM leads
  SELECT COALESCE(COUNT(DISTINCT lead_id), 0) INTO v_warm_leads
  FROM (
    SELECT DISTINCT ON (lead_id) lead_id, classification
    FROM public.lead_intents
    WHERE workspace_id = p_workspace_id
      AND lead_id IS NOT NULL
    ORDER BY lead_id, created_at DESC
  ) latest_intents
  WHERE classification = 'WARM';
  
  -- Fallback: count from leads.classification if no lead_intents
  IF v_warm_leads = 0 THEN
    SELECT COALESCE(COUNT(*), 0) INTO v_warm_leads
    FROM public.leads
    WHERE workspace_id = p_workspace_id
      AND (LOWER(classification) = 'warm' OR LOWER(lead_status) = 'warm');
  END IF;
  
  -- FOLLOW_UP leads
  SELECT COALESCE(COUNT(DISTINCT lead_id), 0) INTO v_follow_up_leads
  FROM (
    SELECT DISTINCT ON (lead_id) lead_id, classification
    FROM public.lead_intents
    WHERE workspace_id = p_workspace_id
      AND lead_id IS NOT NULL
    ORDER BY lead_id, created_at DESC
  ) latest_intents
  WHERE classification = 'FOLLOW_UP';
  
  -- NEW leads (leads that have never been classified or replied to)
  SELECT COALESCE(COUNT(*), 0) INTO v_new_leads
  FROM public.leads l
  WHERE l.workspace_id = p_workspace_id
    AND NOT EXISTS (
      SELECT 1 FROM public.lead_intents li
      WHERE li.lead_id = l.id
    )
    AND (l.classification IS NULL OR LOWER(l.classification) = 'new')
    AND l.replied_at IS NULL;
  
  -- Count cold leads (for backward compatibility)
  SELECT COALESCE(COUNT(*), 0) INTO v_cold_leads
  FROM public.leads
  WHERE workspace_id = p_workspace_id
    AND (LOWER(classification) = 'cold' OR LOWER(lead_status) = 'cold');
  
  -- Calculate revenue breakdown using Block 11500 formula:
  -- HOT Lead = $7,000 average
  -- WARM Lead = $2,500 average
  -- FOLLOW UP = $1,000 average
  -- NEW Lead = $300 average (very low on purpose)
  -- NOT_INTERESTED = $0
  -- OUT_OF_SCOPE = $0
  v_hot_value := v_hot_leads * 7000.00;
  v_warm_value := v_warm_leads * 2500.00;
  v_follow_up_value := v_follow_up_leads * 1000.00;
  v_new_value := v_new_leads * 300.00;
  v_total_estimated_value := v_hot_value + v_warm_value + v_follow_up_value + v_new_value;
  
  -- Upsert metrics
  INSERT INTO public.dashboard_metrics (
    workspace_id,
    user_id,
    emails_sent,
    replies_received,
    leads_identified,
    hot_leads,
    warm_leads,
    cold_leads,
    follow_up_leads,
    new_leads,
    hot_value,
    warm_value,
    follow_up_value,
    new_value,
    total_estimated_value,
    est_job_value, -- Keep for backward compatibility
    last_updated
  ) VALUES (
    p_workspace_id,
    p_user_id,
    v_emails_sent,
    v_replies_received,
    v_leads_identified,
    v_hot_leads,
    v_warm_leads,
    v_cold_leads,
    v_follow_up_leads,
    v_new_leads,
    v_hot_value,
    v_warm_value,
    v_follow_up_value,
    v_new_value,
    v_total_estimated_value,
    v_total_estimated_value, -- Set est_job_value to same as total_estimated_value
    now()
  )
  ON CONFLICT (workspace_id, user_id)
  DO UPDATE SET
    emails_sent = EXCLUDED.emails_sent,
    replies_received = EXCLUDED.replies_received,
    leads_identified = EXCLUDED.leads_identified,
    hot_leads = EXCLUDED.hot_leads,
    warm_leads = EXCLUDED.warm_leads,
    cold_leads = EXCLUDED.cold_leads,
    follow_up_leads = EXCLUDED.follow_up_leads,
    new_leads = EXCLUDED.new_leads,
    hot_value = EXCLUDED.hot_value,
    warm_value = EXCLUDED.warm_value,
    follow_up_value = EXCLUDED.follow_up_value,
    new_value = EXCLUDED.new_value,
    total_estimated_value = EXCLUDED.total_estimated_value,
    est_job_value = EXCLUDED.total_estimated_value, -- Keep est_job_value in sync
    last_updated = EXCLUDED.last_updated;
END;
$$;

-- 3. Create function to recalculate revenue for a workspace (can be called by triggers)
CREATE OR REPLACE FUNCTION public.recalculate_revenue_estimator(
  p_workspace_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Get the primary user for this workspace (workspace owner or first member)
  SELECT COALESCE(
    w.owner_id,
    (SELECT user_id FROM public.workspace_members 
     WHERE workspace_id = p_workspace_id 
     ORDER BY created_at ASC 
     LIMIT 1)
  ) INTO v_user_id
  FROM public.workspaces w
  WHERE w.id = p_workspace_id;
  
  -- If no user found, try to get any user from workspace_members
  IF v_user_id IS NULL THEN
    SELECT user_id INTO v_user_id
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
    LIMIT 1;
  END IF;
  
  -- Recalculate metrics if we have a user
  IF v_user_id IS NOT NULL THEN
    PERFORM public.calculate_dashboard_metrics(p_workspace_id, v_user_id);
  END IF;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.recalculate_revenue_estimator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_revenue_estimator(uuid) TO service_role;

-- 4. Create trigger function to auto-recalculate revenue when lead_intents change
CREATE OR REPLACE FUNCTION public.trigger_revenue_recalculate_on_intent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_old_classification text;
  v_new_classification text;
  v_lead_id uuid;
  v_value_change numeric(12, 2);
BEGIN
  -- Get workspace_id and lead_id from the lead_intent
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    v_workspace_id := NEW.workspace_id;
    v_lead_id := NEW.lead_id;
    v_new_classification := NEW.classification::text;
    v_old_classification := CASE WHEN TG_OP = 'UPDATE' THEN OLD.classification::text ELSE NULL END;
  ELSIF TG_OP = 'DELETE' THEN
    v_workspace_id := OLD.workspace_id;
    v_lead_id := OLD.lead_id;
    v_old_classification := OLD.classification::text;
    v_new_classification := NULL;
  END IF;
  
  -- Calculate value change for activity log
  IF v_old_classification IS DISTINCT FROM v_new_classification AND v_lead_id IS NOT NULL THEN
    v_value_change := (
      CASE UPPER(COALESCE(v_new_classification, 'NEW'))
        WHEN 'HOT' THEN 7000.00
        WHEN 'WARM' THEN 2500.00
        WHEN 'FOLLOW_UP' THEN 1000.00
        WHEN 'NEW' THEN 300.00
        ELSE 0.00
      END
    ) - (
      CASE UPPER(COALESCE(v_old_classification, 'NEW'))
        WHEN 'HOT' THEN 7000.00
        WHEN 'WARM' THEN 2500.00
        WHEN 'FOLLOW_UP' THEN 1000.00
        WHEN 'NEW' THEN 300.00
        ELSE 0.00
      END
    );
    
    -- Log activity if value changed significantly
    IF ABS(v_value_change) >= 100.00 THEN
      INSERT INTO public.activity_logs (
        workspace_id,
        lead_id,
        type,
        metadata,
        created_at
      ) VALUES (
        v_workspace_id,
        v_lead_id,
        'classified',
        jsonb_build_object(
          'classification', v_new_classification,
          'old_classification', v_old_classification,
          'estimated_value', CASE UPPER(COALESCE(v_new_classification, 'NEW'))
            WHEN 'HOT' THEN 7000.00
            WHEN 'WARM' THEN 2500.00
            WHEN 'FOLLOW_UP' THEN 1000.00
            WHEN 'NEW' THEN 300.00
            ELSE 0.00
          END,
          'value_change', v_value_change,
          'revenue_message', CASE 
            WHEN v_value_change > 0 THEN format('%s lead detected → Estimated job value increased by $%s.', 
              UPPER(v_new_classification), 
              to_char(v_value_change, 'FM$999,999'))
            WHEN v_value_change < 0 THEN format('Lead classification changed to %s → Estimated job value decreased by $%s.', 
              UPPER(v_new_classification),
              to_char(ABS(v_value_change), 'FM$999,999'))
            ELSE NULL
          END
        ),
        now()
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  
  -- Trigger recalculation (async via pg_notify or direct call)
  -- Using direct call for simplicity - can be optimized later with pg_notify + LISTEN
  IF v_workspace_id IS NOT NULL THEN
    PERFORM public.recalculate_revenue_estimator(v_workspace_id);
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger on lead_intents table
DROP TRIGGER IF EXISTS trg_revenue_recalculate_on_intent ON public.lead_intents;
CREATE TRIGGER trg_revenue_recalculate_on_intent
  AFTER INSERT OR UPDATE OF classification OR DELETE
  ON public.lead_intents
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_revenue_recalculate_on_intent();

-- 5. Create trigger function to auto-recalculate revenue when leads classification changes
CREATE OR REPLACE FUNCTION public.trigger_revenue_recalculate_on_lead_classification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only trigger if classification actually changed
  IF TG_OP = 'UPDATE' AND (
    OLD.classification IS NOT DISTINCT FROM NEW.classification
    AND OLD.lead_status IS NOT DISTINCT FROM NEW.lead_status
  ) THEN
    RETURN NEW;
  END IF;
  
  -- Trigger recalculation
  IF NEW.workspace_id IS NOT NULL THEN
    PERFORM public.recalculate_revenue_estimator(NEW.workspace_id);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on leads table
DROP TRIGGER IF EXISTS trg_revenue_recalculate_on_lead_classification ON public.leads;
CREATE TRIGGER trg_revenue_recalculate_on_lead_classification
  AFTER INSERT OR UPDATE OF classification, lead_status
  ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_revenue_recalculate_on_lead_classification();

-- 6. Create function to get lead type value (for displaying in Lead Timeline sidebar)
CREATE OR REPLACE FUNCTION public.get_lead_type_value(
  p_classification text
)
RETURNS numeric(12, 2)
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE UPPER(COALESCE(p_classification, 'NEW'))
    WHEN 'HOT' THEN 7000.00
    WHEN 'WARM' THEN 2500.00
    WHEN 'FOLLOW_UP' THEN 1000.00
    WHEN 'NEW' THEN 300.00
    WHEN 'NOT_INTERESTED' THEN 0.00
    WHEN 'OUT_OF_SCOPE' THEN 0.00
    ELSE 300.00 -- Default to NEW value
  END;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_lead_type_value(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lead_type_value(text) TO service_role;

-- 7. Update comments
COMMENT ON COLUMN public.dashboard_metrics.hot_value IS 'Revenue value from HOT leads: count * $7,000';
COMMENT ON COLUMN public.dashboard_metrics.warm_value IS 'Revenue value from WARM leads: count * $2,500';
COMMENT ON COLUMN public.dashboard_metrics.follow_up_value IS 'Revenue value from FOLLOW_UP leads: count * $1,000';
COMMENT ON COLUMN public.dashboard_metrics.new_value IS 'Revenue value from NEW leads: count * $300';
COMMENT ON COLUMN public.dashboard_metrics.total_estimated_value IS 'Total estimated job value: hot_value + warm_value + follow_up_value + new_value';
COMMENT ON COLUMN public.dashboard_metrics.follow_up_leads IS 'Number of leads classified as FOLLOW_UP';
COMMENT ON COLUMN public.dashboard_metrics.new_leads IS 'Number of leads that are NEW (never classified or replied)';
COMMENT ON FUNCTION public.recalculate_revenue_estimator(uuid) IS 'Recalculates revenue estimator metrics for a workspace. Called automatically on classification changes.';
COMMENT ON FUNCTION public.get_lead_type_value(text) IS 'Returns the estimated job value for a lead classification: HOT=$7K, WARM=$2.5K, FOLLOW_UP=$1K, NEW=$300, others=$0';

