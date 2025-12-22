-- BLOCK 267700 — SmartSend Market Control Sprint v1
-- City Saturation Control • Fresh-first Sending • Momentum (Replies/50) • Source Reinforcement

-- =========================================================
-- 1) Campaign Market (one campaign = one city)
-- =========================================================

create or replace function public.normalize_market_key(p_city text, p_state text)
returns text
language sql
immutable
as $$
  select case
    when nullif(trim(coalesce(p_city, '')), '') is null then null
    when nullif(trim(coalesce(p_state, '')), '') is null then null
    else lower(trim(p_city)) || ', ' || upper(trim(p_state))
  end;
$$;

alter table public.campaigns
  add column if not exists market_city text,
  add column if not exists market_state text,
  add column if not exists market_key text;

create index if not exists idx_campaigns_market_key
  on public.campaigns(market_key)
  where market_key is not null;

create or replace function public.set_campaign_market_key()
returns trigger
language plpgsql
as $$
begin
  new.market_key := public.normalize_market_key(new.market_city, new.market_state);
  return new;
end;
$$;

drop trigger if exists trg_set_campaign_market_key on public.campaigns;
create trigger trg_set_campaign_market_key
before insert or update of market_city, market_state
on public.campaigns
for each row
execute function public.set_campaign_market_key();

-- =========================================================
-- 2) City Saturation Soft Caps
-- =========================================================

create table if not exists public.market_city_caps (
  market_key text primary key,
  soft_cap_active_roofers int not null default 3,
  updated_at timestamptz not null default now()
);

create or replace function public.set_market_city_caps_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_market_city_caps_updated_at on public.market_city_caps;
create trigger trg_market_city_caps_updated_at
before update on public.market_city_caps
for each row
execute function public.set_market_city_caps_updated_at();

create or replace view public.v_market_saturation as
with active as (
  select
    c.market_key,
    c.org_id
  from public.campaigns c
  where c.market_key is not null
    and coalesce(c.paused, false) = false
    and c.status in ('active', 'running')
)
select
  a.market_key,
  count(distinct a.org_id) filter (where a.org_id is not null) as active_roofers,
  coalesce(m.soft_cap_active_roofers, 3) as soft_cap_active_roofers,
  greatest(
    0,
    coalesce(m.soft_cap_active_roofers, 3)
    - count(distinct a.org_id) filter (where a.org_id is not null)
  ) as spots_left
from active a
left join public.market_city_caps m
  on m.market_key = a.market_key
group by a.market_key, m.soft_cap_active_roofers;

grant select on public.v_market_saturation to authenticated;

-- =========================================================
-- 3) Outreach Momentum (Replies per 50 sends) — last 30 days
-- =========================================================

create or replace view public.v_sender_account_outreach_momentum_30d as
with w as (select now() - interval '30 days' as since),
sends as (
  select
    sq.sender_account_id,
    count(*)::int as sends_30d
  from public.send_queue sq, w
  where sq.sender_account_id is not null
    and sq.status in ('sent', 'delivered')
    and sq.updated_at >= w.since
  group by sq.sender_account_id
),
replies as (
  select
    sq.sender_account_id,
    count(distinct sq.lead_id)::int as replies_30d
  from public.send_queue sq
  join public.leads l
    on l.id = sq.lead_id
  , w
  where sq.sender_account_id is not null
    and sq.status in ('sent', 'delivered')
    and sq.updated_at >= w.since
    and l.replied_at is not null
    and l.replied_at >= w.since
  group by sq.sender_account_id
)
select
  sa.id as sender_account_id,
  sa.org_id,
  coalesce(s.sends_30d, 0) as sends_30d,
  coalesce(r.replies_30d, 0) as replies_30d,
  case
    when coalesce(s.sends_30d, 0) = 0 then 0
    else round((coalesce(r.replies_30d, 0)::numeric / s.sends_30d::numeric) * 50, 2)
  end as replies_per_50,
  case
    when coalesce(s.sends_30d, 0) = 0 then 'cold'
    when ((coalesce(r.replies_30d, 0)::numeric / s.sends_30d::numeric) * 50) >= 5 then 'fire'
    when ((coalesce(r.replies_30d, 0)::numeric / s.sends_30d::numeric) * 50) >= 2 then 'warm'
    else 'cold'
  end as momentum_tier,
  case
    when coalesce(s.sends_30d, 0) = 0 then '❄️'
    when ((coalesce(r.replies_30d, 0)::numeric / s.sends_30d::numeric) * 50) >= 5 then '🔥'
    when ((coalesce(r.replies_30d, 0)::numeric / s.sends_30d::numeric) * 50) >= 2 then '⚡'
    else '❄️'
  end as momentum_badge
from public.sender_accounts sa
left join sends s
  on s.sender_account_id = sa.id
left join replies r
  on r.sender_account_id = sa.id;

grant select on public.v_sender_account_outreach_momentum_30d to authenticated;

-- =========================================================
-- 4) Fresh leads always send first
-- =========================================================
-- Fresh = lead.created_at within last 7 days

create or replace function public.claim_send_jobs(batch_size int default 50)
returns table (
  job_id uuid,
  workspace_id uuid,
  campaign_id uuid,
  lead_id uuid,
  subject text,
  body text,
  sender_account_id uuid,
  skip_reason text
)
language plpgsql
as $$
begin
  return query
  with cte as (
    select q.id
    from public.send_queue q
    left join public.leads l
      on l.id = q.lead_id
    where q.status = 'pending'
      and coalesce(q.scheduled_at, now()) <= now()
    order by
      (l.created_at >= now() - interval '7 days') desc nulls last,
      coalesce(q.priority, 0) desc,
      q.scheduled_at asc nulls first
    limit batch_size
    for update skip locked
  )
  update public.send_queue q
     set status = 'sending',
         processing_started_at = now(),
         last_attempt_at = now()
  from cte
  where q.id = cte.id
  returning
    q.id as job_id,
    q.workspace_id,
    q.campaign_id,
    q.lead_id,
    q.subject,
    q.body,
    q.sender_account_id,
    q.skip_reason;
end;
$$;

grant execute on function public.claim_send_jobs(int) to service_role;







