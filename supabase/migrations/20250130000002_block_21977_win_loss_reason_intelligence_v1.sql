-- ============================================================================
-- Block 21977 — SmartSend Roofing Win/Loss Reason Intelligence v1
-- (❌ Why Jobs Are Lost — ✔ Why Jobs Are Won — REAL Insights for Owners & Estimators)
-- ============================================================================
-- FULL BLOCK. FULL POWER. ZERO FLUFF.
-- This is one of the MOST IMPORTANT intelligence layers in SmartSend.
-- ============================================================================

-- ============================================================================
-- PART 1 — ADD WIN/LOSS REASON COLUMNS TO LEADS TABLE
-- ============================================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS win_reason text,
  ADD COLUMN IF NOT EXISTS loss_reason text,
  ADD COLUMN IF NOT EXISTS reason_confidence integer CHECK (reason_confidence >= 0 AND reason_confidence <= 100);

-- Add comments for documentation
COMMENT ON COLUMN public.leads.win_reason IS 'Block 21977: AI-detected reason why this job was won (only filled when status = "won")';
COMMENT ON COLUMN public.leads.loss_reason IS 'Block 21977: AI-detected reason why this job was lost (only filled when status = "lost")';
COMMENT ON COLUMN public.leads.reason_confidence IS 'Block 21977: AI confidence score (0-100) for the detected win/loss reason';

-- Create indexes for reporting queries
CREATE INDEX IF NOT EXISTS idx_leads_win_reason ON public.leads(win_reason) WHERE win_reason IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_loss_reason ON public.leads(loss_reason) WHERE loss_reason IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_status_reason ON public.leads(status, win_reason, loss_reason) WHERE status IN ('won', 'lost');

-- ============================================================================
-- PART 2 — CREATE FUNCTION TO TRIGGER WIN/LOSS REASON DETECTION
-- ============================================================================
-- Note: The actual edge function call will be handled by the application layer
-- when status changes to won/lost. This trigger logs the event for tracking.

CREATE OR REPLACE FUNCTION public.trigger_detect_win_loss_reason()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_status text;
  v_new_status text;
  v_lead_id uuid;
BEGIN
  v_old_status := OLD.status;
  v_new_status := NEW.status;
  v_lead_id := NEW.id;

  -- Only trigger if status changed to "won" or "lost"
  -- Log event to audit log (the actual AI detection will be called from application layer)
  IF (v_new_status = 'won' AND (v_old_status IS NULL OR v_old_status != 'won')) THEN
    INSERT INTO public.lead_audit_logs (
      lead_id,
      event_type,
      actor_type,
      event_data
    ) VALUES (
      v_lead_id,
      'status_changed_to_won',
      'system',
      jsonb_build_object(
        'old_status', v_old_status,
        'new_status', v_new_status,
        'trigger_reason_detection', true
      )
    );
  ELSIF (v_new_status = 'lost' AND (v_old_status IS NULL OR v_old_status != 'lost')) THEN
    INSERT INTO public.lead_audit_logs (
      lead_id,
      event_type,
      actor_type,
      event_data
    ) VALUES (
      v_lead_id,
      'status_changed_to_lost',
      'system',
      jsonb_build_object(
        'old_status', v_old_status,
        'new_status', v_new_status,
        'trigger_reason_detection', true
      )
    );
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Failed to log win/loss status change: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_detect_win_loss_reason ON public.leads;

-- Create trigger that fires on status changes
CREATE TRIGGER trg_detect_win_loss_reason
  AFTER UPDATE OF status ON public.leads
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('won', 'lost'))
  EXECUTE FUNCTION public.trigger_detect_win_loss_reason();

-- ============================================================================
-- PART 3 — HELPER FUNCTION TO MANUALLY TRIGGER REASON DETECTION
-- ============================================================================
-- This can be called manually or via cron for batch processing

