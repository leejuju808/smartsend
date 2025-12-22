-- Send queue hardening + rate limiter (idempotent)
-- Run in Supabase SQL editor or via supabase db execute

-- A) send_queue minimal fields if missing
alter table public.send_queue
  add column if not exists id uuid primary key default gen_random_uuid(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists queued_at timestamptz,
  add column if not exists picked_at timestamptz,
  add column if not exists sent_at timestamptz,
  add column if not exists fail_count int not null default 0,
  add column if not exists last_error text,
  add column if not exists provider text,
  add column if not exists account_id uuid,
  add column if not exists thread_id uuid references public.inbox_threads(id) on delete set null,
  add column if not exists subject text,
  add column if not exists body text,
  add column if not exists headers jsonb not null default '{}'::jsonb,
  add column if not exists status text not null default 'queued'
    check (status in ('queued','picked','sent','failed','dead'));

create index if not exists idx_sq_status_priority on public.send_queue(status, priority desc nulls last, queued_at);
create index if not exists idx_sq_picked_old on public.send_queue(status, picked_at);

-- B) lightweight send_logs
create table if not exists public.send_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  queue_id uuid references public.send_queue(id) on delete set null,
  campaign_id uuid references public.campaigns(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  thread_id uuid references public.inbox_threads(id) on delete set null,
  provider text,
  account_id uuid,
  message_id text,
  status text not null,
  error text
);

-- C) per-account rate limit ledger (token bucket style)
create table if not exists public.rate_ledger (
  account_id uuid primary key,
  provider text not null,
  updated_at timestamptz not null default now(),
  allowance numeric not null default 0,
  last_check timestamptz not null default now(),
  capacity numeric not null default 100,
  rate_per_sec numeric not null default 0.5
);

-- D) helper: try to pick N items atomically
create or replace function public.dequeue_send_queue(p_limit int default 10)
returns setof public.send_queue
language plpgsql
as $$
declare
  r public.send_queue%rowtype;
begin
  for r in
    select * from public.send_queue
    where status = 'queued'
    order by coalesce(priority,0) desc, queued_at nulls last, created_at
    limit p_limit
  loop
    update public.send_queue
      set status='picked', picked_at=now()
      where id = r.id and status='queued';
    if found then
      return next r;
    end if;
  end loop;
end$$;

-- E) tiny helper to mark a thread activity
create or replace function public.touch_thread_outbound(p_thread uuid)
returns void language sql as $$
  update public.inbox_threads
     set last_outbound_at = now()
   where id = p_thread;
$$;

-- F) increment send fail counter helper
create or replace function public.increment_send_fail(p_id uuid)
returns void language sql as $$
  update public.send_queue
     set fail_count = coalesce(fail_count,0) + 1
   where id = p_id;
$$;

