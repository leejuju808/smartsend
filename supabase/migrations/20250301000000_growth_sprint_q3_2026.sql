-- Q3 2026 Growth Sprint - Scale & Systematize Acquisition
-- Builds autopilot growth engine for 500+ orgs and $3M ARR

-- ============================================================================
-- 1. Funnel Infrastructure & Attribution
-- ============================================================================

create table if not exists public.growth_funnels (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('organic', 'referral', 'ad', 'partner')),
  campaign text,
  leads int default 0,
  signups int default 0,
  conversions int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_growth_funnels_source on public.growth_funnels(source, created_at desc);
create index if not exists idx_growth_funnels_campaign on public.growth_funnels(campaign, created_at desc);

-- RLS for growth_funnels
alter table public.growth_funnels enable row level security;

-- Service role has full access
create policy "Service role has full access to growth_funnels"
  on public.growth_funnels for all
  to service_role
  using (true)
  with check (true);

-- Authenticated users can view funnels
create policy "Users can view growth funnels"
  on public.growth_funnels for select
  to authenticated
  using (true);

-- Update timestamp trigger
drop trigger if exists trg_growth_funnels_updated on public.growth_funnels;
create trigger trg_growth_funnels_updated
  before update on public.growth_funnels
  for each row
  execute function public.touch_updated_at();

-- Function to update daily funnel metrics from analytics events
create or replace function public.update_growth_funnels_daily()
returns void language plpgsql security definer as $$
declare
  v_rec record;
begin
  for v_rec in
    select 
      coalesce(ae.context->>'source', 'organic') as source,
      ae.context->>'campaign' as campaign,
      count(*) filter (where ae.name = 'lead_created') as leads,
      count(*) filter (where ae.name = 'signup_completed') as signups,
      count(*) filter (where ae.name = 'subscription_created') as conversions,
      date_trunc('day', ae.created_at) as day
    from public.analytics_events ae
    where ae.created_at >= now() - interval '90 days'
    group by source, campaign, day
  loop
    insert into public.growth_funnels (source, campaign, leads, signups, conversions, created_at)
    values (v_rec.source, v_rec.campaign, v_rec.leads, v_rec.signups, v_rec.conversions, v_rec.day)
    on conflict do nothing;
  end loop;
end $$;

grant execute on function public.update_growth_funnels_daily() to service_role;

-- ============================================================================
-- 2. Marketing Posts & AI Content Engine
-- ============================================================================

create table if not exists public.marketing_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'archived')),
  scheduled_at timestamptz,
  published_at timestamptz,
  category text check (category in ('blog', 'case_study', 'tutorial', 'announcement')),
  seo_keywords text[] default '{}',
  author text default 'AUREV AI',
  views int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_marketing_posts_status on public.marketing_posts(status, created_at desc);
create index if not exists idx_marketing_posts_category on public.marketing_posts(category);
create index if not exists idx_marketing_posts_scheduled on public.marketing_posts(scheduled_at) where status = 'scheduled';

-- RLS for marketing_posts
alter table public.marketing_posts enable row level security;

-- Service role has full access
create policy "Service role has full access to marketing_posts"
  on public.marketing_posts for all
  to service_role
  using (true)
  with check (true);

-- Public can view published posts
create policy "Public can view published marketing posts"
  on public.marketing_posts for select
  to anon, authenticated
  using (status = 'published');

-- Update timestamp trigger
drop trigger if exists trg_marketing_posts_updated on public.marketing_posts;
create trigger trg_marketing_posts_updated
  before update on public.marketing_posts
  for each row
  execute function public.touch_updated_at();

-- ============================================================================
-- 3. Referral System - Add referrer to subscriptions
-- ============================================================================

alter table if exists public.subscriptions
  add column if not exists referrer text,
  add column if not exists referral_code text;

create index if not exists idx_subscriptions_referrer on public.subscriptions(referrer);

-- Referral tracking table
create table if not exists public.referral_tracking (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid references auth.users(id) on delete set null,
  referred_org_id uuid,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  referral_code text not null,
  commission_rate numeric default 0.10, -- 10% recurring
  commission_amount numeric,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  first_paid_at timestamptz
);

create index if not exists idx_referral_tracking_referrer on public.referral_tracking(referrer_id, status);
create index if not exists idx_referral_tracking_code on public.referral_tracking(referral_code);

-- RLS for referral_tracking
alter table public.referral_tracking enable row level security;

create policy "Service role has full access to referral_tracking"
  on public.referral_tracking for all
  to service_role
  using (true)
  with check (true);

create policy "Users can view their own referrals"
  on public.referral_tracking for select
  to authenticated
  using (auth.uid() = referrer_id);

-- Update timestamp trigger
drop trigger if exists trg_referral_tracking_updated on public.referral_tracking;
create trigger trg_referral_tracking_updated
  before update on public.referral_tracking
  for each row
  execute function public.touch_updated_at();

