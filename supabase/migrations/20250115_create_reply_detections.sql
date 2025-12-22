-- Create reply_detections table for AI reply detection analytics
CREATE TABLE IF NOT EXISTS public.reply_detections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  email_body TEXT NOT NULL,
  ai_classification TEXT NOT NULL CHECK (ai_classification IN ('YES', 'NO')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reply_detections_lead_id ON public.reply_detections(lead_id);
CREATE INDEX IF NOT EXISTS idx_reply_detections_detected_at ON public.reply_detections(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_reply_detections_classification ON public.reply_detections(ai_classification);

-- Add replied_at column to leads table if it doesn't exist
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ DEFAULT NOW();

-- Create index for replied_at queries
CREATE INDEX IF NOT EXISTS idx_leads_replied_at ON public.leads(replied_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_status_replied_at ON public.leads(status, replied_at DESC);