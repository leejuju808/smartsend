-- Inbox Management System
-- Adds thread state (assignee, snooze, done) to campaign_logs
-- Creates inbox_tasks table for follow-ups
-- Creates user_notifications table for preferences

-- 1) Thread state (attach to campaign_logs)
alter table if exists campaign_logs
  add column if not exists assignee_id uuid references auth.users(id) on delete set null,
  add column if not exists snoozed_until timestamptz,
  add column if not exists is_done boolean not null default false;

create index if not exists idx_logs_assignee on campaign_logs(assignee_id);
create index if not exists idx_logs_snooze on campaign_logs(snoozed_until);

-- 2) Lightweight tasks for follow-ups
create table if not exists inbox_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  campaign_id uuid references campaigns(id) on delete cascade,
  lead_id uuid references leads(id) on delete cascade,
  log_id uuid references campaign_logs(id) on delete set null, -- originating reply
  title text not null,              -- "Send pricing", "Confirm time", etc.
  notes text,
  assignee_id uuid references auth.users(id) on delete set null,
  status text not null default 'open' check (status in ('open','done','canceled')),
  due_at timestamptz,               -- when to remind
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table inbox_tasks enable row level security;
create policy "read tasks in org"  on inbox_tasks for select using (is_org_member(org_id));
create policy "write tasks in org" on inbox_tasks for all    using (is_org_member(org_id)) with check (is_org_member(org_id));

create index if not exists idx_tasks_due on inbox_tasks(due_at) where status='open';
create index if not exists idx_tasks_assignee on inbox_tasks(assignee_id);

-- 3) Optional: per-user notification preferences
create table if not exists user_notifications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email boolean default true,
  in_app boolean default true,
  timezone text default 'America/Los_Angeles'
);

alter table user_notifications enable row level security;
create policy "me" on user_notifications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

