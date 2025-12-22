-- Replies Inbox Database Enhancements
-- Add handled and label columns to campaign_logs for inbox triage

-- Add handled boolean (default false for new replies)
alter table if exists public.campaign_logs
  add column if not exists handled boolean not null default false;

-- Add optional label for tagging replies
alter table if exists public.campaign_logs
  add column if not exists label text;

-- Create view to join reply logs with lead info for faster UI queries
create or replace view public.v_reply_logs as
select
  cl.id as log_id,
  cl.created_at as replied_at,
  cl.campaign_id,
  cl.lead_id,
  l.email,
  coalesce(l.first_name,'') as first_name,
  coalesce(l.last_name,'') as last_name,
  coalesce(l.company,'') as company,
  cl.meta,
  cl.handled,
  cl.label
from public.campaign_logs cl
join public.leads l on l.id = cl.lead_id
where cl.type = 'reply' or cl.event = 'reply' or cl.event_type = 'reply';

-- Index for faster querying by type and creation time
create index if not exists campaign_logs_type_idx 
  on public.campaign_logs(type, created_at desc)
  where type = 'reply' or event = 'reply' or event_type = 'reply';

-- RPC function to mark replies as handled/unhandled with optional label
create or replace function public.reply_mark_handled(
  p_log_id uuid, 
  p_handled boolean, 
  p_label text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare 
  v_campaign uuid; 
  v_owner uuid;
begin
  -- Get campaign_id from the log
  select campaign_id into v_campaign 
  from public.campaign_logs 
  where id = p_log_id;
  
  if v_campaign is null then 
    raise exception 'Log not found'; 
  end if;
  
  -- Check ownership via campaigns table
  select owner_id into v_owner 
  from public.campaigns 
  where id = v_campaign;
  
  if v_owner is null or v_owner <> auth.uid() then 
    raise exception 'Not authorized'; 
  end if;
  
  -- Update the log
  update public.campaign_logs 
  set handled = p_handled, 
      label = coalesce(p_label, label) 
  where id = p_log_id;
end; 
$$;

-- Grant execute permission to authenticated users
grant execute on function public.reply_mark_handled(uuid, boolean, text) to authenticated;

