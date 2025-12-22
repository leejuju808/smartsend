-- =========================================================
-- Block 120000 — SmartSend Mobile App Tables
-- Device tokens for push notifications + Job media storage
-- =========================================================

-- ============================================================================
-- PART 1: DEVICE TOKENS TABLE
-- ============================================================================
-- Stores Expo push notification tokens for mobile devices

CREATE TABLE IF NOT EXISTS public.device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text CHECK (platform IN ('ios', 'android', 'web')),
  device_info jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  UNIQUE(user_id, token)
);

-- Indexes for device_tokens
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON public.device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_token ON public.device_tokens(token);
CREATE INDEX IF NOT EXISTS idx_device_tokens_last_used ON public.device_tokens(last_used_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_device_tokens_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_device_tokens_updated_at ON public.device_tokens;
CREATE TRIGGER trg_device_tokens_updated_at
BEFORE UPDATE ON public.device_tokens
FOR EACH ROW
EXECUTE FUNCTION public.set_device_tokens_updated_at();

-- ============================================================================
-- PART 2: JOB MEDIA TABLE
-- ============================================================================
-- Stores photos, videos, and documents uploaded from mobile app

CREATE TABLE IF NOT EXISTS public.job_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('photo', 'video', 'document')),
  file_name text,
  file_size integer, -- bytes
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for job_media
CREATE INDEX IF NOT EXISTS idx_job_media_job_id ON public.job_media(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_media_user_id ON public.job_media(user_id);
CREATE INDEX IF NOT EXISTS idx_job_media_created_at ON public.job_media(created_at DESC);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_media ENABLE ROW LEVEL SECURITY;

-- Device tokens: Users can only manage their own tokens
CREATE POLICY "Users can view their own device tokens"
ON public.device_tokens
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own device tokens"
ON public.device_tokens
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own device tokens"
ON public.device_tokens
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own device tokens"
ON public.device_tokens
FOR DELETE
USING (auth.uid() = user_id);

-- Job media: Users can only manage their own media
CREATE POLICY "Users can view their own job media"
ON public.job_media
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own job media"
ON public.job_media
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own job media"
ON public.job_media
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own job media"
ON public.job_media
FOR DELETE
USING (auth.uid() = user_id);

-- ============================================================================
-- STORAGE BUCKET FOR JOB MEDIA
-- ============================================================================
-- Note: This needs to be run in Supabase Dashboard or via Supabase CLI
-- Storage bucket creation is typically done via the Supabase dashboard
-- or using the storage API. The bucket should be named 'job-media'


























