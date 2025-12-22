-- Ensure columns exist
alter table if exists public.leads
  add column if not exists replied_at timestamptz;

alter table if exists public.campaign_logs
  add column if not exists thread_id text,
  add column if not exists last_incoming_at timestamptz;

-- Event stream table (append-only)
create table if not exists public.campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid,
  lead_id uuid,
  log_id uuid,
  event_type text not null, -- 'inbound_email','retry_queued','sent','opened','clicked','replied', etc.
  meta jsonb,
  external_message_id text,
  thread_id text,
  from_email text,
  created_at timestamptz not null default now()
);

-- Fast idempotency lookups on external message id
create unique index if not exists uq_campaign_events_message_id
  on public.campaign_events (external_message_id)
  where external_message_id is not null;

-- Mark replied RPC (atomic update + event + log flip)
create or replace function public.mark_lead_replied_rpc(
  p_lead_id uuid,
  p_campaign_id uuid,
  p_thread_id text,
  p_message_id text,
  p_subject text,
  p_received_at timestamptz
) returns void
language plpgsql
security definer
as $$
declare
  v_log_id uuid;
begin
  -- 1) bump lead
  update public.leads
  set status = 'replied',
      replied_at = coalesce(p_received_at, now()),
      updated_at = now()
  where id = p_lead_id;

  -- 2) flip latest relevant log to replied if exists
  select id into v_log_id
  from public.campaign_logs
  where lead_id = p_lead_id
    and campaign_id = p_campaign_id
  order by created_at desc
  limit 1;

  if v_log_id is not null then
    update public.campaign_logs
    set status = 'replied',
        thread_id = coalesce(p_thread_id, thread_id),
        updated_at = now(),
        last_incoming_at = coalesce(p_received_at, now())
    where id = v_log_id;
  end if;

  -- 3) append event (idempotency guaranteed earlier by unique index)
  insert into public.campaign_events (
    campaign_id, lead_id, log_id, event_type, meta,
    external_message_id, thread_id, created_at
  ) values (
    p_campaign_id, p_lead_id, v_log_id, 'replied',
    jsonb_build_object('subject', p_subject),
    p_message_id, p_thread_id, coalesce(p_received_at, now())
  ) on conflict (external_message_id) do nothing;
end;
$$;

-- Permissions (service role runs this)
revoke all on function public.mark_lead_replied_rpc(uuid,uuid,text,text,text,timestamptz) from public;
grant execute on function public.mark_lead_replied_rpc(uuid,uuid,text,text,text,timestamptz) to service_role;