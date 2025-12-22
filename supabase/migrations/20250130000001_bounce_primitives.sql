-- Bounce Primitives Migration (Idempotent)
-- A) Lead-level suppression
-- B) Normalize bounce/complaint logs
-- C) Tag send_logs with terminal delivery state
-- D) Domain health rollups
-- E) Quick views
-- F) Helper to suppress a lead + cancel future sends

-- =====================================================
-- A) Lead-level suppression
-- =====================================================
alter table public.leads
  add column if not exists suppressed boolean default false,
  add column if not exists suppressed_reason text,
  add column if not exists suppressed_at timestamptz;

create index if not exists idx_leads_suppressed on public.leads(suppressed);

-- =====================================================
-- B) Normalize bounce/complaint logs
-- =====================================================
alter table public.delivery_events
  add column if not exists smtp_code text,
  add column if not exists smtp_reason text;

-- Update delivery_events to ensure event_type includes 'complaint'
do $$ 
begin
  -- Check if check constraint exists and includes 'complaint'
  if exists (
    select 1 from pg_constraint 
    where conname = 'delivery_events_kind_check' 
    and contype = 'c'
  ) then
    -- Drop old constraint if it doesn't include complaint
    execute 'alter table public.delivery_events drop constraint if exists delivery_events_kind_check';
  end if;
  
  -- Add new constraint with complaint
  if not exists (
    select 1 from pg_constraint 
    where conname = 'delivery_events_kind_check' 
    and contype = 'c'
  ) then
    execute 'alter table public.delivery_events add constraint delivery_events_kind_check 
             check (kind in (''delivered'',''open'',''click'',''bounce'',''spam'',''unsubscribe'',''complaint''))';
  end if;
end $$;

-- Also check event_type if it exists (some migrations use event_type instead of kind)
do $$ 
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema='public' and table_name='delivery_events' and column_name='event_type'
  ) then
    if exists (
      select 1 from pg_constraint 
      where conname = 'delivery_events_event_type_check' 
      and contype = 'c'
    ) then
      execute 'alter table public.delivery_events drop constraint if exists delivery_events_event_type_check';
    end if;
    
    if not exists (
      select 1 from pg_constraint 
      where conname = 'delivery_events_event_type_check' 
      and contype = 'c'
    ) then
      execute 'alter table public.delivery_events add constraint delivery_events_event_type_check 
               check (event_type in (''delivered'',''open'',''click'',''bounce'',''spam'',''unsubscribe'',''complaint''))';
    end if;
  end if;
end $$;

-- =====================================================
-- C) Tag send_logs with terminal delivery state
-- =====================================================
alter table public.send_logs
  add column if not exists delivery_state text
    check (delivery_state in ('unknown','delivered','bounced','complaint')) default 'unknown',
  add column if not exists delivery_meta jsonb default '{}'::jsonb;

create index if not exists idx_send_logs_state on public.send_logs(delivery_state);

-- =====================================================
-- D) Domain health rollups
-- =====================================================
create table if not exists public.domain_health_daily (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  account_id uuid references public.connected_accounts(id) on delete cascade,
  domain text not null,
  sent int not null default 0,
  bounces int not null default 0,
  complaints int not null default 0,
  opens int not null default 0,
  clicks int not null default 0,
  unique (day, account_id, domain)
);

create index if not exists idx_dhd_day_account on public.domain_health_daily(day, account_id);

-- =====================================================
-- E) Quick views
-- =====================================================
create or replace view public.v_mailbox_health as
select
  ca.id as account_id,
  coalesce(ca.from_email, ca.email_address, ca.email, ca.account_email, '') as from_email,
  date_trunc('day', sl.created_at)::date as day,
  count(*) filter (where sl.status='sent') as sent,
  count(*) filter (where sl.delivery_state='bounced') as bounces,
  count(*) filter (where sl.delivery_state='complaint') as complaints
from public.connected_accounts ca
left join public.send_logs sl on sl.account_id = ca.id
group by 1,2,3;

-- =====================================================
-- F) Helper to suppress a lead + cancel future sends
-- =====================================================
create or replace function public.suppress_lead(p_lead uuid, p_reason text)
returns void language plpgsql security definer as $$
begin
  update public.leads
     set suppressed = true,
         suppressed_reason = left(p_reason, 200),
         suppressed_at = now()
   where id = p_lead;

  -- Optional: cancel any pending queue globally for this lead
  update public.send_queue
     set status = 'canceled', last_error = 'suppressed'
   where lead_id = p_lead and status in ('queued','dispatched');
end $$;

grant execute on function public.suppress_lead(uuid, text) to service_role, authenticated;

