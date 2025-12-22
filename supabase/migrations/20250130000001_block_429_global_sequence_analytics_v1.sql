-- Block 429 — Global Sequence Analytics v1
-- Campaign → Step → Variant → Inbox → Domain Analytics Pipeline
-- Materialized views for fast analytics queries with automatic refresh

-- ============================================
-- 1) Ensure email_events has all required columns
-- ============================================

-- Add workspace_id if missing (get from campaigns)
alter table if exists public.email_events
  add column if not exists workspace_id uuid;

-- Update workspace_id from campaigns for existing rows
update public.email_events ee
set workspace_id = c.workspace_id
from public.campaigns c
where ee.campaign_id = c.id
  and ee.workspace_id is null
  and c.workspace_id is not null;

-- Add foreign key constraint for workspace_id
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'email_events_workspace_id_fkey'
    and table_name = 'email_events'
  ) then
    alter table public.email_events
      add constraint email_events_workspace_id_fkey
      foreign key (workspace_id) references public.workspaces(id) on delete set null;
  end if;
end $$;

-- Ensure step_id exists (already added in block 419, but verify)
alter table if exists public.email_events
  add column if not exists step_id uuid references public.campaign_steps(id) on delete set null;

-- Ensure variant_id exists (already added in block 415, but verify)
alter table if exists public.email_events
  add column if not exists variant_id uuid references public.campaign_step_variants(id) on delete set null;

-- Ensure sender_inbox_id exists (already added in block 425, but verify)
alter table if exists public.email_events
  add column if not exists sender_inbox_id uuid references public.sender_inboxes(id) on delete set null;

-- Normalize event_type values (handle both 'open'/'opened', 'click'/'clicked', 'reply'/'replied')
-- Standardize to: 'sent', 'delivered', 'open', 'click', 'reply', 'bounce', 'spam'
do $$
begin
  -- Normalize 'opened' to 'open'
  update public.email_events
  set event_type = 'open'
  where event_type = 'opened';
  
  -- Normalize 'clicked' to 'click'
  update public.email_events
  set event_type = 'click'
  where event_type = 'clicked';
  
  -- Normalize 'replied' to 'reply'
  update public.email_events
  set event_type = 'reply'
  where event_type = 'replied';
  
  -- Normalize 'complained' to 'spam'
  update public.email_events
  set event_type = 'spam'
  where event_type = 'complained';
end $$;

-- Create indexes for analytics queries
create index if not exists idx_email_events_workspace_type_created 
  on public.email_events(workspace_id, event_type, created_at desc)
  where workspace_id is not null;

create index if not exists idx_email_events_campaign_step_variant 
  on public.email_events(campaign_id, step_id, variant_id, event_type)
  where campaign_id is not null;

create index if not exists idx_email_events_sender_inbox_type 
  on public.email_events(sender_inbox_id, event_type, created_at desc)
  where sender_inbox_id is not null;

-- ============================================
-- 2) Materialized Views for Analytics
-- ============================================

-- 2.1 Workspace Metrics
drop materialized view if exists public.analytics_workspace;
create materialized view public.analytics_workspace as
select
  workspace_id,
  count(*) filter (where event_type = 'sent') as sent,
  count(*) filter (where event_type = 'delivered') as delivered,
  count(distinct lead_id) filter (where event_type = 'open') as unique_opens,
  count(*) filter (where event_type = 'open') as opens,
  count(*) filter (where event_type = 'click') as clicks,
  count(*) filter (where event_type = 'reply') as replies,
  count(*) filter (where event_type = 'bounce') as bounces,
  count(*) filter (where event_type = 'spam') as spam,
  min(created_at) as first_event,
  max(created_at) as last_event
from public.email_events
where workspace_id is not null
group by workspace_id;

create unique index if not exists idx_analytics_workspace_workspace_id 
  on public.analytics_workspace(workspace_id);

