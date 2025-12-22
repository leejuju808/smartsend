-- Provider OAuth integration: accounts, tokens, error normalization, and helper function

-- Ensure touch trigger helper exists (shared across tables)
create or replace function public.tg_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- A) Provider-connected accounts (Gmail / Outlook)
create table if not exists public.provider_accounts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook')),
  email text not null,
  display_name text,
  tenant_id text,
  provider_user_id text,
  status text not null default 'active' check (status in ('active','revoked','error')),
  unique (account_id, provider, email)
);

drop trigger if exists trg_provider_accounts_touch on public.provider_accounts;
create trigger trg_provider_accounts_touch
  before update on public.provider_accounts
  for each row execute function public.tg_touch_updated_at();

-- B) Provider OAuth tokens (one row per provider account)
create table if not exists public.provider_tokens (
  provider_account_id uuid primary key references public.provider_accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text,
  token_type text
);

drop trigger if exists trg_provider_tokens_touch on public.provider_tokens;
create trigger trg_provider_tokens_touch
  before update on public.provider_tokens
  for each row execute function public.tg_touch_updated_at();

-- C) Link send identities to provider accounts
alter table public.send_identities
  add column if not exists provider_account_id uuid references public.provider_accounts(id) on delete set null;

-- D) Provider error normalization map
create table if not exists public.provider_error_map (
  provider text not null,
  code text not null,
  normalized text not null check (normalized in ('rate_limited','auth','invalid_recipient','policy_block','quota','unknown')),
  retryable boolean not null default false,
  primary key (provider, code)
);

insert into public.provider_error_map(provider, code, normalized, retryable) values
('gmail','rateLimitExceeded','rate_limited',true),
('gmail','userRateLimitExceeded','rate_limited',true),
('gmail','invalidArgument','invalid_recipient',false),
('gmail','forbidden','auth',false),
('gmail','unauthorized_client','auth',false),
('gmail','dailyLimitExceeded','quota',true),
('outlook','ErrorRecipientNotFound','invalid_recipient',false),
('outlook','ErrorMailboxStoreUnavailable','rate_limited',true),
('outlook','Authorization_RequestDenied','auth',false),
('outlook','ErrorQuotaExceeded','quota',true)
on conflict do nothing;

-- E) Row level security
alter table public.provider_accounts enable row level security;
alter table public.provider_tokens enable row level security;
alter table public.provider_error_map enable row level security;

do $$
begin
  create policy if not exists prov_accts_rw on public.provider_accounts
    for all using (account_id = auth.uid()) with check (account_id = auth.uid());
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy if not exists prov_tokens_rw on public.provider_tokens
    for all using (
      exists (
        select 1
        from public.provider_accounts a
        where a.id = provider_account_id
          and a.account_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.provider_accounts a
        where a.id = provider_account_id
          and a.account_id = auth.uid()
      )
    );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create policy if not exists prov_error_map_ro on public.provider_error_map
    for select using (true);
exception
  when duplicate_object then null;
end $$;

-- F) Helper to normalize provider errors
create or replace function public.normalize_provider_error(p_provider text, p_code text)
returns table(normalized text, retryable boolean)
language sql
stable
as $$
  select m.normalized, m.retryable
  from public.provider_error_map m
  where m.provider = p_provider
    and m.code = p_code
  union all
  select 'unknown', true
  where not exists (
    select 1
    from public.provider_error_map m2
    where m2.provider = p_provider
      and m2.code = p_code
  )
  limit 1;
$$;

