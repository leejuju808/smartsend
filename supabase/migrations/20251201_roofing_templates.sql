-- =========================================================
-- Block 8770 — Roofing Campaign Templates
-- =========================================================

CREATE TABLE IF NOT EXISTS public.roofing_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  recommended_for text,  -- "storm_damage", "inspection", "reactivation", "canvas"
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.roofing_template_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.roofing_templates(id) ON DELETE CASCADE,
  step_order int NOT NULL,
  delay_days int NOT NULL DEFAULT 0,
  subject text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_roofing_template_steps_template_id ON public.roofing_template_steps(template_id);
CREATE INDEX IF NOT EXISTS idx_roofing_template_steps_order ON public.roofing_template_steps(template_id, step_order);

-- Enable RLS (Row Level Security)
ALTER TABLE public.roofing_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roofing_template_steps ENABLE ROW LEVEL SECURITY;

-- Allow public read access to templates (they're shared templates)
CREATE POLICY IF NOT EXISTS "roofing_templates_select_all" ON public.roofing_templates
  FOR SELECT USING (true);

CREATE POLICY IF NOT EXISTS "roofing_template_steps_select_all" ON public.roofing_template_steps
  FOR SELECT USING (true);


























































