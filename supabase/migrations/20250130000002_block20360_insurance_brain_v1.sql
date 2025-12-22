-- =========================================================
-- Block 20360 — SmartSend Inbox Homeowner Insurance Brain v1
-- (Carrier detection • Claim status reading • Deductible extraction • "Install-Ready" intelligence)
-- =========================================================
--
-- This block turns SmartSend into a weapon for roofing contractors.
-- It reads ANY email from a homeowner and instantly tells the roofer:
-- - Which insurance company the homeowner has
-- - Whether they are in Active Claim / Pending Claim / No Claim
-- - What their deductible is
-- - Whether the homeowner is install-ready
-- - Whether SmartSend should trigger a call, a follow-up, or a quote
--
-- This is DIRECT revenue logic for roofers.
-- This is how SmartSend books jobs automatically.
-- =========================================================

-- ============================================================================
-- PART 1 — Add Insurance Brain Fields to inbox_threads
-- ============================================================================

ALTER TABLE IF EXISTS public.inbox_threads
  -- Insurance carrier detection
  ADD COLUMN IF NOT EXISTS insurance_carrier text DEFAULT NULL,
  
  -- Claim status detection (matches spec exactly)
  ADD COLUMN IF NOT EXISTS insurance_claim_status text DEFAULT NULL CHECK (insurance_claim_status IN (
    'no_claim_filed',
    'claim_filed_awaiting_adjuster',
    'adjuster_visit_scheduled',
    'under_review',
    'approved',
    'approved_acv_only',
    'supplements_needed',
    'denied'
  )),
  
  -- Deductible extraction
  ADD COLUMN IF NOT EXISTS insurance_deductible_amount numeric(12,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS insurance_deductible_type text DEFAULT NULL CHECK (insurance_deductible_type IN ('fixed', 'percentage', 'unknown')),
  ADD COLUMN IF NOT EXISTS insurance_deductible_percentage numeric(5,2) DEFAULT NULL, -- For 2% deductibles
  
  -- ACV / RCV Logic
  ADD COLUMN IF NOT EXISTS insurance_payout_type text DEFAULT NULL CHECK (insurance_payout_type IN ('RCV', 'ACV', 'unknown')),
  ADD COLUMN IF NOT EXISTS insurance_depreciation_recoverable boolean DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS insurance_depreciation_amount numeric(12,2) DEFAULT NULL,
  
  -- Install-Ready Detection (The Money Maker)
  ADD COLUMN IF NOT EXISTS insurance_install_ready boolean DEFAULT false,
  
  -- Next Action (what SmartSend should do)
  ADD COLUMN IF NOT EXISTS insurance_next_action text DEFAULT NULL CHECK (insurance_next_action IN (
    'call_immediately',
    'send_follow_up',
    'send_quote',
    'wait_for_adjuster',
    'prepare_supplement',
    'none'
  )),
  
  -- Analysis metadata (raw AI output, confidence scores, etc.)
  ADD COLUMN IF NOT EXISTS insurance_analysis_metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Timestamps
  ADD COLUMN IF NOT EXISTS insurance_analyzed_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS insurance_last_updated_at timestamptz DEFAULT NULL;

-- Indexes for insurance queries
CREATE INDEX IF NOT EXISTS idx_threads_insurance_carrier ON public.inbox_threads(insurance_carrier) WHERE insurance_carrier IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_insurance_claim_status ON public.inbox_threads(insurance_claim_status) WHERE insurance_claim_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_insurance_install_ready ON public.inbox_threads(insurance_install_ready) WHERE insurance_install_ready = true;
CREATE INDEX IF NOT EXISTS idx_threads_insurance_next_action ON public.inbox_threads(insurance_next_action) WHERE insurance_next_action IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_insurance_analyzed_at ON public.inbox_threads(insurance_analyzed_at DESC) WHERE insurance_analyzed_at IS NOT NULL;

-- Composite index for install-ready queries (most common filter)
CREATE INDEX IF NOT EXISTS idx_threads_install_ready_status ON public.inbox_threads(insurance_install_ready, insurance_claim_status, campaign_id) 
  WHERE insurance_install_ready = true;

-- ============================================================================
-- PART 2 — Comments for Documentation
-- ============================================================================

COMMENT ON COLUMN public.inbox_threads.insurance_carrier IS 'Detected insurance carrier: State Farm, Allstate, Farmers, Liberty Mutual, Progressive, Travelers, USAA, Nationwide, Geico, or Unknown Carrier';
COMMENT ON COLUMN public.inbox_threads.insurance_claim_status IS 'Claim status: no_claim_filed, claim_filed_awaiting_adjuster, adjuster_visit_scheduled, under_review, approved, approved_acv_only, supplements_needed, denied';
COMMENT ON COLUMN public.inbox_threads.insurance_deductible_amount IS 'Extracted deductible amount in dollars (null if percentage-based or unknown)';
COMMENT ON COLUMN public.inbox_threads.insurance_deductible_type IS 'Deductible type: fixed (dollar amount), percentage (e.g., 2%), or unknown';
COMMENT ON COLUMN public.inbox_threads.insurance_deductible_percentage IS 'Deductible percentage (e.g., 2.0 for 2% deductible)';
COMMENT ON COLUMN public.inbox_threads.insurance_payout_type IS 'Payout type: RCV (Replacement Cost Value), ACV (Actual Cash Value), or unknown';
COMMENT ON COLUMN public.inbox_threads.insurance_depreciation_recoverable IS 'Whether recoverable depreciation is available';
COMMENT ON COLUMN public.inbox_threads.insurance_depreciation_amount IS 'Amount of recoverable depreciation';
COMMENT ON COLUMN public.inbox_threads.insurance_install_ready IS 'Whether homeowner is install-ready (claim approved, deductible known, scope included, asking for next steps)';
COMMENT ON COLUMN public.inbox_threads.insurance_next_action IS 'Recommended next action: call_immediately, send_follow_up, send_quote, wait_for_adjuster, prepare_supplement, none';
COMMENT ON COLUMN public.inbox_threads.insurance_analysis_metadata IS 'JSONB metadata from AI analysis (confidence scores, detected keywords, reasoning, etc.)';
COMMENT ON COLUMN public.inbox_threads.insurance_analyzed_at IS 'Timestamp when insurance analysis was last performed';
COMMENT ON COLUMN public.inbox_threads.insurance_last_updated_at IS 'Timestamp when insurance data was last updated';

-- ============================================================================
-- PART 3 — Function to Update Insurance Analysis Timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_insurance_analysis_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update insurance_last_updated_at when any insurance field changes
  IF (
    OLD.insurance_carrier IS DISTINCT FROM NEW.insurance_carrier OR
    OLD.insurance_claim_status IS DISTINCT FROM NEW.insurance_claim_status OR
    OLD.insurance_deductible_amount IS DISTINCT FROM NEW.insurance_deductible_amount OR
    OLD.insurance_payout_type IS DISTINCT FROM NEW.insurance_payout_type OR
    OLD.insurance_install_ready IS DISTINCT FROM NEW.insurance_install_ready OR
    OLD.insurance_next_action IS DISTINCT FROM NEW.insurance_next_action
  ) THEN
    NEW.insurance_last_updated_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_insurance_timestamp ON public.inbox_threads;
CREATE TRIGGER trg_update_insurance_timestamp
  BEFORE UPDATE ON public.inbox_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_insurance_analysis_timestamp();

-- ============================================================================
-- PART 4 — View for Install-Ready Leads (Revenue Priority View)
-- ============================================================================

CREATE OR REPLACE VIEW public.inbox_install_ready_leads AS
SELECT 
  t.id as thread_id,
  t.campaign_id,
  t.contact_id,
  t.insurance_carrier,
  t.insurance_claim_status,
  t.insurance_deductible_amount,
  t.insurance_payout_type,
  t.insurance_install_ready,
  t.insurance_next_action,
  t.thread_estimated_value,
  t.close_probability_score,
  t.last_message_at,
  t.insurance_analyzed_at
FROM public.inbox_threads t
WHERE t.insurance_install_ready = true
  AND t.insurance_claim_status IN ('approved', 'approved_acv_only')
ORDER BY t.insurance_analyzed_at DESC NULLS LAST, t.last_message_at DESC;

COMMENT ON VIEW public.inbox_install_ready_leads IS 'View of all install-ready leads (claim approved, deductible known, ready to book)';

-- ============================================================================
-- PART 5 — Function to Get Insurance Summary for Thread
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_insurance_summary(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'insurance_carrier', insurance_carrier,
    'claim_status', insurance_claim_status,
    'deductible', insurance_deductible_amount,
    'payout_type', insurance_payout_type,
    'depreciation_recoverable', insurance_depreciation_recoverable,
    'install_ready', insurance_install_ready,
    'next_action', insurance_next_action,
    'analyzed_at', insurance_analyzed_at
  )
  INTO v_result
  FROM public.inbox_threads
  WHERE id = p_thread_id;
  
  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_insurance_summary IS 'Returns the 7-tag insurance summary for a thread (matches spec output format)';

-- ============================================================================
-- PART 6 — Trigger to Auto-Analyze Insurance on Inbound Messages
-- ============================================================================

-- Function to trigger insurance analysis via Edge Function (fire-and-forget)
CREATE OR REPLACE FUNCTION public.trigger_insurance_analysis(p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supabase_url text;
  v_service_role_key text;
BEGIN
  -- Get Supabase URL and service role key from environment
  -- Note: In Supabase, these are available via current_setting() if configured
  -- For now, we'll use http_request extension or pg_net if available
  -- Otherwise, this will be handled by a database webhook or Edge Function trigger
  
  -- For now, we'll create a simple function that can be called by a trigger
  -- The actual HTTP call will be made by a separate Edge Function or webhook
  
  -- This function exists to be called by triggers
  -- The actual analysis will be triggered via pg_net or http extension if available
  -- Or via a separate scheduled worker that processes new messages
  
  RETURN;
END;
$$;

-- Trigger function that queues insurance analysis when inbound message arrives
CREATE OR REPLACE FUNCTION public.queue_insurance_analysis_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only process inbound messages
  IF NEW.direction = 'in' AND NEW.thread_id IS NOT NULL THEN
    -- Update thread's insurance_analyzed_at to NULL to mark as needing analysis
    -- A separate worker will pick this up and call the insurance-brain-v1 function
    UPDATE public.inbox_threads
    SET insurance_analyzed_at = NULL
    WHERE id = NEW.thread_id
      AND (insurance_analyzed_at IS NULL OR insurance_analyzed_at < NEW.received_at);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_insurance_analysis ON public.inbox_messages;
CREATE TRIGGER trg_queue_insurance_analysis
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  WHEN (NEW.direction = 'in')
  EXECUTE FUNCTION public.queue_insurance_analysis_on_message();

COMMENT ON FUNCTION public.queue_insurance_analysis_on_message IS 'Trigger that marks threads for insurance analysis when new inbound messages arrive';
COMMENT ON TRIGGER trg_queue_insurance_analysis ON public.inbox_messages IS 'Auto-queues insurance analysis for threads with new inbound messages';

