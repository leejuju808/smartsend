-- Fast indexes for queue dashboard and leads filtering

create index if not exists idx_send_queue_status on public.send_queue (status);
create index if not exists idx_send_queue_campaign on public.send_queue (campaign_id);
create index if not exists idx_send_queue_updated_at on public.send_queue (updated_at desc);

create index if not exists idx_leads_campaign_status on public.leads (campaign_id, status);
create index if not exists idx_leads_created_at on public.leads (created_at desc);

-- Optional: view to enrich send_queue rows with lead info
create or replace view public.send_queue_view as
select
  sq.*,
  l.email,
  l.company,
  l.first_name,
  l.last_name
from public.send_queue sq
left join public.leads l on l.id = sq.lead_id;


