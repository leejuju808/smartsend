-- Deliverability Guard rules, events, and KPI views (idempotent)

-- 1) Rule definitions per campaign ------------------------------------------
create table if not exists public.deliverability_rules (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  enabled boolean not null default true,

  -- Windows
  window_days int not null default 7,
  min_sends int not null default 50,

  -- Thresholds
  max_bounce_rate real not null default 0.08,
  min_open_rate real not null default 0.10,
  min_reply_rate real not null default 0.005,

  -- Actions
  action_on_variant text not null default 'pause',
  action_on_step text not null default 'warn',
  action_on_account text not null default 'warn',

  -- Cooldowns
  cool_hours int not null default 12
);

alter table public.deliverability_rules enable row level security;

create policy deliverability_rules_select on public.deliverability_rules
  for select to authenticated
  using (public.is_campaign_viewer(campaign_id));

create policy deliverability_rules_write on public.deliverability_rules
  for all to authenticated
  using (public.is_campaign_editor(campaign_id))
  with check (public.is_campaign_editor(campaign_id));

create policy deliverability_rules_service on public.deliverability_rules
  for all to service_role
  using (true)
  with check (true);

-- 2) Guard event audit log ----------------------------------------------------
create table if not exists public.deliverability_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  entity_type text not null check (entity_type in ('variant','step','account')),
  entity_id uuid not null,
  level text not null check (level in ('warn','paused','resume')),
  reason text not null,
  metrics jsonb not null
);

create index if not exists idx_deliverability_events_entity
  on public.deliverability_events(entity_type, entity_id, created_at desc);

alter table public.deliverability_events enable row level security;

create policy deliverability_events_select on public.deliverability_events
  for select to authenticated
  using (public.is_campaign_viewer(campaign_id));

create policy deliverability_events_insert on public.deliverability_events
  for insert to authenticated
  with check (public.is_campaign_editor(campaign_id));

create policy deliverability_events_service on public.deliverability_events
  for all to service_role
  using (true)
  with check (true);

-- 3) Optional flags on sending accounts --------------------------------------
alter table if exists public.accounts
  add column if not exists paused boolean not null default false,
  add column if not exists paused_reason text,
  add column if not exists paused_at timestamptz;

alter table if exists public.connected_accounts
  add column if not exists paused boolean not null default false,
  add column if not exists paused_reason text,
  add column if not exists paused_at timestamptz;

-- 4) Pause metadata on campaign steps ----------------------------------------
alter table if exists public.campaign_steps
  add column if not exists paused boolean not null default false,
  add column if not exists paused_reason text,
  add column if not exists paused_at timestamptz;

-- Ensure variants can store pause notes (used by guard)
alter table if exists public.step_variants
  add column if not exists notes text;

-- 5) Windowed KPI inputs -----------------------------------------------------
create or replace view public.v_guard_inputs as
with config as (
  select campaign_id, window_days
  from public.deliverability_rules
  union all
  select null::uuid as campaign_id, 7::int as window_days
),
sends as (
  select sl.campaign_id, sl.variant_id, sl.step_id, sl.account_id,
         count(*) filter (where sl.status = 'sent') as sends
  from public.send_logs sl
  join config cfg
    on cfg.campaign_id = sl.campaign_id
    or (cfg.campaign_id is null and not exists (
      select 1 from public.deliverability_rules dr where dr.campaign_id = sl.campaign_id
    ))
  where sl.created_at >= now() - cfg.window_days * interval '1 day'
  group by 1,2,3,4
),
bounces as (
  select sl.campaign_id, sl.variant_id, sl.step_id, sl.account_id,
         count(*) as bounces
  from public.send_logs sl
  join config cfg
    on cfg.campaign_id = sl.campaign_id
    or (cfg.campaign_id is null and not exists (
      select 1 from public.deliverability_rules dr where dr.campaign_id = sl.campaign_id
    ))
  where sl.created_at >= now() - cfg.window_days * interval '1 day'
    and sl.status = 'bounced'
  group by 1,2,3,4
),
opens as (
  select te.campaign_id, te.variant_id, te.step_id, null::uuid as account_id,
         count(*) as opens
  from public.tracking_events te
  join config cfg
    on cfg.campaign_id = te.campaign_id
    or (cfg.campaign_id is null and not exists (
      select 1 from public.deliverability_rules dr where dr.campaign_id = te.campaign_id
    ))
  where te.created_at >= now() - cfg.window_days * interval '1 day'
    and te.event = 'open'
  group by 1,2,3,4
),
replies as (
  select s.campaign_id, s.variant_id, s.step_id, null::uuid as account_id,
         count(*) as replies
  from public.v_variant_replies r
  join public.v_variant_sends s
    on s.thread_id = r.thread_id
   and s.variant_id = r.variant_id
  join config cfg
    on cfg.campaign_id = s.campaign_id
    or (cfg.campaign_id is null and not exists (
      select 1 from public.deliverability_rules dr where dr.campaign_id = s.campaign_id
    ))
  where s.queued_at >= now() - cfg.window_days * interval '1 day'
  group by 1,2,3,4
)
select
  coalesce(s.campaign_id, o.campaign_id, r.campaign_id) as campaign_id,
  coalesce(s.variant_id, o.variant_id, r.variant_id) as variant_id,
  coalesce(s.step_id, o.step_id, r.step_id) as step_id,
  s.account_id as account_id,
  coalesce(s.sends, 0) as sends,
  coalesce(b.bounces, 0) as bounces,
  coalesce(o.opens, 0) as opens,
  coalesce(r.replies, 0) as replies
from sends s
full join bounces b using (campaign_id, variant_id, step_id, account_id)
full join opens o using (campaign_id, variant_id, step_id, account_id)
full join replies r using (campaign_id, variant_id, step_id, account_id);

-- 6) Derived metrics ---------------------------------------------------------
create or replace view public.v_guard_metrics as
select
  campaign_id,
  variant_id,
  step_id,
  account_id,
  sends,
  bounces,
  opens,
  replies,
  case when sends > 0 then bounces::real / sends else 0 end as bounce_rate,
  case when sends > 0 then opens::real / sends else 0 end as open_rate,
  case when sends > 0 then replies::real / sends else 0 end as reply_rate
from public.v_guard_inputs;

grant select on public.v_guard_inputs to service_role, authenticated;
grant select on public.v_guard_metrics to service_role, authenticated;

