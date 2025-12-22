-- Training data export helpers
create extension if not exists pgcrypto with schema public;

-- A) PII scrubber: emails, phones, URLs, street-ish tokens
create or replace function public.scrub_text(p text)
returns text
language plpgsql
immutable
as $$
declare
  t text := coalesce(p, '');
begin
  -- emails
  t := regexp_replace(t, '([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})', '<EMAIL>', 'gi');
  -- phones (US-like)
  t := regexp_replace(t, '(\+?\d{1,2}[-.\s]?)?(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})', '<PHONE>', 'gi');
  -- URLs
  t := regexp_replace(t, '(https?://|www\.)\S+', '<URL>', 'gi');
  -- street numbers (basic)
  t := regexp_replace(t, '\b\d{1,5}\s+[A-Za-z0-9#.\- ]{3,}\b', '<ADDRESS>', 'gi');
  -- excessive whitespace
  t := regexp_replace(t, '\s{2,}', ' ', 'g');
  return trim(t);
end;
$$;

-- B) Hash helper (stable but non-reversible w/o key)
create or replace function public.sha256_hex(p text)
returns text
language sql
immutable
as $$
  select encode(digest(coalesce(p, ''), 'sha256'), 'hex')
$$;

-- C) Export source: latest inbound message per thread in window
create or replace view public.v_training_examples as
with last_inbound as (
  select distinct on (m.thread_id)
    m.thread_id,
    m.id as message_id,
    m.created_at as message_at,
    left(public.scrub_text(m.body_text), 8000) as body_scrubbed
  from public.inbox_messages m
  where m.direction = 'inbound'
  order by m.thread_id, m.created_at desc
),
labels as (
  select
    t.id as thread_id,
    t.campaign_id,
    t.ai_intent,
    t.ai_confidence,
    t.ai_classified_at,
    coalesce(h.human_intent, null) as human_intent
  from public.inbox_threads t
  left join public.v_latest_human_label h on h.thread_id = t.id
)
select
  l.thread_id,
  l.campaign_id,
  public.sha256_hex(tl.ai_intent || ':' || l.thread_id::text) as example_id,
  li.message_id,
  li.message_at,
  li.body_scrubbed,
  l.ai_intent,
  l.ai_confidence,
  l.human_intent,
  case
    when l.human_intent is not null and l.human_intent = l.ai_intent then true
    else false
  end as ai_matches_human
from labels l
join last_inbound li on li.thread_id = l.thread_id
join public.inbox_threads tl on tl.id = l.thread_id;

-- D) RPC — paged, filterable export
create or replace function public.export_training_examples(
  p_start timestamptz default (now() - interval '90 days'),
  p_end   timestamptz default now(),
  p_require_human boolean default true,
  p_campaign_id uuid default null,
  p_limit int default 1000,
  p_cursor timestamptz default null -- continue from last message_at
)
returns table (
  example_id text,
  campaign_id uuid,
  thread_id uuid,
  message_id uuid,
  message_at timestamptz,
  body_scrubbed text,
  ai_intent text,
  ai_confidence real,
  human_intent text,
  ai_matches_human boolean
)
language sql
security definer
set search_path = public
as $$
  select *
  from public.v_training_examples v
  where v.message_at >= p_start
    and v.message_at < p_end
    and (not p_require_human or v.human_intent is not null)
    and (p_campaign_id is null or v.campaign_id = p_campaign_id)
    and (p_cursor is null or v.message_at < p_cursor)
  order by v.message_at desc
  limit greatest(1, least(p_limit, 5000))
$$;

grant execute on function public.export_training_examples(
  timestamptz,
  timestamptz,
  boolean,
  uuid,
  int,
  timestamptz
) to authenticated, service_role, anon;





