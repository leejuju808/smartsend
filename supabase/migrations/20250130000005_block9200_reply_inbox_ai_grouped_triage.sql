-- Block 9200 — Reply Inbox (AI-Grouped Lead Triage)
-- Creates reply_threads table and extends existing schema for unified inbox

-- 1. Ensure reply_threads table exists with required fields
-- Extend existing reply_threads table from block_198 if it exists
DO $$
BEGIN
  -- Add columns if they don't exist
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reply_threads') THEN
    -- Add new columns to existing table
    ALTER TABLE public.reply_threads
      ADD COLUMN IF NOT EXISTS thread_key text,
      ADD COLUMN IF NOT EXISTS latest_message_id uuid,
      ADD COLUMN IF NOT EXISTS latest_intent text CHECK (latest_intent IN ('hot', 'warm', 'follow_up', 'not_interested', 'unclassified')),
      ADD COLUMN IF NOT EXISTS status text CHECK (status IN ('open', 'snoozed', 'closed', 'archived')) DEFAULT 'open',
      ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
  ELSE
    -- Create table if it doesn't exist
    CREATE TABLE public.reply_threads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
      contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
      lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
      campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
      thread_key text NOT NULL,
      latest_message_id uuid,
      latest_intent text CHECK (latest_intent IN ('hot', 'warm', 'follow_up', 'not_interested', 'unclassified')),
      status text NOT NULL CHECK (status IN ('open', 'snoozed', 'closed', 'archived')) DEFAULT 'open',
      assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
      unread boolean NOT NULL DEFAULT true,
      last_activity_at timestamptz NOT NULL DEFAULT now(),
      subject text,
      last_direction text CHECK (last_direction IN ('inbound', 'outbound')),
      ai_label text,
      is_archived boolean NOT NULL DEFAULT false,
      created_at timestamptz DEFAULT now()
    );
  END IF;
END $$;

