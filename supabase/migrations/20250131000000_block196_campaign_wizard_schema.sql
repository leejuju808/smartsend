-- Block 196.1 — Extend public.campaigns schema for Campaign Creation Wizard
-- Adds columns for wizard-based campaign creation: name, objective, status, from_email_account_id,
-- audience_type, segment_id, daily_send_cap, sending_window_start/end, start_date, timezone, sequence

alter table public.campaigns
  add column if not exists name text,
  add column if not exists objective text,
  add column if not exists status text default 'draft', -- 'draft' | 'scheduled' | 'running' | 'paused' | 'completed'
  add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade,
  add column if not exists from_email_account_id uuid references public.email_accounts(id) on delete set null,
  add column if not exists audience_type text, -- 'all_leads' | 'segment' | 'manual'
  add column if not exists segment_id uuid, -- references segments table if exists
  add column if not exists daily_send_cap integer,
  add column if not exists sending_window_start time,
  add column if not exists sending_window_end time,
  add column if not exists start_date date,
  add column if not exists timezone text,
  add column if not exists sequence jsonb, -- simple array of steps for v1
  add column if not exists created_at timestamptz default now();

-- Update status constraint if it doesn't match
do $$
begin
  -- Drop existing check constraint if it exists and doesn't match
  if exists (
    select 1 from information_schema.table_constraints 
    where constraint_name like '%campaigns_status%' 
    and table_name = 'campaigns'
  ) then
    alter table public.campaigns drop constraint if exists campaigns_status_check;
  end if;
  
  -- Add new check constraint
  alter table public.campaigns 
    add constraint campaigns_status_check 
    check (status in ('draft', 'scheduled', 'running', 'paused', 'completed', 'active', 'archived'));
exception
  when others then null;
end $$;

-- Ensure RLS is enabled
alter table public.campaigns enable row level security;

-- Drop existing policies if they exist (to recreate with correct workspace_id check)
drop policy if exists "campaigns_select" on public.campaigns;
drop policy if exists "campaigns_insert" on public.campaigns;
drop policy if exists "campaigns_update" on public.campaigns;
drop policy if exists "users select their campaigns" on public.campaigns;
drop policy if exists "users insert their campaigns" on public.campaigns;
drop policy if exists "users update their campaigns" on public.campaigns;

-- Create RLS policies using workspace_members for workspace access
create policy "campaigns_select"
on public.campaigns
for select
to authenticated
using (
  workspace_id in (
    select workspace_id from public.workspace_members
    where user_id = auth.uid()
  )
);

create policy "campaigns_insert"
on public.campaigns
for insert
to authenticated
with check (
  workspace_id in (
    select workspace_id from public.workspace_members
    where user_id = auth.uid()
  )
);

create policy "campaigns_update"
on public.campaigns
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

-- Create indexes for common queries
create index if not exists idx_campaigns_workspace_status 
  on public.campaigns(workspace_id, status);
create index if not exists idx_campaigns_from_email_account 
  on public.campaigns(from_email_account_id);
create index if not exists idx_campaigns_segment 
  on public.campaigns(segment_id) where segment_id is not null;
create index if not exists idx_campaigns_start_date 
  on public.campaigns(start_date) where start_date is not null;










