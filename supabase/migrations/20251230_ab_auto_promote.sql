-- A/B Testing Auto-Promotion: Settings table and summary view
-- Creates ab_settings table and campaign_variant_summary view for statistical evaluation

-- 1) Global thresholds table
create table if not exists ab_settings (
  id int primary key default 1,
  min_sends int not null default 200,                -- total sends threshold
  min_variant_sends int not null default 50,         -- per variant minimum
  min_reply_rate_diff numeric not null default 5.0,  -- pct points
  sig_level numeric not null default 0.05            -- p-value cutoff
);

insert into ab_settings (id) values (1)
on conflict (id) do nothing;

-- 2) Quick summary per campaign + variant
create or replace view campaign_variant_summary as
select
  cs.campaign_id,
  cs.template_variant_id,
  count(*) filter (where cs.status in ('sent','replied','failed','bounced')) as sends,
  count(*) filter (where cs.status = 'replied') as replies,
  case when count(*) filter (where cs.status in ('sent','replied','failed','bounced'))=0
       then 0::numeric
       else round(
         count(*) filter (where cs.status='replied')::numeric
         / nullif(count(*) filter (where cs.status in ('sent','replied','failed','bounced')),0) * 100, 2)
  end as reply_rate_pct
from campaign_sends cs
group by cs.campaign_id, cs.template_variant_id;

-- 3) Add ab_overrides column to campaigns (optional per-campaign settings)
alter table if exists public.campaigns 
  add column if not exists ab_overrides jsonb;

-- 4) Ensure campaign_logs has action and message columns for promotion logging
alter table if exists public.campaign_logs
  add column if not exists action text,
  add column if not exists message text;

create index if not exists idx_campaign_logs_action on public.campaign_logs(campaign_id, action) 
  where action is not null;

