-- A/B Testing Migration
-- Add variant_id to jobs to attribute sends/opens/clicks
alter table email_jobs add column if not exists variant_id uuid;

-- A/B for one-off Campaigns
create table if not exists campaign_variants (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  key text not null,                             -- "A", "B", "C"
  weight_pct int not null check (weight_pct > 0 and weight_pct <= 100),
  subject_template text not null,
  html_template text not null,
  created_at timestamptz not null default now(),
  unique (campaign_id, key)
);

-- A/B for Sequence Steps
create table if not exists sequence_step_variants (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references sequence_steps(id) on delete cascade,
  key text not null,                             -- "A", "B", "C"
  weight_pct int not null check (weight_pct > 0 and weight_pct <= 100),
  subject_template text not null,
  html_template text not null,
  created_at timestamptz not null default now(),
  unique (step_id, key)
);

-- Deterministic assignment helper (0..99 bucket using md5)
create or replace function ab_bucket(p_seed text)
returns int language sql immutable as $$
  select (('x' || substr(md5(p_seed), 1, 8))::bit(32)::int % 100);
$$;

-- Choose a variant id for a given step & contact based on cumulative weights
create or replace function pick_step_variant(p_step uuid, p_contact uuid)
returns uuid language sql stable as $$
  with v as (
    select id, weight_pct,
           sum(weight_pct) over (order by id) as cum,
           sum(weight_pct) over () as total
    from sequence_step_variants
    where step_id = p_step
  ), b as (select ab_bucket(p_step::text || ':' || p_contact::text) as bucket)
  select id from v, b
  where (bucket * 100) < (cum * 100) / greatest(total,1) * 100
  order by cum asc
  limit 1;
$$;

-- Same for a campaign (when scheduling bulk with an experiment id)
create or replace function pick_campaign_variant(p_campaign uuid, p_contact uuid)
returns uuid language sql stable as $$
  with v as (
    select id, weight_pct,
           sum(weight_pct) over (order by id) as cum,
           sum(weight_pct) over () as total
    from campaign_variants
    where campaign_id = p_campaign
  ), b as (select ab_bucket(p_campaign::text || ':' || p_contact::text) as bucket)
  select id from v, b
  where (bucket * 100) < (cum * 100) / greatest(total,1) * 100
  order by cum asc
  limit 1;
$$;

-- Per-variant metrics (unique opens/clicks)
create or replace view v_step_variant_metrics as
select
  ssv.step_id,
  ssv.id as variant_id,
  ssv.key as variant_key,
  count(j.id) filter (where j.status = 'sent') as sent,
  count(distinct case when es.opens > 0 then j.to_email end) as unique_opens,
  count(distinct case when es.clicks > 0 then j.to_email end) as unique_clicks
from sequence_step_variants ssv
left join email_jobs j on j.variant_id = ssv.id
left join email_sends es on es.job_id = j.id
group by ssv.step_id, ssv.id, ssv.key;

create or replace view v_campaign_variant_metrics as
select
  cv.campaign_id,
  cv.id as variant_id,
  cv.key as variant_key,
  count(j.id) filter (where j.status = 'sent') as sent,
  count(distinct case when es.opens > 0 then j.to_email end) as unique_opens,
  count(distinct case when es.clicks > 0 then j.to_email end) as unique_clicks
from campaign_variants cv
left join email_jobs j on j.variant_id = cv.id
left join email_sends es on es.job_id = j.id
group by cv.campaign_id, cv.id, cv.key;