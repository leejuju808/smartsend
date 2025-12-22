-- =========================================================
-- Block 259800 — SmartSend Owner Control Center v1
-- Master control panel for roofing company owners:
-- - Global pricing guardrails
-- - Safety + compliance rules
-- - Automation toggles
-- - Crew / sales / production / branding / comms / alerts policies
-- =========================================================

-- NOTE: This block is workspace-scoped. "company" in the spec maps to
-- public.workspaces in this schema.

-- ============================================================================
-- 1. TABLE: owner_settings (key/value JSON per workspace)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.owner_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  setting_key text NOT NULL,
  setting_value jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT owner_settings_workspace_key_unique UNIQUE (workspace_id, setting_key)
);

CREATE INDEX IF NOT EXISTS idx_owner_settings_workspace_key
  ON public.owner_settings(workspace_id, setting_key);

COMMENT ON TABLE public.owner_settings IS
  'Block 259800: High-level owner policies as JSON (crew rules, sales rules, production limits, branding, comms, alerts) per workspace';

COMMENT ON COLUMN public.owner_settings.setting_key IS
  'Namespace key for owner policies. Expected keys: crew_rules, sales_rules, production_rules, branding_policies, communication_policies, owner_alert_policies';

-- ============================================================================
-- 2. TABLE: automation_toggles (simple on/off switches per workspace)
-- ============================================================================

-- We keep both a human-readable name and a stable slug so the app can
-- safely reference toggles like `ai_outreach`, `missed_call_texting`, etc.

