-- Block 351: Daily Send Cap Enforcement v1
-- workspace_billing_limits table (per-workspace caps)

-- Update existing workspace_billing_limits table to match Block 351 spec
-- If table doesn't exist, create it; if it exists, add missing columns

-- Ensure table exists with Block 351 schema
create table if not exists workspace_billing_limits (
  workspace_id uuid primary key references workspaces(id) on delete cascade,

  -- Max emails that can be SENT per calendar day (across all campaigns)
  daily_send_cap integer not null default 500,

  -- Optional: max replies you will process/track per day (for future use)
  daily_reply_cap integer,

  -- Max active seats for this workspace (for per-seat billing UI)
  seat_limit integer,

  -- How to behave when cap is hit
  -- 'hard_stop' = do not send above cap
  -- 'soft_warn' = allow small temporary overage (future)
  overage_behavior text not null default 'hard_stop' check (
    overage_behavior in ('hard_stop', 'soft_warn')
  ),

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Add missing columns if table already exists
do $$ 
begin
  -- Add daily_send_cap if missing (should exist, but ensure it)
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'workspace_billing_limits' 
    and column_name = 'daily_send_cap'
  ) then
    alter table workspace_billing_limits add column daily_send_cap integer not null default 500;
  end if;

  -- Add daily_reply_cap if missing
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'workspace_billing_limits' 
    and column_name = 'daily_reply_cap'
  ) then
    alter table workspace_billing_limits add column daily_reply_cap integer;
  end if;

  -- Add seat_limit if missing
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'workspace_billing_limits' 
    and column_name = 'seat_limit'
  ) then
    alter table workspace_billing_limits add column seat_limit integer;
  end if;

  -- Add overage_behavior if missing
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'workspace_billing_limits' 
    and column_name = 'overage_behavior'
  ) then
    alter table workspace_billing_limits add column overage_behavior text not null default 'hard_stop';
    -- Add check constraint
    alter table workspace_billing_limits add constraint workspace_billing_limits_overage_behavior_check 
      check (overage_behavior in ('hard_stop', 'soft_warn'));
  end if;

  -- Migrate hard_stop boolean to overage_behavior if needed
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'workspace_billing_limits' 
    and column_name = 'hard_stop'
  ) and exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'workspace_billing_limits' 
    and column_name = 'overage_behavior'
  ) then
    -- Migrate hard_stop to overage_behavior
    update workspace_billing_limits 
    set overage_behavior = case when hard_stop then 'hard_stop' else 'soft_warn' end
    where overage_behavior = 'hard_stop' and hard_stop is not null;
    -- Drop old column after migration
    alter table workspace_billing_limits drop column if exists hard_stop;
  end if;
end $$;

-- Ensure updated_at trigger exists
create or replace function set_workspace_billing_limits_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_workspace_billing_limits_updated_at on workspace_billing_limits;

create trigger trg_workspace_billing_limits_updated_at
before update on workspace_billing_limits
for each row
execute procedure set_workspace_billing_limits_updated_at();

-- Seed rows for existing workspaces (if not already present)
insert into workspace_billing_limits (workspace_id, daily_send_cap, seat_limit)
select id, 500, 1
from workspaces
on conflict (workspace_id) do nothing;

-- Ensure RLS is enabled
alter table workspace_billing_limits enable row level security;

-- Service role can read/write (for dispatcher)
drop policy if exists workspace_billing_limits_service on workspace_billing_limits;
create policy workspace_billing_limits_service on workspace_billing_limits
  for all to service_role
  using (true) with check (true);

-- Workspace members can read their workspace limits
drop policy if exists workspace_billing_limits_select on workspace_billing_limits;
create policy workspace_billing_limits_select on workspace_billing_limits
  for select to authenticated
  using (
    exists (
      select 1 from workspace_members
      where workspace_id = workspace_billing_limits.workspace_id
      and user_id = auth.uid()
    )
  );





