-- ============================================================
-- BLOCK 291000 — SmartSend Revenue Bug Bash v1
-- “Fix What Loses Money.”
--
-- Scope:
-- - Bug intake table: bug_reports
-- - Auto-capture from system failure sources
-- - Post-fix verification logging to audit_logs
-- - Hard rules: only critical/high severities
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1) Table: bug_reports (LOCKED fields)
-- ---------------------------------------------------------------------------
create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid null references public.roofing_companies(id) on delete set null,
  source text not null check (source in ('admin','user','system')),
  severity text not null check (severity in ('critical','high')),
  area text not null check (area in ('sending','followups','payments','dashboard','onboarding')),
  description text not null,
  status text not null default 'open' check (status in ('open','in_progress','fixed','verified')),
  created_at timestamptz not null default now(),
  fixed_at timestamptz null
);

create index if not exists idx_bug_reports_severity_status_created
  on public.bug_reports(severity, status, created_at desc);

create index if not exists idx_bug_reports_company_created
  on public.bug_reports(company_id, created_at desc) where company_id is not null;

-- Best-effort de-dupe for active bugs (prevents spam from auto-capture)
-- Note: company_id can be NULL; we coalesce to a sentinel for uniqueness.
do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'uq_bug_reports_active_dedupe'
  ) then
    execute $sql$
      create unique index uq_bug_reports_active_dedupe
      on public.bug_reports(
        coalesce(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
        area,
        description
      )
      where status <> 'verified'
    $sql$;
  end if;
end $$;

-- RLS: bug_reports is internal-only. UI accesses via server-side admin client.
alter table public.bug_reports enable row level security;
alter table public.bug_reports force row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='bug_reports' and policyname='bug_reports_service_role_all'
  ) then
    create policy bug_reports_service_role_all
      on public.bug_reports
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='bug_reports' and policyname='bug_reports_block_authenticated'
  ) then
    create policy bug_reports_block_authenticated
      on public.bug_reports
      for all
      to authenticated
      using (false)
      with check (false);
  end if;
exception when others then
  null;
end $$;

grant all on public.bug_reports to service_role;

