-- Variant optimizer schema and views

-- A) Ensure send_logs.variant_id exists and indexed
alter table public.send_logs
  add column if not exists variant_id uuid references public.campaign_step_variants(id) on delete set null;

create index if not exists idx_logs_variant_time on public.send_logs(variant_id, created_at);

-- B) Optimizer state per variant
create table if not exists public.variant_optimizer (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.campaign_step_variants(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  step_no int not null,
  a numeric not null default 1,
  b numeric not null default 1,
  locked boolean not null default false,
  last_eval_at timestamptz,
  last_weight numeric check (last_weight >= 0 and last_weight <= 1),
  unique(variant_id)
);

create index if not exists idx_varopt_step on public.variant_optimizer(campaign_id, step_no);

-- C) Stats view: sends and replies per variant
create or replace view public.v_variant_stats as
with sends as (
  select
    sl.variant_id,
    sl.campaign_id,
    sl.lead_id,
    sl.created_at as sent_at
  from public.send_logs sl
  where sl.status = 'sent' and sl.variant_id is not null
),
replies as (
  select
    s.variant_id,
    s.campaign_id,
    s.lead_id,
    min(m.created_at) as first_reply_at
  from sends s
  join public.inbox_messages m
    on m.direction = 'inbound'
   and m.thread_id is not null
   and m.created_at > s.sent_at
  group by 1,2,3
),
agg as (
  select
    v.id as variant_id,
    v.campaign_id,
    v.step_no,
    count(s.lead_id) as sends,
    count(r.lead_id) as replies
  from public.campaign_step_variants v
  left join sends s on s.variant_id = v.id
  left join replies r on r.variant_id = v.id and r.lead_id = s.lead_id
  where v.enabled
  group by 1,2,3
)
select
  a.variant_id,
  a.campaign_id,
  a.step_no,
  a.sends,
  a.replies,
  coalesce(nullif(a.replies,0)::numeric / nullif(a.sends,0), 0) as reply_rate
from agg a;

-- D) Helper to initialize optimizer rows
create or replace function public.init_variant_optimizer()
returns void
language sql
security definer
as $$
  insert into public.variant_optimizer (variant_id, campaign_id, step_no)
  select v.id, v.campaign_id, v.step_no
  from public.campaign_step_variants v
  left join public.variant_optimizer o on o.variant_id = v.id
  where v.enabled and o.variant_id is null;
$$;

revoke all on function public.init_variant_optimizer() from anon, authenticated;

-- E) Dashboard view: variant overview
create or replace view public.v_variant_overview as
select
  v.id as variant_id,
  v.campaign_id,
  v.step_no,
  v.name,
  v.weight,
  vs.sends,
  vs.replies,
  vs.reply_rate,
  o.a,
  o.b,
  o.locked,
  o.last_weight,
  o.last_eval_at
from public.campaign_step_variants v
left join public.v_variant_stats vs on vs.variant_id = v.id
left join public.variant_optimizer o on o.variant_id = v.id;

-- F) RPC to lock/unlock variants
create or replace function public.variant_lock(p_variant uuid, p_locked boolean)
returns void
language sql
security definer
as $$
  update public.variant_optimizer set locked = p_locked where variant_id = p_variant;
$$;

revoke all on function public.variant_lock(uuid, boolean) from anon, authenticated;











