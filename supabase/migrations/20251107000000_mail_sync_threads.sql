-- Connected account cursors for Gmail/Outlook sync
alter table public.connected_accounts
  add column if not exists last_gmail_history_id text,
  add column if not exists outlook_delta_url text,
  add column if not exists last_sync_at timestamptz;

-- Provider mapping on inbox threads
alter table public.inbox_threads
  add column if not exists provider text,
  add column if not exists provider_thread_id text,
  add constraint uq_thread_provider unique (provider, provider_thread_id);

create index if not exists idx_threads_provider on public.inbox_threads(provider, provider_thread_id);

-- Helper function to find or create threads by provider thread/conversation id
create or replace function public.find_or_create_thread(
  p_provider text,
  p_provider_thread_id text,
  p_account uuid,
  p_campaign uuid,
  p_lead uuid
) returns uuid
language plpgsql
security definer
set search_path = public as $$
declare
  v_id uuid;
begin
  select id
    into v_id
    from public.inbox_threads
   where provider = p_provider
     and provider_thread_id = p_provider_thread_id
   limit 1;

  if v_id is null then
    insert into public.inbox_threads (provider, provider_thread_id, account_id, campaign_id, lead_id, needs_reply)
    values (p_provider, p_provider_thread_id, p_account, p_campaign, p_lead, true)
    returning id into v_id;
  else
    update public.inbox_threads
       set account_id = coalesce(account_id, p_account),
           campaign_id = coalesce(campaign_id, p_campaign),
           lead_id     = coalesce(lead_id, p_lead)
     where id = v_id;
  end if;

  return v_id;
end
$$;

revoke all on function public.find_or_create_thread(text, text, uuid, uuid, uuid) from public;
grant execute on function public.find_or_create_thread(text, text, uuid, uuid, uuid) to authenticated;


