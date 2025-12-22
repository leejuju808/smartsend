-- Send queue core tables, pacing state, retry helpers, and dispatch RPCs

-- A) Main queue
create table if not exists public.send_queue (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  scheduled_at timestamptz not null default now(),
  picked_at timestamptz,
  finished_at timestamptz,
  account_id uuid not null references auth.users(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  identity_id uuid not null references public.send_identities(id) on delete restrict,
  lead_id uuid not null references public.leads(id) on delete cascade,
  subject text not null,
  body text not null,
  thread_key text,
  attempt int not null default 0,
  max_attempts int not null default 5,
  priority int not null default 100,
  status text not null default 'queued' check (status in ('queued','running','sent','failed','canceled')),
  last_error text
);

alter table public.send_queue
  alter column created_at set default now(),
  alter column scheduled_at set default now();

alter table public.send_queue
  add column if not exists picked_at timestamptz,
  add column if not exists finished_at timestamptz,
  add column if not exists account_id uuid references auth.users(id) on delete cascade,
  add column if not exists campaign_id uuid references public.campaigns(id) on delete cascade,
  add column if not exists identity_id uuid references public.send_identities(id) on delete restrict,
  add column if not exists lead_id uuid references public.leads(id) on delete cascade,
  add column if not exists subject text,
  add column if not exists body text,
  add column if not exists thread_key text,
  add column if not exists attempt int not null default 0,
  add column if not exists max_attempts int not null default 5,
  add column if not exists priority int not null default 100,
  add column if not exists status text not null default 'queued',
  add column if not exists last_error text;

alter table public.send_queue
  add constraint send_queue_status_check
    check (status in ('queued','running','sent','failed','canceled'))
  not valid;

create index if not exists idx_send_queue_sched on public.send_queue(status, scheduled_at, priority);
create index if not exists idx_send_queue_identity on public.send_queue(identity_id, status, scheduled_at);
create index if not exists idx_send_queue_campaign on public.send_queue(campaign_id);

-- B) Attempts journal
create table if not exists public.send_attempts (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  queue_id bigint not null references public.send_queue(id) on delete cascade,
  identity_id uuid not null,
  provider text not null,
  attempt int not null,
  request jsonb not null,
  response jsonb,
  status text not null check (status in ('ok','soft_fail','hard_fail'))
);

alter table public.send_attempts
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists queue_id bigint not null references public.send_queue(id) on delete cascade,
  add column if not exists identity_id uuid not null,
  add column if not exists provider text not null,
  add column if not exists attempt int not null,
  add column if not exists request jsonb not null,
  add column if not exists response jsonb,
  add column if not exists status text not null;

create index if not exists idx_send_attempts_queue on public.send_attempts(queue_id);

-- C) Per-identity pacing window
create table if not exists public.identity_pacing (
  identity_id uuid primary key references public.send_identities(id) on delete cascade,
  updated_at timestamptz not null default now(),
  window_start timestamptz not null default date_trunc('day', now()),
  sent_today int not null default 0,
  sent_last_minute int not null default 0,
  minute_start timestamptz not null default date_trunc('minute', now())
);

alter table public.identity_pacing
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists window_start timestamptz not null default date_trunc('day', now()),
  add column if not exists sent_today int not null default 0,
  add column if not exists sent_last_minute int not null default 0,
  add column if not exists minute_start timestamptz not null default date_trunc('minute', now());

-- D) OOO / suppression TTL
alter table public.account_suppressions
  add column if not exists expires_at timestamptz;

create index if not exists idx_account_suppressions_exp on public.account_suppressions(account_id, email, expires_at);

-- E) Row Level Security
alter table public.send_queue enable row level security;
alter table public.send_attempts enable row level security;
alter table public.identity_pacing enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'send_queue'
      and policyname = 'send_queue_read'
  ) then
    create policy send_queue_read on public.send_queue
      for select using (account_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'send_queue'
      and policyname = 'send_queue_insert'
  ) then
    create policy send_queue_insert on public.send_queue
      for insert with check (account_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'send_queue'
      and policyname = 'send_queue_update'
  ) then
    create policy send_queue_update on public.send_queue
      for update using (account_id = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'send_attempts'
      and policyname = 'send_attempts_read'
  ) then
    create policy send_attempts_read on public.send_attempts
      for select using (
        exists (
          select 1
          from public.send_queue q
          where q.id = queue_id
            and q.account_id = auth.uid()
        )
      );
  end if;
