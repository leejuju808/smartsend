-- Add step_number column to send_queue for follow-up wave runner
-- This complements step_no for the followup-runner system

alter table public.send_queue
  add column if not exists step_number int;

-- If step_no exists, sync step_number from step_no for existing rows
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'send_queue' 
    and column_name = 'step_no'
  ) then
    update public.send_queue
    set step_number = step_no
    where step_number is null and step_no is not null;
  end if;
end $$;

-- index for faster lookups
create index if not exists idx_send_queue_campaign_step
  on public.send_queue (campaign_id, step_number);

-- Also index on step_no if it exists for compatibility
create index if not exists idx_send_queue_campaign_step_no
  on public.send_queue (campaign_id, step_no);












