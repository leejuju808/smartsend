-- =========================================================
-- Block 93000 — SmartSend Roofing
-- "Lead Attribution + Multi-Channel Source Tracking Engine" v1
-- =========================================================
-- 
-- This block implements comprehensive lead attribution tracking
-- that connects every lead, reply, and job to its source channel,
-- campaign, and offer. This turns SmartSend into a marketing analytics
-- system for roofing companies.
--
-- Features:
-- - Auto-tag every lead with source, campaign, and offer
-- - Track QR codes, cold email, phone calls, website forms, referrals
-- - Multi-touch attribution (first touch, last touch)
-- - Revenue attribution per channel
-- - ROI calculation per source
-- - Campaign performance analytics

-- ============================================================
-- 1. LEAD SOURCES TABLE (Channels)
-- ============================================================
-- Tracks all lead generation channels (cold email, phone, website, etc.)
CREATE TABLE IF NOT EXISTS public.lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,                    -- e.g. "Cold Email", "Phone Call", "Website Form", "Referral", "QR Code", "Yard Sign"
  channel_type text NOT NULL CHECK (channel_type IN ('offline', 'online', 'outbound', 'inbound')),
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_lead_sources_workspace 
  ON public.lead_sources(workspace_id, is_active);

CREATE INDEX IF NOT EXISTS idx_lead_sources_channel_type 
  ON public.lead_sources(channel_type);

-- ============================================================
-- 2. LEAD CAMPAIGNS TABLE (Campaign Attribution)
-- ============================================================
-- Tracks specific campaigns (cold email sequences, SMS campaigns, etc.)
CREATE TABLE IF NOT EXISTS public.lead_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,                    -- e.g. "Storm Follow-Up Sequence", "Neighborhood Outreach"
  medium text NOT NULL CHECK (medium IN ('email', 'sms', 'website', 'phone', 'qr', 'direct_mail', 'social', 'other')),
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL, -- Link to existing campaigns table if applicable
  offer text,                            -- e.g. "Free Inspection", "10% Off", "Storm Damage Assessment"
  landing_page text,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_campaigns_workspace 
  ON public.lead_campaigns(workspace_id, is_active);

CREATE INDEX IF NOT EXISTS idx_lead_campaigns_medium 
  ON public.lead_campaigns(medium);

CREATE INDEX IF NOT EXISTS idx_lead_campaigns_campaign_id 
  ON public.lead_campaigns(campaign_id) WHERE campaign_id IS NOT NULL;

