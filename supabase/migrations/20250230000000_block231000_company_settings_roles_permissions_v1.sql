-- =========================================================
-- Block 231000 — SmartSend Roofing Company Settings + Roles & Permissions + Team Management System v1
-- (Company Settings • User Roles • Permission Bundles • Team Management • Branding • Templates • Notifications)
-- =========================================================
-- 
-- THE OPERATING SYSTEM LAYER — Makes SmartSend ready to SCALE to 1,000+ roofing companies.
-- 
-- This block builds the infrastructure that lets SmartSend operate like a TRUE enterprise platform:
-- - User roles, permissions, company settings, branding, email templates, SMS templates
-- - Team invites, full access control, login history tracking
-- - Module-level permissions (Read, Write, Edit, Delete per module)
-- 
-- =========================================================

-- ============================================================================
-- PART 1 — ENHANCE roofing_company_members WITH INVITE SYSTEM
-- ============================================================================
-- Add invite tracking fields to existing roofing_company_members table

ALTER TABLE IF EXISTS public.roofing_company_members
  ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invite_token text,
  ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_roofing_company_members_invite_token ON public.roofing_company_members(invite_token) WHERE invite_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_roofing_company_members_last_login ON public.roofing_company_members(last_login_at) WHERE last_login_at IS NOT NULL;

-- ============================================================================
-- PART 2 — CREATE roles_permissions TABLE
-- ============================================================================
-- Defines what each role is allowed to do per module

CREATE TABLE IF NOT EXISTS public.roles_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role text NOT NULL CHECK (role IN ('admin', 'manager', 'sales', 'production', 'crew', 'accounting', 'viewer')),
  module text NOT NULL, -- "leads", "estimates", "contracts", "production", "safety", "payments", "accounting", "settings", "team"
  can_view boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(role, module)
);

CREATE INDEX IF NOT EXISTS idx_roles_permissions_role ON public.roles_permissions(role);
CREATE INDEX IF NOT EXISTS idx_roles_permissions_module ON public.roles_permissions(module);

COMMENT ON TABLE public.roles_permissions IS 'Permission matrix for roles and modules (Block 231000)';

-- ============================================================================
-- PART 3 — CREATE company_branding TABLE (Enhanced)
-- ============================================================================
-- Company branding settings (extends existing branding in roofing_companies)

CREATE TABLE IF NOT EXISTS public.company_branding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  logo_url text,
  primary_color text DEFAULT '#1E40AF',
  secondary_color text DEFAULT '#3B82F6',
  email_signature text,
  portal_theme jsonb DEFAULT '{}'::jsonb, -- Custom portal theme settings
  login_background_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(roofing_company_id)
);

CREATE INDEX IF NOT EXISTS idx_company_branding_company ON public.company_branding(roofing_company_id);

COMMENT ON TABLE public.company_branding IS 'Company branding settings (Block 231000)';

-- ============================================================================
-- PART 4 — CREATE templates TABLE (Universal Template Engine)
-- ============================================================================
-- Universal template engine for ALL document types

CREATE TABLE IF NOT EXISTS public.templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  template_type text NOT NULL CHECK (template_type IN ('estimate', 'proposal', 'contract', 'email', 'sms', 'change_order', 'invoice', 'warranty')),
  name text NOT NULL,
  content text NOT NULL,
  variables text[], -- Available variables like {{homeowner_name}}, {{job_address}}, etc.
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(roofing_company_id, template_type, name)
);

