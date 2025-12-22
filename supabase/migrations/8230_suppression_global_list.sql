-- 8230_suppression_global_list.sql

-- 1) Core table
create table if not exists public.global_suppressions (
  id uuid primary key default gen_random_uuid(),

  -- "Global" per workspace/account
  workspace_id uuid not null
    references public.workspaces(id)
    on delete cascade,

  -- Email to never send to
  email citext not null,

  -- Optional metadata
  reason text,
  source text check (
    source in ('manual', 'bounce', 'complaint', 'spamtrap', 'admin', 'api')
  ) default 'manual',

  created_by uuid
    references public.profiles(id),
  created_at timestamptz not null default now()
);

-- 2) One active suppression per workspace + email
create unique index if not exists global_suppressions_workspace_email_idx
  on public.global_suppressions (workspace_id, email);

-- 3) Enable RLS
alter table public.global_suppressions enable row level security;

-- 4) RLS policy: workspace members can see/manage their suppressions
-- Adjust table/column names here if your membership table is named differently
create policy "Workspace members can read their suppressions"
on public.global_suppressions
for select
using (
  workspace_id in (
    select wm.workspace_id
    from public.workspace_members wm
    where wm.user_id = auth.uid()
  )
);

create policy "Workspace members can insert suppressions"
on public.global_suppressions
for insert
with check (
  workspace_id in (
    select wm.workspace_id
    from public.workspace_members wm
    where wm.user_id = auth.uid()
  )
);

create policy "Workspace members can update suppressions"
on public.global_suppressions
for update
using (
  workspace_id in (
    select wm.workspace_id
    from public.workspace_members wm
    where wm.user_id = auth.uid()
  )
)
with check (
  workspace_id in (
    select wm.workspace_id
    from public.workspace_members wm
    where wm.user_id = auth.uid()
  )
);

create policy "Workspace members can delete suppressions"
on public.global_suppressions
for delete
using (
  workspace_id in (
    select wm.workspace_id
    from public.workspace_members wm
    where wm.user_id = auth.uid()
  )
);

-- 5) Helper function: quick suppression check
-- This will be used by your queue / orchestrator to skip suppressed emails
create or replace function public.is_suppressed(
  p_workspace_id uuid,
  p_email text
)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.global_suppressions gs
    where gs.workspace_id = p_workspace_id
      and gs.email = p_email::citext
  );
$$;

































































