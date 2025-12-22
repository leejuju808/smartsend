-- Retention Automation & AI Re-Engagement
-- Tracks inactive users and enables automated re-engagement

-- ============================================================================
-- 1. INACTIVE USERS VIEW
-- ============================================================================
-- Tracks users who haven't run a campaign in 7+ days
-- Note: Adapts to channel_messages structure with org_id

create or replace view inactive_users as
select
  p.id as user_id,
  p.email,
  p.full_name,
  max(c.sent_at) as last_activity,
  extract(epoch from (
    case 
      when max(c.sent_at) is null then now() - p.created_at
      else now() - max(c.sent_at)
    end
  )) / 86400.0 as days_inactive,
  p.created_at as signup_date
from profiles p
left join channel_messages c 
  on c.org_id = p.id 
  and c.direction = 'outbound'
  and c.status in ('sent', 'delivered')
group by p.id, p.email, p.full_name, p.created_at
having (
  case 
    when max(c.sent_at) is null then now() - p.created_at
    else now() - max(c.sent_at)
  end
) > interval '7 days';

-- Grant access
grant select on inactive_users to authenticated;
grant select on inactive_users to service_role;

-- ============================================================================
-- 2. UPDATE FOUNDER_KPIS VIEW WITH RETENTION METRICS
-- ============================================================================

create or replace view public.founder_kpis as
select
  -- Activation metrics
  (select count(*) from public.profiles) as total_signups,
  (select count(*) from public.profiles where first_campaign_sent_at is not null) as activated_users,
  round(
    (select count(*)::float from public.profiles where first_campaign_sent_at is not null) /
    nullif((select count(*) from public.profiles), 0) * 100,
    2
  ) as activation_rate_pct,
  
  -- Upgrade metrics
  (select count(*) from public.profiles where plan in ('pro', 'enterprise')) as paid_users,
  round(
    (select count(*)::float from public.profiles where plan in ('pro', 'enterprise')) /
    nullif((select count(*) from public.profiles), 0) * 100,
    2
  ) as upgrade_rate_pct,
  
  -- Referral metrics
  (select count(*) from public.referrals) as total_referrals,
  (select count(*) from public.referrals where status = 'converted') as referral_conversions,
  round(
    (select count(*)::float from public.referrals where status = 'converted') /
    nullif((select count(*) from public.referrals), 0) * 100,
    2
  ) as referral_conversion_rate_pct,
  
  -- Usage metrics
  (select sum(emails_sent_count) from public.profiles) as total_emails_sent,
  (select sum(campaigns_launched_count) from public.profiles) as total_campaigns_launched,
  (select sum(replies_received_count) from public.profiles) as total_replies_received,
  
  -- Churn (last 30 days)
  (select count(*) from public.profiles 
   where plan != 'free' 
   and updated_at < now() - interval '30 days') as at_risk_users,
  
  -- Retention metrics (7-day and 30-day)
  round(
    (select count(*)::float from profiles 
     where id not in (
       select user_id from inactive_users 
       where days_inactive >= 7
     )) / nullif((select count(*) from profiles), 0) * 100,
    2
  ) as retention_7d,
  
  round(
    (select count(*)::float from profiles 
     where id not in (
       select user_id from inactive_users 
       where days_inactive >= 30
     )) / nullif((select count(*) from profiles), 0) * 100,
    2
  ) as retention_30d,
  
  now() as last_updated
;

-- Grant read access
grant select on public.founder_kpis to authenticated;
grant select on public.founder_kpis to anon;

-- ============================================================================
-- 3. AI_TEMPLATES TABLE (if not exists)
-- ============================================================================
-- For storing AI-generated templates including winback campaigns

create table if not exists ai_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid, -- null for global templates
  name text not null,
  body text not null,
  subject text,
  template_type text default 'winback' check (template_type in ('winback', 'activation', 'renewal')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_ai_templates_org on ai_templates(org_id);
create index if not exists idx_ai_templates_type on ai_templates(template_type);

-- RLS
alter table ai_templates enable row level security;

create policy "ai_templates read" on ai_templates
  for select
  using (
    org_id is null -- global templates
    or org_id = auth.uid() -- user's own templates
  );

create policy "ai_templates insert" on ai_templates
  for insert
  with check (
    org_id is null -- only service role can create global templates
    or org_id = auth.uid()
  );

-- Service role has full access
create policy "ai_templates service role" on ai_templates
  for all
  to service_role
  using (true)
  with check (true);

-- ============================================================================
-- 4. SEED WINBACK TEMPLATE
-- ============================================================================

insert into ai_templates (org_id, name, body, subject, template_type)
values (
  null, -- global template
  'Winback Campaign',
  'Hey {{first_name}}, checking back in — did your outreach goals change? SmartSend has new features that could save you hours. Want me to restart your campaign for you?',
  'Ready to pick up where you left off?',
  'winback'
)
on conflict do nothing;

