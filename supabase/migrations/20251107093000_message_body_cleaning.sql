-- Message body cleaning columns and feed view updates

alter table public.message_bodies
  add column if not exists clean_text text,
  add column if not exists clean_html text,
  add column if not exists cleaned_at timestamptz;

alter table public.normalized_messages
  add column if not exists preview_clean text;

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
  coalesce(nm.preview_clean, nm.body_preview) as preview
from public.normalized_messages nm
join public.inbox_threads t on t.id = nm.linked_thread_id
where nm.link_status = 'linked'
  and not exists (
    select 1
    from public.inbox_messages im
    where im.provider = nm.provider
      and im.provider_message_id = nm.provider_message_id
  );


