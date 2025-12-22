-- SmartSend Warm-Up & Sending Guardrails
-- Run this in your Supabase SQL editor

-- Per‑workspace sending policy (simple warm‑up schedule)
create table if not exists public.send_policies (
  workspace_id uuid primary key,
  warmup_enabled boolean default true,
  ramp_start_per_day int not null default 25,
  weekly_increment int not null default 25,
  ramp_max_per_day int not null default 500,
  domain_max_per_day int not null default 200,
  global_max_per_day int not null default 1000,
  ramp_start_date date not null default current_date,
  bounce_window_days int not null default 7,
  bounce_rate_threshold numeric not null default 0.05, -- 5%
  cooldown_minutes int not null default 1440,
  updated_at timestamptz not null default now()
);

alter table public.send_policies enable row level security;
create policy if not exists send_policies_rw on public.send_policies for all
  using (workspace_id = current_setting('app.workspace_id', true)::uuid)
  with check (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- Daily counters per domain
create table if not exists public.send_counters (
  workspace_id uuid not null,
  domain citext not null,
  day date not null,
  sent_count int not null default 0,
  last_sent_at timestamptz,
  cooldown_until timestamptz,
  primary key (workspace_id, domain, day)
);

alter table public.send_counters enable row level security;
create index if not exists idx_send_counters_ws_day on public.send_counters(workspace_id, day);
create policy if not exists send_counters_rw on public.send_counters for all
  using (workspace_id = current_setting('app.workspace_id', true)::uuid)
  with check (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- Optional: audit each guarded attempt
create table if not exists public.sending_audit (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  domain citext not null,
  to_email citext not null,
  allowed boolean not null,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.sending_audit enable row level security;
create policy if not exists sending_audit_rw on public.sending_audit for all
  using (workspace_id = current_setting('app.workspace_id', true)::uuid)
  with check (workspace_id = current_setting('app.workspace_id', true)::uuid);

-- Helper: compute allowed cap for today based on ramp
create or replace function app.allowed_cap(
  p_ramp_start_per_day int,
  p_weekly_increment int,
  p_ramp_max_per_day int,
  p_ramp_start_date date,
  p_today date
) returns int language sql immutable as $$
  select least(
    p_ramp_max_per_day,
    p_ramp_start_per_day + greatest(0, (extract(epoch from (p_today - p_ramp_start_date)) / 86400)::int / 7) * p_weekly_increment
  );
$$;

-- Helper: get recent bounce rate (workspace‑level or domain specific)
-- Domain '' (empty) = workspace aggregate
create or replace function app.bounce_stats(
  p_workspace uuid,
  p_domain text,
  p_window_days int
) returns table(bounces int, total int, rate numeric) language sql stable as $$
  with recent as (
    select lower(split_part(email, '@', 2)) as domain,
           event_type
    from public.bounces
    where campaign_id in (
      select id from public.campaigns where user_id in (
        select id from public.profiles where workspace_id = p_workspace
      )
    )
      and created_at >= now() - (p_window_days || ' days')::interval
  )
  select
    sum(case when type in ('hard','soft','complaint') then 1 else 0 end) as bounces,
    count(*) as total,
    case when count(*) = 0
         then 0
         else sum(case when type in ('hard','soft','complaint') then 1 else 0 end)::numeric
              / count(*)::numeric end as rate
  from recent
  where (p_domain = '' or domain = lower(p_domain));
$$;

-- Atomic reservation: increment today's counter iff below limit
create or replace function app.reserve_send(
  p_workspace uuid,
  p_domain text,
  p_day date,
  p_limit int
) returns boolean language plpgsql as $$
declare ok boolean;
begin
  with upsert as (
    insert into public.send_counters(workspace_id, domain, day, sent_count, last_sent_at)
    values (p_workspace, lower(p_domain), p_day, 1, now())
    on conflict (workspace_id, domain, day)
    do update set sent_count = public.send_counters.sent_count + 1,
                  last_sent_at = now()
      where public.send_counters.sent_count < p_limit
    returning 1
  )
  select exists(select 1 from upsert) into ok;
  return ok;
end $$;

-- Seed default policy for existing workspaces
insert into public.send_policies (workspace_id)
select distinct workspace_id from public.profiles
where workspace_id is not null
  and not exists (select 1 from public.send_policies sp where sp.workspace_id = profiles.workspace_id)
on conflict (workspace_id) do nothing; 