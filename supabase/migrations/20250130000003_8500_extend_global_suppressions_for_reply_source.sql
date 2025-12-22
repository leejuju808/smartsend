-- Block 8500 — Auto-Suppression from Reply Intent (Unsub/Bounce/Spam) + Lead Status Sync
-- Extend global_suppressions table with source metadata for reply-based suppressions

-- 1. Add active column if not exists
ALTER TABLE public.global_suppressions
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Extend source check constraint to include 'reply'
ALTER TABLE public.global_suppressions
  DROP CONSTRAINT IF EXISTS global_suppressions_source_check;

ALTER TABLE public.global_suppressions
  ADD CONSTRAINT global_suppressions_source_check
  CHECK (source IN ('manual', 'bounce', 'complaint', 'spamtrap', 'admin', 'api', 'reply'));

-- 3. Add source metadata columns
ALTER TABLE public.global_suppressions
  ADD COLUMN IF NOT EXISTS source_type TEXT,           -- 'manual', 'reply', 'import', etc.
  ADD COLUMN IF NOT EXISTS source_campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_campaign_reply_id UUID REFERENCES public.campaign_replies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_global_suppressions_email
  ON public.global_suppressions (email);

CREATE INDEX IF NOT EXISTS idx_global_suppressions_active
  ON public.global_suppressions (active)
  WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS idx_global_suppressions_source_campaign
  ON public.global_suppressions (source_campaign_id)
  WHERE source_campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_global_suppressions_source_reply
  ON public.global_suppressions (source_campaign_reply_id)
  WHERE source_campaign_reply_id IS NOT NULL;































































