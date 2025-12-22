-- RLS + Auto-Reply Stop Trigger + AI Classification System
-- Idempotent migration for inbox RLS, auto-stop on reply, and job-based AI classification

-- =====================================================
-- A) Enable RLS on inbox tables (idempotent)
-- =====================================================

alter table if exists public.reply_templates enable row level security;
alter table if exists public.inbox_threads enable row level security;
alter table if exists public.inbox_messages enable row level security;

-- =====================================================
-- B) RLS Policies for reply_templates
-- =====================================================

drop policy if exists "reply_templates by owner" on public.reply_templates;
create policy "reply_templates by owner"
on public.reply_templates
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- =====================================================
-- C) RLS Policies for inbox_threads (tenant-safe by campaign owner)
-- =====================================================

drop policy if exists "threads by owner" on public.inbox_threads;
create policy "threads by owner"
on public.inbox_threads
for select using (
  exists (
    select 1
    from public.campaigns c
    where c.id = inbox_threads.campaign_id
      and (
        coalesce(c.owner_id, c.user_id) = auth.uid()
        or exists (
          select 1 
          from public.campaign_shares s 
          where s.campaign_id = c.id 
          and s.user_id = auth.uid()
        )
      )
  )
);

-- =====================================================
-- D) RLS Policies for inbox_messages (tenant-safe by campaign owner)
-- =====================================================

drop policy if exists "messages by owner" on public.inbox_messages;
create policy "messages by owner"
on public.inbox_messages
for select using (
  exists (
    select 1
    from public.inbox_threads t
    join public.campaigns c on c.id = t.campaign_id
    where t.id = inbox_messages.thread_id
      and (
        coalesce(c.owner_id, c.user_id) = auth.uid()
        or exists (
          select 1 
          from public.campaign_shares s 
          where s.campaign_id = c.id 
          and s.user_id = auth.uid()
        )
      )
  )
);

-- =====================================================
-- E) Ensure cancel_future_queue_for_thread exists (idempotent)
-- =====================================================

-- This function should already exist from previous migrations, but we ensure it exists
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
  select campaign_id, lead_id
    into v_campaign, v_lead
  from public.inbox_threads
  where id = p_thread;

  if v_campaign is null or v_lead is null then
    return 0;
  end if;

  update public.send_queue
     set status = 'canceled',
         cancel_reason = coalesce(cancel_reason,'stopped_by_reply'),
         updated_at = now()
   where campaign_id = v_campaign
     and lead_id = v_lead
     and status in ('queued','scheduled','sending','retrying')
   returning 1
   into v_count;

  return (select count(*) from public.send_queue
          where campaign_id = v_campaign 
          and lead_id = v_lead 
          and status = 'canceled'
          and updated_at >= now() - interval '5 seconds');
end $$;

-- =====================================================
-- F) Trigger: Auto-mark replied + stop future steps when inbound arrives
-- =====================================================

create or replace function public.on_inbound_message_after()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread uuid;
begin
  if NEW.direction <> 'inbound' then
    return NEW;
  end if;

  v_thread := NEW.thread_id;

  -- mark replied if first time or always bump timestamp
  update public.inbox_threads
     set replied_at = coalesce(replied_at, NEW.created_at),
         stopped_by_reply = true,
         updated_at = now()
   where id = v_thread;

  -- cancel pending future queue items tied to this thread/campaign/lead
  perform public.cancel_future_queue_for_thread(v_thread);

  return NEW;
end $$;

drop trigger if exists trg_on_inbound_message_after on public.inbox_messages;
create trigger trg_on_inbound_message_after
after insert on public.inbox_messages
for each row execute function public.on_inbound_message_after();

-- =====================================================
-- G) Jobs table for async processing (idempotent)
-- =====================================================

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued',
  created_at timestamptz not null default now(),
  run_at timestamptz default now()
);

create index if not exists idx_jobs_status_runat on public.jobs(status, run_at);

-- =====================================================
-- H) Trigger: Enqueue AI classification when inbound arrives
-- =====================================================

create or replace function public.enqueue_ai_classify()
returns trigger
language plpgsql
security definer
as $$
begin
  if NEW.direction = 'inbound' then
    insert into public.jobs(type, payload) 
    values ('ai_classify_inbound', jsonb_build_object('message_id', NEW.id));
  end if;
  return NEW;
end $$;

drop trigger if exists trg_enqueue_ai_classify on public.inbox_messages;
create trigger trg_enqueue_ai_classify
after insert on public.inbox_messages
for each row execute function public.enqueue_ai_classify();








