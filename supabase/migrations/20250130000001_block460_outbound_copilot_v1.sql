-- Block 460 — Smart AI Agent (Outbound Copilot v1)
-- Automatic Sequence Writing • Automatic Optimization • AI SDR Core • Fully Drafts Multi-Step Sequences
-- 
-- This migration creates the foundation for Outbound Copilot v1:
-- - Copilot actions tracking
-- - Activity logs for AI-generated changes
-- - Integration with step stats, deliverability, and predictions

-- ============================================================================
-- 1. OUTBOUND COPILOT ACTIONS TABLE
-- ============================================================================

create table if not exists public.outbound_copilot_actions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  action_type text not null check (action_type in (
    'create_sequence',
    'rewrite_sequence',
    'fix_underperforming_steps',
    'shorten_steps',
    'expand_multichannel',
    'inject_personalization',
    'rewrite_for_icp',
    'optimize_subject_lines',
    'fix_deliverability',
    'add_high_intent_step',
    'auto_optimize_all'
  )),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  input_config jsonb default '{}'::jsonb, -- ICP, tone, channels, etc.
  output_data jsonb default '{}'::jsonb, -- Generated steps, changes, recommendations
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  completed_at timestamptz,
  error_message text
);

create index if not exists idx_copilot_actions_workspace on public.outbound_copilot_actions(workspace_id);
create index if not exists idx_copilot_actions_campaign on public.outbound_copilot_actions(campaign_id);
create index if not exists idx_copilot_actions_status on public.outbound_copilot_actions(status);
create index if not exists idx_copilot_actions_type on public.outbound_copilot_actions(action_type);
create index if not exists idx_copilot_actions_created_at on public.outbound_copilot_actions(created_at desc);

-- ============================================================================
-- 2. COPILOT ACTIVITY LOG TABLE
-- ============================================================================

create table if not exists public.copilot_activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  action_id uuid references public.outbound_copilot_actions(id) on delete set null,
  activity_type text not null check (activity_type in (
    'sequence_created',
    'step_rewritten',
    'step_created',
    'step_deleted',
    'variant_removed',
    'timing_adjusted',
    'personalization_added',
    'deliverability_fixed',
    'subject_line_optimized',
    'icp_targeted',
    'multichannel_expanded',
    'recommendation_given'
  )),
  entity_type text, -- 'step', 'variant', 'campaign', etc.
  entity_id uuid, -- ID of the affected entity
  message text not null, -- Human-readable description
  changes_jsonb jsonb default '{}'::jsonb, -- Before/after data
  created_at timestamptz default now()
);

create index if not exists idx_copilot_activity_workspace on public.copilot_activity_log(workspace_id);
create index if not exists idx_copilot_activity_campaign on public.copilot_activity_log(campaign_id);
create index if not exists idx_copilot_activity_action on public.copilot_activity_log(action_id);
create index if not exists idx_copilot_activity_type on public.copilot_activity_log(activity_type);
create index if not exists idx_copilot_activity_created_at on public.copilot_activity_log(created_at desc);

-- ============================================================================
-- 3. COPILOT RECOMMENDATIONS TABLE
-- ============================================================================

create table if not exists public.copilot_recommendations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  recommendation_type text not null check (recommendation_type in (
    'step_performance',
    'deliverability_risk',
    'variant_removal',
    'icp_optimization',
    'timing_adjustment',
    'inbox_switch',
    'domain_switch',
    'personalization_improvement',
    'subject_line_improvement',
    'multichannel_expansion'
  )),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  title text not null,
  description text not null,
  recommendation_data jsonb default '{}'::jsonb, -- Specific recommendations with data
  status text not null default 'pending' check (status in ('pending', 'applied', 'dismissed', 'ignored')),
  applied_at timestamptz,
  applied_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists idx_copilot_recommendations_workspace on public.copilot_recommendations(workspace_id);
create index if not exists idx_copilot_recommendations_campaign on public.copilot_recommendations(campaign_id);
create index if not exists idx_copilot_recommendations_status on public.copilot_recommendations(status);
create index if not exists idx_copilot_recommendations_priority on public.copilot_recommendations(priority);
create index if not exists idx_copilot_recommendations_type on public.copilot_recommendations(recommendation_type);

