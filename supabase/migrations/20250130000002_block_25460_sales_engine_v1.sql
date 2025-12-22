-- =========================================================
-- Block 25460 — SmartSend Roofing Sales Engine v1
-- (Inspection Booking Funnels • Quote Delivery • Sales Scripts • 
--  Price Presentation • Close Rate Boosts • Sales Rep Performance Tools)
-- =========================================================
-- 
-- THE SALES ENGINE THAT MAKES ROOFING COMPANIES CLOSE MORE JOBS — ZERO FLUFF.
-- This is the part of SmartSend that directly increases job approvals.
--
-- Features:
-- 1. Inspection Booking Funnels (instant scheduling, AI reminders, confirmation scripts)
-- 2. Digital Quote Delivery (interactive quotes with photos, findings, options)
-- 3. Sales Scripts (inspection → quote → close, objection handling)
-- 4. Price Presentation Engine (Good/Better/Best, anchoring, visual options)
-- 5. Photo-Driven Sales (problem/context/recommendation photo organization)
-- 6. Insurance Explanation Engine (auto-generated explanations)
-- 7. Follow-Up Engine (sales version with quote follow-up sequences)
-- 8. Sales Rep Performance Dashboard (close rate, avg job value, follow-up metrics)
-- 9. Sales Team Coaching Engine (AI coaching based on conversations)

-- ============================================================================
-- 1. INSPECTION BOOKING FUNNELS ENHANCEMENTS
-- ============================================================================

-- Enhance schedule_bookings table with sales engine fields
ALTER TABLE IF EXISTS public.schedule_bookings
  ADD COLUMN IF NOT EXISTS booking_link TEXT,
  ADD COLUMN IF NOT EXISTS inspector_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inspector_name TEXT,
  ADD COLUMN IF NOT EXISTS inspector_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS inspector_experience_years INTEGER,
  ADD COLUMN IF NOT EXISTS confirmation_script_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_24hr_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_1hr_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_on_way_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS inspection_confirmation_text TEXT;

