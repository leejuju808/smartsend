-- Queue hardening, backoff helpers, and dead letter handling

-- A) Add retry/backoff + locking fields
alter table public.send_queue
  add column if not exists attempts int not null default 0,
  add column if not exists last_error text,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists locked_at timestamptz,
  add column if not exists lock_token uuid,
  add column if not exists idempotency_key text;

create index if not exists idx_queue_ready
  on public.send_queue(coalesce(next_attempt_at, planned_at), planned_at)
  where sent_at is null and cancelled_at is null and paused = false;

create index if not exists idx_queue_lock
  on public.send_queue(lock_token)
  where sent_at is null and cancelled_at is null;


-- B) Dead letter table for exhausts
create table if not exists public.dead_letter_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  queue_id uuid,
  payload jsonb,
  attempts int,
  last_error text,
  meta jsonb
);


-- C) Unique safety on send_logs (optional)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'uq_send_logs_idem') then
    alter table public.send_logs add constraint uq_send_logs_idem unique (provider, provider_message_id);
  end if;
end $$;


-- D) Helper: compute next backoff (exponential with jitter)
create or replace function public._next_backoff(p_attempts int)
returns interval
language sql
immutable
as $$
  -- base 15s, cap ~30m, jitter +/-20%
  select
    least(make_interval(secs => 15 * (2 ^ greatest(p_attempts, 0))), make_interval(mins => 30))
    + (random() * interval '6 seconds' - interval '3 seconds');
$$;


-- E) Helper: claim one due item (atomic lock)
create or replace function public.claim_due_queue()
returns table(row_id uuid, lock_token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
begin
  update public.send_queue q
  set locked_at = now(), lock_token = v_token
  where q.id = (
    select id from public.send_queue
    where sent_at is null
      and cancelled_at is null
      and paused = false
      and coalesce(next_attempt_at, planned_at) <= now()
      and (locked_at is null or locked_at < now() - interval '2 minutes')
    order by coalesce(next_attempt_at, planned_at), planned_at
    limit 1
    for update skip locked
  )
  returning id, v_token into row_id, lock_token;

  return;
end;
$$;


-- F) Helper: release lock & schedule retry
create or replace function public.retry_queue(p_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts int;
  v_next interval;
begin
  select attempts into v_attempts from public.send_queue where id = p_id;
  v_next := public._next_backoff(v_attempts);

  update public.send_queue
  set attempts = attempts + 1,
      last_error = p_error,
      next_attempt_at = now() + v_next,
      locked_at = null,
      lock_token = null
  where id = p_id;

  -- dead-letter at 7 attempts
  if v_attempts + 1 >= 7 then
    insert into public.dead_letter_queue(queue_id, payload, attempts, last_error, meta)
    select id, payload, attempts, last_error, jsonb_build_object('planned_at', planned_at)
    from public.send_queue where id = p_id;

    update public.send_queue
      set cancelled_at = now(), paused = true
      where id = p_id;
  end if;
end;
$$;


-- G) Helper: mark sent & release
create or replace function public.complete_queue(p_id uuid)
returns void
language sql
as $$
  update public.send_queue
  set sent_at = now(),
      locked_at = null,
      lock_token = null
  where id = p_id;
$$;











