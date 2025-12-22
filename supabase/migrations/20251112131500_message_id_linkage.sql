-- 1) Map outbound queue items to canonical + provider message ids
create table if not exists public.send_message_ids (
  queue_id uuid primary key references public.send_queue(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  message_id text not null,
  provider_msg_id text,
  provider_thread_id text,
  unique (message_id)
);

create index if not exists idx_send_message_ids_account on public.send_message_ids(account_id);


-- 2) Add reply linkage metadata
alter table public.reply_events
  add column if not exists in_reply_to text,
  add column if not exists references_arr text[],
  add column if not exists thread_key text,
  add column if not exists parent_queue_id uuid references public.send_queue(id);

create index if not exists idx_reply_events_parent_queue on public.reply_events(parent_queue_id);


-- 3) Resolver view for audits
create or replace view public.reply_link_resolver as
select
  r.id as reply_event_id,
  r.in_reply_to,
  r.references_arr,
  r.thread_key,
  s.queue_id as matched_by_msgid,
  st.queue_id as matched_by_thread
from public.reply_events r
left join public.send_message_ids s on s.message_id = r.in_reply_to
left join public.send_message_ids st on st.provider_thread_id = r.thread_key;


-- 4) RPC resolver to attach replies to parent queue
create or replace function public.link_reply_to_parent(p_reply uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  hit uuid;
begin
  select in_reply_to, references_arr, thread_key
    into r
  from public.reply_events
  where id = p_reply;

  if not found then
    return null;
  end if;

  -- A) Direct match on In-Reply-To header
  if r.in_reply_to is not null then
    select queue_id
      into hit
    from public.send_message_ids
    where message_id = r.in_reply_to;

    if hit is not null then
      update public.reply_events
         set parent_queue_id = hit
       where id = p_reply;
      return hit;
    end if;
  end if;

  -- B) References array contains our outbound id
  if r.references_arr is not null and cardinality(r.references_arr) > 0 then
    select queue_id
      into hit
    from public.send_message_ids
    where message_id = any(r.references_arr)
    limit 1;

    if hit is not null then
      update public.reply_events
         set parent_queue_id = hit
       where id = p_reply;
      return hit;
    end if;
  end if;

  -- C) Fallback to provider thread/conversation id
  if r.thread_key is not null then
    select queue_id
      into hit
    from public.send_message_ids
    where provider_thread_id = r.thread_key
    order by queue_id asc
    limit 1;

    if hit is not null then
      update public.reply_events
         set parent_queue_id = hit
       where id = p_reply;
      return hit;
    end if;
  end if;

  return null;
end
$$;

grant execute on function public.link_reply_to_parent(uuid) to authenticated;


-- 5) Surface linkage on downstream inference logs
alter table public.reply_inferences
  add column if not exists parent_queue_id uuid;


