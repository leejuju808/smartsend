-- A/B Variant System for Campaign Steps
-- This migration creates the variant system with idempotent operations

-- A) Step variants table (child of campaign_steps)
create table if not exists public.campaign_step_variants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  step_no int not null,
  name text not null,                               -- e.g., "A", "B", "Short subject"
  weight numeric not null default 0.5 check (weight >= 0 and weight <= 1),
  subject_template text,
  body_html_template text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (campaign_id, step_no, name)
);

create index if not exists idx_csv_by_campaign_step
  on public.campaign_step_variants(campaign_id, step_no) where enabled;

-- B) Attribute variant on send_logs
alter table public.send_logs
  add column if not exists variant_id uuid references public.campaign_step_variants(id) on delete set null;

create index if not exists idx_send_logs_variant on public.send_logs(variant_id);

-- C) Normalize weights per step (helper)
create or replace function public.normalized_variant_weights(p_campaign uuid, p_step int)
returns table(variant_id uuid, weight numeric)
language sql stable as $$
  with v as (
    select id, weight from public.campaign_step_variants
    where campaign_id = p_campaign and step_no = p_step and enabled
  ), s as (
    select sum(weight) as sw from v
  )
  select id as variant_id,
         case when s.sw = 0 then 1.0 / nullif(count(*) over (),0) else weight / s.sw end as weight
  from v, s
$$;

-- D) Pick a variant by deterministic hash (stable per (campaign,step,lead))
-- (prevents double sends selecting different variants on retry)
create or replace function public.pick_variant_for_lead(
  p_campaign uuid,
  p_step int,
  p_lead uuid
) returns uuid
language plpgsql stable as $$
declare
  r record;
  threshold numeric;
  acc numeric := 0;
  h numeric;
begin
  -- 0..1 from hash
  h := (('x' || substr(md5(p_campaign::text || '-' || p_step::text || '-' || p_lead::text),1,8))::bit(32)::int) / 4294967295.0;

  threshold := h;
  for r in select * from public.normalized_variant_weights(p_campaign, p_step) order by variant_id loop
    acc := acc + coalesce(r.weight,0);
    if threshold <= acc then
      return r.variant_id;
    end if;
  end loop;

  -- fallback: first enabled variant or null
  select id into r from public.campaign_step_variants
    where campaign_id=p_campaign and step_no=p_step and enabled
    order by created_at asc limit 1;
  return r.id;
end $$;

-- E) Variant metrics: sent/open/click/reply (per campaign, step, variant)
create or replace view public.v_variant_funnel as
with s as (
  select sl.id, sl.campaign_id, sl.step_no, sl.variant_id
  from public.send_logs sl
),
e as (
  select send_log_id,
         min(created_at) filter (where type='open')  as first_open_at,
         min(created_at) filter (where type='click') as first_click_at
  from public.tracking_events
  group by 1
),
r as (
  select sl.id as send_log_id,
         min(m.created_at) as first_reply_at
  from public.send_logs sl
  join public.inbox_threads t on t.campaign_id = sl.campaign_id and t.lead_id = sl.lead_id
  join public.inbox_messages m on m.thread_id = t.id and m.direction='inbound'
  where m.created_at >= sl.created_at
  group by 1
)
select
  s.campaign_id, s.step_no, s.variant_id,
  count(*)                                        as sent,
  count(*) filter (where e.first_open_at  is not null) as opens,
  count(*) filter (where e.first_click_at is not null) as clicks,
  count(*) filter (where r.first_reply_at is not null) as replies
from s
left join e on e.send_log_id = s.id
left join r on r.send_log_id = s.id
group by 1,2,3
order by 1,2;

-- F) Variant rates view (with calculated percentages)
create or replace view public.v_variant_rates as
select
  vf.campaign_id, vf.step_no, vf.variant_id,
  vf.sent, vf.opens, vf.clicks, vf.replies,
  case when vf.sent>0 then vf.opens::numeric  / vf.sent else 0 end as open_rate,
  case when vf.sent>0 then vf.clicks::numeric / vf.sent else 0 end as click_rate,
  case when vf.sent>0 then vf.replies::numeric/ vf.sent else 0 end as reply_rate
from public.v_variant_funnel vf;

-- G) Step-level A/B settings
alter table public.campaign_steps
  add column if not exists ab_enabled boolean default false,
  add column if not exists ab_min_sample int default 100, -- total sent across variants
  add column if not exists ab_promoted_variant uuid references public.campaign_step_variants(id);

-- H) Choose winner (SQL function)
create or replace function public.pick_winner_variant(p_campaign uuid, p_step int, p_min_sample int)
returns uuid
language sql stable as $$
  with agg as (
    select sum(sent) as total_sent
    from public.v_variant_rates
    where campaign_id=p_campaign and step_no=p_step
  ),
  ranked as (
    select v.*, row_number() over (
      order by reply_rate desc, click_rate desc, open_rate desc
    ) as rn
    from public.v_variant_rates v
    where v.campaign_id=p_campaign and v.step_no=p_step
  )
  select case
           when (select total_sent from agg) >= p_min_sample
             then (select variant_id from ranked where rn=1)
           else null
         end;
$$;

-- I) Apply winner: set promoted + set weights (winner=1, others=0)
create or replace function public.promote_winner_variant(p_campaign uuid, p_step int)
returns uuid
language plpgsql security definer
as $$
declare
  v_min int;
  v_winner uuid;
begin
  select ab_min_sample into v_min from public.campaign_steps where campaign_id=p_campaign and step_no=p_step;
  select public.pick_winner_variant(p_campaign, p_step, coalesce(v_min,100)) into v_winner;
  if v_winner is null then
    return null;
  end if;

  update public.campaign_steps
    set ab_promoted_variant = v_winner, ab_enabled = false
  where campaign_id=p_campaign and step_no=p_step;

  update public.campaign_step_variants
    set weight = case when id=v_winner then 1 else 0 end
  where campaign_id=p_campaign and step_no=p_step;

  return v_winner;
end $$;

-- Enable RLS on variants table
alter table public.campaign_step_variants enable row level security;

-- RLS policy: users can manage variants for their campaigns
drop policy if exists "variant_select_own" on public.campaign_step_variants;
create policy "variant_select_own" on public.campaign_step_variants
  for select using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_step_variants.campaign_id
        and (c.user_id = auth.uid() or exists (
          select 1 from public.campaign_shares s
          where s.campaign_id = c.id and s.user_id = auth.uid()
        ))
    )
  );

drop policy if exists "variant_modify_own" on public.campaign_step_variants;
create policy "variant_modify_own" on public.campaign_step_variants
  for all using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_step_variants.campaign_id
        and c.user_id = auth.uid()
    )
  );

-- Service role can manage all variants
drop policy if exists "variant_service_role" on public.campaign_step_variants;
create policy "variant_service_role" on public.campaign_step_variants
  for all using (auth.role() = 'service_role');

