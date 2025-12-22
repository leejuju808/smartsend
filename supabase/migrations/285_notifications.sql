-- Block 268 - Smart Notifications v2
-- Migration 285: Core notifications table

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,               -- e.g. 'reply_high_intent', 'campaign_blocked'
  title text NOT NULL,
  message text,
  data jsonb,                       -- metadata (lead, thread, campaign)
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications(user_id, read);
CREATE INDEX IF NOT EXISTS notifications_workspace_idx ON public.notifications(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_type_idx ON public.notifications(type);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON public.notifications(user_id, created_at DESC) WHERE read = false;

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can read their own notifications
CREATE POLICY "users_read_own_notifications" ON public.notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update their own notifications (mark as read)
CREATE POLICY "users_update_own_notifications" ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role can insert notifications (via edge function)
CREATE POLICY "service_role_insert_notifications" ON public.notifications
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Grant permissions
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT INSERT ON public.notifications TO service_role;








