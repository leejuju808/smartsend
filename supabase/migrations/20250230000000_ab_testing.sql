-- A/B Testing: Variant Tracking
-- Adds columns to track which variant was used for each email
-- and creates a view for A/B statistics

-- Queue knows which variant was used
alter table public.send_queue
  add column if not exists variant_key text,        -- 'A' | 'B' | null
  add column if not exists template_version_id uuid; -- optional FK to template_versions.id

-- Logs carry variant forward for analytics
alter table public.send_logs
  add column if not exists variant_key text,
  add column if not exists template_version_id uuid;

-- Campaigns store A/B configuration
alter table public.campaigns
  add column if not exists ab_enabled boolean not null default false,
  add column if not exists ab_template_id uuid,
  add column if not exists ab_variant_a text,  -- e.g., 'A'
  add column if not exists ab_variant_b text;  -- e.g., 'B'

-- Optional FK for template_version_id (soft reference)
create index if not exists idx_send_queue_variant on public.send_queue(campaign_id, variant_key) where variant_key is not null;
create index if not exists idx_send_logs_variant on public.send_logs(campaign_id, variant_key) where variant_key is not null;

-- Optional: fast view for A/B stats
create or replace view public.v_ab_stats as
with sends as (
  select campaign_id, variant_key, count(*) as sends
  from public.send_queue
  where status in ('sent','replied') and variant_key is not null
  group by 1,2
),
replies as (
  -- treat a reply as: any lead whose last queue row for that variant ended 'replied'
  select campaign_id, variant_key, count(*) as replies
  from public.send_queue
  where status = 'replied' and variant_key is not null
  group by 1,2
)
select
  s.campaign_id,
  s.variant_key,
  s.sends,
  coalesce(r.replies,0) as replies,
  case when s.sends>0 then round(100.0*coalesce(r.replies,0)/s.sends,2) else 0 end as reply_rate_pct
from sends s
left join replies r using (campaign_id, variant_key)
order by campaign_id, variant_key;

-- RLS: Inherit from send_queue/send_logs policies (already enforced)
-- View is readable by anyone who can read send_queue
grant select on public.v_ab_stats to authenticated;

