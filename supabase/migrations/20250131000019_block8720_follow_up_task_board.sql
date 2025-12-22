-- =========================================================
-- Block 8720 — Follow-Up Task Board
-- =========================================================
-- A simple Follow-Up Board that shows every homeowner who needs a reply,
-- so no money gets dropped.

-- 1) LEAD_TASKS TABLE
create table if not exists public.lead_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  source text check (source in ('auto_intent', 'manual')),
  title text not null,
  status text not null default 'open' check (status in ('open','done')),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- 2) INDEXES
create index if not exists lead_tasks_owner_id_status_due_idx
  on public.lead_tasks(owner_id, status, due_at);

create index if not exists lead_tasks_lead_id_idx
  on public.lead_tasks(lead_id);

-- 3) RLS POLICIES
alter table public.lead_tasks enable row level security;

create policy "Users can manage their own lead tasks"
  on public.lead_tasks
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- 4) COMMENTS
comment on table public.lead_tasks is 'Follow-up tasks attached to leads. Auto-created from intent classification or manually created by users.';
comment on column public.lead_tasks.source is 'Source of task: auto_intent (from AI classification) or manual (user-created)';
comment on column public.lead_tasks.status is 'Task status: open or done';
comment on column public.lead_tasks.due_at is 'When the task is due. Used for prioritization.';

























































