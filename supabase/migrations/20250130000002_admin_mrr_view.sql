-- Block 295 — Admin MRR View
-- Materialized view for calculating Monthly Recurring Revenue per workspace

create or replace view admin_mrr as
select
  w.id as workspace_id,
  w.plan,
  case
    when w.plan = 'starter' then 0
    when w.plan = 'pro' then 49      -- your recurring price
    when w.plan = 'scale' then 299   -- your recurring price
    else 0
  end as mrr
from workspaces w;

-- Grant access to authenticated users (admin will be checked in middleware)
grant select on admin_mrr to authenticated;








