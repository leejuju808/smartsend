-- Block 21: Audit & Observability
-- This migration creates system_logs table and views for observability

-- ============================================================================
-- 1. System Logs Table
-- ============================================================================

create table if not exists public.system_logs (
  id uuid primary key default gen_random_uuid(),
  category text not null, -- 'send_queue', 'reply_detection', 'stripe_webhook', 'referral_credit', 'error', 'general'
  level text not null check (level in ('info', 'warn', 'error')), -- log level
  context jsonb default '{}'::jsonb, -- flexible JSON context (workspace_id, user_id, campaign_id, etc.)
  actor text, -- user_id or system identifier
  message text not null,
  stack_trace text, -- for errors
  created_at timestamptz not null default now()
);

-- Indexes for efficient queries
create index if not exists idx_system_logs_category on public.system_logs(category);
create index if not exists idx_system_logs_level on public.system_logs(level);
create index if not exists idx_system_logs_created_at on public.system_logs(created_at desc);
create index if not exists idx_system_logs_actor on public.system_logs(actor) where actor is not null;

-- Index on context for common queries (workspace_id, user_id, campaign_id)
create index if not exists idx_system_logs_context_workspace on public.system_logs using gin (context jsonb_path_ops) 
  where context ? 'workspace_id';
create index if not exists idx_system_logs_context_user on public.system_logs using gin (context jsonb_path_ops) 
  where context ? 'user_id';

-- Enable RLS
alter table public.system_logs enable row level security;

-- RLS: Service role can manage all logs
create policy "service_role_full_access"
  on public.system_logs
  for all
  using (true)
  with check (true);

-- RLS: Users can view logs for their workspace (via context)
create policy "users_view_workspace_logs"
  on public.system_logs
  for select
  using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = (system_logs.context->>'workspace_id')::uuid
      and wm.user_id = auth.uid()
    )
    or actor = auth.uid()::text
  );

-- ============================================================================
-- 2. View: Log Statistics by Category
-- ============================================================================

create or replace view public.view_log_stats as
select 
  category,
  level,
  count(*) as log_count,
  count(*) filter (where created_at >= now() - interval '24 hours') as count_24h,
  count(*) filter (where created_at >= now() - interval '7 days') as count_7d,
  max(created_at) as last_logged_at
from public.system_logs
group by category, level;

-- Grant access to view
grant select on public.view_log_stats to authenticated;

-- ============================================================================
-- 3. Helper Function: Insert System Log
-- ============================================================================

create or replace function public.fn_insert_system_log(
  p_category text,
  p_level text,
  p_message text,
  p_context jsonb default '{}'::jsonb,
  p_actor text default null,
  p_stack_trace text default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  log_id uuid;
begin
  insert into public.system_logs (
    category,
    level,
    message,
    context,
    actor,
    stack_trace
  ) values (
    p_category,
    p_level,
    p_message,
    p_context,
    p_actor,
    p_stack_trace
  )
  returning id into log_id;
  
  return log_id;
end;
$$;

-- Grant execute to authenticated users (they'll use service role in practice)
grant execute on function public.fn_insert_system_log to service_role;
grant execute on function public.fn_insert_system_log to authenticated;

