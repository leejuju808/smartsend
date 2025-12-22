-- =========================================================
-- Block 25660 — SmartSend Roofing User Permissions & Roles v1
-- (Admin • Sales Rep • Crew Leader • Insurance Team • Ops Manager • Read-Only Homeowner Portal)
-- =========================================================
-- 
-- THE PERMISSIONS + ROLES SYSTEM — ZERO FLUFF.
-- 
-- This is where SmartSend stops being "a tool"
-- and becomes a real roofing company operating system
-- because every role sees EXACTLY what they need — nothing more, nothing less.
--
-- Roofers suffer MASSIVE problems right now because:
-- ❌ crews see things they shouldn't
-- ❌ sales reps accidentally delete or change data
-- ❌ homeowners get wrong info
-- ❌ insurance coordinators alter job notes
-- ❌ ops manager changes pricing by mistake
-- ❌ nobody knows who touched what
-- ❌ ZERO accountability
-- ❌ NO audit trails
-- ❌ PO's get overridden
-- ❌ sensitive documents exposed
-- ❌ permissions are chaos
--
-- SmartSend Roofing User Permissions & Roles v1 solves all of this.

-- ============================================================================
-- PART 1 — ROOFING-SPECIFIC ROLES ENUM
-- ============================================================================

DO $$ 
BEGIN
  -- Create roofing roles enum
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'roofing_role') THEN
    CREATE TYPE public.roofing_role AS ENUM (
      'admin',              -- Owner - Full access
      'ops_manager',        -- Operations Manager
      'sales_rep',          -- Sales Rep
      'insurance_specialist', -- Insurance Specialist
      'crew_leader',        -- Crew Leader
      'homeowner_portal'    -- Read-only homeowner portal
    );
  END IF;
END $$;

-- ============================================================================
-- PART 2 — EXTEND workspace_members WITH ROOFING ROLE
-- ============================================================================

-- Add roofing_role column to workspace_members if it doesn't exist
ALTER TABLE IF EXISTS public.workspace_members
  ADD COLUMN IF NOT EXISTS roofing_role public.roofing_role;

-- Migrate existing roles to roofing roles
-- owner -> admin, admin -> admin, member -> sales_rep (default)
DO $$
BEGIN
  UPDATE public.workspace_members
  SET roofing_role = CASE
    WHEN role = 'owner' THEN 'admin'::public.roofing_role
    WHEN role = 'admin' THEN 'admin'::public.roofing_role
    ELSE 'sales_rep'::public.roofing_role
  END
  WHERE roofing_role IS NULL;
END $$;

-- Add index for roofing_role lookups
CREATE INDEX IF NOT EXISTS idx_workspace_members_roofing_role 
  ON public.workspace_members(workspace_id, roofing_role);

-- ============================================================================
-- PART 3 — PERMISSIONS TABLE
-- ============================================================================
-- Granular permissions for each action/resource

CREATE TABLE IF NOT EXISTS public.roofing_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key text NOT NULL UNIQUE, -- e.g. 'jobs.view_all', 'jobs.edit_pricing', 'documents.delete'
  permission_name text NOT NULL,      -- Human-readable name
  resource_type text NOT NULL,         -- 'jobs', 'documents', 'financials', 'settings', etc.
  action text NOT NULL,                -- 'view', 'create', 'edit', 'delete', 'approve'
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_permissions_resource_action 
  ON public.roofing_permissions(resource_type, action);

