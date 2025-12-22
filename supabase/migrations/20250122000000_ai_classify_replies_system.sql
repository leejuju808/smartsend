-- AI Classification System for Inbound Replies
-- Adds AI fields, generic job queue, and trigger for automatic classification

-- A) Ensure AI fields on inbox_messages
alter table public.inbox_messages
  add column if not exists ai_label text
    check (ai_label in ('positive','neutral','negative','unsubscribe','ooo','bounce','other')),
  add column if not exists ai_intent text,
  add column if not exists ai_confidence numeric,    -- 0..1
  add column if not exists classified_at timestamptz;

create index if not exists idx_inbox_messages_unclassified
  on public.inbox_messages(classified_at) where classified_at is null;

-- B) Lightweight job queue (generic; reuse for other AI tasks)
-- Extend existing ai_jobs table if it exists, otherwise create new
do $$
begin
  -- Check if ai_jobs table exists
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'ai_jobs') then
    -- Extend existing table
    alter table public.ai_jobs
      add column if not exists type text check (type in ('classify_reply')),
      add column if not exists attempts int not null default 0,
      add column if not exists next_attempt_at timestamptz,
      add column if not exists last_error text;
    
    -- Update status constraint if needed
    alter table public.ai_jobs
      drop constraint if exists ai_jobs_status_check;
    alter table public.ai_jobs
      add constraint ai_jobs_status_check check (status in ('queued','processing','done','error'));
    
    -- Make message_id nullable if it's currently not null
    alter table public.ai_jobs
      alter column message_id drop not null;
  else
    -- Create new table
    create table public.ai_jobs (
      id uuid primary key default gen_random_uuid(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      type text not null check (type in ('classify_reply')),
      status text not null check (status in ('queued','processing','done','error')) default 'queued',
      message_id uuid references public.inbox_messages(id) on delete cascade,
      attempts int not null default 0,
      next_attempt_at timestamptz,
      last_error text
    );
  end if;
end $$;

create index if not exists idx_ai_jobs_ready
  on public.ai_jobs(status, next_attempt_at) where status='queued';

-- Ensure unique constraint for (type, message_id) to support on conflict
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ai_jobs_type_message_unique'
  ) then
    alter table public.ai_jobs
      add constraint ai_jobs_type_message_unique unique (type, message_id);
  end if;
end $$;

-- Update trigger to keep updated_at fresh
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

-- C) Trigger: enqueue every new inbound that isn't already classified
create or replace function public.enqueue_classify_reply()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.classified_at is null and new.direction = 'in' then
    insert into public.ai_jobs(type, message_id, status, next_attempt_at)
    values ('classify_reply', new.id, 'queued', now())
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_classify on public.inbox_messages;
create trigger trg_enqueue_classify
after insert on public.inbox_messages
for each row execute function public.enqueue_classify_reply();

-- D) Update thread with latest AI label/intent when message is classified
create or replace function public.update_thread_ai_fields()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.classified_at is not null and new.direction = 'in' and new.thread_id is not null then
    update public.inbox_threads
    set last_ai_label = new.ai_label,
        last_ai_intent = new.ai_intent,
        updated_at = now()
    where id = new.thread_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_update_thread_ai on public.inbox_messages;
create trigger trg_update_thread_ai
after update of ai_label, ai_intent, classified_at on public.inbox_messages
for each row execute function public.update_thread_ai_fields();

-- E) Optional helper RPC: Flag lead as unsubscribed and cancel future sends
alter table public.leads
  add column if not exists do_not_contact boolean default false;

create or replace function public.set_lead_unsubscribed(p_message_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_lead uuid;
  v_thread uuid;
begin
  select lead_id, thread_id into v_lead, v_thread
  from public.inbox_messages where id = p_message_id;

  if v_lead is not null then
    update public.leads set do_not_contact = true where id = v_lead;
  end if;

  if v_thread is not null then
    -- stop this sequence & clear future queue
    update public.inbox_threads
       set stopped_by_reply = true,
           replied_at = coalesce(replied_at, now())
     where id = v_thread;

    perform public.cancel_future_queue_for_thread(v_thread);
  end if;
end;
$$;

grant execute on function public.set_lead_unsubscribed to service_role;

