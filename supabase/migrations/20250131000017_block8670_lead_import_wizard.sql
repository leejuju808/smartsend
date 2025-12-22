-- Block 8670 — Lead Import Wizard (Roofing-Friendly CSV Upload + Field Mapping + Validation)
-- Ensure leads table has all required columns for CSV import

-- Add address column if it doesn't exist
alter table public.leads
  add column if not exists address text;

-- Add phone column if it doesn't exist (may already exist, but ensure it's there)
alter table public.leads
  add column if not exists phone text;

-- Add city column if it doesn't exist (may already exist, but ensure it's there)
alter table public.leads
  add column if not exists city text;

-- Add state column if it doesn't exist
alter table public.leads
  add column if not exists state text;

-- Add zip column if it doesn't exist
alter table public.leads
  add column if not exists zip text;

-- Ensure campaign_id has foreign key reference to campaigns (on delete cascade as per spec)
do $$
begin
  -- Check if campaign_id column exists
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'leads' 
    and column_name = 'campaign_id'
  ) then
    -- Check if foreign key constraint exists with cascade
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
      -- Add foreign key constraint with cascade
      alter table public.leads
        add constraint leads_campaign_id_fkey
        foreign key (campaign_id) references public.campaigns(id) on delete cascade;
    end if;
  else
    -- Add campaign_id column with foreign key and cascade
    alter table public.leads
      add column campaign_id uuid references public.campaigns(id) on delete cascade;
  end if;
end $$;

-- Create indexes for performance on new columns
create index if not exists idx_leads_address on public.leads(address) where address is not null;
create index if not exists idx_leads_city on public.leads(city) where city is not null;
create index if not exists idx_leads_state on public.leads(state) where state is not null;
create index if not exists idx_leads_zip on public.leads(zip) where zip is not null;

























































