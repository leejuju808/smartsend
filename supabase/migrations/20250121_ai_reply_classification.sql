-- AI Reply Classification System
-- Safe to run once (idempotent)

-- =====================================================
-- 1a) Add AI fields + indexes to inbox_messages
-- =====================================================
alter table public.inbox_messages
  add column if not exists ai_label text check (ai_label in ('positive','neutral','negative','unsubscribe','ooo','bounce','other')),
  add column if not exists ai_intent text,
  add column if not exists ai_confidence numeric,
  add column if not exists classified_at timestamptz;

create index if not exists idx_msgs_ai_label on public.inbox_messages(ai_label);
create index if not exists idx_msgs_classified on public.inbox_messages(classified_at);

-- =====================================================
-- 1b) Minimal job queue (idempotent)
-- =====================================================
create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.inbox_messages(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','done','error')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (message_id)
);

create index if not exists idx_ai_jobs_status on public.ai_jobs(status, created_at);
alter table public.ai_jobs enable row level security;

-- =====================================================
-- Keep updated_at fresh
-- =====================================================
create or replace function public.tg_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists tr_touch_updated_ai_jobs on public.ai_jobs;
create trigger tr_touch_updated_ai_jobs
before update on public.ai_jobs
for each row execute function public.tg_touch_updated_at();

-- =====================================================
-- 1c) RLS read policy (debug visibility only; service key will write)
-- =====================================================
drop policy if exists "ai_jobs_read" on public.ai_jobs;
create policy "ai_jobs_read"
on public.ai_jobs for select
using (
  exists (
    select 1 from public.inbox_messages m
    join public.inbox_threads t on (
      -- Support both thread_key and id-based structures
      (t.thread_key = m.thread_key and m.thread_key is not null)
      or (t.id::text = m.thread_id::text and m.thread_id is not null)
    )
    where m.id = message_id and public.can_view_campaign(t.campaign_id)
      and exists (select 1 from public.campaigns c where c.id = t.campaign_id and c.deleted_at is null)
  )
);

-- =====================================================
-- 1d) Enqueue job after inbound message insert
-- =====================================================
create or replace function public.tg_enqueue_ai_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.direction = 'in' then
    insert into public.ai_jobs(message_id) values (NEW.id)
    on conflict (message_id) do nothing;
  end if;
  return NEW;
end
$$;

drop trigger if exists tr_enqueue_ai_job on public.inbox_messages;
create trigger tr_enqueue_ai_job
after insert on public.inbox_messages
for each row execute function public.tg_enqueue_ai_job();

-- =====================================================
-- 1e) Mirror latest label to thread for fast UI filtering
-- =====================================================
alter table public.inbox_threads
  add column if not exists last_ai_label text;

create or replace function public.set_thread_ai_label(p_thread uuid)
returns void
language sql
security definer
as $$
  update public.inbox_threads t
  set last_ai_label = sub.ai_label
  from (
    select ai_label
    from public.inbox_messages
    where thread_id = p_thread and direction='in' and ai_label is not null
    order by coalesce(sent_at, received_at) desc
    limit 1
  ) sub
  where t.id = p_thread;
$$;

-- Also support thread_key-based lookup
create or replace function public.set_thread_ai_label_by_key(p_thread_key text)
returns void
language sql
security definer
as $$
  update public.inbox_threads t
  set last_ai_label = sub.ai_label
  from (
    select ai_label
    from public.inbox_messages
    where thread_key = p_thread_key and direction='in' and ai_label is not null
    order by coalesce(received_at, sent_at) desc
    limit 1
  ) sub
  where t.thread_key = p_thread_key;
$$;

create or replace function public.tg_after_msg_classified()
returns trigger
language plpgsql
security definer
as $$
begin
  if NEW.classified_at is not null and NEW.direction = 'in' then
    -- Try to update by thread_id if available
    if NEW.thread_id is not null then
      perform public.set_thread_ai_label(NEW.thread_id);
    end if;
    -- Also try by thread_key if available
    if NEW.thread_key is not null then
      perform public.set_thread_ai_label_by_key(NEW.thread_key);
    end if;
  end if;
  return NEW;
end
$$;

drop trigger if exists tr_after_msg_classified on public.inbox_messages;
create trigger tr_after_msg_classified
after update of ai_label, classified_at on public.inbox_messages
for each row execute function public.tg_after_msg_classified();

-- =====================================================
-- 1f) (Optional) guardrails: ensure audit_logs table exists if we're writing to it
-- =====================================================
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete set null,
  thread_id uuid references public.inbox_threads(id) on delete set null,
  action text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

-- Ensure audit_logs has thread_id column if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'audit_logs' and column_name = 'thread_id'
  ) then
    alter table public.audit_logs add column thread_id uuid references public.inbox_threads(id) on delete set null;
  end if;
end $$;

