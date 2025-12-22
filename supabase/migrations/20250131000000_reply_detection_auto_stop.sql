-- Reply Detection and Auto-Stop System
-- Triggers, helpers, and safety for automatically stopping sends when replies are detected

-- =====================================================
-- A) Thread fields (if not already present)
-- =====================================================

alter table public.inbox_threads
  add column if not exists replied_at timestamptz,
  add column if not exists stopped_by_reply boolean not null default false;

create index if not exists idx_threads_replied_at on public.inbox_threads(replied_at);
create index if not exists idx_threads_stopped on public.inbox_threads(stopped_by_reply);

-- =====================================================
-- B) Inbound message labeling columns (if you skipped earlier)
-- =====================================================

alter table public.inbox_messages
  add column if not exists ai_label text check (ai_label in ('positive','neutral','negative','unsubscribe','ooo','bounce','other')),
  add column if not exists ai_intent text,
  add column if not exists ai_confidence numeric,
  add column if not exists classified_at timestamptz;

create index if not exists idx_messages_ai_label on public.inbox_messages(ai_label);

-- Add body_plain if missing (for classifier)
alter table public.inbox_messages
  add column if not exists body_plain text;

-- =====================================================
-- C) Ensure send_queue has canceled_reason column
-- =====================================================

alter table public.send_queue
  add column if not exists canceled_reason text;

-- =====================================================
-- D) Cancel pending queue items for a thread (idempotent helper)
-- =====================================================

create or replace function public.cancel_future_queue_for_thread(p_thread uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  update public.send_queue
     set status = 'canceled',
         canceled_reason = 'reply_detected',
         updated_at = now()
   where thread_id = p_thread
     and status in ('queued','scheduled','pending','retrying');
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- =====================================================
-- E) Mark a thread as replied and stop future sends (idempotent)
-- =====================================================

create or replace function public.mark_thread_replied(p_thread uuid, p_at timestamptz default now())
returns void
language plpgsql
security definer
as $$
begin
  update public.inbox_threads
     set replied_at = case
                         when replied_at is null then p_at
                         else greatest(replied_at, p_at)
                       end,
         stopped_by_reply = true
   where id = p_thread;

  perform public.cancel_future_queue_for_thread(p_thread);
end $$;

-- =====================================================
-- F) Convenience: mark reply by message id
-- =====================================================

create or replace function public.mark_thread_replied_by_message(p_message uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_thread uuid;
  v_at timestamptz;
  v_dir text;
begin
  select thread_id, created_at, direction into v_thread, v_at, v_dir
  from public.inbox_messages where id = p_message;
  if v_thread is null then
    raise exception 'Message % not found', p_message;
  end if;
  if v_dir <> 'inbound' and v_dir <> 'in' then
    -- only inbound messages trigger a reply stop
    return;
  end if;
  perform public.mark_thread_replied(v_thread, v_at);
end $$;

-- =====================================================
-- G) Trigger: when an inbound message arrives, stop future sends
-- =====================================================

create or replace function public.tg_on_inbound_message()
returns trigger
language plpgsql
security definer
as $$
begin
  if NEW.direction = 'inbound' or NEW.direction = 'in' then
    perform public.mark_thread_replied_by_message(NEW.id);
  end if;
  return NEW;
end $$;

drop trigger if exists trg_inbound_message_stop on public.inbox_messages;
create trigger trg_inbound_message_stop
after insert on public.inbox_messages
for each row execute function public.tg_on_inbound_message();

-- =====================================================
-- Grant execute permissions
-- =====================================================

grant execute on function public.cancel_future_queue_for_thread(uuid) to service_role;
grant execute on function public.mark_thread_replied(uuid, timestamptz) to service_role;
grant execute on function public.mark_thread_replied_by_message(uuid) to service_role;