-- ============================================================================
-- PART 4 — ROLE-PERMISSION MAPPING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roofing_role public.roofing_role NOT NULL,
  permission_id uuid NOT NULL REFERENCES public.roofing_permissions(id) ON DELETE CASCADE,
  granted boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(roofing_role, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role 
  ON public.role_permissions(roofing_role);

CREATE INDEX IF NOT EXISTS idx_role_permissions_permission 
  ON public.role_permissions(permission_id);

-- ============================================================================
-- PART 5 — SEED PERMISSIONS
-- ============================================================================

INSERT INTO public.roofing_permissions (permission_key, permission_name, resource_type, action, description) VALUES
  -- Jobs
  ('jobs.view_all', 'View All Jobs', 'jobs', 'view', 'View all jobs in workspace'),
  ('jobs.view_assigned', 'View Assigned Jobs', 'jobs', 'view', 'View only assigned jobs'),
  ('jobs.view_today', 'View Today''s Jobs', 'jobs', 'view', 'View today and tomorrow''s assigned jobs'),
  ('jobs.create', 'Create Jobs', 'jobs', 'create', 'Create new jobs'),
  ('jobs.edit', 'Edit Jobs', 'jobs', 'edit', 'Edit job details'),
  ('jobs.edit_pricing', 'Edit Job Pricing', 'jobs', 'edit', 'Modify job pricing and financials'),
  ('jobs.edit_status', 'Edit Job Status', 'jobs', 'edit', 'Change job status'),
  ('jobs.delete', 'Delete Jobs', 'jobs', 'delete', 'Delete jobs'),
  ('jobs.approve', 'Approve Jobs', 'jobs', 'approve', 'Approve job changes'),
  ('jobs.schedule', 'Schedule Jobs', 'jobs', 'edit', 'Schedule install dates'),
  ('jobs.assign_crew', 'Assign Crews', 'jobs', 'edit', 'Assign crews to jobs'),
  
  -- Financials
  ('financials.view', 'View Financials', 'financials', 'view', 'View financial data'),
  ('financials.view_margins', 'View Margins', 'financials', 'view', 'View profit margins'),
  ('financials.view_costs', 'View Costs', 'financials', 'view', 'View job costs'),
  ('financials.edit', 'Edit Financials', 'financials', 'edit', 'Modify financial data'),
  
  -- Documents
  ('documents.view_all', 'View All Documents', 'documents', 'view', 'View all documents'),
  ('documents.view_assigned', 'View Assigned Documents', 'documents', 'view', 'View documents for assigned jobs'),
  ('documents.upload', 'Upload Documents', 'documents', 'create', 'Upload documents'),
  ('documents.edit', 'Edit Documents', 'documents', 'edit', 'Edit document metadata'),
  ('documents.delete', 'Delete Documents', 'documents', 'delete', 'Delete documents'),
  
  -- Leads & Sales
  ('leads.view_all', 'View All Leads', 'leads', 'view', 'View all leads'),
  ('leads.view_assigned', 'View Assigned Leads', 'leads', 'view', 'View only assigned leads'),
  ('leads.create', 'Create Leads', 'leads', 'create', 'Create new leads'),
  ('leads.edit', 'Edit Leads', 'leads', 'edit', 'Edit lead information'),
  ('leads.delete', 'Delete Leads', 'leads', 'delete', 'Delete leads'),
  ('quotes.create', 'Create Quotes', 'quotes', 'create', 'Create quotes'),
  ('quotes.send', 'Send Quotes', 'quotes', 'edit', 'Send quotes to homeowners'),
  ('quotes.edit_pricing', 'Edit Quote Pricing', 'quotes', 'edit', 'Modify quote pricing'),
  
  -- Insurance
  ('insurance.view', 'View Insurance', 'insurance', 'view', 'View insurance information'),
  ('insurance.edit', 'Edit Insurance', 'insurance', 'edit', 'Edit insurance data'),
  ('insurance.upload_docs', 'Upload Insurance Docs', 'insurance', 'create', 'Upload insurance documents'),
  ('insurance.track_acv', 'Track ACV', 'insurance', 'edit', 'Track ACV payments'),
  ('insurance.track_depreciation', 'Track Depreciation', 'insurance', 'edit', 'Track depreciation'),
  ('insurance.submit_supplements', 'Submit Supplements', 'insurance', 'create', 'Submit insurance supplements'),
  
  -- Crew & Operations
  ('crew.view', 'View Crew Info', 'crew', 'view', 'View crew information'),
  ('crew.assign', 'Assign Crews', 'crew', 'edit', 'Assign crews to jobs'),
  ('crew.view_pay', 'View Crew Pay', 'crew', 'view', 'View crew payroll information'),
  ('crew.edit_pay', 'Edit Crew Pay', 'crew', 'edit', 'Modify crew payroll'),
  ('materials.view', 'View Materials', 'materials', 'view', 'View material information'),
  ('materials.order', 'Order Materials', 'materials', 'create', 'Order materials'),
  ('materials.track', 'Track Materials', 'materials', 'edit', 'Track material deliveries'),
  
  -- Photos
  ('photos.view_all', 'View All Photos', 'photos', 'view', 'View all job photos'),
  ('photos.view_assigned', 'View Assigned Photos', 'photos', 'view', 'View photos for assigned jobs'),
  ('photos.upload', 'Upload Photos', 'photos', 'create', 'Upload photos'),
  ('photos.delete', 'Delete Photos', 'photos', 'delete', 'Delete photos'),
  
  -- Tasks
  ('tasks.view_all', 'View All Tasks', 'tasks', 'view', 'View all tasks'),
  ('tasks.view_assigned', 'View Assigned Tasks', 'tasks', 'view', 'View assigned tasks'),
  ('tasks.create', 'Create Tasks', 'tasks', 'create', 'Create tasks'),
  ('tasks.complete', 'Complete Tasks', 'tasks', 'edit', 'Mark tasks complete'),
  ('tasks.delete', 'Delete Tasks', 'tasks', 'delete', 'Delete tasks'),
  
  -- Settings & Users
  ('settings.view', 'View Settings', 'settings', 'view', 'View workspace settings'),
  ('settings.edit', 'Edit Settings', 'settings', 'edit', 'Modify workspace settings'),
  ('users.view', 'View Users', 'users', 'view', 'View team members'),
  ('users.invite', 'Invite Users', 'users', 'create', 'Invite team members'),
  ('users.edit', 'Edit Users', 'users', 'edit', 'Edit user roles'),
  ('users.delete', 'Delete Users', 'users', 'delete', 'Remove team members'),
  
  -- Homeowner Contact Info
  ('homeowner.view_contact', 'View Homeowner Contact', 'homeowner', 'view', 'View homeowner contact information'),
  ('homeowner.view_limited', 'View Limited Homeowner Info', 'homeowner', 'view', 'View only first name'),
  
  -- Notes & Internal Communication
  ('notes.view_all', 'View All Notes', 'notes', 'view', 'View all internal notes'),
  ('notes.view_assigned', 'View Assigned Notes', 'notes', 'view', 'View notes for assigned jobs'),
  ('notes.create', 'Create Notes', 'notes', 'create', 'Create internal notes'),
  ('notes.edit', 'Edit Notes', 'notes', 'edit', 'Edit notes'),
  ('notes.delete', 'Delete Notes', 'notes', 'delete', 'Delete notes'),
  
  -- Audit & Reporting
  ('audit.view', 'View Audit Logs', 'audit', 'view', 'View audit trail'),
  ('reports.view_all', 'View All Reports', 'reports', 'view', 'View all reports'),
  ('reports.view_assigned', 'View Assigned Reports', 'reports', 'view', 'View reports for assigned jobs')
ON CONFLICT (permission_key) DO NOTHING;

-- ============================================================================
-- PART 6 — SEED ROLE-PERMISSION MAPPINGS
-- ============================================================================

-- ADMIN ROLE — Full Access
INSERT INTO public.role_permissions (roofing_role, permission_id, granted)
SELECT 'admin'::public.roofing_role, id, true
FROM public.roofing_permissions
ON CONFLICT (roofing_role, permission_id) DO NOTHING;

-- OPS MANAGER ROLE
INSERT INTO public.role_permissions (roofing_role, permission_id, granted)
SELECT 'ops_manager'::public.roofing_role, id, true
FROM public.roofing_permissions
WHERE permission_key IN (
  'jobs.view_all', 'jobs.edit', 'jobs.schedule', 'jobs.assign_crew', 'jobs.edit_status',
  'documents.view_all', 'documents.upload', 'documents.edit',
  'materials.view', 'materials.order', 'materials.track',
  'crew.view', 'crew.assign',
  'photos.view_all', 'photos.upload',
  'tasks.view_all', 'tasks.create', 'tasks.complete',
  'homeowner.view_limited',
  'notes.view_all', 'notes.create', 'notes.edit',
  'reports.view_all'
)
ON CONFLICT (roofing_role, permission_id) DO NOTHING;

-- SALES REP ROLE
INSERT INTO public.role_permissions (roofing_role, permission_id, granted)
SELECT 'sales_rep'::public.roofing_role, id, true
FROM public.roofing_permissions
WHERE permission_key IN (
  'leads.view_assigned', 'leads.create', 'leads.edit',
  'quotes.create', 'quotes.send',
  'jobs.view_assigned', 'jobs.create', 'jobs.edit',
  'documents.view_assigned', 'documents.upload',
  'photos.view_assigned', 'photos.upload',
  'tasks.view_assigned', 'tasks.create', 'tasks.complete',
  'homeowner.view_contact',
  'notes.view_assigned', 'notes.create', 'notes.edit',
  'reports.view_assigned'
)
ON CONFLICT (roofing_role, permission_id) DO NOTHING;

-- INSURANCE SPECIALIST ROLE
INSERT INTO public.role_permissions (roofing_role, permission_id, granted)
SELECT 'insurance_specialist'::public.roofing_role, id, true
FROM public.roofing_permissions
WHERE permission_key IN (
  'jobs.view_all', 'jobs.edit',
  'insurance.view', 'insurance.edit', 'insurance.upload_docs',
  'insurance.track_acv', 'insurance.track_depreciation', 'insurance.submit_supplements',
  'documents.view_all', 'documents.upload', 'documents.edit',
  'photos.view_all', 'photos.upload',
  'homeowner.view_contact',
  'notes.view_all', 'notes.create', 'notes.edit',
  'reports.view_all'
)
ON CONFLICT (roofing_role, permission_id) DO NOTHING;

-- CREW LEADER ROLE
INSERT INTO public.role_permissions (roofing_role, permission_id, granted)
SELECT 'crew_leader'::public.roofing_role, id, true
FROM public.roofing_permissions
WHERE permission_key IN (
  'jobs.view_today',
  'documents.view_assigned', 'documents.upload',
  'photos.view_assigned', 'photos.upload',
  'tasks.view_assigned', 'tasks.complete',
  'homeowner.view_limited'
)
ON CONFLICT (roofing_role, permission_id) DO NOTHING;

-- HOMEOWNER PORTAL ROLE (Read-Only)
INSERT INTO public.role_permissions (roofing_role, permission_id, granted)
SELECT 'homeowner_portal'::public.roofing_role, id, true
FROM public.roofing_permissions
WHERE permission_key IN (
  'jobs.view_assigned',
  'documents.view_assigned',
  'photos.view_assigned'
)
ON CONFLICT (roofing_role, permission_id) DO NOTHING;

-- ============================================================================
-- PART 7 — AUDIT LOGS TABLE
-- ============================================================================
-- Track who changed what, when, from which device

CREATE TABLE IF NOT EXISTS public.roofing_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  user_role public.roofing_role,
  
  -- What changed
  resource_type text NOT NULL, -- 'job', 'document', 'quote', 'lead', etc.
  resource_id uuid,
  action text NOT NULL, -- 'created', 'updated', 'deleted', 'status_changed', etc.
  
  -- Change details
  field_name text, -- e.g. 'status', 'job_value', 'shingle_color'
  old_value text,
  new_value text,
  change_summary text, -- Human-readable summary
  
  -- Device & context
  device_type text, -- 'web', 'mobile', 'api'
  ip_address inet,
  user_agent text,
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace 
  ON public.roofing_audit_logs(workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user 
  ON public.roofing_audit_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_resource 
  ON public.roofing_audit_logs(resource_type, resource_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action 
  ON public.roofing_audit_logs(action, created_at DESC);

-- RLS for audit logs
ALTER TABLE public.roofing_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only workspace members can view audit logs
CREATE POLICY "audit_logs_workspace_members_view"
  ON public.roofing_audit_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_audit_logs.workspace_id
        AND wm.user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 8 — HELPER FUNCTIONS FOR PERMISSIONS
-- ============================================================================

-- Check if user has a specific permission
CREATE OR REPLACE FUNCTION public.has_permission(
  p_permission_key text,
  p_workspace_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_user_role public.roofing_role;
  v_ws_id uuid;
BEGIN
  -- Get workspace_id if not provided
  IF p_workspace_id IS NULL THEN
    SELECT workspace_id INTO v_ws_id
    FROM public.workspace_members
    WHERE user_id = auth.uid()
    LIMIT 1;
  ELSE
    v_ws_id := p_workspace_id;
  END IF;
  
  -- Get user's roofing role
  SELECT roofing_role INTO v_user_role
  FROM public.workspace_members
  WHERE workspace_id = v_ws_id
    AND user_id = auth.uid();
  
  -- Admin has all permissions
  IF v_user_role = 'admin'::public.roofing_role THEN
    RETURN true;
  END IF;
  
  -- Check if permission is granted
  RETURN EXISTS (
    SELECT 1
    FROM public.role_permissions rp
    JOIN public.roofing_permissions p ON p.id = rp.permission_id
    WHERE rp.roofing_role = v_user_role
      AND p.permission_key = p_permission_key
      AND rp.granted = true
  );
END;
$$;

-- Get user's roofing role for a workspace
CREATE OR REPLACE FUNCTION public.get_user_roofing_role(
  p_workspace_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS public.roofing_role
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_role public.roofing_role;
BEGIN
  SELECT roofing_role INTO v_role
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
    AND user_id = p_user_id;
  
  RETURN v_role;
END;
$$;

-- Check if user can view a specific job
CREATE OR REPLACE FUNCTION public.can_view_job(
  p_job_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_user_role public.roofing_role;
  v_workspace_id uuid;
  v_assigned_crew text;
BEGIN
  -- Get job workspace and assigned crew
  SELECT workspace_id, crew_name INTO v_workspace_id, v_assigned_crew
  FROM public.roofing_jobs
  WHERE id = p_job_id;
  
  -- Get user's role
  SELECT roofing_role INTO v_user_role
  FROM public.workspace_members
  WHERE workspace_id = v_workspace_id
    AND user_id = auth.uid();
  
  -- Admin can view all
  IF v_user_role = 'admin'::public.roofing_role THEN
    RETURN true;
  END IF;
  
  -- Ops Manager can view all
  IF v_user_role = 'ops_manager'::public.roofing_role THEN
    RETURN true;
  END IF;
  
  -- Insurance Specialist can view all
  IF v_user_role = 'insurance_specialist'::public.roofing_role THEN
    RETURN true;
  END IF;
  
  -- Crew Leader can view assigned jobs (today/tomorrow)
  IF v_user_role = 'crew_leader'::public.roofing_role THEN
    RETURN EXISTS (
      SELECT 1 FROM public.roofing_jobs rj
      WHERE rj.id = p_job_id
        AND rj.scheduled_start_date >= CURRENT_DATE
        AND rj.scheduled_start_date <= CURRENT_DATE + INTERVAL '1 day'
    );
  END IF;
  
  -- Sales Rep can view assigned leads' jobs
  IF v_user_role = 'sales_rep'::public.roofing_role THEN
    RETURN EXISTS (
      SELECT 1 FROM public.roofing_jobs rj
      JOIN public.leads l ON l.id = rj.lead_id
      WHERE rj.id = p_job_id
        AND l.owner_id = auth.uid()
    );
  END IF;
  
  RETURN false;
END;
$$;

-- ============================================================================
-- PART 9 — AUDIT LOG TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.log_audit_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_workspace_id uuid;
  v_user_role public.roofing_role;
  v_user_email text;
  v_change_summary text;
  v_field_name text;
  v_old_val text;
  v_new_val text;
BEGIN
  -- Get workspace_id from the record
  IF TG_TABLE_NAME = 'roofing_jobs' THEN
    v_workspace_id := NEW.workspace_id;
  ELSIF TG_TABLE_NAME = 'job_documents' THEN
    v_workspace_id := NEW.workspace_id;
  ELSIF TG_TABLE_NAME = 'leads' THEN
    v_workspace_id := NEW.workspace_id;
  ELSE
    -- Try to get from context or default
    SELECT workspace_id INTO v_workspace_id
    FROM public.workspace_members
    WHERE user_id = auth.uid()
    LIMIT 1;
  END IF;
  
  -- Get user role and email
  SELECT wm.roofing_role, u.email INTO v_user_role, v_user_email
  FROM public.workspace_members wm
  LEFT JOIN auth.users u ON u.id = auth.uid()
  WHERE wm.workspace_id = v_workspace_id
    AND wm.user_id = auth.uid()
  LIMIT 1;
  
  -- Build change summary based on action
  IF TG_OP = 'INSERT' THEN
    v_change_summary := TG_TABLE_NAME || ' created';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Detect key field changes
    IF TG_TABLE_NAME = 'roofing_jobs' THEN
      IF OLD.status IS DISTINCT FROM NEW.status THEN
        v_field_name := 'status';
        v_old_val := OLD.status;
        v_new_val := NEW.status;
        v_change_summary := 'Job status changed from ' || OLD.status || ' to ' || NEW.status;
      ELSIF OLD.job_value IS DISTINCT FROM NEW.job_value THEN
        v_field_name := 'job_value';
        v_old_val := OLD.job_value::text;
        v_new_val := NEW.job_value::text;
        v_change_summary := 'Job value changed from $' || OLD.job_value || ' to $' || NEW.job_value;
      ELSIF OLD.scheduled_start_date IS DISTINCT FROM NEW.scheduled_start_date THEN
        v_field_name := 'scheduled_start_date';
        v_old_val := OLD.scheduled_start_date::text;
        v_new_val := NEW.scheduled_start_date::text;
        v_change_summary := 'Job scheduled date changed';
      ELSIF OLD.crew_name IS DISTINCT FROM NEW.crew_name THEN
        v_field_name := 'crew_name';
        v_old_val := OLD.crew_name;
        v_new_val := NEW.crew_name;
        v_change_summary := 'Crew assignment changed';
      ELSE
        v_change_summary := TG_TABLE_NAME || ' updated';
      END IF;
    ELSE
      v_change_summary := TG_TABLE_NAME || ' updated';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_change_summary := TG_TABLE_NAME || ' deleted';
  END IF;
  
  -- Insert audit log
  INSERT INTO public.roofing_audit_logs (
    workspace_id,
    user_id,
    user_email,
    user_role,
    resource_type,
    resource_id,
    action,
    field_name,
    old_value,
    new_value,
    change_summary,
    device_type,
    metadata
  ) VALUES (
    v_workspace_id,
    auth.uid(),
    v_user_email,
    v_user_role,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    LOWER(TG_OP),
    v_field_name,
    v_old_val,
    v_new_val,
    v_change_summary,
    'web', -- Can be enhanced with actual device detection
    jsonb_build_object(
      'table', TG_TABLE_NAME,
      'operation', TG_OP
    )
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ============================================================================
-- PART 10 — CREATE AUDIT TRIGGERS FOR KEY TABLES
-- ============================================================================

-- Audit trigger for roofing_jobs
DROP TRIGGER IF EXISTS trg_audit_roofing_jobs ON public.roofing_jobs;
CREATE TRIGGER trg_audit_roofing_jobs
  AFTER INSERT OR UPDATE OR DELETE ON public.roofing_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.log_audit_change();

-- Audit trigger for job_documents
DROP TRIGGER IF EXISTS trg_audit_job_documents ON public.job_documents;
CREATE TRIGGER trg_audit_job_documents
  AFTER INSERT OR UPDATE OR DELETE ON public.job_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.log_audit_change();

-- Audit trigger for leads
DROP TRIGGER IF EXISTS trg_audit_leads ON public.leads;
CREATE TRIGGER trg_audit_leads
  AFTER INSERT OR UPDATE OR DELETE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.log_audit_change();

-- ============================================================================
-- PART 11 — RLS POLICIES FOR ROOFING_JOBS
-- ============================================================================

ALTER TABLE IF EXISTS public.roofing_jobs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "roofing_jobs_admin_full_access" ON public.roofing_jobs;
DROP POLICY IF EXISTS "roofing_jobs_ops_manager_view" ON public.roofing_jobs;
DROP POLICY IF EXISTS "roofing_jobs_sales_rep_view" ON public.roofing_jobs;
DROP POLICY IF EXISTS "roofing_jobs_insurance_view" ON public.roofing_jobs;
DROP POLICY IF EXISTS "roofing_jobs_crew_leader_view" ON public.roofing_jobs;
DROP POLICY IF EXISTS "roofing_jobs_homeowner_view" ON public.roofing_jobs;

-- Admin: Full access
CREATE POLICY "roofing_jobs_admin_full_access"
  ON public.roofing_jobs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_jobs.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'admin'::public.roofing_role
    )
  );

-- Ops Manager: View all, edit (except pricing)
CREATE POLICY "roofing_jobs_ops_manager_view"
  ON public.roofing_jobs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_jobs.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'ops_manager'::public.roofing_role
    )
  );

CREATE POLICY "roofing_jobs_ops_manager_edit"
  ON public.roofing_jobs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_jobs.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'ops_manager'::public.roofing_role
    )
  )
  WITH CHECK (
    -- Cannot change pricing fields
    job_value = OLD.job_value
    AND deposit_required = OLD.deposit_required
    AND deposit_paid = OLD.deposit_paid
  );

-- Sales Rep: View assigned leads' jobs
CREATE POLICY "roofing_jobs_sales_rep_view"
  ON public.roofing_jobs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      JOIN public.leads l ON l.id = roofing_jobs.lead_id
      WHERE wm.workspace_id = roofing_jobs.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'sales_rep'::public.roofing_role
        AND l.owner_id = auth.uid()
    )
  );

