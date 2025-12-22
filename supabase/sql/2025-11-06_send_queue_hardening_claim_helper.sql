-- Queue hardening + claim/backoff helpers
-- Run in Supabase SQL (idempotent)

-- A) Ensure send_queue columns & indexes exist
create table if not exists public.send_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  from_account_id uuid not null references public.connected_accounts(id) on delete cascade,
  step_no int not null default 1,
  run_at timestamptz not null,
  status text not null default 'queued',
  attempt int not null default 0,
  last_error text,
  provider text,
  payload jsonb not null default '{}'::jsonb,
  provider_message_id text,
  provider_thread_id text
);

alter table public.send_queue
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists campaign_id uuid,
  add column if not exists lead_id uuid,
  add column if not exists from_account_id uuid,
  add column if not exists step_no int not null default 1,
  add column if not exists run_at timestamptz not null default now(),
  add column if not exists status text not null default 'queued',
  add column if not exists attempt int not null default 0,
  add column if not exists last_error text,
  add column if not exists provider text,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists provider_message_id text,
  add column if not exists provider_thread_id text;

alter table public.send_queue
  alter column step_no set default 1,
  alter column status set default 'queued',
  alter column attempt set default 0;

alter table public.send_queue
  add constraint send_queue_from_account_fk
    foreign key (from_account_id) references public.connected_accounts(id) on delete cascade;

do $$
begin
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.conname = 'send_queue_status_check'
      and n.nspname = 'public'
      and t.relname = 'send_queue'
  ) then
    alter table public.send_queue drop constraint send_queue_status_check;
  end if;
  alter table public.send_queue
    add constraint send_queue_status_check
    check (status in ('queued','sending','retry','sent','failed','paused','error'));
exception
  when others then
    raise notice 'send_queue_status_check constraint unchanged: %', sqlerrm;
end $$;

create index if not exists idx_sq_run_at_status on public.send_queue(run_at, status);
create index if not exists idx_sq_campaign on public.send_queue(campaign_id);
create index if not exists idx_sq_account on public.send_queue(from_account_id);
create index if not exists idx_sq_status on public.send_queue(status);


-- B) Touch updated_at on write
create or replace function public.tg_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sq_updated on public.send_queue;
create trigger trg_sq_updated
before update on public.send_queue
for each row execute function public.tg_touch_updated_at();


-- C) Claim helper (atomic, skip locked)
drop function if exists public.claim_send_jobs(uuid, int, timestamptz);

create or replace function public.claim_send_jobs(
  p_account uuid,
  p_limit int default 25,
  p_now timestamptz default now()
)
returns table(id uuid)
language sql
volatile
as $$
  with cte as (
    select id
    from public.send_queue
    where status in ('queued','retry')
      and from_account_id = p_account
      and run_at <= p_now
    order by run_at
    limit p_limit
    for update skip locked
  )
  update public.send_queue sq
     set status = 'sending',
         attempt = sq.attempt + 1,
         updated_at = now()
  from cte
  where sq.id = cte.id
  returning sq.id;
$$;

revoke all on function public.claim_send_jobs(uuid, int, timestamptz) from public;
grant execute on function public.claim_send_jobs(uuid, int, timestamptz) to service_role;


-- D) Backoff calculator
drop function if exists public.calc_backoff_seconds(int);

create or replace function public.calc_backoff_seconds(p_attempt int)
returns int
language sql
immutable
as $$
  select least(7200, greatest(15, (2 ^ greatest(0, p_attempt)) * 15));
$$;


-- E) Reschedule helper with backoff
drop function if exists public.reschedule_with_backoff(uuid, text);

create or replace function public.reschedule_with_backoff(
  p_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt int;
  v_delay int;
begin
  select attempt into v_attempt
  from public.send_queue
  where id = p_id;

  v_delay := public.calc_backoff_seconds(coalesce(v_attempt, 0));

  update public.send_queue
     set status = 'retry',
         run_at = now() + make_interval(secs => v_delay),
         last_error = left(coalesce(p_reason, ''), 8000)
   where id = p_id;
end;
$$;

revoke all on function public.reschedule_with_backoff(uuid, text) from public;
grant execute on function public.reschedule_with_backoff(uuid, text) to service_role;





