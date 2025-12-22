-- Block 21412 — SmartSend Reply Intent Classifier v1
-- Extends reply_intents table to support email_id, user_id, lead_id
-- Adds support for all 6 intent types: hot, warm, schedule, followup, question, not_interested

-- 1) Create or alter reply_intents table with required fields
-- Using text with CHECK constraint for flexibility (avoids enum migration issues)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.reply_intents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id        uuid REFERENCES public.emails(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id         uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  intent          text CHECK (intent IN ('hot', 'warm', 'schedule', 'followup', 'question', 'not_interested')),
  confidence      double precision CHECK (confidence >= 0 AND confidence <= 1),
  classified_at   timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Add columns if table already exists
ALTER TABLE public.reply_intents
  ADD COLUMN IF NOT EXISTS email_id uuid REFERENCES public.emails(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS intent text,
  ADD COLUMN IF NOT EXISTS confidence double precision,
  ADD COLUMN IF NOT EXISTS classified_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- If intent column exists as enum type, convert it to text
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'reply_intents' 
    AND column_name = 'intent'
    AND data_type = 'USER-DEFINED'
  ) THEN
    -- Convert enum to text
    ALTER TABLE public.reply_intents 
      ALTER COLUMN intent TYPE text USING intent::text;
  END IF;
END;
$$;

-- Add CHECK constraint for intent values (safety)
-- ---------------------------------------------------------
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'reply_intents_intent_check'
  ) THEN
    ALTER TABLE public.reply_intents DROP CONSTRAINT reply_intents_intent_check;
  END IF;
END;
$$;

ALTER TABLE public.reply_intents
  ADD CONSTRAINT reply_intents_intent_check
  CHECK (intent IN (
    'hot',
    'warm',
    'schedule',
    'followup',
    'question',
    'not_interested'
  ));

-- Add CHECK constraint for confidence
ALTER TABLE public.reply_intents
  DROP CONSTRAINT IF EXISTS reply_intents_confidence_check;

ALTER TABLE public.reply_intents
  ADD CONSTRAINT reply_intents_confidence_check
  CHECK (confidence >= 0 AND confidence <= 1);

-- 3) Create indexes for efficient lookups
-- ---------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_reply_intents_email_id 
  ON public.reply_intents (email_id);

CREATE INDEX IF NOT EXISTS idx_reply_intents_user_id 
  ON public.reply_intents (user_id);

CREATE INDEX IF NOT EXISTS idx_reply_intents_lead_id 
  ON public.reply_intents (lead_id);

CREATE INDEX IF NOT EXISTS idx_reply_intents_intent 
  ON public.reply_intents (intent);

CREATE INDEX IF NOT EXISTS idx_reply_intents_classified_at 
  ON public.reply_intents (classified_at DESC);

-- 4) Enable RLS
-- ---------------------------------------------------------
ALTER TABLE public.reply_intents ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see reply_intents for their own emails
DROP POLICY IF EXISTS "Users can view their own reply intents" ON public.reply_intents;
CREATE POLICY "Users can view their own reply intents" ON public.reply_intents
  FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM public.emails e
      WHERE e.id = reply_intents.email_id
      AND e.user_id = auth.uid()
    )
  );

-- RLS Policy: Service role can manage all reply_intents
DROP POLICY IF EXISTS "Service role can manage reply_intents" ON public.reply_intents;
CREATE POLICY "Service role can manage reply_intents" ON public.reply_intents
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

