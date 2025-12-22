-- 006_campaigns_view.sql
create or replace view public.campaigns_view as
select id, name, created_at
from public.campaigns
order by created_at desc;

alter view public.campaigns_view set (security_invoker = on);

