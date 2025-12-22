-- Block 236: Campaign A/B Test Engine v1
-- Template Variant Splits, Performance Tracking, Auto-Winner Selection
-- Migration: 20250130000002_template_variants_ab_test.sql

-- Create template_variants table for A/B testing
CREATE TABLE IF NOT EXISTS public.template_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.templates(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
  name text NOT NULL,        -- "A", "B", etc.
  subject text NOT NULL,
  body text NOT NULL,
  weight int DEFAULT 50,     -- % distribution
  sends int DEFAULT 0,
  opens int DEFAULT 0,
  clicks int DEFAULT 0,
  replies int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add winner_variant_id to campaigns table
ALTER TABLE public.campaigns 
  ADD COLUMN IF NOT EXISTS winner_variant_id uuid REFERENCES public.template_variants(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_template_variants_campaign ON public.template_variants(campaign_id);
CREATE INDEX IF NOT EXISTS idx_template_variants_template ON public.template_variants(template_id);
CREATE INDEX IF NOT EXISTS idx_template_variants_name ON public.template_variants(campaign_id, name);

-- Ensure variant_id column exists in send_queue (for tracking which variant was used)
ALTER TABLE public.send_queue 
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.template_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_send_queue_variant ON public.send_queue(variant_id) WHERE variant_id IS NOT NULL;

-- Ensure variant_id column exists in send_logs (for tracking which variant was used)
ALTER TABLE public.send_logs 
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.template_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_send_logs_variant ON public.send_logs(variant_id) WHERE variant_id IS NOT NULL;

-- Ensure variant_id column exists in email_events (for tracking opens/clicks/replies)
ALTER TABLE public.email_events 
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.template_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_email_events_variant ON public.email_events(variant_id) WHERE variant_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.template_variants ENABLE ROW LEVEL SECURITY;

-- RLS policies: Users can only access variants for campaigns they own
CREATE POLICY IF NOT EXISTS "template_variants_select" ON public.template_variants
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = template_variants.campaign_id
      AND (
        c.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = c.workspace_id
          AND wm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY IF NOT EXISTS "template_variants_insert" ON public.template_variants
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = template_variants.campaign_id
      AND (
        c.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = c.workspace_id
          AND wm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY IF NOT EXISTS "template_variants_update" ON public.template_variants
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = template_variants.campaign_id
      AND (
        c.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = c.workspace_id
          AND wm.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY IF NOT EXISTS "template_variants_delete" ON public.template_variants
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = template_variants.campaign_id
      AND (
        c.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.workspace_members wm
          WHERE wm.workspace_id = c.workspace_id
          AND wm.user_id = auth.uid()
        )
      )
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_template_variants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trg_template_variants_updated_at ON public.template_variants;
CREATE TRIGGER trg_template_variants_updated_at
  BEFORE UPDATE ON public.template_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_template_variants_updated_at();

-- Function to increment variant metrics atomically
CREATE OR REPLACE FUNCTION increment_variant_metric(
  p_variant_id uuid,
  p_metric text -- 'sends', 'opens', 'clicks', 'replies'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_metric = 'sends' THEN
    UPDATE public.template_variants
    SET sends = sends + 1
    WHERE id = p_variant_id;
  ELSIF p_metric = 'opens' THEN
    UPDATE public.template_variants
    SET opens = opens + 1
    WHERE id = p_variant_id;
  ELSIF p_metric = 'clicks' THEN
    UPDATE public.template_variants
    SET clicks = clicks + 1
    WHERE id = p_variant_id;
  ELSIF p_metric = 'replies' THEN
    UPDATE public.template_variants
    SET replies = replies + 1
    WHERE id = p_variant_id;
  END IF;
END;
$$;

-- View for variant stats (for dashboard display)
CREATE OR REPLACE VIEW public.variant_stats AS
SELECT
  tv.id as variant_id,
  tv.campaign_id,
  tv.name,
  tv.weight,
  tv.sends,
  tv.opens,
  tv.clicks,
  tv.replies,
  CASE 
    WHEN tv.sends > 0 THEN ROUND(100.0 * tv.opens / tv.sends, 2)
    ELSE 0
  END as open_rate,
  CASE 
    WHEN tv.sends > 0 THEN ROUND(100.0 * tv.clicks / tv.sends, 2)
    ELSE 0
  END as click_rate,
  CASE 
    WHEN tv.sends > 0 THEN ROUND(100.0 * tv.replies / tv.sends, 2)
    ELSE 0
  END as reply_rate,
  c.winner_variant_id = tv.id as is_winner
FROM public.template_variants tv
JOIN public.campaigns c ON c.id = tv.campaign_id;










