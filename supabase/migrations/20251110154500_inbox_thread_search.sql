-- 1) Inbox message FTS column + index + trigger
alter table public.inbox_messages
  add column if not exists fts tsvector;

create index if not exists idx_inbox_messages_fts on public.inbox_messages using gin (fts);

create or replace function public.inbox_messages_fts_update()
returns trigger
language plpgsql
as $$
begin
  new.fts :=
    setweight(to_tsvector('simple', coalesce(new.text_body, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(new.subject, '')), 'B');
  return new;
end;
$$;

drop trigger if exists trg_inbox_messages_fts on public.inbox_messages;
create trigger trg_inbox_messages_fts
before insert or update of text_body, subject
on public.inbox_messages
for each row execute function public.inbox_messages_fts_update();


-- 2) Lead quick-search helpers
alter table public.leads
  add column if not exists search_blob text
  generated always as (
    lower(
      coalesce(first_name, '') || ' ' ||
      coalesce(last_name, '') || ' ' ||
      coalesce(company, '') || ' ' ||
      coalesce(email, '')
    )
  ) stored;

create extension if not exists pg_trgm;

create index if not exists idx_leads_trgm on public.leads using gin (search_blob gin_trgm_ops);


-- 3) Thread summary helpers
create or replace view public.v_thread_summaries as
select
  t.id as thread_id,
  t.campaign_id,
  t.lead_id,
  t.reply_type as label,
  t.assigned_to,
  (
    select max(created_at)
    from public.inbox_messages m
    where m.thread_id = t.id
      and m.direction = 'inbound'
  ) as last_inbound_at,
  (
    select max(created_at)
    from public.inbox_messages m
    where m.thread_id = t.id
      and m.direction = 'outbound'
  ) as last_outbound_at,
  exists (
    select 1
    from public.inbox_messages m
    where m.thread_id = t.id
      and m.text_body ~* 'https?://'
  ) as has_links,
  split_part(lower(l.email), '@', 2) as domain,
  l.email as lead_email,
  l.first_name,
  l.last_name,
  l.company
from public.inbox_threads t
join public.leads l on l.id = t.lead_id;


-- 4) Overdue / resume helpers
create or replace view public.v_threads_overdue as
select s.thread_id, s.due_at
from public.sla_timers s
where s.resolved_at is null
  and now() >= s.due_at;

create or replace view public.v_threads_resume_today as
select thread_id
from public.v_threads_resume
where resume_at::date = now()::date;


-- 5) Main search RPC
create or replace function public.search_threads(
  p_campaign uuid,
  p_q text default null,
  p_label text default null,
  p_domain text default null,
  p_assigned uuid default null,
  p_has_links boolean default null,
  p_overdue boolean default null,
  p_ooo_today boolean default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table(
  thread_id uuid,
  lead_email text,
  company text,
  label text,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  assigned_to uuid,
  domain text,
  snippet text
)
language sql
stable
as $$
with base as (
  select s.*,
    (
      select m.text_body
      from public.inbox_messages m
      where m.thread_id = s.thread_id
        and m.direction = 'inbound'
      order by m.created_at desc
      limit 1
    ) as last_inbound_snippet
  from public.v_thread_summaries s
  where s.campaign_id = p_campaign
    and (p_label    is null or s.label = p_label)
    and (p_domain   is null or s.domain = lower(p_domain))
    and (p_assigned is null or s.assigned_to = p_assigned)
    and (p_has_links is null or s.has_links = p_has_links)
    and (p_date_from is null or s.last_inbound_at >= p_date_from)
    and (p_date_to   is null or s.last_inbound_at <= p_date_to)
),
with_text as (
  select b.*
  from base b
  where coalesce(p_q, '') = ''
     or exists (
          select 1
          from public.inbox_messages m
          where m.thread_id = b.thread_id
            and m.fts @@ plainto_tsquery('simple', p_q)
        )
     or b.lead_email ilike '%' || p_q || '%'
     or b.company ilike '%' || p_q || '%'
),
with_overdue as (
  select w.*, (o.thread_id is not null) as is_overdue
  from with_text w
  left join public.v_threads_overdue o on o.thread_id = w.thread_id
),
with_ooo as (
  select w.*, (r.thread_id is not null) as is_ooo_today
  from with_overdue w
  left join public.v_threads_resume_today r on r.thread_id = w.thread_id
)
select
  thread_id,
  lead_email,
  company,
  label,
  last_inbound_at,
  last_outbound_at,
  assigned_to,
  domain,
  coalesce(left(last_inbound_snippet, 180), '') as snippet
from with_ooo
where (p_overdue   is null or is_overdue   = p_overdue)
  and (p_ooo_today is null or is_ooo_today = p_ooo_today)
order by
  (label is null),
  (case label
     when 'question' then 0
     when 'positive' then 1
     when 'neutral' then 2
     else 3
   end),
  last_inbound_at desc
limit p_limit offset p_offset;
$$;


-- 6) Saved filters
create table if not exists public.saved_filters (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  name text not null,
  params jsonb not null,
  unique (user_id, campaign_id, name)
);

alter table public.saved_filters enable row level security;

drop policy if exists filters_rw on public.saved_filters;
create policy filters_rw on public.saved_filters
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);






