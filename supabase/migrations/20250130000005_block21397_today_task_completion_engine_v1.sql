-- Block 21397 — SmartSend Today Task Completion Engine v1
-- Creates the daily action brain of SmartSend

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  campaign_id uuid references campaigns(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'pending', -- pending | completed
  priority text default 'normal', -- low | normal | high
  due_date date not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- index for fast querying today's tasks
create index tasks_user_due_date_idx 
on tasks (user_id, due_date);

-- RLS
alter table tasks enable row level security;

create policy "tasks_select_own"
on tasks for select
using (auth.uid() = user_id);

create policy "tasks_insert_own"
on tasks for insert
with check (auth.uid() = user_id);

create policy "tasks_update_own"
on tasks for update
using (auth.uid() = user_id);

create policy "tasks_delete_own"
on tasks for delete
using (auth.uid() = user_id);














































