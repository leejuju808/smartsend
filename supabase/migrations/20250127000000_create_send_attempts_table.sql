-- Create send_attempts table for tracking pre-send guard metrics
-- This table logs each attempt to send a campaign with suppression/invalid email blocking

CREATE TABLE IF NOT EXISTS public.send_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns_new(id) ON DELETE CASCADE,
  attempted int NOT NULL DEFAULT 0,        -- Total recipients attempted
  blocked_suppressed int NOT NULL DEFAULT 0, -- Blocked due to suppression
  blocked_invalid int NOT NULL DEFAULT 0,    -- Blocked due to invalid email format
  final_sendable int NOT NULL DEFAULT 0,     -- Final count of sendable recipients
  metadata jsonb DEFAULT '{}'::jsonb,        -- Additional context (excluded IDs, etc.)
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for campaign lookups
CREATE INDEX IF NOT EXISTS idx_send_attempts_campaign ON public.send_attempts (campaign_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.send_attempts ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own send attempts
CREATE POLICY IF NOT EXISTS send_attempts_own ON public.send_attempts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.campaigns_new c 
      WHERE c.id = send_attempts.campaign_id 
      AND c.user_id = auth.uid()
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns_new c 
      WHERE c.id = send_attempts.campaign_id 
      AND c.user_id = auth.uid()
    )
  );