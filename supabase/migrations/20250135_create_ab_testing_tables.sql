-- A/B Testing Tables for Campaigns and Sequences
-- This migration adds comprehensive A/B testing capabilities

-- Main A/B tests table
CREATE TABLE IF NOT EXISTS public.ab_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_kind text NOT NULL CHECK (parent_kind IN ('campaign', 'sequence')),
  parent_id uuid NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'running' CHECK (status IN ('running', 'completed')),
  winner_variant_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- A/B test variants table
CREATE TABLE IF NOT EXISTS public.ab_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ab_test_id uuid NOT NULL REFERENCES public.ab_tests(id) ON DELETE CASCADE,
  subject text,
  body_text text,
  body_html text,
  traffic_split int DEFAULT 50 CHECK (traffic_split > 0 AND traffic_split <= 100),
  created_at timestamptz DEFAULT now()
);

-- Add variant_id to events table for tracking
ALTER TABLE IF EXISTS public.events 
ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.ab_variants(id);

-- Add variant_id to email_events table for tracking
ALTER TABLE IF EXISTS public.email_events 
ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.ab_variants(id);

-- Add variant_id to campaign_recipients for tracking
ALTER TABLE IF EXISTS public.campaign_recipients 
ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.ab_variants(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ab_tests_parent ON public.ab_tests(parent_kind, parent_id);
CREATE INDEX IF NOT EXISTS idx_ab_tests_status ON public.ab_tests(status);
CREATE INDEX IF NOT EXISTS idx_ab_variants_test ON public.ab_variants(ab_test_id);
CREATE INDEX IF NOT EXISTS idx_events_variant ON public.events(variant_id);
CREATE INDEX IF NOT EXISTS idx_email_events_variant ON public.email_events(variant_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_variant ON public.campaign_recipients(variant_id);

-- Function to get variant for A/B testing
CREATE OR REPLACE FUNCTION public.get_ab_test_variant(
  p_parent_kind text,
  p_parent_id uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_test_id uuid;
  v_variant_id uuid;
  v_total_weight int;
  v_random_value int;
  v_current_weight int;
BEGIN
  -- Get active A/B test for this parent
  SELECT id INTO v_test_id
  FROM public.ab_tests
  WHERE parent_kind = p_parent_kind 
    AND parent_id = p_parent_id 
    AND status = 'running';
  
  IF v_test_id IS NULL THEN
    RETURN NULL; -- No active test
  END IF;
  
  -- Get variants and calculate total weight
  SELECT COALESCE(SUM(traffic_split), 0) INTO v_total_weight
  FROM public.ab_variants
  WHERE ab_test_id = v_test_id;
  
  IF v_total_weight = 0 THEN
    RETURN NULL; -- No variants
  END IF;
  
  -- Generate random number and select variant based on weight
  v_random_value = floor(random() * v_total_weight);
  v_current_weight = 0;
  
  FOR v_variant_id IN 
    SELECT id, traffic_split
    FROM public.ab_variants
    WHERE ab_test_id = v_test_id
    ORDER BY created_at
  LOOP
    v_current_weight := v_current_weight + v_variant_id.traffic_split;
    IF v_random_value < v_current_weight THEN
      RETURN v_variant_id.id;
    END IF;
  END LOOP;
  
  -- Fallback to first variant
  SELECT id INTO v_variant_id
  FROM public.ab_variants
  WHERE ab_test_id = v_test_id
  ORDER BY created_at
  LIMIT 1;
  
  RETURN v_variant_id;
END;
$$;

-- Function to declare winner
CREATE OR REPLACE FUNCTION public.declare_ab_test_winner(
  p_test_id uuid,
  p_winner_variant_id uuid
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Update test status and winner
  UPDATE public.ab_tests
  SET winner_variant_id = p_winner_variant_id,
      status = 'completed',
      updated_at = now()
  WHERE id = p_test_id;
  
  -- Log the winner declaration
  INSERT INTO public.events (event, meta)
  VALUES ('ab_test_winner_declared', jsonb_build_object(
    'test_id', p_test_id,
    'winner_variant_id', p_winner_variant_id,
    'declared_at', now()
  ));
END;
$$;

-- Enable RLS
ALTER TABLE public.ab_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ab_variants ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ab_tests
CREATE POLICY "Users can view own ab_tests" ON public.ab_tests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c 
      WHERE c.id = parent_id AND c.user_id = auth.uid() AND parent_kind = 'campaign'
      UNION
      SELECT 1 FROM public.sequences s 
      WHERE s.id = parent_id AND s.created_by = auth.uid() AND parent_kind = 'sequence'
    )
  );

CREATE POLICY "Users can manage own ab_tests" ON public.ab_tests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c 
      WHERE c.id = parent_id AND c.user_id = auth.uid() AND parent_kind = 'campaign'
      UNION
      SELECT 1 FROM public.sequences s 
      WHERE s.id = parent_id AND s.created_by = auth.uid() AND parent_kind = 'sequence'
    )
  );

-- RLS Policies for ab_variants
CREATE POLICY "Users can view own ab_variants" ON public.ab_variants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.ab_tests t
      JOIN public.campaigns c ON c.id = t.parent_id AND t.parent_kind = 'campaign'
      WHERE t.id = ab_test_id AND c.user_id = auth.uid()
      UNION
      SELECT 1 FROM public.ab_tests t
      JOIN public.sequences s ON s.id = t.parent_id AND t.parent_kind = 'sequence'
      WHERE t.id = ab_test_id AND s.created_by = auth.uid()
    )
  );

CREATE POLICY "Users can manage own ab_variants" ON public.ab_variants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.ab_tests t
      JOIN public.campaigns c ON c.id = t.parent_id AND t.parent_kind = 'campaign'
      WHERE t.id = ab_test_id AND c.user_id = auth.uid()
      UNION
      SELECT 1 FROM public.ab_tests t
      JOIN public.sequences s ON s.id = t.parent_id AND t.parent_kind = 'sequence'
      WHERE t.id = ab_test_id AND s.created_by = auth.uid()
    )
  );

-- Touch updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_ab_tests_updated_at() 
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ab_tests_touch 
  BEFORE UPDATE ON public.ab_tests
  FOR EACH ROW 
  EXECUTE FUNCTION public.touch_ab_tests_updated_at(); 