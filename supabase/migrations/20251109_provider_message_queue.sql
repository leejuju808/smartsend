-- Provider message ingestion queue & helpers

set check_function_bodies = off;

create table if not exists public.provider_message_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  run_at timestamptz not null default now(),
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook')),
  provider_message_id text not null,
  status text not null default 'queued' check (status in ('queued','working','done','failed','dead')),
  attempts int not null default 0,
  last_error text,
  priority int not null default 5,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists idx_pmq_account_run on public.provider_message_queue(account_id, run_at);
create index if not exists idx_pmq_status_prio on public.provider_message_queue(status, priority, run_at);
create index if not exists idx_pmq_provider_mid on public.provider_message_queue(provider, provider_message_id);
create index if not exists idx_pmq_account_status on public.provider_message_queue(account_id, status);

create unique index if not exists uq_pmq_dedupe
  on public.provider_message_queue(account_id, provider, provider_message_id)
  where status in ('queued','working','failed');


create table if not exists public.provider_message_payloads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  account_id uuid not null references public.connected_accounts(id) on delete cascade,
  provider text not null check (provider in ('gmail','outlook')),
  provider_message_id text not null,
  fetched_at timestamptz not null default now(),
  payload jsonb not null
);

create unique index if not exists uq_pmp_account_mid on public.provider_message_payloads(account_id, provider_message_id);


alter table public.provider_message_queue enable row level security;
alter table public.provider_message_payloads enable row level security;

drop policy if exists "pmq_read" on public.provider_message_queue;
create policy "pmq_read" on public.provider_message_queue
  for select to authenticated
  using (false);

drop policy if exists "pmp_read" on public.provider_message_payloads;
create policy "pmp_read" on public.provider_message_payloads
  for select to authenticated
  using (false);


create or replace function public.enqueue_provider_messages(
  p_account uuid,
  p_provider text,
  p_ids text[],
  p_run_at timestamptz default now(),
  p_priority int default 5
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_id text;
begin
  if p_provider not in ('gmail','outlook') then
    raise exception 'bad provider';
  end if;

  if p_ids is null or array_length(p_ids, 1) is null then
    return 0;
  end if;

  foreach v_id in array p_ids loop
    insert into public.provider_message_queue (account_id, provider, provider_message_id, run_at, priority)
    values (p_account, p_provider, v_id, p_run_at, p_priority)
    on conflict (account_id, provider, provider_message_id) where status in ('queued','working','failed')
    do update
      set run_at = least(public.provider_message_queue.run_at, excluded.run_at),
          priority = least(public.provider_message_queue.priority, excluded.priority);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.enqueue_provider_messages(uuid, text, text[], timestamptz, int) from public;
grant execute on function public.enqueue_provider_messages(uuid, text, text[], timestamptz, int) to authenticated;
grant execute on function public.enqueue_provider_messages(uuid, text, text[], timestamptz, int) to service_role;


create or replace function public.pmq_retry_delay(p_attempts int)
returns interval
language sql
stable
as $$
  select case
    when coalesce(p_attempts, 0) <= 0 then interval '1 minute'
    when p_attempts = 1 then interval '5 minutes'
    when p_attempts = 2 then interval '15 minutes'
    when p_attempts = 3 then interval '1 hour'
    else interval '6 hours'
  end;
$$;

grant execute on function public.pmq_retry_delay(int) to service_role;


create or replace function public.claim_provider_jobs(
  p_account uuid,
  p_limit int default 15
)
returns setof public.provider_message_queue
language sql
security definer
set search_path = public
as $$
  with locked as (
    select id
    from public.provider_message_queue
    where account_id = p_account
      and status = 'queued'
      and run_at <= now()
    order by priority asc, run_at asc
    limit greatest(coalesce(p_limit, 0), 0)
    for update skip locked
  )
  update public.provider_message_queue q
     set status = 'working',
         attempts = q.attempts + 1
   where q.id in (select id from locked)
   returning q.*;
$$;

revoke all on function public.claim_provider_jobs(uuid, int) from public;
grant execute on function public.claim_provider_jobs(uuid, int) to service_role;


