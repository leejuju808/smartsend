-- Block 283 — Inbox Command Bar v1
-- Thread-level command bar for quick actions: qualify, deal, meeting, label, snooze, assign, note, task

-- A) Add qualification_status to leads table
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS qualification_status text CHECK (qualification_status IN ('hot', 'warm', 'cold', 'not_fit'));

CREATE INDEX IF NOT EXISTS idx_leads_qualification_status ON public.leads(qualification_status) WHERE qualification_status IS NOT NULL;

-- B) Add manual_labels and snoozed_until to reply_threads table
ALTER TABLE public.reply_threads
ADD COLUMN IF NOT EXISTS manual_labels text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS snoozed_until timestamptz;

CREATE INDEX IF NOT EXISTS idx_reply_threads_manual_labels ON public.reply_threads USING GIN(manual_labels);
CREATE INDEX IF NOT EXISTS idx_reply_threads_snoozed_until ON public.reply_threads(snoozed_until) WHERE snoozed_until IS NOT NULL;

-- C) Ensure deals table has thread_id column for linking
ALTER TABLE public.deals
ADD COLUMN IF NOT EXISTS thread_id uuid REFERENCES public.reply_threads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deals_thread ON public.deals(thread_id) WHERE thread_id IS NOT NULL;

-- D) Helper function to bump lead score based on qualification
CREATE OR REPLACE FUNCTION public.bump_lead_score_from_qualification(
  p_lead_id uuid,
  p_qualification_status text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_score_bump int;
BEGIN
  -- Determine score bump based on qualification
  CASE p_qualification_status
    WHEN 'hot' THEN
      v_score_bump := 30;
    WHEN 'warm' THEN
      v_score_bump := 15;
    WHEN 'cold' THEN
      v_score_bump := -10;
    WHEN 'not_fit' THEN
      v_score_bump := -30;
    ELSE
      v_score_bump := 0;
  END CASE;

  -- Update lead score (clamp between 0 and 100)
  UPDATE public.leads
  SET score = GREATEST(0, LEAST(100, COALESCE(score, 0) + v_score_bump)),
      qualification_status = p_qualification_status,
      updated_at = now()
  WHERE id = p_lead_id;
END;
$$;

COMMENT ON FUNCTION public.bump_lead_score_from_qualification IS 'Updates lead score and qualification_status based on qualification action';

-- E) Helper function to get thread context for command bar
CREATE OR REPLACE FUNCTION public.get_thread_context(p_thread_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_context jsonb;
BEGIN
  SELECT jsonb_build_object(
    'thread', row_to_json(t.*),
    'lead', row_to_json(l.*),
    'deal', (SELECT row_to_json(d.*) FROM public.deals d WHERE d.thread_id = p_thread_id OR d.lead_id = t.lead_id LIMIT 1),
    'meeting', (SELECT row_to_json(m.*) FROM public.meetings m WHERE m.thread_id = p_thread_id LIMIT 1),
    'company', (SELECT row_to_json(c.*) FROM public.companies c WHERE c.id = l.company_id LIMIT 1)
  )
  INTO v_context
  FROM public.reply_threads t
  JOIN public.leads l ON l.id = t.lead_id
  WHERE t.id = p_thread_id;

  RETURN COALESCE(v_context, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_thread_context IS 'Returns thread context including lead, deal, meeting, and company for command bar';








