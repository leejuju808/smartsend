-- Inbox draft send RPCs and helpers

-- Ensure normalized_messages has required columns for outbound sends
alter table public.normalized_messages
  add column if not exists body text,
  add column if not exists sender_email text,
  add column if not exists recipient_email text,
  add column if not exists meta jsonb default '{}'::jsonb;

alter table public.normalized_messages
  alter column meta set default '{}'::jsonb;


-- Primary RPC: send a specific draft now (records outbound + clears needs_reply)
create or replace function public.send_draft_now(p_draft uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
  v_campaign uuid;
  v_lead uuid;
  v_subject text;
  v_body text;
  v_lead_email text;
  v_from_email text;
  v_provider text;
  v_provider_thread_id text;
  v_account uuid;
  v_msg uuid;
  v_provider_message_id text;
begin
  -- Load draft + associated thread context
  select d.thread_id,
         d.campaign_id,
         d.lead_id,
         d.subject,
         d.body,
         t.provider,
         t.provider_thread_id,
         t.account_id
    into v_thread,
         v_campaign,
         v_lead,
         v_subject,
         v_body,
         v_provider,
         v_provider_thread_id,
         v_account
    from public.drafts d
    join public.inbox_threads t on t.id = d.thread_id
   where d.id = p_draft;

  if v_thread is null then
    raise exception 'Draft not found';
  end if;

  -- Authorization: only campaign editors can send
  if not public.is_campaign_editor(v_campaign) then
    raise exception 'Not authorized';
  end if;

  -- Resolve recipient email (best-effort)
  select email
    into v_lead_email
    from public.leads
   where id = v_lead;

  -- Resolve sender email from connected account metadata (best-effort)
  select ca.account_email
    into v_from_email
    from public.connected_accounts ca
   where ca.id = v_account;

  -- Generate a temporary provider message id so future jobs can reconcile
  v_provider_message_id := 'draft-' || replace(gen_random_uuid()::text, '-', '');

  -- Record outbound message in normalized_messages
  insert into public.normalized_messages (
    linked_thread_id,
    direction,
    ai_label,
    subject,
    body,
    sent_at,
    sender_email,
    recipient_email,
    meta,
    provider,
    provider_message_id,
    provider_thread_id
  ) values (
    v_thread,
    'outbound',
    null,
    v_subject,
    v_body,
    now(),
    v_from_email,
    v_lead_email,
    jsonb_build_object('source', 'send_draft_now', 'draft_id', p_draft),
    v_provider,
    v_provider_message_id,
    v_provider_thread_id
  )
  returning id into v_msg;

  -- Remove the draft once recorded (optional cleanup)
  delete from public.drafts where id = p_draft;

  -- Clear needs_reply on the thread
  update public.inbox_threads
     set needs_reply = false,
         updated_at = now()
   where id = v_thread;

  return v_msg;
end;
$$;

revoke all on function public.send_draft_now(uuid) from public;
grant execute on function public.send_draft_now(uuid) to authenticated;
grant execute on function public.send_draft_now(uuid) to service_role;


-- Convenience RPC: send the latest draft for a thread
create or replace function public.send_latest_draft_for_thread(p_thread uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_draft uuid;
begin
  select id
    into v_draft
    from public.drafts
   where thread_id = p_thread
   order by created_at desc
   limit 1;

  if v_draft is null then
    raise exception 'No draft found for this thread';
  end if;

  return public.send_draft_now(v_draft);
end;
$$;

revoke all on function public.send_latest_draft_for_thread(uuid) from public;
grant execute on function public.send_latest_draft_for_thread(uuid) to authenticated;
grant execute on function public.send_latest_draft_for_thread(uuid) to service_role;