-- ============================================================================
-- 4. Growth Agents Templates (pre-built SmartSend sequences)
-- ============================================================================

create table if not exists public.growth_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  target_industry text[] default '{}', -- e.g., 'agencies', 'construction', 'recruiters'
  template_config jsonb not null, -- SmartSend sequence configuration
  lead_source text check (lead_source in ('organic', 'cold_outreach', 'warm_intro', 'referral')),
  conversion_target text, -- e.g., '/enterprise/demo'
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_growth_agents_industry on public.growth_agents using gin (target_industry);
create index if not exists idx_growth_agents_active on public.growth_agents(is_active, created_at desc);

-- RLS for growth_agents
alter table public.growth_agents enable row level security;

create policy "All can view active growth agents"
  on public.growth_agents for select
  to anon, authenticated
  using (is_active = true);

create policy "Service role has full access to growth_agents"
  on public.growth_agents for all
  to service_role
  using (true)
  with check (true);

-- Update timestamp trigger
drop trigger if exists trg_growth_agents_updated on public.growth_agents;
create trigger trg_growth_agents_updated
  before update on public.growth_agents
  for each row
  execute function public.touch_updated_at();

-- ============================================================================
-- 5. Growth Metrics View (for dashboard)
-- ============================================================================

create or replace view public.growth_metrics_summary as
select
  -- Orgs
  (select count(distinct org_id) from public.analytics_events) as active_orgs,
  (select count(*) from public.profiles where created_at >= date_trunc('month', now())) as monthly_signups,
  
  -- ARR calculation from subscriptions
  (select coalesce(sum(s.price_usd * 12), 0) 
   from public.subscriptions s
   join public.plans p on p.id = s.plan_id
   where s.status = 'active') as arr,
  
  -- Conversion metrics
  (select count(*) from public.subscriptions where status = 'active') as active_subscriptions,
  (select count(*) from public.subscriptions where created_at >= date_trunc('month', now())) as subscriptions_this_month,
  
  -- Referral metrics
  (select count(*) from public.referral_tracking where status = 'paid') as referral_payouts,
  (select count(*) from public.subscriptions where referrer is not null) as referrals_converted,
  
  -- Funnel metrics
  (select sum(leads) from public.growth_funnels where created_at >= date_trunc('month', now())) as leads_this_month,
  (select sum(signups) from public.growth_funnels where created_at >= date_trunc('month', now())) as signups_this_month,
  (select sum(conversions) from public.growth_funnels where created_at >= date_trunc('month', now())) as conversions_this_month,
  
  -- CAC payback calculation (simplified)
  round(
    (select coalesce(sum(amount), 0) from public.subscriptions where created_at >= date_trunc('month', now())) /
    nullif((select sum(conversions) from public.growth_funnels where created_at >= date_trunc('month', now())), 0),
    2
  ) as cac_payback_months,
  
  now() as last_updated
;

grant select on public.growth_metrics_summary to authenticated;
grant select on public.growth_metrics_summary to service_role;

-- ============================================================================
-- 6. Insert Default Growth Agents
-- ============================================================================

insert into public.growth_agents (name, description, target_industry, template_config, lead_source, conversion_target)
values
  (
    'AI for Agencies',
    'Pre-built sequence for marketing/creative agencies looking to automate client outreach',
    ARRAY['agencies', 'marketing', 'creative'],
    '{"subject_line": "Automate your agency''s client outreach", "follow_ups": 3, "personality": "professional"}'::jsonb,
    'cold_outreach',
    '/enterprise/demo'
  ),
  (
    'Workflow Automation for Construction',
    'Target construction firms with operational automation solutions',
    ARRAY['construction', 'trades', 'contractors'],
    '{"subject_line": "Streamline your construction workflows", "follow_ups": 2, "personality": "practical"}'::jsonb,
    'cold_outreach',
    '/enterprise/demo'
  ),
  (
    'SmartSend for Recruiters',
    'Recruitment automation sequence for staffing agencies',
    ARRAY['recruiting', 'staffing', 'talent'],
    '{"subject_line": "Automate your recruitment pipeline", "follow_ups": 3, "personality": "friendly"}'::jsonb,
    'cold_outreach',
    '/enterprise/demo'
  )
on conflict do nothing;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

comment on table public.growth_funnels is 'Daily funnel metrics by source and campaign for attribution tracking';
comment on table public.marketing_posts is 'AI-generated blog posts and case studies';
comment on table public.referral_tracking is 'Track referral commissions and payouts';
comment on table public.growth_agents is 'Pre-built SmartSend sequences for automated outreach campaigns';
comment on view public.growth_metrics_summary is 'Aggregated growth metrics for dashboard display';

comment on function public.update_growth_funnels_daily() is 'Daily cron job to aggregate analytics events into funnel metrics';
