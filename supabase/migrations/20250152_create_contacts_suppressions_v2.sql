-- SmartSendAI — Contacts + Suppressions v2 (SQL + RLS)
-- Main goal: $1M ARR. This enables CSV import + dedupe + suppression safety.
-- Assumptions:
-- - profiles.id = auth.uid() (UUID) for each authenticated user
-- - Supabase Postgres 15, RLS enabled

-- 0) Safety: required extensions
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- 1) Normalization helper to clean emails (lowercase + trim)
create or replace function public.normalize_email(in_email text)
returns text
language sql
immutable
as $$
  select case
    when in_email is null then null
    else lower(trim(in_email))
  end
$$;

-- 2) Create new contacts_v2 table with improved structure
create table if not exists public.contacts_v2 (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  company text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint contacts_v2_email_not_blank check (length(trim(coalesce(email,''))) > 0)
);

-- Uniqueness: one email per profile (normalized)
create unique index if not exists contacts_v2_profile_email_unique
  on public.contacts_v2 (profile_id, (public.normalize_email(email)));

-- Fast lookups by email for dedupe checks
create index if not exists contacts_v2_email_idx
  on public.contacts_v2 ((public.normalize_email(email)));

-- 3) Create new suppressions_v2 table
create table if not exists public.suppressions_v2 (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  reason text,                         -- optional: "bounced", "unsubscribed", "complaint", etc.
  source text,                         -- optional: "import", "manual", "system"
  created_at timestamptz not null default now(),
  constraint suppressions_v2_email_not_blank check (length(trim(coalesce(email,''))) > 0)
);

-- Uniqueness: one suppressed email per profile (normalized)
create unique index if not exists suppressions_v2_profile_email_unique
  on public.suppressions_v2 (profile_id, (public.normalize_email(email)));

-- Fast lookups by email for suppression checks
create index if not exists suppressions_v2_email_idx
  on public.suppressions_v2 ((public.normalize_email(email)));

-- 4) Write-time normalization triggers (lowercase/trim email)
create or replace function public.tg_normalize_email()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('INSERT','UPDATE') then
    if new.email is not null then
      new.email := public.normalize_email(new.email);
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_contacts_v2_normalize on public.contacts_v2;
create trigger trg_contacts_v2_normalize
before insert or update on public.contacts_v2
for each row execute function public.tg_normalize_email();

drop trigger if exists trg_suppressions_v2_normalize on public.suppressions_v2;
create trigger trg_suppressions_v2_normalize
before insert or update on public.suppressions_v2
for each row execute function public.tg_normalize_email();

-- 5) Enable Row Level Security
alter table public.contacts_v2 enable row level security;
alter table public.suppressions_v2 enable row level security;

-- 6) RLS policies — strict ownership by profile_id = auth.uid()
-- Read your own
drop policy if exists "contacts_v2_select_own" on public.contacts_v2;
create policy "contacts_v2_select_own"
on public.contacts_v2
for select
using (profile_id = auth.uid());

drop policy if exists "suppressions_v2_select_own" on public.suppressions_v2;
create policy "suppressions_v2_select_own"
on public.suppressions_v2
for select
using (profile_id = auth.uid());

-- Insert your own
drop policy if exists "contacts_v2_insert_own" on public.contacts_v2;
create policy "contacts_v2_insert_own"
on public.contacts_v2
for insert
with check (profile_id = auth.uid());

drop policy if exists "suppressions_v2_insert_own" on public.suppressions_v2;
create policy "suppressions_v2_insert_own"
on public.suppressions_v2
for insert
with check (profile_id = auth.uid());

-- Update your own
drop policy if exists "contacts_v2_update_own" on public.contacts_v2;
create policy "contacts_v2_update_own"
on public.contacts_v2
for update
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

drop policy if exists "suppressions_v2_update_own" on public.suppressions_v2;
create policy "suppressions_v2_update_own"
on public.suppressions_v2
for update
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

-- Delete your own
drop policy if exists "contacts_v2_delete_own" on public.contacts_v2;
create policy "contacts_v2_delete_own"
on public.contacts_v2
for delete
using (profile_id = auth.uid());

drop policy if exists "suppressions_v2_delete_own" on public.suppressions_v2;
create policy "suppressions_v2_delete_own"
on public.suppressions_v2
for delete
using (profile_id = auth.uid());

-- 7) Helpful RPC for bulk insert that automatically normalizes email
create or replace function public.bulk_insert_contacts_v2(
  in_profile_id uuid,
  in_emails text[],
  in_first_names text[] default null,
  in_last_names text[] default null,
  in_companies text[] default null
)
returns table (inserted_count int)
language plpgsql
security invoker
as $$
declare
  i int;
  v_inserted int := 0;
  v_email text;
  v_first text;
  v_last text;
  v_company text;
begin
  if in_emails is null or array_length(in_emails,1) is null then
    return query select 0::int;
    return;
  end if;

  for i in 1..array_length(in_emails,1) loop
    v_email := public.normalize_email(in_emails[i]);
    v_first := case when in_first_names is null then null else in_first_names[i] end;
    v_last  := case when in_last_names  is null then null else in_last_names[i]  end;
    v_company := case when in_companies is null then null else in_companies[i] end;

    begin
      insert into public.contacts_v2 (profile_id, email, first_name, last_name, company)
      values (in_profile_id, v_email, v_first, v_last, v_company)
      on conflict (profile_id, (public.normalize_email(email))) do nothing;

      if found then
        v_inserted := v_inserted + 1;
      end if;
    exception when unique_violation then
      -- ignore duplicates
      null;
    end;
  end loop;

  return query select v_inserted;
end;
$$;

-- 8) Grant execute on function to authenticated role
grant execute on function public.bulk_insert_contacts_v2(uuid, text[], text[], text[], text[]) to authenticated;

-- 9) Data migration from existing tables (if they exist)
-- Migrate contacts from old system to new system
insert into public.contacts_v2 (profile_id, email, first_name, last_name, company, created_at)
select 
  c.user_id as profile_id,
  c.email,
  c.first_name,
  c.last_name,
  c.company,
  c.created_at
from public.contacts c
where not exists (
  select 1 from public.contacts_v2 cv2 
  where cv2.profile_id = c.user_id 
  and public.normalize_email(cv2.email) = public.normalize_email(c.email)
)
on conflict (profile_id, (public.normalize_email(email))) do nothing;

-- Migrate suppressions from old system to new system
insert into public.suppressions_v2 (profile_id, email, reason, source, created_at)
select 
  sl.user_id as profile_id,
  sl.email,
  sl.reason,
  'migrated' as source,
  sl.created_at
from public.suppression_list sl
where not exists (
  select 1 from public.suppressions_v2 sv2 
  where sv2.profile_id = sl.user_id 
  and public.normalize_email(sv2.email) = public.normalize_email(sl.email)
)
on conflict (profile_id, (public.normalize_email(email))) do nothing;

-- 10) COMMENTs for schema introspection
comment on table public.contacts_v2 is 'Per-user address book for outreach. RLS = owner-only.';
comment on table public.suppressions_v2 is 'Per-user suppression list. RLS = owner-only.';
comment on function public.normalize_email(text) is 'Lowercases + trims email for consistent unique constraints.';
comment on function public.bulk_insert_contacts_v2(uuid, text[], text[], text[], text[]) is 'RLS-safe helper to bulk insert contacts with dedupe.'; 