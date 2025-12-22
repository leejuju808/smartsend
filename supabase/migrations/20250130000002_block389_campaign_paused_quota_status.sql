-- Block 389 — Campaign "Paused by Quota" Status v1
-- Adds status_reason column and paused_quota status to campaigns table

-- 1) Add status_reason to campaigns
alter table public.campaigns
  add column if not exists status_reason text;

-- 2) Update status constraint to include paused_quota
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
  
  -- Add new check constraint with paused_quota
  alter table public.campaigns 
    add constraint campaigns_status_check 
    check (status in ('draft', 'scheduled', 'running', 'paused', 'completed', 'active', 'archived', 'paused_quota'));
exception
  when others then null;
end $$;

-- 3) Update billing_usage_events to support quota_blocked event type
alter table billing_usage_events
  drop constraint if exists billing_usage_events_event_type_check;

alter table billing_usage_events
  add constraint billing_usage_events_event_type_check
  check (event_type in ('daily_cap_reached', 'daily_cap_warning', 'reply_cap_reached', 'quota_blocked'));

-- 4) Optional: backfill existing NULL status_reason
update public.campaigns
set status_reason = null
where status_reason is null;