CREATE POLICY "roofing_jobs_sales_rep_edit"
  ON public.roofing_jobs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      JOIN public.leads l ON l.id = roofing_jobs.lead_id
      WHERE wm.workspace_id = roofing_jobs.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'sales_rep'::public.roofing_role
        AND l.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    -- Cannot change pricing or status beyond sales stages
    job_value = OLD.job_value
    AND status IN ('unscheduled', 'scheduled')
  );

-- Insurance Specialist: View all, edit insurance-related fields
CREATE POLICY "roofing_jobs_insurance_view"
  ON public.roofing_jobs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_jobs.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'insurance_specialist'::public.roofing_role
    )
  );

CREATE POLICY "roofing_jobs_insurance_edit"
  ON public.roofing_jobs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_jobs.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'insurance_specialist'::public.roofing_role
    )
  )
  WITH CHECK (
    -- Cannot change pricing, scheduling, or crew
    job_value = OLD.job_value
    AND scheduled_start_date = OLD.scheduled_start_date
    AND crew_name = OLD.crew_name
  );

-- Crew Leader: View only today/tomorrow's assigned jobs
CREATE POLICY "roofing_jobs_crew_leader_view"
  ON public.roofing_jobs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_jobs.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'crew_leader'::public.roofing_role
    )
    AND scheduled_start_date >= CURRENT_DATE
    AND scheduled_start_date <= CURRENT_DATE + INTERVAL '1 day'
  );

