create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null default 'default',
  created_at timestamptz not null default now()
);

create index if not exists idx_usage_user_kind_time
on public.usage_events (user_id, kind, created_at desc);

alter table public.usage_events enable row level security;

create policy if not exists "usage_select_own"
on public.usage_events
for select
to authenticated
using (user_id = auth.uid());

create policy if not exists "usage_insert_own"
on public.usage_events
for insert
to authenticated
with check (user_id = auth.uid());
