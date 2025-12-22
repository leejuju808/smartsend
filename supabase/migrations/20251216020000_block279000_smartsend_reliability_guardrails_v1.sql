-- ============================================================
-- BLOCK 279000 — SmartSend Reliability Guardrails v1
-- “Never Break in Front of Customers”
--
-- Adds:
-- 1) delivery_logs (mandatory attempt logging)
-- 2) send_idempotency_keys (hard duplicate prevention)
-- 3) company_sending_state (pause / last error)
-- 4) company_send_limits (per-company conservative caps)
-- 5) helper RPCs used by API routes + workers
-- ============================================================

-- A) delivery_logs (MANDATORY)
create table if not exists public.delivery_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  related_id uuid,
  message_type text not null check (message_type in ('estimate','followup','outreach','proposal')),
  status text not null check (status in ('sent','blocked','failed','duplicate_prevented')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_delivery_logs_company_created on public.delivery_logs(company_id, created_at desc);
create index if not exists idx_delivery_logs_company_status_created on public.delivery_logs(company_id, status, created_at desc);
create index if not exists idx_delivery_logs_related on public.delivery_logs(related_id, created_at desc) where related_id is not null;

-- B) Idempotency keys (CRITICAL)
create table if not exists public.send_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  send_idempotency_key text not null,
  related_id uuid,
  message_type text not null check (message_type in ('estimate','followup','outreach','proposal')),
  step_number int not null default 0,
  created_at timestamptz not null default now(),
  unique (company_id, send_idempotency_key)
);

create index if not exists idx_send_idem_company_created on public.send_idempotency_keys(company_id, created_at desc);

-- C) Company sending state (fail-safe modes + auto-protection)
create table if not exists public.company_sending_state (
  company_id uuid primary key,
  paused boolean not null default false,
  paused_at timestamptz,
  paused_reason text,
  manual_resume_required boolean not null default false,
  last_error text,
  last_error_at timestamptz,
  updated_at timestamptz not null default now()
);

-- D) Per-company send limits (conservative)
create table if not exists public.company_send_limits (
  company_id uuid primary key,
  max_per_hour int not null default 30,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- E) Helper: write a delivery log row (ALWAYS log attempts)
create or replace function public.log_delivery_attempt(
  p_company_id uuid,
  p_related_id uuid,
  p_message_type text,
  p_status text,
  p_error_message text default null
) returns uuid
language plpgsql
security definer
as $$
declare
  v_id uuid;
begin
  insert into public.delivery_logs(company_id, related_id, message_type, status, error_message)
  values (p_company_id, p_related_id, p_message_type, p_status, nullif(p_error_message,''))
  returning id into v_id;
  return v_id;
end;
$$;

-- F) Helper: idempotency claim (true if acquired; false if duplicate)
create or replace function public.try_claim_send_idempotency(
  p_company_id uuid,
  p_send_idempotency_key text,
  p_related_id uuid,
  p_message_type text,
  p_step_number int default 0
) returns boolean
language plpgsql
security definer
as $$
begin
  insert into public.send_idempotency_keys(company_id, send_idempotency_key, related_id, message_type, step_number)
  values (p_company_id, p_send_idempotency_key, p_related_id, p_message_type, coalesce(p_step_number,0))
  on conflict (company_id, send_idempotency_key) do nothing;

  return found;
end;
$$;

-- G) Helper: rate limit check (per company per hour)
create or replace function public.is_company_rate_limited(p_company_id uuid)
returns boolean
language sql
security definer
as $$
  with lim as (
    select max_per_hour, enabled
    from public.company_send_limits
    where company_id = p_company_id
  ),
  cfg as (
    select coalesce((select max_per_hour from lim), 30) as max_per_hour,
           coalesce((select enabled from lim), true) as enabled
  ),
  cnt as (
    select count(*)::int as sent_last_hour
    from public.delivery_logs
    where company_id = p_company_id
      and status = 'sent'
      and created_at >= now() - interval '1 hour'
  )
  select cfg.enabled and (select sent_last_hour from cnt) >= cfg.max_per_hour
  from cfg;
