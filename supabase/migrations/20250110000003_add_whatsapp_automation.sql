-- Add reply_whatsapp trigger event to automation_rules
-- This migration extends automation_rules to support WhatsApp reply events

-- Drop the existing check constraint and recreate with reply_whatsapp
do $$ 
begin
  if exists (
    select 1 from pg_constraint 
    where conname = 'automation_rules_trigger_event_check'
  ) then
    alter table public.automation_rules 
    drop constraint automation_rules_trigger_event_check;
  end if;
end $$;

alter table public.automation_rules
add constraint automation_rules_trigger_event_check 
check (trigger_event in ('reply', 'reply_whatsapp', 'open', 'click', 'time_delay'));

-- Add comment
comment on column public.automation_rules.trigger_event is 
  'Event that triggers the automation: reply (email), reply_whatsapp, open, click, time_delay';

