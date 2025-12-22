-- Block 327 — Meeting Intent → Auto-Create Task v1
-- Tasks table for CRM-style follow-up task management

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),

  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  lead_id uuid references leads(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  reply_id uuid references reply_logs(id) on delete set null,

  title text not null,
  notes text,
  status text not null default 'open',   -- 'open' | 'done'

  due_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  constraint tasks_status_check
    check (status in ('open','done'))
);

create index if not exists tasks_workspace_idx
  on tasks (workspace_id);

create index if not exists tasks_user_idx
  on tasks (workspace_id, user_id);

create index if not exists tasks_lead_idx
  on tasks (workspace_id, lead_id);

-- Trigger to update updated_at
create or replace function set_tasks_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tasks_updated_at on tasks;

create trigger trg_tasks_updated_at
before update on tasks
for each row
execute procedure set_tasks_updated_at();

-- Enable RLS
alter table tasks enable row level security;

-- RLS Policies
-- Users can view tasks in their workspace
create policy "tasks_select_workspace_member"
  on tasks
  for select
  using (
    workspace_id in (
      select workspace_id from team_members
      where user_id = auth.uid() and status = 'active'
    )
  );

-- Users can insert tasks in their workspace
create policy "tasks_insert_workspace_member"
  on tasks
  for insert
  with check (
    workspace_id in (
      select workspace_id from team_members
      where user_id = auth.uid() and status = 'active'
    )
  );

-- Users can update their own tasks or tasks in their workspace
create policy "tasks_update_workspace_member"
  on tasks
  for update
  using (
    user_id = auth.uid() or
    workspace_id in (
      select workspace_id from team_members
      where user_id = auth.uid() and status = 'active'
    )
  )
  with check (
    user_id = auth.uid() or
    workspace_id in (
      select workspace_id from team_members
      where user_id = auth.uid() and status = 'active'
    )
  );






