-- Core sender safety tables
create table if not exists senders (
  id uuid primary key default gen_random_uuid(),
  from_address text unique not null,
  ramp_stage int not null default 0,
  daily_limit int not null default 25,
  days_in_stage int not null default 0,
  health_status text not null default 'green', -- green | yellow | red
  bounce_rate_30d numeric default 0,
  sent_today int not null default 0,
  last_checked_at timestamptz,
  last_reasons text[] default '{}',
  created_at timestamptz default now()
);

-- Events table (if you already have one, keep that and adapt the RPC below)
create table if not exists email_events (
  id uuid primary key default gen_random_uuid(),
  message_id uuid,
  from_address text not null,
  event_type text not null check (event_type in ('delivered','bounced','opened','replied','sent')),
  occurred_at timestamptz not null default now()
);

-- Helpful index for queries
create index if not exists email_events_from_date_idx
  on email_events (from_address, occurred_at desc);

-- DAILY RESET (sent_today back to 0) is assumed via your scheduler / cron outside SQL.

-- Increment days_in_stage once/day (example trigger you could run nightly)
-- For demo, we won't include a trigger—handle in your cron job / edge function.

-- RLS
alter table senders enable row level security;
alter table email_events enable row level security;

-- Simple policies (adjust to your tenancy model)
create policy "read senders"
  on senders for select
  to anon, authenticated
  using (true);

create policy "update senders (service)"
  on senders for update
  to service_role
  using (true)
  with check (true);

create policy "insert senders (service)"
  on senders for insert
  to service_role
  with check (true);

create policy "read events"
  on email_events for select
  to anon, authenticated
  using (true);

create policy "insert events (front ok)"
  on email_events for insert
  to anon, authenticated, service_role
  with check (true);

-- RPC to compute sender metrics over window (7d/30d/…)
create or replace function sender_metrics_window(p_from_address text, p_days_back int)
returns table(
  sent int,
  bounced int,
  sent_today int
) language plpgsql as $$
declare
  start_at timestamptz := now() - (p_days_back || ' days')::interval;
  start_of_day timestamptz := date_trunc('day', now());
begin
  return query
  with w as (
    select
      sum(case when event_type = 'sent' then 1 else 0 end) as sent,
      sum(case when event_type = 'bounced' then 1 else 0 end) as bounced
    from email_events
    where from_address = p_from_address
      and occurred_at >= start_at
  ),
  t as (
    select
      sum(case when event_type = 'sent' then 1 else 0 end) as sent_today
    from email_events
    where from_address = p_from_address
      and occurred_at >= start_of_day
  )
  select coalesce(w.sent,0)::int as sent,
         coalesce(w.bounced,0)::int as bounced,
         coalesce(t.sent_today,0)::int as sent_today
  from w, t;
end $$;