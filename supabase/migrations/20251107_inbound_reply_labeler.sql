-- Inbound reply handling, labeling, and surfaced thread metadata

-- Helpful index for inbox message lookups by thread
create index if not exists idx_inbox_messages_thread_created
  on public.inbox_messages(thread_id, created_at desc);

-- Ensure ai_label column exists for inbox messages with constrained values
alter table public.inbox_messages
  add column if not exists ai_label text
  check (ai_label in ('positive','question','neutral','unsubscribe','oOO','bounce','spam'));

create index if not exists idx_messages_ai_label on public.inbox_messages(ai_label);

-- Track when threads were last replied to for quick filters
create index if not exists idx_threads_replied_at on public.inbox_threads(replied_at nulls last);

-- Audit log of reply-related events (inbound replies, unsubscribes, etc.)
create table if not exists public.reply_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references public.inbox_threads(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  message_id uuid not null references public.inbox_messages(id) on delete cascade,
  kind text not null check (kind in ('inbound_reply','unsubscribe','oOO','bounce','spam','other')),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_reply_events_thread_kind on public.reply_events(thread_id, kind);

-- Trigger: mark thread as replied and cancel follow-ups on inbound messages
create or replace function public.on_inbox_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dir text;
  v_thread uuid;
  v_lead uuid;
  v_camp uuid;
begin
  v_dir := new.direction;
  v_thread := new.thread_id;

  if v_dir in ('inbound', 'in') and v_thread is not null then
    -- Mark thread as replied and surface timestamps
    update public.inbox_threads
      set replied_at = coalesce(replied_at, new.created_at),
          needs_reply = false,
          updated_at = now()
      where id = v_thread;

    -- Cancel any queued follow-ups for this thread
    update public.send_queue
      set status = 'canceled',
          canceled_reason = coalesce(canceled_reason, 'inbound_reply'),
          updated_at = now()
      where thread_id = v_thread
        and status in ('queued','pending','ready');

    -- Log reply_event (campaign/lead via thread linkage)
    select lead_id, campaign_id into v_lead, v_camp
      from public.inbox_threads where id = v_thread;

    if v_lead is not null and v_camp is not null then
      insert into public.reply_events(thread_id, lead_id, campaign_id, message_id, kind)
        values (v_thread, v_lead, v_camp, new.id, 'inbound_reply');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_inbox_message_insert on public.inbox_messages;
create trigger trg_inbox_message_insert
after insert on public.inbox_messages
for each row execute function public.on_inbox_message_insert();

-- Surface last inbound AI label + reply state for UI/automation consumers
create or replace view public.v_thread_status as
with last_inbound as (
  select
    m.thread_id,
    max(m.created_at) as last_in_at,
    (array_agg(m.id order by m.created_at desc))[1] as last_in_id,
    (array_agg(m.ai_label order by m.created_at desc))[1] as last_in_ai_label,
    (array_agg(m.ai_score order by m.created_at desc))[1] as last_in_ai_score
  from public.inbox_messages m
  where m.direction in ('inbound','in')
  group by m.thread_id
),
last_human_out as (
  select
    m.thread_id,
    max(m.created_at) as last_human_out_at
  from public.inbox_messages m
  where m.direction = 'outbound'
    and coalesce((m.meta ->> 'sent_by'), 'ai') <> 'ai'
  group by m.thread_id
)
select
  t.id as thread_id,
  t.campaign_id,
  t.lead_id,
  t.needs_reply,
  t.replied_at,
  t.updated_at,
  li.last_in_at,
  li.last_in_id,
  li.last_in_ai_label as last_inbound_ai_label,
  li.last_in_ai_label as last_in_label,
  li.last_in_ai_score as last_inbound_ai_score,
  li.last_in_ai_score as last_in_score,
  lho.last_human_out_at
from public.inbox_threads t
left join last_inbound li on li.thread_id = t.id
left join last_human_out lho on lho.thread_id = t.id;




