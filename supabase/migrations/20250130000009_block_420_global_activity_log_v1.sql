-- Block 420 — Global Activity Log v1 (Workspace-Wide: Sends, Opens, Clicks, Replies, Errors, Warmup Events)
-- Centralized, real-time activity feed for the entire SmartSend workspace

-- Add missing columns to workspace_activity table if they don't exist
alter table if exists workspace_activity
  add column if not exists type text,
  add column if not exists subtype text,
  add column if not exists step_id uuid,
  add column if not exists variant_id uuid;

-- Add foreign key constraints only if the referenced tables exist
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'sequence_steps') then
    alter table if exists workspace_activity
      drop constraint if exists workspace_activity_step_id_fkey;
    alter table if exists workspace_activity
      add constraint workspace_activity_step_id_fkey
      foreign key (step_id) references sequence_steps(id) on delete set null;
  end if;
  
  if exists (select 1 from information_schema.tables where table_name = 'sequence_step_variants') then
    alter table if exists workspace_activity
      drop constraint if exists workspace_activity_variant_id_fkey;
    alter table if exists workspace_activity
      add constraint workspace_activity_variant_id_fkey
      foreign key (variant_id) references sequence_step_variants(id) on delete set null;
  end if;
end $$;

-- Migrate existing event_type to type/subtype if needed
-- event_type format: "email_sent", "reply_received", etc.
-- We'll split common patterns: "email_sent" -> type='email', subtype='sent'
update workspace_activity
set 
  type = case 
    when event_type like 'email_%' then 'email'
    when event_type like 'reply%' or event_type like '%reply%' then 'email'
    when event_type like 'warmup%' or event_type like '%warmup%' then 'warmup'
    when event_type like 'campaign%' or event_type like '%campaign%' then 'campaign'
    when event_type like 'system%' or event_type like '%system%' then 'system'
    when event_type like 'team%' or event_type like '%team%' then 'team'
    when event_type like '%error%' or event_type like '%fail%' then 'error'
    else 'system'
  end,
  subtype = case
    when event_type = 'email_sent' then 'sent'
    when event_type = 'email_open' or event_type like '%open%' then 'open'
    when event_type = 'email_click' or event_type like '%click%' then 'click'
    when event_type like '%delivered%' then 'delivered'
    when event_type like '%bounce%' then 'bounce'
    when event_type like '%reply%' then 'reply'
    when event_type like '%warmup%sent%' then 'sent'
    when event_type like '%warmup%received%' then 'received'
    when event_type like '%quota%' then 'daily_quota_reached'
    when event_type like '%member_added%' then 'member_added'
    when event_type like '%updated%' then 'updated'
    when event_type like '%created%' then 'created'
    when event_type like '%paused%' then 'paused'
    when event_type like '%started%' then 'started'
    when event_type like '%fail%' or event_type like '%error%' then 'fail'
    else lower(replace(event_type, '_', ''))
  end
where type is null;

-- Ensure the table structure matches Block 420 spec exactly
-- If table doesn't exist, create it with full schema
create table if not exists workspace_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  type text not null,  -- 'email', 'reply', 'warmup', 'system', 'error', 'team', 'campaign'
  subtype text,        -- 'open', 'click', 'delivered', 'fail', 'variant_created', etc.
  actor_id uuid references auth.users(id),  -- null for system-generated
  lead_id uuid references leads(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  step_id uuid,
  variant_id uuid,
  metadata jsonb,       -- store extra details
  created_at timestamptz default now()
);

-- Add foreign key constraints for step_id and variant_id if tables exist
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'sequence_steps') then
    if not exists (
      select 1 from information_schema.table_constraints 
      where constraint_name = 'workspace_activity_step_id_fkey'
    ) then
      alter table workspace_activity
        add constraint workspace_activity_step_id_fkey
        foreign key (step_id) references sequence_steps(id) on delete set null;
    end if;
  end if;
  
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'sequence_step_variants') then
    if not exists (
      select 1 from information_schema.table_constraints 
      where constraint_name = 'workspace_activity_variant_id_fkey'
    ) then
      alter table workspace_activity
        add constraint workspace_activity_variant_id_fkey
        foreign key (variant_id) references sequence_step_variants(id) on delete set null;
    end if;
  end if;
end $$;

