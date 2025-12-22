-- A) Thread-level OOO flags

alter table public.inbox_threads
  add column if not exists ooo_until timestamptz,
  add column if not exists last_ooo_at timestamptz,
  add column if not exists last_ooo_message_id uuid;

create index if not exists idx_threads_ooo_until on public.inbox_threads(ooo_until);

-- B) OOO keyword list (global + per-user)

create table if not exists public.ooo_keywords (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade, -- null = global default
  phrase text not null,
  unique (coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid), phrase)
);

insert into public.ooo_keywords(user_id, phrase)
select null, unnest(array[
  'out of office','ooo','on vacation','annual leave','away from the office',
  'automatic reply','auto-reply','out of the office','out-of-office','on leave',
  'back on','returning on','i will be back','i will return on'
])
on conflict do nothing;

-- C) Helper: normalize text (reuse if already created earlier)

create or replace function public._normalize_msg_text(p_msg uuid)
returns text
language sql stable
set search_path=public
as $$
  select lower(
    coalesce(m.subject,'') || ' ' ||
    regexp_replace(coalesce(m.body_plain, ''), '\s+', ' ', 'g') || ' ' ||
    regexp_replace(coalesce(m.body_html,  ''), '\s+', ' ', 'g')
  )
  from public.inbox_messages m
  where m.id = p_msg
$$;

-- D) Defer queued items for a thread by N days (optional helper)

create or replace function public.defer_queue_for_thread(p_thread uuid, p_days int default 7)
returns int
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count int := 0;
begin
  update public.send_queue q
     set scheduled_at = q.scheduled_at + make_interval(days => p_days)
   where q.thread_id = p_thread
     and q.status in ('queued','sending');

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- E) Detector: mark thread OOO and optionally push existing queue

create or replace function public.detect_ooo_on_message(p_message uuid, p_days int default 7, p_defer_existing boolean default true)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_text text;
  v_thread uuid;
  v_lead uuid;
  v_user uuid;
  v_hit boolean := false;
  v_new_until timestamptz := now() + make_interval(days => p_days);
begin
  -- Only inbound
  select m.thread_id, m.lead_id, t.user_id
    into v_thread, v_lead, v_user
  from public.inbox_messages m
  join public.inbox_threads t on t.id = m.thread_id
  where m.id = p_message
    and (
      coalesce(m.direction,'inbound') = 'inbound'
      or coalesce(m.is_inbound,true) = true
    );

  if v_thread is null then
    return false;
  end if;

  v_text := public._normalize_msg_text(p_message);

  if exists (
    select 1 from public.ooo_keywords k
    where k.user_id = v_user and v_text like '%' || lower(k.phrase) || '%'
  ) then
    v_hit := true;
  elsif exists (
    select 1 from public.ooo_keywords k
    where k.user_id is null and v_text like '%' || lower(k.phrase) || '%'
  ) then
    v_hit := true;
  end if;

  if not v_hit then
    return false;
  end if;

  -- Set/extend ooo_until
  update public.inbox_threads
     set ooo_until = greatest(coalesce(ooo_until, now()), v_new_until),
         last_ooo_at = now(),
         last_ooo_message_id = p_message
   where id = v_thread;

  if p_defer_existing then
    perform public.defer_queue_for_thread(v_thread, p_days);
  end if;

  return true;
end $$;

-- F) Trigger on inbound insert

create or replace function public.trg_inbound_ooo()
returns trigger language plpgsql as $$
begin
  perform public.detect_ooo_on_message(new.id);
  return new;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname='trg_inbox_messages_ooo') then
    create trigger trg_inbox_messages_ooo
    after insert on public.inbox_messages
    for each row execute function public.trg_inbound_ooo();
  end if;
end $$;

-- G) RLS for ooo_keywords

alter table public.ooo_keywords enable row level security;

create policy if not exists "ooo_keywords_read"
on public.ooo_keywords
for select
using (user_id is null or user_id = auth.uid());

create policy if not exists "ooo_keywords_write"
on public.ooo_keywords
for all
using (user_id = auth.uid())
with check (coalesce(user_id, auth.uid()) = auth.uid());

-- H) Backfill RPC — scan recent inbound for OOO

create or replace function public.backfill_ooo(p_days int default 60, p_days_deferral int default 7)
returns int
language plpgsql
security definer
set search_path=public
as $$
declare
  v_count int := 0;
  rec record;
begin
  for rec in
    select m.id
    from public.inbox_messages m
    where (coalesce(m.direction,'inbound')='inbound' or coalesce(m.is_inbound,true)=true)
      and m.created_at >= now() - (p_days || ' days')::interval
  loop
    if public.detect_ooo_on_message(rec.id, p_days_deferral, true) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

