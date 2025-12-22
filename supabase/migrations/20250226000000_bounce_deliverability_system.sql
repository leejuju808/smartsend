-- Bounce and Deliverability Tracking System
-- Comprehensive bounce handling, delivery events, and deliverability metrics

-- =====================================================
-- A) Extend send_logs with bounce tracking fields
-- =====================================================

-- Add columns if they don't exist (idempotent)
alter table public.send_logs
  add column if not exists provider_message_id text,
  add column if not exists error_code text,
  add column if not exists error_message text;

-- Normalize allowed statuses (queued/scheduled already used in queue)
alter table public.send_logs
  drop constraint if exists send_logs_status_check;

alter table public.send_logs
  add constraint send_logs_status_check
  check (status in ('queued','scheduled','sent','failed','bounced','blocked','canceled'));

-- Index for status lookups
create index if not exists idx_send_logs_status on public.send_logs(status);

-- =====================================================
-- B) Delivery events table (hard vs soft bounces)
-- =====================================================

-- Create new delivery_events table if it doesn't exist, or extend existing one
-- Note: If delivery_events already exists with different schema, we'll adapt

create table if not exists public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  send_log_id uuid references public.send_logs(id) on delete cascade,
  type text not null check (type in ('bounce','deferred','delivered','complaint')),
  hard boolean,                   -- for bounces: hard=true (permanent), soft=false (temporary)
  provider text,                  -- 'ses','sendgrid','mailgun','gmail','outlook', etc.
  provider_event_id text,
  smtp_code text,
  smtp_subcode text,
  diagnostic text,                -- raw reason
  target_email text               -- who bounced
);

-- Add indexes
create index if not exists idx_de_send on public.delivery_events(send_log_id);
create index if not exists idx_de_type on public.delivery_events(type);
create index if not exists idx_de_provider_msg on public.delivery_events(provider, provider_event_id);

-- If delivery_events already exists with different column names, add compatibility columns
-- Check if 'kind' column exists and add 'type' if needed
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'delivery_events' 
    and column_name = 'kind'
  ) and not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'delivery_events' 
    and column_name = 'type'
  ) then
    alter table public.delivery_events add column type text;
    -- Map kind to type
    update public.delivery_events 
    set type = case 
      when kind = 'bounce' then 'bounce'
      when kind = 'deliveryDelay' or kind = 'deferred' then 'deferred'
      when kind = 'delivered' then 'delivered'
      when kind = 'spam' or kind = 'complaint' then 'complaint'
      else 'deferred'
    end
    where type is null;
  end if;
  
  -- Check if 'log_id' exists and add 'send_log_id' if needed
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'delivery_events' 
    and column_name = 'log_id'
  ) and not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'delivery_events' 
    and column_name = 'send_log_id'
  ) then
    alter table public.delivery_events add column send_log_id uuid references public.send_logs(id) on delete cascade;
    update public.delivery_events set send_log_id = log_id where send_log_id is null;
  end if;
end $$;

-- =====================================================
-- C) Per-lead deliverability summary view
-- =====================================================

create or replace view public.v_lead_deliverability as
select
  l.id as lead_id,
  l.email,
  count(sl.id) filter (where sl.status='sent')                         as sends,
  count(sl.id) filter (where sl.status='bounced')                      as bounces,
  count(sl.id) filter (where sl.status='failed')                       as fails,
  count(de.id) filter (where de.type='complaint')                      as complaints,
  max(te.created_at) filter (where te.type='open')                     as last_open_at,
  max(te.created_at) filter (where te.type='click')                    as last_click_at
from public.leads l
left join public.send_logs sl on sl.lead_id = l.id
left join public.tracking_events te on te.send_log_id = sl.id
left join public.delivery_events de on de.send_log_id = sl.id
group by 1,2;

-- =====================================================
-- D) Auto-suppress on HARD bounce (owner-scoped)
-- =====================================================

