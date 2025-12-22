-- THREAD REPLY CONTROL + FAST LOOKUPS
-- Finalized version with precise lead_id→thread mapping, hardened trigger, and minimal audit_logs

-- A0) (If missing) lightweight audit_logs for visibility
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid,
  thread_id uuid,
  action text not null,
  meta jsonb default '{}'::jsonb
);

create index if not exists idx_audit_logs_campaign on public.audit_logs(campaign_id);
create index if not exists idx_audit_logs_thread on public.audit_logs(thread_id);

-- A1) Thread-level reply tracking + precise lead mapping
alter table public.inbox_threads
  add column if not exists replied_at timestamptz,
  add column if not exists stopped_by_reply boolean default false,
  add column if not exists lead_id uuid;  -- NEW: tie thread to a lead for instant lookups

-- If you already have messages, backfill thread.lead_id once using the latest message on the thread
update public.inbox_threads t
set lead_id = x.lead_id
from (
  select m.thread_id, m.lead_id
  from public.inbox_messages m
  join (
    select thread_id, max(sent_at) as max_sent_at
    from public.inbox_messages
    group by thread_id
  ) last on last.thread_id = m.thread_id and last.max_sent_at = m.sent_at
) x
where t.id = x.thread_id
  and t.lead_id is null;

-- Optional: if your model guarantees one thread per (campaign, lead), make it unique for O(1) lookups
create unique index if not exists ux_threads_campaign_lead on public.inbox_threads(campaign_id, lead_id);

create index if not exists idx_threads_replied_at on public.inbox_threads(replied_at);
create index if not exists idx_threads_lead on public.inbox_threads(lead_id);

-- B) Helper: cancel pending future queue items for this (campaign, lead)
create or replace function public.cancel_future_queue_for_thread(p_thread uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign uuid;
  v_lead uuid;
  v_count int := 0;
begin
  select t.campaign_id, t.lead_id
    into v_campaign, v_lead
  from public.inbox_threads t
  where t.id = p_thread;

  if v_campaign is null or v_lead is null then
    return 0;
  end if;

  update public.send_queue
     set status = 'canceled',
         updated_at = now(),
         error = coalesce(error,'') || ' [auto-cancel: reply]'
   where campaign_id = v_campaign
     and lead_id = v_lead
     and status = 'pending'
     and scheduled_at > now();

  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- C) Trigger: when an inbound (human) message lands, respect campaign toggle, mark replied, cancel future sends
create or replace function public.tg_on_inbound_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_canceled int;
  v_stop boolean;
begin
  -- Only act on inbound human messages; AI/OOO handled elsewhere by labeler
  if new.direction = 'in' then
    -- read campaign toggle
    select coalesce(c.stop_on_reply, true)
      into v_stop
    from public.inbox_threads t
    join public.campaigns c on c.id = t.campaign_id
    where t.id = new.thread_id;

    if v_stop then
      -- mark thread as replied if first time
      update public.inbox_threads
         set replied_at = coalesce(replied_at, new.sent_at),
             stopped_by_reply = true
       where id = new.thread_id;

      -- cancel any pending future sends
      v_canceled := public.cancel_future_queue_for_thread(new.thread_id);

      -- audit
      insert into public.audit_logs(campaign_id, thread_id, action, meta)
      select t.campaign_id, t.id, 'auto.cancel_followups',
             jsonb_build_object('canceled', v_canceled)
      from public.inbox_threads t
      where t.id = new.thread_id;
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists tr_on_inbound_reply on public.inbox_messages;
create trigger tr_on_inbound_reply
after insert on public.inbox_messages
for each row execute function public.tg_on_inbound_reply();

-- D) Sender safety toggle on campaign (default ON)
alter table public.campaigns
  add column if not exists stop_on_reply boolean default true;

-- E) Backfill utility: cancel all future sends for threads that already replied (one-time)
with target as (
  select t.campaign_id, t.lead_id
  from public.inbox_threads t
  where t.replied_at is not null
)
update public.send_queue q
   set status='canceled', updated_at=now(),
       error=coalesce(error,'') || ' [backfill cancel]'
from target x
where q.campaign_id = x.campaign_id
  and q.lead_id = x.lead_id
  and q.status = 'pending'
  and q.scheduled_at > now();

-- Permissions
grant execute on function public.cancel_future_queue_for_thread(uuid) to anon, authenticated, service_role;
grant execute on function public.tg_on_inbound_reply() to anon, authenticated, service_role;





