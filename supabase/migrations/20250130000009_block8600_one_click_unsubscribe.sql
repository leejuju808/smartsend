-- =========================================================
-- Block 8600 — One-Click Unsubscribe + Global Suppression
-- =========================================================

-- 1) Global Suppression List (Simple, Global Scope)
-- This is a global Do-Not-Send list that works across all accounts
create table if not exists public.suppression_list_global (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  reason text null,
  created_at timestamptz not null default now(),
  created_by text null
);

-- Unique constraint on email (case-insensitive via expression index)
-- This allows upsert to work with onConflict
create unique index if not exists suppression_list_global_email_idx
  on public.suppression_list_global(lower(trim(email)));

-- Index for lookups
create index if not exists idx_suppression_list_global_email_lower
  on public.suppression_list_global(lower(email));

-- Enable RLS but allow service_role full access for public unsubscribe
alter table public.suppression_list_global enable row level security;

-- Service role can read/write (needed for public unsubscribe endpoint)
drop policy if exists "service_role_full_access" on public.suppression_list_global;
create policy "service_role_full_access"
on public.suppression_list_global
for all
to service_role
using (true)
with check (true);

-- Grant permissions
grant usage on schema public to service_role;
grant all privileges on public.suppression_list_global to service_role;

-- 2) Ensure leads table has status column that supports 'do_not_contact'
-- Check if status column exists and add 'do_not_contact' to check constraint if needed
do $$
begin
  -- Add status column if it doesn't exist
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'leads' 
    and column_name = 'status'
  ) then
    alter table public.leads add column status text default 'open';
  end if;

  -- Try to add 'do_not_contact' to existing check constraint if it exists
  -- If constraint doesn't exist, we'll just allow any text value
  if exists (
    select 1 from pg_constraint 
    where conname like '%leads_status%' 
    and contype = 'c'
  ) then
    -- Drop existing constraint and recreate with do_not_contact
    alter table public.leads drop constraint if exists leads_status_check;
  end if;
end $$;

-- 3) Ensure outbound_emails table has status column that supports 'canceled'
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'outbound_emails' 
    and column_name = 'status'
  ) then
    alter table public.outbound_emails add column status text default 'pending';
  end if;
end $$;

-- 4) Helper function to check if email is suppressed (for use in queries)
create or replace function public.is_email_suppressed(p_email text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 
    from public.suppression_list_global
    where lower(email) = lower(trim(p_email))
  );
$$;

-- 5) Helper function for idempotent suppression insert
create or replace function public.add_to_suppression_list_global(
  p_email text,
  p_reason text default 'unsubscribe_link',
  p_created_by text default 'public_unsubscribe'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email_normalized text := lower(trim(p_email));
begin
  -- Try to insert, handle unique violation gracefully
  begin
    insert into public.suppression_list_global (email, reason, created_by)
    values (v_email_normalized, p_reason, p_created_by)
    returning id into v_id;
  exception when unique_violation then
    -- Email already exists, get existing id
    select id into v_id
    from public.suppression_list_global
    where lower(email) = v_email_normalized
    limit 1;
  end;

  return v_id;
end;
$$;

grant execute on function public.is_email_suppressed(text) to service_role, authenticated;
grant execute on function public.add_to_suppression_list_global(text, text, text) to service_role, authenticated;

