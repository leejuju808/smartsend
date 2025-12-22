create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists templates_user_idx on public.templates(user_id, created_at desc);

-- RLS
alter table public.templates enable row level security;

create policy "owner can read" on public.templates
  for select using (auth.uid() = user_id);

create policy "owner can insert" on public.templates
  for insert with check (auth.uid() = user_id);

create policy "owner can update" on public.templates
  for update using (auth.uid() = user_id);

create policy "owner can delete" on public.templates
  for delete using (auth.uid() = user_id);

