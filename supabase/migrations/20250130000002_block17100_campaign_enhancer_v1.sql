-- =========================================================
-- Block 17100 — SmartSend AI Campaign Enhancer v1
-- (The Intelligence Layer That Rewrites, Improves, Localizes & Storm-Optimizes Every Campaign Before Sending)
-- =========================================================

-- Add enhancement metadata columns to campaigns_new
ALTER TABLE IF EXISTS public.campaigns_new
  ADD COLUMN IF NOT EXISTS enhanced_subject text,
  ADD COLUMN IF NOT EXISTS enhanced_body_html text,
  ADD COLUMN IF NOT EXISTS enhanced_body_text text,
  ADD COLUMN IF NOT EXISTS enhancement_report jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS enhancement_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS enhanced_at timestamptz;

-- Add enhancement metadata to campaign_recipients_new for per-recipient enhancement
ALTER TABLE IF EXISTS public.campaign_recipients_new
  ADD COLUMN IF NOT EXISTS enhanced_subject text,
  ADD COLUMN IF NOT EXISTS enhanced_body_html text,
  ADD COLUMN IF NOT EXISTS enhanced_body_text text,
  ADD COLUMN IF NOT EXISTS enhancement_applied boolean DEFAULT false;

-- Create index for enhancement queries
CREATE INDEX IF NOT EXISTS idx_campaigns_new_enhanced_at 
  ON public.campaigns_new(enhanced_at) 
  WHERE enhanced_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_recipients_new_enhancement_applied 
  ON public.campaign_recipients_new(enhancement_applied) 
  WHERE enhancement_applied = true;

-- Comments
COMMENT ON COLUMN public.campaigns_new.enhanced_subject IS 'AI-generated optimized subject line';
COMMENT ON COLUMN public.campaigns_new.enhanced_body_html IS 'AI-enhanced HTML body with personalization, localization, and storm optimization';
COMMENT ON COLUMN public.campaigns_new.enhanced_body_text IS 'AI-enhanced plain text body';
COMMENT ON COLUMN public.campaigns_new.enhancement_report IS 'JSON report of enhancements applied (personalization, storm context, deliverability fixes, etc.)';
COMMENT ON COLUMN public.campaigns_new.enhancement_enabled IS 'Whether AI enhancement is enabled for this campaign';
COMMENT ON COLUMN public.campaigns_new.enhanced_at IS 'Timestamp when campaign was last enhanced';





















































