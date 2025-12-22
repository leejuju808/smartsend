-- 005_logs_view.sql — campaign logs helper view and index

create or replace view public.campaign_logs_view as
select
  cl.id,
  cl.created_at,
  cl.event,
  cl.meta,
  cl.campaign_id,
  cl.lead_id,
  l.email as lead_email,
  c.name  as campaign_name
from public.campaign_logs cl
left join public.leads l on l.id = cl.lead_id
left join public.campaigns c on c.id = cl.campaign_id
order by cl.created_at desc;

create index if not exists campaign_logs_meta_queue_id_idx on public.campaign_logs ((meta->>'queue_id'));