CREATE POLICY "roofing_jobs_crew_leader_update"
  ON public.roofing_jobs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_jobs.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'crew_leader'::public.roofing_role
    )
    AND scheduled_start_date >= CURRENT_DATE
    AND scheduled_start_date <= CURRENT_DATE + INTERVAL '1 day'
  )
  WITH CHECK (
    -- Can only update status and notes, nothing else
    job_value = OLD.job_value
    AND scheduled_start_date = OLD.scheduled_start_date
    AND crew_name = OLD.crew_name
  );

-- Homeowner Portal: Read-only view of their jobs
CREATE POLICY "roofing_jobs_homeowner_view"
  ON public.roofing_jobs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      JOIN public.leads l ON l.id = roofing_jobs.lead_id
      WHERE wm.workspace_id = roofing_jobs.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'homeowner_portal'::public.roofing_role
        AND l.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
  );

-- ============================================================================
-- PART 12 — RLS POLICIES FOR JOB_DOCUMENTS
-- ============================================================================

ALTER TABLE IF EXISTS public.job_documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "job_documents_admin_full_access" ON public.job_documents;
DROP POLICY IF EXISTS "job_documents_ops_manager_access" ON public.job_documents;
DROP POLICY IF EXISTS "job_documents_sales_rep_access" ON public.job_documents;
DROP POLICY IF EXISTS "job_documents_insurance_access" ON public.job_documents;
DROP POLICY IF EXISTS "job_documents_crew_leader_access" ON public.job_documents;
DROP POLICY IF EXISTS "job_documents_homeowner_access" ON public.job_documents;

