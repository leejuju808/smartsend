create table if not exists public.suppressions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  type text not null check (type in ('email','domain')),  -- exact address or whole domain
  value text not null,                                    -- 'user@example.com' or 'example.com'
  reason text,                                            -- 'unsubscribe','bounce','spam','manual'
  source text,                                            -- 'link','inbound','admin','provider'
  created_at timestamptz not null default now(),
  unique (workspace_id, type, value)
);

create index if not exists suppressions_workspace_idx on public.suppressions(workspace_id);

alter table public.suppressions enable row level security;

create policy "service role full on suppressions"
on public.suppressions
as permissive for all
to service_role
using (true)
with check (true);

create policy "users read own suppressions"
on public.suppressions
for select
to authenticated
using (workspace_id = auth.uid());

create policy "users insert own suppressions"
on public.suppressions
for insert
to authenticated
with check (workspace_id = auth.uid());

create policy "users delete own suppressions"
on public.suppressions
for delete
to authenticated
using (workspace_id = auth.uid());