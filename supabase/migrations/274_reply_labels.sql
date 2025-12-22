-- Block 259 — Smart Reply Classification v2
-- Multi-Label Tagging, Confidence Scores, Edge-Case Buckets, Training Signals

-- 1. Create reply_labels table for storing multi-label classifications
CREATE TABLE IF NOT EXISTS public.reply_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES public.reply_threads(id) ON DELETE CASCADE,
  message_id uuid,  -- References messages(id) but may not exist in all schemas
  label text NOT NULL,          -- e.g. "interested", "meeting_intent", "time_proposed", "unsubscribe"
  confidence numeric CHECK (confidence >= 0 AND confidence <= 1), -- 0 to 1
  metadata jsonb DEFAULT '{}'::jsonb,  -- extracted time, objection type, etc.
  created_at timestamptz DEFAULT now()
);

-- Add foreign key constraint if messages table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'messages') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'reply_labels_message_id_fkey'
    ) THEN
      ALTER TABLE public.reply_labels
      ADD CONSTRAINT reply_labels_message_id_fkey
      FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE CASCADE;
    END IF;
  END IF;
END$$;

-- Indexes for reply_labels
CREATE INDEX IF NOT EXISTS idx_reply_labels_thread ON public.reply_labels(thread_id);
CREATE INDEX IF NOT EXISTS idx_reply_labels_message ON public.reply_labels(message_id);
CREATE INDEX IF NOT EXISTS idx_reply_labels_label ON public.reply_labels(label);
CREATE INDEX IF NOT EXISTS idx_reply_labels_created ON public.reply_labels(created_at DESC);

-- 2. Create training_samples table for future Block 320 (Adaptive Reply Brain)
CREATE TABLE IF NOT EXISTS public.training_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid REFERENCES public.reply_threads(id) ON DELETE SET NULL,
  message_id uuid,  -- References messages(id) but may not exist in all schemas
  raw_text text NOT NULL,
  labels jsonb NOT NULL DEFAULT '[]'::jsonb,  -- Array of {label, confidence, metadata}
  created_at timestamptz DEFAULT now()
);

-- Add foreign key constraint if messages table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'messages') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE constraint_name = 'training_samples_message_id_fkey'
    ) THEN
      ALTER TABLE public.training_samples
      ADD CONSTRAINT training_samples_message_id_fkey
      FOREIGN KEY (message_id) REFERENCES public.messages(id) ON DELETE SET NULL;
    END IF;
  END IF;
END$$;

-- Indexes for training_samples
CREATE INDEX IF NOT EXISTS idx_training_samples_thread ON public.training_samples(thread_id);
CREATE INDEX IF NOT EXISTS idx_training_samples_message ON public.training_samples(message_id);
CREATE INDEX IF NOT EXISTS idx_training_samples_created ON public.training_samples(created_at DESC);

-- 3. Add new columns to reply_threads table
ALTER TABLE public.reply_threads
ADD COLUMN IF NOT EXISTS labels jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS intent_secondary jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS model_confidence numeric DEFAULT 0.0 CHECK (model_confidence >= 0 AND model_confidence <= 1);

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_reply_threads_labels ON public.reply_threads USING GIN (labels);
CREATE INDEX IF NOT EXISTS idx_reply_threads_model_confidence ON public.reply_threads(model_confidence DESC);

-- Comments
COMMENT ON TABLE public.reply_labels IS 'Multi-label classifications for reply messages with confidence scores';
COMMENT ON COLUMN public.reply_labels.label IS 'Label name: meeting_intent, interested, not_interested, pricing_interest, objection_budget, etc.';
COMMENT ON COLUMN public.reply_labels.confidence IS 'Confidence score from 0 to 1';
COMMENT ON COLUMN public.reply_labels.metadata IS 'Extracted data like datetime for time_proposed, objection type, etc.';

COMMENT ON TABLE public.training_samples IS 'Training data for future Block 320 (Adaptive Reply Brain) fine-tuning';
COMMENT ON COLUMN public.training_samples.labels IS 'Array of label objects with confidence scores for training';

COMMENT ON COLUMN public.reply_threads.labels IS 'Array of label strings (e.g. ["meeting_intent", "pricing_interest"])';
COMMENT ON COLUMN public.reply_threads.intent_secondary IS 'Supportive labels like pricing_interest or objection_budget';
COMMENT ON COLUMN public.reply_threads.model_confidence IS 'Maximum confidence score across all labels';

-- RLS for reply_labels
ALTER TABLE public.reply_labels ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can read reply_labels for threads they have access to
CREATE POLICY "reply_labels_select" ON public.reply_labels
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.reply_threads rt
      WHERE rt.id = reply_labels.thread_id
      AND rt.account_id = auth.uid()
    )
  );

-- RLS for training_samples (service role only for now)
ALTER TABLE public.training_samples ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can read training_samples for their account
CREATE POLICY "training_samples_select" ON public.training_samples
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.reply_threads rt
      WHERE rt.id = training_samples.thread_id
      AND rt.account_id = auth.uid()
    )
  );

