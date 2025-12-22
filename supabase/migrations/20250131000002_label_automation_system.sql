-- Label Automation System
-- Adds email_status, snooze/cooldown controls, CRM tasks, and automation function

-- =====================================================
-- 1) Schema bumps
-- =====================================================

-- Lead health + do-not-contact already added earlier; add email_status
alter table public.leads
  add column if not exists email_status text
    check (email_status in ('valid','bounced','blocked','unknown')) default 'unknown';

-- Thread-level snooze/cooldown controls
alter table public.inbox_threads
  add column if not exists snooze_until timestamptz,
  add column if not exists cooldown_until timestamptz;

-- Lightweight CRM task for positive replies
create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  thread_id uuid references public.inbox_threads(id) on delete set null,
  type text not null check (type in ('book_call','follow_up','manual_review')),
  title text not null,
  status text not null check (status in ('open','done','cancelled')) default 'open',
  due_at timestamptz
);

create index if not exists idx_crm_tasks_status_due on public.crm_tasks(status, due_at);
create index if not exists idx_crm_tasks_user on public.crm_tasks(user_id, status, due_at) where status = 'open';

-- RLS for crm_tasks
alter table public.crm_tasks enable row level security;

-- Users can see their own tasks
drop policy if exists "crm_tasks_user_select" on public.crm_tasks;
create policy "crm_tasks_user_select" on public.crm_tasks
  for select using (auth.uid() = user_id);

drop policy if exists "crm_tasks_user_update" on public.crm_tasks;
create policy "crm_tasks_user_update" on public.crm_tasks
  for update using (auth.uid() = user_id);

-- =====================================================
-- 2) Core automation procedure
-- =====================================================

-- Updates queue items after snooze/cooldown, stops on unsubscribe/bounce/negative,
-- and creates a task for positive replies.
create or replace function public.apply_label_automations(p_message uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_label text;
  v_thread uuid;
  v_lead uuid;
  v_campaign uuid;
  v_user uuid;
  v_snooze_until timestamptz;
begin
  select im.ai_label, im.thread_id, im.lead_id, im.campaign_id, c.user_id
    into v_label, v_thread, v_lead, v_campaign, v_user
  from public.inbox_messages im
  left join public.campaigns c on c.id = im.campaign_id
  where im.id = p_message;

  if v_thread is null or v_lead is null then
    return;
  end if;

  -- Ensure thread is marked replied/stopped (Slice 8 already does this)
  update public.inbox_threads
     set replied_at = coalesce(replied_at, now()),
         stopped_by_reply = true
   where id = v_thread;

  -- CASE: label-specific actions
  if v_label = 'unsubscribe' then
    update public.leads set do_not_contact = true where id = v_lead;
    perform public.cancel_future_queue_for_thread(v_thread);

  elsif v_label = 'bounce' then
    update public.leads
       set email_status = 'bounced', do_not_contact = true
     where id = v_lead;
    perform public.cancel_future_queue_for_thread(v_thread);

  elsif v_label = 'negative' then
    -- 30-day cooldown: stop current sequence, prevent re-queue for a while
    update public.inbox_threads
       set cooldown_until = now() + interval '30 days'
     where id = v_thread;
    perform public.cancel_future_queue_for_thread(v_thread);

  elsif v_label = 'ooo' then
    -- Default snooze: 7 days; adjust later with smarter return-date parsing
    v_snooze_until := now() + interval '7 days';
    update public.inbox_threads
       set snooze_until = v_snooze_until
     where id = v_thread;

    -- Push any queued items for this thread out to the snooze date
    update public.send_queue
       set next_attempt_at = v_snooze_until,
           status = 'queued'
     where thread_id = v_thread
       and status in ('queued','sending');

  elsif v_label = 'positive' then
    -- Create a book-a-call task due in 1 day
    insert into public.crm_tasks(user_id, campaign_id, lead_id, thread_id, type, title, due_at)
    values (v_user, v_campaign, v_lead, v_thread, 'book_call', 'Book a call with this lead', now() + interval '1 day');
    -- Sequence is already stopped_by_reply; nothing else to do.

  else
    -- neutral/other: no-op
    null;
  end if;
end;
$$;

-- Grant execute permission
grant execute on function public.apply_label_automations(uuid) to service_role, authenticated;

-- =====================================================
-- 3) Trigger: fire automations immediately after classification lands
-- =====================================================

drop trigger if exists trg_apply_label_automations on public.inbox_messages;
create trigger trg_apply_label_automations
after update of classified_at on public.inbox_messages
for each row
when (new.classified_at is not null and (old.classified_at is null or old.ai_label is distinct from new.ai_label))
execute function public.apply_label_automations(new.id);

-- =====================================================
-- 4) Update vw_sendable_items to add guardrails
-- =====================================================

-- Guardrails in sender/scheduler (respect snooze/cooldown/DNC/bounce)
-- Note: This assumes thread_id exists on send_queue (added in 20250105000000_thread_queue_linkage_auto_stop.sql)
create or replace view public.vw_sendable_items as
with caps as (
  select
    ca.id as account_id,
    coalesce(ca.daily_cap, 40) as daily_cap,
    coalesce(ca.send_start, '08:00')::time as window_start,
    coalesce(ca.send_end,   '18:00')::time as window_end
  from public.connected_accounts ca
),
tally as (
  select c.id as account_id, coalesce(v.sent_count_today,0) as sent_today
  from public.connected_accounts c
  left join public.vw_account_sends_today v on v.account_id = c.id
)
select q.*
from public.send_queue q
join caps on caps.account_id = coalesce(q.account_id, q.mailbox_id)
join tally t on t.account_id = caps.account_id
where q.status = 'queued'
  and coalesce(q.next_attempt_at, q.scheduled_at, now()) <= now()
  and now()::time between caps.window_start and caps.window_end
  and t.sent_today < caps.daily_cap
  -- Guardrails: respect DNC, bounced, snooze, cooldown
  and coalesce((select do_not_contact from public.leads where id = q.lead_id), false) = false
  and coalesce((select email_status from public.leads where id = q.lead_id), 'unknown') <> 'bounced'
  and coalesce((select snooze_until from public.inbox_threads where id = q.thread_id), now() - interval '1 second') <= now()
  and coalesce((select cooldown_until from public.inbox_threads where id = q.thread_id), now() - interval '1 second') <= now();


