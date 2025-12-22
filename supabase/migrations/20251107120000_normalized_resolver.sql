set check_function_bodies = off;
set search_path = public;

-- A) Helpful indexes (idempotent)
create index if not exists idx_sendlogs_provider on public.send_logs(provider, provider_message_id, provider_thread_id);
create index if not exists idx_sendlogs_toemail_time on public.send_logs(to_email, created_at desc);
create index if not exists idx_threads_campaign_lead on public.inbox_threads(campaign_id, lead_id);
create index if not exists idx_nm_link_status on public.normalized_messages(link_status, sent_at desc);

-- B) Resolve by provider thread
create or replace function public.resolve_by_provider_thread(
  p_provider text,
  p_provider_thread_id text
)
returns table(campaign_id uuid, lead_id uuid, thread_id uuid)
language sql
stable
set search_path = public
as $$
  with sl as (
    select s.campaign_id, s.lead_id
    from public.send_logs s
    where s.provider = p_provider
      and s.provider_thread_id = p_provider_thread_id
    order by s.created_at desc
    limit 1
  )
  select t.campaign_id, t.lead_id, t.id as thread_id
  from public.inbox_threads t
  join sl on sl.campaign_id = t.campaign_id and sl.lead_id = t.lead_id
  limit 1
$$;

-- C) Resolve by recent send
create or replace function public.resolve_by_recent_send(
  p_from_email citext,
  p_sent_at timestamptz
)
returns table(campaign_id uuid, lead_id uuid, thread_id uuid)
language sql
stable
set search_path = public
as $$
  with last_send as (
    select s.campaign_id, s.lead_id
    from public.send_logs s
    where s.to_email = p_from_email
      and s.created_at >= (p_sent_at - interval '14 days')
      and s.created_at <= (p_sent_at + interval '1 day')
    order by s.created_at desc
    limit 1
  )
  select t.campaign_id, t.lead_id, t.id
  from public.inbox_threads t
  join last_send ls on ls.campaign_id = t.campaign_id and ls.lead_id = t.lead_id
  limit 1
$$;

-- D) Resolve by unique lead email
create or replace function public.resolve_by_lead_email_unique(
  p_from_email citext
)
returns table(campaign_id uuid, lead_id uuid)
language sql
stable
set search_path = public
as $$
  with hits as (
    select l.id as lead_id, l.campaign_id
    from public.leads l
    where l.email = p_from_email
  )
  select h.campaign_id, h.lead_id
  from hits h
  where (select count(*) from hits) = 1
$$;

-- E) Upsert inbox thread
create or replace function public.upsert_inbox_thread(
  p_campaign uuid,
  p_lead uuid,
  p_provider text,
  p_provider_thread_id text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
begin
  select id
    into v_thread
  from public.inbox_threads
  where campaign_id = p_campaign
    and lead_id = p_lead
    and (provider_thread_id = p_provider_thread_id or p_provider_thread_id is null)
  order by updated_at desc
  limit 1;

  if v_thread is null then
    insert into public.inbox_threads (campaign_id, lead_id, provider, provider_thread_id, updated_at)
    values (p_campaign, p_lead, p_provider, p_provider_thread_id, now())
    returning id into v_thread;
  end if;

  return v_thread;
end;
$$;

-- F) Resolve normalized message
create or replace function public.resolve_normalized_message(p_nm uuid)
returns table(ok boolean, thread_id uuid, campaign_id uuid, lead_id uuid, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  m record;
  t uuid;
  cid uuid;
  lid uuid;
begin
  select * into m from public.normalized_messages where id = p_nm;
  if not found then
    return query select false, null::uuid, null::uuid, null::uuid, 'not_found';
    return;
  end if;

  if m.link_status in ('linked', 'skipped') then
    return query select true, m.linked_thread_id, null::uuid, null::uuid, 'already_linked';
    return;
  end if;

  if m.provider_thread_id is not null then
    select * into r from public.resolve_by_provider_thread(m.provider, m.provider_thread_id);
    if found then
      cid := r.campaign_id;
      lid := r.lead_id;
      t := public.upsert_inbox_thread(cid, lid, m.provider, m.provider_thread_id);
      update public.normalized_messages
        set linked_thread_id = t, link_status = 'linked', link_error = null
      where id = m.id;
      return query select true, t, cid, lid, 'provider_thread';
      return;
    end if;
  end if;

  if m.from_email is not null and m.sent_at is not null then
    select * into r from public.resolve_by_recent_send(m.from_email, m.sent_at);
    if found then
      cid := r.campaign_id;
      lid := r.lead_id;
      t := public.upsert_inbox_thread(cid, lid, m.provider, m.provider_thread_id);
      update public.normalized_messages
        set linked_thread_id = t, link_status = 'linked', link_error = null
      where id = m.id;
      return query select true, t, cid, lid, 'recent_send';
      return;
    end if;
  end if;

  if m.from_email is not null then
    select * into r from public.resolve_by_lead_email_unique(m.from_email);
    if found then
      cid := r.campaign_id;
      lid := r.lead_id;
      t := public.upsert_inbox_thread(cid, lid, m.provider, m.provider_thread_id);
      update public.normalized_messages
        set linked_thread_id = t, link_status = 'linked', link_error = null
      where id = m.id;
      return query select true, t, cid, lid, 'unique_lead';
      return;
    end if;
  end if;

  update public.normalized_messages
    set link_status = 'unlinked', link_error = coalesce(link_error, 'no_match')
  where id = m.id;

  return query select false, null::uuid, null::uuid, null::uuid, 'no_match';
end;
$$;

revoke all on function public.resolve_normalized_message(uuid) from public;
grant execute on function public.resolve_normalized_message(uuid) to authenticated;

-- Inbox feed view
create or replace view public.v_inbox_feed as
select
  t.campaign_id,
  t.lead_id,
  t.id as thread_id,
  m.id as message_id,
  m.created_at as created_at,
  m.direction,
  m.provider,
  m.provider_message_id,
  m.subject,
  coalesce(m.snippet, m.body_text, m.body_html) as preview
from public.inbox_threads t
join public.inbox_messages m on m.thread_id = t.id

union all

select
  t.campaign_id,
  t.lead_id,
  nm.linked_thread_id as thread_id,
  nm.id as message_id,
  coalesce(nm.sent_at, nm.created_at) as created_at,
  nm.direction,
  nm.provider,
  nm.provider_message_id,
  nm.subject,
  nm.body_preview as preview
from public.normalized_messages nm
join public.inbox_threads t on t.id = nm.linked_thread_id
where nm.link_status = 'linked'
  and not exists (
    select 1
    from public.inbox_messages im
    where im.provider = nm.provider
      and im.provider_message_id = nm.provider_message_id
  );


