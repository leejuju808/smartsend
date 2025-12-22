-- =========================================================
-- Block 25220 — SmartSend Roofing Multi-Team Support v1
-- (Separate Calendars • Separate Task Lists • Crew/Staff Roles • Permissions • Automatic Assignment Rules)
-- =========================================================
-- 
-- THE MULTI-TEAM SYSTEM — ZERO FLUFF.
-- 
-- Roofing companies don't run on "one team."
-- They run on:
-- - sales team
-- - office/admin team
-- - insurance team
-- - production/operations team
-- - field crews (multiple)
-- - subcontractors
-- - owner/GM oversight
-- 
-- SmartSend Multi-Team Support v1 lets every team operate in THEIR world 
-- while still staying synced together.
-- =========================================================

-- ============================================================================
-- PART 1 — CREATE TEAM TYPES ENUM
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE roofing_team_type AS ENUM (
    'SALES',
    'INSURANCE',
    'OPERATIONS',
    'PRODUCTION',
    'CREW',
    'OWNER'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

COMMENT ON TYPE roofing_team_type IS 'Team types for roofing companies: SALES, INSURANCE, OPERATIONS, PRODUCTION, CREW, OWNER';

-- ============================================================================
-- PART 2 — CREATE teams TABLE
-- ============================================================================
-- Teams represent functional groups within a roofing company

CREATE TABLE IF NOT EXISTS public.roofing_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  name text NOT NULL,                    -- "Sales Team", "Crew A", "Insurance Team", etc.
  team_type roofing_team_type NOT NULL,  -- SALES, INSURANCE, OPERATIONS, PRODUCTION, CREW, OWNER
  color text,                            -- Hex color for UI (e.g. "#F97316")
  
  -- For crew teams specifically
  crew_id uuid REFERENCES public.crews(id) ON DELETE SET NULL, -- Link to existing crew if applicable
  
  -- Team settings
  is_active boolean DEFAULT true,
  description text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- Ensure unique team names per org
  CONSTRAINT unique_team_name_per_org UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_roofing_teams_org ON public.roofing_teams(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_roofing_teams_type ON public.roofing_teams(org_id, team_type);
CREATE INDEX IF NOT EXISTS idx_roofing_teams_crew ON public.roofing_teams(crew_id) WHERE crew_id IS NOT NULL;

-- ============================================================================
-- PART 3 — CREATE team_members TABLE
-- ============================================================================
-- Links users to teams with specific roles within that team

CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.roofing_teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Role within this specific team (can be different from org role)
  role text NOT NULL DEFAULT 'member', -- 'leader', 'member', 'viewer'
  
  -- Assignment metadata
  assigned_at timestamptz DEFAULT now(),
  assigned_by_user_id uuid REFERENCES auth.users(id),
  
  is_active boolean DEFAULT true,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  -- One membership per user per team
  CONSTRAINT unique_user_team UNIQUE (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_members_team ON public.team_members(team_id, is_active);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_team_members_role ON public.team_members(team_id, role) WHERE is_active = true;

-- ============================================================================
-- PART 4 — CREATE assignment_rules TABLE (Enhanced)
-- ============================================================================
-- Automatic assignment rules for leads, jobs, insurance claims, ops tasks

CREATE TABLE IF NOT EXISTS public.team_assignment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.roofing_teams(id) ON DELETE SET NULL,
  
  -- What this rule assigns
  target_type text NOT NULL CHECK (target_type IN ('lead', 'job', 'insurance_claim', 'ops_task', 'production_job')),
  
  -- Rule name and description
  name text NOT NULL,
  description text,
  
  -- Rule configuration (JSONB for flexibility)
  -- Examples:
  -- For lead assignment: {"criteria": {"zip_code": "98402"}, "assign_to_team": "sales", "assign_to_user": null}
  -- For job assignment: {"criteria": {"roof_size_sq": {"min": 0, "max": 25}}, "assign_to_crew": "crew_b"}
  -- For insurance: {"criteria": {"carrier": "State Farm"}, "assign_to_team": "insurance"}
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- Priority (lower number = higher priority)
  priority int DEFAULT 100,
  
  -- Rule status
  is_active boolean DEFAULT true,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  created_by_user_id uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_assignment_rules_org ON public.team_assignment_rules(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_assignment_rules_target ON public.team_assignment_rules(org_id, target_type, is_active);
CREATE INDEX IF NOT EXISTS idx_assignment_rules_priority ON public.team_assignment_rules(org_id, priority) WHERE is_active = true;

-- ============================================================================
-- PART 5 — CREATE team_calendar_filters TABLE
-- ============================================================================
-- Defines what events show up in each team's calendar view

CREATE TABLE IF NOT EXISTS public.team_calendar_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.roofing_teams(id) ON DELETE CASCADE,
  
  -- What event types this team sees
  event_types text[] DEFAULT '{}'::text[], -- ['inspection', 'delivery', 'install', 'adjuster_meeting']
  
  -- Additional filters
  filter_config jsonb DEFAULT '{}'::jsonb, -- {"assigned_to_team": true, "job_stages": ["scheduled"], etc.}
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  CONSTRAINT unique_team_calendar_filter UNIQUE (team_id)
);

CREATE INDEX IF NOT EXISTS idx_team_calendar_filters_team ON public.team_calendar_filters(team_id);

-- ============================================================================
-- PART 6 — CREATE team_task_categories TABLE
-- ============================================================================
-- Defines what task categories each team sees/manages

CREATE TABLE IF NOT EXISTS public.team_task_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.roofing_teams(id) ON DELETE CASCADE,
  
  -- Task categories this team manages
  task_categories text[] DEFAULT '{}'::text[], -- ['lead_follow_up', 'quote_sent', 'insurance_supplement', etc.]
  
  -- Can this team create tasks in these categories?
  can_create boolean DEFAULT true,
  
  -- Can this team assign tasks to other teams?
  can_assign_to_teams uuid[] DEFAULT '{}'::uuid[],
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  CONSTRAINT unique_team_task_categories UNIQUE (team_id)
);

CREATE INDEX IF NOT EXISTS idx_team_task_categories_team ON public.team_task_categories(team_id);

-- ============================================================================
-- PART 7 — CREATE team_comments TABLE
-- ============================================================================
-- Internal team communication with tagging

CREATE TABLE IF NOT EXISTS public.team_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- What this comment is about
  entity_type text NOT NULL, -- 'lead', 'job', 'insurance_claim', 'task'
  entity_id uuid NOT NULL,
  
  -- Comment content
  comment text NOT NULL,
  
  -- Who created it
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  created_by_team_id uuid REFERENCES public.roofing_teams(id),
  
  -- Which teams/users are tagged (get notified)
  tagged_team_ids uuid[] DEFAULT '{}'::uuid[],
  tagged_user_ids uuid[] DEFAULT '{}'::uuid[],
  
  -- Metadata
  metadata jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_comments_entity ON public.team_comments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_team_comments_org ON public.team_comments(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_comments_tagged_teams ON public.team_comments USING GIN(tagged_team_ids);
CREATE INDEX IF NOT EXISTS idx_team_comments_tagged_users ON public.team_comments USING GIN(tagged_user_ids);

-- ============================================================================
-- PART 8 — CREATE team_performance_metrics TABLE
-- ============================================================================
-- Tracks performance metrics per team

CREATE TABLE IF NOT EXISTS public.team_performance_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.roofing_teams(id) ON DELETE CASCADE,
  
  -- Metric period
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  period_type text NOT NULL DEFAULT 'month', -- 'day', 'week', 'month', 'quarter', 'year'
  
  -- Metrics (JSONB for flexibility - different teams have different metrics)
  -- Sales: {"close_rate": 0.25, "inspection_to_quote_days": 2.5, "follow_up_consistency": 0.95}
  -- Insurance: {"supplement_approval_rate": 0.80, "cycle_time_days": 14, "documentation_errors": 2}
  -- Ops: {"delivery_accuracy": 0.98, "scheduling_reliability": 0.95}
  -- Crew: {"quality_score": 4.8, "cleanup_score": 4.9, "photo_compliance": 0.92, "speed_score": 4.5}
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  
  -- Computed at
  computed_at timestamptz DEFAULT now(),
  
  CONSTRAINT unique_team_period UNIQUE (team_id, period_start, period_end, period_type)
);

CREATE INDEX IF NOT EXISTS idx_team_performance_team ON public.team_performance_metrics(team_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_team_performance_period ON public.team_performance_metrics(team_id, period_type, period_start DESC);

-- ============================================================================
-- PART 9 — CREATE team_permissions TABLE
-- ============================================================================
-- Fine-grained permissions per team

CREATE TABLE IF NOT EXISTS public.team_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.roofing_teams(id) ON DELETE CASCADE,
  
  -- Permission scope
  resource_type text NOT NULL, -- 'lead', 'job', 'insurance_claim', 'calendar', 'task', 'revenue', 'billing'
  resource_id uuid,           -- Optional: specific resource, null = all resources of this type
  
  -- Permissions
  can_view boolean DEFAULT false,
  can_create boolean DEFAULT false,
  can_edit boolean DEFAULT false,
  can_delete boolean DEFAULT false,
  can_assign boolean DEFAULT false,
  
  -- Additional permissions (JSONB for flexibility)
  additional_permissions jsonb DEFAULT '{}'::jsonb,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  CONSTRAINT unique_team_resource_permission UNIQUE (team_id, resource_type, COALESCE(resource_id, '00000000-0000-0000-0000-000000000000'::uuid))
);

CREATE INDEX IF NOT EXISTS idx_team_permissions_team ON public.team_permissions(team_id, resource_type);
CREATE INDEX IF NOT EXISTS idx_team_permissions_resource ON public.team_permissions(resource_type, resource_id) WHERE resource_id IS NOT NULL;

-- ============================================================================
-- PART 10 — ADD TEAM COLUMNS TO EXISTING TABLES
-- ============================================================================

-- Add team assignment to leads
ALTER TABLE IF EXISTS public.leads
  ADD COLUMN IF NOT EXISTS assigned_team_id uuid REFERENCES public.roofing_teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_assigned_team ON public.leads(org_id, assigned_team_id) WHERE assigned_team_id IS NOT NULL;

-- Add team assignment to roofing_jobs
ALTER TABLE IF EXISTS public.roofing_jobs
  ADD COLUMN IF NOT EXISTS assigned_team_id uuid REFERENCES public.roofing_teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_roofing_jobs_assigned_team ON public.roofing_jobs(assigned_team_id) WHERE assigned_team_id IS NOT NULL;

-- Add team assignment to tasks (if tasks table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tasks') THEN
    ALTER TABLE public.tasks
      ADD COLUMN IF NOT EXISTS assigned_team_id uuid REFERENCES public.roofing_teams(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_tasks_assigned_team ON public.tasks(assigned_team_id) WHERE assigned_team_id IS NOT NULL;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roofing_tasks') THEN
    ALTER TABLE public.roofing_tasks
      ADD COLUMN IF NOT EXISTS assigned_team_id uuid REFERENCES public.roofing_teams(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_roofing_tasks_assigned_team ON public.roofing_tasks(assigned_team_id) WHERE assigned_team_id IS NOT NULL;
  END IF;
END $$;

-- ============================================================================
-- PART 11 — HELPER FUNCTIONS
-- ============================================================================

-- Get user's teams in an org
CREATE OR REPLACE FUNCTION public.get_user_teams(p_org_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE (
  team_id uuid,
  team_name text,
  team_type roofing_team_type,
  role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    rt.id as team_id,
    rt.name as team_name,
    rt.team_type,
    tm.role
  FROM public.roofing_teams rt
  JOIN public.team_members tm ON tm.team_id = rt.id
  WHERE rt.org_id = p_org_id
    AND tm.user_id = p_user_id
    AND rt.is_active = true
    AND tm.is_active = true;
$$;

-- Check if user is member of a team
CREATE OR REPLACE FUNCTION public.is_team_member(p_team_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1
    FROM public.team_members
    WHERE team_id = p_team_id
      AND user_id = p_user_id
      AND is_active = true
  );
$$;

-- Get team members
CREATE OR REPLACE FUNCTION public.get_team_members(p_team_id uuid)
RETURNS TABLE (
  user_id uuid,
  email text,
  role text,
  assigned_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    tm.user_id,
    au.email,
    tm.role,
    tm.assigned_at
  FROM public.team_members tm
  JOIN auth.users au ON au.id = tm.user_id
  WHERE tm.team_id = p_team_id
    AND tm.is_active = true;
$$;

-- Execute assignment rule
CREATE OR REPLACE FUNCTION public.execute_assignment_rule(
  p_rule_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_entity_data jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid -- Returns assigned team_id or user_id
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rule record;
  v_config jsonb;
  v_assigned_team_id uuid;
  v_assigned_user_id uuid;
  v_criteria jsonb;
BEGIN
  -- Get rule
  SELECT * INTO v_rule
  FROM public.team_assignment_rules
  WHERE id = p_rule_id
    AND is_active = true
    AND target_type = p_entity_type;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  v_config := v_rule.config;
  v_criteria := COALESCE(v_config->'criteria', '{}'::jsonb);
  
  -- Check if criteria matches (simplified - can be enhanced)
  -- For now, we'll do basic matching. Full implementation would need more complex logic
  
  -- Assign to team if specified
  IF v_config->>'assign_to_team' IS NOT NULL THEN
    SELECT id INTO v_assigned_team_id
    FROM public.roofing_teams
    WHERE org_id = v_rule.org_id
      AND name = v_config->>'assign_to_team'
      AND is_active = true
    LIMIT 1;
  END IF;
  
  -- Assign to user if specified
  IF v_config->>'assign_to_user' IS NOT NULL THEN
    v_assigned_user_id := (v_config->>'assign_to_user')::uuid;
  END IF;
  
  -- Update entity based on type
  IF p_entity_type = 'lead' THEN
    UPDATE public.leads
    SET assigned_team_id = v_assigned_team_id,
        assigned_user_id = COALESCE(v_assigned_user_id, assigned_user_id)
    WHERE id = p_entity_id;
  ELSIF p_entity_type = 'job' THEN
    UPDATE public.roofing_jobs
    SET assigned_team_id = v_assigned_team_id
    WHERE id = p_entity_id;
  END IF;
  
  RETURN COALESCE(v_assigned_team_id, v_assigned_user_id);
END;
$$;

-- ============================================================================
-- PART 12 — TRIGGERS
-- ============================================================================

-- Updated_at triggers
CREATE OR REPLACE FUNCTION public.set_roofing_teams_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_roofing_teams_updated_at
BEFORE UPDATE ON public.roofing_teams
FOR EACH ROW
EXECUTE FUNCTION public.set_roofing_teams_updated_at();

CREATE OR REPLACE FUNCTION public.set_team_members_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_team_members_updated_at
BEFORE UPDATE ON public.team_members
FOR EACH ROW
EXECUTE FUNCTION public.set_team_members_updated_at();

CREATE OR REPLACE FUNCTION public.set_team_assignment_rules_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_team_assignment_rules_updated_at
BEFORE UPDATE ON public.team_assignment_rules
FOR EACH ROW
EXECUTE FUNCTION public.set_team_assignment_rules_updated_at();

-- ============================================================================
-- PART 13 — ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS
ALTER TABLE public.roofing_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_assignment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_calendar_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_task_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_permissions ENABLE ROW LEVEL SECURITY;

-- Helper function to check org membership
CREATE OR REPLACE FUNCTION public.is_org_member_for_teams(check_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.org_memberships
    WHERE org_id = check_org 
      AND user_id = auth.uid() 
      AND status = 'active'
  );
$$;

-- RLS Policies for roofing_teams
CREATE POLICY "Users can view teams in their org"
  ON public.roofing_teams FOR SELECT
  USING (public.is_org_member_for_teams(org_id));

CREATE POLICY "Owners can create teams"
  ON public.roofing_teams FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_memberships
      WHERE org_id = roofing_teams.org_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
  );

CREATE POLICY "Team leaders can update teams"
  ON public.roofing_teams FOR UPDATE
  USING (
    public.is_org_member_for_teams(org_id) AND
    (
      EXISTS (
        SELECT 1 FROM public.org_memberships
        WHERE org_id = roofing_teams.org_id
          AND user_id = auth.uid()
          AND role IN ('owner', 'admin')
          AND status = 'active'
      )
      OR EXISTS (
        SELECT 1 FROM public.team_members
        WHERE team_id = roofing_teams.id
          AND user_id = auth.uid()
          AND role = 'leader'
          AND is_active = true
      )
    )
  );

-- RLS Policies for team_members
CREATE POLICY "Users can view team members in their org"
  ON public.team_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_teams rt
      WHERE rt.id = team_members.team_id
        AND public.is_org_member_for_teams(rt.org_id)
    )
  );

CREATE POLICY "Team leaders can manage members"
  ON public.team_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = team_members.team_id
        AND tm.user_id = auth.uid()
        AND tm.role = 'leader'
        AND tm.is_active = true
    )
    OR EXISTS (
      SELECT 1 FROM public.roofing_teams rt
      JOIN public.org_memberships om ON om.org_id = rt.org_id
      WHERE rt.id = team_members.team_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
        AND om.status = 'active'
    )
  );

-- RLS Policies for team_assignment_rules
CREATE POLICY "Users can view assignment rules in their org"
  ON public.team_assignment_rules FOR SELECT
  USING (public.is_org_member_for_teams(org_id));

CREATE POLICY "Owners can manage assignment rules"
  ON public.team_assignment_rules FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.org_memberships
      WHERE org_id = team_assignment_rules.org_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
        AND status = 'active'
    )
  );

-- RLS Policies for team_comments
CREATE POLICY "Users can view comments in their org"
  ON public.team_comments FOR SELECT
  USING (public.is_org_member_for_teams(org_id));

CREATE POLICY "Team members can create comments"
  ON public.team_comments FOR INSERT
  WITH CHECK (
    public.is_org_member_for_teams(org_id) AND
    (
      created_by_user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.team_members tm
        JOIN public.roofing_teams rt ON rt.id = tm.team_id
        WHERE rt.org_id = team_comments.org_id
          AND tm.user_id = auth.uid()
          AND tm.is_active = true
      )
    )
  );

-- RLS Policies for team_performance_metrics
CREATE POLICY "Users can view metrics for their teams"
  ON public.team_performance_metrics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.roofing_teams rt
      WHERE rt.id = team_performance_metrics.team_id
        AND public.is_org_member_for_teams(rt.org_id)
    )
  );

-- ============================================================================
-- PART 14 — GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roofing_teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_assignment_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_calendar_filters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_task_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_comments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_performance_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_permissions TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_user_teams(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_assignment_rule(uuid, text, uuid, jsonb) TO authenticated;

-- ============================================================================
-- PART 15 — COMMENTS
-- ============================================================================

COMMENT ON TABLE public.roofing_teams IS 'Functional teams within a roofing company (Sales, Insurance, Operations, Production, Crew, Owner)';
COMMENT ON TABLE public.team_members IS 'Users assigned to teams with specific roles';
COMMENT ON TABLE public.team_assignment_rules IS 'Automatic assignment rules for leads, jobs, insurance claims, and ops tasks';
COMMENT ON TABLE public.team_calendar_filters IS 'Calendar view filters per team';
COMMENT ON TABLE public.team_task_categories IS 'Task categories each team manages';
COMMENT ON TABLE public.team_comments IS 'Internal team communication with tagging';
COMMENT ON TABLE public.team_performance_metrics IS 'Performance metrics tracked per team';
COMMENT ON TABLE public.team_permissions IS 'Fine-grained permissions per team';




































