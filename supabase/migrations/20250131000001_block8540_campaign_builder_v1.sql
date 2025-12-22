-- Block 8540 — Campaign Builder v1
-- MVP Campaign Builder: Simple campaign creation with goal, sequence, and status
-- Adds goal column and ensures owner_id, sequence, and status columns exist

-- Add goal column if it doesn't exist
alter table public.campaigns
  add column if not exists goal text null;

-- Ensure owner_id exists (may have been added in block 440)
alter table public.campaigns
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

-- Ensure sequence exists (may have been added in block 196)
alter table public.campaigns
  add column if not exists sequence jsonb null;

-- Ensure status exists with correct default
alter table public.campaigns
  add column if not exists status text not null default 'draft';

-- Update status constraint to include 'draft', 'active', 'paused'
do $$
begin
  -- Drop existing check constraint if it exists
  if exists (
    select 1 from information_schema.table_constraints 
    where constraint_name like '%campaigns_status%' 
    and table_name = 'campaigns'
  ) then
    alter table public.campaigns drop constraint if exists campaigns_status_check;
  end if;
  
  -- Add new check constraint for MVP statuses
  alter table public.campaigns 
    add constraint campaigns_status_check 
    check (status in ('draft', 'active', 'paused', 'scheduled', 'running', 'completed', 'archived'));
exception
  when others then null;
end $$;

-- Create index on owner_id for performance
create index if not exists idx_campaigns_owner_id on public.campaigns(owner_id);

-- Create index on goal for filtering
create index if not exists idx_campaigns_goal on public.campaigns(goal) where goal is not null;

-- Ensure RLS is enabled
alter table public.campaigns enable row level security;

-- Add RLS policy for owner_id-based access (for MVP simplicity)
-- This allows users to access campaigns they own
do $$
begin
  -- Drop existing owner-based policies if they exist
  drop policy if exists "campaigns_select_owner" on public.campaigns;
  drop policy if exists "campaigns_insert_owner" on public.campaigns;
  drop policy if exists "campaigns_update_owner" on public.campaigns;
  
  -- Create owner-based policies
  create policy "campaigns_select_owner"
  on public.campaigns
  for select
  to authenticated
  using (owner_id = auth.uid() or owner_id is null);
  
  create policy "campaigns_insert_owner"
  on public.campaigns
  for insert
  to authenticated
  with check (owner_id = auth.uid());
  
  create policy "campaigns_update_owner"
  on public.campaigns
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
exception
  when others then null;
end $$;

























































