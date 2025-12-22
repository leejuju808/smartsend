-- Block 96 — Replies Inbox Saved Views (ICP Fit & Hot Leads)

-- 1) Lead reply scoring --------------------------------------------------------
create or replace view public.v_lead_reply_scores as
with last_reply as (
  select thread_id, max(received_at) as last_at
  from public.messages
  where direction = 'inbound'
  group by thread_id
),
labels as (
  select
    m.thread_id,
    bool_or(m.label in ('positive', 'meeting_intent')) as is_hot,
    bool_or(m.label = 'meeting_intent') as has_meeting
  from public.messages m
  where m.direction = 'inbound'
  group by m.thread_id
)
select
  t.id as thread_id,
  t.lead_id,
  l.company_name,
  l.employee_count,
  l.tech_stack,
  coalesce(l.industry, '') as industry,
  lr.last_at,
  coalesce(lb.is_hot, false) as is_hot,
  coalesce(lb.has_meeting, false) as has_meeting,
  coalesce(
    round(
      (
        case
          when coalesce(lb.has_meeting, false) then 60
          when coalesce(lb.is_hot, false) then 45
          else 0
        end
      )
      + (
        case
          when lr.last_at is not null then
            greatest(
              0,
              30 - least(30, extract(epoch from (now() - lr.last_at)) / 86400)
            )
          else
            0
        end
      )
      + (
        case
          when l.employee_count >= 50 then 5
          else 0
        end
      )
      + (
        case
          when jsonb_typeof(l.tech_stack) = 'object' and l.tech_stack ? 'hubspot' then 5
          when jsonb_typeof(l.tech_stack) = 'array' and l.tech_stack @> '["hubspot"]'::jsonb then 5
          else 0
        end
      )
    )::numeric
  , 0)::int as score
from public.threads t
join public.leads l on l.id = t.lead_id
left join last_reply lr on lr.thread_id = t.id
left join labels lb on lb.thread_id = t.id;


-- 2) ICP convenience view ------------------------------------------------------
create or replace view public.v_icp_saas_hubspot_50 as
select
  l.id as lead_id,
  l.company_name,
  l.employee_count,
  l.tech_stack,
  (coalesce(l.industry, '') ilike '%saas%') as is_saas,
  (
    (jsonb_typeof(l.tech_stack) = 'object' and l.tech_stack ? 'hubspot')
    or (jsonb_typeof(l.tech_stack) = 'array' and l.tech_stack @> '["hubspot"]'::jsonb)
  ) as has_hubspot,
  (l.employee_count >= 50) as big_enough
from public.leads l;


-- 3) Ensure tech_stack column exists ------------------------------------------
do $$
begin
  alter table public.leads add column if not exists tech_stack jsonb default '{}'::jsonb;
exception
  when duplicate_column then null;
end
$$;


-- 4) Saved view definition column & scope -------------------------------------
alter table public.saved_views
  add column if not exists definition jsonb not null default '{}'::jsonb;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.saved_views'::regclass
      and conname = 'saved_views_scope_check'
  ) then
    alter table public.saved_views drop constraint saved_views_scope_check;
  end if;
end
$$;

alter table public.saved_views
  add constraint saved_views_scope_check
  check (scope in ('account', 'campaign', 'inbox', 'leads'));


-- 5) Helper RPC for executing saved SQL ---------------------------------------
create or replace function public.exec_sql_json(p_sql text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  result json;
begin
  if p_sql is null or length(trim(p_sql)) = 0 then
    return '[]'::json;
  end if;

  execute 'select coalesce(json_agg(x), ''[]''::json) from (' || p_sql || ') as x'
    into result;

  return coalesce(result, '[]'::json);
end;
$$;

grant execute on function public.exec_sql_json(text) to service_role;


-- 6) Seed saved view presets ---------------------------------------------------
insert into public.saved_views (id, account_id, scope, name, visibility, is_system, definition)
values
(
  '44444444-4444-4444-4444-444444444444',
  '00000000-0000-0000-0000-000000000001',
  'leads',
  'ICP Fit — SaaS + HubSpot + >50',
  'system',
  true,
  jsonb_build_object(
    'sql', $q$
      select l.*
      from public.leads l
      join public.v_icp_saas_hubspot_50 v on v.lead_id = l.id
      where v.is_saas = true
        and v.has_hubspot = true
        and v.big_enough = true
      order by coalesce(l.updated_at, l.created_at) desc
    $q$
  )
),
(
  '55555555-5555-5555-5555-555555555555',
  '00000000-0000-0000-0000-000000000001',
  'inbox',
  'Hot Leads — last 7d + score ≥ 60',
  'system',
  true,
  jsonb_build_object(
    'sql', $q$
      select t.*, s.score, s.has_meeting
      from public.threads t
      join public.v_lead_reply_scores s on s.thread_id = t.id
      where s.last_at >= now() - interval '7 days'
        and s.score >= 60
      order by s.has_meeting desc, s.score desc, s.last_at desc
    $q$
  )
)
on conflict do nothing;


