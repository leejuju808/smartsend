-- Campaign goals table, RLS, and supporting analytics helpers

-- A) Goals per campaign
create table if not exists public.campaign_goals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  window_days int not null default 30 check (window_days in (7, 14, 30, 60, 90, 180)),
  target_sends int,
  target_reply_rate numeric,
  target_open_rate numeric,
  target_bounce_rate numeric,
  notes text,
  active boolean not null default true
);

create index if not exists idx_cgoal_campaign_active on public.campaign_goals (campaign_id) where active;
create index if not exists idx_cgoal_campaign_window on public.campaign_goals (campaign_id, window_days) where active;

-- RLS: viewers can read; editors/owners can write
alter table public.campaign_goals enable row level security;

drop policy if exists "goals_read_members" on public.campaign_goals;
create policy "goals_read_members" on public.campaign_goals
  for select to authenticated
  using (public.is_campaign_viewer(campaign_id));

drop policy if exists "goals_write_editors" on public.campaign_goals;
create policy "goals_write_editors" on public.campaign_goals
  for insert to authenticated
  with check (public.is_campaign_editor(campaign_id));

drop policy if exists "goals_update_editors" on public.campaign_goals;
create policy "goals_update_editors" on public.campaign_goals
  for update to authenticated
  using (public.is_campaign_editor(campaign_id))
  with check (public.is_campaign_editor(campaign_id));

drop policy if exists "goals_delete_owners" on public.campaign_goals;
create policy "goals_delete_owners" on public.campaign_goals
  for delete to authenticated
  using (public.is_campaign_owner(campaign_id));

-- B) Org benchmarks (median & percentiles across campaigns)
create or replace function public.get_org_benchmarks(p_days int default 30)
returns table (
  campaigns int,
  sends_sum int,
  replies_sum int,
  reply_rate_median numeric,
  reply_rate_p75 numeric,
  reply_rate_p90 numeric,
  sends_median int,
  sends_p75 int,
  sends_p90 int
) language sql stable as $$
  with per as (
    select
      c.id,
      coalesce((select count(*) from public.v_sends s where s.campaign_id = c.id and s.d >= now()::date - (p_days::int - 1)), 0) as sends,
      coalesce((select count(*) from public.v_inbound_replies r where r.campaign_id = c.id and r.d >= now()::date - (p_days::int - 1)), 0) as replies
    from public.campaigns c
    where public.is_campaign_viewer(c.id)
  ),
  rr as (
    select id, sends, replies,
      case when sends > 0 then replies::numeric / sends * 100 else 0 end as reply_rate
    from per
  )
  select
    (select count(*) from rr) as campaigns,
    (select coalesce(sum(sends), 0) from rr)::int as sends_sum,
    (select coalesce(sum(replies), 0) from rr)::int as replies_sum,
    round((select percentile_disc(0.5) within group (order by reply_rate) from rr), 2) as reply_rate_median,
    round((select percentile_disc(0.75) within group (order by reply_rate) from rr), 2) as reply_rate_p75,
    round((select percentile_disc(0.9) within group (order by reply_rate) from rr), 2) as reply_rate_p90,
    (select percentile_disc(0.5) within group (order by sends) from rr)::int as sends_median,
    (select percentile_disc(0.75) within group (order by sends) from rr)::int as sends_p75,
    (select percentile_disc(0.9) within group (order by sends) from rr)::int as sends_p90;
$$;

-- C) Per-campaign rank vs org (for overview table badges)
create or replace function public.get_campaign_ranks(p_days int default 30)
returns table (
  campaign_id uuid,
  sends int,
  replies int,
  reply_rate numeric,
  sends_rank int,
  reply_rate_rank int
) language sql stable as $$
  with per as (
    select
      c.id as campaign_id,
      coalesce((select count(*) from public.v_sends s where s.campaign_id = c.id and s.d >= now()::date - (p_days::int - 1)), 0) as sends,
      coalesce((select count(*) from public.v_inbound_replies r where r.campaign_id = c.id and r.d >= now()::date - (p_days::int - 1)), 0) as replies
    from public.campaigns c
    where public.is_campaign_viewer(c.id)
  ),
  rr as (
    select campaign_id, sends, replies,
      case when sends > 0 then replies::numeric / sends * 100 else 0 end as reply_rate
    from per
  )
  select
    campaign_id, sends, replies, round(reply_rate, 2) as reply_rate,
    dense_rank() over (order by sends desc) as sends_rank,
    dense_rank() over (order by reply_rate desc) as reply_rate_rank
  from rr;
$$;

-- D) Convenience function: active goal joined to latest KPIs per campaign (window-aware)
create or replace function public.get_campaign_goal_status(p_campaign uuid, p_days int default null)
returns table (
  window_days int,
  target_sends int,
  target_reply_rate numeric,
  target_open_rate numeric,
  target_bounce_rate numeric,
  sends int,
  replies int,
  reply_rate numeric,
  opens int,
  open_rate numeric,
  bounce_rate numeric,
  ok_sends boolean,
  ok_reply_rate boolean,
  ok_open_rate boolean,
  ok_bounce_rate boolean
) language sql stable as $$
  with g as (
    select window_days, target_sends, target_reply_rate, target_open_rate, target_bounce_rate
    from public.campaign_goals
    where campaign_id = p_campaign and active
    order by created_at desc
    limit 1
  ),
  w as (
    select coalesce(p_days, (select window_days from g limit 1))::int as days
  ),
  k as (
    select * from public.get_campaign_kpis(p_campaign, (select days from w))
  )
  select
    (select days from w) as window_days,
    g.target_sends,
    g.target_reply_rate,
    g.target_open_rate,
    g.target_bounce_rate,
    k.sends,
    k.replies,
    k.reply_rate,
    k.opens,
    k.open_rate,
    k.bounce_rate,
    (g.target_sends is null or k.sends >= g.target_sends) as ok_sends,
    (g.target_reply_rate is null or k.reply_rate >= g.target_reply_rate) as ok_reply_rate,
    (g.target_open_rate is null or k.open_rate >= g.target_open_rate) as ok_open_rate,
    (g.target_bounce_rate is null or k.bounce_rate <= g.target_bounce_rate) as ok_bounce_rate
  from g, k;
$$;


