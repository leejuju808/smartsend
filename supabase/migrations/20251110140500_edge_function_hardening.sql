-- Edge function hardening: rate limiting, invocation logging, net worker queue, and concurrency guards.

-- Ensure required extensions exist.
create extension if not exists pgcrypto with schema public;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Token bucket rate limiting primitives
-- ---------------------------------------------------------------------------

create table if not exists public.rate_buckets (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  tokens real not null default 60,
  updated_at timestamptz not null default now(),
  unique(scope)
);

create or replace function public.rl_take(
  p_scope text,
  p_cost real default 1,
  p_refill_rate real default 1,
  p_cap real default 60
)
returns boolean
language plpgsql
as $$
declare
  v_tokens real;
  v_updated timestamptz;
  v_now timestamptz := now();
begin
  insert into public.rate_buckets(scope, tokens)
  values (p_scope, p_cap)
  on conflict (scope) do nothing;

  select tokens, updated_at
  into v_tokens, v_updated
  from public.rate_buckets
  where scope = p_scope
  for update;

  v_tokens := least(
    p_cap,
    v_tokens + extract(epoch from (v_now - v_updated)) * (p_refill_rate / 1.0)
  );

  if v_tokens < p_cost then
    update public.rate_buckets
    set tokens = v_tokens, updated_at = v_now
    where scope = p_scope;
    return false;
  end if;

  update public.rate_buckets
  set tokens = v_tokens - p_cost, updated_at = v_now
  where scope = p_scope;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function invocation logging
-- ---------------------------------------------------------------------------

create table if not exists public.fn_invocations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  fn text not null,
  payload jsonb,
  status_code int,
  latency_ms int,
  error_text text
);

create index if not exists idx_fn_invocations_fn
  on public.fn_invocations(fn);

create index if not exists idx_fn_invocations_created
  on public.fn_invocations(created_at);

-- ---------------------------------------------------------------------------
-- Reliable pg_net job queue
-- ---------------------------------------------------------------------------

create table if not exists public.net_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  url text not null,
  headers jsonb not null default '{}'::jsonb,
  body text,
  status text not null default 'queued',
  tries int not null default 0,
  max_tries int not null default 6,
  next_run_at timestamptz not null default now(),
  last_error text,
  tag text
);

create index if not exists idx_net_jobs_status
  on public.net_jobs(status, next_run_at);

create index if not exists idx_net_jobs_tag
  on public.net_jobs(tag);

create or replace function public.net_enqueue(
  p_url text,
  p_headers jsonb,
  p_body text,
  p_tag text default null,
  p_delay_sec int default 0
)
returns uuid
language sql
as $$
  insert into public.net_jobs(url, headers, body, tag, next_run_at)
  values (
    p_url,
    coalesce(p_headers, '{}'::jsonb),
    p_body,
    p_tag,
    now() + make_interval(secs => p_delay_sec)
  )
  returning id
$$;

create or replace function public.net_claim_job()
returns table(id uuid, url text, headers jsonb, body text)
language plpgsql
as $$
begin
  return query
  with j as (
    select id
    from public.net_jobs
    where status = 'queued'
      and next_run_at <= now()
    order by created_at asc
    limit 1
    for update skip locked
  )
  update public.net_jobs nj
     set status = 'running'
  where nj.id in (select id from j)
  returning nj.id, nj.url, nj.headers, nj.body;
end;
$$;

create or replace function public.net_finish_job(
  p_id uuid,
  p_ok boolean,
  p_error text default null
)
returns void
language plpgsql
as $$
declare
  v_tries int;
  v_max int;
  v_next timestamptz;
begin
  select tries, max_tries
  into v_tries, v_max
  from public.net_jobs
  where id = p_id
  for update;

  if not found then
    return;
  end if;

  if p_ok then
    update public.net_jobs
       set status = 'done',
           tries = v_tries + 1,
           last_error = null
     where id = p_id;
  else
    v_tries := v_tries + 1;
    if v_tries >= v_max then
      update public.net_jobs
         set status = 'dead',
             tries = v_tries,
             last_error = p_error
       where id = p_id;
    else
      v_next := now() + make_interval(secs => power(2, v_tries) * 30);
      update public.net_jobs
         set status = 'queued',
             tries = v_tries,
             last_error = p_error,
             next_run_at = v_next
       where id = p_id;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Health metrics view (24h)
-- ---------------------------------------------------------------------------

create or replace view public.v_fn_health_24h as
with windowed as (
  select *
  from public.fn_invocations
  where created_at >= now() - interval '24 hours'
)
select
  fn,
  count(*) as total,
  avg(latency_ms)::int as lat_avg_ms,
  percentile_disc(0.95) within group (order by latency_ms) as lat_p95_ms,
  sum(case when status_code between 200 and 299 then 1 else 0 end)::int as ok_count,
  sum(case when status_code between 500 and 599 then 1 else 0 end)::int as err5xx_count,
  (sum(case when status_code between 200 and 299 then 1 else 0 end)::float / nullif(count(*), 0)) as success_rate
from windowed
group by fn
order by fn;

-- ---------------------------------------------------------------------------
-- Advisory lock helpers
-- ---------------------------------------------------------------------------

create or replace function public.lock_thread(p_thread uuid)
returns boolean
language plpgsql
as $$
begin
  return pg_try_advisory_lock(
    ('x' || substr(replace(p_thread::text, '-', ''), 1, 16))::bit(64)::bigint
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- pg_cron scheduling for net worker
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('net-worker-1');
exception
  when undefined_function then
    -- pg_cron not available; ignore.
    null;
end;
$$;

select cron.schedule(
  'net-worker-1',
  '* * * * *',
  $$select net.http_post(
      url := public.edge_base_url() || '/net-worker',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || current_setting('app.settings.service_role_key', true)
      )
  );$$
);

create or replace function public.unlock_thread(p_thread uuid)
returns void
language plpgsql
as $$
begin
  perform pg_advisory_unlock(
    ('x' || substr(replace(p_thread::text, '-', ''), 1, 16))::bit(64)::bigint
  );
end;
$$;