CREATE INDEX IF NOT EXISTS idx_templates_company ON public.templates(roofing_company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_templates_type ON public.templates(roofing_company_id, template_type);
CREATE INDEX IF NOT EXISTS idx_templates_default ON public.templates(roofing_company_id, template_type, is_default) WHERE is_default = true;

COMMENT ON TABLE public.templates IS 'Universal template engine for all document types (Block 231000)';

-- ============================================================================
-- PART 5 — CREATE user_notifications_settings TABLE
-- ============================================================================
-- User notification preferences per module

CREATE TABLE IF NOT EXISTS public.user_notifications_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  roofing_company_id uuid NOT NULL REFERENCES public.roofing_companies(id) ON DELETE CASCADE,
  module text NOT NULL, -- "sales", "production", "safety", "payments", "crew", "general"
  notify_email boolean DEFAULT true,
  notify_sms boolean DEFAULT false,
  notify_inapp boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, roofing_company_id, module)
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON public.user_notifications_settings(user_id, roofing_company_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_module ON public.user_notifications_settings(roofing_company_id, module);

COMMENT ON TABLE public.user_notifications_settings IS 'User notification preferences per module (Block 231000)';

-- ============================================================================
-- PART 6 — CREATE user_login_history TABLE
-- ============================================================================
-- Track user login history for security and auditing

CREATE TABLE IF NOT EXISTS public.user_login_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  roofing_company_id uuid REFERENCES public.roofing_companies(id) ON DELETE SET NULL,
  ip_address text,
  user_agent text,
  login_at timestamptz DEFAULT now(),
  logout_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_user_login_history_user ON public.user_login_history(user_id, login_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_login_history_company ON public.user_login_history(roofing_company_id, login_at DESC) WHERE roofing_company_id IS NOT NULL;

COMMENT ON TABLE public.user_login_history IS 'User login history for security and auditing (Block 231000)';

-- ============================================================================
-- PART 7 — SEED DEFAULT ROLE PERMISSIONS
-- ============================================================================
-- Default permission matrix for each role

INSERT INTO public.roles_permissions (role, module, can_view, can_create, can_edit, can_delete) VALUES
-- Admin: Full access to everything
('admin', 'leads', true, true, true, true),
('admin', 'estimates', true, true, true, true),
('admin', 'contracts', true, true, true, true),
('admin', 'production', true, true, true, true),
('admin', 'safety', true, true, true, true),
('admin', 'payments', true, true, true, true),
('admin', 'accounting', true, true, true, true),
('admin', 'settings', true, true, true, true),
('admin', 'team', true, true, true, true),

-- Manager: Full access except settings/team management
('manager', 'leads', true, true, true, true),
('manager', 'estimates', true, true, true, true),
('manager', 'contracts', true, true, true, true),
('manager', 'production', true, true, true, true),
('manager', 'safety', true, true, true, true),
('manager', 'payments', true, true, true, false),
('manager', 'accounting', true, true, true, false),
('manager', 'settings', true, false, false, false),
('manager', 'team', true, false, false, false),

-- Sales: Leads, estimates, contracts (no delete on contracts)
('sales', 'leads', true, true, true, false),
('sales', 'estimates', true, true, true, false),
('sales', 'contracts', true, true, true, false),
('sales', 'production', true, false, false, false),
('sales', 'safety', true, false, false, false),
('sales', 'payments', true, false, false, false),
('sales', 'accounting', false, false, false, false),
('sales', 'settings', false, false, false, false),
('sales', 'team', false, false, false, false),

-- Production: Production, safety, limited leads/contracts view
('production', 'leads', true, false, false, false),
('production', 'estimates', true, false, false, false),
('production', 'contracts', true, false, false, false),
('production', 'production', true, true, true, false),
('production', 'safety', true, true, true, false),
('production', 'payments', true, false, false, false),
('production', 'accounting', false, false, false, false),
('production', 'settings', false, false, false, false),
('production', 'team', false, false, false, false),

-- Crew: Production view, safety create/edit, no access to pricing
('crew', 'leads', false, false, false, false),
('crew', 'estimates', false, false, false, false),
('crew', 'contracts', false, false, false, false),
('crew', 'production', true, false, true, false),
('crew', 'safety', true, true, true, false),
('crew', 'payments', false, false, false, false),
('crew', 'accounting', false, false, false, false),
('crew', 'settings', false, false, false, false),
('crew', 'team', false, false, false, false),

-- Accounting: Full access to payments/accounting, view-only on others
('accounting', 'leads', true, false, false, false),
('accounting', 'estimates', true, false, false, false),
('accounting', 'contracts', true, false, false, false),
('accounting', 'production', true, false, false, false),
('accounting', 'safety', true, false, false, false),
('accounting', 'payments', true, true, true, true),
('accounting', 'accounting', true, true, true, true),
('accounting', 'settings', false, false, false, false),
('accounting', 'team', false, false, false, false),

-- Viewer: Read-only access to everything
('viewer', 'leads', true, false, false, false),
('viewer', 'estimates', true, false, false, false),
('viewer', 'contracts', true, false, false, false),
('viewer', 'production', true, false, false, false),
('viewer', 'safety', true, false, false, false),
('viewer', 'payments', true, false, false, false),
('viewer', 'accounting', true, false, false, false),
('viewer', 'settings', false, false, false, false),
('viewer', 'team', false, false, false, false)
ON CONFLICT (role, module) DO NOTHING;

-- ============================================================================
-- PART 8 — HELPER FUNCTIONS
-- ============================================================================

-- Function: Get user permissions for a company
CREATE OR REPLACE FUNCTION public.get_user_permissions(
  p_user_id uuid,
  p_company_id uuid
)
RETURNS TABLE (
  module text,
  can_view boolean,
  can_create boolean,
  can_edit boolean,
  can_delete boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    rp.module,
    rp.can_view,
    rp.can_create,
    rp.can_edit,
    rp.can_delete
  FROM public.roofing_company_members rcm
  JOIN public.roles_permissions rp ON rp.role = rcm.role
  WHERE rcm.user_id = p_user_id
    AND rcm.roofing_company_id = p_company_id
    AND rcm.is_active = true;
$$;

-- Function: Check if user has permission
CREATE OR REPLACE FUNCTION public.has_permission(
  p_user_id uuid,
  p_company_id uuid,
  p_module text,
  p_action text -- 'view', 'create', 'edit', 'delete'
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT CASE p_action
    WHEN 'view' THEN EXISTS(
      SELECT 1 FROM public.get_user_permissions(p_user_id, p_company_id)
      WHERE module = p_module AND can_view = true
    )
    WHEN 'create' THEN EXISTS(
      SELECT 1 FROM public.get_user_permissions(p_user_id, p_company_id)
      WHERE module = p_module AND can_create = true
    )
    WHEN 'edit' THEN EXISTS(
      SELECT 1 FROM public.get_user_permissions(p_user_id, p_company_id)
      WHERE module = p_module AND can_edit = true
    )
    WHEN 'delete' THEN EXISTS(
      SELECT 1 FROM public.get_user_permissions(p_user_id, p_company_id)
      WHERE module = p_module AND can_delete = true
    )
    ELSE false
  END;
$$;

-- Function: Check if user can manage team
CREATE OR REPLACE FUNCTION public.can_manage_team(
  p_user_id uuid,
  p_company_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.roofing_company_members rcm
    JOIN public.roles_permissions rp ON rp.role = rcm.role
    WHERE rcm.user_id = p_user_id
      AND rcm.roofing_company_id = p_company_id
      AND rcm.is_active = true
      AND rp.module = 'team'
      AND (rp.can_create = true OR rp.can_edit = true OR rp.can_delete = true)
  );
$$;

-- Function: Record user login
CREATE OR REPLACE FUNCTION public.record_user_login(
  p_user_id uuid,
  p_company_id uuid,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  login_id uuid;
BEGIN
  -- Insert login record
  INSERT INTO public.user_login_history (user_id, roofing_company_id, ip_address, user_agent)
  VALUES (p_user_id, p_company_id, p_ip_address, p_user_agent)
  RETURNING id INTO login_id;
  
  -- Update last_login_at in roofing_company_members
  UPDATE public.roofing_company_members
  SET last_login_at = now()
  WHERE user_id = p_user_id
    AND roofing_company_id = p_company_id
    AND is_active = true;
  
  RETURN login_id;
END;
$$;

-- ============================================================================
-- PART 9 — TRIGGERS
-- ============================================================================

-- Updated_at triggers
CREATE OR REPLACE FUNCTION public.set_roles_permissions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_roles_permissions_updated_at
BEFORE UPDATE ON public.roles_permissions
FOR EACH ROW
EXECUTE FUNCTION public.set_roles_permissions_updated_at();

CREATE OR REPLACE FUNCTION public.set_company_branding_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_company_branding_updated_at
BEFORE UPDATE ON public.company_branding
FOR EACH ROW
EXECUTE FUNCTION public.set_company_branding_updated_at();

CREATE OR REPLACE FUNCTION public.set_templates_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_templates_updated_at
BEFORE UPDATE ON public.templates
FOR EACH ROW
EXECUTE FUNCTION public.set_templates_updated_at();

CREATE OR REPLACE FUNCTION public.set_user_notifications_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_notifications_updated_at
BEFORE UPDATE ON public.user_notifications_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_user_notifications_updated_at();

-- Auto-create default templates on company creation
CREATE OR REPLACE FUNCTION public.auto_create_default_templates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Create default estimate template
  INSERT INTO public.templates (roofing_company_id, template_type, name, content, is_default, variables)
  VALUES (
    NEW.id,
    'estimate',
    'Default Estimate',
    'Estimate for {{homeowner_name}}

Job Address: {{job_address}}
Company: {{company_name}}
Phone: {{company_phone}}

{{estimate_details}}

Total: {{proposal_total}}

{{signature_block}}',
    true,
    ARRAY['homeowner_name', 'job_address', 'company_name', 'company_phone', 'proposal_total', 'estimate_details', 'signature_block']
  );
  
  -- Create default contract template
  INSERT INTO public.templates (roofing_company_id, template_type, name, content, is_default, variables)
  VALUES (
    NEW.id,
    'contract',
    'Default Contract',
    'ROOFING CONTRACT

This agreement is entered into between {{company_name}} and {{homeowner_name}}.

Property Address: {{job_address}}

{{contract_terms}}

Total Contract Amount: {{proposal_total}}

{{signature_block}}',
    true,
    ARRAY['company_name', 'homeowner_name', 'job_address', 'contract_terms', 'proposal_total', 'signature_block']
  );
  
  -- Create default change order template
  INSERT INTO public.templates (roofing_company_id, template_type, name, content, is_default, variables)
  VALUES (
    NEW.id,
    'change_order',
    'Default Change Order',
    'CHANGE ORDER

Original Contract: {{contract_number}}
Property: {{job_address}}

{{change_order_details}}

Additional Amount: {{change_order_amount}}

{{signature_block}}',
    true,
    ARRAY['contract_number', 'job_address', 'change_order_details', 'change_order_amount', 'signature_block']
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_create_default_templates
AFTER INSERT ON public.roofing_companies
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_default_templates();

-- ============================================================================
-- PART 10 — ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS
ALTER TABLE public.roles_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notifications_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_login_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for roles_permissions (read-only for company members)
CREATE POLICY "Company members can view role permissions"
  ON public.roles_permissions FOR SELECT
  USING (true); -- Public read access for permission checking

-- RLS Policies for company_branding
CREATE POLICY "Company members can view branding"
  ON public.company_branding FOR SELECT
  USING (public.is_company_member(roofing_company_id));

CREATE POLICY "Company owners/admins can manage branding"
  ON public.company_branding FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_company_members
      WHERE roofing_company_id = company_branding.roofing_company_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND is_active = true
    )
  );

-- RLS Policies for templates
CREATE POLICY "Company members can view templates"
  ON public.templates FOR SELECT
  USING (public.is_company_member(roofing_company_id));

CREATE POLICY "Company members can manage templates"
  ON public.templates FOR ALL
  USING (public.is_company_member(roofing_company_id));

-- RLS Policies for user_notifications_settings
CREATE POLICY "Users can view their own notification settings"
  ON public.user_notifications_settings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can manage their own notification settings"
  ON public.user_notifications_settings FOR ALL
  USING (user_id = auth.uid());

-- RLS Policies for user_login_history
CREATE POLICY "Users can view their own login history"
  ON public.user_login_history FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Admins can view company login history"
  ON public.user_login_history FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_company_members
      WHERE roofing_company_id = user_login_history.roofing_company_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND is_active = true
    )
  );

-- ============================================================================
-- PART 11 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT ON public.roles_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_branding TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notifications_settings TO authenticated;
GRANT SELECT ON public.user_login_history TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_user_permissions(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_team(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_user_login(uuid, uuid, text, text) TO authenticated;

-- ============================================================================
-- PART 12 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.roles_permissions IS 'Permission matrix for roles and modules (Block 231000)';
COMMENT ON TABLE public.company_branding IS 'Company branding settings (Block 231000)';
COMMENT ON TABLE public.templates IS 'Universal template engine for all document types (Block 231000)';
COMMENT ON TABLE public.user_notifications_settings IS 'User notification preferences per module (Block 231000)';
COMMENT ON TABLE public.user_login_history IS 'User login history for security and auditing (Block 231000)';

COMMENT ON FUNCTION public.get_user_permissions(uuid, uuid) IS 'Get user permissions for a company (Block 231000)';
COMMENT ON FUNCTION public.has_permission(uuid, uuid, text, text) IS 'Check if user has permission for a module/action (Block 231000)';
COMMENT ON FUNCTION public.can_manage_team(uuid, uuid) IS 'Check if user can manage team members (Block 231000)';
COMMENT ON FUNCTION public.record_user_login(uuid, uuid, text, text) IS 'Record user login and update last_login_at (Block 231000)';

