-- 2. Create unique index on thread_key per workspace
CREATE UNIQUE INDEX IF NOT EXISTS reply_threads_workspace_thread_key_idx
  ON public.reply_threads(workspace_id, thread_key);

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS reply_threads_workspace_status_idx
  ON public.reply_threads(workspace_id, status, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS reply_threads_workspace_intent_idx
  ON public.reply_threads(workspace_id, latest_intent, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS reply_threads_assigned_to_idx
  ON public.reply_threads(assigned_to) WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS reply_threads_campaign_id_idx
  ON public.reply_threads(campaign_id) WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reply_threads_contact_id_idx
  ON public.reply_threads(contact_id) WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reply_threads_unread_idx
  ON public.reply_threads(workspace_id, unread, last_activity_at DESC) WHERE unread = true;

-- 4. Create or update message_intents table (from Block 8340)
CREATE TABLE IF NOT EXISTS public.message_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL,
  intent text NOT NULL CHECK (intent IN ('hot', 'warm', 'follow_up', 'not_interested', 'other')),
  confidence numeric CHECK (confidence BETWEEN 0 AND 1),
  raw jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS message_intents_message_id_idx
  ON public.message_intents(message_id);

CREATE INDEX IF NOT EXISTS message_intents_intent_idx
  ON public.message_intents(intent);

-- 5. Create function to sync latest_intent from message_intents
CREATE OR REPLACE FUNCTION public.sync_reply_thread_intent()
RETURNS TRIGGER AS $$
BEGIN
  -- Update reply_threads with latest intent from message_intents
  UPDATE public.reply_threads rt
  SET latest_intent = (
    SELECT mi.intent
    FROM public.message_intents mi
    WHERE mi.message_id = rt.latest_message_id
    ORDER BY mi.created_at DESC
    LIMIT 1
  )
  WHERE rt.latest_message_id = NEW.message_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update thread intent when message_intents change
DROP TRIGGER IF EXISTS trg_sync_reply_thread_intent ON public.message_intents;
CREATE TRIGGER trg_sync_reply_thread_intent
  AFTER INSERT OR UPDATE ON public.message_intents
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_reply_thread_intent();

-- 6. Create function to upsert reply_threads when new messages arrive
CREATE OR REPLACE FUNCTION public.upsert_reply_thread(
  p_workspace_id uuid,
  p_thread_key text,
  p_contact_id uuid,
  p_lead_id uuid,
  p_campaign_id uuid,
  p_latest_message_id uuid,
  p_latest_intent text DEFAULT NULL,
  p_subject text DEFAULT NULL,
  p_last_direction text DEFAULT 'inbound'
)
RETURNS uuid AS $$
DECLARE
  v_thread_id uuid;
BEGIN
  -- Upsert thread
  INSERT INTO public.reply_threads (
    workspace_id,
    thread_key,
    contact_id,
    lead_id,
    campaign_id,
    latest_message_id,
    latest_intent,
    subject,
    last_direction,
    last_activity_at,
    unread
  )
  VALUES (
    p_workspace_id,
    p_thread_key,
    p_contact_id,
    p_lead_id,
    p_campaign_id,
    p_latest_message_id,
    COALESCE(p_latest_intent, 'unclassified'),
    p_subject,
    p_last_direction,
    now(),
    true
  )
  ON CONFLICT (workspace_id, thread_key)
  DO UPDATE SET
    latest_message_id = EXCLUDED.latest_message_id,
    latest_intent = COALESCE(EXCLUDED.latest_intent, reply_threads.latest_intent),
    subject = COALESCE(EXCLUDED.subject, reply_threads.subject),
    last_direction = EXCLUDED.last_direction,
    last_activity_at = now(),
    unread = true,
    contact_id = COALESCE(EXCLUDED.contact_id, reply_threads.contact_id),
    lead_id = COALESCE(EXCLUDED.lead_id, reply_threads.lead_id),
    campaign_id = COALESCE(EXCLUDED.campaign_id, reply_threads.campaign_id)
  RETURNING id INTO v_thread_id;
  
  RETURN v_thread_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RLS Policies
ALTER TABLE public.reply_threads ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "reply_threads_select_workspace" ON public.reply_threads;
DROP POLICY IF EXISTS "reply_threads_update_workspace" ON public.reply_threads;
DROP POLICY IF EXISTS "reply_threads_insert_workspace" ON public.reply_threads;

-- Select: Users can see threads in their workspace
CREATE POLICY "reply_threads_select_workspace"
  ON public.reply_threads
  FOR SELECT
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Update: Users can update threads in their workspace
CREATE POLICY "reply_threads_update_workspace"
  ON public.reply_threads
  FOR UPDATE
  TO authenticated
  USING (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Insert: Users can insert threads in their workspace
CREATE POLICY "reply_threads_insert_workspace"
  ON public.reply_threads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id
      FROM public.workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- 8. RLS for message_intents
ALTER TABLE public.message_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "message_intents_select" ON public.message_intents;
CREATE POLICY "message_intents_select"
  ON public.message_intents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.reply_threads rt
      JOIN public.workspace_members wm ON wm.workspace_id = rt.workspace_id
      WHERE rt.latest_message_id = message_intents.message_id
      AND wm.user_id = auth.uid()
    )
  );

-- 9. Grant execute on function
GRANT EXECUTE ON FUNCTION public.upsert_reply_thread(uuid, text, uuid, uuid, uuid, uuid, text, text, text) TO authenticated;

-- 10. Create view for reply inbox summary (for API)
CREATE OR REPLACE VIEW public.reply_inbox_summary AS
SELECT
  rt.id,
  rt.workspace_id,
  rt.contact_id,
  rt.lead_id,
  rt.campaign_id,
  rt.thread_key,
  rt.latest_intent,
  rt.status,
  rt.assigned_to,
  rt.unread,
  rt.last_activity_at,
  rt.subject,
  c.email AS contact_email,
  CASE 
    WHEN c.first_name IS NOT NULL AND c.last_name IS NOT NULL THEN c.first_name || ' ' || c.last_name
    WHEN c.first_name IS NOT NULL THEN c.first_name
    WHEN c.last_name IS NOT NULL THEN c.last_name
    ELSE NULL
  END AS contact_name,
  COALESCE(
    CASE 
      WHEN c.first_name IS NOT NULL AND c.last_name IS NOT NULL THEN c.first_name || ' ' || c.last_name
      WHEN c.first_name IS NOT NULL THEN c.first_name
      WHEN c.last_name IS NOT NULL THEN c.last_name
      ELSE NULL
    END,
    c.email,
    l.email
  ) AS display_name,
  COALESCE(c.email, l.email) AS display_email,
  camp.name AS campaign_name,
  prof.email AS assigned_to_email,
  prof.full_name AS assigned_to_name
FROM public.reply_threads rt
LEFT JOIN public.contacts c ON c.id = rt.contact_id
LEFT JOIN public.leads l ON l.id = rt.lead_id
LEFT JOIN public.campaigns camp ON camp.id = rt.campaign_id
LEFT JOIN public.profiles prof ON prof.id = rt.assigned_to;

-- Grant access to view
GRANT SELECT ON public.reply_inbox_summary TO authenticated;