-- ============================================================================
-- 4. EXTEND campaign_steps FOR COPILOT METADATA
-- ============================================================================

alter table public.campaign_steps
  add column if not exists copilot_generated boolean default false,
  add column if not exists copilot_generation_id uuid references public.outbound_copilot_actions(id) on delete set null,
  add column if not exists copilot_score numeric, -- Performance score (0-100)
  add column if not exists copilot_notes text; -- AI-generated notes about this step

create index if not exists idx_campaign_steps_copilot_generated on public.campaign_steps(copilot_generated);
create index if not exists idx_campaign_steps_copilot_score on public.campaign_steps(copilot_score);

-- ============================================================================
-- 5. HELPER FUNCTION: LOG COPILOT ACTIVITY
-- ============================================================================

create or replace function public.log_copilot_activity(
  p_workspace_id uuid,
  p_campaign_id uuid,
  p_action_id uuid default null,
  p_activity_type text,
  p_message text,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_changes jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
begin
  insert into public.copilot_activity_log (
    workspace_id,
    campaign_id,
    action_id,
    activity_type,
    entity_type,
    entity_id,
    message,
    changes_jsonb
  ) values (
    p_workspace_id,
    p_campaign_id,
    p_action_id,
    p_activity_type,
    p_entity_type,
    p_entity_id,
    p_message,
    p_changes
  )
  returning id into v_log_id;
  
  return v_log_id;
end;
$$;

-- ============================================================================
-- 6. HELPER FUNCTION: CREATE COPILOT RECOMMENDATION
-- ============================================================================

create or replace function public.create_copilot_recommendation(
  p_workspace_id uuid,
  p_campaign_id uuid,
  p_recommendation_type text,
  p_title text,
  p_description text,
  p_priority text default 'medium',
  p_recommendation_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rec_id uuid;
begin
  insert into public.copilot_recommendations (
    workspace_id,
    campaign_id,
    recommendation_type,
    priority,
    title,
    description,
    recommendation_data
  ) values (
    p_workspace_id,
    p_campaign_id,
    p_recommendation_type,
    p_priority,
    p_title,
    p_description,
    p_recommendation_data
  )
  returning id into v_rec_id;
  
  return v_rec_id;
end;
$$;

-- ============================================================================
-- 7. RLS POLICIES
-- ============================================================================

alter table public.outbound_copilot_actions enable row level security;
alter table public.copilot_activity_log enable row level security;
alter table public.copilot_recommendations enable row level security;

-- Copilot actions: users can see actions for campaigns in their workspace
create policy "copilot_actions_select_workspace" on public.outbound_copilot_actions
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = outbound_copilot_actions.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "copilot_actions_insert_workspace" on public.outbound_copilot_actions
  for insert with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "copilot_actions_update_workspace" on public.outbound_copilot_actions
  for update using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = outbound_copilot_actions.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- Activity log: users can see logs for campaigns in their workspace
create policy "copilot_activity_select_workspace" on public.copilot_activity_log
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = copilot_activity_log.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "copilot_activity_insert_workspace" on public.copilot_activity_log
  for insert with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- Recommendations: users can see and manage recommendations for campaigns in their workspace
create policy "copilot_recommendations_select_workspace" on public.copilot_recommendations
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = copilot_recommendations.workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "copilot_recommendations_insert_workspace" on public.copilot_recommendations
  for insert with check (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_id
      and wm.user_id = auth.uid()
    )
  );

create policy "copilot_recommendations_update_workspace" on public.copilot_recommendations
  for update using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = copilot_recommendations.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- Service role can manage all copilot data
create policy "copilot_actions_service_role" on public.outbound_copilot_actions
  for all using (auth.role() = 'service_role');

create policy "copilot_activity_service_role" on public.copilot_activity_log
  for all using (auth.role() = 'service_role');

create policy "copilot_recommendations_service_role" on public.copilot_recommendations
  for all using (auth.role() = 'service_role');

-- ============================================================================
-- BLOCK 460 COMPLETE
-- ============================================================================



