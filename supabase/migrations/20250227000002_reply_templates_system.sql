-- Reply Templates System
-- Creates tables for reusable reply templates and user signatures

-- 1) Reusable reply templates
create table if not exists reply_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text,
  body_html text not null,
  visibility text not null default 'private' check (visibility in ('private','team')),
  created_at timestamptz not null default now()
);

create index if not exists idx_reply_templates_user on reply_templates(user_id, created_at desc);
create index if not exists idx_reply_templates_visibility on reply_templates(visibility);

-- 2) Optional per-user signature
create table if not exists user_signatures (
  user_id uuid primary key references auth.users(id) on delete cascade,
  html text not null,
  updated_at timestamptz not null default now()
);

-- 3) Add thread_id column to emails table if not present
alter table public.emails add column if not exists thread_id uuid;
create index if not exists idx_emails_thread on public.emails(thread_id);

-- 4) Add provider fields to emails table if missing
do $$ begin
  if not exists (select 1 from information_schema.columns 
      where table_schema='public' and table_name='emails' and column_name='provider') then
    alter table public.emails add column provider text;
  end if;
  if not exists (select 1 from information_schema.columns 
      where table_schema='public' and table_name='emails' and column_name='provider_message_id') then
    alter table public.emails add column provider_message_id text;
  end if;
  if not exists (select 1 from information_schema.columns 
      where table_schema='public' and table_name='emails' and column_name='provider_thread_id') then
    alter table public.emails add column provider_thread_id text;
  end if;
end $$;

create index if not exists idx_emails_provider_msg on public.emails(provider_message_id);
create index if not exists idx_emails_provider_thread on public.emails(provider_thread_id);

-- RLS policies
alter table reply_templates enable row level security;
alter table user_signatures enable row level security;

-- Users can manage their own templates
create policy "users_manage_own_templates" on reply_templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Users can see team templates if they're in the same organization
-- For now, keep simple: users can read all team templates
create policy "users_read_team_templates" on reply_templates
  for select using (visibility = 'team');

-- Users can manage their own signature
create policy "users_manage_own_signature" on user_signatures
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Grant permissions
grant select, insert, update, delete on reply_templates to authenticated;
grant select, insert, update, delete on user_signatures to authenticated;
grant select, insert, update, delete on reply_templates to service_role;
grant select, insert, update, delete on user_signatures to service_role;

