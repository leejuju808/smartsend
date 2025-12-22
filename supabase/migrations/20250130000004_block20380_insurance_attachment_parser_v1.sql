-- =========================================================
-- Block 20380 — Insurance Attachment Parser v1
-- (PDF Scope Reader + Line-Item Extractor + ACV/RCV Calculator)
-- =========================================================
--
-- This block reads PDF attachments (estimates, scopes of loss, letters) and extracts:
-- - Document type classification
-- - Financial data (ACV, RCV, deductible, depreciation)
-- - Roof scope details (squares, material, line items)
-- - Profitability signals (O&P, missing items, supplement opportunities)
--
-- This is the muscle behind Block 20360 (Insurance Brain).
-- =========================================================

-- ============================================================================
-- PART 1 — Create insurance_attachments_raw table (for debugging)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insurance_attachments_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id uuid NOT NULL REFERENCES public.email_attachments(id) ON DELETE CASCADE,
  email_id uuid, -- Can reference email_messages or inbox_messages depending on schema
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Raw extracted text
  raw_text text NOT NULL,
  
  -- Extraction metadata
  extraction_method text DEFAULT 'pdf_parse', -- 'pdf_parse', 'ocr', 'manual'
  extraction_confidence numeric(3,2) CHECK (extraction_confidence >= 0.0 AND extraction_confidence <= 1.0),
  extraction_errors text[],
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_attachments_raw_attachment ON public.insurance_attachments_raw(attachment_id);
CREATE INDEX IF NOT EXISTS idx_insurance_attachments_raw_thread ON public.insurance_attachments_raw(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insurance_attachments_raw_lead ON public.insurance_attachments_raw(lead_id) WHERE lead_id IS NOT NULL;

COMMENT ON TABLE public.insurance_attachments_raw IS 'Raw extracted text from insurance PDF attachments for debugging and reprocessing';

-- ============================================================================
-- PART 2 — Create insurance_attachments table (parsed data)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insurance_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id uuid NOT NULL REFERENCES public.email_attachments(id) ON DELETE CASCADE,
  email_id uuid, -- Can reference email_messages or inbox_messages depending on schema
  thread_id uuid REFERENCES public.inbox_threads(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Document classification
  doc_type text NOT NULL CHECK (doc_type IN (
    'ESTIMATE_SCOPE',
    'APPROVAL_LETTER',
    'DENIAL_LETTER',
    'POLICY_DECLARATIONS',
    'GENERAL_CORRESPONDENCE',
    'OTHER'
  )),
  doc_type_confidence numeric(3,2) CHECK (doc_type_confidence >= 0.0 AND doc_type_confidence <= 1.0),
  
  -- Parsed payload (JSONB with all extracted data)
  parsed_payload jsonb DEFAULT '{}'::jsonb,
  
  -- Processing status
  processing_status text DEFAULT 'pending' CHECK (processing_status IN (
    'pending',
    'processing',
    'completed',
    'failed',
    'needs_review'
  )),
  processing_errors text[],
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_attachments_attachment ON public.insurance_attachments(attachment_id);
CREATE INDEX IF NOT EXISTS idx_insurance_attachments_thread ON public.insurance_attachments(thread_id) WHERE thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insurance_attachments_lead ON public.insurance_attachments(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_insurance_attachments_doc_type ON public.insurance_attachments(doc_type);
CREATE INDEX IF NOT EXISTS idx_insurance_attachments_status ON public.insurance_attachments(processing_status);
CREATE INDEX IF NOT EXISTS idx_insurance_attachments_parsed_payload ON public.insurance_attachments USING GIN(parsed_payload);

COMMENT ON TABLE public.insurance_attachments IS 'Parsed insurance attachment data with extracted financials, roof scope, and profitability signals';
COMMENT ON COLUMN public.insurance_attachments.doc_type IS 'Document type: ESTIMATE_SCOPE, APPROVAL_LETTER, DENIAL_LETTER, POLICY_DECLARATIONS, GENERAL_CORRESPONDENCE, OTHER';
COMMENT ON COLUMN public.insurance_attachments.parsed_payload IS 'JSONB containing claim_financials, roof_scope, profitability_signals';

-- ============================================================================
-- PART 3 — Extend inbox_threads with parsed scope fields
-- ============================================================================

ALTER TABLE IF EXISTS public.inbox_threads
  -- Link to parsed attachment data
  ADD COLUMN IF NOT EXISTS has_parsed_scope boolean DEFAULT false,
  
  -- Claim financials from attachments (overrides or supplements email analysis)
  ADD COLUMN IF NOT EXISTS claim_financials jsonb DEFAULT '{}'::jsonb,
  
  -- Roof scope details
  ADD COLUMN IF NOT EXISTS roof_scope jsonb DEFAULT '{}'::jsonb,
  
  -- Profitability signals
  ADD COLUMN IF NOT EXISTS profitability_signals jsonb DEFAULT '{}'::jsonb,
  
  -- Review flag if data conflicts or needs manual review
  ADD COLUMN IF NOT EXISTS insurance_needs_review boolean DEFAULT false;

-- Indexes for parsed scope queries
CREATE INDEX IF NOT EXISTS idx_threads_has_parsed_scope ON public.inbox_threads(has_parsed_scope) WHERE has_parsed_scope = true;
CREATE INDEX IF NOT EXISTS idx_threads_claim_financials ON public.inbox_threads USING GIN(claim_financials) WHERE claim_financials != '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_threads_roof_scope ON public.inbox_threads USING GIN(roof_scope) WHERE roof_scope != '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_threads_insurance_needs_review ON public.inbox_threads(insurance_needs_review) WHERE insurance_needs_review = true;

COMMENT ON COLUMN public.inbox_threads.has_parsed_scope IS 'Whether PDF attachments have been parsed for scope and financial data';
COMMENT ON COLUMN public.inbox_threads.claim_financials IS 'JSONB: {rcv_total, acv_total, deductible, depreciation_total, depreciation_recoverable, net_claim_now}';
COMMENT ON COLUMN public.inbox_threads.roof_scope IS 'JSONB: {material, total_squares, waste_percent, stories, steep_charge, line_items[]}';
COMMENT ON COLUMN public.inbox_threads.profitability_signals IS 'JSONB: {o_and_p_included, code_items_included[], missing_items[], supplement_opportunity}';
COMMENT ON COLUMN public.inbox_threads.insurance_needs_review IS 'Flag if parsed data conflicts with email analysis or needs manual review';

-- ============================================================================
-- PART 4 — Update timestamp trigger for insurance_attachments
-- ============================================================================

CREATE OR REPLACE FUNCTION public.update_insurance_attachment_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_insurance_attachment_timestamp ON public.insurance_attachments;
CREATE TRIGGER trg_update_insurance_attachment_timestamp
  BEFORE UPDATE ON public.insurance_attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_insurance_attachment_timestamp();

DROP TRIGGER IF EXISTS trg_update_insurance_attachment_raw_timestamp ON public.insurance_attachments_raw;
CREATE TRIGGER trg_update_insurance_attachment_raw_timestamp
  BEFORE UPDATE ON public.insurance_attachments_raw
  FOR EACH ROW
  EXECUTE FUNCTION public.update_insurance_attachment_timestamp();

-- ============================================================================
-- PART 5 — Function to get insurance attachment summary for thread
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_insurance_attachment_summary(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_result jsonb;
  v_attachments jsonb;
BEGIN
  -- Get all parsed attachments for this thread
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', ia.id,
      'doc_type', ia.doc_type,
      'parsed_payload', ia.parsed_payload,
      'processing_status', ia.processing_status,
      'created_at', ia.created_at
    )
  ), '[]'::jsonb)
  INTO v_attachments
  FROM public.insurance_attachments ia
  WHERE ia.thread_id = p_thread_id
    AND ia.processing_status = 'completed';
  
  -- Get thread-level summary
  SELECT jsonb_build_object(
    'has_parsed_scope', has_parsed_scope,
    'claim_financials', claim_financials,
    'roof_scope', roof_scope,
    'profitability_signals', profitability_signals,
    'needs_review', insurance_needs_review,
    'attachments', v_attachments
  )
  INTO v_result
  FROM public.inbox_threads
  WHERE id = p_thread_id;
  
  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_insurance_attachment_summary IS 'Returns parsed attachment summary for a thread including financials, roof scope, and profitability signals';

-- ============================================================================
-- PART 6 — RLS Policies
-- ============================================================================

ALTER TABLE public.insurance_attachments_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_attachments ENABLE ROW LEVEL SECURITY;

-- Users can view attachments in their workspace/campaign
CREATE POLICY "Users can view insurance attachments in their workspace"
  ON public.insurance_attachments FOR SELECT
  USING (
    thread_id IN (
      SELECT id FROM public.inbox_threads 
      WHERE campaign_id IN (
        SELECT campaign_id FROM public.campaigns WHERE owner_id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can view insurance attachments raw in their workspace"
  ON public.insurance_attachments_raw FOR SELECT
  USING (
    thread_id IN (
      SELECT id FROM public.inbox_threads 
      WHERE campaign_id IN (
        SELECT campaign_id FROM public.campaigns WHERE owner_id = auth.uid()
      )
    )
  );

-- Service role can do everything
CREATE POLICY "Service role full access insurance attachments"
  ON public.insurance_attachments
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access insurance attachments raw"
  ON public.insurance_attachments_raw
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- PART 7 — Trigger to queue attachment processing
-- ============================================================================

-- Ensure pg_net extension is available for HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function to trigger attachment parser when PDF is attached to claim-related email
CREATE OR REPLACE FUNCTION public.queue_insurance_attachment_processing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_thread_id uuid;
  v_lead_id uuid;
  v_is_insurance_claim boolean;
  v_insurance_attachment_id uuid;
  v_edge_url text;
BEGIN
  -- Get thread_id and lead_id from the attachment's message
  -- This assumes email_attachments.message_id references inbox_messages or email_messages
  SELECT 
    COALESCE(im.thread_id, em.thread_id),
    COALESCE(im.lead_id, em.lead_id)
  INTO v_thread_id, v_lead_id
  FROM public.email_attachments ea
  LEFT JOIN public.inbox_messages im ON ea.message_id = im.id
  LEFT JOIN public.email_messages em ON ea.message_id = em.id
  WHERE ea.id = NEW.id;
  
  -- Check if this is an insurance-related thread
  IF v_thread_id IS NOT NULL THEN
    SELECT 
      insurance_carrier IS NOT NULL 
      OR insurance_claim_status IS NOT NULL
      OR insurance_install_ready = true
    INTO v_is_insurance_claim
    FROM public.inbox_threads
    WHERE id = v_thread_id;
    
    -- If PDF attachment and insurance-related, mark for processing
    IF NEW.content_type = 'application/pdf' AND (v_is_insurance_claim OR v_is_insurance_claim IS NULL) THEN
      -- Insert into insurance_attachments with pending status
      INSERT INTO public.insurance_attachments (
        attachment_id,
        thread_id,
        lead_id,
        doc_type,
        processing_status
      ) VALUES (
        NEW.id,
        v_thread_id,
        v_lead_id,
        'OTHER', -- Will be classified during processing
        'pending'
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_insurance_attachment_id;
      
      -- If insert succeeded, trigger edge function to process
      IF v_insurance_attachment_id IS NOT NULL THEN
        -- Get edge function base URL
        v_edge_url := COALESCE(
          current_setting('app.settings.edge_base_url', true),
          current_setting('app.supabase_url', true),
          'https://' || current_setting('app.project_ref', true) || '.supabase.co'
        ) || '/functions/v1/insurance-attachment-parser-v1';
        
        -- Call edge function (fire and forget)
        IF v_edge_url IS NOT NULL AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
          PERFORM net.http_post(
            url := v_edge_url,
            body := json_build_object(
              'attachment_id', NEW.id::text
            )::text,
            headers := json_build_object(
              'Content-Type', 'application/json',
              'Authorization', 'Bearer ' || COALESCE(
                current_setting('app.supabase_service_role_key', true),
                current_setting('app.service_role_key', true)
              )
            )::text
          );
        END IF;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the insert
    RAISE WARNING 'Failed to queue insurance attachment processing: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_insurance_attachment_processing ON public.email_attachments;
CREATE TRIGGER trg_queue_insurance_attachment_processing
  AFTER INSERT ON public.email_attachments
  FOR EACH ROW
  WHEN (NEW.content_type = 'application/pdf')
  EXECUTE FUNCTION public.queue_insurance_attachment_processing();

COMMENT ON FUNCTION public.queue_insurance_attachment_processing IS 'Trigger that queues PDF attachments for insurance parsing when attached to claim-related emails and calls edge function';
COMMENT ON TRIGGER trg_queue_insurance_attachment_processing ON public.email_attachments IS 'Auto-queues PDF attachments for insurance parsing and triggers processing';

