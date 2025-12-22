-- SmartSend Experiments System
-- A/B/n testing with Thompson Sampling + Per-Step Variants + Auto-Winner

-- 0.1 Variants, Metrics, Deliveries
CREATE TABLE IF NOT EXISTS public.campaign_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL DEFAULT 0, -- 0 for single campaigns, 0,1,2... for sequences
  name TEXT NOT NULL, -- "Variant A", "Variant B", etc.
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  objective TEXT NOT NULL DEFAULT 'reply' CHECK (objective IN ('open', 'click', 'reply')),
  min_impressions INTEGER NOT NULL DEFAULT 100, -- Minimum impressions before auto-winner
  is_winner BOOLEAN DEFAULT FALSE,
  is_paused BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(campaign_id, step_index, name)
);

CREATE INDEX idx_campaign_variants_campaign_step ON public.campaign_variants(campaign_id, step_index);
CREATE INDEX idx_campaign_variants_winner ON public.campaign_variants(is_winner) WHERE is_winner = true;

-- Variant metrics tracking
CREATE TABLE IF NOT EXISTS public.variant_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES public.campaign_variants(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  opens INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  replies INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(variant_id)
);

CREATE INDEX idx_variant_metrics_campaign_step ON public.variant_metrics(campaign_id, step_index);

-- Delivery tracking with variant assignment
CREATE TABLE IF NOT EXISTS public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES public.campaign_variants(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'bounced', 'failed')),
  UNIQUE(campaign_id, contact_id, step_index)
);

CREATE INDEX idx_deliveries_campaign_variant ON public.deliveries(campaign_id, variant_id);
CREATE INDEX idx_deliveries_contact ON public.deliveries(contact_id);

-- 0.2 Tracking tokens carry delivery & variant
-- Add delivery_id and variant_id to existing tracking_tokens table
ALTER TABLE IF EXISTS public.tracking_tokens 
ADD COLUMN IF NOT EXISTS delivery_id UUID REFERENCES public.deliveries(id),
ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.campaign_variants(id);

CREATE INDEX IF NOT EXISTS idx_tracking_tokens_delivery ON public.tracking_tokens(delivery_id);
CREATE INDEX IF NOT EXISTS idx_tracking_tokens_variant ON public.tracking_tokens(variant_id);

-- 0.3 RPC helpers
-- Function to get variant metrics for a campaign step
CREATE OR REPLACE FUNCTION public.get_variant_metrics(
  p_campaign_id UUID,
  p_step_index INTEGER DEFAULT 0
) RETURNS TABLE (
  variant_id UUID,
  variant_name TEXT,
  impressions INTEGER,
  opens INTEGER,
  clicks INTEGER,
  replies INTEGER,
  open_rate NUMERIC,
  click_rate NUMERIC,
  reply_rate NUMERIC,
  is_winner BOOLEAN
) LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT 
    v.id as variant_id,
    v.name as variant_name,
    COALESCE(vm.impressions, 0) as impressions,
    COALESCE(vm.opens, 0) as opens,
    COALESCE(vm.clicks, 0) as clicks,
    COALESCE(vm.replies, 0) as replies,
    CASE 
      WHEN vm.impressions > 0 THEN ROUND((vm.opens::NUMERIC / vm.impressions) * 100, 2)
      ELSE 0 
    END as open_rate,
    CASE 
      WHEN vm.impressions > 0 THEN ROUND((vm.clicks::NUMERIC / vm.impressions) * 100, 2)
      ELSE 0 
    END as click_rate,
    CASE 
      WHEN vm.impressions > 0 THEN ROUND((vm.replies::NUMERIC / vm.impressions) * 100, 2)
      ELSE 0 
    END as reply_rate,
    v.is_winner
  FROM public.campaign_variants v
  LEFT JOIN public.variant_metrics vm ON v.id = vm.variant_id
  WHERE v.campaign_id = p_campaign_id 
    AND v.step_index = p_step_index
    AND NOT v.is_paused
  ORDER BY v.name;
END;
$$;

-- Function to auto-declare winner based on objective
CREATE OR REPLACE FUNCTION public.auto_declare_winner(
  p_campaign_id UUID,
  p_step_index INTEGER DEFAULT 0
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_winner_id UUID;
  v_objective TEXT;
  v_min_impressions INTEGER;
BEGIN
  -- Get campaign objective and min impressions
  SELECT objective, min_impressions INTO v_objective, v_min_impressions
  FROM public.campaign_variants 
  WHERE campaign_id = p_campaign_id AND step_index = p_step_index 
  LIMIT 1;
  
  -- Find variant with best performance that meets min impressions
  SELECT v.id INTO v_winner_id
  FROM public.campaign_variants v
  JOIN public.variant_metrics vm ON v.id = vm.variant_id
  WHERE v.campaign_id = p_campaign_id 
    AND v.step_index = p_step_index
    AND vm.impressions >= v.min_impressions
    AND NOT v.is_paused
  ORDER BY 
    CASE v_objective
      WHEN 'reply' THEN vm.replies::NUMERIC / NULLIF(vm.impressions, 0)
      WHEN 'click' THEN vm.clicks::NUMERIC / NULLIF(vm.impressions, 0)
      WHEN 'open' THEN vm.opens::NUMERIC / NULLIF(vm.impressions, 0)
      ELSE 0
    END DESC NULLS LAST
  LIMIT 1;
  
  -- If winner found, mark it
  IF v_winner_id IS NOT NULL THEN
    UPDATE public.campaign_variants 
    SET is_winner = true, updated_at = NOW()
    WHERE id = v_winner_id;
    
    -- Pause other variants
    UPDATE public.campaign_variants 
    SET is_paused = true, updated_at = NOW()
    WHERE campaign_id = p_campaign_id 
      AND step_index = p_step_index 
      AND id != v_winner_id;
  END IF;
  
  RETURN v_winner_id;
END;
$$;

-- Enable RLS
ALTER TABLE public.campaign_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variant_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own campaign variants" ON public.campaign_variants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c 
      WHERE c.id = campaign_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage own campaign variants" ON public.campaign_variants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c 
      WHERE c.id = campaign_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own variant metrics" ON public.variant_metrics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c 
      WHERE c.id = campaign_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can view own deliveries" ON public.deliveries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c 
      WHERE c.id = campaign_id AND c.user_id = auth.uid()
    )
  ); 