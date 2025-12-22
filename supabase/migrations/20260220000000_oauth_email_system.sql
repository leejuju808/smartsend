-- A) Connected accounts: OAuth + provider info

alter table public.connected_accounts
  add column if not exists provider text check (provider in ('gmail','outlook')),
  add column if not exists from_name text,
  add column if not exists from_email text,
  add column if not exists timezone text default 'America/Los_Angeles',
  add column if not exists oauth_access_token text,
  add column if not exists oauth_refresh_token text,
  add column if not exists oauth_expires_at timestamptz,
  add column if not exists provider_user_id text,  -- gmail "me" email or MS user id
  add column if not exists provider_domain text;

create index if not exists idx_connected_accounts_provider on public.connected_accounts(provider);

-- B) Send queue: retry/backoff

alter table public.send_queue
  add column if not exists attempts int not null default 0,
  add column if not exists last_error text,
  add column if not exists next_attempt_at timestamptz;

create index if not exists idx_sq_due on public.send_queue(status, next_attempt_at, scheduled_for);

-- C) Simple backoff calculator

create or replace function public.compute_backoff(attempts int)
returns interval language sql immutable as $$
  select make_interval(secs => least(3600, (2 ^ greatest(0, attempts)) * 10)); -- 10s,20s,40s,80s,... cap 1h
$$;

-- D) Helper to mark retry

create or replace function public.mark_queue_retry(p_id uuid, p_err text)
returns void language plpgsql security definer as $$
begin
  update public.send_queue
     set status = 'queued',
         attempts = attempts + 1,
         last_error = left(p_err, 500),
         next_attempt_at = now() + public.compute_backoff(attempts + 1)
   where id = p_id;
end; $$;

-- E) Update pop function to respect next_attempt_at

create or replace function public.pop_due_queue_batch(p_limit int default 25)
returns table(id uuid, campaign_id uuid, account_id uuid, lead_id uuid, step_no int, attempts int)
language sql security definer
as $$
  with cte as (
    select id
    from public.send_queue
    where status = 'queued'
      and (next_attempt_at is null or next_attempt_at <= now())
      and scheduled_for <= now()
    order by coalesce(next_attempt_at, scheduled_for) asc
    limit p_limit
    for update skip locked
  ), upd as (
    update public.send_queue sq
       set status = 'dispatched'
     where id in (select id from cte)
     returning sq.id, sq.campaign_id, sq.account_id, sq.lead_id, sq.step_no, sq.attempts
  )
  select * from upd;
$$;

