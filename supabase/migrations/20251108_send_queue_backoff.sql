-- Send queue backoff + helpers

-- A) Add retry/backoff columns
alter table public.send_queue
  add column if not exists next_attempt_at timestamptz,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists backoff_exp int not null default 0,          -- exponent for 2^n backoff
  add column if not exists last_status text;                            -- 'temporary' | 'permanent'

create index if not exists idx_sq_ready
  on public.send_queue (status, next_attempt_at)
  where status = 'queued';


-- B) Helper: compute next attempt with cap + jitter
create or replace function public.compute_next_attempt(p_exp int)
returns timestamptz
language plpgsql
as $$
declare
  -- base = 2^exp minutes; cap at 60 minutes
  minutes int := least((1 << greatest(p_exp,0)), 60);
  -- jitter 80%–120%
  jitter numeric := (80 + floor(random()*41))::numeric / 100.0;
begin
  return now() + (make_interval(mins => minutes) * jitter);
end$$;


-- C) Helper: on failure → bump counters + schedule next attempt
create or replace function public.record_send_failure(p_id uuid, p_permanent boolean default false)
returns void
language plpgsql
as $$
begin
  update public.send_queue
     set status = case when p_permanent then 'dead' else 'queued' end,
         fail_count = coalesce(fail_count,0) + 1,
         backoff_exp = case when p_permanent then backoff_exp else least(backoff_exp + 1, 10) end,
         next_attempt_at = case when p_permanent then null else public.compute_next_attempt(backoff_exp + 1) end,
         last_attempt_at = now(),
         last_status = case when p_permanent then 'permanent' else 'temporary' end,
         picked_at = null
   where id = p_id;
end$$;


-- D) Helper: on success → reset backoff and timestamps
create or replace function public.record_send_success(p_id uuid)
returns void language sql as $$
  update public.send_queue
     set status='sent',
         sent_at=now(),
         next_attempt_at=null,
         last_attempt_at=now(),
         backoff_exp=0,
         last_status=null,
         picked_at=null
   where id=p_id;
$$;


-- E) Dequeue: only items that are due
create or replace function public.dequeue_send_queue_due(p_limit int default 10)
returns setof public.send_queue
language plpgsql
as $$
declare r public.send_queue%rowtype;
begin
  for r in
    select *
      from public.send_queue
     where status = 'queued'
       and (next_attempt_at is null or next_attempt_at <= now())
     order by coalesce(priority,0) desc, coalesce(next_attempt_at, queued_at) nulls last, created_at
     limit p_limit
  loop
    update public.send_queue
       set status='picked', picked_at=now()
     where id = r.id and status='queued';
    if found then return next r; end if;
  end loop;
end$$;


-- F) Reaper: unstick old 'picked' (crashes/timeouts)
create or replace function public.reap_stale_picks(p_older_than_mins int default 5)
returns int
language sql
as $$
  with u as (
    update public.send_queue
       set status='queued', picked_at=null,
           next_attempt_at = coalesce(next_attempt_at, now())      -- retry immediately if previously null
     where status='picked' and picked_at < now() - make_interval(mins => p_older_than_mins)
     returning 1
  )
  select count(*) from u;
$$;



