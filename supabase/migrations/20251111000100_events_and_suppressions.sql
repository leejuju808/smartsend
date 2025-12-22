-- Events, Suppression, and Reverify Queue schema updates

-- A) Canonical inbound system events
create table if not exists public.inbound_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid references public.leads(id) on delete cascade,
  thread_id uuid references public.threads(id) on delete cascade,
  provider text not null,
  kind text not null check (kind in ('bounce','ooo','block','spam','vacation')),
  subtype text,
  raw jsonb
);

create index if not exists idx_inbound_events_lead on public.inbound_events(lead_id, created_at desc);
create index if not exists idx_inbound_events_thread on public.inbound_events(thread_id, created_at desc);
create index if not exists idx_inbound_events_kind on public.inbound_events(kind);

-- B) Per-email suppression (source of truth)
create table if not exists public.suppressions_email (
  email citext primary key,
  reason text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

-- C) Domain-level suppression
create table if not exists public.suppressions_domain (
  domain citext primary key,
  reason text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

-- D) Reverification queue
create table if not exists public.reverify_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email citext not null,
  lead_id uuid references public.leads(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','verified','invalid','error')),
  attempts int not null default 0,
  last_attempt_at timestamptz,
  result jsonb
);

create index if not exists idx_reverify_email on public.reverify_queue(email);

-- E) OOO schedule table (auto-reschedule target)
create table if not exists public.ooo_schedules (
  thread_id uuid primary key references public.threads(id) on delete cascade,
  return_at timestamptz not null,
  detected_from_event uuid references public.inbound_events(id) on delete set null
);

-- F) Convenience views
create or replace view public.v_lead_suppressed as
select
  l.id as lead_id,
  l.email,
  (
    exists (
      select 1
      from public.suppressions_email se
      where se.email = l.email
        and (se.expires_at is null or se.expires_at > now())
    )
    or exists (
      select 1
      from public.suppressions_domain sd
      where sd.domain = split_part(l.email, '@', 2)
        and (sd.expires_at is null or sd.expires_at > now())
    )
  ) as is_suppressed
from public.leads l;

-- G) Guardrails in send queue
alter table public.send_queue add column if not exists guard_reason text;

create or replace function public.guard_send_queue()
returns trigger
language plpgsql
as $$
declare
  v_suppressed boolean;
  v_return_at timestamptz;
begin
  select is_suppressed into v_suppressed
  from public.v_lead_suppressed
  where lead_id = new.lead_id;

  if coalesce(v_suppressed, false) then
    new.status := 'blocked';
    new.guard_reason := 'suppressed';
    return new;
  end if;

  select return_at into v_return_at
  from public.ooo_schedules
  where thread_id = new.thread_id;

  if v_return_at is not null and v_return_at > now() then
    new.scheduled_for := v_return_at;
    new.guard_reason := 'ooo_rescheduled';
  end if;

  return new;
end
$$;

drop trigger if exists trg_guard_send_queue on public.send_queue;

create trigger trg_guard_send_queue
before insert on public.send_queue
for each row
execute function public.guard_send_queue();

-- H) RPC for domain hard bounce counts (support edge functions)
create or replace function public.domain_hard_bounce_count(p_domain text)
returns table(count int)
language sql
as $$
  select count(*)::int
  from public.inbound_events e
  join public.leads l on l.id = e.lead_id
  where e.kind = 'bounce'
    and (
      e.subtype = 'hard'
      or (e.raw ->> 'smtp_code') like '5.%'
    )
    and split_part(l.email, '@', 2) = p_domain
    and e.created_at >= now() - interval '7 days';
$$;

-- I) Schedule reverification runner (requires pg_cron & net extension support)
create extension if not exists pg_cron;

do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'reverify_runner_5min') then
    perform cron.unschedule('reverify_runner_5min');
  end if;

  perform cron.schedule(
    'reverify_runner_5min',
    '*/5 * * * *',
    $$
    select net.http_post(
      url := current_setting('app.supabase_edge_base') || '/reverify-runner',
      headers := '{"Authorization":"Bearer ' || current_setting('app.service_jwt') || '"}'
    );
    $$
  );
end;
$cron$ language plpgsql;

