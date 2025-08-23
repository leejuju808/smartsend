-- Add team_id to profiles for linking users to teams
alter table public.profiles add column if not exists team_id uuid references public.teams(id);

-- Create index for faster team lookups
create index if not exists idx_profiles_team on public.profiles(team_id); 