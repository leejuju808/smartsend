-- DB — core RPC: build day queue with timestamp placement
-- This builds tomorrow (or a chosen day) queue for a campaign:
-- Respects campaigns: tz, send_start, send_end, days_of_week, min_delay_minutes.
-- Uses campaign_effective_cap() (which already clamps to warmup/mailbox cap).
-- Skips suppressed leads, already sent, or already queued.
-- Places timestamps evenly from window start with min_delay_minutes spacing.

create or replace function public.build_campaign_queue_for_day(
  p_campaign uuid,
  p_date date default current_date
)
returns table(
  campaign_id uuid,
  scheduled_for date,
  window_start timestamptz,
  window_end   timestamptz,
  inserted int,
  skipped_existing int,
  capacity int
)
language plpgsql
security definer
set search_path=public
as $$
declare
  v_tz text;
  v_start time with time zone;
  v_end   time with time zone;
  v_days  int[];
  v_delay int;
  v_ws timestamptz;
  v_we timestamptz;
  v_cap int;
  v_room int;
  v_skipped int := 0;
  v_inserted int := 0;
begin
  -- Load campaign schedule
  select tz, send_start, send_end, days_of_week, min_delay_minutes
    into v_tz, v_start, v_end, v_days, v_delay
  from public.campaigns where id = p_campaign;

  if v_tz is null then v_tz := 'America/Los_Angeles'; end if;
  if v_delay is null or v_delay < 1 then v_delay := 6; end if;

  -- If the chosen date is not an active weekday, no-op
  if extract(dow from p_date)::int <> any (coalesce(v_days,'{1,2,3,4,5}'::int[])) then
    return query select p_campaign, p_date, null::timestamptz, null::timestamptz, 0, 0, 0;
    return;
  end if;

  -- Compute window [ws, we) in UTC
  v_ws := (p_date::timestamptz at time zone v_tz) + (v_start - time '00:00');
  v_we := (p_date::timestamptz at time zone v_tz) + (v_end   - time '00:00');

  -- Effective capacity for the day (warmup + campaign cap)
  v_cap := public.campaign_effective_cap(p_campaign);

  -- How many already scheduled for that campaign on that date?
  select count(*) into v_room
  from public.send_queue
  where campaign_id = p_campaign
    and status in ('queued','scheduled','sending','sent')  -- count sent too to not exceed cap
    and scheduled_at >= v_ws and scheduled_at < v_we;

  v_room := greatest(v_cap - v_room, 0);
  if v_room = 0 then
    return query select p_campaign, p_date, v_ws, v_we, 0, 0, v_cap;
    return;
  end if;

  -- Build candidate leads (not suppressed, not already sent ever, not already queued)
  -- Check both suppressed_emails (user-scoped) and suppressions (if exists) tables
  with cand as (
    select l.id as lead_id
    from public.campaign_leads cl
    join public.leads l on l.id = cl.lead_id
    join public.campaigns c on c.id = cl.campaign_id
    left join public.suppressed_emails se on se.user_id = c.user_id and lower(se.email) = lower(l.email)
    left join public.suppressed_recipients sr on lower(sr.email) = lower(l.email)
    left join public.suppressions s on lower(s.email) = lower(l.email)  -- fallback if this table exists
    left join public.send_queue q
      on q.campaign_id = cl.campaign_id and q.lead_id = l.id
         and q.status in ('queued','scheduled','sending','sent')  -- any activity -> skip
    where cl.campaign_id = p_campaign
      and se.id is null
      and sr.email is null
      and s.id is null
      and q.id is null
  ),
  -- Limit to today's available capacity
  pick as (
    select lead_id
    from cand
    order by lead_id -- deterministic; replace with priority/score if you have one
    limit v_room
  ),
  -- Generate send times with min_delay spacing
  slots as (
    select
      v_ws + make_interval(mins := (row_number() over (order by lead_id) - 1) * v_delay) as slot_ts,
      lead_id
    from pick
  )
  insert into public.send_queue (user_id, campaign_id, lead_id, status, scheduled_at)
  select
    -- user_id: pick the campaign owner; if you carry it elsewhere, adapt.
    (select user_id from public.campaigns where id = p_campaign),
    p_campaign,
    s.lead_id,
    'scheduled',
    s.slot_ts
  from slots s
  where s.slot_ts < v_we
  returning 1;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- Count would-be duplicates skipped by unique index
  -- (If conflict happened, it simply didn't return; we approximate by comparing desired vs inserted)
  v_skipped := v_room - v_inserted;

  return query select p_campaign, p_date, v_ws, v_we, v_inserted, greatest(v_skipped,0), v_cap;
end$$;

-- Grant execute permissions
grant execute on function public.build_campaign_queue_for_day(uuid, date) to authenticated;

