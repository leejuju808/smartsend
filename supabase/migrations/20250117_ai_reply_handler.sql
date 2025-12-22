-- AI Reply Handler Migration
-- Adds intent classification to channel_messages, sales_tasks table, and lead stage tracking

-- 1. Add AI intent classification columns to channel_messages
alter table channel_messages
  add column if not exists ai_intent text,
  add column if not exists ai_confidence numeric,
  add column if not exists thread_id text;

-- Indexes for AI intent queries
create index if not exists idx_channel_messages_ai_intent on channel_messages(ai_intent);
create index if not exists idx_channel_messages_thread on channel_messages(thread_id);

-- 2. Create sales_tasks table for tracking follow-up actions
create table if not exists sales_tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  lead_id uuid not null,
  type text not null,         -- call, demo, followup, research
  notes text,
  due_at timestamptz,
  status text default 'open', -- open | done
  created_at timestamptz default now()
);

-- Indexes for sales_tasks
create index if not exists idx_sales_tasks_org on sales_tasks(org_id);
create index if not exists idx_sales_tasks_lead on sales_tasks(lead_id);
create index if not exists idx_sales_tasks_status on sales_tasks(status);
create index if not exists idx_sales_tasks_due_at on sales_tasks(due_at);

-- RLS for sales_tasks
alter table sales_tasks enable row level security;

drop policy if exists "read sales_tasks by org" on sales_tasks;
create policy "read sales_tasks by org" on sales_tasks
  for select using (
    org_id in (select org_id from organization_members where user_id = auth.uid())
    or org_id in (select id from organizations where owner_id = auth.uid())
    or org_id in (select org_id from org_members where user_id = auth.uid())
    or org_id in (select id from orgs where owner_id = auth.uid())
  );

drop policy if exists "insert sales_tasks by org" on sales_tasks;
create policy "insert sales_tasks by org" on sales_tasks
  for insert with check (
    org_id in (select org_id from organization_members where user_id = auth.uid())
    or org_id in (select id from organizations where owner_id = auth.uid())
    or org_id in (select org_id from org_members where user_id = auth.uid())
    or org_id in (select id from orgs where owner_id = auth.uid())
  );

drop policy if exists "update sales_tasks by org" on sales_tasks;
create policy "update sales_tasks by org" on sales_tasks
  for update using (
    org_id in (select org_id from organization_members where user_id = auth.uid())
    or org_id in (select id from organizations where owner_id = auth.uid())
    or org_id in (select org_id from org_members where user_id = auth.uid())
    or org_id in (select id from orgs where owner_id = auth.uid())
  );

-- 3. Add stage column to leads table
alter table leads
  add column if not exists stage text default 'new'; -- new | contacted | engaged | qualified | closed_lost | unsubscribed

-- Index for lead stage queries
create index if not exists idx_leads_stage on leads(stage);

