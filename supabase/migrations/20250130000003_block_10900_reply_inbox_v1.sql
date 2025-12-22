-- =========================================================
-- Block 10900 — SmartSend Roofing Reply Inbox v1
-- (The Contractor-Proof Inbox That Shows Only Money Replies)
-- =========================================================

-- 1. Ensure reply_threads table has latest_intent column
-- This column stores the intent classification: HOT, WARM, FOLLOW_UP, NOT_INTERESTED
DO $$
BEGIN
  -- Add latest_intent column if it doesn't exist
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'reply_threads'
  ) THEN
    -- Add latest_intent column with proper check constraint
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'reply_threads' 
      AND column_name = 'latest_intent'
    ) THEN
      ALTER TABLE public.reply_threads
        ADD COLUMN latest_intent text CHECK (latest_intent IN ('hot', 'warm', 'follow_up', 'not_interested', 'unclassified'));
    END IF;

    -- Update check constraint if column exists but constraint is different
    DO $$
    BEGIN
      -- Drop old constraint if exists
      ALTER TABLE public.reply_threads DROP CONSTRAINT IF EXISTS reply_threads_latest_intent_check;
      -- Add new constraint
      ALTER TABLE public.reply_threads 
        ADD CONSTRAINT reply_threads_latest_intent_check 
        CHECK (latest_intent IN ('hot', 'warm', 'follow_up', 'not_interested', 'unclassified') OR latest_intent IS NULL);
    END $$;
  END IF;
END $$;

-- 2. Ensure lead_intents table exists (for storing AI classifications)
CREATE TABLE IF NOT EXISTS public.lead_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  account_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id uuid NOT NULL,
  thread_id uuid REFERENCES public.reply_threads(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  classification text NOT NULL CHECK (classification IN ('hot', 'warm', 'follow_up', 'not_interested', 'unclassified')),
  confidence numeric(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE(message_id)
);

-- Indexes for lead_intents
CREATE INDEX IF NOT EXISTS idx_lead_intents_workspace 
  ON public.lead_intents(workspace_id) 
  WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_intents_account 
  ON public.lead_intents(account_id) 
  WHERE account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_intents_thread 
  ON public.lead_intents(thread_id) 
  WHERE thread_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_intents_classification 
  ON public.lead_intents(classification);

CREATE INDEX IF NOT EXISTS idx_lead_intents_lead 
  ON public.lead_intents(lead_id) 
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_intents_created_at 
  ON public.lead_intents(created_at DESC);

-- 3. Ensure reply_threads has snippet column for preview
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'reply_threads'
  ) THEN
    ALTER TABLE public.reply_threads
      ADD COLUMN IF NOT EXISTS snippet text;
  END IF;
END $$;

-- 4. Create view for inbox summary (threads with latest message info)
CREATE OR REPLACE VIEW public.reply_inbox_summary AS
SELECT 
  rt.id,
  rt.workspace_id,
  rt.account_id,
  rt.lead_id,
  rt.campaign_id,
  rt.latest_intent,
  rt.status,
  rt.last_message_at,
  rt.snippet,
  rt.unread_count,
  rt.created_at,
  l.email as lead_email,
  l.name as lead_name,
  l.first_name as lead_first_name,
  l.last_name as lead_last_name,
  c.name as campaign_name
FROM public.reply_threads rt
LEFT JOIN public.leads l ON rt.lead_id = l.id
LEFT JOIN public.campaigns c ON rt.campaign_id = c.id
WHERE rt.status != 'archived' OR rt.status IS NULL;

-- 5. Enable RLS on lead_intents
ALTER TABLE public.lead_intents ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can read lead intents for their workspaces/accounts
CREATE POLICY "Users can read lead intents"
ON public.lead_intents
FOR SELECT
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
  OR account_id = auth.uid()
);

-- RLS Policy: Users can insert lead intents
CREATE POLICY "Users can insert lead intents"
ON public.lead_intents
FOR INSERT
WITH CHECK (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
  OR account_id = auth.uid()
);

-- RLS Policy: Users can update lead intents
CREATE POLICY "Users can update lead intents"
ON public.lead_intents
FOR UPDATE
USING (
  workspace_id IN (
    SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
  )
  OR account_id = auth.uid()
);

-- 6. Function to update thread latest_intent when lead_intent is created/updated
CREATE OR REPLACE FUNCTION public.update_thread_intent()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update the thread's latest_intent when a new intent is created
  IF NEW.thread_id IS NOT NULL THEN
    UPDATE public.reply_threads
    SET latest_intent = NEW.classification,
        updated_at = now()
    WHERE id = NEW.thread_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to update thread intent
DROP TRIGGER IF EXISTS trg_update_thread_intent ON public.lead_intents;
CREATE TRIGGER trg_update_thread_intent
AFTER INSERT OR UPDATE ON public.lead_intents
FOR EACH ROW
EXECUTE FUNCTION public.update_thread_intent();

-- 7. Comments
COMMENT ON COLUMN public.reply_threads.latest_intent IS 'Intent classification: hot, warm, follow_up, not_interested, unclassified';
COMMENT ON TABLE public.lead_intents IS 'Stores AI classifications for homeowner replies';
COMMENT ON VIEW public.reply_inbox_summary IS 'Summary view of reply threads with lead and campaign info for inbox display';























































