-- Campaign analytics views, RPCs, and scheduling preview helper
-- Run in Supabase SQL editor (idempotent).

-- ---------------------------------------------------------------------------
-- Helpful indexes (safe to rerun)
-- ---------------------------------------------------------------------------
create index if not exists idx_msgs_campaign_dir
  on public.inbox_messages (campaign_id, direction, created_at);

create index if not exists idx_msgs_ai_label
  on public.inbox_messages (ai_label);

create index if not exists idx_logs_campaign_created
  on public.send_logs (campaign_id, created_at);


-- ---------------------------------------------------------------------------
-- First reply per campaign + lead (Time-to-first-reply helper)
-- ---------------------------------------------------------------------------
create or replace view public.v_first_reply as
with inbound as (
  select campaign_id, lead_id, min(created_at) as first_reply_at
  from public.inbox_messages
  where direction = 'inbound'
    and coalesce(ai_label, '') not in ('bounce', 'ooo')
  group by 1, 2
),
first_send as (
  select campaign_id, lead_id, min(created_at) as first_send_at
  from public.send_logs
  group by 1, 2
)
select
  s.campaign_id,
  s.lead_id,
  s.first_send_at,
  i.first_reply_at,
  case
    when i.first_reply_at is not null and s.first_send_at is not null
      then extract(epoch from (i.first_reply_at - s.first_send_at)) / 3600.0
    else null
  end as ttf_hours
from first_send s
left join inbound i
  on i.campaign_id = s.campaign_id
 and i.lead_id = s.lead_id;


-- ---------------------------------------------------------------------------
-- Campaign rollups (totals & rates)
-- ---------------------------------------------------------------------------
create or replace view public.v_campaign_metrics as
with sent as (
  select campaign_id, count(*)::int as sent_count
  from public.send_logs
  group by 1
),
replies as (
  select campaign_id, count(*)::int as reply_count
  from public.inbox_messages
  where direction = 'inbound'
    and coalesce(ai_label, '') not in ('bounce', 'ooo')
  group by 1
),
ooo as (
  select campaign_id, count(*)::int as ooo_count
  from public.inbox_messages
  where direction = 'inbound'
    and coalesce(ai_label, '') = 'ooo'
  group by 1
),
bounces as (
  select campaign_id, count(*)::int as bounce_count
  from public.inbox_messages
  where direction = 'inbound'
    and coalesce(ai_label, '') = 'bounce'
  group by 1
),
ttf as (
  select campaign_id,
         avg(ttf_hours) filter (where ttf_hours is not null) as avg_ttf_hours
  from public.v_first_reply
  group by 1
)
select
  c.id as campaign_id,
  c.name as campaign_name,
  coalesce(s.sent_count, 0) as sent,
  coalesce(r.reply_count, 0) as replies,
  coalesce(o.ooo_count, 0) as ooo,
  coalesce(b.bounce_count, 0) as bounces,
  case
    when coalesce(s.sent_count, 0) > 0
      then round((coalesce(r.reply_count, 0)::numeric / s.sent_count::numeric) * 100, 2)
    else 0
  end as reply_rate_pct,
  case
    when coalesce(s.sent_count, 0) > 0
      then round((coalesce(b.bounce_count, 0)::numeric / s.sent_count::numeric) * 100, 2)
    else 0
  end as bounce_rate_pct,
  round(coalesce(t.avg_ttf_hours, 0)::numeric, 2) as avg_ttf_hours,
  c.user_id
from public.campaigns c
left join sent s on s.campaign_id = c.id
left join replies r on r.campaign_id = c.id
left join ooo o on o.campaign_id = c.id
left join bounces b on b.campaign_id = c.id
left join ttf t on t.campaign_id = c.id;


