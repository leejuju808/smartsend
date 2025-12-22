-- Create user_mail_settings table for default provider preferences
create table if not exists public.user_mail_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  default_provider text check (default_provider in ('gmail', 'outlook')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id)
);

-- Add indexes
create index if not exists idx_user_mail_settings_user on public.user_mail_settings(user_id);

-- Enable RLS
alter table public.user_mail_settings enable row level security;

-- RLS Policies: Users can only manage their own settings
create policy "users can read their own mail settings"
  on public.user_mail_settings for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users can insert their own mail settings"
  on public.user_mail_settings for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users can update their own mail settings"
  on public.user_mail_settings for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Add user_id and expires_at to provider_accounts if they don't exist
alter table if exists public.provider_accounts
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists expires_at timestamptz;

-- Create index on user_id for provider_accounts
create index if not exists idx_provider_accounts_user on public.provider_accounts(user_id);

-- Update RLS for provider_accounts to support user_id-based access
do $$ begin
  if not exists (select 1 from pg_policy where polname = 'pa: user read' and polrelid = 'public.provider_accounts'::regclass) then
    create policy "pa: user read" on public.provider_accounts for select
      to authenticated
      using (auth.uid() = user_id);
    
    create policy "pa: user write" on public.provider_accounts for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- Trigger to update updated_at timestamp
create or replace function public.update_user_mail_settings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_user_mail_settings_updated_at on public.user_mail_settings;
create trigger trg_user_mail_settings_updated_at
before update on public.user_mail_settings
for each row execute function public.update_user_mail_settings_updated_at();











