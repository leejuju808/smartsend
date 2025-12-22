-- Count events per day for last N days, optionally scoped to a campaign
create or replace function public.rpc_count_events_per_day_scoped(
  p_kind text,
  p_days int,
  p_campaign uuid default null
)
returns table(d date, c int)
language sql
security definer
set search_path = public
as $$
  with days as (
    select generate_series::date as d
    from generate_series((now() - (p_days||' days')::interval)::date, now()::date, interval '1 day')
  ),
  evt as (
    select date_trunc('day', created_at)::date as d, count(*)::int as c
    from public.activity_events
    where kind = p_kind
      and created_at >= now() - (p_days||' days')::interval
      and (p_campaign is null or campaign_id = p_campaign)
    group by 1
  )
  select d.d, coalesce(evt.c,0) as c
  from days d left join evt on evt.d = d.d
  order by d.d;
$$;

create index if not exists idx_activity_events_campaign_kind_created
  on public.activity_events(campaign_id, kind, created_at desc);