-- ---------------------------------------------------------------------------
-- 2) Helper: create bug report with de-dupe
-- ---------------------------------------------------------------------------
create or replace function public.create_bug_report(
  p_company_id uuid,
  p_source text,
  p_severity text,
  p_area text,
  p_description text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  begin
    insert into public.bug_reports(company_id, source, severity, area, description, status)
    values (
      p_company_id,
      coalesce(nullif(p_source,''), 'system'),
      coalesce(nullif(p_severity,''), 'high'),
      coalesce(nullif(p_area,''), 'dashboard'),
      coalesce(nullif(p_description,''), 'Unknown bug'),
      'open'
    )
    returning id into v_id;
  exception when unique_violation then
    select br.id
      into v_id
    from public.bug_reports br
    where coalesce(br.company_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(p_company_id, '00000000-0000-0000-0000-000000000000'::uuid)
      and br.area = p_area
      and br.description = p_description
      and br.status <> 'verified'
    order by br.created_at desc
    limit 1;
  end;

  return v_id;
end;
$$;

revoke all on function public.create_bug_report(uuid, text, text, text, text) from public;
grant execute on function public.create_bug_report(uuid, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 3) Status hard rules:
--    - fixed_at set when status -> fixed
--    - verified allowed only from fixed
-- ---------------------------------------------------------------------------
create or replace function public._bug_reports_before_update()
returns trigger
language plpgsql
as $$
begin
  -- When moving to fixed, stamp fixed_at once.
  if new.status = 'fixed' and (old.status is distinct from 'fixed') then
    new.fixed_at := coalesce(new.fixed_at, now());
  end if;

  -- Manual verify must happen only after fixed (no blind closes).
  if new.status = 'verified' and (old.status is distinct from 'fixed') then
    raise exception 'Bug must be fixed before it can be verified.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bug_reports_before_update on public.bug_reports;
create trigger trg_bug_reports_before_update
before update on public.bug_reports
for each row
execute function public._bug_reports_before_update();

-- ---------------------------------------------------------------------------
-- 4) Post-fix verification: on status -> fixed, auto-log verification attempt
-- ---------------------------------------------------------------------------
create or replace function public._bug_autoverify_and_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean := false;
  v_reason text := null;
  v_target regclass := null;
begin
  if new.status = 'fixed' and (old.status is distinct from 'fixed') then
    -- Best-effort "auto-run": validate that the underlying surface exists.
    if new.area = 'sending' then
      v_target := to_regclass('public.delivery_logs');
      v_ok := (v_target is not null);
      v_reason := case when v_ok then 'delivery_logs_present' else 'delivery_logs_missing' end;
    elsif new.area = 'payments' then
      v_target := to_regclass('public.company_subscriptions');
      v_ok := (v_target is not null);
      v_reason := case when v_ok then 'company_subscriptions_present' else 'company_subscriptions_missing' end;
    elsif new.area = 'followups' then
      v_target := to_regclass('public.follow_up_events');
      v_ok := (v_target is not null);
      v_reason := case when v_ok then 'follow_up_events_present' else 'follow_up_events_missing' end;
    else
      v_ok := true;
      v_reason := 'no_autoverify_for_area';
    end if;

    -- Log to audit_logs (company-scoped when possible)
    insert into public.audit_logs(
      company_id,
      user_id,
      actor_id,
      action_type,
      action,
      related_id,
      entity,
      entity_id,
      meta
    )
    values (
      new.company_id,
      auth.uid(),
      auth.uid(),
      'bug_autoverify',
      'bug_autoverify',
      new.id,
      'bug_reports',
      new.id,
      jsonb_build_object(
        'bug_id', new.id,
        'area', new.area,
        'severity', new.severity,
        'ok', v_ok,
        'reason', v_reason
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bug_reports_autoverify_audit on public.bug_reports;
create trigger trg_bug_reports_autoverify_audit
after update of status on public.bug_reports
for each row
when (new.status is distinct from old.status)
execute function public._bug_autoverify_and_audit();

-- ---------------------------------------------------------------------------
-- 5) Auto-capture sources (SYSTEM)
--    - send failure (delivery_logs.status='failed') => critical/sending
--    - duplicate prevention (delivery_logs.status='duplicate_prevented') => high/sending
--    - follow-up miss (follow_up_events.status='failed') => high/followups
--    - payment failure (company_subscriptions.status -> past_due) => critical/payments
-- ---------------------------------------------------------------------------

-- 5.1 delivery_logs
create or replace function public._bug_autocapture_delivery_logs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_desc text;
begin
  if new.status = 'failed' then
    v_desc := 'Send failure: ' ||
      coalesce(nullif(new.error_message,''), 'unknown') ||
      ' (message_type=' || new.message_type ||
      ', related_id=' || coalesce(new.related_id::text, 'null') || ')';
    perform public.create_bug_report(new.company_id, 'system', 'critical', 'sending', v_desc);
  elsif new.status = 'duplicate_prevented' then
    v_desc := 'Duplicate prevented: ' ||
      'message_type=' || new.message_type ||
      ', related_id=' || coalesce(new.related_id::text, 'null');
    perform public.create_bug_report(new.company_id, 'system', 'high', 'sending', v_desc);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bug_autocapture_delivery_logs on public.delivery_logs;
create trigger trg_bug_autocapture_delivery_logs
after insert on public.delivery_logs
for each row
execute function public._bug_autocapture_delivery_logs();

-- 5.2 follow_up_events (best-effort, company_id unknown here)
create or replace function public._bug_autocapture_followup_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_desc text;
begin
  if new.status = 'failed' and (old.status is distinct from 'failed') then
    v_desc := 'Follow-up miss: rule_id=' || coalesce(new.rule_id::text, 'null') ||
      ', org_id=' || coalesce(new.org_id::text, 'null') ||
      ', error=' || coalesce(nullif(new.error_message,''), 'unknown');
    perform public.create_bug_report(null, 'system', 'high', 'followups', v_desc);
  end if;
  return new;
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='follow_up_events') then
    drop trigger if exists trg_bug_autocapture_followup_events on public.follow_up_events;
    create trigger trg_bug_autocapture_followup_events
      after update of status on public.follow_up_events
      for each row
      when (new.status is distinct from old.status)
      execute function public._bug_autocapture_followup_events();
  end if;
exception when others then
  null;
end $$;

-- 5.3 company_subscriptions payment failures
create or replace function public._bug_autocapture_company_subscriptions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_desc text;
begin
  if new.status = 'past_due' and (old.status is distinct from 'past_due') then
    v_desc := 'Payment failure: subscription past_due (plan=' || coalesce(new.plan,'unknown') ||
      ', stripe_subscription_id=' || coalesce(new.stripe_subscription_id,'') || ')';
    perform public.create_bug_report(new.company_id, 'system', 'critical', 'payments', v_desc);
  end if;
  return new;
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='company_subscriptions') then
    drop trigger if exists trg_bug_autocapture_company_subscriptions on public.company_subscriptions;
    create trigger trg_bug_autocapture_company_subscriptions
      after update of status on public.company_subscriptions
      for each row
      when (new.status is distinct from old.status)
      execute function public._bug_autocapture_company_subscriptions();
  end if;
exception when others then
  null;
end $$;

-- ---------------------------------------------------------------------------
-- 6) Metric helper: Revenue Risk badge
-- ---------------------------------------------------------------------------
create or replace function public.ss_revenue_risk()
returns table(
  critical_open int,
  high_open int,
  revenue_risk text
)
language sql
stable
security definer
set search_path = public
as $$
  with agg as (
    select
      count(*) filter (where severity = 'critical' and status in ('open','in_progress','fixed'))::int as critical_open,
      count(*) filter (where severity = 'high' and status in ('open','in_progress','fixed'))::int as high_open
    from public.bug_reports
  )
  select
    critical_open,
    high_open,
    case
      when critical_open > 0 then 'HIGH'
      when high_open > 3 then 'HIGH'
      when high_open > 0 then 'MED'
      else 'LOW'
    end as revenue_risk
  from agg;
$$;

revoke all on function public.ss_revenue_risk() from public;
grant execute on function public.ss_revenue_risk() to service_role;









