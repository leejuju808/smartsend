-- RPC: per-variant reply stats (reply = lead replied_at in this campaign)
create or replace function public.get_variant_reply_stats(c_id uuid)
returns table (
  variant_id uuid,
  sent_count int,
  reply_count int,
  reply_rate numeric
) language sql stable as $$
  with s as (
    select variant_id, count(*) as sent_count
    from public.send_logs
    where campaign_id = c_id and status = 'sent'
    group by variant_id
  ),
  r as (
    -- count unique leads who replied and were served this variant
    select q.variant_id, count(distinct q.lead_id) as reply_count
    from public.send_queue q
    join public.campaign_leads cl
      on cl.campaign_id = q.campaign_id and cl.lead_id = q.lead_id
    where q.campaign_id = c_id and cl.replied_at is not null
    group by q.variant_id
  )
  select
    s.variant_id,
    s.sent_count,
    coalesce(r.reply_count, 0) as reply_count,
    case when s.sent_count > 0 then round((coalesce(r.reply_count, 0)::numeric / s.sent_count) * 100, 2) else 0 end as reply_rate
  from s
  left join r using (variant_id);
$$;

