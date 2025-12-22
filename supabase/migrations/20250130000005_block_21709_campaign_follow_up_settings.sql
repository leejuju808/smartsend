-- Block 21709 — SmartSend Roofing Follow-Up Control Panel (Campaign Settings UI Spec) v1
-- Per-Campaign Follow-Up Settings Table
-- 
-- This table gives roofers the power to control their follow-up engine — but keeps it dead simple
-- so they don't get overwhelmed.
--
-- Roofers can control:
-- - How many follow-ups they want (0-4)
-- - What timing they want for each follow-up
-- - Whether SmartSend should auto-stop when a homeowner replies (default YES)
-- - Whether SmartSend should auto-send warm/hot replies a booking link

CREATE TABLE IF NOT EXISTS public.campaign_follow_up_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,  -- Derived from campaign's workspace_id/org_id
  campaign_id uuid NOT NULL UNIQUE REFERENCES public.campaigns(id) ON DELETE CASCADE,

  enabled boolean NOT NULL DEFAULT true,

  -- Number of follow-ups to run (0–4)
  max_follow_ups int NOT NULL DEFAULT 4 CHECK (max_follow_ups BETWEEN 0 AND 4),

  -- Timing overrides per stage (in hours)
  fu_1_delay_hours int NOT NULL DEFAULT 48,
  fu_2_delay_hours int NOT NULL DEFAULT 96,
  fu_3_delay_hours int NOT NULL DEFAULT 168,
  fu_4_delay_hours int NOT NULL DEFAULT 336,

  -- Auto behavior when homeowner replies
  stop_on_reply boolean NOT NULL DEFAULT true,
  auto_send_warm boolean NOT NULL DEFAULT true,
  auto_send_hot boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaign_follow_up_settings_company 
  ON public.campaign_follow_up_settings(company_id);

CREATE INDEX IF NOT EXISTS idx_campaign_follow_up_settings_campaign 
  ON public.campaign_follow_up_settings(campaign_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_campaign_follow_up_settings_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_follow_up_settings_updated_at 
  ON public.campaign_follow_up_settings;
CREATE TRIGGER trg_campaign_follow_up_settings_updated_at
  BEFORE UPDATE ON public.campaign_follow_up_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_campaign_follow_up_settings_updated_at();

-- RLS Policies
ALTER TABLE public.campaign_follow_up_settings ENABLE ROW LEVEL SECURITY;

-- Service role has full access (for Edge Functions)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'campaign_follow_up_settings'
      AND policyname = 'campaign_follow_up_settings_service_role'
  ) THEN
    CREATE POLICY "campaign_follow_up_settings_service_role"
      ON public.campaign_follow_up_settings
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Authenticated users can read/write their own campaign settings
-- (Access controlled via campaign ownership)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'campaign_follow_up_settings'
      AND policyname = 'campaign_follow_up_settings_authenticated'
  ) THEN
    CREATE POLICY "campaign_follow_up_settings_authenticated"
      ON public.campaign_follow_up_settings
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.campaigns c
          WHERE c.id = campaign_follow_up_settings.campaign_id
          AND (
            c.user_id = auth.uid()
            OR c.workspace_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.campaign_members cm
              WHERE cm.campaign_id = c.id
              AND cm.user_id = auth.uid()
            )
          )
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.campaigns c
          WHERE c.id = campaign_follow_up_settings.campaign_id
          AND (
            c.user_id = auth.uid()
            OR c.workspace_id = auth.uid()
            OR EXISTS (
              SELECT 1 FROM public.campaign_members cm
              WHERE cm.campaign_id = c.id
              AND cm.user_id = auth.uid()
            )
          )
        )
      );
  END IF;
END $$;

-- Comments
COMMENT ON TABLE public.campaign_follow_up_settings IS 'Block 21709: Per-campaign follow-up automation settings - gives roofers control over follow-up count, timing, and reply behavior';
COMMENT ON COLUMN public.campaign_follow_up_settings.max_follow_ups IS 'Number of follow-ups to run (0-4). Roofers can choose soft (1), moderate (2-3), or aggressive (4)';
COMMENT ON COLUMN public.campaign_follow_up_settings.fu_1_delay_hours IS 'Delay in hours before sending Follow-Up #1 (default: 48 hours)';
COMMENT ON COLUMN public.campaign_follow_up_settings.fu_2_delay_hours IS 'Delay in hours before sending Follow-Up #2 (default: 96 hours / 4 days)';
COMMENT ON COLUMN public.campaign_follow_up_settings.fu_3_delay_hours IS 'Delay in hours before sending Follow-Up #3 (default: 168 hours / 7 days)';
COMMENT ON COLUMN public.campaign_follow_up_settings.fu_4_delay_hours IS 'Delay in hours before sending Follow-Up #4 (default: 336 hours / 14 days)';
COMMENT ON COLUMN public.campaign_follow_up_settings.stop_on_reply IS 'Automatically stop all follow-ups when homeowner replies (default: true)';
COMMENT ON COLUMN public.campaign_follow_up_settings.auto_send_warm IS 'Auto-send warm lead message with booking link when homeowner replies (default: true)';
COMMENT ON COLUMN public.campaign_follow_up_settings.auto_send_hot IS 'Auto-send hot lead priority message when homeowner replies (default: true)';











































