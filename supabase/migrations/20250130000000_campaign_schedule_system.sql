-- Campaign Schedule System
-- Adds schedule fields to campaigns and helper RPCs for schedule management

-- A) Add schedule fields on campaigns (non-breaking)
alter table public.campaigns
  add column if not exists tz text default 'America/Los_Angeles',
  add column if not exists send_start time with time zone default '09:00',
  add column if not exists send_end   time with time zone default '17:00',
  add column if not exists days_of_week int[] default '{1,2,3,4,5}', -- 0=Sun..6=Sat
  add column if not exists daily_cap_override int, -- null => use connected_account.daily_cap
  add column if not exists min_delay_minutes int default 6; -- spacing between sends

-- B) Normalize/guard function (enforce sane schedule)
create or replace function public.normalize_campaign_schedule(
  p_id uuid, p_tz text, p_start time with time zone, p_end time with time zone,
  p_days int[], p_cap int, p_min_delay int
) returns void
language plpgsql security definer set search_path=public as $$
begin
  if p_start >= p_end then
    raise exception 'send_start must be before send_end';
  end if;
  update public.campaigns
     set tz = coalesce(p_tz,'America/Los_Angeles'),
         send_start = p_start,
         send_end = p_end,
         days_of_week = coalesce(p_days,'{1,2,3,4,5}'::int[]),
         daily_cap_override = case when p_cap is null or p_cap < 1 then null else p_cap end,
         min_delay_minutes = greatest(1, coalesce(p_min_delay,6))
   where id = p_id;
end$$;

-- C) Compute effective daily cap (override > account cap)
create or replace function public.campaign_effective_cap(p_campaign uuid)
returns int language plpgsql stable as $$
declare
  v_override int;
  v_acc_cap int;
begin
  -- Get campaign override
  select daily_cap_override into v_override
  from public.campaigns where id = p_campaign;
  
  -- Try to get account cap from send_queue (if campaign has queued items)
  select ca.daily_cap into v_acc_cap
  from public.send_queue sq
  join public.connected_accounts ca on ca.id = sq.account_id
  where sq.campaign_id = p_campaign
  limit 1;
  
  -- If override set and > 0, use it (but still respect account cap if lower)
  if v_override is not null and v_override > 0 then
    return least(v_override, coalesce(v_acc_cap, v_override));
  end if;
  
  -- Otherwise use account cap or default
  return coalesce(v_acc_cap, 40);
end$$;

-- D) Simulate tomorrow's queueable sends (respects suppressions + daily cap + window/day)
create or replace function public.simulate_tomorrow(p_campaign uuid, p_today date default current_date)
returns table(
  campaign_id uuid,
  tz text,
  date date,
  window_start timestamptz,
  window_end   timestamptz,
  effective_cap int,
  eligible_leads int,
  will_enqueue int,
  min_delay_minutes int
) language plpgsql stable as $$
declare
  v_tz text;
  v_start time with time zone;
  v_end   time with time zone;
  v_days int[];
  v_cap int;
  v_delay int;
  v_date date := p_today + 1;
  v_is_active boolean;
  v_ws timestamptz;
  v_we timestamptz;
  v_eligible int;
begin
  select tz, send_start, send_end, days_of_week, min_delay_minutes
    into v_tz, v_start, v_end, v_days, v_delay
  from public.campaigns where id = p_campaign;

  if v_tz is null then v_tz := 'America/Los_Angeles'; end if;

  -- Only simulate if tomorrow's weekday in allowed set
  v_is_active := extract(dow from v_date) = any(v_days);
  if not v_is_active then
    return query
      select p_campaign, v_tz, v_date, null::timestamptz, null::timestamptz,
             public.campaign_effective_cap(p_campaign),
             0, 0, v_delay;
    return;
  end if;

  -- Build window in campaign tz
  v_ws := (v_date::timestamptz at time zone v_tz) + (v_start - time '00:00');
  v_we := (v_date::timestamptz at time zone v_tz) + (v_end   - time '00:00');

  v_cap := public.campaign_effective_cap(p_campaign);

  -- Eligible leads = not suppressed + not already sent for this step sequence, simplified to:
  -- leads in this campaign not present in send_queue as 'sent' (toy but useful)
  select count(*) into v_eligible
  from public.leads l
  join public.campaign_leads cl on cl.lead_id=l.id and cl.campaign_id=p_campaign
  left join public.suppressions s on lower(s.email)=lower(l.email)
  left join public.send_queue q on q.campaign_id=p_campaign and q.lead_id=l.id and q.status='sent'
  where s.id is null and q.id is null;

  return query
    select p_campaign, v_tz, v_date, v_ws, v_we,
           v_cap, v_eligible, least(v_eligible, v_cap), v_delay;
end$$;

-- Grant execute permissions
grant execute on function public.normalize_campaign_schedule(uuid, text, time with time zone, time with time zone, int[], int, int) to authenticated;
grant execute on function public.campaign_effective_cap(uuid) to authenticated;
grant execute on function public.simulate_tomorrow(uuid, date) to authenticated;

