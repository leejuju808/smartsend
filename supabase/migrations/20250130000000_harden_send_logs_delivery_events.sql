-- Hardening send_logs / delivery_events
-- Run in Supabase SQL editor

-- A1) Updated-at trigger for send_logs
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end$$;

-- Ensure send_logs has updated_at column
alter table public.send_logs
  add column if not exists updated_at timestamptz default now();

drop trigger if exists tg_send_logs_touch on public.send_logs;
create trigger tg_send_logs_touch
before update on public.send_logs
for each row execute function public.tg_touch_updated_at();

-- A2) Helpful partial indexes
create index if not exists idx_send_logs_status_sending on public.send_logs(status) 
  where status in ('queued','sending');

create index if not exists idx_delivery_events_campaign_kind_day on public.delivery_events(campaign_id, event, created_at);

-- Ensure delivery_events has required columns
alter table public.delivery_events
  add column if not exists log_id uuid references public.send_logs(id) on delete set null,
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists kind text, -- alias for 'event' column
  add column if not exists meta jsonb default '{}'::jsonb;

-- If 'event' column exists, create kind as alias (or use kind if it's the primary)
do $$
begin
  if exists (select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'delivery_events' and column_name = 'event') then
    -- Create kind column that mirrors event
    update public.delivery_events set kind = event where kind is null;
  end if;
end $$;

-- A3) Idempotency: prevent duplicate events from providers
alter table public.delivery_events
  add column if not exists event_key text generated always as (
    md5(
      coalesce(provider,'') || '|' ||
      coalesce(provider_message_id,'') || '|' ||
      coalesce(kind, event, '') || '|' ||
      to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || '|' ||
      coalesce((meta->>'event_id')::text,'')
    )
  ) stored;

create unique index if not exists ux_delivery_events_event_key on public.delivery_events(event_key);

-- A4) Basic lead engagement timestamps for lightweight UX
alter table public.leads
  add column if not exists last_delivered_at timestamptz,
  add column if not exists last_open_at timestamptz,
  add column if not exists last_click_at timestamptz,
  add column if not exists last_bounce_at timestamptz;

-- A5) Suppression table + RPC (used by webhook)
-- Update existing suppressions table if needed
alter table public.suppressions
  add column if not exists reason text check (reason in ('unsubscribe','bounce','manual','spam')),
  add column if not exists meta jsonb default '{}'::jsonb;

-- If email is not unique, make it unique
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'suppressions_email_key' 
    and conrelid = 'public.suppressions'::regclass
  ) then
    create unique index if not exists ux_suppressions_email on public.suppressions(email);
  end if;
end $$;

-- Update suppressions schema to match requirements (email unique, not per-user)
create or replace function public.suppress_email(p_email citext, p_reason text, p_meta jsonb default '{}'::jsonb)
returns void language plpgsql security definer as $$
begin
  insert into public.suppressions(email, reason, meta)
  values (lower(p_email), p_reason, coalesce(p_meta,'{}'::jsonb))
  on conflict (email) do update
    set reason = excluded.reason,
        meta = public.suppressions.meta || excluded.meta,
        created_at = now();
end$$;

-- Grant execute to service role and authenticated
grant execute on function public.suppress_email to service_role, authenticated;

-- E) RLS tightening (optional multi-tenant; replace with your tenant checks)
-- Example helpers:
create or replace function public.owns_campaign(p_campaign uuid) returns boolean
language sql stable as $$
  select exists(
    select 1 from public.campaigns c
    where c.id = p_campaign and c.user_id = auth.uid()
  );
$$;

-- Drop existing policies if they exist
drop policy if exists sel_logs on public.send_logs;
drop policy if exists sel_events on public.delivery_events;

-- Create new RLS policies
create policy sel_logs on public.send_logs
for select to authenticated
using (public.owns_campaign(campaign_id));

