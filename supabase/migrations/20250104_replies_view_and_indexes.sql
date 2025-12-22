-- Faster lookups
create index if not exists idx_campaign_logs_thread on campaign_logs(thread_id);
create index if not exists idx_replies_lead on replies(lead_id);

-- A handy view to drive the UI
create or replace view v_replies as
select
  r.id as reply_id,
  r.created_at as replied_at,
  r.from_email,
  r.subject,
  r.snippet,
  l.id as lead_id,
  l.email as lead_email,
  l.first_name,
  l.last_name,
  l.owner_id,
  l.status as lead_status,
  c.id as campaign_id,
  c.name as campaign_name
from replies r
join leads l on l.id = r.lead_id
left join campaigns c on c.id = (select campaign_id from campaign_logs cl where cl.lead_id = l.id order by cl.created_at desc limit 1);

-- RLS
alter table replies enable row level security;

-- Allow owners to see replies for their own leads
create policy "replies_select_own_leads"
on replies for select
using (exists(select 1 from leads l where l.id = replies.lead_id and l.owner_id = auth.uid()));

-- Allow owners to update leads status
create policy "leads_update_own"
on leads for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());
