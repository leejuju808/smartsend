-- AI Reply Detection pipeline for normalized_messages
-- Safe to run multiple times; uses IF NOT EXISTS guards.

-- A) Extend normalized_messages with AI label metadata
alter table public.normalized_messages
  add column if not exists ai_label text,
  add column if not exists ai_confidence numeric;

-- B) Lightweight job queue for AI classification
create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message_id uuid not null references public.normalized_messages(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','done','error')),
  model text not null default 'gpt-4o-mini',
  result jsonb default '{}'::jsonb
);

create index if not exists idx_aijobs_status on public.ai_jobs(status);

-- C) Trigger to enqueue classification for inbound messages
create or replace function public.tg_ai_enqueue()
returns trigger
language plpgsql
as $$
begin
  if new.direction = 'inbound' then
    insert into public.ai_jobs (message_id) values (new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ai_enqueue on public.normalized_messages;
create trigger trg_ai_enqueue
  after insert on public.normalized_messages
  for each row execute function public.tg_ai_enqueue();

-- D) Trigger to mark campaign leads as replied when AI label indicates response
create or replace function public.tg_ai_mark_replied()
returns trigger
language plpgsql
as $$
begin
  if new.ai_label in ('human_reply','question','positive','neutral','routing') then
    update public.campaign_leads
      set status = 'replied'
      where lead_id = (
        select lead_id
        from public.inbox_threads
        where id = new.linked_thread_id
      );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ai_mark_replied on public.normalized_messages;
create trigger trg_ai_mark_replied
  after update of ai_label on public.normalized_messages
  for each row execute function public.tg_ai_mark_replied();




