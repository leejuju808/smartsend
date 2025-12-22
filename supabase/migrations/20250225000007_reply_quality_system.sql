-- Reply Quality System: Last inbound per thread + filters (idempotent)
-- Creates view, indexes, RLS, and RPC for filtered/paginated reply quality list

-- A) Helpful indexes (if missing)
create index if not exists idx_inbox_msg_ai_label_created
  on public.inbox_messages(ai_label, created_at desc);

create index if not exists idx_threads_campaign_updated
  on public.inbox_threads(campaign_id, updated_at desc);

-- B) View: last inbound message per thread (with AI label)
create or replace view public.v_thread_last_inbound as
select
  t.id                 as thread_id,
  t.campaign_id,
  t.lead_id,
  (array_agg(m.id           order by m.created_at desc))[1] as last_msg_id,
  (array_agg(m.created_at   order by m.created_at desc))[1] as last_inbound_at,
  (array_agg(m.ai_label     order by m.created_at desc))[1] as ai_label,
  (array_agg(coalesce(m.subject,'') order by m.created_at desc))[1] as subject,
  (array_agg(coalesce(nullif(trim(both from m.body_text),''), left(regexp_replace(coalesce(m.body_html,''),'<[^>]+>','','gi'),240)) order by m.created_at desc))[1] as preview
from public.inbox_threads t
join public.inbox_messages m on m.thread_id = t.id and (m.direction = 'in' or m.direction = 'inbound')
group by t.id, t.campaign_id, t.lead_id;

-- C) RLS passthrough
drop policy if exists v_tli_view on public.v_thread_last_inbound;
create policy v_tli_view on public.v_thread_last_inbound
for select using ( public.can_view_campaign(campaign_id) );

-- D) RPC: paged + filtered list for UI
create or replace function public.reply_quality_list(
  p_campaign uuid,
  p_label text default null,           -- 'positive','neutral','negative','unsubscribe','ooo','bounce','other' or null for all
  p_q text default null,               -- search in subject/preview
  p_limit int default 20,
  p_offset int default 0
)
returns table(
  thread_id uuid,
  lead_id uuid,
  last_inbound_at timestamptz,
  ai_label text,
  subject text,
  preview text
) language sql stable as $$
  with base as (
    select * from public.v_thread_last_inbound
    where campaign_id = p_campaign
      and (p_label is null or ai_label = p_label)
      and (
        p_q is null
        or subject ilike '%'||p_q||'%'
        or preview ilike '%'||p_q||'%'
      )
  )
  select thread_id, lead_id, last_inbound_at, ai_label, subject, preview
  from base
  order by last_inbound_at desc
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;

