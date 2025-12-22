-- Enable useful extensions
create extension if not exists pg_trgm;

-- Templates
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null,
  variables text[] not null default '{}',  -- e.g., {'first_name','company'}
  tags text[] not null default '{}',       -- e.g., {'intro','saas'}
  visibility text not null default 'private' check (visibility in ('public','private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Saved Templates (user bookmarks)
create table if not exists public.saved_templates (
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid not null references public.templates(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, template_id)
);

-- updated_at trigger
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;$$;

create or replace trigger set_templates_updated_at
before update on public.templates
for each row execute function public.set_updated_at();

-- Indexes
create index if not exists templates_visibility_idx on public.templates(visibility);
create index if not exists templates_owner_idx on public.templates(owner_id);
create index if not exists templates_tags_gin_idx on public.templates using gin (tags);
create index if not exists templates_title_trgm_idx on public.templates using gin (lower(title) gin_trgm_ops);

-- RLS
alter table public.templates enable row level security;
alter table public.saved_templates enable row level security;

-- Policies: templates
create policy if not exists "templates_read_public_or_own" on public.templates
for select using (
  visibility = 'public' or owner_id = auth.uid()
);

create policy if not exists "templates_insert_own" on public.templates
for insert with check (
  owner_id = auth.uid()
);

create policy if not exists "templates_update_own" on public.templates
for update using (
  owner_id = auth.uid()
) with check (
  owner_id = auth.uid()
);

create policy if not exists "templates_delete_own" on public.templates
for delete using (
  owner_id = auth.uid()
);

-- Policies: saved_templates
create policy if not exists "saved_templates_select_own" on public.saved_templates
for select using (user_id = auth.uid());

create policy if not exists "saved_templates_insert_own" on public.saved_templates
for insert with check (user_id = auth.uid());

create policy if not exists "saved_templates_delete_own" on public.saved_templates
for delete using (user_id = auth.uid()); 