-- Preflight System Helpers
-- Add missing columns used by preflight checks

-- mailbox auth flag used by preflight
alter table public.connected_accounts
  add column if not exists auth_valid boolean;

-- owner-only override already included (from 20250121000000_preflight_system.sql)
-- verify launch_override exists
alter table public.campaigns
  add column if not exists launch_override boolean default false;

-- stamp for first/last successful test send (already from preflight_system.sql)
-- verify last_test_send_at exists
alter table public.connected_accounts
  add column if not exists last_test_send_at timestamptz;

-- Add body_md to sequence_steps if it doesn't exist
alter table public.sequence_steps
  add column if not exists body_md text;

-- Add step_no to sequence_steps if it doesn't exist (use position as fallback)
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'sequence_steps' and column_name = 'step_no'
  ) then
    alter table public.sequence_steps add column step_no int;
    -- Migrate from position if it exists
    update public.sequence_steps 
    set step_no = position 
    where step_no is null and position is not null;
  end if;
end $$;

-- RLS reminder (already in your project, but these are the two that matter for new fields):

-- user can update only their own connected_accounts
drop policy if exists ca_owner_update on public.connected_accounts;
create policy if not exists ca_owner_update on public.connected_accounts
for update using (auth.uid() = user_id);

-- user can read/update only their campaigns
drop policy if exists campaign_owner_rw on public.campaigns;
create policy if not exists campaign_owner_rw on public.campaigns
for select using (auth.uid() = user_id);
create policy if not exists campaign_owner_update on public.campaigns
for update using (auth.uid() = user_id);






