-- Inbox list indexes, views, and RPC (idempotent)
-- Run in Supabase SQL editor.

-- A) Helpful indexes ------------------------------------------------------------
create index if not exists idx_threads_campaign_updated
  on public.inbox_threads (campaign_id, updated_at desc);

create index if not exists idx_msgs_thread_created
  on public.inbox_messages (thread_id, created_at desc);

create index if not exists idx_msgs_direction
  on public.inbox_messages (direction);


-- B) Latest inbound snapshot per thread -----------------------------------------
create or replace view public.v_thread_last_inbound as
select
  t.id              as thread_id,
  t.campaign_id,
  t.lead_id,
  max(m.created_at) as last_inbound_at,
  (array_agg(m.ai_label order by m.created_at desc))[1] as last_inbound_label
from public.inbox_threads t
join public.inbox_messages m
  on m.thread_id = t.id
 and m.direction = 'inbound'
group by 1, 2, 3;


-- C) Latest message (any direction) + preview per thread ------------------------
create or replace view public.v_thread_last_message as
select
  t.id as thread_id,
  max(m.created_at) as last_msg_at,
  (array_agg(
    left(
      coalesce(
        nullif(trim(m.body_text), ''),
        regexp_replace(coalesce(m.body_html, ''), '<[^>]*>', '', 'g')
      ),
      180
    )
    order by m.created_at desc
  ))[1] as last_preview
from public.inbox_threads t
join public.inbox_messages m on m.thread_id = t.id
group by 1;


-- D) Inbox list view ------------------------------------------------------------
create or replace view public.v_inbox_list as
select
  t.id,
  t.id as thread_id,
  t.campaign_id,
  t.lead_id,
  l.email as lead_email,
  coalesce(l.first_name, '') as first_name,
  coalesce(l.last_name, '')  as last_name,
  t.subject,
  t.needs_reply,
  coalesce(t.last_reply_label, vli.last_inbound_label) as last_reply_label,
  coalesce(t.last_inbound_at, vli.last_inbound_at) as last_inbound_at,
  t.snoozed_until,
  t.assigned_to,
  vlm.last_msg_at,
  vli.last_inbound_label,
  t.replied_at,
  0::int as unread_count,  -- placeholder; replace with real unread logic if available
  vlm.last_preview
from public.inbox_threads t
left join public.leads l on l.id = t.lead_id
left join public.v_thread_last_inbound vli on vli.thread_id = t.id
left join public.v_thread_last_message vlm on vlm.thread_id = t.id;

alter view public.v_inbox_list set (security_barrier = true);


-- E) RPC: list inbox with filters + cursor pagination ---------------------------
drop function if exists public.list_inbox(uuid, text[], text, int, timestamptz);

create or replace function public.list_inbox(
  p_campaign uuid,
  p_filters text[] default array[]::text[],
  p_search  text default null,
  p_limit   int  default 25,
  p_before  timestamptz default null
)
returns table(
  thread_id uuid,
  lead_id uuid,
  lead_email text,
  first_name text,
  last_name text,
  last_msg_at timestamptz,
  last_inbound_label text,
  replied boolean,
  last_preview text,
  ooo_status text,
  ooo_due timestamptz
)
language sql
stable
as $$
  with base as (
    select *
      from public.v_inbox_list_enriched v
     where v.campaign_id = p_campaign
       and (p_before is null or v.last_msg_at < p_before)
       and (
         p_search is null
         or v.lead_email ilike '%' || p_search || '%'
         or (
           coalesce(v.first_name, '') || ' ' || coalesce(v.last_name, '')
         ) ilike '%' || p_search || '%'
       )
  ),
  filtered as (
    select *
      from base
     where (
       array_length(p_filters, 1) is null
       or (
         ('reply'     = any(p_filters) and last_inbound_label = 'reply')
         or ('ooa'    = any(p_filters) and last_inbound_label = 'ooa')
         or ('bounce' = any(p_filters) and last_inbound_label = 'bounce')
         or ('spam'   = any(p_filters) and last_inbound_label = 'spam')
         or ('forward'= any(p_filters) and last_inbound_label = 'forward')
         or (
           'not-reply' = any(p_filters)
           and (last_inbound_label is null or last_inbound_label = 'not-reply')
         )
         or ('unreplied' = any(p_filters) and replied_at is null)
       )
     )
  )
  select
    thread_id,
    lead_id,
    lead_email,
    first_name,
    last_name,
    last_msg_at,
    last_inbound_label,
    (replied_at is not null) as replied,
    last_preview,
    ooo_status,
    ooo_due
  from filtered
  order by last_msg_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 25), 100));
$$;

revoke all on function public.list_inbox(uuid, text[], text, int, timestamptz) from public;
grant execute on function public.list_inbox(uuid, text[], text, int, timestamptz) to authenticated, service_role;

