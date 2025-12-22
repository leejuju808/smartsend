-- =============================================================
-- Inbox ingest helpers: idempotent inbound upsert + auto-actions
-- =============================================================

-- A) Minimal safety: ensure ai_label column exists on inbox_messages
alter table if exists public.inbox_messages
  add column if not exists ai_label text;

-- Helpful index for provider message idempotency
create index if not exists idx_inbox_msg_provider_mid
  on public.inbox_messages(provider, provider_message_id);

-- B) Helper: mark thread replied + pause campaign lead
create or replace function public.fn_mark_thread_replied(
  p_thread uuid,
  p_when timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
  v_lead uuid;
begin
  select campaign_id, lead_id
    into v_campaign, v_lead
  from public.inbox_threads
  where id = p_thread;

  if v_campaign is null then
    raise exception 'Thread % not found', p_thread;
  end if;

  update public.inbox_threads
     set replied_at = coalesce(replied_at, p_when)
   where id = p_thread;

  update public.campaign_leads
     set status = 'replied'
   where campaign_id = v_campaign
     and lead_id = v_lead
     and status <> 'replied';
end;
$$;

revoke all on function public.fn_mark_thread_replied(uuid, timestamptz) from public;
grant execute on function public.fn_mark_thread_replied(uuid, timestamptz) to service_role;

-- C) Helper: autopause queue for (campaign, lead)
create or replace function public.fn_autopause_lead(
  p_campaign uuid,
  p_lead uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.send_queue
     set status = 'failed',
         last_error = 'autopaused by reply/bounce',
         updated_at = now()
   where campaign_id = p_campaign
     and lead_id = p_lead
     and status in ('queued', 'sending');
end;
$$;

revoke all on function public.fn_autopause_lead(uuid, uuid) from public;
grant execute on function public.fn_autopause_lead(uuid, uuid) to service_role;

-- D) Upsert inbound message (idempotent on provider_message_id)
create or replace function public.upsert_inbound_message(
  p_provider text,
  p_provider_message_id text,
  p_thread uuid,
  p_campaign uuid,
  p_lead uuid,
  p_subject text,
  p_body_html text,
  p_body_plain text,
  p_from_email text,
  p_to_email text,
  p_received_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_created_at timestamptz := coalesce(p_received_at, now());
begin
  insert into public.inbox_messages as m (
    thread_id,
    campaign_id,
    lead_id,
    direction,
    subject,
    body_html,
    body_text,
    body_plain,
    from_email,
    to_email,
    provider,
    provider_message_id,
    created_at
  )
  values (
    p_thread,
    p_campaign,
    p_lead,
    'in',
    p_subject,
    p_body_html,
    p_body_plain,
    p_body_plain,
    p_from_email,
    p_to_email,
    p_provider,
    p_provider_message_id,
    v_created_at
  )
  on conflict (provider, provider_message_id) do update
    set subject = excluded.subject,
        body_html = excluded.body_html,
        body_text = excluded.body_text,
        body_plain = excluded.body_plain
  returning id into v_id;

  update public.inbox_threads
     set updated_at = now()
   where id = p_thread;

  return v_id;
end;
$$;

revoke all on function public.upsert_inbound_message(
  text,
  text,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) from public;

grant execute on function public.upsert_inbound_message(
  text,
  text,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  timestamptz
) to service_role;




