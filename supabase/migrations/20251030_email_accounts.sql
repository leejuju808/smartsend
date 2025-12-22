-- email_accounts storage with RLS and encrypted refresh tokens

-- Enable pgcrypto for PGP encryption (idempotent)
create extension if not exists pgcrypto;

create table if not exists public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook')),
  account_email text not null,
  display_name text,
  access_token text,
  refresh_token bytea,
  expires_at timestamptz,
  scope text,
  provider_account_id text,
  daily_limit int not null default 450,
  per_minute_limit int not null default 20,
  last_sent_at timestamptz,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists email_accounts_ws_email
  on public.email_accounts (workspace_id, lower(account_email));

alter table public.email_accounts enable row level security;

-- RLS: only allow access within the requestor's workspace
drop policy if exists email_accounts_rw on public.email_accounts;
create policy email_accounts_rw
on public.email_accounts
for all
using (
  workspace_id = auth.uid()::uuid
  OR workspace_id in (
    select workspace_id from public.profiles where id = auth.uid()
  )
)
with check (
  workspace_id = auth.uid()::uuid
  OR workspace_id in (
    select workspace_id from public.profiles where id = auth.uid()
  )
);

-- Helper functions to encrypt/decrypt refresh tokens
create or replace function public.set_refresh_token(_id uuid, _plain text, _key text)
returns void language sql security definer as $$
  update public.email_accounts
     set refresh_token = pgp_sym_encrypt(_plain, _key), updated_at = now()
   where id = _id;
$$;

create or replace function public.get_refresh_token(_id uuid, _key text)
returns text language sql security definer as $$
  select convert_from(pgp_sym_decrypt(refresh_token, _key), 'utf8')
  from public.email_accounts
  where id = _id;
$$;

-- Lock down and grant explicit execute
revoke all on function public.set_refresh_token(uuid,text,text) from public;
revoke all on function public.get_refresh_token(uuid,text) from public;

grant execute on function public.set_refresh_token(uuid,text,text) to authenticated;
grant execute on function public.get_refresh_token(uuid,text) to authenticated;
grant execute on function public.set_refresh_token(uuid,text,text) to service_role;
grant execute on function public.get_refresh_token(uuid,text) to service_role;


