-- Block 21405 — SmartSend Auto-Task Generator from Emails v1
-- Creates reply_intents table and enables automatic task generation from email replies

-- Create reply_intents table to store intent classification output
CREATE TABLE IF NOT EXISTS public.reply_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id uuid NOT NULL REFERENCES public.emails(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  intent text NOT NULL CHECK (intent IN ('hot', 'warm', 'followup', 'not_interested', 'question', 'schedule')),
  confidence numeric CHECK (confidence >= 0 AND confidence <= 1),
  created_at timestamptz DEFAULT now()
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_reply_intents_email_id ON public.reply_intents(email_id);
CREATE INDEX IF NOT EXISTS idx_reply_intents_user_id ON public.reply_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_reply_intents_intent ON public.reply_intents(intent);
CREATE INDEX IF NOT EXISTS idx_reply_intents_created_at ON public.reply_intents(created_at DESC);

-- Enable RLS
ALTER TABLE public.reply_intents ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only see their own reply intents
CREATE POLICY "reply_intents_select_own"
ON public.reply_intents FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "reply_intents_insert_own"
ON public.reply_intents FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Service role can manage all reply intents (for Edge Functions)
CREATE POLICY "reply_intents_service_role_all"
ON public.reply_intents FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Ensure tasks table has priority and due_date columns if they don't exist
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;

-- Create index on tasks priority for efficient filtering
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON public.tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_lead_id ON public.tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date);














































