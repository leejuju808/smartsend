-- Per-row rejects for exports
create table if not exists public.import_rejects (
  id bigserial primary key,
  import_id uuid not null references public.imports(id) on delete cascade,
  email citext,
  reason text,
  created_at timestamptz default now()
);

-- RLS for rejects (owner via parent import)
alter table public.import_rejects enable row level security;

create policy "import_rejects: owner can read"
on public.import_rejects for select
using (exists (
  select 1 from public.imports i
  where i.id = import_id and i.user_id = auth.uid()
));

create policy "import_rejects: owner can write"
on public.import_rejects for insert
with check (exists (
  select 1 from public.imports i
  where i.id = import_id and i.user_id = auth.uid()
));

create policy "import_rejects: owner can delete"
on public.import_rejects for delete
using (exists (
  select 1 from public.imports i
  where i.id = import_id and i.user_id = auth.uid()
));

-- Helpful index
create index if not exists import_rejects_import_id_idx
  on public.import_rejects (import_id); 