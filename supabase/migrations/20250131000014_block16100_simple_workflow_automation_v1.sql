-- Block 16100 — Simple Workflow Automation v1
-- (If Reply → Task, If Hot → Priority, If Won → Log Revenue)
-- This is the "don't drop money on the floor" block.

-- ============================================================================
-- 1. ADD auto_workflows COLUMN TO workspaces TABLE
-- ============================================================================

alter table public.workspaces
  add column if not exists auto_workflows jsonb;

-- ============================================================================
-- 2. SET DEFAULT VALUES FOR EXISTING WORKSPACES
-- ============================================================================

update public.workspaces
set auto_workflows = '{
  "on_reply_create_task": true,
  "on_hot_lead_stage_change": true,
  "on_warm_lead_stage_change": true,
  "on_won_log_revenue": true
}'::jsonb
where auto_workflows is null;

-- ============================================================================
-- 3. COMMENTS
-- ============================================================================

comment on column public.workspaces.auto_workflows is 'Workflow automation settings for this workspace. Controls automatic actions like task creation, stage changes, and revenue logging.';



























































