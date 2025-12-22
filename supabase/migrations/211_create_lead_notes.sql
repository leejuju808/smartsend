-- Block 206 — Lead Notes v1
-- Creates lead_notes table for CRM-grade notes on leads

CREATE TABLE IF NOT EXISTS public.lead_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON public.lead_notes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_user ON public.lead_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_lead_notes_created ON public.lead_notes(created_at DESC);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_lead_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lead_notes_updated_at ON public.lead_notes;
CREATE TRIGGER trg_lead_notes_updated_at
  BEFORE UPDATE ON public.lead_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_lead_notes_updated_at();










