-- Campaign Scheduler Form: Add columns, constraints, and enqueue function

-- Add columns to campaigns table
alter table public.campaigns
  add column if not exists track_replies boolean default true,
  add column if not exists status text default 'scheduled',
  add column if not exists window_start_hour int,
  add column if not exists window_end_hour int,
  add column if not exists per_minute_rate int,
  add column if not exists daily_cap int;

-- Constraints
alter table public.campaigns
  add constraint if not exists chk_window_hours check (
    (window_start_hour is null and window_end_hour is null)
    or (
      window_start_hour >= 0 
      and window_start_hour <= 23 
      and window_end_hour >= 1 
      and window_end_hour <= 24 
      and window_end_hour > window_start_hour
    )
  ),
  add constraint if not exists chk_rate_bounds check (
    per_minute_rate is null or per_minute_rate between 1 and 60
  ),
  add constraint if not exists chk_daily_cap check (
    daily_cap is null or daily_cap between 1 and 2000
  );

-- Enqueue function: moves up to (daily_cap) new leads into send_queue for the day
create or replace function public.enqueue_initial_sends(p_campaign_id uuid)
returns int
language plpgsql
security definer
as $$
declare
  v_rate int;
  v_cap int;
  v_start int;
  v_end int;
  v_today date := current_date;
  v_enqueued int := 0;
begin
  select per_minute_rate, daily_cap, window_start_hour, window_end_hour
  into v_rate, v_cap, v_start, v_end
  from public.campaigns where id = p_campaign_id;

  if v_cap is null then v_cap := 200; end if;
  if v_rate is null then v_rate := 30; end if;
  if v_start is null then v_start := 9; end if;

  -- Select leads eligible for first send today
  with eligible as (
    select id from public.leads
    where campaign_id = p_campaign_id
      and status in ('new','failed')
    order by created_at asc
    limit v_cap
  )
  insert into public.send_queue (campaign_id, lead_id, status, scheduled_at)
  select p_campaign_id, id, 'queued',
         -- schedule within today's window roughly evenly using per_minute_rate
         date_trunc('day', now())
         + make_interval(hours => v_start)
         + make_interval(minutes => floor((row_number() over ()) / greatest(1, v_rate))::int)
  from eligible
  on conflict do nothing;

  GET DIAGNOSTICS v_enqueued = ROW_COUNT;

  -- Log a campaign event
  insert into public.campaign_logs (campaign_id, event, meta)
  values (p_campaign_id, 'enqueue_initial', jsonb_build_object('count', v_enqueued, 'date', v_today));

  return v_enqueued;
end$$;

-- Helpful indexes
create index if not exists send_queue_campaign_status_sched_idx on public.send_queue (campaign_id, status, scheduled_at);

