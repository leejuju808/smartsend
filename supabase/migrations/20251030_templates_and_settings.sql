create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text not null,
  body_html text not null,
  is_shared boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists email_templates_user_idx on public.email_templates (user_id);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  signature_html text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.email_templates enable row level security;

create policy if not exists "templates owner read" on public.email_templates for select using (
  auth.uid() = user_id or is_shared = true
);

create policy if not exists "templates owner write" on public.email_templates for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.user_settings enable row level security;

create policy if not exists "settings owner" on public.user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);


