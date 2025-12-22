-- 1) Extend send_queue with retry + error tracking columns
alter table if exists public.send_queue
  add column if not exists attempts int not null default 0,
  add column if not exists max_attempts int not null default 6,
  add column if not exists last_error text,
  add column if not exists error_code text,
  add column if not exists next_backoff_at timestamptz,
  add column if not exists last_attempt_at timestamptz;

create index if not exists idx_send_queue_next_backoff on public.send_queue(next_backoff_at);
create index if not exists idx_send_queue_status_time on public.send_queue(status, created_at);


-- 2) Normalized error codes and guidance
create table if not exists public.send_failure_codes (
  code text primary key,
  pattern text not null,
  severity text not null default 'transient' check (severity in ('transient','permanent','manual')),
  guidance text not null
);

insert into public.send_failure_codes (code, pattern, severity, guidance) values
  ('quota',        '%Rate limit%|%Daily user limit%|%Too many requests%', 'transient', 'Hit provider rate cap; Send Guard will ease up. Increase warm-up or lower batch.'),
  ('smtp_auth',    '%Invalid Credentials%|%Authentication failed%',       'manual',    'Re-auth mailbox in Settings → Email Accounts.'),
  ('dns_spf',      '%SPF%fail%|%550 5.7.26%|%SPF not permitted%',         'manual',    'Fix SPF for your sending domain. Add include for provider.'),
  ('dns_dkim',     '%DKIM%fail%|%signature%bad%',                         'manual',    'Publish DKIM keys; wait DNS to propagate.'),
  ('mx_temp',      '%451%|%4.2.0%|%try again later%|%Greylist%',          'transient', 'Recipient server temporary issue; we will retry automatically.'),
  ('mailbox_full', '%Mailbox full%|%quota exceeded%',                     'transient', 'Recipient mailbox full; retries may work later.'),
  ('rejected',     '%550 5.1.1%|%user unknown%|%No such user%',           'permanent', 'Invalid address. Suppressing lead.'),
  ('content',      '%policy%violation%|%spam%detected%',                  'manual',    'Content flagged. Tweak copy, lower links, warm up domain.')
on conflict (code) do nothing;


-- 3) Error classifier helper
create or replace function public.classify_error(p_text text)
returns text
language plpgsql
stable
as $$
declare
  v_code text;
begin
  if p_text is null or length(trim(p_text)) = 0 then
    return 'unknown';
  end if;

  select c.code
    into v_code
    from public.send_failure_codes c
    cross join lateral regexp_split_to_table(c.pattern, '\\|') as pat
    where lower(p_text) like lower(pat)
    limit 1;

  return coalesce(v_code, 'unknown');
end;
$$;


-- 4) Retry scheduler with exponential backoff + jitter
create or replace function public.schedule_retry(p_id uuid, p_reason text)
returns void
language plpgsql
as $$
declare
  v_attempts int;
  v_max int;
  v_last_error text;
  v_code text;
  v_delay int;
  v_jitter int;
  v_next timestamptz;
  v_lead uuid;
begin
  select attempts, max_attempts, coalesce(last_error, p_reason), lead_id
    into v_attempts, v_max, v_last_error, v_lead
    from public.send_queue
   where id = p_id
   for update;

  if not found then
    return;
  end if;

  v_code := public.classify_error(v_last_error);

  -- Terminal states
  if (coalesce(v_attempts, 0) + 1) >= v_max
     or v_code in ('rejected', 'smtp_auth', 'dns_spf', 'dns_dkim', 'content') then

    update public.send_queue
       set status = case
           when v_code = 'quota' then 'blocked_quota'
           else 'failed'
         end,
           attempts = coalesce(v_attempts, 0) + 1,
           error_code = v_code,
           last_error = p_reason,
           next_backoff_at = null,
           last_attempt_at = now(),
           updated_at = now()
     where id = p_id;

    if v_code = 'rejected' and v_lead is not null then
      update public.send_queue q
         set status = 'canceled',
             canceled_reason = 'invalid_email',
             updated_at = now()
       where q.lead_id = v_lead
         and q.status = 'pending';
    end if;

    return;
  end if;

  -- Quota handling → stay blocked until guard frees up
  if v_code = 'quota' then
    update public.send_queue
       set status = 'blocked_quota',
           attempts = coalesce(v_attempts, 0) + 1,
           error_code = v_code,
           last_error = p_reason,
           next_backoff_at = null,
           last_attempt_at = now(),
           updated_at = now()
     where id = p_id;
    return;
  end if;

  -- Deferred retry with exp backoff (base 2) + jitter, capped at 6h
  v_delay := least(360, power(2, greatest(coalesce(v_attempts, 0), 0))::int * 2);
  v_jitter := floor(random() * 5)::int;
  v_next := now() + make_interval(mins => v_delay + v_jitter);

  update public.send_queue
     set status = 'deferred',
         attempts = coalesce(v_attempts, 0) + 1,
         error_code = v_code,
         last_error = p_reason,
         next_backoff_at = v_next,
         last_attempt_at = now(),
         updated_at = now()
   where id = p_id;
end;
$$;


-- 5) Operational views
create or replace view public.v_outbox_failed as
select q.id,
       q.account_id,
       q.lead_id,
       q.attempts,
       q.max_attempts,
       q.last_error,
       q.error_code,
       q.updated_at
  from public.send_queue q
 where q.status = 'failed'
 order by q.updated_at desc;

create or replace view public.v_outbox_deferred as
select q.id,
       q.account_id,
       q.lead_id,
       q.attempts,
       q.next_backoff_at,
       q.last_error,
       q.error_code
  from public.send_queue q
 where q.status = 'deferred'
 order by q.next_backoff_at asc nulls last;

create or replace view public.v_outbox_stuck as
select q.id,
       q.account_id,
       q.lead_id,
       q.created_at,
       now() - q.created_at as age
  from public.send_queue q
 where q.status = 'pending'
   and (q.not_before is null or q.not_before < now() - interval '1 hour')
 order by q.created_at asc;

create or replace view public.v_outbox_blocked as
select q.id,
       q.account_id,
       q.lead_id,
       q.created_at,
       q.last_error,
       q.error_code
  from public.send_queue q
 where q.status = 'blocked_quota'
 order by q.created_at desc;


-- 6) Helper RPC to requeue stale pendings
create or replace function public.requeue_stuck(p_minutes int default 60)
returns int
language plpgsql
as $$
declare
  n int;
begin
  update public.send_queue
     set status = 'pending',
         not_before = now(),
         updated_at = now()
   where status = 'pending'
     and (not_before is null or not_before < now() - make_interval(mins => p_minutes));

  get diagnostics n = row_count;
  return n;
end;
$$;


-- 7) Cron helpers for deferred + stuck queues
create or replace function public.deferred_wakeup()
returns int
language plpgsql
as $$
declare
  n int;
begin
  update public.send_queue
     set status = 'pending',
         next_backoff_at = null,
         updated_at = now()
   where status = 'deferred'
     and next_backoff_at is not null
     and next_backoff_at <= now();

  get diagnostics n = row_count;
  return n;
end;
$$;

-- Cron schedules (no-op if pg_cron not installed)
do $$
begin
  perform cron.schedule('outbox-deferred-wakeup','*/5 * * * *', $$select public.deferred_wakeup();$$);
exception
  when undefined_function then null;
  when invalid_schema_name then null;
end;
$$;

do $$
begin
  perform cron.schedule('outbox-requeue-stuck-hourly','15 * * * *', $$select public.requeue_stuck(60);$$);
exception
  when undefined_function then null;
  when invalid_schema_name then null;
end;
$$;








