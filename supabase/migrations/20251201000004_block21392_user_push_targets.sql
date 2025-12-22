-- =========================================================
-- Block 21392 — SmartSend Roofing HOT Lead Push Alerts (Mobile)
-- User Push Targets: Store mobile device/browser push notification targets
-- =========================================================

-- ============================================================================
-- PART 1 — Create user_push_targets table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_push_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- e.g. OneSignal player_id, Firebase token, etc.
  provider text NOT NULL, -- 'onesignal', 'fcm', etc.
  target_id text NOT NULL, -- token / player id / endpoint

  device_label text, -- "Julian's iPhone", optional

  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),

  -- Ensure unique combination of user, org, provider, and target_id
  UNIQUE (user_id, org_id, provider, target_id)
);

-- ============================================================================
-- PART 2 — Indexes for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_user_push_targets_org
  ON public.user_push_targets(org_id);

CREATE INDEX IF NOT EXISTS idx_user_push_targets_user
  ON public.user_push_targets(user_id);

CREATE INDEX IF NOT EXISTS idx_user_push_targets_provider
  ON public.user_push_targets(provider);

-- ============================================================================
-- PART 3 — Row Level Security (RLS)
-- ============================================================================

ALTER TABLE public.user_push_targets ENABLE ROW LEVEL SECURITY;

-- Users can manage their own push targets
CREATE POLICY "user can manage own push targets"
ON public.user_push_targets
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- PART 4 — Comments
-- ============================================================================

COMMENT ON TABLE public.user_push_targets IS 'Stores push notification targets (device tokens, player IDs) for users. Used to send HOT lead alerts when a roofing job health score crosses into HOT territory.';
COMMENT ON COLUMN public.user_push_targets.provider IS 'Push notification provider: onesignal, fcm, etc.';
COMMENT ON COLUMN public.user_push_targets.target_id IS 'Provider-specific identifier: OneSignal player_id, FCM token, etc.';
COMMENT ON COLUMN public.user_push_targets.device_label IS 'Optional human-readable label like "Julian'\''s iPhone"';















































