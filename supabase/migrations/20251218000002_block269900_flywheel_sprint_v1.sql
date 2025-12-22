-- BLOCK 269900 — SmartSend Flywheel Sprint v1
-- Compounding lead intelligence (subject/time/city), monthly auto-carry, momentum protection, and proof-based volume scaling.
--
-- Design goals:
-- - No “AI” dependency. Pure feedback loops off sends + replies.
-- - Schema-drift safe: only relies on columns that already exist in this repo’s active send_queue path.
-- - Bias for action: produce simple defaults/boosts that the app can use immediately.
--
-- Primary sources:
-- - public.send_queue (outbound sends; priority steering)
-- - public.campaigns (market_key + daily_cap)
-- - public.leads (city/state + replied_at)
-- - public.smartsend_reply_events (reply intent)
--
-- ---------------------------------------------------------
-- 1) Helpers: normalize subject + month boundaries
-- ---------------------------------------------------------
create or replace function public.ss_normalize_subject(p_subject text)
returns text
language sql
immutable
as $$
  select nullif(
    btrim(
      regexp_replace(coalesce(p_subject, ''), '\s*\[SS\|[a-f0-9-]{36}\]\s*', '', 'gi')
    ),
    ''
  );
$$;

comment on function public.ss_normalize_subject(text) is
  'Block 269900: Strips SmartSend lead token suffix and trims whitespace.';

create or replace function public.ss_month_start(p_ts timestamptz)
returns date
language sql
immutable
as $$
  select date_trunc('month', coalesce(p_ts, now()))::date;
$$;

comment on function public.ss_month_start(timestamptz) is
  'Block 269900: Returns the first day of the month for a timestamp.';

-- ---------------------------------------------------------
-- 2) Market momentum view (30d) for city-level steering
-- ---------------------------------------------------------
-- Replies are approximated as: a sent lead that has leads.replied_at within the same 30d window.
-- This matches the existing sender-account momentum view style (Block 267700).
create or replace view public.v_market_outreach_momentum_30d as
with w as (select now() - interval '30 days' as since),
sends as (
  select
    c.org_id,
    c.market_key,
    count(*)::int as sends_30d
  from public.send_queue sq
  join public.campaigns c on c.id = sq.campaign_id
  , w
  where c.market_key is not null
    and sq.status in ('sent','delivered')
    and sq.updated_at >= w.since
  group by c.org_id, c.market_key
),
replies as (
  select
    c.org_id,
    c.market_key,
    count(distinct sq.lead_id)::int as replies_30d
  from public.send_queue sq
  join public.campaigns c on c.id = sq.campaign_id
  join public.leads l on l.id = sq.lead_id
  , w
  where c.market_key is not null
    and sq.status in ('sent','delivered')
    and sq.updated_at >= w.since
    and l.replied_at is not null
    and l.replied_at >= w.since
  group by c.org_id, c.market_key
)
select
  coalesce(s.org_id, r.org_id) as org_id,
  coalesce(s.market_key, r.market_key) as market_key,
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
  end as momentum_tier
from sends s
full join replies r
  on r.org_id is not distinct from s.org_id
 and r.market_key = s.market_key;

grant select on public.v_market_outreach_momentum_30d to authenticated;

comment on view public.v_market_outreach_momentum_30d is
  'Block 269900: City-level momentum (replies per 50 sends) for the last 30 days.';

-- ---------------------------------------------------------
-- 3) Flywheel rollup (daily) — subject/time/market
-- ---------------------------------------------------------
create table if not exists public.ss_flywheel_daily_rollup (
  day date not null,
  org_id uuid,
  workspace_id uuid,
  market_key text,
  send_hour_utc int,
  subject_norm text,
  sends int not null default 0,
  replies int not null default 0,
  positive int not null default 0,
  neutral int not null default 0,
  stop int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (day, org_id, workspace_id, market_key, send_hour_utc, subject_norm)
);

create index if not exists idx_ss_flywheel_daily_rollup_day
  on public.ss_flywheel_daily_rollup(day desc);
create index if not exists idx_ss_flywheel_daily_rollup_market
  on public.ss_flywheel_daily_rollup(org_id, market_key, day desc);

alter table public.ss_flywheel_daily_rollup enable row level security;

