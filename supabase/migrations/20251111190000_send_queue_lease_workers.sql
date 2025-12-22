-- Queue hardening, DLQ, and lease helpers for sender-scoped workers (idempotent)

-- A) Queue columns & indexes ---------------------------------------------------
alter table public.send_queue
  add column if not exists to_email text,
  add column if not exists subject text,
  add column if not exists body text,
  add column if not exists body_html text,
  add column if not exists due_at timestamptz default now(),
  add column if not exists leased_at timestamptz,
  add column if not exists lease_token uuid,
  add column if not exists attempts int not null default 0,
  add column if not exists max_attempts int not null default 5,
  add column if not exists last_error text,
  add column if not exists backoff_until timestamptz,
  add column if not exists sender_email text;

update public.send_queue
   set sender_email = lower(sender_email)
 where sender_email is not null;

-- ensure status allows sending state
do $$
begin
  if exists (
    select 1
    from information_schema.constraint_column_usage
    where table_schema = 'public'
      and table_name = 'send_queue'
      and constraint_name = 'send_queue_status_check'
  ) then
    alter table public.send_queue drop constraint send_queue_status_check;
  end if;
exception
  when undefined_object then null;
end;
$$;

alter table public.send_queue
  add constraint send_queue_status_check
  check (status in ('queued','sending','sent','failed'));

create index if not exists idx_send_queue_due
  on public.send_queue(due_at)
  where status = 'queued';

create index if not exists idx_send_queue_backoff
  on public.send_queue(backoff_until)
  where status = 'queued';


-- B) Dead letter queue ---------------------------------------------------------
create table if not exists public.send_dead_letters (
  id uuid primary key,
  created_at timestamptz not null default now(),
  campaign_id uuid,
  lead_id uuid,
  to_email text,
  subject text,
  body text,
  attempts int,
  last_error text,
  meta jsonb
);


-- C) Per-sender concurrency budget ---------------------------------------------
create table if not exists public.sender_concurrency (
  email_from text primary key,
  max_parallel int not null default 3,
  per_minute_cap int not null default 30
);

insert into public.sender_concurrency(email_from, max_parallel, per_minute_cap)
values ('no-reply@yourbrand.com', 3, 30)
on conflict (email_from) do nothing;


-- D) Lease RPC -----------------------------------------------------------------
create or replace function public.lease_sends_for_sender(
  p_sender text,
  p_now timestamptz,
  p_limit int,
  p_token uuid
) returns setof public.send_queue
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.send_queue q
     set leased_at = p_now,
         lease_token = p_token,
         status = 'sending'
   where q.id in (
     select id
     from public.send_queue
     where status = 'queued'
       and sender_email = lower(p_sender)
       and coalesce(backoff_until, p_now - interval '1 second') <= p_now
       and coalesce(due_at, p_now) <= p_now
     order by due_at asc nulls last, created_at asc
     for update skip locked
     limit greatest(coalesce(p_limit, 0), 0)
   )
   returning *;
end;
$$;

grant execute on function public.lease_sends_for_sender(text, timestamptz, int, uuid) to service_role;


-- E) Release helpers -----------------------------------------------------------
create or replace function public.mark_send_success(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.send_queue
     set status = 'sent',
         leased_at = null,
         lease_token = null,
         backoff_until = null,
         last_error = null
   where id = p_id;
end;
$$;

grant execute on function public.mark_send_success(uuid) to service_role;


create or replace function public.mark_send_failure(
  p_id uuid,
  p_err text,
  p_now timestamptz,
  p_retry boolean,
  p_backoff_seconds int
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts int;
  v_max_attempts int;
begin
  select attempts, max_attempts
    into v_attempts, v_max_attempts
  from public.send_queue
  where id = p_id
  for update;

  if not found then
    return;
  end if;

  v_attempts := coalesce(v_attempts, 0);
  v_max_attempts := greatest(coalesce(v_max_attempts, 5), 1);

  if p_retry and (v_attempts + 1) < v_max_attempts then
    update public.send_queue
       set status = 'queued',
           attempts = v_attempts + 1,
           last_error = p_err,
           leased_at = null,
           lease_token = null,
           backoff_until = p_now + make_interval(secs => greatest(5, coalesce(p_backoff_seconds, 0))),
           due_at = greatest(coalesce(due_at, p_now), p_now)
     where id = p_id;
  else
    insert into public.send_dead_letters (
      id, campaign_id, lead_id, to_email, subject, body, attempts, last_error, meta
    )
    select
      p_id,
      campaign_id,
      lead_id,
      coalesce(to_email, payload->>'to', payload->>'to_email'),
      coalesce(subject, payload->>'subject'),
      coalesce(body, payload->>'body', payload->>'html', payload->>'text', body_html),
      v_attempts + 1,
      p_err,
      jsonb_build_object('final', true) || coalesce(payload, '{}'::jsonb)
    from public.send_queue
    where id = p_id
    on conflict (id) do update
      set attempts = excluded.attempts,
          last_error = excluded.last_error,
          meta = coalesce(send_dead_letters.meta, '{}'::jsonb) || excluded.meta;

    update public.send_queue
       set status = 'failed',
           attempts = v_attempts + 1,
           last_error = p_err,
           leased_at = null,
           lease_token = null
     where id = p_id;
  end if;
end;
$$;

grant execute on function public.mark_send_failure(uuid, text, timestamptz, boolean, int) to service_role;


