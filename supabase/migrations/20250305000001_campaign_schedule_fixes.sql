-- Campaign scheduling helper fixes
-- - normalize next_in_recipient_window timezone math
-- - improve plan_and_enqueue_drip capacity handling & round-robin rotation

-- A) next_in_recipient_window returns a stable UTC timestamptz
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
  v_tz text := coalesce(nullif(p_tz, ''), 'Etc/UTC');
  v_start int := greatest(0, least(23, coalesce((p_window ->> 'start')::int, 9)));
  v_end int := greatest(v_start + 1, least(24, coalesce((p_window ->> 'end')::int, 17)));
  v_local timestamp;
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

  return (v_local at time zone v_tz);
end
$$;

-- B) Improve plan_and_enqueue_drip rotation and guard temp table creation
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
  v_queue_count int;
  v_hint timestamptz;
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

  if v_sched.end_at is not null and v_base_now > v_sched.end_at then
    return 0;
  end if;

  select * into v_policy
  from public.send_policies
  where account_id = v_account;

  execute 'drop table if exists tmp_caps';

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
    )::int as daily,
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
    )::int as per_minute,
    'epoch'::timestamptz as last_assigned
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
      order by last_assigned, identity_id
      limit 1;
    else
      select *
      into v_identity
      from tmp_caps
      order by daily desc, identity_id
      limit 1;
    end if;

    if not found or v_identity.identity_id is null then
      exit;
    end if;

    select count(*) into v_queue_count
    from public.send_queue
    where identity_id = v_identity.identity_id
      and status in ('queued', 'running')
      and scheduled_at >= date_trunc('minute', v_base_now)
      and scheduled_at < date_trunc('minute', v_base_now) + interval '1 minute';

    v_hint := v_base_now
      + make_interval(secs => coalesce(v_queue_count, 0) * (60.0 / greatest(v_identity.per_minute, 1)));

    v_scheduled_at := public.next_in_recipient_window(
      v_hint,
      v_target.tz,
      v_sched.tz_window,
      v_sched.days
    );

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
      set
        daily = greatest(daily - 1, 0),
        last_assigned = v_scheduled_at
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


