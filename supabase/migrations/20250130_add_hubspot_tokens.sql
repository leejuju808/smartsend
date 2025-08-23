-- Create hubspot_tokens table for storing OAuth tokens per team
create table if not exists public.hubspot_tokens (
  team_id uuid primary key,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  portal_id bigint,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create index for team lookups
create index if not exists idx_hs_tokens_team on public.hubspot_tokens(team_id);

-- Add RLS policies
alter table public.hubspot_tokens enable row level security;

-- Only team members can access their own tokens
create policy "Users can view their team's hubspot tokens" on public.hubspot_tokens
  for select using (
    team_id in (
      select team_id from public.profiles where id = auth.uid()
    )
  );

create policy "Users can insert their team's hubspot tokens" on public.hubspot_tokens
  for insert with check (
    team_id in (
      select team_id from public.profiles where id = auth.uid()
    )
  );

create policy "Users can update their team's hubspot tokens" on public.hubspot_tokens
  for update using (
    team_id in (
      select team_id from public.profiles where id = auth.uid()
    )
  );

create policy "Users can delete their team's hubspot tokens" on public.hubspot_tokens
  for delete using (
    team_id in (
      select team_id from public.profiles where id = auth.uid()
    )
  ); 