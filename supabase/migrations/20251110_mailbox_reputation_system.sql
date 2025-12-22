-- Mailbox Reputation & Warm-Up Ledger
-- Idempotent deployment of metrics tables, health scoring, guards, and cron schedules

-- Ensure required extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1) Daily mailbox metrics rollup -------------------------------------------------
create table if not exists public.mailbox_metrics (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  account_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  sent int not null default 0,
  delivered int not null default 0,
  opened int not null default 0,
  replied int not null default 0,
  bounced int not null default 0,
  complaints int not null default 0,
  unique (date, email)
);

create index if not exists mailbox_metrics_account_date_idx
  on public.mailbox_metrics (account_id, date desc);

alter table public.mailbox_metrics enable row level security;

drop policy if exists "mailbox_metrics_select_own" on public.mailbox_metrics;
create policy "mailbox_metrics_select_own"
  on public.mailbox_metrics
  for select
  using (account_id = auth.uid());

-- 2) Rolling mailbox health -------------------------------------------------------
create table if not exists public.mailbox_health (
  email text primary key,
  account_id uuid not null references auth.users (id) on delete cascade,
  reputation_score real not null default 100,
  send_limit int not null default 50,
  paused boolean not null default false,
  last_update timestamptz not null default now()
);

create index if not exists mailbox_health_account_idx
  on public.mailbox_health (account_id);

alter table public.mailbox_health enable row level security;

drop policy if exists "mailbox_health_select_own" on public.mailbox_health;
create policy "mailbox_health_select_own"
  on public.mailbox_health
  for select
  using (account_id = auth.uid());

drop policy if exists "mailbox_health_update_own" on public.mailbox_health;
create policy "mailbox_health_update_own"
  on public.mailbox_health
  for update
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

-- 3) Metrics aggregation function -------------------------------------------------
create or replace function public.recompute_mailbox_metrics()
returns void
language sql
as $$
  insert into public.mailbox_metrics (
    date,
    account_id,
    email,
    sent,
    delivered,
    opened,
    replied,
    bounced,
    complaints
  )
  select
    date_trunc('day', e.created_at)::date as metric_date,
    c.account_id,
    c.from_email,
    count(*) filter (where e.event = 'sent') as sent,
    count(*) filter (where e.event = 'delivered') as delivered,
    count(*) filter (where e.event = 'opened') as opened,
    count(*) filter (where e.event = 'replied') as replied,
    count(*) filter (where e.event = 'bounce') as bounced,
    count(*) filter (where e.event = 'complaint') as complaints
  from public.send_events e
  join public.campaigns c on c.id = e.campaign_id
  where e.created_at > now() - interval '2 days'
  group by 1, 2, 3
  on conflict (date, email) do update
    set sent = excluded.sent,
        delivered = excluded.delivered,
        opened = excluded.opened,
        replied = excluded.replied,
        bounced = excluded.bounced,
        complaints = excluded.complaints;
$$;

-- 4) Reputation score + throttling ------------------------------------------------
create or replace function public.update_mailbox_health()
returns void
language plpgsql
as $$
declare
  r record;
  score real;
  new_limit int;
begin
  for r in
    select
      email,
      account_id,
      avg((opened * 1.0) / nullif(delivered, 0)) as open_rate,
      avg((replied * 1.0) / nullif(delivered, 0)) as reply_rate,
      avg((bounced * 1.0) / nullif(sent, 0)) as bounce_rate,
      avg((complaints * 1.0) / nullif(sent, 0)) as complaint_rate
    from public.mailbox_metrics
    where date > now() - interval '7 days'
    group by email, account_id
  loop
    score := 100
      - (50 * coalesce(r.bounce_rate, 0))
      - (40 * coalesce(r.complaint_rate, 0))
      + (10 * coalesce(r.open_rate, 0))
      + (10 * coalesce(r.reply_rate, 0));

    score := greatest(0, least(100, score));

    if score > 90 then
      new_limit := 200;
    elsif score > 75 then
      new_limit := 100;
    elsif score > 60 then
      new_limit := 50;
    elsif score >= 40 then
      new_limit := 20;
    else
      new_limit := 0;
    end if;

    insert into public.mailbox_health (email, account_id, reputation_score, send_limit, paused)
    values (r.email, r.account_id, score, new_limit, score < 40)
    on conflict (email) do update
      set reputation_score = excluded.reputation_score,
          send_limit = excluded.send_limit,
          paused = excluded.paused,
          last_update = now();
  end loop;
end;
$$;

-- 5) Send queue guard -------------------------------------------------------------
create or replace function public.guard_mailbox_capacity()
returns trigger
language plpgsql
as $$
declare
  info record;
  current_inflight int;
begin
  select *
    into info
  from public.mailbox_health
  where email = new.from_email;

  if info.paused then
    raise exception 'Mailbox % paused for low reputation', new.from_email;
  end if;

  if info.send_limit is not null then
    select count(*)
      into current_inflight
    from public.send_queue
    where from_email = new.from_email
      and status in ('pending', 'queued', 'sending');

    if current_inflight >= info.send_limit then
      raise exception 'Send limit reached for %', new.from_email;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_mailbox on public.send_queue;
create trigger trg_guard_mailbox
  before insert on public.send_queue
  for each row
  execute function public.guard_mailbox_capacity();

-- 6) Low reputation alerting ------------------------------------------------------
create or replace function public.alert_low_reputation()
returns void
language sql
as $$
  insert into public.system_alerts (account_id, kind, message)
  select
    account_id,
    'reputation_low',
    format('Mailbox %s paused (score %.1f)', email, reputation_score)
  from public.mailbox_health
  where paused = true
    and last_update > now() - interval '1 hour'
  on conflict do nothing;
$$;

-- 7) Cron schedules (idempotent) --------------------------------------------------
do $$
begin
  perform cron.schedule(
    'metrics-daily',
    '10 0 * * *',
    $$select public.recompute_mailbox_metrics();$$
  );
exception
  when undefined_function then null;
  when invalid_schema_name then null;
  when duplicate_object then null;
  when others then
    if sqlstate = '23505' then
      null;
    else
      raise;
    end if;
end;
$$;

do $$
begin
  perform cron.schedule(
    'reputation-hourly',
    '0 * * * *',
    $$select public.update_mailbox_health();$$
  );
exception
  when undefined_function then null;
  when invalid_schema_name then null;
  when duplicate_object then null;
  when others then
    if sqlstate = '23505' then
      null;
    else
      raise;
    end if;
end;
$$;

do $$
begin
  perform cron.schedule(
    'warmup-adjust-hourly',
    '15 * * * *',
    $$
    select net.http_post(
      url := current_setting('app.supabase_url', true) || '/functions/v1/warmup-adjust',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key', true)
      ),
      body := '{}'::jsonb
    );
    $$
  );
exception
  when undefined_function then null;
  when invalid_schema_name then null;
  when duplicate_object then null;
  when others then
    if sqlstate = '23505' then
      null;
    else
      raise;
    end if;
end;
$$;

do $$
begin
  perform cron.schedule(
    'reputation-alerts',
    '*/30 * * * *',
    $$select public.alert_low_reputation();$$
  );
exception
  when undefined_function then null;
  when invalid_schema_name then null;
  when duplicate_object then null;
  when others then
    if sqlstate = '23505' then
      null;
    else
      raise;
    end if;
end;
$$;


