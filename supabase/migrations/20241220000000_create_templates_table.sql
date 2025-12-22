-- Create templates table
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  subject text not null,
  body text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table public.templates enable row level security;

-- Create RLS policies
do $$ begin
  create policy "owner read templates" on public.templates
  for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "owner write templates" on public.templates
  for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "owner update templates" on public.templates
  for update using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "owner delete templates" on public.templates
  for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;