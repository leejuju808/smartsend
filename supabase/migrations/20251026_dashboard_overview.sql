-- Helpful indexes (if not already present)
create index if not exists idx_campaign_events_type_time on public.campaign_events (event_type, created_at desc);
create index if not exists idx_campaign_logs_campaign on public.campaign_logs (campaign_id);
create index if not exists idx_campaign_logs_event on public.campaign_logs (event);

-- Returns a compact JSON with totals, hourly activity (last 24h), and top campaigns
create or replace function public.dashboard_overview(p_top int default 5)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_now timestamptz := now();
  v_from timestamptz := v_now - interval '23 hours';
  v_totals jsonb;
  v_series table (bucket timestamptz);
  v_activity jsonb;
  v_top jsonb;
begin
  -- Totals
  select jsonb_build_object(
    'sent',        (select count(*) from public.campaign_logs where event = 'sent'),
    'opens',       (select coalesce(sum(open_count),0) from public.campaign_logs),
    'clicks',      (select coalesce(sum(click_count),0) from public.campaign_logs),
    'replies',     (select count(*) from public.campaign_logs where event = 'replied')
  ) into v_totals;

  -- 24h hourly activity across events
  with hours as (
    select generate_series(date_trunc('hour', v_from), date_trunc('hour', v_now), interval '1 hour') as bucket
  ),
  agg as (
    select date_trunc('hour', created_at) as bucket,
           sum((event_type='sent')::int)    as sent,
           sum((event_type='opened')::int)  as opened,
           sum((event_type='clicked')::int) as clicked,
           sum((event_type='replied')::int) as replied
    from public.campaign_events
    where created_at >= v_from
    group by 1
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             't', to_char(h.bucket, 'YYYY-MM-DD"T"HH24:00:00Z'),
             'sent',    coalesce(a.sent,0),
             'opened',  coalesce(a.opened,0),
             'clicked', coalesce(a.clicked,0),
             'replied', coalesce(a.replied,0)
           )
           order by h.bucket
         ), '[]'::jsonb)
    into v_activity
  from hours h
  left join agg a on a.bucket = h.bucket;

  -- Top campaigns by open rate, then click rate
  with perf as (
    select
      c.id as campaign_id,
      c.name as campaign_name,
      count(l.*) filter (where l.event in ('sent','replied'))::int as delivered,
      coalesce(sum(l.open_count),0)::int as opens,
      coalesce(sum(l.click_count),0)::int as clicks,
      count(l.*) filter (where l.event = 'replied')::int as replies
    from public.campaigns c
    left join public.campaign_logs l on l.campaign_id = c.id
    group by 1,2
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'campaign_id', campaign_id,
             'campaign_name', campaign_name,
             'delivered', delivered,
             'opens', opens,
             'clicks', clicks,
             'replies', replies,
             'open_rate', case when delivered>0 then round((opens::numeric/delivered)*100,2) else 0 end,
             'click_rate', case when delivered>0 then round((clicks::numeric/delivered)*100,2) else 0 end,
             'reply_rate', case when delivered>0 then round((replies::numeric/delivered)*100,2) else 0 end
           )
           order by (case when delivered>0 then opens::numeric/delivered else 0 end) desc,
                    (case when delivered>0 then clicks::numeric/delivered else 0 end) desc
           limit p_top
         ), '[]'::jsonb)
    into v_top
  from perf;

  return jsonb_build_object(
    'totals', v_totals,
    'activity', v_activity,
    'top_campaigns', v_top,
    'generated_at', to_char(v_now, 'YYYY-MM-DD"T"HH24:MI:SSZ')
  );
end;
$$;

revoke all on function public.dashboard_overview(int) from public;
grant execute on function public.dashboard_overview(int) to service_role;
grant execute on function public.dashboard_overview(int) to authenticated;