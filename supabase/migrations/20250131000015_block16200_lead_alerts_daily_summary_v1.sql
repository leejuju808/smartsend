-- Block 16200 — Lead Alerts & Daily Summary v1
-- (Never Miss a Hot Roofing Lead, Even Off the Laptop)
-- This is the "speed-to-lead" block.

-- ============================================================================
-- 1. ADD notification_settings COLUMN TO workspaces TABLE
-- ============================================================================

alter table public.workspaces
  add column if not exists notification_settings jsonb;

-- ============================================================================
-- 2. SET DEFAULT VALUES FOR EXISTING WORKSPACES
-- ============================================================================

update public.workspaces
set notification_settings = '{
  "instant_hot_lead_email": true,
  "instant_any_reply_email": false,
  "daily_summary_email": true
}'::jsonb
where notification_settings is null;

-- ============================================================================
-- 3. CREATE notification_logs TABLE
-- ============================================================================

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  type text not null, -- 'instant_hot_lead', 'instant_reply', 'daily_summary'
  meta jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_notification_logs_workspace_type_created 
  on public.notification_logs (workspace_id, type, created_at);

-- ============================================================================
-- 4. COMMENTS
-- ============================================================================

comment on column public.workspaces.notification_settings is 'Notification preferences for this workspace. Controls instant email alerts for hot/warm leads and daily summary emails.';
comment on table public.notification_logs is 'Logs of notifications sent to prevent spam and for debugging.';



























































