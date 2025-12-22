-- Send Queue System
-- Queue + logs + helpers for email campaign sending

-- Queue (one row per planned outbound)
create table if not exists public.send_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.campaign_leads(id) on delete cascade,
  mailbox_id uuid not null references public.connected_accounts(id) on delete cascade,
  subject text,
  body_html text,
  scheduled_at timestamptz not null default now(),
  status text not null check (status in ('queued','sending','sent','failed','canceled')) default 'queued',
  locked_by uuid,
  locked_at timestamptz,
  provider_msg_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_send_queue_due on public.send_queue (scheduled_at) where status='queued';
create index if not exists idx_send_queue_campaign on public.send_queue (campaign_id);
create index if not exists idx_send_queue_mailbox on public.send_queue (mailbox_id) where status in ('queued','sending');

-- Simple log (append-only)
create table if not exists public.send_logs (
  id uuid primary key default gen_random_uuid(),
  queue_id uuid references public.send_queue(id) on delete set null,
  user_id uuid not null,
  campaign_id uuid not null,
  mailbox_id uuid not null,
  lead_id uuid not null,
  event text not null check (event in ('enqueued','reserved','sent','failed','canceled','retry')),
  detail jsonb,
  created_at timestamptz not null default now()
);

-- RLS: read-only for collaborators per earlier policies
alter table public.send_queue enable row level security;
drop policy if exists queue_read on public.send_queue;
create policy queue_read on public.send_queue
  for select using (can_view_campaign(campaign_id));

revoke all on table public.send_queue from anon, authenticated; -- write via RPC/service role only

alter table public.send_logs enable row level security;
drop policy if exists logs_read on public.send_logs;
create policy logs_read on public.send_logs
  for select using (can_view_campaign(campaign_id));

revoke all on table public.send_logs from anon, authenticated; -- writes via service role

-- Helper: count sends today per mailbox (UTC-safe)
create or replace function public.sent_today(p_mailbox uuid)
returns int language sql stable as $$
  select count(*) from public.send_queue
  where mailbox_id = p_mailbox
    and status = 'sent'
    and created_at::date = (now() at time zone 'utc')::date;
$$;

-- RPC: build queue from a campaign (owner/editor)
create or replace function public.generate_send_queue(p_campaign uuid)
returns int
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_count int := 0;
  r record;
  v_mailbox uuid;
begin
  -- allow owner/editor
  if not can_edit_campaign(p_campaign) then
    raise exception 'not authorized';
  end if;

  -- pick the campaign's default mailbox (stored on campaign) OR owner's first connected account
  select c.mailbox_id into v_mailbox from public.campaigns c where c.id = p_campaign;
  if v_mailbox is null then
    select id into v_mailbox
    from public.connected_accounts
    where user_id = (select user_id from public.campaigns where id = p_campaign)
    order by created_at asc limit 1;
  end if;
  if v_mailbox is null then
    raise exception 'no mailbox connected';
  end if;

  -- enqueue first-touch for all active leads that are not yet queued
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
    insert into public.send_queue(user_id, campaign_id, lead_id, mailbox_id, subject, body_html, scheduled_at, status)
    values (r.user_id, r.campaign_id, r.lead_id, v_mailbox, r.subject, r.body_html, now(), 'queued');
    insert into public.send_logs(user_id, campaign_id, mailbox_id, lead_id, event, detail)
    values (r.user_id, r.campaign_id, v_mailbox, r.lead_id, 'enqueued', jsonb_build_object('reason','launch'));
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.generate_send_queue(uuid) from public;
grant execute on function public.generate_send_queue(uuid) to authenticated;

-- RPC: atomic reservation for the sender (per mailbox)
create or replace function public.reserve_send_batch(p_mailbox uuid, p_limit int)
returns setof public.send_queue
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid(); -- service role will be null; that's fine
begin
  return query
  with cte as (
    select id
    from public.send_queue
    where mailbox_id = p_mailbox
      and status = 'queued'
      and scheduled_at <= now()
    order by scheduled_at asc
    limit p_limit
    for update skip locked
  )
  update public.send_queue q
     set status='sending', locked_by = v_uid, locked_at = now(), updated_at = now()
  from cte
  where q.id = cte.id
  returning q.*;
end;
$$;

revoke all on function public.reserve_send_batch(uuid,int) from public;
grant execute on function public.reserve_send_batch(uuid,int) to service_role; -- only edge can call

-- Ensure campaigns table has mailbox_id column
do $$
begin
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaigns' and column_name = 'mailbox_id') then
    alter table public.campaigns add column mailbox_id uuid references public.connected_accounts(id);
  end if;
  
  if not exists (select 1 from information_schema.columns 
                 where table_name = 'campaigns' and column_name = 'launched_at') then
    alter table public.campaigns add column launched_at timestamptz;
  end if;
end $$;

-- Ensure campaign_leads table has subject, body_html, is_active columns
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

-- Create alias function for get_user_campaign_role (used by some API routes) if it doesn't exist
-- Note: This may already exist in later migrations, but we create it here for consistency
do $$
begin
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on p.pronamespace = n.oid
    where n.nspname = 'public' and p.proname = 'get_user_campaign_role'
  ) then
    create function public.get_user_campaign_role(p_campaign uuid)
    returns text
    language sql stable as $$
      select public.user_campaign_role(p_campaign);
    $$;
    
    grant execute on function public.get_user_campaign_role(uuid) to authenticated;
  end if;
end $$;

