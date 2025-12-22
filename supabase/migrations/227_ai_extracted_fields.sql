-- Block 216 — Reply Inbox Smart Actions v1
-- AI-extracted fields from prospect replies

CREATE TABLE IF NOT EXISTS public.ai_extracted_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES public.reply_threads(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  meeting_times jsonb,
  phone text,
  linkedin text,
  website text,
  signature jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_fields_thread ON public.ai_extracted_fields(thread_id);
CREATE INDEX IF NOT EXISTS idx_ai_fields_lead ON public.ai_extracted_fields(lead_id);

-- RLS
ALTER TABLE public.ai_extracted_fields ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read extracted fields for threads they have access to
CREATE POLICY "ai_extracted_fields_read" ON public.ai_extracted_fields
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.reply_threads rt
      JOIN public.accounts a ON a.id = rt.account_id
      WHERE rt.id = ai_extracted_fields.thread_id
      AND EXISTS (
        SELECT 1 FROM public.org_memberships om
        WHERE om.org_id = a.org_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
      )
    )
  );

-- Policy: Service role can insert/update/delete (for automated events)
CREATE POLICY "ai_extracted_fields_service_role" ON public.ai_extracted_fields
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.ai_extracted_fields IS 'Structured fields extracted from prospect replies using AI';
COMMENT ON COLUMN public.ai_extracted_fields.meeting_times IS 'Array of proposed date/times in ISO format';
COMMENT ON COLUMN public.ai_extracted_fields.signature IS 'Extracted signature block as JSON';










