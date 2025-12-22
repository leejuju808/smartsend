-- Ensure campaign_sort_key enum exists for safe RPC parameterization
do $$
begin
  if not exists (
    select 1
    from pg_type t
    where t.typname = 'campaign_sort_key'
      and t.typnamespace = to_regnamespace('public')
  ) then
    create type public.campaign_sort_key as enum (
      'campaign_name',
      'sends',
      'replies',
      'reply_rate',
      'opens',
      'bounces',
      'send_delta',
      'reply_delta',
      'reply_rate_delta',
      'last_activity'
    );
  end if;
end
$$;


-- Paged campaign overview query with server-side sort / pagination
create or replace function public.get_overview_campaigns_page(
  p_days int default 7,
  p_sort public.campaign_sort_key default 'reply_rate',
  p_dir text default 'desc', -- direction is applied at the caller for simplicity
  p_limit int default 25,
  p_offset int default 0
)
returns table(
  total int,
  campaign_id uuid,
  campaign_name text,
  sends int,
  replies int,
  reply_rate numeric,
  opens int,
  bounces int,
  send_delta int,
  reply_delta int,
  reply_rate_delta numeric,
  last_activity date
) language sql stable as $$
  with cur as (
    select
      c.id as campaign_id,
      coalesce(c.name, ('Campaign ' || left(c.id::text, 8))) as campaign_name,
      count(distinct s.id)::int as sends,
      count(distinct r.id)::int as replies,
      count(distinct o.id)::int as opens,
      count(distinct b.id)::int as bounces,
      max(greatest(s.d, r.d, o.d, b.d)) as last_activity
    from public.campaigns c
    left join public.v_sends s
      on s.campaign_id = c.id
     and s.d >= (now()::date - (p_days::int - 1))
    left join public.v_inbound_replies r
      on r.campaign_id = c.id
     and r.d >= (now()::date - (p_days::int - 1))
    left join public.v_opens o
      on o.campaign_id = c.id
     and o.d >= (now()::date - (p_days::int - 1))
    left join public.v_bounces b
      on b.campaign_id = c.id
     and b.d >= (now()::date - (p_days::int - 1))
    where public.is_campaign_viewer(c.id)
    group by c.id
  ),
  prev as (
    select
      c.id as campaign_id,
      count(distinct s.id)::int as sends,
      count(distinct r.id)::int as replies
    from public.campaigns c
    left join public.v_sends s
      on s.campaign_id = c.id
     and s.d between (now()::date - (p_days::int * 2 - 1))
                 and (now()::date - p_days::int)
    left join public.v_inbound_replies r
      on r.campaign_id = c.id
     and r.d between (now()::date - (p_days::int * 2 - 1))
                 and (now()::date - p_days::int)
    where public.is_campaign_viewer(c.id)
    group by c.id
  ),
  joined as (
    select
      cur.campaign_id,
      cur.campaign_name,
      cur.sends,
      cur.replies,
      case when cur.sends > 0
        then round(cur.replies::numeric / cur.sends * 100, 2)
        else 0
      end as reply_rate,
      cur.opens,
      cur.bounces,
      (cur.sends - coalesce(prev.sends, 0)) as send_delta,
      (cur.replies - coalesce(prev.replies, 0)) as reply_delta,
      round(
        (
          case when cur.sends > 0 then cur.replies::numeric / cur.sends else 0 end
          -
          case when coalesce(prev.sends, 0) > 0 then prev.replies::numeric / prev.sends else 0 end
        ) * 100,
        2
      ) as reply_rate_delta,
      cur.last_activity::date
    from cur
    left join prev using (campaign_id)
  ),
  counted as (
    select (select count(*) from joined) as total, * from joined
  )
  select *
  from counted
  order by
    case when p_sort = 'campaign_name' then campaign_name end collate "C",
    case when p_sort = 'sends' then sends end,
    case when p_sort = 'replies' then replies end,
    case when p_sort = 'reply_rate' then reply_rate end,
    case when p_sort = 'opens' then opens end,
    case when p_sort = 'bounces' then bounces end,
    case when p_sort = 'send_delta' then send_delta end,
    case when p_sort = 'reply_delta' then reply_delta end,
    case when p_sort = 'reply_rate_delta' then reply_rate_delta end,
    case when p_sort = 'last_activity' then extract(epoch from coalesce(last_activity::timestamp, 'epoch'::timestamp)) end,
    campaign_name collate "C",
    campaign_id
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
$$;


-- Email outbox for batched digest delivery
create table if not exists public.email_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  to_email text not null,
  subject text not null,
  html text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'error')),
  error text
);

create index if not exists idx_email_jobs_status on public.email_jobs(status);