end $$;

-- F) Helper: exponential backoff with jitter
create or replace function public.next_backoff_seconds(
  p_attempt int,
  p_base int default 60,
  p_cap int default 3600
) returns int
language plpgsql
stable
as $$
declare
  v_attempt int := greatest(p_attempt - 1, 0);
  v_backoff int := p_base * (2 ^ v_attempt);
begin
  return least(p_cap, v_backoff) + floor(random() * 15)::int;
end
$$;

-- G) RPC: pick N eligible items respecting pacing & identity capacity
create or replace function public.pick_send_jobs(p_limit int default 25)
returns setof public.send_queue
language plpgsql
security definer
as $$
declare
  v_now timestamptz := now();
begin
  update public.identity_pacing
  set sent_last_minute = 0,
      minute_start = v_now,
      updated_at = v_now
  where minute_start < date_trunc('minute', v_now);

  return query
  with eligible as (
    select q.id
    from public.send_queue q
    join public.send_identities i on i.id = q.identity_id and i.is_active = true
    left join public.identity_pacing p on p.identity_id = i.id
    where q.status = 'queued'
      and q.scheduled_at <= v_now
      and (
        coalesce(p.sent_today, 0) <
        least(
          i.daily_limit,
          case
            when i.warmup_enabled then
              round(
                i.daily_limit * (i.warmup_stage::numeric / nullif(i.warmup_max_stage, 0))
              )
            else i.daily_limit
          end
        )
      )
      and coalesce(p.sent_last_minute, 0) < 60
    order by q.priority asc, q.scheduled_at asc
    limit p_limit
    for update skip locked
  )
  update public.send_queue q
     set picked_at = v_now,
         status = 'running'
   where q.id in (select id from eligible)
  returning *;
end
$$;

-- H) RPC: finalize attempt and advance pacing / reschedule
create or replace function public.finish_send_attempt(
  p_queue_id bigint,
  p_provider text,
  p_attempt_status text,
  p_request jsonb,
  p_response jsonb
) returns void
language plpgsql
security definer
as $$
declare
  q public.send_queue%rowtype;
  v_now timestamptz := now();
  v_next int;
begin
  select * into q from public.send_queue where id = p_queue_id;
  if not found then
    return;
  end if;

  insert into public.send_attempts(queue_id, identity_id, provider, attempt, request, response, status)
  values (q.id, q.identity_id, p_provider, q.attempt + 1, p_request, p_response, p_attempt_status);

  if p_attempt_status = 'ok' then
    update public.send_queue
      set status = 'sent',
          finished_at = v_now,
          attempt = q.attempt + 1,
          last_error = null
      where id = q.id;

    insert into public.identity_pacing(identity_id, window_start, sent_today, minute_start, sent_last_minute, updated_at)
    values (q.identity_id, date_trunc('day', v_now), 1, date_trunc('minute', v_now), 1, v_now)
    on conflict (identity_id) do update
      set window_start = greatest(excluded.window_start, public.identity_pacing.window_start),
          sent_today = case
            when excluded.window_start > public.identity_pacing.window_start then 1
            else public.identity_pacing.sent_today + 1
          end,
          minute_start = public.identity_pacing.minute_start,
          sent_last_minute = public.identity_pacing.sent_last_minute + 1,
          updated_at = v_now;

  elsif p_attempt_status = 'soft_fail' and q.attempt + 1 < q.max_attempts then
    v_next := public.next_backoff_seconds(q.attempt + 1, 60, 3600);

    update public.send_queue
      set status = 'queued',
          attempt = q.attempt + 1,
          scheduled_at = v_now + make_interval(secs => v_next),
          last_error = coalesce(p_response->>'error', 'soft_fail')
      where id = q.id;

  else
    update public.send_queue
      set status = 'failed',
          finished_at = v_now,
          attempt = q.attempt + 1,
          last_error = coalesce(p_response->>'error', 'hard_fail')
      where id = q.id;
  end if;
end
$$;



