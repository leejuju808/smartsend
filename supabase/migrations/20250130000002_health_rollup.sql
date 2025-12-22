-- Health Rollup and Auto-Throttle Functions
-- Roll up yesterday and today
create or replace function public.rollup_domain_health(p_day date default current_date)
returns int language plpgsql security definer as $$
declare r record; v int := 0; begin
  for r in
    select
      date_trunc('day', sl.created_at)::date as day,
      sl.account_id,
      split_part(l.email, '@', 2) as domain,
      count(*) filter (where sl.status='sent') as sent,
      count(*) filter (where sl.delivery_state='bounced') as bounces,
      0 as complaints
    from public.send_logs sl
    join public.leads l on l.id = sl.lead_id
    where date_trunc('day', sl.created_at)::date = p_day
    group by 1,2,3
  loop
    insert into public.domain_health_daily(day, account_id, domain, sent, bounces, complaints)
    values (r.day, r.account_id, r.domain, r.sent, r.bounces, r.complaints)
    on conflict (day, account_id, domain)
    do update set sent = excluded.sent, bounces = excluded.bounces, complaints = excluded.complaints;
    v := v + 1;
  end loop;
  return v;
end $$;

-- Auto-throttle if >5% bounces today: reduce daily_cap by 50% for tomorrow (floor at 10)
create or replace function public.auto_throttle_mailboxes()
returns int language plpgsql security definer as $$
declare r record; v int := 0; begin
  for r in
    select account_id,
           sum(bounces)::float / nullif(sum(sent),0) as bounce_rate
    from public.domain_health_daily
    where day = current_date
    group by 1
    having sum(sent) > 50 and (sum(bounces)::float / nullif(sum(sent),0)) > 0.05
  loop
    update public.connected_accounts
       set daily_cap = greatest(10, floor(coalesce(daily_cap,40) * 0.5)::int)
     where id = r.account_id;
    v := v + 1;
  end loop;
  return v;
end $$;

grant execute on function public.rollup_domain_health(date) to service_role, authenticated;
grant execute on function public.auto_throttle_mailboxes() to service_role, authenticated;

