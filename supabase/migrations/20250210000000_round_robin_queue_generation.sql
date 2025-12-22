-- Round-Robin Queue Generation with Multi-Mailbox Support
-- Updates generate_send_queue to distribute emails across mailboxes with 90s spacing

-- Drop and recreate the generate_send_queue function with round-robin logic
create or replace function public.generate_send_queue(p_campaign uuid)
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_count int := 0;
  r record;
  v_mailboxes uuid[];
  v_mailbox_idx int := 0;
  v_start_time timestamptz;
  v_delay_ms int := 90000; -- 90 seconds
  v_scheduled_at timestamptz;
begin
  -- allow owner/editor
  if not can_edit_campaign(p_campaign) then
    raise exception 'not authorized';
  end if;

  -- fetch the campaign's send_start if available
  select c.send_start into v_start_time 
  from public.campaigns c 
  where c.id = p_campaign;
  
  -- default to now if no send_start
  if v_start_time is null then
    v_start_time := now();
  end if;

  -- get all available mailboxes for the user
  with campaign_user as (
    select user_id from public.campaigns where id = p_campaign
  )
  select array_agg(id order by created_at asc) into v_mailboxes
  from public.connected_accounts
  where user_id = (select user_id from campaign_user);

  if v_mailboxes is null or array_length(v_mailboxes, 1) = 0 then
    raise exception 'no mailboxes connected';
  end if;

  -- enqueue first-touch for all active leads that are not yet queued
  -- round-robin mailboxes and schedule with 90s spacing
  for r in
    select l.id as lead_id, l.user_id, l.campaign_id, l.subject, l.body_html
    from public.campaign_leads l
    where l.campaign_id = p_campaign
      and coalesce(l.is_active, true)
      and not exists (
        select 1 from public.send_queue q
        where q.campaign_id = l.campaign_id and q.lead_id = l.id
      )
  loop
    -- pick mailbox in round-robin fashion
    v_mailbox_idx := (v_count % array_length(v_mailboxes, 1));
    
    -- calculate scheduled time: 90s per mailbox per lead
    v_scheduled_at := v_start_time + (v_delay_ms * (v_count / array_length(v_mailboxes, 1)))::text::interval;
    
    insert into public.send_queue(
      user_id, campaign_id, lead_id, mailbox_id, subject, body_html, 
      scheduled_at, status, step_no
    )
    values (
      r.user_id, r.campaign_id, r.lead_id, v_mailboxes[v_mailbox_idx + 1], 
      r.subject, r.body_html, v_scheduled_at, 'queued', 1
    );
    
    insert into public.send_logs(user_id, campaign_id, mailbox_id, lead_id, event, detail)
    values (
      r.user_id, r.campaign_id, v_mailboxes[v_mailbox_idx + 1], r.lead_id, 
      'enqueued', jsonb_build_object('reason','launch', 'mailbox_idx', v_mailbox_idx)
    );
    
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Ensure campaigns table has send_start column
do $$
begin
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaigns' and column_name = 'send_start') then
    alter table public.campaigns add column send_start timestamptz;
  end if;
end $$;

-- Ensure send_queue has step_no, attempts, and next_attempt_at columns
do $$
begin
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'step_no') then
    alter table public.send_queue add column step_no int not null default 1;
  end if;
  
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'attempts') then
    alter table public.send_queue add column attempts int not null default 0;
  end if;
  
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'next_attempt_at') then
    alter table public.send_queue add column next_attempt_at timestamptz;
  end if;
  
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'send_queue' and column_name = 'last_error_code') then
    alter table public.send_queue add column last_error_code text;
  end if;
end $$;

-- Ensure campaign_leads has required columns
do $$
begin
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaign_leads' and column_name = 'subject') then
    alter table public.campaign_leads add column subject text;
  end if;
  
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaign_leads' and column_name = 'body_html') then
    alter table public.campaign_leads add column body_html text;
  end if;
  
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaign_leads' and column_name = 'is_active') then
    alter table public.campaign_leads add column is_active boolean default true;
  end if;
end $$;

-- Create index for efficient fetching
create index if not exists idx_send_queue_status_scheduled 
  on public.send_queue (status, scheduled_at);

-- RPC: campaign send stats for UI display
create or replace function public.campaign_send_stats(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_queued int;
  v_sent int;
  v_failed int;
  v_sending int;
begin
  -- check access
  if not can_view_campaign(p_campaign_id) then
    raise exception 'not authorized';
  end if;

  select 
    count(*) filter (where status = 'queued') as queued,
    count(*) filter (where status = 'sent') as sent,
    count(*) filter (where status = 'failed') as failed,
    count(*) filter (where status = 'sending') as sending
  into v_queued, v_sent, v_failed, v_sending
  from public.send_queue
  where campaign_id = p_campaign_id;

  return jsonb_build_object(
    'queued', coalesce(v_queued, 0),
    'sent', coalesce(v_sent, 0),
    'failed', coalesce(v_failed, 0),
    'sending', coalesce(v_sending, 0)
  );
end;
$$;

revoke all on function public.campaign_send_stats(uuid) from public;
grant execute on function public.campaign_send_stats(uuid) to authenticated;

revoke all on function public.generate_send_queue(uuid) from public;
grant execute on function public.generate_send_queue(uuid) to authenticated;