-- Admin: Full access
CREATE POLICY "job_documents_admin_full_access"
  ON public.job_documents
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = job_documents.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'admin'::public.roofing_role
    )
  );

-- Ops Manager: View all, upload, edit (no delete)
CREATE POLICY "job_documents_ops_manager_view"
  ON public.job_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = job_documents.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'ops_manager'::public.roofing_role
    )
  );

CREATE POLICY "job_documents_ops_manager_modify"
  ON public.job_documents
  FOR INSERT, UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = job_documents.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'ops_manager'::public.roofing_role
    )
  );

-- Sales Rep: View/upload for assigned jobs
CREATE POLICY "job_documents_sales_rep_view"
  ON public.job_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      JOIN public.roofing_jobs rj ON rj.id = job_documents.job_id
      JOIN public.leads l ON l.id = rj.lead_id
      WHERE wm.workspace_id = job_documents.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'sales_rep'::public.roofing_role
        AND l.owner_id = auth.uid()
    )
  );

CREATE POLICY "job_documents_sales_rep_insert"
  ON public.job_documents
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      JOIN public.roofing_jobs rj ON rj.id = job_documents.job_id
      JOIN public.leads l ON l.id = rj.lead_id
      WHERE wm.workspace_id = job_documents.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'sales_rep'::public.roofing_role
        AND l.owner_id = auth.uid()
    )
  );

