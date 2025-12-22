-- Block 308: Team Members Roles
-- Ensure team_members has role column and add name column if needed

-- Add role column if it doesn't exist
alter table public.team_members
  add column if not exists role text default 'member';

-- Add constraint for role if it doesn't exist
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'team_members_role_check'
  ) then
    alter table public.team_members
      add constraint team_members_role_check
      check (role in ('owner', 'admin', 'member'));
  end if;
end $$;

-- Add name column if it doesn't exist
alter table public.team_members
  add column if not exists name text;







