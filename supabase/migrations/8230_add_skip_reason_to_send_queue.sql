-- 8230_add_skip_reason_to_send_queue.sql
-- Add skip_reason column to campaign_send_queue table

alter table public.campaign_send_queue
  add column if not exists skip_reason text;

-- Update status enum/check to include skipped_suppressed
-- First, check if we're using an enum or check constraint
do $$ 
begin
  -- If using send_status enum, try to add the value
  if exists (select 1 from pg_type where typname = 'send_status') then
    -- Try to add skipped_suppressed to enum if it doesn't exist
    if not exists (
      select 1 from pg_enum 
      where enumlabel = 'skipped_suppressed' 
      and enumtypid = (select oid from pg_type where typname = 'send_status')
    ) then
      alter type send_status add value 'skipped_suppressed';
    end if;
  end if;
exception when others then
  -- Enum might not exist or value already exists - that's ok
  null;
end $$;

-- If using a check constraint instead, we'll need to drop and recreate it
-- Check if there's a check constraint on status
do $$
declare
  constraint_name text;
begin
  -- Find the constraint name
  select constraint_name into constraint_name
  from information_schema.table_constraints
  where table_schema = 'public'
    and table_name = 'campaign_send_queue'
    and constraint_type = 'CHECK'
    and constraint_name like '%status%'
  limit 1;

  -- If we found a constraint and it doesn't include skipped_suppressed, update it
  if constraint_name is not null then
    -- Drop the old constraint
    execute format('alter table public.campaign_send_queue drop constraint if exists %I', constraint_name);
    
    -- Add new constraint with skipped_suppressed
    alter table public.campaign_send_queue
      add constraint campaign_send_queue_status_check
      check (status::text in ('queued','scheduled','sending','sent','failed','throttled','paused','bounced','replied','skipped_suppressed','pending','retry','processing'));
  end if;
exception when others then
  -- Constraint might not exist or already updated - that's ok
  null;
end $$;

-- Create index for skip_reason if useful for queries
create index if not exists idx_campaign_send_queue_skip_reason 
  on public.campaign_send_queue(skip_reason) 
  where skip_reason is not null;

































































