-- Idempotency, reply linkage, helpers (idempotent)
-- A) Idempotency: ensure a unique key for inbound provider messages

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'uq_inbox_messages_in_provider_mid'
  ) then
    alter table public.inbox_messages
      add constraint uq_inbox_messages_in_provider_mid
      unique (provider, provider_message_id)
      deferrable initially immediate;
  end if;
end $$;

-- Optional: enforce only for inbound rows
-- (If you want it *only* for inbound, use a partial unique index instead)
drop index if exists uq_inbox_messages_in_provider_mid_partial;
create unique index if not exists uq_inbox_messages_in_provider_mid_partial
  on public.inbox_messages(provider, provider_message_id)
  where direction = 'in' and provider is not null and provider_message_id is not null;

-- B) Quick index for clientState checks (Outlook) and mapping
drop index if exists idx_threads_campaign_lead;
create index if not exists idx_threads_campaign_lead
  on public.inbox_threads(campaign_id, lead_id);

-- C) send_logs: add reply_at to link a reply to the specific outbound
alter table public.send_logs
  add column if not exists reply_at timestamptz;

-- D) Helper: link thread reply to last outbound send in that thread (within N days)
create or replace function public.link_reply_to_last_send(
  p_thread uuid,
  p_at timestamptz default now(),
  p_window interval default interval '14 days'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_send uuid;
begin
  select l.id
    into v_send
  from public.send_logs l
  where l.thread_id = p_thread
    and l.created_at >= (p_at - p_window)
  order by l.created_at desc
  limit 1;

  if v_send is not null then
    update public.send_logs
       set reply_at = coalesce(reply_at, p_at)
     where id = v_send;
  end if;

  return v_send;
end;
$$;

-- E) Combined helper: mark thread replied, cancel future queue, and link last send
create or replace function public.mark_thread_replied_and_link(
  p_thread uuid,
  p_at timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_send uuid;
begin
  -- mark thread + cancel
  perform public.mark_thread_replied(p_thread := p_thread, p_at := p_at);

  -- link reply to last outbound
  v_send := public.link_reply_to_last_send(p_thread := p_thread, p_at := p_at);

  return v_send;
end;
$$;

-- Grant execute permissions
grant execute on function public.link_reply_to_last_send(uuid, timestamptz, interval) to service_role;
grant execute on function public.mark_thread_replied_and_link(uuid, timestamptz) to service_role;

