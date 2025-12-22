-- Block 21716 — SmartSend Roofing Follow-Up Brain Onboarding Defaults v1
-- Auto-defaults for every new campaign: follow-ups enabled, timing optimized for roofing,
-- auto-replies for warm/hot leads enabled — zero configuration needed to start winning jobs

-- =========================================================
-- 1️⃣ Function: Create Default Follow-Up Settings For a Campaign
-- =========================================================
-- This function creates default follow-up settings for any campaign with optimal roofing defaults:
-- - 4 follow-ups enabled
-- - Timing: 48h, 96h (4d), 168h (7d), 336h (14d)
-- - Auto-stop on reply: enabled
-- - Auto-send warm/hot replies: enabled

CREATE OR REPLACE FUNCTION public.create_default_follow_up_settings_for_campaign(
  p_campaign_id uuid
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Find the campaign and derive company_id
  -- Use same logic as API route: prefer company_id, then org_id, then workspace_id, then user_id
  SELECT 
    COALESCE(company_id, org_id, workspace_id, user_id)
  INTO v_company_id
  FROM public.campaigns
  WHERE id = p_campaign_id;

  IF v_company_id IS NULL THEN
    RAISE NOTICE 'No campaign found for id % or could not derive company_id', p_campaign_id;
    RETURN;
  END IF;

  -- Upsert default settings if none exist
  INSERT INTO public.campaign_follow_up_settings (
    company_id,
    campaign_id,
    enabled,
    max_follow_ups,
    fu_1_delay_hours,
    fu_2_delay_hours,
    fu_3_delay_hours,
    fu_4_delay_hours,
    stop_on_reply,
    auto_send_warm,
    auto_send_hot
  )
  VALUES (
    v_company_id,
    p_campaign_id,
    true,   -- enabled
    4,      -- full roofing sequence
    48,     -- FU1: 48h
    96,     -- FU2: +2 days (96h total)
    168,    -- FU3: +3 days (168h total / 7 days)
    336,    -- FU4: +7 days (336h total / 14 days)
    true,   -- stop_on_reply
    true,   -- auto_send_warm
    true    -- auto_send_hot
  )
  ON CONFLICT (campaign_id) DO UPDATE
  SET
    enabled = excluded.enabled,
    max_follow_ups = excluded.max_follow_ups,
    fu_1_delay_hours = excluded.fu_1_delay_hours,
    fu_2_delay_hours = excluded.fu_2_delay_hours,
    fu_3_delay_hours = excluded.fu_3_delay_hours,
    fu_4_delay_hours = excluded.fu_4_delay_hours,
    stop_on_reply = excluded.stop_on_reply,
    auto_send_warm = excluded.auto_send_warm,
    auto_send_hot = excluded.auto_send_hot,
    updated_at = now();
END;
$$;

COMMENT ON FUNCTION public.create_default_follow_up_settings_for_campaign IS 'Block 21716: Creates default follow-up settings for a campaign with optimal roofing defaults (4 follow-ups, 48h/4d/7d/14d timing, auto warm/hot replies)';

-- =========================================================
-- 2️⃣ Trigger: Auto-run on Campaign Creation
-- =========================================================
-- Every time a campaign is inserted, seed the default follow-up settings automatically

CREATE OR REPLACE FUNCTION public.trg_campaign_follow_up_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.create_default_follow_up_settings_for_campaign(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_follow_up_defaults ON public.campaigns;

CREATE TRIGGER trg_campaign_follow_up_defaults
AFTER INSERT ON public.campaigns
FOR EACH ROW
EXECUTE FUNCTION public.trg_campaign_follow_up_defaults();

COMMENT ON TRIGGER trg_campaign_follow_up_defaults ON public.campaigns IS 'Block 21716: Automatically creates default follow-up settings when a new campaign is created';

-- =========================================================
-- 3️⃣ Optional: Function to Create Starter Roofing Campaign
-- =========================================================
-- Creates a pre-built "Storm Damage & Leaks" campaign for new roofing companies
-- This gives them a ready-to-use campaign with follow-ups already configured
-- p_workspace_id: The workspace/company ID to create the campaign for

CREATE OR REPLACE FUNCTION public.create_roofing_starter_campaign(
  p_workspace_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_campaign_id uuid;
  v_has_description boolean;
BEGIN
  -- Check if description column exists
  SELECT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'campaigns' 
    AND column_name = 'description'
  ) INTO v_has_description;

  -- Create the starter campaign using workspace_id
  -- The trigger will automatically create default follow-up settings
  IF v_has_description THEN
    INSERT INTO public.campaigns (
      workspace_id,
      name,
      description,
      booking_link_url,
      status
    )
    VALUES (
      p_workspace_id,
      'Storm Damage & Leaks – Homeowner Outreach',
      'Pre-built SmartSend campaign for roof inspections, leaks, and storm damage in your service area.',
      NULL,  -- user can fill this from onboarding
      'draft'
    )
    RETURNING id INTO v_campaign_id;
  ELSE
    INSERT INTO public.campaigns (
      workspace_id,
      name,
      booking_link_url,
      status
    )
    VALUES (
      p_workspace_id,
      'Storm Damage & Leaks – Homeowner Outreach',
      NULL,  -- user can fill this from onboarding
      'draft'
    )
    RETURNING id INTO v_campaign_id;
  END IF;

  -- The trigger trg_campaign_follow_up_defaults will automatically create
  -- default follow-up settings, so we don't need to call it manually here

  RETURN v_campaign_id;
END;
$$;

COMMENT ON FUNCTION public.create_roofing_starter_campaign IS 'Block 21716: Creates a starter roofing campaign with default follow-up settings for new workspaces';

-- =========================================================
-- 4️⃣ Optional: Trigger ON New Workspace (for Starter Campaign)
-- =========================================================
-- If you want to auto-create a starter campaign for each new workspace/company,
-- uncomment this trigger. This assumes workspaces table exists and represents roofing companies.

-- Note: This is commented out by default. Uncomment if you want to enable auto-creation of starter campaigns.
-- To enable: Remove the /* and */ comment markers around this section.

/*
CREATE OR REPLACE FUNCTION public.trg_workspace_create_starter_campaign()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_campaign_id uuid;
BEGIN
  -- Create starter campaign for new workspace
  v_campaign_id := public.create_roofing_starter_campaign(NEW.id);
  -- Optionally store starter campaign id on workspace record later if needed
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workspace_create_starter_campaign ON public.workspaces;

CREATE TRIGGER trg_workspace_create_starter_campaign
AFTER INSERT ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION public.trg_workspace_create_starter_campaign();

COMMENT ON TRIGGER trg_workspace_create_starter_campaign ON public.workspaces IS 'Block 21716: Automatically creates a starter roofing campaign when a new workspace is created';
*/

-- =========================================================
-- Summary
-- =========================================================
-- Now every new campaign automatically has:
-- ✅ Follow-up automation configured
-- ✅ Optimal roofing timing (48h, 4d, 7d, 14d)
-- ✅ Auto-stop on reply enabled
-- ✅ Auto warm/hot replies enabled
-- ✅ Zero configuration needed to start winning jobs
--
-- Roofers experience: "I created a campaign and SmartSend is already chasing my leads for me."

