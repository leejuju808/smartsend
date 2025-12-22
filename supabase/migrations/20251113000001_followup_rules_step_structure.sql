-- Ensure followup_rules table has step_number and delay_days columns
-- This creates a simple follow-up rule structure for the wave runner

-- Create followup_rules table if it doesn't exist with the required structure
create table if not exists public.followup_rules (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  step_number int not null,
  delay_days int not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, step_number)
);

-- Add step_number and delay_days if the table exists but columns don't
do $$
begin
  -- Add step_number if missing
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'followup_rules'
  ) and not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'followup_rules' 
    and column_name = 'step_number'
  ) then
    alter table public.followup_rules
      add column step_number int;
    
    -- Set default step_number based on existing data if possible
    -- This is a best-effort migration
    update public.followup_rules
    set step_number = 1
    where step_number is null;
    
    alter table public.followup_rules
      alter column step_number set not null;
  end if;

  -- Add delay_days if missing
  if exists (
    select 1 from information_schema.tables 
    where table_schema = 'public' and table_name = 'followup_rules'
  ) and not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'followup_rules' 
    and column_name = 'delay_days'
  ) then
    alter table public.followup_rules
      add column delay_days int not null default 3;
  end if;
end $$;

-- Create index for faster lookups
create index if not exists idx_followup_rules_campaign_step
  on public.followup_rules (campaign_id, step_number);