-- Insurance Specialist: View all, upload insurance docs
CREATE POLICY "job_documents_insurance_view"
  ON public.job_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = job_documents.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'insurance_specialist'::public.roofing_role
    )
  );

CREATE POLICY "job_documents_insurance_modify"
  ON public.job_documents
  FOR INSERT, UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = job_documents.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'insurance_specialist'::public.roofing_role
    )
  );

-- Crew Leader: View/upload photos for assigned jobs
CREATE POLICY "job_documents_crew_leader_view"
  ON public.job_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      JOIN public.roofing_jobs rj ON rj.id = job_documents.job_id
      WHERE wm.workspace_id = job_documents.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'crew_leader'::public.roofing_role
        AND rj.scheduled_start_date >= CURRENT_DATE
        AND rj.scheduled_start_date <= CURRENT_DATE + INTERVAL '1 day'
    )
  );

CREATE POLICY "job_documents_crew_leader_insert"
  ON public.job_documents
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      JOIN public.roofing_jobs rj ON rj.id = job_documents.job_id
      WHERE wm.workspace_id = job_documents.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'crew_leader'::public.roofing_role
        AND rj.scheduled_start_date >= CURRENT_DATE
        AND rj.scheduled_start_date <= CURRENT_DATE + INTERVAL '1 day'
        AND job_documents.doc_type IN ('photo_before', 'photo_after', 'photo_damage', 'photo_progress', 'photo_completed')
    )
  );

-- Homeowner Portal: Read-only view of their documents
CREATE POLICY "job_documents_homeowner_view"
  ON public.job_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      JOIN public.roofing_jobs rj ON rj.id = job_documents.job_id
      JOIN public.leads l ON l.id = rj.lead_id
      WHERE wm.workspace_id = job_documents.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'homeowner_portal'::public.roofing_role
        AND l.email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
    -- Exclude internal notes
    AND doc_type NOT IN ('note_job', 'note_todo', 'note_internal_message')
  );

-- ============================================================================
-- PART 13 — ROLE-SPECIFIC DASHBOARD VIEWS
-- ============================================================================

-- Owner Dashboard View
CREATE OR REPLACE VIEW public.owner_dashboard AS
SELECT 
  w.id as workspace_id,
  COUNT(DISTINCT rj.id) as total_jobs,
  COUNT(DISTINCT CASE WHEN rj.status = 'in_progress' THEN rj.id END) as jobs_in_progress,
  COUNT(DISTINCT CASE WHEN rj.status = 'scheduled' THEN rj.id END) as jobs_scheduled,
  COALESCE(SUM(rj.job_value), 0) as total_revenue,
  COALESCE(SUM(rj.deposit_paid), 0) as total_deposits,
  COUNT(DISTINCT l.id) as total_leads,
  COUNT(DISTINCT wm.user_id) as team_size
FROM public.workspaces w
LEFT JOIN public.roofing_jobs rj ON rj.workspace_id = w.id
LEFT JOIN public.leads l ON l.workspace_id = w.id
LEFT JOIN public.workspace_members wm ON wm.workspace_id = w.id
GROUP BY w.id;

-- Ops Manager Dashboard View
CREATE OR REPLACE VIEW public.ops_dashboard AS
SELECT 
  w.id as workspace_id,
  COUNT(DISTINCT CASE WHEN rj.scheduled_start_date = CURRENT_DATE THEN rj.id END) as today_installs,
  COUNT(DISTINCT CASE WHEN rj.scheduled_start_date = CURRENT_DATE + INTERVAL '1 day' THEN rj.id END) as tomorrow_installs,
  COUNT(DISTINCT CASE WHEN rj.status = 'scheduled' AND rj.scheduled_start_date < CURRENT_DATE THEN rj.id END) as delayed_jobs,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.status IN ('scheduled', 'in_progress')) as active_jobs
FROM public.workspaces w
LEFT JOIN public.roofing_jobs rj ON rj.workspace_id = w.id
GROUP BY w.id;

-- Sales Rep Dashboard View
CREATE OR REPLACE VIEW public.sales_dashboard AS
SELECT 
  wm.user_id,
  wm.workspace_id,
  COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'hot' OR l.status = 'warm') as hot_leads,
  COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'sent') as quotes_sent,
  COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'won') as closed_leads,
  COALESCE(COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'won')::numeric / NULLIF(COUNT(DISTINCT l.id), 0) * 100, 0) as close_rate
