-- Outlook accounts table for OAuth integration
create table if not exists outlook_accounts (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references orgs(id) on delete cascade,
  ms_user_id text not null,           -- oid or userPrincipalName
  email text not null,
  access_token text not null,
  refresh_token text not null,
  token_expiry timestamptz not null,
  delta_token text,                   -- for /messages/delta checkpoint
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Unique constraint: one outlook account per org
create unique index if not exists uq_outlook_accounts_org on outlook_accounts(org_id);

-- Index for email lookups
create index if not exists idx_outlook_accounts_email on outlook_accounts(email);

-- Enable RLS
alter table outlook_accounts enable row level security;

-- RLS policy: org members can view their org's outlook account
create policy "org_members_view_outlook_accounts" on outlook_accounts
  for select
  using (
    exists (
      select 1 from org_members
      where org_members.org_id = outlook_accounts.org_id
      and org_members.user_id = auth.uid()
    )
  );

-- Service role can manage all outlook accounts
create policy "service_role_manages_outlook_accounts" on outlook_accounts
  for all to service_role
  using (true) with check (true);

-- RPC function to get primary org for user
create or replace function get_primary_org_for_user()
returns table (org_id uuid)
language plpgsql
security definer
as $$
begin
  return query
  select om.org_id
  from org_members om
  where om.user_id = auth.uid()
  order by om.created_at asc
  limit 1;
end;
$$;

