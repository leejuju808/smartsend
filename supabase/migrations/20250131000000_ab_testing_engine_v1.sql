-- Block 79000 — SmartSend Roofing
-- A/B Testing Engine + Conversion Optimizer v1
-- Complete, clean implementation

-- ============================================================================
-- 1. AB_VARIANTS TABLE — Test variants (A, B, C, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ab_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  template_id uuid, -- Optional reference to email_templates
  variant_label text NOT NULL, -- "A", "B", "C"
  subject text NOT NULL,
  body text NOT NULL,
  persona_id uuid, -- Optional persona reference
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, variant_label)
);

CREATE INDEX IF NOT EXISTS idx_ab_variants_campaign ON public.ab_variants(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ab_variants_label ON public.ab_variants(campaign_id, variant_label);

-- ============================================================================
-- 2. AB_METRICS TABLE — Real-time performance tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ab_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES public.ab_variants(id) ON DELETE CASCADE,
  sends integer NOT NULL DEFAULT 0,
  opens integer NOT NULL DEFAULT 0,
  replies integer NOT NULL DEFAULT 0,
  booked_estimates integer NOT NULL DEFAULT 0,
  closed_jobs integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(variant_id)
);

CREATE INDEX IF NOT EXISTS idx_ab_metrics_variant ON public.ab_metrics(variant_id);

-- ============================================================================
-- 3. AB_WINNERS TABLE — Winning variant assignments
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ab_winners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  winning_variant uuid NOT NULL REFERENCES public.ab_variants(id) ON DELETE CASCADE,
  reason text, -- Why this variant won
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id) -- One winner per campaign
);

CREATE INDEX IF NOT EXISTS idx_ab_winners_campaign ON public.ab_winners(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ab_winners_variant ON public.ab_winners(winning_variant);

-- ============================================================================
-- 4. AB_VARIANT_ASSIGNMENTS TABLE — Track which lead got which variant
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ab_variant_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.ab_variants(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  send_queue_id uuid, -- Reference to send_queue if exists
  zip_code text, -- For ZIP code performance tracking
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, lead_id) -- One variant per lead per campaign
);

CREATE INDEX IF NOT EXISTS idx_ab_assignments_campaign ON public.ab_variant_assignments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ab_assignments_variant ON public.ab_variant_assignments(variant_id);
CREATE INDEX IF NOT EXISTS idx_ab_assignments_lead ON public.ab_variant_assignments(lead_id);
CREATE INDEX IF NOT EXISTS idx_ab_assignments_zip ON public.ab_variant_assignments(campaign_id, zip_code);

-- ============================================================================
-- 5. AB_ZIP_PERFORMANCE TABLE — ZIP code performance layer
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ab_zip_performance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.ab_variants(id) ON DELETE CASCADE,
  zip_code text NOT NULL,
  sends integer NOT NULL DEFAULT 0,
  opens integer NOT NULL DEFAULT 0,
  replies integer NOT NULL DEFAULT 0,
  booked_estimates integer NOT NULL DEFAULT 0,
  closed_jobs integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id, variant_id, zip_code)
);

