-- 1) leads (ensure minimal fields exist)
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  email text not null,
  status text not null default 'new',
  replied_at timestamptz,
  created_at timestamptz not null default now()
);

-- helpful when you already had leads: add missing cols safely
do $$ begin
  if not exists (select 1 from information_schema.columns 
      where table_schema='public' and table_name='leads' and column_name='replied_at') then
    alter table public.leads add column replied_at timestamptz;
  end if;
end $$;

create unique index if not exists leads_user_email_uq on public.leads (user_id, lower(email));
create index if not exists leads_status_idx on public.leads (status);

-- Lowercase email on insert/update
create or replace function public.normalize_email()
returns trigger language plpgsql as $$
begin
  if new.email is not null then new.email := lower(new.email); end if;
  return new;
end $$;

drop trigger if exists trg_leads_normalize_email on public.leads;
create trigger trg_leads_normalize_email
before insert or update on public.leads
for each row execute function public.normalize_email();

-- 2) email_accounts: connected inboxes (Gmail today, Outlook later)
create table if not exists public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null check (provider in ('gmail','outlook')),
  email_address text not null,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists email_accounts_user_provider_email_uq
  on public.email_accounts (user_id, provider, lower(email_address));

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_email_accounts_updated on public.email_accounts;
create trigger trg_email_accounts_updated
before update on public.email_accounts
for each row execute function public.set_updated_at();

drop trigger if exists trg_email_accounts_normalize_email on public.email_accounts;
create trigger trg_email_accounts_normalize_email
before insert or update on public.email_accounts
for each row execute function public.normalize_email();

-- 3) logs: lightweight app/event log
create table if not exists public.logs (
  id bigserial primary key,
  level text not null check (level in ('debug','info','warn','error')),
  source text not null,           -- e.g., 'gmail-webhook', 'ai-reply-detection'
  message text not null,
  meta jsonb,
  user_id uuid,                   -- optional, when applicable
  created_at timestamptz not null default now()
);

create index if not exists logs_level_idx on public.logs (level);
create index if not exists logs_source_idx on public.logs (source);
create index if not exists logs_user_idx on public.logs (user_id);

-- 4) RLS (Row Level Security)
alter table public.leads enable row level security;
alter table public.email_accounts enable row level security;
alter table public.logs enable row level security;

-- Assuming auth.uid() is available via Supabase Auth JWT

-- Leads: owners can read/write their own leads
drop policy if exists leads_rw_own on public.leads;
create policy leads_rw_own on public.leads
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Email accounts: owners can read/write their own account
drop policy if exists email_accounts_rw_own on public.email_accounts;
create policy email_accounts_rw_own on public.email_accounts
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Logs: owners can read their logs; inserts allowed from backend via service key
drop policy if exists logs_owner_read on public.logs;
create policy logs_owner_read on public.logs
  for select using (user_id = auth.uid());

-- 5) Helper RPC to upsert a Gmail account (called from OAuth callback)
create or replace function public.upsert_gmail_account(
  p_user_id uuid,
  p_email text,
  p_access_token text,
  p_refresh_token text,
  p_expires_in_seconds int
) returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into public.email_accounts (user_id, provider, email_address, access_token, refresh_token, token_expires_at)
  values (p_user_id, 'gmail', lower(p_email), p_access_token, p_refresh_token,
          now() + make_interval(secs => coalesce(p_expires_in_seconds, 3600)))
  on conflict (user_id, provider, lower(email_address))
  do update set
    access_token = excluded.access_token,
    refresh_token = coalesce(excluded.refresh_token, public.email_accounts.refresh_token),
    token_expires_at = excluded.token_expires_at,
    updated_at = now()
  returning id into v_id;

  return v_id;
end $$;

grant execute on function public.upsert_gmail_account(uuid, text, text, text, int) to authenticated;

-- 6) Safeguards: service role needs broad access; authenticated limited by RLS
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.leads to authenticated;
grant select, insert, update, delete on public.email_accounts to authenticated;
grant select on public.logs to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;

-- 7) Optional: status enum hardening for leads
do $$ begin
  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type lead_status as enum ('new','queued','sent','bounced','replied','opted_out');
  end if;
end $$;

do $$ begin
  if exists (select 1 from information_schema.columns 
             where table_schema='public' and table_name='leads' and column_name='status'
             and data_type <> 'USER-DEFINED') then
    alter table public.leads
      alter column status type lead_status using status::lead_status;
  end if;
end $$;

create index if not exists leads_status_enum_idx on public.leads (status);