create policy sel_events on public.delivery_events
for select to authenticated
using (public.owns_campaign(campaign_id));

-- Allow service role to insert/update
drop policy if exists send_logs_insert_service on public.send_logs;
create policy send_logs_insert_service on public.send_logs
for insert to service_role
with check (true);

drop policy if exists delivery_events_insert_service on public.delivery_events;
create policy delivery_events_insert_service on public.delivery_events
for insert to service_role
with check (true);

-- Helper: cancel future queue by (thread) or by (lead+campaign) if thread missing
create or replace function public.cancel_future_queue_for_log(p_log uuid)
returns int
language plpgsql security definer set search_path=public as $$
declare
  v_thread uuid;
  v_lead uuid;
  v_campaign uuid;
  v_count int := 0;
begin
  select l.thread_id, l.lead_id, l.campaign_id into v_thread, v_lead, v_campaign
  from public.send_logs l where l.id = p_log;

  if v_thread is not null then
    -- If you already have cancel_future_queue_for_thread(thread_id), call it:
    begin
      v_count := public.cancel_future_queue_for_thread(v_thread);
    exception when undefined_function then
      -- fallback: cancel by thread directly
      update public.send_queue
      set status='canceled', updated_at=now(), error=coalesce(error,'')||'; auto-canceled due to hard event'
      where thread_id = v_thread::text and status in ('queued','scheduled','retrying');
      get diagnostics v_count = row_count;
    end;
  else
    -- Fallback: cancel by (lead, campaign)
    update public.send_queue
    set status='canceled', updated_at=now(), error=coalesce(error,'')||'; auto-canceled due to hard event'
    where lead_id = v_lead and campaign_id = v_campaign and status in ('queued','scheduled','retrying');
    get diagnostics v_count = row_count;
  end if;

  return v_count;
end$$;

grant execute on function public.cancel_future_queue_for_log to service_role;

-- Trigger: on insert delivery_events -> suppress + cancel on hard kinds
create or replace function public.tg_delivery_event_sidefx()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_email citext;
  v_lead_email citext;
begin
  -- Normalize kind from event if needed
  if new.kind is null and new.event is not null then
    new.kind := new.event;
  end if;

  -- Update lead engagement timestamps
  if new.kind = 'delivered' or new.event = 'delivered' then
    update public.leads set last_delivered_at = coalesce(last_delivered_at, new.created_at)
    where id = new.lead_id;
  elsif new.kind = 'open' or new.event = 'opened' then
    update public.leads set last_open_at = new.created_at where id = new.lead_id;
  elsif new.kind = 'click' or new.kind = 'clicked' or new.event = 'clicked' then
    update public.leads set last_click_at = new.created_at where id = new.lead_id;
  elsif new.kind = 'bounce' or new.event = 'bounce' then
    update public.leads set last_bounce_at = new.created_at where id = new.lead_id;
  end if;

  -- Hard-stop kinds: bounce/spam/unsubscribe
  if (new.kind in ('bounce','spam','unsubscribe') or new.event in ('bounce','spam','unsubscribe')) then
    -- suppression
    select email into v_lead_email from public.leads where id=new.lead_id;
    if v_lead_email is not null then
      perform public.suppress_email(
        v_lead_email, 
        case 
          when new.kind = 'bounce' or new.event = 'bounce' then 'bounce'
          when new.kind = 'spam' or new.event = 'spam' then 'spam'
          else 'unsubscribe' 
        end,
        jsonb_build_object('campaign_id', new.campaign_id, 'via','delivery_event')
      );
    end if;

    -- cancel future queue for this thread/lead
    if new.log_id is not null then
      perform public.cancel_future_queue_for_log(new.log_id);
    end if;
  end if;

  return new;
end$$;

drop trigger if exists tg_delivery_event_sidefx on public.delivery_events;
create trigger tg_delivery_event_sidefx
after insert on public.delivery_events
for each row execute function public.tg_delivery_event_sidefx();



