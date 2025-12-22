-- Campaign SLA configuration and needs-reply queue

-- A) Per-campaign SLA settings (hours). Defaults are conservative.
create table if not exists public.campaign_sla (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  warn_hours int not null default 24,
  breach_hours int not null default 48
);

comment on table public.campaign_sla is 'Per-campaign SLA thresholds for needing-reply threads.';
comment on column public.campaign_sla.warn_hours is 'Warn when thread open minutes exceed warn_hours * 60.';
comment on column public.campaign_sla.breach_hours is 'Breach when thread open minutes exceed breach_hours * 60.';

-- B) Ensure inbox_threads carries required timestamps/flags.
alter table public.inbox_threads
  add column if not exists last_inbound_at timestamptz,
  add column if not exists last_outbound_at timestamptz,
  add column if not exists replied_at timestamptz,
  add column if not exists needs_reply boolean not null default true;

create index if not exists idx_threads_needs_reply on public.inbox_threads (needs_reply, campaign_id);
create index if not exists idx_threads_inbound_at on public.inbox_threads (last_inbound_at);

-- C) Needs-reply queue view with SLA counters.
create or replace view public.v_threads_needing_reply as
select
  t.id as thread_id,
  t.campaign_id,
  t.lead_id,
  t.last_inbound_at,
  t.last_outbound_at,
  t.replied_at,
  t.needs_reply,
  coalesce(s.warn_hours, 24) as warn_hours,
  coalesce(s.breach_hours, 48) as breach_hours,
  extract(epoch from (now() - coalesce(t.last_inbound_at, t.last_outbound_at, t.replied_at, t.created_at))) / 60.0 as minutes_open,
  case
    when now() - coalesce(t.last_inbound_at, t.last_outbound_at, t.replied_at, t.created_at)
         >= (coalesce(s.breach_hours, 48) || ' hours')::interval then 'breach'
    when now() - coalesce(t.last_inbound_at, t.last_outbound_at, t.replied_at, t.created_at)
         >= (coalesce(s.warn_hours, 24) || ' hours')::interval then 'warn'
    else 'ok'
  end as sla_state
from public.inbox_threads t
left join public.campaign_sla s on s.campaign_id = t.campaign_id
where t.needs_reply = true
  and t.replied_at is null;

alter view public.v_threads_needing_reply set (security_invoker = on);

-- D) Helper RPC for paginated fetch with ordering (stable + RLS-aware).
drop function if exists public.list_threads_needing_reply(uuid, int, int, text, text);

create or replace function public.list_threads_needing_reply(
  p_campaign uuid,
  p_limit int default 50,
  p_offset int default 0,
  p_order_by text default 'minutes_open',
  p_dir text default 'desc'
)
returns table (
  thread_id uuid,
  campaign_id uuid,
  lead_id uuid,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  minutes_open numeric,
  sla_state text
)
language plpgsql
stable
security invoker
as $$
begin
  return query
  with base as (
    select thread_id, campaign_id, lead_id, last_inbound_at, last_outbound_at, minutes_open, sla_state
    from public.v_threads_needing_reply
    where (p_campaign is null or campaign_id = p_campaign)
      and public.is_campaign_viewer(coalesce(p_campaign, campaign_id))
  )
  select *
  from base
  order by
    case when p_order_by = 'minutes_open' and p_dir = 'desc' then minutes_open end desc,
    case when p_order_by = 'minutes_open' and p_dir = 'asc' then minutes_open end asc,
    case when p_order_by = 'last_inbound_at' and p_dir = 'desc' then last_inbound_at end desc,
    case when p_order_by = 'last_inbound_at' and p_dir = 'asc' then last_inbound_at end asc,
    thread_id -- deterministic fallback
  limit greatest(p_limit, 1)
  offset greatest(p_offset, 0);
end;
$$;

grant execute on function public.list_threads_needing_reply(uuid, int, int, text, text) to authenticated;

-- E) Optional daily SLA KPI view.
create or replace view public.v_sla_daily as
select
  t.campaign_id,
  (now() at time zone 'utc')::date as d_utc,
  count(*) filter (where t.sla_state = 'ok') as ok_cnt,
  count(*) filter (where t.sla_state = 'warn') as warn_cnt,
  count(*) filter (where t.sla_state = 'breach') as breach_cnt
from public.v_threads_needing_reply t
group by 1, 2;

alter view public.v_sla_daily set (security_invoker = on);



