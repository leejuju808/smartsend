-- ============================================================
-- BLOCK 274100 — SmartSend Point-of-Control Sprint
-- Make SmartSend the only place decisions can be made:
-- - Every meaningful lever change requires an explicit Act/Accept decision record.
-- - No shadow management: if there's no decision record, the change is rejected.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Decision records (Act / Accept)
-- ------------------------------------------------------------
create table if not exists public.ss_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  decision_type text not null,
  choice text not null check (choice in ('act','accept')),
  action_label text not null default '',
  proposed_changes jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  valid_until timestamptz
);

create index if not exists idx_ss_decisions_ws_created
  on public.ss_decisions(workspace_id, created_at desc);

create index if not exists idx_ss_decisions_valid_until
  on public.ss_decisions(valid_until);

comment on table public.ss_decisions is
  'Block 274100: Point-of-control decision records. All meaningful changes require an explicit Act/Accept logged inside SmartSend.';

alter table public.ss_decisions enable row level security;

-- Workspace members can view decision history for their workspace.
drop policy if exists "ss_decisions_select_workspace_members" on public.ss_decisions;
create policy "ss_decisions_select_workspace_members"
  on public.ss_decisions
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = ss_decisions.workspace_id
        and wm.user_id = auth.uid()
    )
  );

-- Only owner/admin can insert decisions (decision-making authority).
drop policy if exists "ss_decisions_insert_owner_admin" on public.ss_decisions;
create policy "ss_decisions_insert_owner_admin"
  on public.ss_decisions
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.workspace_members wm
      where wm.workspace_id = ss_decisions.workspace_id
        and wm.user_id = auth.uid()
        and wm.role in ('owner','admin')
    )
  );

drop policy if exists "ss_decisions_service_role_all" on public.ss_decisions;
create policy "ss_decisions_service_role_all"
  on public.ss_decisions
  for all
  to service_role
  using (true)
  with check (true);

revoke update, delete on public.ss_decisions from authenticated;
grant select, insert on public.ss_decisions to authenticated;
grant all on public.ss_decisions to service_role;



