-- Inbox reply metadata + RPC helper

-- A) Outbound/provider metadata on messages
alter table public.inbox_messages
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists internet_message_id text,
  add column if not exists in_reply_to text,
  add column if not exists "references" text;

create index if not exists idx_msg_thread_created on public.inbox_messages(thread_id, created_at desc);

-- B) Thread conveniences for reply threading (store last known ids)
alter table public.inbox_threads
  add column if not exists last_provider_message_id text,
  add column if not exists last_inbound_message_id text;

-- C) Ensure send_logs can store provider ids
alter table public.send_logs
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists provider_thread_id text,
  add column if not exists subject_snapshot text;

create index if not exists idx_logs_provider on public.send_logs(provider, provider_message_id);

-- D) RPC: create outbound message + log (called by edge after successful send)
create or replace function public._inbox_write_outbound(
  p_thread uuid,
  p_lead uuid,
  p_campaign uuid,
  p_account uuid,
  p_provider text,
  p_provider_message_id text,
  p_provider_thread_id text,
  p_subject text,
  p_body_html text,
  p_in_reply_to text,
  p_references text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- message row
  insert into public.inbox_messages (
    thread_id, direction, subject, body_html,
    provider, provider_message_id, in_reply_to, "references"
  ) values (
    p_thread, 'outbound', p_subject, p_body_html,
    p_provider, p_provider_message_id, p_in_reply_to, p_references
  );

  -- send_log row
  insert into public.send_logs (
    campaign_id, account_id, thread_id, lead_id,
    provider, provider_message_id, provider_thread_id,
    subject_snapshot, status
  ) values (
    p_campaign, p_account, p_thread, p_lead,
    p_provider, p_provider_message_id, p_provider_thread_id,
    p_subject, 'sent'
  );

  -- thread touches
  update public.inbox_threads
     set updated_at = now(),
         provider = coalesce(provider, p_provider),
         provider_thread_id = coalesce(provider_thread_id, p_provider_thread_id),
         last_provider_message_id = p_provider_message_id
   where id = p_thread;
end;
$$;

revoke all on function public._inbox_write_outbound(uuid, uuid, uuid, uuid, text, text, text, text, text, text, text) from anon, authenticated;











