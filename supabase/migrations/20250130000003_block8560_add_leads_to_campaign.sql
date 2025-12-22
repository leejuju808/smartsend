-- Block 8560 — Add Leads to Campaign (Quick Import)
-- Ensure leads table has owner_id and campaign_id with proper foreign key

-- Add owner_id column if it doesn't exist (nullable for early beta)
alter table public.leads
  add column if not exists owner_id uuid references auth.users(id) on delete set null;

-- Ensure campaign_id has foreign key reference to campaigns
do $$
begin
  -- Check if campaign_id column exists
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'leads' 
    and column_name = 'campaign_id'
  ) then
    -- Check if foreign key constraint already exists
    if not exists (
      select 1 from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
        and tc.table_schema = kcu.table_schema
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_name = 'leads'
        and kcu.column_name = 'campaign_id'
        and kcu.table_schema = 'public'
    ) then
      -- Add foreign key constraint
      alter table public.leads
        add constraint leads_campaign_id_fkey
        foreign key (campaign_id) references public.campaigns(id) on delete set null;
    end if;
  else
    -- Add campaign_id column with foreign key
    alter table public.leads
      add column campaign_id uuid references public.campaigns(id) on delete set null;
  end if;
end $$;

-- Add city column if it doesn't exist
alter table public.leads
  add column if not exists city text;

-- Add name column if it doesn't exist (for simple name storage)
alter table public.leads
  add column if not exists name text;

-- Create indexes for performance
create index if not exists idx_leads_owner_id
  on public.leads(owner_id);

create index if not exists idx_leads_campaign_id
  on public.leads(campaign_id);

-- Update RLS policy to include owner_id check
-- Drop existing policy if it exists
drop policy if exists "Users can manage their own leads" on public.leads;
drop policy if exists "Leads are scoped to workspace" on public.leads;

-- Create policy that allows access via owner_id or user_id
create policy "Users can manage their own leads"
  on public.leads
  for all
  using (
    owner_id = auth.uid() 
    or user_id = auth.uid()
  )
  with check (
    owner_id = auth.uid() 
    or user_id = auth.uid()
  );

























































