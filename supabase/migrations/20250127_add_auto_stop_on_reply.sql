-- Add auto_stop_on_reply column to campaigns tables
-- Campaign-level toggle for auto-stopping when recipients reply

alter table public.campaigns
  add column if not exists auto_stop_on_reply boolean default true;

alter table public.campaigns_new
  add column if not exists auto_stop_on_reply boolean default true;

-- Create index for the new column
create index if not exists idx_campaigns_auto_stop_on_reply on public.campaigns(auto_stop_on_reply);
create index if not exists idx_campaigns_new_auto_stop_on_reply on public.campaigns_new(auto_stop_on_reply);

-- Fast helper to mark recipients as replied/skipped
create or replace function public.mark_replied_and_skip(p_campaign uuid, p_email text)
returns void as $$
begin
  -- Mark all pending rows for this campaign+email as skipped
  update public.campaign_recipients
  set status = 'skipped', 
      error = 'auto_stopped_on_reply',
      updated_at = now()
  where campaign_id = p_campaign
    and lower(email_lower) = lower(p_email)
    and status = 'pending';
    
  -- Also handle campaigns_new table
  update public.campaign_recipients_new
  set status = 'skipped', 
      last_error = 'auto_stopped_on_reply',
      updated_at = now()
  where campaign_id = p_campaign
    and lower(email) = lower(p_email)
    and status = 'pending';
end;
$$ language plpgsql security definer;

-- Helper to sync replies to recipients (belt & suspenders)
create or replace function public.sync_replies_to_recipients(p_campaign uuid)
returns void as $$
begin
  -- Handle regular campaigns table
  update public.campaign_recipients cr
  set status = 'skipped', 
      error = 'auto_stopped_on_reply',
      updated_at = now()
  where cr.campaign_id = p_campaign
    and cr.status = 'pending'
    and exists (
      select 1 from public.events e
      where e.campaign_id = p_campaign
        and e.type = 'reply'
        and lower(e.recipient_email) = lower(cr.email_lower)
    );
    
  -- Handle campaigns_new table
  update public.campaign_recipients_new cr
  set status = 'skipped', 
      last_error = 'auto_stopped_on_reply',
      updated_at = now()
  where cr.campaign_id = p_campaign
    and cr.status = 'pending'
    and exists (
      select 1 from public.events e
      where e.campaign_id = p_campaign
        and e.type = 'reply'
        and lower(e.recipient_email) = lower(cr.email)
    );
end;
$$ language plpgsql security definer;

-- Grant execute permissions
grant execute on function public.mark_replied_and_skip(uuid, text) to authenticated;
grant execute on function public.sync_replies_to_recipients(uuid) to authenticated; 