-- ---------------------------------------------------------------------------
-- Variant rollups (step & variant level)
-- ---------------------------------------------------------------------------
create or replace view public.v_variant_metrics as
with sent as (
  select variant_id, count(*)::int as sent_count
  from public.send_logs
  where variant_id is not null
  group by 1
),
replies as (
  select sl.variant_id, count(*)::int as reply_count
  from public.inbox_messages m
  join lateral (
    select variant_id
    from public.send_logs sl
    where sl.campaign_id = m.campaign_id
      and sl.lead_id = m.lead_id
      and sl.created_at <= m.created_at
      and sl.variant_id is not null
    order by sl.created_at desc
    limit 1
  ) sl on true
  where m.direction = 'inbound'
    and coalesce(m.ai_label, '') not in ('bounce', 'ooo')
  group by 1
)
select
  v.id as variant_id,
  v.campaign_id,
  v.step_no,
  v.name,
  v.enabled,
  coalesce(s.sent_count, 0) as sent,
  coalesce(r.reply_count, 0) as replies,
  case
    when coalesce(s.sent_count, 0) > 0
      then round((coalesce(r.reply_count, 0)::numeric / s.sent_count::numeric) * 100, 2)
    else 0
  end as reply_rate_pct
from public.campaign_step_variants v
left join sent s on s.variant_id = v.id
left join replies r on r.variant_id = v.id;


-- ---------------------------------------------------------------------------
-- Campaign 30-day timeseries
-- ---------------------------------------------------------------------------
create or replace view public.v_campaign_timeseries as
with days as (
  select generate_series((now()::date - 29)::timestamptz, now()::date::timestamptz, interval '1 day') as d
),
s as (
  select campaign_id, date_trunc('day', created_at)::date as day, count(*)::int as sends
  from public.send_logs
  where created_at >= now() - interval '30 days'
  group by 1, 2
),
r as (
  select campaign_id, date_trunc('day', created_at)::date as day, count(*)::int as replies
  from public.inbox_messages
  where direction = 'inbound'
    and coalesce(ai_label, '') not in ('bounce', 'ooo')
    and created_at >= now() - interval '30 days'
  group by 1, 2
),
b as (
  select campaign_id, date_trunc('day', created_at)::date as day, count(*)::int as bounces
  from public.inbox_messages
  where direction = 'inbound'
    and coalesce(ai_label, '') = 'bounce'
    and created_at >= now() - interval '30 days'
  group by 1, 2
)
select
  c.id as campaign_id,
  (d.d)::date as day,
  coalesce(s.sends, 0) as sends,
  coalesce(r.replies, 0) as replies,
  coalesce(b.bounces, 0) as bounces,
  case
    when coalesce(s.sends, 0) > 0
      then round((coalesce(r.replies, 0)::numeric / s.sends::numeric) * 100, 2)
    else 0
  end as reply_rate_pct
from public.campaigns c
cross join days d
left join s on s.campaign_id = c.id and s.day = (d.d)::date
left join r on r.campaign_id = c.id and r.day = (d.d)::date
left join b on b.campaign_id = c.id and b.day = (d.d)::date;


-- ---------------------------------------------------------------------------
-- Secure analytics RPC
-- ---------------------------------------------------------------------------
drop function if exists public.get_campaign_analytics(uuid);

create or replace function public.get_campaign_analytics(p_campaign uuid)
returns jsonb
language plpgsql
security definer
stable
as $$
declare
  met record;
  series jsonb;
  variants jsonb;
