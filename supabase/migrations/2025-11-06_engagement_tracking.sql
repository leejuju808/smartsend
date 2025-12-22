-- Email engagement tracking enhancements

-- A) Ensure step + variant wiring on send_logs
alter table public.send_logs
  add column if not exists step_no int,
  add column if not exists variant_id uuid references public.campaign_step_variants(id) on delete set null;

create index if not exists idx_logs_campaign_step on public.send_logs(campaign_id, step_no);
create index if not exists idx_logs_variant on public.send_logs(variant_id);

-- B) Fast lookup for open/click stamps
create index if not exists idx_logs_open on public.send_logs(opened_at);
create index if not exists idx_logs_click on public.send_logs(clicked_at);

-- C) RPCs to stamp open/click (safe/idempotent)
create or replace function public.stamp_open(p_log uuid, p_at timestamptz default now())
returns void
language sql
security definer
set search_path = public
as $$
  update public.send_logs
     set opened_at = coalesce(opened_at, p_at),
         updated_at = now(),
         status = case when status is null then status else status end
   where id = p_log;
$$;

create or replace function public.stamp_click(p_log uuid, p_url text, p_at timestamptz default now())
returns void
language sql
security definer
set search_path = public
as $$
  update public.send_logs
     set clicked_at = coalesce(clicked_at, p_at),
         updated_at = now()
   where id = p_log;
$$;

-- D) Funnel views
-- Per-campaign, per-step (+ optional variant) rollup
create or replace view public.v_campaign_step_funnel as
select
  sl.campaign_id,
  sl.step_no,
  sl.variant_id,
  count(*)                                   as sent,
  count(*) filter (where sl.opened_at is not null)   as opened,
  count(*) filter (where sl.clicked_at is not null)  as clicked,
  count(*) filter (where sl.replied_at is not null)  as replied,
  count(*) filter (where sl.bounced_at is not null)  as bounced,
  round(100.0 * count(*) filter (where sl.opened_at is not null) / nullif(count(*),0), 2) as open_rate_pct,
  round(100.0 * count(*) filter (where sl.clicked_at is not null) / nullif(count(*),0), 2) as click_rate_pct,
  round(100.0 * count(*) filter (where sl.replied_at is not null) / nullif(count(*),0), 2) as reply_rate_pct,
  round(100.0 * count(*) filter (where sl.bounced_at is not null) / nullif(count(*),0), 2) as bounce_rate_pct
from public.send_logs sl
group by 1,2,3
order by 1,2;

-- 30-day open/click trend (per campaign)
create or replace view public.v_campaign_open_click_daily as
select
  sl.campaign_id,
  date_trunc('day', coalesce(sl.opened_at, sl.created_at))::date as day,
  count(*)                                           as sent,
  count(*) filter (where sl.opened_at is not null)   as opened,
  count(*) filter (where sl.clicked_at is not null)  as clicked
from public.send_logs sl
where coalesce(sl.created_at, now()) >= now() - interval '30 days'
group by 1,2
order by 1,2;

