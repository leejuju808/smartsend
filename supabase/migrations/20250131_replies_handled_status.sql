-- Add handled_by and status columns to replies table for reply triage
alter table public.replies
  add column if not exists handled_by uuid references auth.users(id) on delete set null,
  add column if not exists status text default 'active' check (status in ('active', 'handled')),
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_replies_handled_by on public.replies(handled_by);
create index if not exists idx_replies_status on public.replies(status);

-- Update the updated_at timestamp on update
create or replace function update_replies_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger replies_updated_at
  before update on public.replies
  for each row
  execute function update_replies_updated_at();

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

