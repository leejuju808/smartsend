-- Provider linkage + inbound upsert helper

-- Ensure provider linkage columns exist on threads/messages -------------------
alter table public.inbox_threads
  add column if not exists provider text,
  add column if not exists provider_thread_id text;

alter table public.inbox_messages
  add column if not exists provider text,
  add column if not exists provider_message_id text;

-- Refresh supporting indexes (provider scoped keys) ---------------------------
drop index if exists idx_threads_provider;
create index if not exists idx_threads_provider_key on public.inbox_threads(provider, provider_thread_id);

drop index if exists idx_msgs_provider;
create index if not exists idx_msgs_provider_key on public.inbox_messages(provider, provider_message_id);

-- Idempotent inbound upsert ---------------------------------------------------
create or replace function public.upsert_inbound_message(
  p_provider text,
  p_provider_thread_id text,
  p_provider_message_id text,
  p_campaign uuid,
  p_lead uuid,
  p_subject text,
  p_snippet text,
  p_body_html text,
  p_created_at timestamptz default now(),
  p_ai_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
  v_msg uuid;
begin
  -- Resolve or create thread using provider key when available
  select id
    into v_thread
  from public.inbox_threads
  where campaign_id = p_campaign
    and lead_id = p_lead
    and provider = p_provider
    and provider_thread_id = p_provider_thread_id
  limit 1;

  if v_thread is null then
    insert into public.inbox_threads (campaign_id, lead_id, provider, provider_thread_id, updated_at)
    values (p_campaign, p_lead, p_provider, p_provider_thread_id, p_created_at)
    returning id into v_thread;
  else
    update public.inbox_threads
      set updated_at = p_created_at
    where id = v_thread;
  end if;

  -- Deduplicate by provider message id when present
  if p_provider_message_id is not null then
    select id
      into v_msg
    from public.inbox_messages
    where provider = p_provider
      and provider_message_id = p_provider_message_id
    limit 1;

    if v_msg is not null then
      return v_msg;
    end if;
  end if;

  insert into public.inbox_messages (
    thread_id,
    direction,
    subject,
    snippet,
    body_html,
    created_at,
    provider,
    provider_message_id,
    ai_label
  ) values (
    v_thread,
    'inbound',
    p_subject,
    p_snippet,
    p_body_html,
    p_created_at,
    p_provider,
    p_provider_message_id,
    p_ai_label
  )
  returning id into v_msg;

  -- Auto mark replied and cancel future sends
  perform public.mark_replied_and_stop(v_thread);

  return v_msg;
end;
$$;

grant execute on function public.upsert_inbound_message(
  text,
  text,
  text,
  uuid,
  uuid,
  text,
  text,
  text,
  timestamptz,
  text
) to service_role;











