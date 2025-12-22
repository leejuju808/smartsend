-- Add internal_note and handled_at columns to replies table for thread view
alter table public.replies
  add column if not exists internal_note text,
  add column if not exists handled_at timestamptz;

create index if not exists idx_replies_handled_at on public.replies(handled_at desc);

-- Update v_replies view to include new fields
create or replace view v_replies as
select
  r.id as reply_id,
  r.created_at as replied_at,
  r.from_email,
  r.subject,
  r.snippet,
  r.handled_by,
  r.status,
  r.internal_note,
  r.handled_at,
  r.updated_at,
  l.id as lead_id,
  l.email as lead_email,
  l.first_name,
  l.last_name,
  l.owner_id,
  l.status as lead_status,
  c.id as campaign_id,
  c.name as campaign_name,
  -- provider from the most recent outbound log for this lead
  (select cl.provider 
   from campaign_logs cl 
   where cl.lead_id = l.id 
   order by cl.created_at desc 
   limit 1) as provider
from replies r
join leads l on l.id = r.lead_id
left join campaigns c on c.id = (
  select campaign_id 
  from campaign_logs cl2 
  where cl2.lead_id = l.id 
  order by cl2.created_at desc 
  limit 1
);

