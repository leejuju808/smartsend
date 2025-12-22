-- Preview Scheduler Engine
-- Lead TZ resolver, safety checks, and preview engines for scheduling

-- A) Resolve a lead's timezone (fallback to account profile tz)
create or replace function public.lead_tz(p_lead uuid, p_account uuid)
returns text
language sql stable
as $$
  with l as (
    select
      coalesce(
        nullif((meta->>'tz')::text, ''),
        nullif((meta->>'timezone')::text, ''),
        nullif(tz, '')
      ) as tz_guess
    from public.leads
    where id = p_lead
  ),
  a as (
    select tz as acct_tz
    from public.account_sending_profiles
    where account_id = p_account
  )
  select coalesce(l.tz_guess, a.acct_tz, 'America/Los_Angeles')
  from l, a;
$$;

-- B) Soft-bounce count (30d) for a single lead
create or replace function public.soft_bounces_30d(p_lead uuid)
returns int
language sql stable
as $$
  select count(de.id)
  from public.send_logs sl
  left join public.delivery_events de on de.send_log_id = sl.id
  where sl.lead_id = p_lead
    and de.type = 'bounce'
    and coalesce(de.hard,false) = false
    and de.created_at > now() - interval '30 days';
$$;

-- C) Safety pre-check for a lead/account pair (suppression, reply stop, throttle)
create or replace function public.preview_lead_blockers(
  p_account uuid,
  p_campaign uuid,
  p_lead uuid
) returns table(
  blocked boolean,
  reason  text
)
language plpgsql stable
as $$
declare
  v_thread uuid;
  v_stopped boolean;
  v_replied timestamptz;
  v_owner uuid;
  v_email text;
  v_domain text;
  v_supp boolean;
  v_soft int;
begin
  -- resolve thread for this campaign/lead if present
  select id, stopped_by_reply, replied_at into v_thread, v_stopped, v_replied
  from public.inbox_threads
  where campaign_id = p_campaign and lead_id = p_lead
  order by created_at desc
  limit 1;

  if coalesce(v_stopped,false) or v_replied is not null then
    return query select true, 'stopped_by_reply';
    return;
  end if;

  -- owner & contact
  select user_id into v_owner from public.campaigns where id = p_campaign;
  select email, domain into v_email, v_domain from public.leads where id = p_lead;

  -- suppression (email or domain)
  select public.is_suppressed(v_owner, v_email, coalesce(v_domain, split_part(v_email,'@',2)))
  into v_supp;
  if coalesce(v_supp,false) then
    return query select true, 'suppressed';
    return;
  end if;

  -- soft-bounce throttle (policy: >=2 in 30d)
  select public.soft_bounces_30d(p_lead) into v_soft;
  if v_soft >= 2 then
    return query select true, 'soft_bounce_throttle';
    return;
  end if;

  return query select false, null::text;
end $$;

-- D) Single-lead preview (core)
create or replace function public.preview_next_send_at_for_lead(
  p_account uuid,
  p_campaign uuid,
  p_lead uuid,
  p_now timestamptz default now()
) returns table(
  lead_id uuid,
  allowed boolean,
  reason  text,
  window_at timestamptz,
  throttle_at timestamptz,
  daily_remaining int,
  scheduled_at timestamptz
)
language plpgsql stable
as $$
declare
  v_tz text;
  v_block boolean;
  v_reason text;
  v_win timestamptz;
  v_thr timestamptz;
  v_rem int;
  v_next timestamptz;
begin
  v_tz := public.lead_tz(p_lead, p_account);

  select blocked, reason into v_block, v_reason
  from public.preview_lead_blockers(p_account, p_campaign, p_lead);

  if v_block then
    return query select p_lead, false, v_reason, null::timestamptz, null::timestamptz, 0, null::timestamptz;
    return;
  end if;

  v_win := public.next_window_start(p_account, v_tz, p_now);
  v_thr := public.account_throttle_frees_at(p_account, p_now);
  v_rem := public.account_daily_remaining(p_account, greatest(v_win, v_thr));

  if v_rem <= 0 then
    -- next business window (tomorrow+)
    v_next := public.next_window_start(p_account, v_tz, greatest(v_win, v_thr) + interval '12 hours');
    v_next := public.next_window_start(p_account, v_tz, v_next + interval '12 hours');
  else
    v_next := greatest(v_win, v_thr);
  end if;

  return query select p_lead, true, null::text, v_win, v_thr, v_rem, v_next;
end $$;

-- E) Batch preview for a list of leads
create or replace function public.preview_schedule_batch(
  p_account uuid,
  p_campaign uuid,
  p_leads uuid[],
  p_now timestamptz default now()
) returns table(
  lead_id uuid,
  allowed boolean,
  reason  text,
  scheduled_at timestamptz
)
language sql stable
as $$
  select x.lead_id, x.allowed, x.reason, x.scheduled_at
  from (
    select (public.preview_next_send_at_for_lead(p_account, p_campaign, unnest(p_leads), p_now)).*
  ) as x;
$$;

-- F) Optional: preview for all queued items for a (campaign, step) on an account
create or replace function public.preview_schedule_for_step(
  p_account uuid,
  p_campaign uuid,
  p_step int,
  p_limit int default 200,
  p_now timestamptz default now()
) returns table(
  queue_id uuid,
  lead_id uuid,
  allowed boolean,
  reason text,
  scheduled_at timestamptz
)
language plpgsql stable
as $$
declare
  r record;
  v_lead_id uuid;
  v_allowed boolean;
  v_reason text;
  v_scheduled_at timestamptz;
begin
  for r in
    select q.id as queue_id, q.lead_id
    from public.send_queue q
    where q.account_id = p_account
      and q.status in ('queued','scheduled')
      and q.step_no = p_step
      and q.campaign_id = p_campaign
    order by coalesce(q.scheduled_at, q.not_before, q.created_at)
    limit p_limit
  loop
    select 
      lead_id, allowed, reason, scheduled_at 
    into 
      v_lead_id, v_allowed, v_reason, v_scheduled_at
    from public.preview_next_send_at_for_lead(p_account, p_campaign, r.lead_id, p_now)
    limit 1;
    
    return query select r.queue_id, v_lead_id, v_allowed, v_reason, v_scheduled_at;
  end loop;
end $$;

-- Grant execute permissions
grant execute on function public.lead_tz(uuid, uuid) to authenticated, anon, service_role;
grant execute on function public.soft_bounces_30d(uuid) to authenticated, anon, service_role;
grant execute on function public.preview_lead_blockers(uuid, uuid, uuid) to authenticated, anon, service_role;
grant execute on function public.preview_next_send_at_for_lead(uuid, uuid, uuid, timestamptz) to authenticated, anon, service_role;
grant execute on function public.preview_schedule_batch(uuid, uuid, uuid[], timestamptz) to authenticated, anon, service_role;
grant execute on function public.preview_schedule_for_step(uuid, uuid, int, int, timestamptz) to authenticated, anon, service_role;

