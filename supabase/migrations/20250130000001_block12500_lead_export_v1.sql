-- =========================================================
-- Block 12500 — SmartSend Roofing Lead Export v1
-- (The Simple Export System That Gives Roofers Control Without Letting Them Abuse It)
-- =========================================================

-- 1. EXPORTS TABLE
-- Stores export requests and their status
CREATE TABLE IF NOT EXISTS public.exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'complete', 'failed')),
  file_path text, -- Supabase storage path when ready
  file_url text, -- Public URL for download
  filters jsonb NOT NULL DEFAULT '{}'::jsonb, -- Export filters (scope, status, date range, etc.)
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + INTERVAL '24 hours'), -- Download link expires after 24 hours
  error_message text,
  row_count integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exports_workspace_user ON public.exports(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS idx_exports_status ON public.exports(status) WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_exports_requested_at ON public.exports(requested_at DESC);

-- RLS: Users can only see their own exports
ALTER TABLE public.exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own exports"
  ON public.exports FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create own exports"
  ON public.exports FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own exports"
  ON public.exports FOR UPDATE
  USING (user_id = auth.uid());

-- 2. EXPORT RATE LIMIT TRACKING
-- Track export requests per user per day for rate limiting
CREATE TABLE IF NOT EXISTS public.export_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  export_date date NOT NULL DEFAULT CURRENT_DATE,
  export_count integer NOT NULL DEFAULT 0,
  last_export_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id, export_date)
);

CREATE INDEX IF NOT EXISTS idx_export_rate_limits_user_date ON public.export_rate_limits(user_id, workspace_id, export_date DESC);

-- RLS for rate limit tracking
ALTER TABLE public.export_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own rate limits"
  ON public.export_rate_limits FOR SELECT
  USING (user_id = auth.uid());

-- 3. FUNCTION: Check export rate limit
-- Returns true if user can export, false if rate limited
CREATE OR REPLACE FUNCTION public.can_export_leads(
  p_user_id uuid,
  p_workspace_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_export_at timestamptz;
  v_export_count integer;
  v_export_date date := CURRENT_DATE;
BEGIN
  -- Get or create rate limit record
  INSERT INTO public.export_rate_limits (user_id, workspace_id, export_date, export_count)
  VALUES (p_user_id, p_workspace_id, v_export_date, 0)
  ON CONFLICT (user_id, workspace_id, export_date)
  DO UPDATE SET export_count = export_rate_limits.export_count
  RETURNING last_export_at, export_count INTO v_last_export_at, v_export_count;

  -- Check: 1 export per 10 minutes
  IF v_last_export_at IS NOT NULL AND v_last_export_at > now() - INTERVAL '10 minutes' THEN
    RETURN false;
  END IF;

  -- Check: Max 10 exports per day
  IF v_export_count >= 10 THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

-- 4. FUNCTION: Record export request
-- Updates rate limit tracking when export is requested
CREATE OR REPLACE FUNCTION public.record_export_request(
  p_user_id uuid,
  p_workspace_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_export_date date := CURRENT_DATE;
BEGIN
  INSERT INTO public.export_rate_limits (user_id, workspace_id, export_date, export_count, last_export_at)
  VALUES (p_user_id, p_workspace_id, v_export_date, 1, now())
  ON CONFLICT (user_id, workspace_id, export_date)
  DO UPDATE SET
    export_count = export_rate_limits.export_count + 1,
    last_export_at = now();
END;
$$;

-- 5. STORAGE BUCKET FOR EXPORTS
-- Create storage bucket for export CSV files
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exports',
  'exports',
  false, -- private bucket
  52428800, -- 50 MB limit per file
  array['text/csv']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for exports bucket
-- Policy: Service role can upload/read/delete (for worker)
CREATE POLICY IF NOT EXISTS "exports_service_role_full_access"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'exports')
  WITH CHECK (bucket_id = 'exports');

-- Policy: Users can read their own exports
CREATE POLICY IF NOT EXISTS "exports_users_can_read_own"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'exports'
    AND EXISTS (
      SELECT 1 FROM public.exports e
      WHERE e.file_path = storage.objects.name
      AND e.user_id = auth.uid()
      AND e.expires_at > now()
    )
  );

-- Comments
COMMENT ON TABLE public.exports IS 'Lead export requests - allows roofers to export their leads in CSV format';
COMMENT ON COLUMN public.exports.filters IS 'JSON filters: {scope: "all"|"hot"|"warm"|"custom", status?: string, dateFrom?: string, dateTo?: string}';
COMMENT ON COLUMN public.exports.expires_at IS 'Download link expires 24 hours after creation';
COMMENT ON FUNCTION public.can_export_leads IS 'Checks if user can export: 1 per 10 min, max 10 per day';

