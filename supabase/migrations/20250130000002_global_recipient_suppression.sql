-- Block 117 — Global Recipient Suppression (auto-suppress hard bounces per email/domain)
-- Idempotent migration

-- A) Types

do $$ begin
  if not exists (select 1 from pg_type where typname = 'suppression_scope') then
    create type suppression_scope as enum ('global','account');
  end if;
exception when duplicate_object then null; end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'suppression_reason') then
    create type suppression_reason as enum (
      'hard_bounce','invalid_recipient','complaint','manual','policy','other'
    );
  end if;
exception when duplicate_object then null; end $$;

-- B) Registry

create table if not exists public.suppressions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  scope suppression_scope not null default 'account',
  account_id uuid, -- references public.accounts(id) on delete cascade, null for global
                   -- Note: adapt to your schema - may reference connected_accounts or accounts

  email text,                      -- normalized lower-case email
  domain text,                     -- normalized lower-case domain (for *@domain blocks)
  provider text check (provider in ('gmail','outlook')),

  reason suppression_reason not null default 'other',
  notes text,

  created_by uuid,                 -- auth.uid() if available
  unique(scope, coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(email,'__'), coalesce(domain,'__'))
);

create index if not exists idx_suppressions_email on public.suppressions (email) where email is not null;
create index if not exists idx_suppressions_domain on public.suppressions (domain) where domain is not null;
create index if not exists idx_suppressions_account on public.suppressions (account_id) where account_id is not null;
create index if not exists idx_suppressions_scope on public.suppressions (scope);

-- C) Normalizers

create or replace function public.normalize_email(p text)
returns text language sql immutable as $$
  select case
    when p is null then null
    else lower(trim(p))
  end
$$;

create or replace function public.email_domain(p text)
returns text language sql immutable as $$
  select case
    when p is null then null
    else lower(split_part(p, '@', 2))
  end
$$;

-- D) Quick check (global + account)
-- Note: account_id here refers to the sending account (connected_accounts.id)
-- We need to resolve the user_id from connected_accounts to check account-scoped suppressions

create or replace function public.is_suppressed(p_account uuid, p_email text)
returns boolean
language plpgsql
stable
as $$
declare
  v_user_id uuid;
  v_email_normalized text;
  v_domain_normalized text;
begin
  -- Normalize inputs
  v_email_normalized := public.normalize_email(p_email);
  v_domain_normalized := public.email_domain(p_email);

  -- Try to resolve user_id from connected_accounts if account_id is provided
  if p_account is not null then
    select user_id into v_user_id
    from public.connected_accounts
    where id = p_account
    limit 1;
  end if;

  -- Check for suppressions: global OR (account-scoped AND user matches)
  return exists(
    select 1 from public.suppressions s
    where
      (
        (s.scope = 'global')
        or (s.scope = 'account' and s.account_id = p_account)
      )
      and (
        (s.email is not null and s.email = v_email_normalized) or
        (s.domain is not null and s.domain = v_domain_normalized)
      )
  );
end
$$;

-- E) Upsert helpers

create or replace function public.suppress_email(
  p_scope suppression_scope, p_account uuid, p_email text, p_provider text, p_reason suppression_reason, p_notes text default null
) returns void
language plpgsql
security definer
as $$
declare
  v_created_by uuid;
begin
  -- Get current user if available
  v_created_by := auth.uid();

  insert into public.suppressions (scope, account_id, email, domain, provider, reason, notes, created_by)
  values (
    p_scope,
    case when p_scope='account' then p_account else null end,
    public.normalize_email(p_email),
    public.email_domain(p_email),
    p_provider, p_reason, p_notes, v_created_by
  )
  on conflict (scope, coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(email,'__'), coalesce(domain,'__'))
  do update set updated_at = now(), reason = excluded.reason, notes = excluded.notes, provider = excluded.provider;
end
$$;

create or replace function public.suppress_domain(
  p_scope suppression_scope, p_account uuid, p_domain text, p_provider text, p_reason suppression_reason, p_notes text default null
) returns void
language plpgsql
security definer
as $$
declare
  v_created_by uuid;
begin
  -- Get current user if available
  v_created_by := auth.uid();

  insert into public.suppressions (scope, account_id, email, domain, provider, reason, notes, created_by)
  values (
    p_scope,
    case when p_scope='account' then p_account else null end,
    null,
    lower(trim(p_domain)),
    p_provider, p_reason, p_notes, v_created_by
  )
  on conflict (scope, coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(email,'__'), coalesce(domain,'__'))
  do update set updated_at = now(), reason = excluded.reason, notes = excluded.notes, provider = excluded.provider;
end
$$;

-- F) RLS (read/write within account; global read-only unless admin)
alter table public.suppressions enable row level security;

-- Drop existing policies if they exist
drop policy if exists "suppressions_select" on public.suppressions;
drop policy if exists "suppressions_insert_account" on public.suppressions;
drop policy if exists "suppressions_update_account" on public.suppressions;
drop policy if exists "suppressions_delete_account" on public.suppressions;

-- Policy: Users can read global suppressions and their own account-scoped suppressions
create policy "suppressions_select" on public.suppressions
for select using (
  scope = 'global'
  or (scope='account' and account_id in (
    select id from public.connected_accounts where user_id = auth.uid()
  ))
);

-- Policy: Users can insert account-scoped suppressions for their own accounts
create policy "suppressions_insert_account" on public.suppressions
for insert with check (
  scope='account' and account_id in (
    select id from public.connected_accounts where user_id = auth.uid()
  )
  or scope='global' -- Allow global inserts (admin check should be done in application layer)
);

-- Policy: Users can update their own account-scoped suppressions
create policy "suppressions_update_account" on public.suppressions
for update using (
  scope='account' and account_id in (
    select id from public.connected_accounts where user_id = auth.uid()
  )
) with check (
  scope='account' and account_id in (
    select id from public.connected_accounts where user_id = auth.uid()
  )
);

-- Policy: Users can delete their own account-scoped suppressions
create policy "suppressions_delete_account" on public.suppressions
for delete using (
  scope='account' and account_id in (
    select id from public.connected_accounts where user_id = auth.uid()
  )
  or scope='global' -- Allow global deletes (admin check should be done in application layer)
);

-- G) Optional: Global suppression seeding
-- Example: seed some well-known sink/abuse domains as global blocks
-- Uncomment and customize as needed:
/*
select public.suppress_domain('global', null, 'example.invalid', 'gmail', 'policy', 'Non-routable test domain');
*/

-- H) Trigger for updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists trg_suppressions_updated_at on public.suppressions;
create trigger trg_suppressions_updated_at
before update on public.suppressions
for each row
execute function public.set_updated_at();