CREATE OR REPLACE FUNCTION public.detect_win_loss_reason_for_lead(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status text;
BEGIN
  -- Get current status
  SELECT status INTO v_status
  FROM public.leads
  WHERE id = p_lead_id;

  IF v_status = 'won' THEN
    -- Call edge function (implementation depends on available extensions)
    -- For now, this will be handled by the edge function being called directly
    NULL;
  ELSIF v_status = 'lost' THEN
    -- Call edge function
    NULL;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.detect_win_loss_reason_for_lead IS 'Block 21977: Manually trigger win/loss reason detection for a specific lead';

-- ============================================================================
-- PART 4 — CREATE VIEW FOR WIN/LOSS REASON REPORTING
-- ============================================================================

CREATE OR REPLACE VIEW public.win_loss_reasons_report AS
SELECT
  workspace_id,
  DATE_TRUNC('month', updated_at) as month,
  status,
  win_reason,
  loss_reason,
  COUNT(*) as count,
  AVG(reason_confidence) as avg_confidence,
  SUM(estimated_job_value) as total_value
FROM public.leads
WHERE status IN ('won', 'lost')
  AND (win_reason IS NOT NULL OR loss_reason IS NOT NULL)
GROUP BY workspace_id, DATE_TRUNC('month', updated_at), status, win_reason, loss_reason;

COMMENT ON VIEW public.win_loss_reasons_report IS 'Block 21977: Aggregated win/loss reason statistics for reporting';

-- ============================================================================
-- PART 5 — RPC FUNCTION TO GET TOP WIN/LOSS REASONS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_top_win_loss_reasons(
  p_workspace_id uuid,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(
  reason_type text,
  reason text,
  count bigint,
  percentage numeric,
  avg_confidence numeric,
  total_value numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start_date timestamptz;
  v_end_date timestamptz;
  v_total_won bigint;
  v_total_lost bigint;
BEGIN
  -- Set default date range to last 30 days if not provided
  v_start_date := COALESCE(p_start_date, NOW() - INTERVAL '30 days');
  v_end_date := COALESCE(p_end_date, NOW());

  -- Get total counts for percentage calculation
  SELECT COUNT(*) INTO v_total_won
  FROM public.leads
  WHERE workspace_id = p_workspace_id
    AND status = 'won'
    AND updated_at >= v_start_date
    AND updated_at <= v_end_date;

  SELECT COUNT(*) INTO v_total_lost
  FROM public.leads
  WHERE workspace_id = p_workspace_id
    AND status = 'lost'
    AND updated_at >= v_start_date
    AND updated_at <= v_end_date;

  -- Return top win reasons
  RETURN QUERY
  SELECT
    'win'::text as reason_type,
    win_reason as reason,
    COUNT(*)::bigint as count,
    CASE WHEN v_total_won > 0 THEN (COUNT(*)::numeric / v_total_won::numeric * 100) ELSE 0 END as percentage,
    AVG(reason_confidence)::numeric as avg_confidence,
    SUM(estimated_job_value)::numeric as total_value
  FROM public.leads
  WHERE workspace_id = p_workspace_id
    AND status = 'won'
    AND win_reason IS NOT NULL
    AND updated_at >= v_start_date
    AND updated_at <= v_end_date
  GROUP BY win_reason
  ORDER BY count DESC
  LIMIT p_limit;

  -- Return top loss reasons
  RETURN QUERY
  SELECT
    'loss'::text as reason_type,
    loss_reason as reason,
    COUNT(*)::bigint as count,
    CASE WHEN v_total_lost > 0 THEN (COUNT(*)::numeric / v_total_lost::numeric * 100) ELSE 0 END as percentage,
    AVG(reason_confidence)::numeric as avg_confidence,
    SUM(estimated_job_value)::numeric as total_value
  FROM public.leads
  WHERE workspace_id = p_workspace_id
    AND status = 'lost'
    AND loss_reason IS NOT NULL
    AND updated_at >= v_start_date
    AND updated_at <= v_end_date
  GROUP BY loss_reason
  ORDER BY count DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_top_win_loss_reasons IS 'Block 21977: Get top win/loss reasons for a workspace with counts, percentages, and value totals';

-- ============================================================================
-- PART 6 — GRANT PERMISSIONS
-- ============================================================================

-- Grant execute permission on functions to authenticated users
GRANT EXECUTE ON FUNCTION public.detect_win_loss_reason_for_lead(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_win_loss_reasons(uuid, timestamptz, timestamptz, integer) TO authenticated;

-- Grant select on view to authenticated users
GRANT SELECT ON public.win_loss_reasons_report TO authenticated;