drop policy if exists "ss_flywheel_daily_rollup_select_org_members" on public.ss_flywheel_daily_rollup;
create policy "ss_flywheel_daily_rollup_select_org_members" on public.ss_flywheel_daily_rollup
  for select
  to authenticated
  using (
    org_id is null
    or public.is_org_member(org_id)
  );

drop policy if exists "ss_flywheel_daily_rollup_service_role_all" on public.ss_flywheel_daily_rollup;
create policy "ss_flywheel_daily_rollup_service_role_all" on public.ss_flywheel_daily_rollup
  for all
  to service_role
  using (true)
  with check (true);

grant select on public.ss_flywheel_daily_rollup to authenticated;
grant all on public.ss_flywheel_daily_rollup to service_role;

-- Recompute a day (defaults to yesterday UTC).
create or replace function public.ss_flywheel_rollup_day(p_day date default ((now() at time zone 'utc')::date - 1))
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := coalesce(p_day, (now() at time zone 'utc')::date - 1);
  v_from timestamptz := (v_day::timestamptz at time zone 'utc');
  v_to timestamptz := ((v_day + 1)::timestamptz at time zone 'utc');
  v_rows int := 0;
begin
  -- Upsert aggregate per (org, workspace, market, hour, subject)
  with base as (
    select
      (c.org_id)::uuid as org_id,
      sq.workspace_id,
      c.market_key,
      (extract(hour from (sq.scheduled_at at time zone 'utc'))::int) as send_hour_utc,
      public.ss_normalize_subject(sq.subject) as subject_norm,
      sq.lead_id,
      sq.updated_at as sent_at
    from public.send_queue sq
    join public.campaigns c on c.id = sq.campaign_id
    where sq.status in ('sent','delivered')
      and sq.updated_at >= v_from
      and sq.updated_at < v_to
  ),
  reply_intent as (
    -- For rollup, we count intent on the first reply per (lead,campaign) within 14 days after send.
    select
      b.org_id,
      b.workspace_id,
      b.market_key,
      b.send_hour_utc,
      b.subject_norm,
      count(*)::int as sends,
      count(distinct case when e.id is not null then b.lead_id end)::int as replies,
      count(distinct case when e.intent in ('interested','scheduling','referral','positive','hot') then b.lead_id end)::int as positive,
      count(distinct case when e.intent in ('neutral','warm','question','follow_up','other') then b.lead_id end)::int as neutral,
      count(distinct case when e.intent in ('unsubscribe','not_interested','spam','stop','bounce') then b.lead_id end)::int as stop
    from base b
    left join lateral (
      select e.*
      from public.smartsend_reply_events e
      where e.lead_id = b.lead_id
        and e.created_at >= b.sent_at
        and e.created_at < b.sent_at + interval '14 days'
      order by e.created_at asc
      limit 1
    ) e on true
    where b.subject_norm is not null
    group by b.org_id, b.workspace_id, b.market_key, b.send_hour_utc, b.subject_norm
  )
  insert into public.ss_flywheel_daily_rollup(
    day, org_id, workspace_id, market_key, send_hour_utc, subject_norm,
    sends, replies, positive, neutral, stop,
    created_at, updated_at
  )
  select
    v_day, r.org_id, r.workspace_id, r.market_key, r.send_hour_utc, r.subject_norm,
    r.sends, r.replies, r.positive, r.neutral, r.stop,
    now(), now()
  from reply_intent r
  on conflict (day, org_id, workspace_id, market_key, send_hour_utc, subject_norm)
  do update set
    sends = excluded.sends,
    replies = excluded.replies,
    positive = excluded.positive,
    neutral = excluded.neutral,
    stop = excluded.stop,
    updated_at = now();

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.ss_flywheel_rollup_day(date) from public;
grant execute on function public.ss_flywheel_rollup_day(date) to service_role;

comment on function public.ss_flywheel_rollup_day(date) is
  'Block 269900: Recomputes flywheel rollup for a given UTC day.';

