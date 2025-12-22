CREATE TABLE public.lead_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  event_type TEXT CHECK (
    event_type IN (
      'email_sent',
      'email_open',
      'email_click',
      'email_reply',
      'tag_added',
      'note_added'
    )
  ) NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_lead_timeline_lead ON public.lead_timeline_events(lead_id);
CREATE INDEX idx_lead_timeline_type ON public.lead_timeline_events(event_type);
CREATE INDEX idx_lead_timeline_created ON public.lead_timeline_events(created_at DESC);