FROM public.workspace_members wm
LEFT JOIN public.leads l ON l.workspace_id = wm.workspace_id AND l.owner_id = wm.user_id
LEFT JOIN public.proposals p ON p.lead_id = l.id
WHERE wm.roofing_role = 'sales_rep'::public.roofing_role
GROUP BY wm.user_id, wm.workspace_id;

-- Insurance Dashboard View
CREATE OR REPLACE VIEW public.insurance_dashboard AS
SELECT 
  w.id as workspace_id,
  COUNT(DISTINCT rj.id) FILTER (WHERE EXISTS (
    SELECT 1 FROM public.job_insurance_flow jif WHERE jif.job_id = rj.id
  )) as insurance_jobs,
  COUNT(DISTINCT rj.id) FILTER (WHERE EXISTS (
    SELECT 1 FROM public.job_insurance_flow jif 
    WHERE jif.job_id = rj.id AND jif.acv_received = false
  )) as pending_acv,
  COUNT(DISTINCT rj.id) FILTER (WHERE EXISTS (
    SELECT 1 FROM public.job_insurance_flow jif 
    WHERE jif.job_id = rj.id AND jif.supplement_status = 'pending'
  )) as pending_supplements
FROM public.workspaces w
LEFT JOIN public.roofing_jobs rj ON rj.workspace_id = w.id
GROUP BY w.id;

-- Crew Leader Dashboard View
CREATE OR REPLACE VIEW public.crew_leader_dashboard AS
SELECT 
  wm.user_id,
  wm.workspace_id,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.scheduled_start_date = CURRENT_DATE) as today_jobs,
  COUNT(DISTINCT rj.id) FILTER (WHERE rj.scheduled_start_date = CURRENT_DATE + INTERVAL '1 day') as tomorrow_jobs,
  COUNT(DISTINCT jd.id) FILTER (WHERE jd.doc_type LIKE 'photo_%' AND jd.uploaded_at::date = CURRENT_DATE) as photos_uploaded_today
FROM public.workspace_members wm
LEFT JOIN public.roofing_jobs rj ON rj.workspace_id = wm.workspace_id
  AND rj.scheduled_start_date >= CURRENT_DATE
  AND rj.scheduled_start_date <= CURRENT_DATE + INTERVAL '1 day'
LEFT JOIN public.job_documents jd ON jd.job_id = rj.id
WHERE wm.roofing_role = 'crew_leader'::public.roofing_role
GROUP BY wm.user_id, wm.workspace_id;

-- Homeowner Dashboard View
CREATE OR REPLACE VIEW public.homeowner_dashboard AS
SELECT 
  l.id as lead_id,
  l.workspace_id,
  COUNT(DISTINCT rj.id) as my_jobs,
  COUNT(DISTINCT jd.id) FILTER (WHERE jd.doc_type LIKE 'photo_%') as total_photos,
  COUNT(DISTINCT jd.id) FILTER (WHERE jd.doc_type = 'invoice') as invoices,
  COUNT(DISTINCT jd.id) FILTER (WHERE jd.doc_type = 'warranty_manufacturer' OR jd.doc_type = 'warranty_workmanship') as warranties
FROM public.leads l
LEFT JOIN public.roofing_jobs rj ON rj.lead_id = l.id
LEFT JOIN public.job_documents jd ON jd.job_id = rj.id
GROUP BY l.id, l.workspace_id;

-- Grant access to views
GRANT SELECT ON public.owner_dashboard TO authenticated;
GRANT SELECT ON public.ops_dashboard TO authenticated;
GRANT SELECT ON public.sales_dashboard TO authenticated;
GRANT SELECT ON public.insurance_dashboard TO authenticated;
GRANT SELECT ON public.crew_leader_dashboard TO authenticated;
GRANT SELECT ON public.homeowner_dashboard TO authenticated;

-- ============================================================================
-- PART 14 — RLS POLICIES FOR LEADS
-- ============================================================================

ALTER TABLE IF EXISTS public.leads ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "leads_admin_full_access" ON public.leads;
DROP POLICY IF EXISTS "leads_ops_manager_view" ON public.leads;
DROP POLICY IF EXISTS "leads_sales_rep_view" ON public.leads;
DROP POLICY IF EXISTS "leads_insurance_view" ON public.leads;
DROP POLICY IF EXISTS "leads_crew_leader_view" ON public.leads;

-- Admin: Full access
CREATE POLICY "leads_admin_full_access"
  ON public.leads
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = leads.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'admin'::public.roofing_role
    )
  );

-- Ops Manager: View all leads
CREATE POLICY "leads_ops_manager_view"
  ON public.leads
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = leads.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'ops_manager'::public.roofing_role
    )
  );

-- Sales Rep: View and edit only assigned leads
CREATE POLICY "leads_sales_rep_view"
  ON public.leads
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = leads.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'sales_rep'::public.roofing_role
        AND (leads.owner_id = auth.uid() OR leads.owner_id IS NULL)
    )
  );

CREATE POLICY "leads_sales_rep_modify"
  ON public.leads
  FOR INSERT, UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = leads.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'sales_rep'::public.roofing_role
        AND (leads.owner_id = auth.uid() OR leads.owner_id IS NULL)
    )
  );

-- Insurance Specialist: View all leads (for insurance context)
CREATE POLICY "leads_insurance_view"
  ON public.leads
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = leads.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'insurance_specialist'::public.roofing_role
    )
  );

-- Crew Leader: No access to leads
-- (Crew leaders only see assigned jobs, not leads)

-- ============================================================================
-- PART 15 — RLS POLICIES FOR PROPOSALS
-- ============================================================================

