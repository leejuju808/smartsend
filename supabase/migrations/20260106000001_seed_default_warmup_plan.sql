-- Seed a default warmup plan

insert into public.warmup_plans (name) values ('default-30d')
on conflict do nothing;

with plan as (select id from public.warmup_plans where name='default-30d')
insert into public.warmup_steps(plan_id, day_no, max_sends)
select plan.id, g.day, least(20 + (g.day-1)*5, 200)
from plan, generate_series(1,30) as g(day)
on conflict do nothing;

-- Assign it to accounts that have warmup enabled but no plan
update public.connected_accounts
set warmup_plan_id = (select id from public.warmup_plans where name='default-30d'),
    warmup_started_at = current_date
where warmup_enabled = true
  and warmup_plan_id is null;
