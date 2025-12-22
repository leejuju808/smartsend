-- OOO auto-nudge support: campaign flags, follow-up helpers, and schedulers

-- A) Campaign feature flag + default tone/template wiring
alter table public.campaigns
  add column if not exists ooo_autonudge_enabled boolean not null default true,
  add column if not exists ooo_autonudge_tone text default 'friendly',
  add column if not exists ooo_autonudge_variant_id uuid;

comment on column public.campaigns.ooo_autonudge_enabled is 'Automatically schedule courtesy follow-up when a lead is out-of-office';
comment on column public.campaigns.ooo_autonudge_tone is 'Preferred tone for out-of-office courtesy nudges';
comment on column public.campaigns.ooo_autonudge_variant_id is 'Optional override to force a specific nudge variant for OOO courtesy follow-ups';

-- B) Ensure followup_tasks has fields to support scheduled auto-nudge
alter table public.followup_tasks
  add column if not exists kind text not null default 'generic',
  add column if not exists due_at timestamptz,
  add column if not exists variant_id uuid,
  add column if not exists status text not null default 'pending' check (status in ('pending','queued','sent','skipped','canceled')),
  add column if not exists resumed_at timestamptz;

create index if not exists idx_followup_tasks_due_at on public.followup_tasks(due_at) where status = 'pending';

-- C) Helper: compute next business day at a target hour:min (tz-naive; server UTC)
create or replace function public.next_business_morning(p_date date, p_hour int default 8, p_min int default 30)
returns timestamptz
language plpgsql
immutable
as $$
declare
  dt date := p_date;
begin
  if extract(isodow from dt) in (6, 7) then
    dt := dt + (8 - extract(isodow from dt))::int;
  end if;
  return (dt::timestamptz + make_interval(hours => p_hour, mins => p_min));
end;
$$;

-- D) RPC: schedule OOO auto-nudge (idempotent per thread)
create or replace function public.schedule_ooo_autonudge(p_thread_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread record;
  v_due timestamptz;
  v_variant uuid;
  v_task uuid;
begin
  select
    t.id,
    t.lead_id,
    t.campaign_id,
    t.ai_return_date,
    t.is_suppressed,
    c.ooo_autonudge_enabled,
    c.ooo_autonudge_tone,
    c.ooo_autonudge_variant_id
  into v_thread
  from public.inbox_threads t
  join public.campaigns c on c.id = t.campaign_id
  where t.id = p_thread_id;

  if v_thread.id is null or v_thread.ooo_autonudge_enabled = false then
    return null;
  end if;

  if coalesce(v_thread.is_suppressed, false) then
    return null;
  end if;

  if v_thread.ai_return_date is not null then
    v_due := public.next_business_morning((v_thread.ai_return_date + 1)::date, 8, 30);
  else
    v_due := public.next_business_morning((public.add_business_days(now(), 3))::date, 8, 30);
  end if;

  if v_thread.ooo_autonudge_variant_id is not null then
    v_variant := v_thread.ooo_autonudge_variant_id;
  else
    select v.id
    into v_variant
    from public.nudge_variants v
    where v.campaign_id = v_thread.campaign_id
      and v.scenario = 'out_of_office'
      and v.tone = v_thread.ooo_autonudge_tone
      and coalesce(v.is_active, true) = true
    order by random() * (1.0 / nullif(v.weight, 0))
    limit 1;
  end if;

  select id
  into v_task
  from public.followup_tasks
  where lead_id = v_thread.lead_id
    and kind = 'ooo_autonudge'
    and status in ('pending', 'queued')
  limit 1;

  if v_task is null then
    insert into public.followup_tasks (lead_id, kind, due_at, variant_id, paused, done, status)
    values (v_thread.lead_id, 'ooo_autonudge', v_due, v_variant, false, false, 'pending')
    returning id into v_task;
  else
    update public.followup_tasks
    set due_at = v_due,
        variant_id = coalesce(v_variant, variant_id)
    where id = v_task;
  end if;

  return v_task;
end;
$$;

-- E) Guard at execution time: skip if suppressed/positive/unsubscribe
create or replace function public.should_send_autonudge(p_lead_id uuid)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v record;
begin
  select
    l.email,
    l.campaign_id,
    c.owner_id as account_id,
    (
      select it.ai_intent
      from public.inbox_threads it
      where it.lead_id = l.id
      order by it.ai_classified_at desc nulls last
      limit 1
    ) as last_intent,
    exists (
      select 1
      from public.suppression_list s
      where s.email = lower(l.email)
        and (
          (s.scope = 'account' and s.account_id = c.owner_id)
          or (s.scope = 'campaign' and s.campaign_id = l.campaign_id)
        )
    ) as suppressed
  into v
  from public.leads l
  join public.campaigns c on c.id = l.campaign_id
  where l.id = p_lead_id;

  if v is null then
    return false;
  end if;

  if v.suppressed then
    return false;
  end if;

  if v.last_intent in ('positive', 'unsubscribe') then
    return false;
  end if;

  return true;
end;
$$;





