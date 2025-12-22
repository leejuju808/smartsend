-- Create mail_accounts table for storing provider credentials and quotas
create table if not exists public.mail_accounts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook')),
  email citext not null,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  label text,
  quota_daily int not null default 500,
  quota_used int not null default 0,
  last_reset timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','paused','revoked')),
  unique(account_id, email)
);

-- Ensure required columns exist when upgrading from earlier schemas
alter table public.mail_accounts
  add column if not exists account_id uuid references public.accounts(id) on delete cascade,
  add column if not exists email citext,
  add column if not exists label text,
  add column if not exists quota_daily int not null default 500,
  add column if not exists quota_used int not null default 0,
  add column if not exists last_reset timestamptz not null default now(),
  add column if not exists status text not null default 'active';

alter table public.mail_accounts
  alter column quota_daily set default 500,
  alter column quota_used set default 0,
  alter column last_reset set default now(),
  alter column status set default 'active';

alter table public.mail_accounts
  add constraint if not exists mail_accounts_status_check
  check (status in ('active','paused','revoked'));

alter table public.mail_accounts
  add constraint if not exists mail_accounts_provider_check
  check (provider in ('gmail','outlook'));

alter table public.mail_accounts
  add constraint if not exists mail_accounts_account_email_key
  unique (account_id, email);

create index if not exists idx_mail_accounts_account on public.mail_accounts(account_id);

-- Reset quotas daily if the last reset was before today
create or replace function public.reset_mail_quotas()
returns void
language sql
security definer
set search_path = public
as $$
  update public.mail_accounts
     set quota_used = 0,
         last_reset = now()
   where now()::date > last_reset::date;
$$;

select cron.schedule(
  'reset-mail-quotas',
  '0 0 * * *',
  $$select public.reset_mail_quotas();$$
);

