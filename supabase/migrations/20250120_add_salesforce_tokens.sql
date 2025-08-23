-- Create Salesforce tokens table for OAuth credentials
create table if not exists public.salesforce_tokens (
  team_id uuid primary key,
  instance_url text not null,
  access_token text not null,
  refresh_token text not null,
  org_id text,
  user_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create index for team lookups
create index if not exists idx_sf_tokens_team on public.salesforce_tokens(team_id);

-- Enable RLS
alter table public.salesforce_tokens enable row level security;

-- Create policies
create policy "Team members can view own team's Salesforce tokens"
  on public.salesforce_tokens for select
  using (team_id in (
    select team_id from public.team_members where user_id = auth.uid()
  ));

create policy "Team owners can manage own team's Salesforce tokens"
  on public.salesforce_tokens for all
  using (team_id in (
    select id from public.teams where owner_id = auth.uid()
  )); 