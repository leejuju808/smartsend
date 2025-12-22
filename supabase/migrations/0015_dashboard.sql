-- Quick aggregates for dashboard

create or replace view public.v_dashboard_stats as
select
  p.id as project_id,
  count(distinct t.id) as total_threads,
  count(distinct t.id) filter (where t.ai_replied) as replied_threads,
  count(distinct t.id) filter (where t.delivery_status='bounced') as bounced_threads,
  count(distinct t.id) filter (where t.delivery_status='ooo') as ooo_threads,
  count(distinct tk.id) filter (where tk.status='open') as open_tasks,
  count(distinct tk.id) filter (where tk.status='done') as done_tasks,
  count(distinct se.id) filter (where se.status='active') as active_sequences,
  count(distinct se.id) filter (where se.status='completed') as completed_sequences,
  coalesce(sum(case when e.direction='outbound' then 1 else 0 end),0) as total_outbound,
  date_trunc('day', max(e.created_at)) as last_send_at
from public.projects p
left join public.threads t on t.project_id=p.id
left join public.tasks tk on tk.project_id=p.id
left join public.sequence_enrollments se on se.project_id=p.id
left join public.emails e on e.project_id=p.id
group by p.id;

-- daily outbound counts (7-day chart)

create or replace view public.v_send_volume as
select project_id, date_trunc('day', created_at) as day,
       count(*) filter (where direction='outbound') as sent,
       count(*) filter (where direction='inbound') as received
from public.emails
group by 1,2
order by day desc;

