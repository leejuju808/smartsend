-- =========================================================
-- Block 19840 — Inbox Full-Thread AI Reply Assistant v1
-- (AI Responses, Draft Generator, Tone Control, One-Click Replies, Roofing-Optimized Messaging Engine)
-- =========================================================

-- 1. AI Reply Settings (User Preferences)
-- Stores tone preferences and AI reply configuration per user
CREATE TABLE IF NOT EXISTS public.ai_reply_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Tone preferences
  tone text NOT NULL DEFAULT 'friendly' CHECK (tone IN ('friendly', 'direct', 'professional', 'laid-back', 'insurance-heavy', 'sales-optimized')),
  
  -- Signature settings
  include_signature boolean NOT NULL DEFAULT true,
  include_phone boolean NOT NULL DEFAULT true,
  include_scheduling_link boolean NOT NULL DEFAULT true,
  include_address boolean NOT NULL DEFAULT false,
  
  -- Owner info for signature
  owner_name text,
  company_name text,
  phone text,
  scheduling_link text,
  address text,
  
  -- AI behavior
  auto_detect_reply_type boolean NOT NULL DEFAULT true,
  enable_objection_handling boolean NOT NULL DEFAULT true,
  enable_follow_up_suggestions boolean NOT NULL DEFAULT true,
  
  -- Pricing estimates (if user allows)
  allow_pricing_estimates boolean NOT NULL DEFAULT false,
  default_price_range_min numeric(10,2),
  default_price_range_max numeric(10,2),
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_reply_settings_user ON public.ai_reply_settings(user_id);

-- Enable RLS
ALTER TABLE public.ai_reply_settings ENABLE ROW LEVEL SECURITY;

-- RLS: Users can only access their own settings
CREATE POLICY "ai_reply_settings_own"
  ON public.ai_reply_settings
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. AI Reply Logs
-- Logs every AI-generated reply for auditing, improvement, and safety
CREATE TABLE IF NOT EXISTS public.ai_reply_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid REFERENCES public.reply_threads(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  
  -- Input context
  input_message text NOT NULL, -- Last homeowner message
  full_thread_context text, -- Full conversation history
  detected_reply_type text CHECK (detected_reply_type IN ('scheduling', 'info_request', 'price_shopper', 'insurance_claim', 'low_interest', 'urgent_damage', 'objection', 'general')),
  detected_tone text,
  detected_urgency text CHECK (detected_urgency IN ('low', 'medium', 'high', 'urgent')),
  
  -- Generated output
  generated_reply text NOT NULL,
  confidence_score numeric(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  
  -- User interaction
  user_edited_version text, -- If user edited before sending
  was_sent boolean NOT NULL DEFAULT false,
  was_edited boolean NOT NULL DEFAULT false,
  
  -- Metadata
  model_version text DEFAULT 'v1',
  processing_time_ms integer,
  settings_snapshot jsonb, -- Snapshot of user settings at generation time
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_reply_logs_user ON public.ai_reply_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_reply_logs_thread ON public.ai_reply_logs(thread_id);
CREATE INDEX IF NOT EXISTS idx_ai_reply_logs_lead ON public.ai_reply_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_ai_reply_logs_type ON public.ai_reply_logs(detected_reply_type);
CREATE INDEX IF NOT EXISTS idx_ai_reply_logs_sent ON public.ai_reply_logs(was_sent);

-- Enable RLS
ALTER TABLE public.ai_reply_logs ENABLE ROW LEVEL SECURITY;

-- RLS: Users can only see their own logs
CREATE POLICY "ai_reply_logs_own"
  ON public.ai_reply_logs
  FOR ALL
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.reply_threads rt
      WHERE rt.id = ai_reply_logs.thread_id
      AND (
        rt.account_id = auth.uid()
        OR rt.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members
          WHERE user_id = auth.uid()
        )
      )
    )
  );

-- 3. Suggested Follow-Up Replies
-- Stores AI-generated follow-up suggestions for scheduling
CREATE TABLE IF NOT EXISTS public.ai_follow_up_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES public.reply_threads(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  
  -- Follow-up details
  suggestion_type text NOT NULL CHECK (suggestion_type IN ('24_hour', '3_day', 'check_in', 'circling_back', 'inspection_reminder', 'area_visit')),
  suggested_message text NOT NULL,
  suggested_send_at timestamptz NOT NULL,
  
  -- Status
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'sent', 'cancelled')),
  scheduled_task_id uuid, -- Link to tasks table if scheduled
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_follow_up_user ON public.ai_follow_up_suggestions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_ai_follow_up_thread ON public.ai_follow_up_suggestions(thread_id);
CREATE INDEX IF NOT EXISTS idx_ai_follow_up_send_at ON public.ai_follow_up_suggestions(suggested_send_at) WHERE status = 'scheduled';

-- Enable RLS
ALTER TABLE public.ai_follow_up_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS: Users can only see their own suggestions
CREATE POLICY "ai_follow_up_suggestions_own"
  ON public.ai_follow_up_suggestions
  FOR ALL
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.reply_threads rt
      WHERE rt.id = ai_follow_up_suggestions.thread_id
      AND (
        rt.account_id = auth.uid()
        OR rt.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members
          WHERE user_id = auth.uid()
        )
      )
    )
  );

-- 4. Update timestamp trigger function (if not exists)
CREATE OR REPLACE FUNCTION public.update_ai_reply_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ai_reply_settings_updated_at
  BEFORE UPDATE ON public.ai_reply_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ai_reply_settings_updated_at();

CREATE TRIGGER trg_ai_follow_up_suggestions_updated_at
  BEFORE UPDATE ON public.ai_follow_up_suggestions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ai_reply_settings_updated_at();

-- 5. Helper function to get user's AI reply settings with defaults
CREATE OR REPLACE FUNCTION public.get_ai_reply_settings(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  settings_record public.ai_reply_settings%ROWTYPE;
  result jsonb;
BEGIN
  SELECT * INTO settings_record
  FROM public.ai_reply_settings
  WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    -- Return defaults
    result := jsonb_build_object(
      'tone', 'friendly',
      'include_signature', true,
      'include_phone', true,
      'include_scheduling_link', true,
      'include_address', false,
      'auto_detect_reply_type', true,
      'enable_objection_handling', true,
      'enable_follow_up_suggestions', true,
      'allow_pricing_estimates', false
    );
  ELSE
    result := to_jsonb(settings_record);
  END IF;
  
  RETURN result;
END;
$$;

-- Comments
COMMENT ON TABLE public.ai_reply_settings IS 'User preferences for AI reply generation (tone, signature, behavior)';
COMMENT ON TABLE public.ai_reply_logs IS 'Audit log of all AI-generated replies for improvement and safety';
COMMENT ON TABLE public.ai_follow_up_suggestions IS 'AI-generated follow-up reply suggestions for scheduling';
COMMENT ON COLUMN public.ai_reply_logs.confidence_score IS 'AI confidence score (0-1) for the generated reply';
COMMENT ON COLUMN public.ai_reply_logs.settings_snapshot IS 'Snapshot of user settings at generation time for reproducibility';



















































