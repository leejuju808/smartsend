-- View: vw_due_sends
-- Identifies campaign sends that are due based on active campaigns, enabled steps, time windows, and exclusion rules

-- Ensure send_queue has step_id column if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'step_id'
  ) then
    alter table public.send_queue add column step_id uuid references public.campaign_steps(id) on delete set null;
  end if;
end $$;

-- Ensure send_queue has account_id column if it doesn't exist (some schemas use mailbox_id)
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'send_queue' and column_name = 'account_id'
  ) then
    -- Check if mailbox_id exists and use that, otherwise create account_id
    if exists (
      select 1 from information_schema.columns 
      where table_schema = 'public' and table_name = 'send_queue' and column_name = 'mailbox_id'
    ) then
      -- Add account_id and copy from mailbox_id for compatibility
      alter table public.send_queue add column account_id uuid references public.connected_accounts(id) on delete set null;
      update public.send_queue set account_id = mailbox_id where account_id is null and mailbox_id is not null;
    else
      alter table public.send_queue add column account_id uuid references public.connected_accounts(id) on delete cascade;
    end if;
  end if;
end $$;

create or replace view public.vw_due_sends as
select
  c.id as campaign_id,
  l.id as lead_id,
  s.id as step_id,
  s.subject_template,
  s.body_html_template,
  ca.id as account_id,
  c.user_id
from public.campaigns c
join public.campaign_steps s on s.campaign_id = c.id and s.enabled = true
join public.leads l on l.user_id = c.user_id
join public.connected_accounts ca on ca.user_id = c.user_id
where c.status = 'active'
  and now()::time between coalesce(s.send_start,'00:00')::time and coalesce(s.send_end,'23:59')::time
  and l.id not in (
    select lead_id from public.send_queue where status in ('queued','sent') and campaign_id = c.id
  )
  and l.id not in (
    select lead_id from public.inbox_threads where stopped_by_reply = true
  );