-- Create inspection booking reminders table
CREATE TABLE IF NOT EXISTS public.inspection_booking_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.schedule_bookings(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('24hr', '1hr', 'on_way', 'confirmation')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  email_sent BOOLEAN DEFAULT false,
  sms_sent BOOLEAN DEFAULT false,
  
  message_text TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspection_reminders_booking_id 
  ON public.inspection_booking_reminders(booking_id);
CREATE INDEX IF NOT EXISTS idx_inspection_reminders_scheduled_at 
  ON public.inspection_booking_reminders(scheduled_at) WHERE sent_at IS NULL;

-- ============================================================================
-- 2. DIGITAL QUOTE DELIVERY ENHANCEMENTS
-- ============================================================================

-- Enhance quotes table for interactive digital quotes
ALTER TABLE IF EXISTS public.quotes
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quote_type TEXT CHECK (quote_type IN ('retail', 'insurance', 'hybrid')) DEFAULT 'retail',
  ADD COLUMN IF NOT EXISTS is_interactive BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS quote_url TEXT,
  ADD COLUMN IF NOT EXISTS viewed_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS time_spent_viewing INTEGER DEFAULT 0, -- seconds
  ADD COLUMN IF NOT EXISTS before_after_photos JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS inspection_findings TEXT,
  ADD COLUMN IF NOT EXISTS job_scope TEXT,
  ADD COLUMN IF NOT EXISTS materials_list JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS color_options JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS product_education JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS upgrade_options JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS financing_options JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS insurance_explanation TEXT,
  ADD COLUMN IF NOT EXISTS sales_rep_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quote_presentation_data JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_quotes_workspace_id ON public.quotes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_quotes_contact_id ON public.quotes(contact_id);
CREATE INDEX IF NOT EXISTS idx_quotes_sales_rep_id ON public.quotes(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_quotes_viewed_at ON public.quotes(last_viewed_at) WHERE last_viewed_at IS NOT NULL;

-- Quote view analytics table
CREATE TABLE IF NOT EXISTS public.quote_view_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  view_started_at TIMESTAMPTZ NOT NULL,
  view_ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  sections_viewed JSONB DEFAULT '[]'::jsonb, -- ['photos', 'pricing', 'options', 'insurance']
  interactions JSONB DEFAULT '[]'::jsonb, -- clicks, scrolls, etc.
  device_type TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_analytics_quote_id 
  ON public.quote_view_analytics(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_analytics_contact_id 
  ON public.quote_view_analytics(contact_id);

-- ============================================================================
-- 3. SALES SCRIPTS SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sales_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  script_type TEXT NOT NULL CHECK (script_type IN (
    'inspection',
    'quote_delivery',
    'close_retail',
    'close_insurance',
    'objection_price',
    'objection_think_about_it',
    'objection_getting_quotes',
    'objection_talk_to_spouse',
    'objection_wait',
    'objection_other'
  )),
  
  script_name TEXT NOT NULL,
  script_content TEXT NOT NULL,
  script_structure JSONB DEFAULT '{}'::jsonb, -- sections, talking points, etc.
  
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  success_rate NUMERIC(5,2), -- percentage
  
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_scripts_workspace_type 
  ON public.sales_scripts(workspace_id, script_type, is_active);
CREATE INDEX IF NOT EXISTS idx_sales_scripts_default 
  ON public.sales_scripts(workspace_id, script_type, is_default) WHERE is_default = true;

-- Sales script usage tracking
CREATE TABLE IF NOT EXISTS public.sales_script_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_id UUID NOT NULL REFERENCES public.sales_scripts(id) ON DELETE CASCADE,
  sales_rep_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome TEXT CHECK (outcome IN ('closed', 'pending', 'lost', 'objection')),
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_script_usage_rep_id 
  ON public.sales_script_usage(sales_rep_id, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_script_usage_script_id 
  ON public.sales_script_usage(script_id);

-- ============================================================================
-- 4. PRICE PRESENTATION ENGINE (Good/Better/Best Options)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.quote_pricing_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  tier_name TEXT NOT NULL CHECK (tier_name IN ('good', 'better', 'best')),
  display_order INTEGER NOT NULL DEFAULT 1,
  
  -- Pricing
  price NUMERIC(12,2) NOT NULL,
  price_label TEXT, -- e.g., "Starting at $X"
  
  -- Value Anchoring
  value_anchor_text TEXT, -- e.g., "Your roof has 3 major issues..."
  value_proposition TEXT,
  
  -- Materials
  materials_list JSONB DEFAULT '[]'::jsonb,
  warranty_years INTEGER,
  warranty_details TEXT,
  
  -- Upgrade Benefits
  upgrade_benefits JSONB DEFAULT '[]'::jsonb,
  
  -- Visual Options
  color_options JSONB DEFAULT '[]'::jsonb,
  shingle_styles JSONB DEFAULT '[]'::jsonb,
  upgrade_visuals JSONB DEFAULT '[]'::jsonb,
  
  -- Selection tracking
  is_selected BOOLEAN DEFAULT false,
  selected_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pricing_tiers_quote_id 
  ON public.quote_pricing_tiers(quote_id, display_order);
CREATE INDEX IF NOT EXISTS idx_pricing_tiers_selected 
  ON public.quote_pricing_tiers(quote_id, is_selected) WHERE is_selected = true;

-- Price anchoring data
ALTER TABLE IF EXISTS public.quotes
  ADD COLUMN IF NOT EXISTS value_anchor_text TEXT,
  ADD COLUMN IF NOT EXISTS value_anchor_shown BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_anchor_amount NUMERIC(12,2);

-- ============================================================================
-- 5. PHOTO-DRIVEN SALES (Inspection Photos → Closing)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.inspection_photo_organization (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID, -- References schedule_bookings or contact inspection
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  photo_category TEXT NOT NULL CHECK (photo_category IN (
    'problem',
    'context',
    'recommendation',
    'before_after'
  )),
  
  attachment_id UUID REFERENCES public.attachments(id) ON DELETE SET NULL,
  photo_url TEXT,
  
  -- Problem Photos
  problem_type TEXT, -- 'shingle_cracks', 'granule_loss', 'lifted_shingles', 'flashing_issues'
  problem_description TEXT,
  problem_severity TEXT CHECK (problem_severity IN ('minor', 'moderate', 'severe', 'critical')),
  
  -- Context Photos
  context_type TEXT, -- 'overall_roof', 'chimney', 'valleys', 'gutters'
  
  -- Recommendation Photos
  recommendation_type TEXT, -- 'new_materials', 'color_options', 'upgrade_options'
  recommendation_description TEXT,
  
  -- Photo Story Presentation
  story_order INTEGER DEFAULT 1,
  story_caption TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_photo_org_inspection_id 
  ON public.inspection_photo_organization(inspection_id);
CREATE INDEX IF NOT EXISTS idx_photo_org_contact_id 
  ON public.inspection_photo_organization(contact_id);
CREATE INDEX IF NOT EXISTS idx_photo_org_quote_id 
  ON public.inspection_photo_organization(quote_id);
CREATE INDEX IF NOT EXISTS idx_photo_org_category 
  ON public.inspection_photo_organization(photo_category, story_order);

-- Photo story presentations
CREATE TABLE IF NOT EXISTS public.photo_story_presentations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  sales_rep_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  presentation_type TEXT NOT NULL CHECK (presentation_type IN (
    'problem_impact_solution',
    'before_after',
    'upgrade_comparison'
  )),
  
  story_flow JSONB DEFAULT '[]'::jsonb, -- ordered array of photo IDs with captions
  presentation_url TEXT,
  
  viewed_at TIMESTAMPTZ,
  shared_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_photo_story_contact_id 
  ON public.photo_story_presentations(contact_id);
CREATE INDEX IF NOT EXISTS idx_photo_story_quote_id 
  ON public.photo_story_presentations(quote_id);

-- ============================================================================
-- 6. INSURANCE EXPLANATION ENGINE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.insurance_explanations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  insurance_metadata_id UUID REFERENCES public.insurance_metadata(id) ON DELETE SET NULL,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  explanation_type TEXT NOT NULL CHECK (explanation_type IN (
    'full_explanation',
    'acv',
    'rcv',
    'depreciation',
    'supplement',
    'deductible',
    'o_and_p'
  )),
  
  -- Explanation Content
  explanation_text TEXT NOT NULL,
  explanation_simple_terms TEXT, -- simplified version
  explanation_visual_data JSONB DEFAULT '{}'::jsonb, -- charts, diagrams
  
  -- Financial Breakdown
  acv_amount NUMERIC(12,2),
  rcv_amount NUMERIC(12,2),
  depreciation_amount NUMERIC(12,2),
  deductible_amount NUMERIC(12,2),
  o_and_p_amount NUMERIC(12,2),
  homeowner_portion NUMERIC(12,2),
  insurance_portion NUMERIC(12,2),
  
  -- Generation Metadata
  is_auto_generated BOOLEAN DEFAULT true,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  presented_at TIMESTAMPTZ,
  understood_by_homeowner BOOLEAN,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_explanations_contact_id 
  ON public.insurance_explanations(contact_id);
CREATE INDEX IF NOT EXISTS idx_insurance_explanations_quote_id 
  ON public.insurance_explanations(quote_id);
CREATE INDEX IF NOT EXISTS idx_insurance_explanations_type 
  ON public.insurance_explanations(explanation_type);

-- ============================================================================
-- 7. FOLLOW-UP ENGINE (Sales Version)
-- ============================================================================

-- Enhance existing quote_followup_sequences table
ALTER TABLE IF EXISTS public.quote_followup_sequences
  ADD COLUMN IF NOT EXISTS sales_rep_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS followup_type TEXT CHECK (followup_type IN ('standard', 'hot_lead', 'insurance', 'objection')) DEFAULT 'standard';

-- Sales-specific follow-up stages
CREATE TABLE IF NOT EXISTS public.sales_followup_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES public.quote_followup_sequences(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  stage_number INTEGER NOT NULL CHECK (stage_number BETWEEN 1 AND 7),
  stage_name TEXT NOT NULL,
  
  -- Day 1: "Any questions about the options?"
  -- Day 2: "Want me to walk you through the inspection photos?"
  -- Day 4: "We can schedule install this week."
  -- Day 7: "Want me to re-check the roof for free?"
  
  trigger_days INTEGER NOT NULL, -- days after quote sent
  message_subject TEXT,
  message_body TEXT,
  message_type TEXT CHECK (message_type IN ('email', 'sms', 'call')) DEFAULT 'email',
  
  sent_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_followup_stages_sequence_id 
  ON public.sales_followup_stages(sequence_id, stage_number);
CREATE INDEX IF NOT EXISTS idx_sales_followup_stages_trigger_days 
  ON public.sales_followup_stages(sequence_id, trigger_days) WHERE sent_at IS NULL;

-- ============================================================================
-- 8. SALES REP PERFORMANCE DASHBOARD
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sales_rep_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_rep_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Time Period
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')) DEFAULT 'monthly',
  
  -- Close Rate Metrics
  total_quotes_sent INTEGER DEFAULT 0,
  total_quotes_accepted INTEGER DEFAULT 0,
  total_quotes_rejected INTEGER DEFAULT 0,
  close_rate NUMERIC(5,2), -- percentage
  
  -- Revenue Metrics
  total_job_value NUMERIC(12,2) DEFAULT 0,
  avg_job_value NUMERIC(12,2) DEFAULT 0,
  total_revenue NUMERIC(12,2) DEFAULT 0,
  
  -- Follow-Up Metrics
  avg_followup_speed_hours NUMERIC(10,2), -- hours from quote sent to first follow-up
  followup_consistency_score NUMERIC(5,2), -- percentage of follow-ups sent on time
  total_followups_sent INTEGER DEFAULT 0,
  
  -- Quote Analytics
  avg_quote_view_time_seconds INTEGER DEFAULT 0,
  quote_view_rate NUMERIC(5,2), -- percentage of quotes viewed
  quote_interaction_score NUMERIC(5,2), -- based on sections viewed, time spent
  
  -- Inspection Metrics
  total_inspections_booked INTEGER DEFAULT 0,
  inspections_to_quote_time_hours NUMERIC(10,2), -- avg hours from inspection to quote sent
  
  -- Homeowner Satisfaction
  homeowner_satisfaction_score NUMERIC(5,2), -- 0-100
  total_reviews INTEGER DEFAULT 0,
  avg_review_rating NUMERIC(3,2),
  
  -- Rankings
  close_rate_rank INTEGER,
  revenue_rank INTEGER,
  overall_rank INTEGER,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(sales_rep_id, workspace_id, period_start, period_end, period_type)
);

CREATE INDEX IF NOT EXISTS idx_sales_rep_perf_rep_id 
  ON public.sales_rep_performance(sales_rep_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_sales_rep_perf_workspace 
  ON public.sales_rep_performance(workspace_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_sales_rep_perf_close_rate 
  ON public.sales_rep_performance(workspace_id, close_rate DESC) WHERE close_rate IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_rep_perf_revenue 
  ON public.sales_rep_performance(workspace_id, total_revenue DESC);

-- Real-time performance snapshots
CREATE TABLE IF NOT EXISTS public.sales_rep_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_rep_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Current Period Stats
  current_close_rate NUMERIC(5,2),
  current_avg_job_value NUMERIC(12,2),
  current_total_revenue NUMERIC(12,2),
  current_followup_score NUMERIC(5,2),
  
  -- Comparison to Previous Period
  close_rate_change NUMERIC(5,2), -- percentage point change
  revenue_change NUMERIC(12,2), -- dollar change
  followup_score_change NUMERIC(5,2),
  
  -- Trends
  trend_direction TEXT CHECK (trend_direction IN ('up', 'down', 'stable')),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(sales_rep_id, workspace_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_sales_rep_snapshots_rep_id 
  ON public.sales_rep_performance_snapshots(sales_rep_id, snapshot_date DESC);

-- ============================================================================
-- 9. SALES TEAM COACHING ENGINE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sales_coaching_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_rep_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Source of Coaching Data
  conversation_id UUID, -- References inbox_threads or similar
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  
  -- Coaching Insights
  coaching_type TEXT NOT NULL CHECK (coaching_type IN (
    'talked_too_much',
    'talked_too_little',
    'skipped_upgrade_explanation',
    'skipped_value_anchor',
    'timeline_not_explained',
    'insurance_not_explained',
    'objection_not_handled',
    'price_presentation_weak',
    'photo_story_not_used',
    'followup_too_slow',
    'other'
  )),
  
  coaching_message TEXT NOT NULL, -- e.g., "You talked too much in last call"
  coaching_details TEXT,
  coaching_recommendation TEXT,
  
  -- Analysis Data
  conversation_analysis JSONB DEFAULT '{}'::jsonb,
  detected_issues JSONB DEFAULT '[]'::jsonb,
  suggested_improvements JSONB DEFAULT '[]'::jsonb,
  
  -- Status
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  is_applied BOOLEAN DEFAULT false,
  applied_at TIMESTAMPTZ,
  
  -- AI Generation Metadata
  is_ai_generated BOOLEAN DEFAULT true,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coaching_reports_rep_id 
  ON public.sales_coaching_reports(sales_rep_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_reports_unread 
  ON public.sales_coaching_reports(sales_rep_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_coaching_reports_type 
  ON public.sales_coaching_reports(coaching_type);

-- Coaching action items
CREATE TABLE IF NOT EXISTS public.sales_coaching_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coaching_report_id UUID NOT NULL REFERENCES public.sales_coaching_reports(id) ON DELETE CASCADE,
  sales_rep_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  action_type TEXT NOT NULL CHECK (action_type IN (
    'use_script',
    'practice_objection',
    'improve_timing',
    'add_value_anchor',
    'explain_upgrades',
    'use_photo_story',
    'improve_followup',
    'other'
  )),
  
  action_title TEXT NOT NULL,
  action_description TEXT,
  action_priority TEXT CHECK (action_priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
  
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coaching_actions_rep_id 
  ON public.sales_coaching_actions(sales_rep_id, is_completed, due_date);
CREATE INDEX IF NOT EXISTS idx_coaching_actions_coaching_id 
  ON public.sales_coaching_actions(coaching_report_id);

-- ============================================================================
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Inspection Booking Reminders
ALTER TABLE public.inspection_booking_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view inspection reminders"
  ON public.inspection_booking_reminders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = inspection_booking_reminders.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Quote View Analytics
ALTER TABLE public.quote_view_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view quote analytics"
  ON public.quote_view_analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = quote_view_analytics.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Sales Scripts
ALTER TABLE public.sales_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view sales scripts"
  ON public.sales_scripts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = sales_scripts.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "Workspace admins can manage sales scripts"
  ON public.sales_scripts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = sales_scripts.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- Quote Pricing Tiers
ALTER TABLE public.quote_pricing_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view pricing tiers"
  ON public.quote_pricing_tiers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = quote_pricing_tiers.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Inspection Photo Organization
ALTER TABLE public.inspection_photo_organization ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view photo organization"
  ON public.inspection_photo_organization FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = inspection_photo_organization.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Insurance Explanations
ALTER TABLE public.insurance_explanations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view insurance explanations"
  ON public.insurance_explanations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = insurance_explanations.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Sales Rep Performance
ALTER TABLE public.sales_rep_performance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view sales rep performance"
  ON public.sales_rep_performance FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = sales_rep_performance.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- Sales Coaching Reports
ALTER TABLE public.sales_coaching_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sales reps can view their own coaching reports"
  ON public.sales_coaching_reports FOR SELECT
  USING (
    sales_rep_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = sales_coaching_reports.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- 11. FUNCTIONS & TRIGGERS
-- ============================================================================

-- Function to update quote view count
CREATE OR REPLACE FUNCTION public.increment_quote_view_count(p_quote_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.quotes
  SET viewed_count = COALESCE(viewed_count, 0) + 1,
      last_viewed_at = now()
  WHERE id = p_quote_id;
END;
$$;

-- Function to calculate sales rep close rate
CREATE OR REPLACE FUNCTION public.calculate_sales_rep_close_rate(
  p_sales_rep_id UUID,
  p_workspace_id UUID,
  p_period_start DATE,
  p_period_end DATE
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_sent INTEGER;
  v_total_accepted INTEGER;
  v_close_rate NUMERIC;
BEGIN
  SELECT COUNT(*)
  INTO v_total_sent
  FROM public.quotes
  WHERE sales_rep_id = p_sales_rep_id
    AND workspace_id = p_workspace_id
    AND sent_at BETWEEN p_period_start AND p_period_end;
  
  SELECT COUNT(*)
  INTO v_total_accepted
  FROM public.quotes
  WHERE sales_rep_id = p_sales_rep_id
    AND workspace_id = p_workspace_id
    AND status = 'accepted'
    AND sent_at BETWEEN p_period_start AND p_period_end;
  
  IF v_total_sent > 0 THEN
    v_close_rate := ROUND((v_total_accepted::NUMERIC / v_total_sent::NUMERIC) * 100, 2);
  ELSE
    v_close_rate := 0;
  END IF;
  
  RETURN v_close_rate;
END;
$$;

-- Trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_sales_engine_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sales_scripts_updated_at
  BEFORE UPDATE ON public.sales_scripts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_sales_engine_updated_at();

CREATE TRIGGER trg_sales_rep_performance_updated_at
  BEFORE UPDATE ON public.sales_rep_performance
  FOR EACH ROW
  EXECUTE FUNCTION public.update_sales_engine_updated_at();

-- ============================================================================
-- 12. SEED DEFAULT SALES SCRIPTS
-- ============================================================================

-- Insert default sales scripts (global templates)
INSERT INTO public.sales_scripts (workspace_id, script_type, script_name, script_content, is_default, is_active)
VALUES
  -- Inspection Script
  (NULL, 'inspection', 'Default Inspection Script', 
   '1. Build trust: Introduce yourself and company
2. Ask homeowner goals: What are you hoping to learn today?
3. Show photos: Walk through what we''re seeing
4. Educate: Explain damage types and implications
5. Explain damage: Point out specific issues
6. Explain fix: How we would address each issue
7. Explain options: Good/Better/Best if applicable
8. Set expectation: Quote will arrive within 24-48 hours', 
   true, true),
  
  -- Quote Delivery Script
  (NULL, 'quote_delivery', 'Default Quote Delivery Script',
   'Here''s what we found during the inspection...
Here''s what we recommend...
Here''s what happens next...', 
   true, true),
  
  -- Close Script (Retail)
  (NULL, 'close_retail', 'Default Retail Close Script',
   'Which option fits you best — good, better, or best?', 
   true, true),
  
  -- Close Script (Insurance)
  (NULL, 'close_insurance', 'Default Insurance Close Script',
   'Insurance covers most of this. Your only cost is deductible + upgrades.', 
   true, true),
  
  -- Objection: Price Too High
  (NULL, 'objection_price', 'Price Objection Response',
   'I understand price is important. Let me show you the value you''re getting...', 
   true, true),
  
  -- Objection: Need to Think About It
  (NULL, 'objection_think_about_it', 'Think About It Response',
   'Absolutely, take your time. What specific questions can I answer?', 
   true, true),
  
  -- Objection: Getting More Quotes
  (NULL, 'objection_getting_quotes', 'Getting Quotes Response',
   'That''s smart to compare. Here''s what makes us different...', 
   true, true),
  
  -- Objection: Talk to Spouse
  (NULL, 'objection_talk_to_spouse', 'Talk to Spouse Response',
   'Great idea. Would it help if I send a summary they can review?', 
   true, true),
  
  -- Objection: Wait
  (NULL, 'objection_wait', 'Wait Response',
   'I understand. What''s your timeline? We can lock in pricing if you''re ready.', 
   true, true)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.inspection_booking_reminders IS 'AI reminder series for inspection bookings (24hr → 1hr → on way)';
COMMENT ON TABLE public.quote_view_analytics IS 'Tracks homeowner engagement with interactive quotes';
COMMENT ON TABLE public.sales_scripts IS 'Proven sales scripts for inspection → quote → close process';
COMMENT ON TABLE public.quote_pricing_tiers IS 'Good/Better/Best pricing options with value anchoring';
COMMENT ON TABLE public.inspection_photo_organization IS 'Organizes inspection photos into problem/context/recommendation categories';
COMMENT ON TABLE public.insurance_explanations IS 'Auto-generated insurance explanations (ACV, RCV, depreciation, etc.)';
COMMENT ON TABLE public.sales_rep_performance IS 'Sales rep performance metrics: close rate, avg job value, follow-up speed';
COMMENT ON TABLE public.sales_coaching_reports IS 'AI coaching insights for sales reps based on conversation analysis';




































