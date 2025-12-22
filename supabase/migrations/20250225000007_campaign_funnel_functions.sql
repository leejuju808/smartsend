-- Campaign Funnel Analytics Functions
-- Idempotent SQL functions for funnel + step breakdown + variant breakdown

-- 1A) Core funnel (date range)
create or replace function public.campaign_funnel(
  p_campaign uuid,
  p_from timestamptz default (now() - interval '7 days'),
  p_to   timestamptz default now()
) returns table(stage text, count int) language sql stable as $$
  with sent as (
    select count(*)::int c
    from public.send_logs l
    where l.campaign_id = p_campaign
      and l.created_at between p_from and p_to
      and l.status = 'sent'
  ),
  opens as (
    select count(*)::int c
    from public.tracking_events te
    where te.campaign_id = p_campaign
      and te.kind = 'open'
      and te.created_at between p_from and p_to
  ),
  clicks as (
    select count(*)::int c
    from public.tracking_events te
    where te.campaign_id = p_campaign
      and te.kind = 'click'
      and te.created_at between p_from and p_to
  ),
  replies as (
    select count(*)::int c
    from public.send_logs l
    where l.campaign_id = p_campaign
      and l.reply_at between p_from and p_to
      and l.reply_at is not null
  )
  select * from (values
    ('sent',   (select c from sent)),
    ('opens',  (select c from opens)),
    ('clicks', (select c from clicks)),
    ('replies',(select c from replies))
  ) t(stage, count);
$$;

-- 1B) Per-step breakdown with rates (uses send_logs.step_no and tracking_events.send_log_id)
create or replace function public.campaign_step_breakdown(
  p_campaign uuid,
  p_from timestamptz default (now() - interval '7 days'),
  p_to   timestamptz default now()
) returns table(
  step_no int,
  sent int,
  opens int,
  clicks int,
  replies int,
  open_rate numeric,
  click_rate numeric,
  reply_rate numeric
) language sql stable as $$
  with sent as (
    select step_no, count(*)::int as sent
    from public.send_logs
    where campaign_id = p_campaign
      and created_at between p_from and p_to
      and status = 'sent'
    group by step_no
  ),
  opens as (
    select l.step_no, count(*)::int as opens
    from public.tracking_events te
    join public.send_logs l on l.id = te.send_log_id
    where l.campaign_id = p_campaign
      and te.kind = 'open'
      and te.created_at between p_from and p_to
    group by l.step_no
  ),
  clicks as (
    select l.step_no, count(*)::int as clicks
    from public.tracking_events te
    join public.send_logs l on l.id = te.send_log_id
    where l.campaign_id = p_campaign
      and te.kind = 'click'
      and te.created_at between p_from and p_to
    group by l.step_no
  ),
  replies as (
    -- link replies to last outbound using send_logs.reply_at
    select l.step_no, count(*)::int as replies
    from public.send_logs l
    where l.campaign_id = p_campaign
      and l.reply_at between p_from and p_to
      and l.reply_at is not null
    group by l.step_no
  )
  select
    s.step_no,
    s.sent,
    coalesce(o.opens,0) as opens,
    coalesce(c.clicks,0) as clicks,
    coalesce(r.replies,0) as replies,
    case when s.sent>0 then round(coalesce(o.opens,0)::numeric/s.sent, 4) else 0 end as open_rate,
    case when s.sent>0 then round(coalesce(c.clicks,0)::numeric/s.sent,4) else 0 end as click_rate,
    case when s.sent>0 then round(coalesce(r.replies,0)::numeric/s.sent,4) else 0 end as reply_rate
  from sent s
  left join opens o using(step_no)
  left join clicks c using(step_no)
  left join replies r using(step_no)
  order by s.step_no;
$$;

-- 1C) Per-variant breakdown (optional, nice for A/B)
create or replace function public.campaign_variant_breakdown(
  p_campaign uuid,
  p_from timestamptz default (now() - interval '7 days'),
  p_to   timestamptz default now()
) returns table(
  step_no int,
  variant_id uuid,
  variant_name text,
  sent int,
  opens int,
  clicks int,
  replies int,
  open_rate numeric,
  click_rate numeric,
  reply_rate numeric
) language sql stable as $$
  with base as (
    select l.id, l.step_no, l.variant_id
    from public.send_logs l
    where l.campaign_id = p_campaign
      and l.created_at between p_from and p_to
      and l.status = 'sent'
  ),
  sent as (
    select step_no, variant_id, count(*)::int as sent from base group by step_no, variant_id
  ),
  opens as (
    select b.step_no, b.variant_id, count(*)::int as opens
    from public.tracking_events te
    join base b on b.id = te.send_log_id
    where te.kind='open' and te.created_at between p_from and p_to
    group by b.step_no, b.variant_id
  ),
  clicks as (
    select b.step_no, b.variant_id, count(*)::int as clicks
    from public.tracking_events te
    join base b on b.id = te.send_log_id
    where te.kind='click' and te.created_at between p_from and p_to
    group by b.step_no, b.variant_id
  ),
  replies as (
    select l.step_no, l.variant_id, count(*)::int as replies
    from public.send_logs l
    where l.campaign_id = p_campaign
      and l.reply_at between p_from and p_to
      and l.reply_at is not null
    group by l.step_no, l.variant_id
  )
  select
    s.step_no,
    s.variant_id,
    (select name from public.campaign_step_variants v where v.id = s.variant_id) as variant_name,
    s.sent,
    coalesce(o.opens,0) as opens,
    coalesce(c.clicks,0) as clicks,
    coalesce(r.replies,0) as replies,
    case when s.sent>0 then round(coalesce(o.opens,0)::numeric/s.sent,4) else 0 end as open_rate,
    case when s.sent>0 then round(coalesce(c.clicks,0)::numeric/s.sent,4) else 0 end as click_rate,
    case when s.sent>0 then round(coalesce(r.replies,0)::numeric/s.sent,4) else 0 end as reply_rate
  from sent s
  left join opens o using(step_no, variant_id)
  left join clicks c using(step_no, variant_id)
  left join replies r using(step_no, variant_id)
  order by s.step_no, variant_name nulls last;
$$;

-- Grant execute permissions to authenticated users
grant execute on function public.campaign_funnel(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.campaign_step_breakdown(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.campaign_variant_breakdown(uuid, timestamptz, timestamptz) to authenticated;