-- 2.2 Campaign Metrics
drop materialized view if exists public.analytics_campaign;
create materialized view public.analytics_campaign as
select
  campaign_id,
  count(*) filter (where event_type = 'sent') as sent,
  count(*) filter (where event_type = 'delivered') as delivered,
  count(distinct lead_id) filter (where event_type = 'open') as unique_opens,
  count(*) filter (where event_type = 'open') as opens,
  count(*) filter (where event_type = 'click') as clicks,
  count(*) filter (where event_type = 'reply') as replies,
  count(*) filter (where event_type = 'bounce') as bounces,
  count(*) filter (where event_type = 'spam') as spam,
  min(created_at) as first_event,
  max(created_at) as last_event
from public.email_events
where campaign_id is not null
group by campaign_id;

create unique index if not exists idx_analytics_campaign_campaign_id 
  on public.analytics_campaign(campaign_id);

-- 2.3 Step & Variant Metrics
drop materialized view if exists public.analytics_step_variant;
create materialized view public.analytics_step_variant as
select
  step_id,
  variant_id,
  count(*) filter (where event_type = 'sent') as sent,
  count(*) filter (where event_type = 'delivered') as delivered,
  count(distinct lead_id) filter (where event_type = 'open') as unique_opens,
  count(*) filter (where event_type = 'open') as opens,
  count(*) filter (where event_type = 'click') as clicks,
  count(*) filter (where event_type = 'reply') as replies,
  count(*) filter (where event_type = 'bounce') as bounces,
  min(created_at) as first_event,
  max(created_at) as last_event
from public.email_events
where step_id is not null
group by step_id, variant_id;

create unique index if not exists idx_analytics_step_variant_step_variant 
  on public.analytics_step_variant(step_id, variant_id);

-- 2.4 Inbox Metrics
drop materialized view if exists public.analytics_inbox;
create materialized view public.analytics_inbox as
select
  sender_inbox_id,
  count(*) filter (where event_type = 'sent') as sent,
  count(*) filter (where event_type = 'delivered') as delivered,
  count(distinct lead_id) filter (where event_type = 'open') as unique_opens,
  count(*) filter (where event_type = 'open') as opens,
  count(*) filter (where event_type = 'click') as clicks,
  count(*) filter (where event_type = 'reply') as replies,
  count(*) filter (where event_type = 'bounce') as bounces,
  count(*) filter (where event_type = 'spam') as spam,
  min(created_at) as first_event,
  max(created_at) as last_event
from public.email_events
where sender_inbox_id is not null
group by sender_inbox_id;

create unique index if not exists idx_analytics_inbox_sender_inbox_id 
  on public.analytics_inbox(sender_inbox_id);

-- 2.5 Domain Metrics
drop materialized view if exists public.analytics_domain;
create materialized view public.analytics_domain as
select
  sender_domains.id as domain_id,
  count(*) filter (where email_events.event_type = 'sent') as sent,
  count(*) filter (where email_events.event_type = 'delivered') as delivered,
  count(distinct email_events.lead_id) filter (where email_events.event_type = 'open') as unique_opens,
  count(*) filter (where email_events.event_type = 'open') as opens,
  count(*) filter (where email_events.event_type = 'click') as clicks,
  count(*) filter (where email_events.event_type = 'reply') as replies,
  count(*) filter (where email_events.event_type = 'bounce') as bounces,
  count(*) filter (where email_events.event_type = 'spam') as spam,
  min(email_events.created_at) as first_event,
  max(email_events.created_at) as last_event
from public.email_events
join public.sender_inboxes on email_events.sender_inbox_id = sender_inboxes.id
join public.sender_domains on sender_domains.id = sender_inboxes.domain_id
where email_events.sender_inbox_id is not null
group by sender_domains.id;

create unique index if not exists idx_analytics_domain_domain_id 
  on public.analytics_domain(domain_id);

-- ============================================
-- 3) Refresh Function
-- ============================================

