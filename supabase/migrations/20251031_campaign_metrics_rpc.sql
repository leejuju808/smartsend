-- Metrics RPC (1 fast call) – returns a compact metrics JSON for a campaign
create or replace function public.campaign_metrics(p_campaign_id uuid)
returns jsonb
language sql
security definer
as $$
with s as (
  select
    count(*) filter (where status = 'new')     as new_count,
    count(*) filter (where status = 'queued')  as queued_count,
    count(*) filter (where status = 'sending') as sending_count,
    count(*) filter (where status = 'sent')    as sent_count,
    count(*) filter (where status = 'failed')  as failed_count,
    count(*) filter (where status = 'replied') as replied_count,
    count(*)                                   as total_count
  from public.leads
  where campaign_id = p_campaign_id
),
l24 as (
  select count(*) as sent_last_24h
  from public.campaign_logs
  where campaign_id = p_campaign_id
    and event = 'sent'
    and created_at >= now() - interval '24 hours'
)
select jsonb_build_object(
  'total', s.total_count,
  'new', s.new_count,
  'queued', s.queued_count,
  'sending', s.sending_count,
  'sent', s.sent_count,
  'failed', s.failed_count,
  'replied', s.replied_count,
  'sent_last_24h', l24.sent_last_24h,
  'reply_rate', case
    when (s.sent_count + s.replied_count) = 0 then 0
    else round( (s.replied_count::numeric / (s.sent_count + s.replied_count)) * 100, 2)
  end
)
from s, l24;
$$;



revoke all on function public.campaign_metrics(uuid) from public;
grant execute on function public.campaign_metrics(uuid) to authenticated, service_role;

