-- Queue hardening: status locks, rate guards, retry helpers
-- Safe to run multiple times (idempotent) in Supabase SQL editor or migration runner

-- A) send_queue additions ----------------------------------------------------
alter table public.send_queue
  add column if not exists status text default 'pending',
  add column if not exists attempt_no int not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists locked_by text,
  add column if not exists locked_at timestamptz,
  add column if not exists error_last text,
  add column if not exists dedupe_key text;

-- Ensure status constraint matches allowable states
do $$
begin
  if exists (
    select 1 from pg_constraint c
    join pg_class cl on c.conrelid = cl.oid
    join pg_namespace n on cl.relnamespace = n.oid
    where n.nspname = 'public'
      and cl.relname = 'send_queue'
      and c.contype = 'c'
      and c.conname = 'send_queue_status_check'
  ) then
    alter table public.send_queue drop constraint send_queue_status_check;
  end if;

  -- Normalize legacy statuses before re-adding constraint
  update public.send_queue
     set status = case
       when status in ('queued','scheduled','retrying','deferred') then 'pending'
       when status in ('reserved','picked') then 'sending'
       when status = 'cancelled' then 'canceled'
       else status
     end
   where status not in ('pending','sending','sent','failed','canceled');

  alter table public.send_queue
    add constraint send_queue_status_check
      check (status in ('pending','sending','sent','failed','canceled'));
exception
  when others then
    -- leave constraint unchanged if creation fails (e.g. existing non-compliant data)
    raise notice 'send_queue status constraint not updated: %', sqlerrm;
end $$;

create index if not exists idx_sq_status_next on public.send_queue(status, next_attempt_at nulls first);
create index if not exists idx_sq_locked_at on public.send_queue(locked_at);


-- B) send_logs provider id columns ------------------------------------------
alter table public.send_logs
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists provider_thread_id text;

create unique index if not exists uq_logs_provider_msg
  on public.send_logs(provider, provider_message_id)
  where provider is not null and provider_message_id is not null;


-- C) Delivery event helper ---------------------------------------------------
create or replace function public.log_delivery_event(
  p_log uuid, p_event text, p_meta jsonb default '{}'::jsonb
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.delivery_events(log_id, event, meta)
  values (p_log, p_event, p_meta);
$$;


-- D) Rate gate ---------------------------------------------------------------
create or replace function public._rate_ok(p_account uuid)
returns boolean
language sql
stable
as $$
  select coalesce((
    select count(*) < 80
    from public.send_logs
    where account_id = p_account
      and created_at > now() - interval '60 seconds'
  ), true);
$$;


-- E) Claim RPC ---------------------------------------------------------------
create or replace function public.claim_send_queue(p_worker text, p_limit int default 20)
returns table(id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed int := 0;
  v_id uuid;
begin
  for v_id in
    select q.id
    from public.send_queue q
    join public.campaigns c on c.id = q.campaign_id
    where q.status = 'pending'
      and (q.next_attempt_at is null or q.next_attempt_at <= now())
      and (q.locked_at is null or q.locked_at < now() - interval '5 minutes')
      and public.billing_is_active(c.user_id)
    order by q.created_at
    limit greatest(p_limit, 1)
  loop
    update public.send_queue
       set status = 'sending', locked_by = p_worker, locked_at = now()
     where id = v_id
       and (locked_at is null or locked_at < now() - interval '5 minutes');

    if found then
      v_claimed := v_claimed + 1;
      id := v_id;
      return next;
    end if;

    exit when v_claimed >= p_limit;
  end loop;

  return;
end;
$$;


-- F) Backoff helper ---------------------------------------------------------
create or replace function public._next_backoff(p_attempt int)
returns interval
language sql immutable
as $$
  select case
    when p_attempt <= 0 then interval '1 minute'
    when p_attempt = 1 then interval '5 minutes'
    when p_attempt = 2 then interval '15 minutes'
    when p_attempt = 3 then interval '60 minutes'
    else interval '3 hours'
  end;
$$;


-- G) Success marker ---------------------------------------------------------
create or replace function public.queue_mark_sent(
  p_queue uuid,
  p_provider text,
  p_provider_thread_id text,
  p_provider_message_id text,
  p_log_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.send_queue
     set status = 'sent', locked_by = null, locked_at = null, next_attempt_at = null
   where id = p_queue;

  if p_provider_thread_id is not null then
    update public.inbox_threads t
       set provider = coalesce(t.provider, p_provider),
           provider_thread_id = coalesce(t.provider_thread_id, p_provider_thread_id)
     where t.id = (select thread_id from public.send_queue where id = p_queue);
  end if;

  perform public.log_delivery_event(p_log_id, 'sent', jsonb_build_object(
    'provider', p_provider,
    'provider_thread_id', p_provider_thread_id,
    'provider_message_id', p_provider_message_id
  ));
end;
$$;


-- H) Failure marker ---------------------------------------------------------
create or replace function public.queue_mark_fail(
  p_queue uuid, p_error text, p_hard boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt int;
  v_next interval;
begin
  select attempt_no into v_attempt from public.send_queue where id = p_queue;

  if v_attempt is null then
    v_attempt := 0;
  end if;

  if p_hard is true or v_attempt >= 4 then
    update public.send_queue
       set status = 'failed',
           error_last = left(p_error, 4000),
           locked_by = null,
           locked_at = null,
           next_attempt_at = null,
           attempt_no = v_attempt + 1
     where id = p_queue;
  else
    v_next := public._next_backoff(v_attempt);
    update public.send_queue
       set status = 'pending',
           error_last = left(p_error, 4000),
           locked_by = null,
           locked_at = null,
           next_attempt_at = now() + v_next,
           attempt_no = v_attempt + 1
     where id = p_queue;
  end if;
end;
$$;


-- I) Manual retry helper ----------------------------------------------------
create or replace function public.retry_queue_item(p_queue uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.send_queue
     set status = 'pending',
         next_attempt_at = now(),
         locked_at = null,
         locked_by = null
   where id = p_queue;
$$;