CREATE INDEX IF NOT EXISTS idx_ab_zip_campaign ON public.ab_zip_performance(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ab_zip_variant ON public.ab_zip_performance(variant_id);
CREATE INDEX IF NOT EXISTS idx_ab_zip_code ON public.ab_zip_performance(zip_code);

-- ============================================================================
-- 6. Add variant_id to send_queue for tracking
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'send_queue') THEN
    ALTER TABLE public.send_queue ADD COLUMN IF NOT EXISTS ab_variant_id uuid REFERENCES public.ab_variants(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_send_queue_ab_variant ON public.send_queue(ab_variant_id);
  END IF;
END $$;

-- ============================================================================
-- 7. Update triggers for updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_ab_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ab_variants_updated_at
  BEFORE UPDATE ON public.ab_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_ab_updated_at();

CREATE TRIGGER trg_ab_metrics_updated_at
  BEFORE UPDATE ON public.ab_metrics
  FOR EACH ROW
  EXECUTE FUNCTION update_ab_updated_at();

CREATE TRIGGER trg_ab_zip_performance_updated_at
  BEFORE UPDATE ON public.ab_zip_performance
  FOR EACH ROW
  EXECUTE FUNCTION update_ab_updated_at();

-- ============================================================================
-- 8. Function: Initialize metrics for a variant
-- ============================================================================
CREATE OR REPLACE FUNCTION initialize_ab_metrics(p_variant_id uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO public.ab_metrics (variant_id)
  VALUES (p_variant_id)
  ON CONFLICT (variant_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. Function: Increment metric counters
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_ab_metric(
  p_variant_id uuid,
  p_metric_type text, -- 'send', 'open', 'reply', 'booked_estimate', 'closed_job'
  p_increment integer DEFAULT 1,
  p_zip_code text DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- Update main metrics
  INSERT INTO public.ab_metrics (variant_id, sends, opens, replies, booked_estimates, closed_jobs)
  VALUES (
    p_variant_id,
    CASE WHEN p_metric_type = 'send' THEN p_increment ELSE 0 END,
    CASE WHEN p_metric_type = 'open' THEN p_increment ELSE 0 END,
    CASE WHEN p_metric_type = 'reply' THEN p_increment ELSE 0 END,
    CASE WHEN p_metric_type = 'booked_estimate' THEN p_increment ELSE 0 END,
    CASE WHEN p_metric_type = 'closed_job' THEN p_increment ELSE 0 END
  )
  ON CONFLICT (variant_id) DO UPDATE SET
    sends = ab_metrics.sends + CASE WHEN p_metric_type = 'send' THEN p_increment ELSE 0 END,
    opens = ab_metrics.opens + CASE WHEN p_metric_type = 'open' THEN p_increment ELSE 0 END,
    replies = ab_metrics.replies + CASE WHEN p_metric_type = 'reply' THEN p_increment ELSE 0 END,
    booked_estimates = ab_metrics.booked_estimates + CASE WHEN p_metric_type = 'booked_estimate' THEN p_increment ELSE 0 END,
    closed_jobs = ab_metrics.closed_jobs + CASE WHEN p_metric_type = 'closed_job' THEN p_increment ELSE 0 END,
    updated_at = now();

  -- Update ZIP code performance if zip_code provided
  IF p_zip_code IS NOT NULL AND p_campaign_id IS NOT NULL THEN
    INSERT INTO public.ab_zip_performance (
      campaign_id, variant_id, zip_code,
      sends, opens, replies, booked_estimates, closed_jobs
    )
    VALUES (
      p_campaign_id,
      p_variant_id,
      p_zip_code,
      CASE WHEN p_metric_type = 'send' THEN p_increment ELSE 0 END,
      CASE WHEN p_metric_type = 'open' THEN p_increment ELSE 0 END,
      CASE WHEN p_metric_type = 'reply' THEN p_increment ELSE 0 END,
      CASE WHEN p_metric_type = 'booked_estimate' THEN p_increment ELSE 0 END,
      CASE WHEN p_metric_type = 'closed_job' THEN p_increment ELSE 0 END
    )
    ON CONFLICT (campaign_id, variant_id, zip_code) DO UPDATE SET
      sends = ab_zip_performance.sends + CASE WHEN p_metric_type = 'send' THEN p_increment ELSE 0 END,
      opens = ab_zip_performance.opens + CASE WHEN p_metric_type = 'open' THEN p_increment ELSE 0 END,
      replies = ab_zip_performance.replies + CASE WHEN p_metric_type = 'reply' THEN p_increment ELSE 0 END,
      booked_estimates = ab_zip_performance.booked_estimates + CASE WHEN p_metric_type = 'booked_estimate' THEN p_increment ELSE 0 END,
      closed_jobs = ab_zip_performance.closed_jobs + CASE WHEN p_metric_type = 'closed_job' THEN p_increment ELSE 0 END,
      updated_at = now();
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 10. Function: Select winner based on performance
-- ============================================================================
CREATE OR REPLACE FUNCTION select_ab_winner(p_campaign_id uuid)
RETURNS uuid AS $$
DECLARE
  v_winner_id uuid;
  v_reason text;
  v_best_reply_rate numeric;
  v_best_estimate_rate numeric;
  v_best_job_rate numeric;
BEGIN
  -- Find variant with best overall performance
  -- Priority: closed_jobs > booked_estimates > replies > opens
  SELECT 
    variant_id,
    CASE 
      WHEN sends > 0 THEN (closed_jobs::numeric / sends * 100)
      ELSE 0
    END as job_rate,
    CASE 
      WHEN sends > 0 THEN (booked_estimates::numeric / sends * 100)
      ELSE 0
    END as estimate_rate,
    CASE 
      WHEN sends > 0 THEN (replies::numeric / sends * 100)
      ELSE 0
    END as reply_rate
  INTO v_winner_id, v_best_job_rate, v_best_estimate_rate, v_best_reply_rate
  FROM public.ab_metrics am
  JOIN public.ab_variants av ON av.id = am.variant_id
  WHERE av.campaign_id = p_campaign_id
    AND am.sends >= 10 -- Minimum sends for statistical significance
  ORDER BY 
    (closed_jobs::numeric / NULLIF(sends, 0)) DESC NULLS LAST,
    (booked_estimates::numeric / NULLIF(sends, 0)) DESC NULLS LAST,
    (replies::numeric / NULLIF(sends, 0)) DESC NULLS LAST,
    (opens::numeric / NULLIF(sends, 0)) DESC NULLS LAST
  LIMIT 1;

  IF v_winner_id IS NOT NULL THEN
    -- Set reason
    v_reason := format(
      'Winner selected: %s%% closed jobs, %s%% booked estimates, %s%% reply rate',
      ROUND(v_best_job_rate, 2),
      ROUND(v_best_estimate_rate, 2),
      ROUND(v_best_reply_rate, 2)
    );

    -- Insert or update winner
    INSERT INTO public.ab_winners (campaign_id, winning_variant, reason)
    VALUES (p_campaign_id, v_winner_id, v_reason)
    ON CONFLICT (campaign_id) DO UPDATE SET
      winning_variant = EXCLUDED.winning_variant,
      reason = EXCLUDED.reason,
      created_at = now();
  END IF;

  RETURN v_winner_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 11. Function: Assign variant to lead (with automatic splitting)
-- ============================================================================
CREATE OR REPLACE FUNCTION assign_ab_variant(
  p_campaign_id uuid,
  p_lead_id uuid,
  p_zip_code text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_variant_id uuid;
  v_variants uuid[];
  v_variant_count integer;
  v_winner_id uuid;
  v_assignment_count integer;
BEGIN
  -- Check if winner already selected
  SELECT winning_variant INTO v_winner_id
  FROM public.ab_winners
  WHERE campaign_id = p_campaign_id;

  -- Get all active variants
  SELECT ARRAY_AGG(id ORDER BY variant_label) INTO v_variants
  FROM public.ab_variants
  WHERE campaign_id = p_campaign_id;

  IF v_variants IS NULL OR array_length(v_variants, 1) = 0 THEN
    RETURN NULL;
  END IF;

  v_variant_count := array_length(v_variants, 1);

  -- If winner selected, use winner for remaining 40% of sends
  -- Otherwise, split evenly (20% each for up to 3 variants, remaining 40% split)
  IF v_winner_id IS NOT NULL THEN
    -- Check if we should use winner (60% chance) or test variants (40%)
    IF random() < 0.6 THEN
      v_variant_id := v_winner_id;
    ELSE
      -- Use random variant from non-winners for continued testing
      v_variant_id := v_variants[1 + floor(random() * v_variant_count)::integer];
    END IF;
  ELSE
    -- Even split: 20% each for first 3 variants, remaining split evenly
    IF v_variant_count <= 3 THEN
      -- Even split
      v_variant_id := v_variants[1 + floor(random() * v_variant_count)::integer];
    ELSE
      -- First 3 get 20% each, remaining 40% split among others
      IF random() < 0.6 THEN
        -- First 3 variants (20% each = 60% total)
        v_variant_id := v_variants[1 + floor(random() * 3)::integer];
      ELSE
        -- Remaining variants (40% split)
        v_variant_id := v_variants[4 + floor(random() * (v_variant_count - 3))::integer];
      END IF;
    END IF;
  END IF;

  -- Record assignment
  INSERT INTO public.ab_variant_assignments (campaign_id, variant_id, lead_id, zip_code)
  VALUES (p_campaign_id, v_variant_id, p_lead_id, p_zip_code)
  ON CONFLICT (campaign_id, lead_id) DO UPDATE SET
    variant_id = EXCLUDED.variant_id,
    zip_code = COALESCE(EXCLUDED.zip_code, ab_variant_assignments.zip_code);

  RETURN v_variant_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 12. View: Variant performance summary
-- ============================================================================
CREATE OR REPLACE VIEW public.v_ab_variant_performance AS
SELECT 
  av.id as variant_id,
  av.campaign_id,
  av.variant_label,
  av.subject,
  COALESCE(am.sends, 0) as sends,
  COALESCE(am.opens, 0) as opens,
  COALESCE(am.replies, 0) as replies,
  COALESCE(am.booked_estimates, 0) as booked_estimates,
  COALESCE(am.closed_jobs, 0) as closed_jobs,
  CASE 
    WHEN COALESCE(am.sends, 0) > 0 THEN ROUND((am.opens::numeric / am.sends * 100), 2)
    ELSE 0
  END as open_rate_pct,
  CASE 
    WHEN COALESCE(am.sends, 0) > 0 THEN ROUND((am.replies::numeric / am.sends * 100), 2)
    ELSE 0
  END as reply_rate_pct,
  CASE 
    WHEN COALESCE(am.sends, 0) > 0 THEN ROUND((am.booked_estimates::numeric / am.sends * 100), 2)
    ELSE 0
  END as booked_rate_pct,
  CASE 
    WHEN COALESCE(am.sends, 0) > 0 THEN ROUND((am.closed_jobs::numeric / am.sends * 100), 2)
    ELSE 0
  END as close_rate_pct,
  aw.winning_variant = av.id as is_winner,
  av.created_at,
  av.updated_at
FROM public.ab_variants av
LEFT JOIN public.ab_metrics am ON am.variant_id = av.id
LEFT JOIN public.ab_winners aw ON aw.campaign_id = av.campaign_id
ORDER BY av.campaign_id, av.variant_label;

-- ============================================================================
-- 13. View: ZIP code performance
-- ============================================================================
CREATE OR REPLACE VIEW public.v_ab_zip_performance AS
SELECT 
  azp.campaign_id,
  azp.variant_id,
  av.variant_label,
  azp.zip_code,
  azp.sends,
  azp.opens,
  azp.replies,
  azp.booked_estimates,
  azp.closed_jobs,
  CASE 
    WHEN azp.sends > 0 THEN ROUND((azp.opens::numeric / azp.sends * 100), 2)
    ELSE 0
  END as open_rate_pct,
  CASE 
    WHEN azp.sends > 0 THEN ROUND((azp.replies::numeric / azp.sends * 100), 2)
    ELSE 0
  END as reply_rate_pct,
  CASE 
    WHEN azp.sends > 0 THEN ROUND((azp.booked_estimates::numeric / azp.sends * 100), 2)
    ELSE 0
  END as booked_rate_pct
FROM public.ab_zip_performance azp
JOIN public.ab_variants av ON av.id = azp.variant_id
ORDER BY azp.campaign_id, azp.zip_code, azp.replies DESC;

-- ============================================================================
-- 14. RLS Policies
-- ============================================================================
ALTER TABLE public.ab_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_winners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_variant_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_zip_performance ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "ab_variants_service_role_all" ON public.ab_variants
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "ab_metrics_service_role_all" ON public.ab_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "ab_winners_service_role_all" ON public.ab_winners
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "ab_assignments_service_role_all" ON public.ab_variant_assignments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "ab_zip_service_role_all" ON public.ab_zip_performance
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can access variants for their campaigns
CREATE POLICY "ab_variants_select_own" ON public.ab_variants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = ab_variants.campaign_id
        AND (c.user_id = auth.uid() OR c.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        ))
    )
  );

CREATE POLICY "ab_variants_insert_own" ON public.ab_variants
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = ab_variants.campaign_id
        AND (c.user_id = auth.uid() OR c.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        ))
    )
  );

