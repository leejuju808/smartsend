-- Block 13300 — Calendar & Scheduling Sync v1
-- Inspections, Follow-Ups & Tasks into Calendar View
-- This migration ensures all necessary indexes exist for calendar queries

-- ============================================================================
-- 1. ENSURE INDEXES EXIST FOR CALENDAR QUERIES
-- ============================================================================

-- Contacts inspection_at index (should already exist from Block 12500)
CREATE INDEX IF NOT EXISTS contacts_inspection_at_idx ON public.contacts(inspection_at) 
WHERE inspection_at IS NOT NULL;

-- Tasks due_date index (should already exist from Block 11500)
CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON public.tasks(due_date) 
WHERE due_date IS NOT NULL;

-- Tasks due_at index for time-based queries
CREATE INDEX IF NOT EXISTS tasks_due_at_idx ON public.tasks(due_at) 
WHERE due_at IS NOT NULL AND completed = false;

-- Composite index for org + assigned_to + due_date (for filtering)
CREATE INDEX IF NOT EXISTS idx_tasks_org_assigned_due_date ON public.tasks(org_id, assigned_to, due_date) 
WHERE completed = false AND due_date IS NOT NULL;

-- Composite index for workspace + inspection_at (for filtering)
CREATE INDEX IF NOT EXISTS idx_contacts_workspace_inspection_at ON public.contacts(workspace_id, inspection_at) 
WHERE inspection_at IS NOT NULL;

-- Index for inspection_assigned_to lookups
CREATE INDEX IF NOT EXISTS idx_contacts_inspection_assigned_to ON public.contacts(inspection_assigned_to) 
WHERE inspection_assigned_to IS NOT NULL;

-- ============================================================================
-- 2. HELPER FUNCTION TO GET ORG_ID FROM WORKSPACE_ID
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_org_id_from_workspace(p_workspace_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT org_id FROM public.workspaces WHERE id = p_workspace_id LIMIT 1),
    p_workspace_id  -- Fallback: use workspace_id as org_id if no mapping exists
  );
$$;

-- ============================================================================
-- 3. COMMENTS
-- ============================================================================

COMMENT ON INDEX contacts_inspection_at_idx IS 'Index for calendar queries filtering inspections by date';
COMMENT ON INDEX tasks_due_date_idx IS 'Index for calendar queries filtering tasks by due date';
COMMENT ON FUNCTION public.get_org_id_from_workspace IS 'Helper to get org_id from workspace_id for cross-table queries';



























































