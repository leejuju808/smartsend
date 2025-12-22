-- Campaign Scheduling Rework
-- Introduces campaign_schedules table, helper functions, pacing views, and drip planning RPC.

-- A) Per-campaign schedule + cadence
create table if not exists public.campaign_schedules (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  updated_at timestamptz not null default now(),
  start_at timestamptz not null,
  end_at timestamptz,
  batch_size int not null default 60,
  drip_per_minute int not null default 1,
  tz_window jsonb not null default '{"start":9,"end":17}'::jsonb,
  days jsonb not null default '["Mon","Tue","Wed","Thu","Fri"]'::jsonb,
  balance_mode text not null default 'proportional' check (balance_mode in ('proportional','round_robin')),
  reply_guard boolean not null default true,
  max_daily_per_identity int,
  constraint campaign_schedules_positive_batch check (batch_size > 0),
  constraint campaign_schedules_positive_drip check (drip_per_minute > 0)
);

alter table public.campaign_schedules enable row level security;

do $$
begin
  create policy if not exists campaign_schedules_rw on public.campaign_schedules
    for all using (
      exists (
        select 1
        from public.campaigns c
        where c.id = campaign_id
          and c.account_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1
        from public.campaigns c
        where c.id = campaign_id
          and c.account_id = auth.uid()
      )
    );
exception
  when duplicate_object then
    null;
end
$$;

-- B) Lead timezone (nullable; fallback by country or domain if missing)
alter table public.leads
  add column if not exists timezone text;

-- C) Helper: is allowed weekday (Mon..Sun)
create or replace function public.is_allowed_day(p_day int, p_days jsonb)
returns boolean
language sql
immutable
as $$
  select case p_day
    when 1 then 'Mon'
    when 2 then 'Tue'
    when 3 then 'Wed'
    when 4 then 'Thu'
    when 5 then 'Fri'
    when 6 then 'Sat'
    else 'Sun'
  end in (
    select jsonb_array_elements_text(coalesce(p_days, '["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]'::jsonb))
  );
$$;

-- D) Compute recipient-local next allowed minute from a UTC hint and tz_window
create or replace function public.next_in_recipient_window(
  p_hint_utc timestamptz,
  p_tz text,
  p_window jsonb,
  p_days jsonb
) returns timestamptz
language plpgsql
immutable
as $$
declare
  v_tz text := coalesce(p_tz, 'Etc/UTC');
  v_start int := coalesce((p_window ->> 'start')::int, 9);
  v_end int := coalesce((p_window ->> 'end')::int, 17);
  v_local timestamptz;
  v_day int;
  v_hour int;
begin
  v_local := p_hint_utc at time zone v_tz;
  v_day := extract(isodow from v_local);
  v_hour := extract(hour from v_local);

  if not public.is_allowed_day(v_day, p_days) then
    loop
      v_local := date_trunc('day', v_local) + interval '1 day' + make_interval(hours => v_start);
      v_day := extract(isodow from v_local);
      exit when public.is_allowed_day(v_day, p_days);
    end loop;
  elsif v_hour < v_start then
    v_local := date_trunc('day', v_local) + make_interval(hours => v_start);
  elsif v_hour >= v_end then
    v_local := date_trunc('day', v_local) + interval '1 day' + make_interval(hours => v_start);
    while not public.is_allowed_day(extract(isodow from v_local), p_days) loop
      v_local := date_trunc('day', v_local) + interval '1 day' + make_interval(hours => v_start);
    end loop;
  end if;

  return v_local at time zone v_tz at time zone 'UTC';
end
$$;

-- E) Rolling reply rate (yesterday) per identity to guard pacing
create or replace view public.v_identity_reply_health as
select
  i.id as identity_id,
  coalesce(sum(case when a.kind = 'reply_detected' then 1 else 0 end)::numeric, 0)
    / nullif(sum(case when a.kind = 'email_sent' then 1 else 0 end), 0) as reply_rate
from public.send_identities i
left join public.activities a
  on a.identity_id = i.id
 and a.created_at >= (current_date - 1)
 and a.created_at < current_date
group by i.id;

-- F) Recommended per-minute cap per identity (reply-aware)
create or replace view public.v_identity_minute_caps as
select
  i.id as identity_id,
  greatest(
    1,
    case
      when h.reply_rate is null then 8
      when h.reply_rate >= 0.12 then 2
      when h.reply_rate >= 0.07 then 4
      when h.reply_rate >= 0.04 then 6
      else 8
    end
  ) as cap_per_minute
from public.send_identities i
left join public.v_identity_reply_health h
  on h.identity_id = i.id
where i.is_active = true;

