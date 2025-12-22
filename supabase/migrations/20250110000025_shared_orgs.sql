-- AUREV HQ: Shared Organizations Schema
-- Unifies orgs table across SmartSend, OpsGrid, and AgentCloud

-- Add owner column to orgs (alias to owner_id for compatibility)
-- The existing owner_id column will remain, but we add owner for cross-app compatibility
alter table public.orgs 
  add column if not exists owner uuid references auth.users(id);

-- If owner_id exists but owner doesn't, backfill it
update public.orgs 
set owner = owner_id 
where owner is null and owner_id is not null;

-- Ensure profiles has org_id
alter table public.profiles 
  add column if not exists org_id uuid references public.orgs(id);

-- Create index for faster lookups
create index if not exists idx_profiles_org_id on public.profiles(org_id);

-- Comments
comment on column public.orgs.owner is 'Organization owner - alias for owner_id for cross-app compatibility';
comment on column public.profiles.org_id is 'Organization membership for unified AUREV HQ';

