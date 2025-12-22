-- AI Classification Fields, Indexes, and Auto-Rules Helper
-- This migration adds AI classification fields, indexes, and the auto-rules executor function

-- =====================================================
-- 1) Inbound message AI fields (if you haven't already)
-- =====================================================
alter table public.inbox_messages
  add column if not exists ai_label text check (ai_label in ('positive','neutral','negative','unsubscribe','ooo','bounce','other')),
  add column if not exists ai_intent text,
  add column if not exists ai_confidence numeric,
  add column if not exists classified_at timestamptz;

create index if not exists idx_inbox_messages_classified on public.inbox_messages(classified_at);
create index if not exists idx_inbox_messages_thread on public.inbox_messages(thread_id);

-- =====================================================
-- 2) Lead opt-out / bounce flags for rules
-- =====================================================
alter table public.leads
  add column if not exists opted_out_at timestamptz,
  add column if not exists bounced_at timestamptz;

-- =====================================================
-- 3) Thread quick label mirrors (optional but handy for UI)
-- =====================================================
alter table public.inbox_threads
  add column if not exists last_ai_label text,
  add column if not exists last_ai_intent text;

-- =====================================================
-- 4) Auto-rule executor function
-- =====================================================
create or replace function public.apply_ai_reply_rules(p_message uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_thread uuid;
  v_label text;
  v_intent text;
  v_lead uuid;
begin
  select m.thread_id, m.ai_label, m.ai_intent
    into v_thread, v_label, v_intent
  from public.inbox_messages m where m.id = p_message;

  if v_thread is null then
    return;
  end if;

  -- Update thread with latest label and intent
  update public.inbox_threads t
     set last_ai_label = v_label, last_ai_intent = v_intent
   where t.id = v_thread;

  -- Resolve lead
  select lead_id into v_lead from public.inbox_threads where id = v_thread;
  if v_lead is null then
    return;
  end if;

  -- Unsubscribe → opt-out + cancel future sends
  if v_label = 'unsubscribe' then
    update public.leads set opted_out_at = coalesce(opted_out_at, now()) where id = v_lead;
    perform public.cancel_future_queue_for_thread(v_thread);
  end if;

  -- Bounce → mark bounced + cancel future sends
  if v_label = 'bounce' then
    update public.leads set bounced_at = coalesce(bounced_at, now()) where id = v_lead;
    perform public.cancel_future_queue_for_thread(v_thread);
  end if;

  -- Positive / any reply already stopped by your previous slice; nothing else required.
  -- OOO: optional future – schedule retry/snooze.
end $$;

grant execute on function public.apply_ai_reply_rules to authenticated, service_role;