ALTER TABLE IF EXISTS public.proposals ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "proposals_admin_full_access" ON public.proposals;
DROP POLICY IF EXISTS "proposals_ops_manager_view" ON public.proposals;
DROP POLICY IF EXISTS "proposals_sales_rep_view" ON public.proposals;
DROP POLICY IF EXISTS "proposals_insurance_view" ON public.proposals;

-- Admin: Full access
CREATE POLICY "proposals_admin_full_access"
  ON public.proposals
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = proposals.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'admin'::public.roofing_role
    )
  );

-- Ops Manager: View all proposals (read-only)
CREATE POLICY "proposals_ops_manager_view"
  ON public.proposals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = proposals.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'ops_manager'::public.roofing_role
    )
  );

-- Sales Rep: View and edit proposals for assigned leads
CREATE POLICY "proposals_sales_rep_view"
  ON public.proposals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      JOIN public.leads l ON l.id = proposals.lead_id
      WHERE wm.workspace_id = proposals.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'sales_rep'::public.roofing_role
        AND l.owner_id = auth.uid()
    )
  );

CREATE POLICY "proposals_sales_rep_modify"
  ON public.proposals
  FOR INSERT, UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      JOIN public.leads l ON l.id = proposals.lead_id
      WHERE wm.workspace_id = proposals.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'sales_rep'::public.roofing_role
        AND l.owner_id = auth.uid()
    )
  );

-- Insurance Specialist: View all proposals (read-only)
CREATE POLICY "proposals_insurance_view"
  ON public.proposals
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = proposals.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'insurance_specialist'::public.roofing_role
    )
  );

-- ============================================================================
-- PART 16 — RLS POLICIES FOR ROOFING_TASKS
-- ============================================================================

ALTER TABLE IF EXISTS public.roofing_tasks ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "roofing_tasks_admin_full_access" ON public.roofing_tasks;
DROP POLICY IF EXISTS "roofing_tasks_ops_manager_access" ON public.roofing_tasks;
DROP POLICY IF EXISTS "roofing_tasks_sales_rep_access" ON public.roofing_tasks;
DROP POLICY IF EXISTS "roofing_tasks_insurance_access" ON public.roofing_tasks;
DROP POLICY IF EXISTS "roofing_tasks_crew_leader_access" ON public.roofing_tasks;

-- Admin: Full access
CREATE POLICY "roofing_tasks_admin_full_access"
  ON public.roofing_tasks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_tasks.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'admin'::public.roofing_role
    )
  );

-- Ops Manager: View all tasks, create/edit/complete
CREATE POLICY "roofing_tasks_ops_manager_view"
  ON public.roofing_tasks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_tasks.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'ops_manager'::public.roofing_role
    )
  );

CREATE POLICY "roofing_tasks_ops_manager_modify"
  ON public.roofing_tasks
  FOR INSERT, UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_tasks.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'ops_manager'::public.roofing_role
    )
  );

-- Sales Rep: View and complete assigned tasks
CREATE POLICY "roofing_tasks_sales_rep_view"
  ON public.roofing_tasks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_tasks.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'sales_rep'::public.roofing_role
        AND (roofing_tasks.assigned_user_id = auth.uid() OR roofing_tasks.assigned_user_id IS NULL)
    )
  );

CREATE POLICY "roofing_tasks_sales_rep_complete"
  ON public.roofing_tasks
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_tasks.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'sales_rep'::public.roofing_role
        AND (roofing_tasks.assigned_user_id = auth.uid() OR roofing_tasks.assigned_user_id IS NULL)
    )
  );

-- Insurance Specialist: View all tasks, create/edit insurance-related tasks
CREATE POLICY "roofing_tasks_insurance_view"
  ON public.roofing_tasks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_tasks.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'insurance_specialist'::public.roofing_role
    )
  );

CREATE POLICY "roofing_tasks_insurance_modify"
  ON public.roofing_tasks
  FOR INSERT, UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = roofing_tasks.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'insurance_specialist'::public.roofing_role
    )
  );

-- Crew Leader: View and complete assigned tasks for today's jobs
CREATE POLICY "roofing_tasks_crew_leader_view"
  ON public.roofing_tasks
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      JOIN public.roofing_jobs rj ON rj.id = roofing_tasks.job_id
      WHERE wm.workspace_id = roofing_tasks.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'crew_leader'::public.roofing_role
        AND rj.scheduled_start_date >= CURRENT_DATE
        AND rj.scheduled_start_date <= CURRENT_DATE + INTERVAL '1 day'
    )
  );

CREATE POLICY "roofing_tasks_crew_leader_complete"
  ON public.roofing_tasks
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      JOIN public.roofing_jobs rj ON rj.id = roofing_tasks.job_id
      WHERE wm.workspace_id = roofing_tasks.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.roofing_role = 'crew_leader'::public.roofing_role
        AND rj.scheduled_start_date >= CURRENT_DATE
        AND rj.scheduled_start_date <= CURRENT_DATE + INTERVAL '1 day'
    )
  );

-- ============================================================================
-- PART 17 — COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TYPE public.roofing_role IS 'Roofing-specific roles: admin (owner), ops_manager, sales_rep, insurance_specialist, crew_leader, homeowner_portal';
COMMENT ON TABLE public.roofing_permissions IS 'Granular permissions for roofing operations';
COMMENT ON TABLE public.role_permissions IS 'Maps roles to their granted permissions';
COMMENT ON TABLE public.roofing_audit_logs IS 'Complete audit trail of all changes - who changed what, when, from which device';
COMMENT ON FUNCTION public.has_permission(text, uuid) IS 'Check if current user has a specific permission';
COMMENT ON FUNCTION public.get_user_roofing_role(uuid, uuid) IS 'Get user''s roofing role for a workspace';
COMMENT ON FUNCTION public.can_view_job(uuid) IS 'Check if user can view a specific job based on their role';




































