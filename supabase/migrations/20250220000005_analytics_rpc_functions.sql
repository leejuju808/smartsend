-- Replies attributed to the most recent send for that lead within window, grouped by variant+version
create or replace function public.analytics_replies_by_variant_version(
  c_id uuid,
  since_ts timestamptz
)
returns table(variant_key text, template_version_id uuid, count bigint)
language sql stable as $$
  with last_send as (
    select 
      sl.lead_id, 
      sl.variant_key, 
      sl.template_version_id, 
      max(sl.sent_at) as last_sent
    from send_logs sl
    where sl.campaign_id = c_id 
      and sl.sent_at >= since_ts
    group by sl.lead_id, sl.variant_key, sl.template_version_id
  )
  select 
    ls.variant_key, 
    ls.template_version_id, 
    count(*)::bigint
  from activity_logs al
  join last_send ls on ls.lead_id = al.lead_id
  where al.campaign_id = c_id 
    and al.event_type = 'reply_detected' 
    and al.created_at >= since_ts
  group by ls.variant_key, ls.template_version_id;
$$;

-- Bounces per the version that sent
create or replace function public.analytics_bounces_by_variant_version(
  c_id uuid,
  since_ts timestamptz
)
returns table(variant_key text, template_version_id uuid, count bigint)
language sql stable as $$
  select 
    sl.variant_key, 
    sl.template_version_id, 
    count(*)::bigint
  from send_logs sl
  join bounce_logs bl on bl.lead_id = sl.lead_id 
    and bl.created_at >= since_ts
  where sl.campaign_id = c_id 
    and sl.sent_at >= since_ts
  group by sl.variant_key, sl.template_version_id;
$$;

-- Complaints per the version that sent
create or replace function public.analytics_complaints_by_variant_version(
  c_id uuid,
  since_ts timestamptz
)
returns table(variant_key text, template_version_id uuid, count bigint)
language sql stable as $$
  select 
    sl.variant_key, 
    sl.template_version_id, 
    count(*)::bigint
  from send_logs sl
  join complaint_logs cl on cl.lead_id = sl.lead_id 
    and cl.created_at >= since_ts
  where sl.campaign_id = c_id 
    and sl.sent_at >= since_ts
  group by sl.variant_key, sl.template_version_id;
$$;

grant execute on function public.analytics_replies_by_variant_version(uuid, timestamptz) to anon, authenticated, service_role;
grant execute on function public.analytics_bounces_by_variant_version(uuid, timestamptz) to anon, authenticated, service_role;
grant execute on function public.analytics_complaints_by_variant_version(uuid, timestamptz) to anon, authenticated, service_role;