-- ---------------------------------------------------------
-- 4) Monthly “what worked” carry — pick best + worst template per org
-- ---------------------------------------------------------
create table if not exists public.ss_template_monthly_carry (
  org_id uuid not null references public.organizations(id) on delete cascade,
  month date not null, -- first day of the month (UTC)
  niche text not null default 'roofing',
  best_template_id uuid,
  worst_template_id uuid,
  best_reply_rate_pct numeric(6,2),
  worst_reply_rate_pct numeric(6,2),
  sends int not null default 0,
  replies int not null default 0,
  created_at timestamptz not null default now(),
  primary key (org_id, month, niche)
);

alter table public.ss_template_monthly_carry enable row level security;

drop policy if exists "ss_template_monthly_carry_select_org_members" on public.ss_template_monthly_carry;
create policy "ss_template_monthly_carry_select_org_members" on public.ss_template_monthly_carry
  for select
  to authenticated
  using (public.is_org_member(org_id));

drop policy if exists "ss_template_monthly_carry_service_role_all" on public.ss_template_monthly_carry;
create policy "ss_template_monthly_carry_service_role_all" on public.ss_template_monthly_carry
  for all
  to service_role
  using (true)
  with check (true);

grant select on public.ss_template_monthly_carry to authenticated;
grant all on public.ss_template_monthly_carry to service_role;