-- G) RPC — plan & enqueue a balanced drip
create or replace function public.plan_and_enqueue_drip(
  p_campaign_id uuid,
  p_now timestamptz default now()
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sched public.campaign_schedules%rowtype;
  v_policy public.send_policies%rowtype;
  v_account uuid;
  v_target record;
  v_enqueued int := 0;
  v_caps int;
  v_base_now timestamptz := p_now;
  v_scheduled_at timestamptz;
  v_identity record;
begin
  select c.account_id into v_account
  from public.campaigns c
  where c.id = p_campaign_id;

  if v_account is null then
    return 0;
  end if;

  select * into v_sched
  from public.campaign_schedules
  where campaign_id = p_campaign_id;

  if not found then
    return 0;
  end if;

  if v_sched.start_at is null then
    return 0;
  end if;

  if v_sched.end_at is not null and p_now > v_sched.end_at then
    return 0;
  end if;

  select * into v_policy
  from public.send_policies
  where account_id = v_account;

  create temporary table tmp_caps on commit drop as
  select
    i.id as identity_id,
    least(
      coalesce(v_sched.max_daily_per_identity, i.daily_limit),
      least(
        i.daily_limit,
        case
          when i.warmup_enabled and i.warmup_max_stage > 0 then
            round(i.daily_limit * (i.warmup_stage::numeric / i.warmup_max_stage))
          else
            i.daily_limit
        end
      )
    ) as daily,
    greatest(
      1,
      case
        when coalesce(v_sched.reply_guard, true) then
          coalesce(
            (select cap_per_minute from public.v_identity_minute_caps m where m.identity_id = i.id),
            v_sched.drip_per_minute
          )
        else
          v_sched.drip_per_minute
      end
    ) as per_minute
  from public.send_identities i
  where i.account_id = v_account
    and i.is_active = true;

  select coalesce(sum(daily), 0) into v_caps from tmp_caps;
  if v_caps = 0 then
    return 0;
  end if;

  for v_target in
    select
      t.lead_id,
      l.email,
      coalesce(l.timezone, 'Etc/UTC') as tz
    from public.campaign_targets t
    join public.leads l on l.id = t.lead_id
    left join public.send_queue q
      on q.campaign_id = t.campaign_id
     and q.lead_id = t.lead_id
    where t.campaign_id = p_campaign_id
      and q.id is null
    limit v_sched.batch_size
  loop
    if v_sched.balance_mode = 'round_robin' then
      select *
      into v_identity
      from tmp_caps
      order by identity_id
      limit 1;
    else
      select *
      into v_identity
      from tmp_caps
      order by daily desc, identity_id
      limit 1;
    end if;

    if v_identity.identity_id is null then
      exit;
    end if;

    with queued as (
      select count(*) as c
      from public.send_queue
      where identity_id = v_identity.identity_id
        and status in ('queued','running')
        and scheduled_at >= date_trunc('minute', v_base_now)
        and scheduled_at < date_trunc('minute', v_base_now) + interval '1 minute'
    )
    select public.next_in_recipient_window(
             v_base_now + make_interval(secs => coalesce((select c from queued), 0) * (60.0 / greatest(v_identity.per_minute, 1))),
             v_target.tz,
             v_sched.tz_window,
             v_sched.days
           )
      into v_scheduled_at;

    insert into public.send_queue(
      account_id,
      campaign_id,
      identity_id,
      lead_id,
      subject,
      body,
      scheduled_at,
      priority,
      thread_key
    )
    select
      v_account,
      p_campaign_id,
      v_identity.identity_id,
      v_target.lead_id,
      coalesce(t.subject, 'Hello {{first_name}}'),
      coalesce(t.body, 'Quick question — {{custom_line}}'),
      v_scheduled_at,
      100,
      (p_campaign_id::text || ':' || v_target.lead_id::text)
    from public.campaign_targets t
    where t.campaign_id = p_campaign_id
      and t.lead_id = v_target.lead_id;

    v_enqueued := v_enqueued + 1;

    update tmp_caps
      set daily = greatest(daily - 1, 0)
    where identity_id = v_identity.identity_id;

    delete from tmp_caps
    where daily <= 0;

    if (select count(*) from tmp_caps) = 0 then
      exit;
    end if;
  end loop;

  return v_enqueued;
end
$$;

-- H) Helper RPC to list due campaigns
create or replace function public.list_due_campaigns(p_limit int default 20)
returns table(id uuid)
language sql
security definer
set search_path = public
as $$
  select c.id
  from public.campaigns c
  join public.campaign_schedules s on s.campaign_id = c.id
  where c.status = 'scheduled'
    and s.start_at <= now()
    and (s.end_at is null or s.end_at > now())
  order by s.updated_at desc
  limit p_limit;
$$;


