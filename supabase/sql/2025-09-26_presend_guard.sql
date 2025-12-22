-- Minimal, auditable metrics table for send attempts
CREATE TABLE IF NOT EXISTS public.send_attempts (
  id                uuid PRIMARY KEY DEFAULT genrandomuuid(),
  campaign_id       uuid,
  workspace_id      uuid NOT NULL,
  attempted_total   integer NOT NULL,
  blocked_suppressed integer NOT NULL DEFAULT 0,
  blocked_invalid    integer NOT NULL DEFAULT 0,
  final_sendable     integer NOT NULL,
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- RLS, align to workspace_id constraint via profiles table
ALTER TABLE public.send_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS send_attempts_rw_policy ON public.send_attempts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = send_attempts.workspace_id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = send_attempts.workspace_id)
  );