CREATE POLICY "ab_variants_update_own" ON public.ab_variants
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = ab_variants.campaign_id
        AND (c.user_id = auth.uid() OR c.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        ))
    )
  );

CREATE POLICY "ab_metrics_select_own" ON public.ab_metrics
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.ab_variants av
      JOIN public.campaigns c ON c.id = av.campaign_id
      WHERE av.id = ab_metrics.variant_id
        AND (c.user_id = auth.uid() OR c.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        ))
    )
  );

CREATE POLICY "ab_winners_select_own" ON public.ab_winners
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = ab_winners.campaign_id
        AND (c.user_id = auth.uid() OR c.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        ))
    )
  );

CREATE POLICY "ab_assignments_select_own" ON public.ab_variant_assignments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = ab_variant_assignments.campaign_id
        AND (c.user_id = auth.uid() OR c.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        ))
    )
  );

CREATE POLICY "ab_zip_select_own" ON public.ab_zip_performance
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = ab_zip_performance.campaign_id
        AND (c.user_id = auth.uid() OR c.workspace_id IN (
          SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
        ))
    )
  );

-- ============================================================================
-- 15. Grant permissions
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ab_variants TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ab_metrics TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ab_winners TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ab_variant_assignments TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ab_zip_performance TO service_role;

GRANT SELECT ON public.v_ab_variant_performance TO authenticated, service_role;
GRANT SELECT ON public.v_ab_zip_performance TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION initialize_ab_metrics(uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION increment_ab_metric(uuid, text, integer) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION select_ab_winner(uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION assign_ab_variant(uuid, uuid, text) TO service_role, authenticated;



