-- Compute carry for a month for all orgs that had sends.
create or replace function public.ss_flywheel_compute_monthly_carry(p_month date default (date_trunc('month', now() at time zone 'utc')::date - interval '1 month')::date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := coalesce(p_month, (date_trunc('month', now() at time zone 'utc')::date - interval '1 month')::date);
  v_from timestamptz := (v_month::timestamptz at time zone 'utc');
  v_to timestamptz := ((v_month + interval '1 month')::date::timestamptz at time zone 'utc');
  v_rows int := 0;
begin
  -- Aggregate performance by org + template_key (stored on campaigns.template_key).
  with perf as (
    select
      c.org_id,
      c.template_key,
      count(distinct sq.lead_id)::int as sends,
      count(distinct case when e.id is not null then sq.lead_id end)::int as replies
    from public.send_queue sq
    join public.campaigns c on c.id = sq.campaign_id
    left join lateral (
      select e.*
      from public.smartsend_reply_events e
      where e.campaign_id = c.id
        and e.lead_id = sq.lead_id
        and e.created_at >= sq.updated_at
        and e.created_at < sq.updated_at + interval '14 days'
      order by e.created_at asc
      limit 1
    ) e on true
    where c.org_id is not null
      and c.template_key is not null
      and sq.status in ('sent','delivered')
      and sq.updated_at >= v_from and sq.updated_at < v_to
    group by c.org_id, c.template_key
  ),
  scored as (
    select
      p.*,
      case when p.sends = 0 then 0 else (p.replies::numeric / p.sends::numeric) * 100 end as reply_rate_pct
    from perf p
    where p.sends >= 25 -- avoid noisy tiny samples
  ),
  ranked as (
    select
      s.*,
      row_number() over (partition by s.org_id order by s.reply_rate_pct desc, s.sends desc) as rn_best,
      row_number() over (partition by s.org_id order by s.reply_rate_pct asc,  s.sends desc) as rn_worst
    from scored s
  ),
  pick as (
    select
      r.org_id,
      -- Map template_key -> template_id (campaign_templates.key) if column exists.
      (select ct.id from public.campaign_templates ct where (ct.key = r.template_key) limit 1) as template_id,
      r.template_key,
      r.sends,
      r.replies,
      r.reply_rate_pct,
      r.rn_best,
      r.rn_worst
    from ranked r
  ),
  per_org as (
    select
      p.org_id,
      (max(p.template_id) filter (where p.rn_best = 1)) as best_template_id,
      (max(p.template_id) filter (where p.rn_worst = 1)) as worst_template_id,
      (max(p.reply_rate_pct) filter (where p.rn_best = 1))::numeric(6,2) as best_reply_rate_pct,
      (min(p.reply_rate_pct) filter (where p.rn_worst = 1))::numeric(6,2) as worst_reply_rate_pct,
      sum(p.sends)::int as sends,
      sum(p.replies)::int as replies
    from pick p
    group by p.org_id
  )
  insert into public.ss_template_monthly_carry(
    org_id, month, niche,
    best_template_id, worst_template_id,
    best_reply_rate_pct, worst_reply_rate_pct,
    sends, replies,
    created_at
  )
  select
    o.org_id, v_month, 'roofing',
    o.best_template_id, o.worst_template_id,
    o.best_reply_rate_pct, o.worst_reply_rate_pct,
    o.sends, o.replies,
    now()
  from per_org o
  on conflict (org_id, month, niche)
  do update set
    best_template_id = excluded.best_template_id,
    worst_template_id = excluded.worst_template_id,
    best_reply_rate_pct = excluded.best_reply_rate_pct,
    worst_reply_rate_pct = excluded.worst_reply_rate_pct,
    sends = excluded.sends,
    replies = excluded.replies,
    created_at = excluded.created_at;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public.ss_flywheel_compute_monthly_carry(date) from public;
grant execute on function public.ss_flywheel_compute_monthly_carry(date) to service_role;

comment on function public.ss_flywheel_compute_monthly_carry(date) is
  'Block 269900: Computes last-month best/worst template per org (auto-carry defaults).';

-- ---------------------------------------------------------
-- 5) Volume scales with proof (campaign-level daily_cap)
-- ---------------------------------------------------------
-- Rules:
-- - If last 14d reply rate is healthy and stop-rate is low => gently increase daily_cap.
-- - If stop-rate spikes => gently decrease daily_cap (momentum protection).
-- - Always clamp within safe bounds.
create or replace function public.ss_flywheel_apply_volume_scaling(
  p_org_id uuid default null,
  p_min_cap int default 25,
  p_max_cap int default 200,
  p_step_up int default 5,
  p_step_down int default 5
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int := 0;
begin
  -- Only apply if campaigns has daily_cap column.
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='campaigns' and column_name='daily_cap'
  ) then
    return 0;
  end if;

  with w as (select now() - interval '14 days' as since),
  perf as (
    select
      c.id as campaign_id,
      c.org_id,
      count(*)::int as sends_14d,
      count(distinct e.lead_id)::int as replies_14d,
      count(distinct case when e.intent in ('unsubscribe','not_interested','spam','stop','bounce') then e.lead_id end)::int as stops_14d
    from public.campaigns c
    join public.send_queue sq on sq.campaign_id = c.id
    left join public.smartsend_reply_events e
      on e.campaign_id = c.id
     and e.lead_id = sq.lead_id
     and e.created_at >= sq.updated_at
     and e.created_at < sq.updated_at + interval '14 days'
    , w
    where sq.status in ('sent','delivered')
      and sq.updated_at >= w.since
      and (p_org_id is null or c.org_id = p_org_id)
    group by c.id, c.org_id
  ),
  decision as (
    select
      p.campaign_id,
      p.org_id,
      p.sends_14d,
      p.replies_14d,
      p.stops_14d,
      case when p.sends_14d = 0 then 0 else (p.replies_14d::numeric / p.sends_14d::numeric) end as reply_rate,
      case when p.sends_14d = 0 then 0 else (p.stops_14d::numeric / p.sends_14d::numeric) end as stop_rate
    from perf p
    where p.sends_14d >= 50
  ),
  upd as (
    update public.campaigns c
       set daily_cap =
         greatest(
           p_min_cap,
           least(
             p_max_cap,
             coalesce(c.daily_cap, p_min_cap) +
             case
               when d.reply_rate >= 0.03 and d.stop_rate <= 0.01 then p_step_up
               when d.stop_rate >= 0.03 then -p_step_down
               else 0
             end
           )
         ),
         updated_at = now()
    from decision d
    where c.id = d.campaign_id
      and (p_org_id is null or c.org_id = p_org_id)
      and (
        (d.reply_rate >= 0.03 and d.stop_rate <= 0.01)
        or (d.stop_rate >= 0.03)
      )
    returning 1
  )
  select count(*) into v_rows from upd;

  return coalesce(v_rows, 0);
end;
$$;

revoke all on function public.ss_flywheel_apply_volume_scaling(uuid,int,int,int,int) from public;
grant execute on function public.ss_flywheel_apply_volume_scaling(uuid,int,int,int,int) to service_role;

comment on function public.ss_flywheel_apply_volume_scaling(uuid,int,int,int,int) is
  'Block 269900: Gently adjusts campaigns.daily_cap when reply health is proven (with safe bounds).';





