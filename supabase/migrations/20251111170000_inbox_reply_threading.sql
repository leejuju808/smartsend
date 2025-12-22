-- ============================================================================
-- A) Inbox message header enrichment & dedupe metadata
-- ============================================================================
alter table public.inbox_messages
  add column if not exists provider text,
  add column if not exists external_id text,
  add column if not exists message_id text,
  add column if not exists in_reply_to text,
  add column if not exists refs text,
  add column if not exists thread_key text,
  add column if not exists from_email citext,
  add column if not exists to_email citext;

create index if not exists idx_msgs_message_id
  on public.inbox_messages(message_id);

create index if not exists idx_msgs_external
  on public.inbox_messages(provider, external_id);

create index if not exists idx_msgs_thread_key
  on public.inbox_messages(thread_key);

create index if not exists idx_msgs_from_to
  on public.inbox_messages(from_email, to_email);


-- ============================================================================
-- B) Thread reply flags & merge plumbing
-- ============================================================================
alter table public.inbox_threads
  add column if not exists is_replied boolean not null default false,
  add column if not exists replied_at timestamptz,
  add column if not exists replied_via text,
  add column if not exists last_inbound_at timestamptz,
  add column if not exists canonical_id uuid;

create index if not exists idx_threads_replied
  on public.inbox_threads(is_replied);

create index if not exists idx_threads_canonical
  on public.inbox_threads(canonical_id);


-- ============================================================================
-- C) Reply audit log
-- ============================================================================
create table if not exists public.reply_audits (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  actor uuid references auth.users(id) on delete set null,
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  action text not null check (action in ('auto_mark','manual_mark','manual_unmark','merge')),
  reason text,
  meta jsonb
);

create index if not exists idx_reply_audits_thread
  on public.reply_audits(thread_id);


-- ============================================================================
-- D) Thread key helper
-- ============================================================================
create or replace function public.compute_thread_key(
  p_message_id text,
  p_in_reply_to text,
  p_refs text,
  p_from text,
  p_to text
)
returns text
language sql
immutable
set search_path = public
as $$
  with ids as (
    select lower(regexp_replace(coalesce(p_in_reply_to,'') || ' ' || coalesce(p_refs,''), '[<>\s,]+', ' ', 'g')) as all_ids
  )
  select trim(both ' ')
  from (
    select nullif(all_ids,'') from ids
    union all
    select lower(coalesce(p_from,'') || '→' || coalesce(p_to,''))
  ) t
  where t is not null
  limit 1
$$;

revoke all on function public.compute_thread_key(text, text, text, text, text) from public;
grant execute on function public.compute_thread_key(text, text, text, text, text) to authenticated;
grant execute on function public.compute_thread_key(text, text, text, text, text) to service_role;


-- ============================================================================
-- E) Core helper: mark thread replied
-- ============================================================================
create or replace function public.set_thread_replied(
  p_thread_id uuid,
  p_via text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead uuid;
begin
  if p_thread_id is null then
    return;
  end if;

  select lead_id into v_lead
  from public.inbox_threads
  where id = p_thread_id;

  if not found then
    return;
  end if;

  update public.inbox_threads
     set is_replied = true,
         replied_at = coalesce(replied_at, now()),
         replied_via = coalesce(p_via, replied_via)
   where id = p_thread_id;

  perform public.pause_lead_followups(p_thread_id, 'replied', null);

  insert into public.reply_audits(actor, thread_id, action, reason, meta)
  values (null, p_thread_id, 'auto_mark', p_reason, jsonb_build_object('via', p_via));
end;
$$;

revoke all on function public.set_thread_replied(uuid, text, text) from public;
grant execute on function public.set_thread_replied(uuid, text, text) to authenticated;
grant execute on function public.set_thread_replied(uuid, text, text) to service_role;


-- ============================================================================
-- F) Merge helper
-- ============================================================================
create or replace function public.merge_threads(
  p_src uuid,
  p_dst uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_src is null or p_dst is null or p_src = p_dst then
    return;
  end if;

  update public.inbox_messages
     set thread_id = p_dst
   where thread_id = p_src;

  update public.inbox_threads
     set canonical_id = p_dst
   where id = p_src;

  update public.inbox_threads d
     set is_replied = d.is_replied or s.is_replied,
         replied_at = coalesce(d.replied_at, s.replied_at),
         replied_via = coalesce(d.replied_via, s.replied_via),
         last_inbound_at = greatest(
           coalesce(d.last_inbound_at, '-infinity'::timestamptz),
           coalesce(s.last_inbound_at, '-infinity'::timestamptz)
         )
  from public.inbox_threads s
  where d.id = p_dst
    and s.id = p_src;

  insert into public.reply_audits(actor, thread_id, action, reason, meta)
  values (null, p_dst, 'merge', 'merged duplicate thread', jsonb_build_object('merged_from', p_src));
end;
$$;

revoke all on function public.merge_threads(uuid, uuid) from public;
grant execute on function public.merge_threads(uuid, uuid) to authenticated;
grant execute on function public.merge_threads(uuid, uuid) to service_role;


-- ============================================================================
-- G) Trigger: reply flags on inbound
-- ============================================================================
create or replace function public.tg_inbound_reply_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  if new.direction <> 'inbound' then
    return new;
  end if;

  v_key := public.compute_thread_key(new.message_id, new.in_reply_to, new.refs, new.from_email, new.to_email);
  new.thread_key := coalesce(new.thread_key, v_key);

  update public.inbox_threads
     set last_inbound_at = coalesce(last_inbound_at, new.created_at),
         last_message_at = greatest(coalesce(last_message_at, '-infinity'::timestamptz), new.created_at)
   where id = new.thread_id;

  perform public.set_thread_replied(new.thread_id, 'inbound', 'message_insert');

  return new;
end;
$$;

revoke all on function public.tg_inbound_reply_flags() from public;
grant execute on function public.tg_inbound_reply_flags() to authenticated;
grant execute on function public.tg_inbound_reply_flags() to service_role;

drop trigger if exists tr_inbound_reply_flags on public.inbox_messages;

create trigger tr_inbound_reply_flags
after insert on public.inbox_messages
for each row
execute function public.tg_inbound_reply_flags();