begin
  if not (
    exists (select 1 from public.campaigns c where c.id = p_campaign and c.user_id = auth.uid())
    or exists (select 1 from public.campaign_members cm where cm.campaign_id = p_campaign and cm.user_id = auth.uid())
  ) then
    raise exception 'not allowed';
  end if;

  select * into met from public.v_campaign_metrics where campaign_id = p_campaign;

  select jsonb_agg(
    jsonb_build_object(
      'day', day,
      'sends', sends,
      'replies', replies,
      'bounces', bounces,
      'reply_rate_pct', reply_rate_pct
    ) order by day
  )
  into series
  from public.v_campaign_timeseries
  where campaign_id = p_campaign;

  select jsonb_agg(
    jsonb_build_object(
      'variant_id', variant_id,
      'step_no', step_no,
      'name', name,
      'enabled', enabled,
      'sent', sent,
      'replies', replies,
      'reply_rate_pct', reply_rate_pct
    ) order by step_no, name
  )
  into variants
  from public.v_variant_metrics
  where campaign_id = p_campaign;

  if met is null then
    raise exception 'campaign not found';
  end if;

  return jsonb_build_object(
    'campaign_id', p_campaign,
    'name', met.campaign_name,
    'sent', met.sent,
    'replies', met.replies,
    'ooo', met.ooo,
    'bounces', met.bounces,
    'reply_rate_pct', met.reply_rate_pct,
    'bounce_rate_pct', met.bounce_rate_pct,
    'avg_ttf_hours', met.avg_ttf_hours,
    'series', coalesce(series, '[]'::jsonb),
    'variants', coalesce(variants, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_campaign_analytics(uuid) from public;
grant execute on function public.get_campaign_analytics(uuid) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- Scheduler preview helper
-- ---------------------------------------------------------------------------
drop function if exists public.preview_schedule_for_leads(
  uuid,
  int,
  uuid[],
  timestamptz,
  boolean,
  text,
  text,
  int[],
  boolean
);

create or replace function public.preview_schedule_for_leads(
  p_campaign uuid,
  p_step_no int,
  p_leads uuid[],
  p_start_at timestamptz,
  p_business_hours boolean default true,
  p_window_start text default '08:00',
  p_window_end text default '17:00',
  p_days int[] default array[1, 2, 3, 4, 5],
  p_skip_holidays boolean default true
) returns table(
  lead_id uuid,
  email text,
  tz text,
  country text,
  local_window text,
  local_start timestamptz,
  local_due timestamptz,
  dow int
)
language plpgsql
stable
security definer
as $$
declare
  v_lead uuid;
  v_tz text;
  v_country text;
  v_due timestamptz;
  v_eff timestamptz;
  window_start_local timestamp;
  d date;
begin
  if p_leads is null or array_length(p_leads, 1) is null then
    return;
  end if;

  foreach v_lead in array p_leads loop
    select
      coalesce(l.tz, l.meta->>'tz', 'UTC'),
      upper(coalesce(l.country, l.meta->>'country')),
      l.email
    into v_tz, v_country, email
    from public.leads l
    where l.id = v_lead;

    continue when email is null;

    lead_id := v_lead;
    tz := v_tz;
    country := v_country;

    v_due := coalesce(p_start_at, now());

    if p_business_hours then
      v_eff := public.next_window_utc(v_due, v_tz, p_window_start, p_window_end, p_days, p_skip_holidays, v_country);
    else
      if p_skip_holidays and public.is_holiday_local(v_country, (v_due at time zone v_tz)::date) then
        v_eff := public.next_window_utc(v_due, v_tz, p_window_start, p_window_end, p_days, true, v_country);
      else
        v_eff := v_due;
      end if;
    end if;

    local_due := v_eff;

    window_start_local := date_trunc('day', (v_eff at time zone v_tz)) + (p_window_start)::time;

    if p_business_hours then
      local_start := (window_start_local at time zone v_tz);
      local_window := p_window_start || '–' || p_window_end;
    else
      local_start := v_eff;
      local_window := 'Anytime';
    end if;

    dow := extract(isodow from (v_eff at time zone v_tz));

    return next;
  end loop;
end;
$$;

revoke all on function public.preview_schedule_for_leads(uuid,int,uuid[],timestamptz,boolean,text,text,int[],boolean) from public;
grant execute on function public.preview_schedule_for_leads(uuid,int,uuid[],timestamptz,boolean,text,text,int[],boolean) to authenticated, service_role;