CREATE TABLE IF NOT EXISTS public.automation_toggles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  slug text NOT NULL, -- stable key: ai_outreach, missed_call_texting, etc.
  name text NOT NULL, -- display label
  category text,      -- optional grouping: outreach, billing, scheduling, safety, etc.
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_toggles_workspace_slug_unique UNIQUE (workspace_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_automation_toggles_workspace
  ON public.automation_toggles(workspace_id);

COMMENT ON TABLE public.automation_toggles IS
  'Block 259800: Workspace-level on/off switches for core automations (AI outreach, missed-call texting, payments, dispatch alerts, etc.).';

COMMENT ON COLUMN public.automation_toggles.slug IS
  'Stable machine key for a toggle (ai_outreach, payment_reminders, scheduling_auto_assign, etc.).';

-- ============================================================================
-- 3. TABLE: global_pricing_rules (margin + discount guardrails)
-- ============================================================================

-- This is the money-protection brain.
-- Values are stored as:
-- - min_margin_percent: 0–100 (e.g. 28 = 28%)
-- - max_discount_percent: 0–100 (e.g. 5 = 5%)
-- - seasonal_multiplier: multiplier factor (e.g. 1.12 = +12%)

CREATE TABLE IF NOT EXISTS public.global_pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Guardrails
  min_margin_percent numeric(5,2) NOT NULL DEFAULT 28.00
    CHECK (min_margin_percent >= 0 AND min_margin_percent <= 100),
  max_discount_percent numeric(5,2) NOT NULL DEFAULT 5.00
    CHECK (max_discount_percent >= 0 AND max_discount_percent <= 100),
  seasonal_multiplier numeric(5,2) NOT NULL DEFAULT 1.00
    CHECK (seasonal_multiplier >= 0.50 AND seasonal_multiplier <= 2.00),
  adjust_for_supply_cost boolean NOT NULL DEFAULT true,

  -- Extra knobs for future expansion
  pricing_mode text NOT NULL DEFAULT 'mixed'
    CHECK (pricing_mode IN ('retail', 'insurance', 'mixed')),
  roof_type_multipliers jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT global_pricing_rules_workspace_unique UNIQUE (workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_global_pricing_rules_workspace
  ON public.global_pricing_rules(workspace_id);

COMMENT ON TABLE public.global_pricing_rules IS
  'Block 259800: Workspace-level pricing guardrails (min margin, max discount, seasonal multiplier, supply-cost adjustment, roof-type multipliers).';

COMMENT ON COLUMN public.global_pricing_rules.min_margin_percent IS
  'Minimum allowed job margin in percent points (0–100). Example: 28 = 28% minimum margin.';

COMMENT ON COLUMN public.global_pricing_rules.max_discount_percent IS
  'Maximum allowed discount off list price in percent points (0–100). Example: 5 = 5% max discount.';

COMMENT ON COLUMN public.global_pricing_rules.seasonal_multiplier IS
  'Multiplier applied during storm / busy seasons. Example: 1.12 = +12% pricing uplift.';

COMMENT ON COLUMN public.global_pricing_rules.roof_type_multipliers IS
  'JSON map of roof_type → multiplier (e.g. {"steep":"1.15","tile":"1.20"}).';

-- ============================================================================
-- 4. TABLE: safety_rules (company-wide safety enforcement config)
-- ============================================================================

-- This table defines high-level owner safety policies that other flows use:
-- - Required photos/checklists before job start
-- - PPE confirmations
-- - Ladder placement photos
-- - Hazard reporting requirements, etc.

CREATE TABLE IF NOT EXISTS public.safety_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  rule_name text NOT NULL,
  code text, -- optional short key: ladder_photo_required, ppe_required, etc.
  enforcement jsonb NOT NULL, -- required_photos, required_checklists, block_job_start, severity, etc.
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safety_rules_workspace_rule_unique UNIQUE (workspace_id, rule_name)
);

CREATE INDEX IF NOT EXISTS idx_safety_rules_workspace_active
  ON public.safety_rules(workspace_id)
  WHERE is_active = true;

COMMENT ON TABLE public.safety_rules IS
  'Block 259800: Owner-defined safety enforcement rules (required photos, checklists, PPE, hazard reporting) per workspace.';

COMMENT ON COLUMN public.safety_rules.enforcement IS
  'JSON payload describing enforcement: {required_photos:[], required_checklists:[], block_job_start:boolean, severity:text}.';

-- ============================================================================
-- 5. TIMESTAMP TRIGGERS
-- ============================================================================

-- Reuse the shared update_updated_at_column() helper if it exists.
-- If not, define a minimal version.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'update_updated_at_column'
      AND pg_function_is_visible(oid)
  ) THEN
    CREATE OR REPLACE FUNCTION public.update_updated_at_column()
    RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_owner_settings_updated_at ON public.owner_settings;
CREATE TRIGGER trg_owner_settings_updated_at
BEFORE UPDATE ON public.owner_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_automation_toggles_updated_at ON public.automation_toggles;
CREATE TRIGGER trg_automation_toggles_updated_at
BEFORE UPDATE ON public.automation_toggles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_global_pricing_rules_updated_at ON public.global_pricing_rules;
CREATE TRIGGER trg_global_pricing_rules_updated_at
BEFORE UPDATE ON public.global_pricing_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_safety_rules_updated_at ON public.safety_rules;
CREATE TRIGGER trg_safety_rules_updated_at
BEFORE UPDATE ON public.safety_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 6. RLS POLICIES
-- ============================================================================

ALTER TABLE public.owner_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_toggles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_rules ENABLE ROW LEVEL SECURITY;

-- Helper predicates: workspace_members table already powers other blocks.

-- owner_settings: everyone in the workspace can read; only owner/admin can modify

CREATE POLICY "owner_settings_select_workspace_members"
  ON public.owner_settings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = owner_settings.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "owner_settings_modify_owner_admin"
  ON public.owner_settings
  FOR INSERT, UPDATE, DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = owner_settings.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = owner_settings.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- automation_toggles

CREATE POLICY "automation_toggles_select_workspace_members"
  ON public.automation_toggles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = automation_toggles.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "automation_toggles_modify_owner_admin"
  ON public.automation_toggles
  FOR INSERT, UPDATE, DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = automation_toggles.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = automation_toggles.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- global_pricing_rules

