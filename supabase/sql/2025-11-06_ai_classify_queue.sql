-- AI classification queue & view setup (idempotent)

-- A) Enrich inbound and email message stores with AI outputs
alter table public.inbox_messages
  add column if not exists ai_confidence numeric,
  add column if not exists ai_reason text;

alter table public.inbox_messages
  drop constraint if exists inbox_messages_ai_confidence_check;
alter table public.inbox_messages
  add constraint inbox_messages_ai_confidence_check
  check (ai_confidence is null or (ai_confidence >= 0 and ai_confidence <= 1));

alter table public.inbox_messages
  drop constraint if exists inbox_messages_ai_label_check;
alter table public.inbox_messages
  drop constraint if exists inbox_messages_ai_label_chk;
alter table public.inbox_messages
  add constraint inbox_messages_ai_label_chk
  check (
    ai_label is null
    or ai_label in ('reply-positive','reply-neutral','reply-negative','reply-oos','reply-ooo','noise')
  );

create index if not exists idx_inbox_messages_ai_label on public.inbox_messages(ai_label);

-- Ensure downstream email_messages mirror the AI fields used in UI
alter table public.email_messages
  add column if not exists ai_label text,
  add column if not exists ai_confidence numeric,
  add column if not exists ai_reason text;

alter table public.email_messages
  drop constraint if exists email_messages_ai_confidence_check;
alter table public.email_messages
  add constraint email_messages_ai_confidence_check
  check (ai_confidence is null or (ai_confidence >= 0 and ai_confidence <= 1));


-- B) Classification queue table
create table if not exists public.ai_classify_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message_id uuid not null references public.inbox_messages(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','done','dead')),
  attempts int not null default 0,
  last_error text
);

create unique index if not exists uq_ai_classify_message on public.ai_classify_queue(message_id);
create index if not exists idx_ai_classify_status on public.ai_classify_queue(status, created_at);


-- C) Helper to enqueue when needed
create or replace function public.enqueue_ai_classify(p_message uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dir text;
  v_label text;
begin
  select direction, ai_label into v_dir, v_label
  from public.inbox_messages
  where id = p_message;

  -- Only enqueue when inbound and not already confidently labeled
  if v_dir = 'inbound' and (v_label is null or v_label in ('neutral','empty','other')) then
    insert into public.ai_classify_queue(message_id)
    values (p_message)
    on conflict (message_id) do nothing;
  end if;
end;
$$;


-- D) Trigger on new inbound messages
drop trigger if exists trg_ai_enqueue on public.inbox_messages;
create trigger trg_ai_enqueue
after insert on public.inbox_messages
for each row
when (new.direction = 'inbound')
execute function public.enqueue_ai_classify(new.id);


-- E) Pending view surfaced to the worker
create or replace view public.v_ai_pending as
select q.id as queue_id,
       q.message_id,
       m.thread_id,
       m.body_text as text,
       m.body_html as html,
       m.from_email,
       m.to_email,
       m.ai_label
  from public.ai_classify_queue q
  join public.inbox_messages m on m.id = q.message_id
 where q.status = 'pending';


-- F) Inbox list helper (last inbound label snapshot)
drop materialized view if exists public.mv_replies_inbox;
create materialized view public.mv_replies_inbox as
select
  t.id as thread_id,
  t.org_id,
  t.provider,
  t.lead_name,
  t.lead_email,
  t.subject,
  t.status,
  t.ai_flag,
  greatest(
    coalesce(t.last_incoming_at, 'epoch'::timestamptz),
    coalesce(t.last_outgoing_at, 'epoch'::timestamptz)
  ) as last_activity_at,
  (select m.snippet from public.email_messages m where m.thread_id = t.id order by m.sent_at desc limit 1) as last_snippet,
  inbound.ai_label as last_inbound_label,
  inbound.ai_confidence as last_inbound_confidence,
  inbound.ai_reason as last_inbound_reason
from public.email_threads t
left join lateral (
  select im.ai_label, im.ai_confidence, im.ai_reason
  from public.inbox_messages im
  where im.thread_id = t.id and im.direction = 'inbound'
  order by im.created_at desc
  limit 1
) inbound on true;

create unique index if not exists idx_mv_inbox_unique on public.mv_replies_inbox(thread_id);
create index if not exists idx_mv_inbox_org on public.mv_replies_inbox(org_id, last_activity_at desc);
create index if not exists idx_mv_inbox_status on public.mv_replies_inbox(org_id, status, last_activity_at desc);

create or replace function public.refresh_mv_replies_inbox() returns trigger language plpgsql as $$
begin
  begin
    refresh materialized view concurrently public.mv_replies_inbox;
  exception
    when others then
      refresh materialized view public.mv_replies_inbox;
  end;
  return null;
end; $$;

drop trigger if exists trg_refresh_mv_threads on public.email_threads;
create trigger trg_refresh_mv_threads
  after insert or update or delete on public.email_threads
  for each statement execute function public.refresh_mv_replies_inbox();

drop trigger if exists trg_refresh_mv_messages on public.email_messages;
create trigger trg_refresh_mv_messages
  after insert or update or delete on public.email_messages
  for each statement execute function public.refresh_mv_replies_inbox();

refresh materialized view public.mv_replies_inbox;