-- Keep backward compatibility: if event_type exists, ensure type/subtype are populated
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_name = 'workspace_activity' and column_name = 'event_type'
  ) then
    -- Migrate remaining rows
    update workspace_activity
    set 
      type = coalesce(type, case 
        when event_type like 'email_%' then 'email'
        when event_type like 'reply%' or event_type like '%reply%' then 'email'
        when event_type like 'warmup%' or event_type like '%warmup%' then 'warmup'
        when event_type like 'campaign%' or event_type like '%campaign%' then 'campaign'
        when event_type like 'system%' or event_type like '%system%' then 'system'
        when event_type like 'team%' or event_type like '%team%' then 'team'
        when event_type like '%error%' or event_type like '%fail%' then 'error'
        else 'system'
      end),
      subtype = coalesce(subtype, case
        when event_type = 'email_sent' then 'sent'
        when event_type = 'email_open' or event_type like '%open%' then 'open'
        when event_type = 'email_click' or event_type like '%click%' then 'click'
        when event_type like '%delivered%' then 'delivered'
        when event_type like '%bounce%' then 'bounce'
        when event_type like '%reply%' then 'reply'
        when event_type like '%warmup%sent%' then 'sent'
        when event_type like '%warmup%received%' then 'received'
        when event_type like '%quota%' then 'daily_quota_reached'
        when event_type like '%member_added%' then 'member_added'
        when event_type like '%updated%' then 'updated'
        when event_type like '%created%' then 'created'
        when event_type like '%paused%' then 'paused'
        when event_type like '%started%' then 'started'
        when event_type like '%fail%' or event_type like '%error%' then 'fail'
        else lower(replace(event_type, '_', ''))
      end)
    where type is null or subtype is null;
  end if;
end $$;

-- Create index for workspace activity queries (Block 420 requirement)
create index if not exists idx_workspace_activity_workspace
on workspace_activity(workspace_id, created_at desc);

-- Additional indexes for common queries
create index if not exists idx_workspace_activity_type_subtype
on workspace_activity(workspace_id, type, subtype, created_at desc);

create index if not exists idx_workspace_activity_campaign
on workspace_activity(campaign_id, created_at desc) where campaign_id is not null;

create index if not exists idx_workspace_activity_lead
on workspace_activity(lead_id, created_at desc) where lead_id is not null;

-- Enable RLS if not already enabled
alter table workspace_activity enable row level security;

-- RLS Policy: Users can view activity for their workspace
drop policy if exists "Users can view workspace_activity" on workspace_activity;
create policy "Users can view workspace_activity" on workspace_activity
  for select using (
    exists (
      select 1 from workspace_members wm
      where wm.workspace_id = workspace_activity.workspace_id
      and wm.user_id = auth.uid()
    )
    or exists (
      select 1 from team_members tm
      where tm.workspace_id = workspace_activity.workspace_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
    )
  );

-- RLS Policy: Service role can insert activity (for logging from server-side)
drop policy if exists "Service can insert workspace_activity" on workspace_activity;
create policy "Service can insert workspace_activity" on workspace_activity
  for insert with check (true);

-- RLS Policy: Authenticated users can insert their own activity
drop policy if exists "Users can insert workspace_activity" on workspace_activity;
create policy "Users can insert workspace_activity" on workspace_activity
  for insert with check (
    exists (
      select 1 from workspace_members wm
      where wm.workspace_id = workspace_activity.workspace_id
      and wm.user_id = auth.uid()
    )
    or exists (
      select 1 from team_members tm
      where tm.workspace_id = workspace_activity.workspace_id
      and tm.user_id = auth.uid()
      and tm.status = 'active'
    )
  );

-- Grant access to authenticated users
grant select, insert on workspace_activity to authenticated;

-- Update view to use new schema
drop view if exists workspace_activity_view;
create or replace view workspace_activity_view as
select
  a.id,
  a.workspace_id,
  a.type,
  a.subtype,
  a.actor_id,
  a.lead_id,
  a.campaign_id,
  a.step_id,
  a.variant_id,
  a.metadata,
  a.created_at,
  l.first_name as lead_first_name,
  l.last_name as lead_last_name,
  l.email as lead_email,
  l.company as lead_company,
  c.name as campaign_name,
  u.email as actor_email,
  u.raw_user_meta_data->>'name' as actor_name
from workspace_activity a
left join leads l on l.id = a.lead_id
left join campaigns c on c.id = a.campaign_id
left join auth.users u on u.id = a.actor_id;

grant select on workspace_activity_view to authenticated;