create or replace function public.suppress_on_hard_bounce(p_send_log uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_camp uuid; 
  v_lead uuid; 
  v_user uuid;
  v_email text; 
  v_domain text;
begin
  select sl.campaign_id, sl.lead_id into v_camp, v_lead 
  from public.send_logs sl 
  where sl.id = p_send_log;
  
  if v_camp is null or v_lead is null then 
    return; 
  end if;

  select c.user_id into v_user 
  from public.campaigns c 
  where c.id = v_camp;
  
  select email, domain into v_email, v_domain 
  from public.leads 
  where id = v_lead;

  if v_user is not null and v_email is not null then
    perform public.upsert_suppression(v_user, v_email, null, 'bounce', 'hard bounce');
  elsif v_user is not null and v_domain is not null then
    perform public.upsert_suppression(v_user, null, v_domain, 'bounce', 'hard bounce (domain)');
  end if;

  -- Stop future sends on this thread if we have it
  update public.send_queue
     set status='canceled', canceled_reason='hard_bounce', updated_at=now()
   where lead_id = v_lead and status in ('queued','scheduled');
end $$;

-- Grant execute permission
grant execute on function public.suppress_on_hard_bounce(uuid) to service_role, authenticated;

-- =====================================================
-- E) Soft-bounce throttle counter per lead (view)
-- =====================================================

create or replace view public.v_soft_bounce_counts as
select
  sl.lead_id,
  count(de.id) filter (
    where de.type='bounce' 
    and coalesce(de.hard,false)=false 
    and de.created_at > now() - interval '30 days'
  ) as soft_bounces_30d
from public.send_logs sl
left join public.delivery_events de on de.send_log_id = sl.id
group by 1;

-- =====================================================
-- F) Campaign deliverability summary view
-- =====================================================

create or replace view public.v_campaign_deliverability as
select
  sl.campaign_id,
  count(sl.id) as attempts,
  count(sl.id) filter (where sl.status='sent')     as delivered,
  count(sl.id) filter (where sl.status='bounced')  as bounced,
  count(sl.id) filter (where sl.status='failed')   as failed,
  count(de.id) filter (where de.type='complaint')  as complaints
from public.send_logs sl
left join public.delivery_events de on de.send_log_id = sl.id
group by 1;

-- =====================================================
-- G) Link inbound bounce messages to send_log
-- =====================================================

create or replace function public.link_bounce_to_sendlog(p_message uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid; 
  v_at timestamptz; 
  v_send uuid;
begin
  select thread_id, created_at into v_thread, v_at 
  from public.inbox_messages 
  where id = p_message;
  
  if v_thread is null then 
    return null; 
  end if;

  select id into v_send
  from public.send_logs
  where thread_id = v_thread and created_at <= v_at
  order by created_at desc
  limit 1;

  if v_send is not null then
    insert into public.delivery_events(
      send_log_id, type, hard, provider, diagnostic, target_email
    )
    values (v_send, 'bounce', true, 'gmail', 'Mail Delivery Subsystem', null)
    on conflict do nothing;
    
    update public.send_logs 
    set status='bounced', error_message='Mail Delivery Subsystem'
    where id = v_send;
    
    perform public.suppress_on_hard_bounce(v_send);
  end if;
  
  return v_send;
end $$;

-- Grant execute permission
grant execute on function public.link_bounce_to_sendlog(uuid) to service_role, authenticated;

-- =====================================================
-- H) Ensure send_queue has canceled_reason column
-- =====================================================

alter table public.send_queue
  add column if not exists canceled_reason text;

-- Index for canceled items
create index if not exists idx_send_queue_canceled_reason 
  on public.send_queue(canceled_reason) 
  where status = 'canceled';

-- =====================================================
-- I) RLS policies for delivery_events
-- =====================================================

alter table public.delivery_events enable row level security;

-- Drop existing policies if they exist
drop policy if exists "delivery_events_select_owner" on public.delivery_events;
drop policy if exists "delivery_events_insert_service" on public.delivery_events;

-- Users can view delivery events for their campaigns
create policy "delivery_events_select_owner" on public.delivery_events
  for select
  using (
    exists (
      select 1 from public.send_logs sl
      join public.campaigns c on c.id = sl.campaign_id
      where sl.id = delivery_events.send_log_id
      and c.user_id = auth.uid()
    )
  );

-- Service role can insert
create policy "delivery_events_insert_service" on public.delivery_events
  for insert
  to service_role
  with check (true);