$$;

-- H) Helper: company pause state
create or replace function public.get_company_sending_state(p_company_id uuid)
returns table (
  paused boolean,
  paused_reason text,
  manual_resume_required boolean,
  last_error text,
  last_error_at timestamptz
)
language sql
security definer
as $$
  select
    coalesce(s.paused,false) as paused,
    s.paused_reason,
    coalesce(s.manual_resume_required,false) as manual_resume_required,
    s.last_error,
    s.last_error_at
  from public.company_sending_state s
  where s.company_id = p_company_id;
$$;

-- I) Helper: set pause (manual resume)
create or replace function public.pause_company_sending(
  p_company_id uuid,
  p_reason text,
  p_error text
) returns void
language plpgsql
security definer
as $$
begin
  insert into public.company_sending_state(company_id, paused, paused_at, paused_reason, manual_resume_required, last_error, last_error_at, updated_at)
  values (p_company_id, true, now(), nullif(p_reason,''), true, nullif(p_error,''), now(), now())
  on conflict (company_id) do update set
    paused = true,
    paused_at = now(),
    paused_reason = excluded.paused_reason,
    manual_resume_required = true,
    last_error = excluded.last_error,
    last_error_at = excluded.last_error_at,
    updated_at = now();
end;
$$;

-- J) Helper: resume (manual)
create or replace function public.resume_company_sending(p_company_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.company_sending_state(company_id, paused, paused_at, paused_reason, manual_resume_required, updated_at)
  values (p_company_id, false, null, null, false, now())
  on conflict (company_id) do update set
    paused = false,
    paused_at = null,
    paused_reason = null,
    manual_resume_required = false,
    updated_at = now();
end;
$$;

-- K) Auto-protection: if 3 failures in 10 minutes -> pause
create or replace function public.maybe_auto_pause_company(p_company_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_failures int;
begin
  select count(*)::int
    into v_failures
  from public.delivery_logs
  where company_id = p_company_id
    and status = 'failed'
    and created_at >= now() - interval '10 minutes';

  if v_failures >= 3 then
    perform public.pause_company_sending(
      p_company_id,
      'auto_protection',
      'Sending paused due to repeated delivery failures. Manual resume required.'
    );
    return true;
  end if;

  return false;
end;
$$;

-- L) RLS: allow authenticated read own company logs via roofing_companies.owner_id
alter table public.delivery_logs enable row level security;
alter table public.send_idempotency_keys enable row level security;
alter table public.company_sending_state enable row level security;
alter table public.company_send_limits enable row level security;

-- service role can manage
grant all on public.delivery_logs to service_role;
grant all on public.send_idempotency_keys to service_role;
grant all on public.company_sending_state to service_role;
grant all on public.company_send_limits to service_role;

-- NOTE: Policies are best-effort and must not break existing schemas.
do $$
begin
  -- delivery_logs select: company owner can view
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='delivery_logs' and policyname='delivery_logs_owner_select'
  ) then
    create policy delivery_logs_owner_select
      on public.delivery_logs
      for select
      using (
        exists (
          select 1
          from public.roofing_companies rc
          where rc.id = delivery_logs.company_id
            and rc.owner_id = auth.uid()
        )
      );
  end if;

  -- Block writes for authenticated (only service role / security definer funcs)
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='delivery_logs' and policyname='delivery_logs_block_writes'
  ) then
    create policy delivery_logs_block_writes
      on public.delivery_logs
      for all to authenticated
      using (false) with check (false);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='company_sending_state' and policyname='company_sending_state_owner_select'
  ) then
    create policy company_sending_state_owner_select
      on public.company_sending_state
      for select
      using (
        exists (
          select 1
          from public.roofing_companies rc
          where rc.id = company_sending_state.company_id
            and rc.owner_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='company_sending_state' and policyname='company_sending_state_block_writes'
  ) then
    create policy company_sending_state_block_writes
      on public.company_sending_state
      for all to authenticated
      using (false) with check (false);
  end if;
exception when others then
  -- If roofing_companies or auth context differs, don't fail migration.
  null;
end $$;










