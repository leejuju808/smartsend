-- Block 245 — Unified Notifications Center v1
-- Unified notification system for SmartSend with real-time updates

-- 1. Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,           -- reply, task_assigned, thread_assigned, task_due, bounce, billing, system, mention
  title text NOT NULL,
  body text,
  link text,                    -- where clicking goes in-app
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- 2. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_workspace_id ON public.notifications(workspace_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- 3. Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policy: Users can only see their own notifications
CREATE POLICY "User sees only their notifications"
ON public.notifications
FOR SELECT
USING (user_id = auth.uid());

-- 5. RLS Policy: Users can update their own notifications (mark as read)
CREATE POLICY "User can update their notifications"
ON public.notifications
FOR UPDATE
USING (user_id = auth.uid());

-- 6. RLS Policy: Service role can insert notifications (for system events)
CREATE POLICY "Service role can insert notifications"
ON public.notifications
FOR INSERT
TO service_role
WITH CHECK (true);

-- 7. Enable Realtime for notifications
-- Note: Realtime must be enabled via Supabase Dashboard > Database > Replication
-- or by running: ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