CREATE POLICY "global_pricing_rules_select_workspace_members"
  ON public.global_pricing_rules
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = global_pricing_rules.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "global_pricing_rules_modify_owner_admin"
  ON public.global_pricing_rules
  FOR INSERT, UPDATE, DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = global_pricing_rules.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = global_pricing_rules.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- safety_rules

CREATE POLICY "safety_rules_select_workspace_members"
  ON public.safety_rules
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = safety_rules.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "safety_rules_modify_owner_admin"
  ON public.safety_rules
  FOR INSERT, UPDATE, DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = safety_rules.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.workspace_id = safety_rules.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.role IN ('owner', 'admin')
    )
  );

-- ============================================================================
-- 7. HELPER FUNCTIONS
-- ============================================================================

-- 7.1 Get or create global pricing rules for a workspace

CREATE OR REPLACE FUNCTION public.get_global_pricing_rules(p_workspace_id uuid)
RETURNS public.global_pricing_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rules public.global_pricing_rules;
BEGIN
  SELECT * INTO v_rules
  FROM public.global_pricing_rules
  WHERE workspace_id = p_workspace_id;

  IF NOT FOUND THEN
    INSERT INTO public.global_pricing_rules (workspace_id)
    VALUES (p_workspace_id)
    RETURNING * INTO v_rules;
  END IF;

  RETURN v_rules;
END;
$$;

COMMENT ON FUNCTION public.get_global_pricing_rules IS
  'Block 259800: Get or create global pricing rules row for a workspace.';

-- 7.2 Validate a proposed price against global pricing rules
-- Returns: {ok: boolean, message: text}
-- p_margin_percent: proposed job margin as percent points (0–100)
-- p_discount_percent: requested discount off list as percent points (0–100)

CREATE OR REPLACE FUNCTION public.validate_pricing_guardrails(
  p_workspace_id uuid,
  p_margin_percent numeric,
  p_discount_percent numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rules public.global_pricing_rules;
  v_ok boolean := true;
  v_message text := 'OK';
BEGIN
  v_rules := public.get_global_pricing_rules(p_workspace_id);

  IF p_margin_percent < v_rules.min_margin_percent THEN
    v_ok := false;
    v_message := format(
      'BLOCKED: Margin too low (%.2f%%). Minimum allowed is %.2f%%.',
      p_margin_percent,
      v_rules.min_margin_percent
    );
    RETURN jsonb_build_object('ok', v_ok, 'message', v_message);
  END IF;

  IF p_discount_percent > v_rules.max_discount_percent THEN
    v_ok := false;
    v_message := format(
      'BLOCKED: Discount too high (%.2f%%). Maximum allowed is %.2f%%.',
      p_discount_percent,
      v_rules.max_discount_percent
    );
    RETURN jsonb_build_object('ok', v_ok, 'message', v_message);
  END IF;

  RETURN jsonb_build_object('ok', true, 'message', 'OK');
END;
$$;

COMMENT ON FUNCTION public.validate_pricing_guardrails IS
  'Block 259800: Validate proposed pricing against workspace-level min margin and max discount guardrails.';

-- 7.3 Convenience function to fetch all active safety rules for a workspace

CREATE OR REPLACE FUNCTION public.get_active_safety_rules(p_workspace_id uuid)
RETURNS SETOF public.safety_rules
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.safety_rules
  WHERE workspace_id = p_workspace_id
    AND is_active = true
$$;

COMMENT ON FUNCTION public.get_active_safety_rules IS
  'Block 259800: Return all active safety rules for a workspace for enforcement in crew/daily log flows.';

-- ============================================================================
-- 8. GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_toggles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.global_pricing_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.safety_rules TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_global_pricing_rules(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_pricing_guardrails(uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_safety_rules(uuid) TO authenticated;

-- ============================================================================
-- END Block 259800 — Owner Control Center v1 (DB Layer)
-- ============================================================================