-- ============================================================
-- 3. LEAD ATTRIBUTIONS TABLE (Core Attribution Engine)
-- ============================================================
-- Links leads to their sources, campaigns, and tracks touchpoints
CREATE TABLE IF NOT EXISTS public.lead_attributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.lead_sources(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.lead_campaigns(id) ON DELETE SET NULL,
  
  -- Attribution details
  offer text,                            -- Specific offer that converted
  landing_page text,                     -- Landing page URL if applicable
  referrer text,                         -- HTTP referrer
  utm_source text,                      -- UTM parameters
  utm_medium text,
  utm_campaign text,
  utm_term text,
  utm_content text,
  
  -- Multi-touch attribution
  first_touch timestamptz,               -- First interaction timestamp
  last_touch timestamptz,                -- Last interaction timestamp
  touch_count integer DEFAULT 1,         -- Number of touchpoints
  
  -- Revenue attribution (updated when job is won)
  revenue_attributed numeric(12,2) DEFAULT 0,
  cost_to_acquire numeric(12,2) DEFAULT 0,
  roi numeric(5,2),                      -- ROI percentage
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,    -- Flexible storage for additional data
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lead_attributions_workspace 
  ON public.lead_attributions(workspace_id);

CREATE INDEX IF NOT EXISTS idx_lead_attributions_lead 
  ON public.lead_attributions(lead_id);

CREATE INDEX IF NOT EXISTS idx_lead_attributions_source 
  ON public.lead_attributions(source_id) WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_attributions_campaign 
  ON public.lead_attributions(campaign_id) WHERE campaign_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_attributions_first_touch 
  ON public.lead_attributions(first_touch) WHERE first_touch IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lead_attributions_last_touch 
  ON public.lead_attributions(last_touch) WHERE last_touch IS NOT NULL;

-- Unique constraint: one attribution per lead (can be updated with new touches)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_lead_attributions_lead 
  ON public.lead_attributions(lead_id);

-- ============================================================
-- 4. QR CODES TABLE (QR Code Tracking)
-- ============================================================
-- Tracks QR codes for yard signs, door hangers, trucks, etc.
CREATE TABLE IF NOT EXISTS public.qr_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  url text NOT NULL,                     -- Destination URL
  label text NOT NULL,                   -- e.g. "Yard Sign - Main St", "Door Hanger - Spring Campaign"
  short_code text UNIQUE,                 -- Short code for QR (auto-generated)
  campaign_id uuid REFERENCES public.lead_campaigns(id) ON DELETE SET NULL,
  source_id uuid REFERENCES public.lead_sources(id) ON DELETE SET NULL,
  
  -- Tracking metrics
  scans integer DEFAULT 0,              -- Total scans
  unique_scans integer DEFAULT 0,        -- Unique visitors
  leads_generated integer DEFAULT 0,      -- Leads created from scans
  jobs_won integer DEFAULT 0,            -- Jobs won from this QR code
  revenue_generated numeric(12,2) DEFAULT 0,
  
  -- Metadata
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qr_codes_workspace 
  ON public.qr_codes(workspace_id, is_active);

CREATE INDEX IF NOT EXISTS idx_qr_codes_short_code 
  ON public.qr_codes(short_code) WHERE short_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_qr_codes_campaign 
  ON public.qr_codes(campaign_id) WHERE campaign_id IS NOT NULL;

-- ============================================================
-- 5. ATTRIBUTION TOUCHPOINTS TABLE (Multi-Touch History)
-- ============================================================
-- Tracks all touchpoints in a lead's journey (future enhancement)
CREATE TABLE IF NOT EXISTS public.attribution_touchpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  attribution_id uuid REFERENCES public.lead_attributions(id) ON DELETE CASCADE,
  source_id uuid REFERENCES public.lead_sources(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.lead_campaigns(id) ON DELETE SET NULL,
  
  touch_type text NOT NULL CHECK (touch_type IN ('email_sent', 'email_opened', 'email_clicked', 'email_replied', 'phone_call', 'website_visit', 'form_submit', 'qr_scan', 'referral', 'other')),
  touch_timestamp timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attribution_touchpoints_lead 
  ON public.attribution_touchpoints(lead_id, touch_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_attribution_touchpoints_attribution 
  ON public.attribution_touchpoints(attribution_id);

-- ============================================================
-- 6. UPDATED_AT TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_attribution_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_sources_updated_at ON public.lead_sources;
CREATE TRIGGER trg_lead_sources_updated_at
  BEFORE UPDATE ON public.lead_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.set_attribution_updated_at();

DROP TRIGGER IF EXISTS trg_lead_campaigns_updated_at ON public.lead_campaigns;
CREATE TRIGGER trg_lead_campaigns_updated_at
  BEFORE UPDATE ON public.lead_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.set_attribution_updated_at();

DROP TRIGGER IF EXISTS trg_lead_attributions_updated_at ON public.lead_attributions;
CREATE TRIGGER trg_lead_attributions_updated_at
  BEFORE UPDATE ON public.lead_attributions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_attribution_updated_at();

DROP TRIGGER IF EXISTS trg_qr_codes_updated_at ON public.qr_codes;
CREATE TRIGGER trg_qr_codes_updated_at
  BEFORE UPDATE ON public.qr_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_attribution_updated_at();

-- ============================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE public.lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attribution_touchpoints ENABLE ROW LEVEL SECURITY;

-- Helper function to check workspace membership
CREATE OR REPLACE FUNCTION public.is_workspace_member_attribution(p_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = auth.uid()
  );
$$;

-- RLS Policies for lead_sources
DROP POLICY IF EXISTS "lead_sources_select_workspace" ON public.lead_sources;
CREATE POLICY "lead_sources_select_workspace"
  ON public.lead_sources
  FOR SELECT
  USING (is_workspace_member_attribution(workspace_id));

DROP POLICY IF EXISTS "lead_sources_insert_workspace" ON public.lead_sources;
CREATE POLICY "lead_sources_insert_workspace"
  ON public.lead_sources
  FOR INSERT
  WITH CHECK (is_workspace_member_attribution(workspace_id));

DROP POLICY IF EXISTS "lead_sources_update_workspace" ON public.lead_sources;
CREATE POLICY "lead_sources_update_workspace"
  ON public.lead_sources
  FOR UPDATE
  USING (is_workspace_member_attribution(workspace_id))
  WITH CHECK (is_workspace_member_attribution(workspace_id));

DROP POLICY IF EXISTS "lead_sources_delete_workspace" ON public.lead_sources;
CREATE POLICY "lead_sources_delete_workspace"
  ON public.lead_sources
  FOR DELETE
  USING (is_workspace_member_attribution(workspace_id));

-- RLS Policies for lead_campaigns
DROP POLICY IF EXISTS "lead_campaigns_select_workspace" ON public.lead_campaigns;
CREATE POLICY "lead_campaigns_select_workspace"
  ON public.lead_campaigns
  FOR SELECT
  USING (is_workspace_member_attribution(workspace_id));

DROP POLICY IF EXISTS "lead_campaigns_insert_workspace" ON public.lead_campaigns;
CREATE POLICY "lead_campaigns_insert_workspace"
  ON public.lead_campaigns
  FOR INSERT
  WITH CHECK (is_workspace_member_attribution(workspace_id));

DROP POLICY IF EXISTS "lead_campaigns_update_workspace" ON public.lead_campaigns;
CREATE POLICY "lead_campaigns_update_workspace"
  ON public.lead_campaigns
  FOR UPDATE
  USING (is_workspace_member_attribution(workspace_id))
  WITH CHECK (is_workspace_member_attribution(workspace_id));

DROP POLICY IF EXISTS "lead_campaigns_delete_workspace" ON public.lead_campaigns;
CREATE POLICY "lead_campaigns_delete_workspace"
  ON public.lead_campaigns
  FOR DELETE
  USING (is_workspace_member_attribution(workspace_id));

-- RLS Policies for lead_attributions
DROP POLICY IF EXISTS "lead_attributions_select_workspace" ON public.lead_attributions;
CREATE POLICY "lead_attributions_select_workspace"
  ON public.lead_attributions
  FOR SELECT
  USING (is_workspace_member_attribution(workspace_id));

DROP POLICY IF EXISTS "lead_attributions_insert_workspace" ON public.lead_attributions;
CREATE POLICY "lead_attributions_insert_workspace"
  ON public.lead_attributions
  FOR INSERT
  WITH CHECK (is_workspace_member_attribution(workspace_id));

DROP POLICY IF EXISTS "lead_attributions_update_workspace" ON public.lead_attributions;
CREATE POLICY "lead_attributions_update_workspace"
  ON public.lead_attributions
  FOR UPDATE
  USING (is_workspace_member_attribution(workspace_id))
  WITH CHECK (is_workspace_member_attribution(workspace_id));

-- RLS Policies for qr_codes
DROP POLICY IF EXISTS "qr_codes_select_workspace" ON public.qr_codes;
CREATE POLICY "qr_codes_select_workspace"
  ON public.qr_codes
  FOR SELECT
  USING (is_workspace_member_attribution(workspace_id));

DROP POLICY IF EXISTS "qr_codes_insert_workspace" ON public.qr_codes;
CREATE POLICY "qr_codes_insert_workspace"
  ON public.qr_codes
  FOR INSERT
  WITH CHECK (is_workspace_member_attribution(workspace_id));

DROP POLICY IF EXISTS "qr_codes_update_workspace" ON public.qr_codes;
CREATE POLICY "qr_codes_update_workspace"
  ON public.qr_codes
  FOR UPDATE
  USING (is_workspace_member_attribution(workspace_id))
  WITH CHECK (is_workspace_member_attribution(workspace_id));

DROP POLICY IF EXISTS "qr_codes_delete_workspace" ON public.qr_codes;
CREATE POLICY "qr_codes_delete_workspace"
  ON public.qr_codes
  FOR DELETE
  USING (is_workspace_member_attribution(workspace_id));

-- RLS Policies for attribution_touchpoints
DROP POLICY IF EXISTS "attribution_touchpoints_select_workspace" ON public.attribution_touchpoints;
CREATE POLICY "attribution_touchpoints_select_workspace"
  ON public.attribution_touchpoints
  FOR SELECT
  USING (is_workspace_member_attribution(workspace_id));

DROP POLICY IF EXISTS "attribution_touchpoints_insert_workspace" ON public.attribution_touchpoints;
CREATE POLICY "attribution_touchpoints_insert_workspace"
  ON public.attribution_touchpoints
  FOR INSERT
  WITH CHECK (is_workspace_member_attribution(workspace_id));

-- ============================================================
-- 8. HELPER FUNCTIONS
-- ============================================================

-- Function: Auto-create attribution when lead is created
CREATE OR REPLACE FUNCTION public.auto_create_lead_attribution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_source_id uuid;
  v_campaign_id uuid;
  v_attribution_id uuid;
BEGIN
  -- Only create if attribution doesn't exist
  SELECT id INTO v_attribution_id
  FROM public.lead_attributions
  WHERE lead_id = NEW.id;
  
  IF v_attribution_id IS NULL THEN
    -- Try to find source from lead metadata or default to "Unknown"
    -- This can be enhanced to parse metadata, headers, etc.
    
    INSERT INTO public.lead_attributions (
      workspace_id,
      lead_id,
      source_id,
      campaign_id,
      first_touch,
      last_touch
    ) VALUES (
      NEW.workspace_id,
      NEW.id,
      NULL, -- Will be set by attribution logic
      NULL, -- Will be set by attribution logic
      NEW.created_at,
      NEW.created_at
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger: Auto-create attribution on lead creation
DROP TRIGGER IF EXISTS trg_auto_create_lead_attribution ON public.leads;
CREATE TRIGGER trg_auto_create_lead_attribution
  AFTER INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_lead_attribution();

-- Function: Update attribution when job is won (revenue attribution)
CREATE OR REPLACE FUNCTION public.update_attribution_revenue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lead_id uuid;
  v_job_value numeric;
BEGIN
  -- Check if job status changed to completed/won
  IF NEW.stage = 'completed' OR (NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed')) THEN
    v_lead_id := NEW.lead_id;
    v_job_value := COALESCE(NEW.job_value, NEW.contract_value, 0);
    
    IF v_lead_id IS NOT NULL AND v_job_value > 0 THEN
      -- Update attribution revenue
      UPDATE public.lead_attributions
      SET 
        revenue_attributed = revenue_attributed + v_job_value,
        updated_at = now()
      WHERE lead_id = v_lead_id;
      
      -- Recalculate ROI if cost_to_acquire is set
      UPDATE public.lead_attributions
      SET roi = CASE
        WHEN cost_to_acquire > 0 THEN
          ROUND(((revenue_attributed - cost_to_acquire) / cost_to_acquire) * 100, 2)
        ELSE NULL
      END
      WHERE lead_id = v_lead_id AND cost_to_acquire > 0;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger: Update revenue when job is completed
-- Note: This assumes jobs table has lead_id, stage/status, and job_value/contract_value
-- Adjust table/column names based on your actual schema
DO $$
BEGIN
  -- Try to create trigger on roofing_jobs if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roofing_jobs') THEN
    DROP TRIGGER IF EXISTS trg_update_attribution_revenue_roofing_jobs ON public.roofing_jobs;
    CREATE TRIGGER trg_update_attribution_revenue_roofing_jobs
      AFTER UPDATE ON public.roofing_jobs
      FOR EACH ROW
      EXECUTE FUNCTION public.update_attribution_revenue();
  END IF;
  
  -- Try to create trigger on jobs if it exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'jobs' AND table_schema = 'public') THEN
    DROP TRIGGER IF EXISTS trg_update_attribution_revenue_jobs ON public.jobs;
    CREATE TRIGGER trg_update_attribution_revenue_jobs
      AFTER UPDATE ON public.jobs
      FOR EACH ROW
      EXECUTE FUNCTION public.update_attribution_revenue();
  END IF;
END $$;

-- ============================================================
-- 9. ANALYTICS VIEWS
-- ============================================================

-- View: Lead Source Performance
CREATE OR REPLACE VIEW public.v_lead_source_performance AS
SELECT 
  ls.id,
  ls.workspace_id,
  ls.name AS source_name,
  ls.channel_type,
  COUNT(DISTINCT la.lead_id) AS total_leads,
  COUNT(DISTINCT CASE WHEN l.status IN ('won', 'completed', 'approved') THEN la.lead_id END) AS booked_estimates,
  COUNT(DISTINCT CASE WHEN j.id IS NOT NULL THEN la.lead_id END) AS jobs_won,
  COALESCE(SUM(la.revenue_attributed), 0) AS total_revenue,
  COALESCE(SUM(la.cost_to_acquire), 0) AS total_cost,
  CASE 
    WHEN SUM(la.cost_to_acquire) > 0 THEN
      ROUND(((SUM(la.revenue_attributed) - SUM(la.cost_to_acquire)) / SUM(la.cost_to_acquire)) * 100, 2)
    ELSE NULL
  END AS roi_percentage,
  CASE 
    WHEN COUNT(DISTINCT la.lead_id) > 0 THEN
      ROUND((COUNT(DISTINCT CASE WHEN l.status IN ('won', 'completed', 'approved') THEN la.lead_id END)::numeric / COUNT(DISTINCT la.lead_id)) * 100, 2)
    ELSE 0
  END AS close_rate,
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN l.status IN ('won', 'completed', 'approved') THEN la.lead_id END) > 0 THEN
      ROUND(SUM(la.cost_to_acquire) / COUNT(DISTINCT CASE WHEN l.status IN ('won', 'completed', 'approved') THEN la.lead_id END), 2)
    ELSE NULL
  END AS cost_per_booked_estimate,
  CASE 
    WHEN COUNT(DISTINCT CASE WHEN j.id IS NOT NULL THEN la.lead_id END) > 0 THEN
      ROUND(SUM(la.cost_to_acquire) / COUNT(DISTINCT CASE WHEN j.id IS NOT NULL THEN la.lead_id END), 2)
    ELSE NULL
  END AS cost_per_job
FROM public.lead_sources ls
LEFT JOIN public.lead_attributions la ON ls.id = la.source_id
LEFT JOIN public.leads l ON la.lead_id = l.id
LEFT JOIN public.roofing_jobs j ON l.id = j.lead_id AND j.status = 'completed'
WHERE ls.is_active = true
GROUP BY ls.id, ls.workspace_id, ls.name, ls.channel_type;

-- View: Campaign Performance
CREATE OR REPLACE VIEW public.v_campaign_performance AS
SELECT 
  lc.id,
  lc.workspace_id,
  lc.name AS campaign_name,
  lc.medium,
  lc.offer,
  COUNT(DISTINCT la.lead_id) AS total_leads,
  COUNT(DISTINCT CASE WHEN l.status IN ('won', 'completed', 'approved') THEN la.lead_id END) AS booked_estimates,
  COUNT(DISTINCT CASE WHEN j.id IS NOT NULL THEN la.lead_id END) AS jobs_won,
  COALESCE(SUM(la.revenue_attributed), 0) AS total_revenue,
  COALESCE(SUM(la.cost_to_acquire), 0) AS total_cost,
  CASE 
    WHEN SUM(la.cost_to_acquire) > 0 THEN
      ROUND(((SUM(la.revenue_attributed) - SUM(la.cost_to_acquire)) / SUM(la.cost_to_acquire)) * 100, 2)
    ELSE NULL
  END AS roi_percentage,
  CASE 
    WHEN COUNT(DISTINCT la.lead_id) > 0 THEN
      ROUND((COUNT(DISTINCT CASE WHEN l.status IN ('won', 'completed', 'approved') THEN la.lead_id END)::numeric / COUNT(DISTINCT la.lead_id)) * 100, 2)
    ELSE 0
  END AS close_rate
FROM public.lead_campaigns lc
LEFT JOIN public.lead_attributions la ON lc.id = la.campaign_id
LEFT JOIN public.leads l ON la.lead_id = l.id
LEFT JOIN public.roofing_jobs j ON l.id = j.lead_id AND j.status = 'completed'
WHERE lc.is_active = true
GROUP BY lc.id, lc.workspace_id, lc.name, lc.medium, lc.offer;

-- Grant access to views
GRANT SELECT ON public.v_lead_source_performance TO authenticated;
GRANT SELECT ON public.v_campaign_performance TO authenticated;

-- ============================================================
-- 10. SEED DEFAULT LEAD SOURCES
-- ============================================================
-- Note: This will be done per workspace via API, but we can create a function for it
CREATE OR REPLACE FUNCTION public.seed_default_lead_sources(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.lead_sources (workspace_id, name, channel_type)
  VALUES
    (p_workspace_id, 'Cold Email', 'outbound'),
    (p_workspace_id, 'Phone Call', 'inbound'),
    (p_workspace_id, 'Website Form', 'inbound'),
    (p_workspace_id, 'Referral', 'inbound'),
    (p_workspace_id, 'QR Code', 'offline'),
    (p_workspace_id, 'Yard Sign', 'offline'),
    (p_workspace_id, 'Door Hanger', 'offline'),
    (p_workspace_id, 'Google Business', 'online'),
    (p_workspace_id, 'Social Media', 'online'),
    (p_workspace_id, 'Direct Mail', 'offline')
  ON CONFLICT (workspace_id, name) DO NOTHING;
END;
$$;
