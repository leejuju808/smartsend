-- Block 193.1 — email_accounts table enhancements for onboarding
-- Adds user_id, status, daily_cap_override, last_synced_at columns
-- Updates RLS policies to match onboarding requirements

-- Add missing columns to email_accounts
alter table public.email_accounts
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists email text,
  add column if not exists status text default 'connected' check (status in ('connected', 'error', 'revoked')),
  add column if not exists daily_cap_override integer,
  add column if not exists last_synced_at timestamptz;

-- Migrate account_email to email if email is null
update public.email_accounts
set email = account_email
where email is null and account_email is not null;

-- Create index on user_id
create index if not exists email_accounts_user_id_idx
on public.email_accounts (user_id);

-- Create unique index on workspace_id + email (as specified)
-- Note: This works alongside the existing unique index on workspace_id + account_email
-- We'll use email for the new onboarding flow, but account_email is still supported
create unique index if not exists email_accounts_unique_email_per_workspace
on public.email_accounts (workspace_id, lower(email))
where email is not null;

-- Update RLS policies to match Block 193 spec
-- Drop existing policy
drop policy if exists email_accounts_rw on public.email_accounts;

-- New RLS policies matching the spec
create policy "email_accounts_select"
on public.email_accounts
for select
to authenticated
using (
  workspace_id in (
    select workspace_id from public.workspace_members
    where user_id = auth.uid()
  )
);

create policy "email_accounts_insert"
on public.email_accounts
for insert
to authenticated
with check (
  workspace_id in (
    select workspace_id from public.workspace_members
    where user_id = auth.uid()
  )
);

create policy "email_accounts_update"
on public.email_accounts
for update
to authenticated
using (
  workspace_id in (
    select workspace_id from public.workspace_members
    where user_id = auth.uid()
  )
)
with check (
  workspace_id in (
    select workspace_id from public.workspace_members
    where user_id = auth.uid()
  )
);

create policy "email_accounts_delete"
on public.email_accounts
for delete
to authenticated
using (
  workspace_id in (
    select workspace_id from public.workspace_members
    where user_id = auth.uid()
  )
);

