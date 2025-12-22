-- Provider Event Logs System
-- Event tables + rollups for webhook ingestion (idempotent)

-- A) Base provider event log
create table if not exists public.provider_event_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  provider text not null check (provider in ('gmail','outlook','generic')),
  event_type text not null check (event_type in ('delivered','bounce','complaint','deferred','opened','clicked','other')),
  message_id text,                     -- provider message id/thread id if available
  queue_id uuid references public.send_queue(id) on delete set null,
  account_id uuid,                     -- references auth.users(id) or connected_accounts(id) depending on schema
  campaign_id uuid references public.campaigns(id) on delete set null,
  recipient_email text,
  payload jsonb not null default '{}'::jsonb,
  reason text,
  code text
);

create index if not exists idx_pelog_msg on public.provider_event_logs (message_id);
create index if not exists idx_pelog_qid on public.provider_event_logs (queue_id);
create index if not exists idx_pelog_account on public.provider_event_logs (account_id);
create index if not exists idx_pelog_campaign on public.provider_event_logs (campaign_id);
create index if not exists idx_pelog_created on public.provider_event_logs (created_at desc);

-- B) Focused materialized view for quick stats (optional)
create materialized view if not exists public.mv_campaign_delivery_stats as
select
  q.campaign_id,
  count(*) filter (where q.status = 'sent') as sent,
  count(*) filter (where q.status = 'dead_letter') as dead,
  count(*) filter (where l.event_type = 'bounce') as bounces,
  count(*) filter (where l.event_type = 'complaint') as complaints
from public.send_queue q
left join public.provider_event_logs l on l.queue_id = q.id
group by 1;

create unique index if not exists idx_mv_campaign_delivery_stats_campaign on public.mv_campaign_delivery_stats (campaign_id);

-- C) Helper to refresh (call from cron/UI)
create or replace function public.refresh_delivery_stats()
returns void language sql as $$ 
  refresh materialized view concurrently public.mv_campaign_delivery_stats; 
$$;

-- D) Practical indexes for suppression checks
alter table public.send_queue add column if not exists provider_message_id text;
create index if not exists idx_send_queue_message_id on public.send_queue (provider_message_id);

-- E) Ensure normalize_email function exists
create or replace function public.normalize_email(txt text)
returns text language sql immutable as $$
  select case
    when txt is null then null
    else lower(trim(txt))
  end
$$;

-- F) RPC function to ingest provider events with side effects
create or replace function public.ingest_provider_event(
  p_provider text,
  p_event_type text,
  p_message_id text,
  p_queue_id uuid,
  p_account_id uuid,
  p_campaign_id uuid,
  p_recipient text,
  p_code text,
  p_reason text,
  p_payload jsonb
) returns void
language plpgsql
security definer
as $$
declare
  v_normal_email text := public.normalize_email(p_recipient);
  v_row public.send_queue%rowtype;
  v_found boolean := false;
begin
  -- 1) Persist raw event
  insert into public.provider_event_logs(
    provider, event_type, message_id, queue_id, account_id, campaign_id, 
    recipient_email, payload, reason, code
  )
  values (
    p_provider, p_event_type, p_message_id, p_queue_id, p_account_id, p_campaign_id, 
    v_normal_email, coalesce(p_payload,'{}'::jsonb), p_reason, p_code
  );

  -- 2) Try to resolve queue row (by id first, fallback by message_id)
  if p_queue_id is not null then
    select * into v_row from public.send_queue where id = p_queue_id limit 1;
    v_found := found;
  end if;

  if not v_found and p_message_id is not null then
    select * into v_row from public.send_queue where provider_message_id = p_message_id limit 1;
    v_found := found;
  end if;

  -- 3) Event-driven actions
  if p_event_type = 'delivered' then
    if v_found then
      update public.send_queue 
      set status = 'sent' 
      where id = v_row.id and status <> 'sent';
    end if;

  elsif p_event_type = 'bounce' then
    if v_found then
      update public.send_queue
      set status = 'dead_letter',
          last_error = coalesce('bounce:'||coalesce(p_code,'')||' '||coalesce(p_reason,''),'bounce'),
          attempt_count = coalesce(v_row.attempt_count, 0) + 1
      where id = v_row.id;
      -- Auto-suppress (Block 117)
      if v_row.account_id is not null and v_normal_email is not null then
        perform public.suppress_email(
          v_row.account_id, 
          v_normal_email, 
          'invalid_recipient', 
          'account', 
          null, 
          'provider', 
          'Auto from webhook'
        );
      end if;
    else
      -- No queue row: still suppress at account scope if known
      if p_account_id is not null and v_normal_email is not null then
        perform public.suppress_email(
          p_account_id, 
          v_normal_email, 
          'invalid_recipient', 
          'account', 
          null, 
          'provider', 
          'Auto from webhook (no queue match)'
        );
      end if;
    end if;

  elsif p_event_type = 'complaint' then
    if v_found then
      update public.send_queue
      set status = 'dead_letter',
          last_error = 'complaint:'||coalesce(p_reason,''),
          attempt_count = coalesce(v_row.attempt_count, 0) + 1
      where id = v_row.id;
      if v_row.account_id is not null and v_normal_email is not null then
        perform public.suppress_email(
          v_row.account_id, 
          v_normal_email, 
          'complaint', 
          'account', 
          null, 
          'provider', 
          'Complaint via webhook'
        );
      end if;
    else
      if p_account_id is not null and v_normal_email is not null then
        perform public.suppress_email(
          p_account_id, 
          v_normal_email, 
          'complaint', 
          'account', 
          null, 
          'provider', 
          'Complaint via webhook'
        );
      end if;
    end if;

  elsif p_event_type = 'deferred' then
    if v_found then
      update public.send_queue
      set status = 'retry_scheduled',
          last_error = 'deferred:'||coalesce(p_reason,''),
          next_attempt_at = now() + interval '10 minutes'
      where id = v_row.id and status <> 'sent';
    end if;
  end if;
end;
$$;

grant execute on function public.ingest_provider_event(text, text, text, uuid, uuid, uuid, text, text, text, jsonb) to service_role, authenticated;
grant select on public.provider_event_logs to authenticated;
grant select on public.mv_campaign_delivery_stats to authenticated;