create or replace function public.refresh_analytics_views()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  refresh materialized view concurrently analytics_workspace;
  refresh materialized view concurrently analytics_campaign;
  refresh materialized view concurrently analytics_step_variant;
  refresh materialized view concurrently analytics_inbox;
  refresh materialized view concurrently analytics_domain;
end;
$$;

-- Grant execute permission
grant execute on function public.refresh_analytics_views() to service_role;
grant execute on function public.refresh_analytics_views() to authenticated;

-- ============================================
-- 4) Initial Refresh
-- ============================================

-- Initial refresh (non-concurrent for first run)
refresh materialized view analytics_workspace;
refresh materialized view analytics_campaign;
refresh materialized view analytics_step_variant;
refresh materialized view analytics_inbox;
refresh materialized view analytics_domain;

-- ============================================
-- 5) Cron Job for Automatic Refresh (Every 5 minutes)
-- ============================================

create extension if not exists pg_cron;

-- Schedule refresh every 5 minutes
select cron.schedule(
  'refresh-analytics-views',
  '*/5 * * * *', -- Every 5 minutes
  $$select public.refresh_analytics_views();$$
) where not exists (
  select 1 from cron.job where jobname = 'refresh-analytics-views'
);

-- ============================================
-- 6) RLS Policies for Materialized Views
-- ============================================

-- Workspace analytics - users can view their workspace data
create policy if not exists "analytics_workspace_select_workspace_member" 
  on public.analytics_workspace
  for select using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = analytics_workspace.workspace_id
        and user_id = auth.uid()
    )
  );

-- Campaign analytics - users can view campaigns in their workspace
create policy if not exists "analytics_campaign_select_workspace_member"
  on public.analytics_campaign
  for select using (
    exists (
      select 1 from public.campaigns c
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where c.id = analytics_campaign.campaign_id
        and wm.user_id = auth.uid()
    )
  );

-- Step/Variant analytics - users can view steps in their workspace campaigns
create policy if not exists "analytics_step_variant_select_workspace_member"
  on public.analytics_step_variant
  for select using (
    exists (
      select 1 from public.campaign_steps cs
      join public.campaigns c on c.id = cs.campaign_id
      join public.workspace_members wm on wm.workspace_id = c.workspace_id
      where cs.id = analytics_step_variant.step_id
        and wm.user_id = auth.uid()
    )
  );

-- Inbox analytics - users can view inboxes in their workspace
create policy if not exists "analytics_inbox_select_workspace_member"
  on public.analytics_inbox
  for select using (
    exists (
      select 1 from public.sender_inboxes si
      join public.workspace_members wm on wm.workspace_id = si.workspace_id
      where si.id = analytics_inbox.sender_inbox_id
        and wm.user_id = auth.uid()
    )
  );

-- Domain analytics - users can view domains in their workspace
create policy if not exists "analytics_domain_select_workspace_member"
  on public.analytics_domain
  for select using (
    exists (
      select 1 from public.sender_domains sd
      join public.workspace_members wm on wm.workspace_id = sd.workspace_id
      where sd.id = analytics_domain.domain_id
        and wm.user_id = auth.uid()
    )
  );

-- ============================================
-- 7) Comments
-- ============================================

comment on materialized view public.analytics_workspace is 'Workspace-level email engagement metrics (refreshed every 5 minutes)';
comment on materialized view public.analytics_campaign is 'Campaign-level email engagement metrics (refreshed every 5 minutes)';
comment on materialized view public.analytics_step_variant is 'Step and variant-level email engagement metrics (refreshed every 5 minutes)';
comment on materialized view public.analytics_inbox is 'Sender inbox-level email engagement metrics (refreshed every 5 minutes)';
comment on materialized view public.analytics_domain is 'Domain-level email engagement metrics (refreshed every 5 minutes)';
comment on function public.refresh_analytics_views() is 'Refreshes all analytics materialized views concurrently';



