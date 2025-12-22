-- A/B Testing for Campaigns
-- Adds template_id, ab_mode, variant_weights to campaigns
-- Creates campaign_sends table for per-email send tracking with variant assignment
-- Creates variant_performance view for analytics

-- 1) Update campaigns table with A/B testing fields
alter table if exists public.campaigns
  add column if not exists template_id uuid references public.email_templates(id) on delete set null,
  add column if not exists ab_mode text
    check (ab_mode in ('single','even','weighted')) default 'even',
  add column if not exists variant_weights jsonb; -- e.g. {"Concise":0.5,"Warm":0.3,"Punchy":0.2}

-- 2) Create campaign_sends table for per-email send tracking with variant assignment
create table if not exists public.campaign_sends (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  template_variant_id uuid references public.template_variants(id) on delete set null,
  status text not null default 'queued' 
    check (status in ('queued','sending','sent','failed','bounced','replied')),
  attempt int not null default 0,
  error text,
  queued_at timestamptz default now(),
  sent_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_sends_campaign on public.campaign_sends(campaign_id);
create index if not exists idx_sends_lead on public.campaign_sends(lead_id);
create index if not exists idx_sends_variant on public.campaign_sends(template_variant_id);
create index if not exists idx_sends_status on public.campaign_sends(status);
create index if not exists idx_sends_org on public.campaign_sends(org_id);

-- 3) RLS for campaign_sends
alter table public.campaign_sends enable row level security;

-- Helper function to check org membership (uses single parameter version for RLS)
create or replace function is_org_member(check_org uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.org_members
    where org_id = check_org and user_id = auth.uid()
  );
$$;

drop policy if exists "read sends in my org" on public.campaign_sends;
create policy "read sends in my org" on public.campaign_sends
  for select using (is_org_member(org_id));

drop policy if exists "write sends in my org" on public.campaign_sends;
create policy "write sends in my org" on public.campaign_sends
  for all using (is_org_member(org_id)) 
  with check (is_org_member(org_id));

-- 4) Variant performance view
create or replace view public.variant_performance as
select
  tv.id as variant_id,
  tv.variant_label,
  et.id as template_id,
  et.name as template_name,
  cs.org_id,
  count(*) filter (where cs.status in ('sent','replied','failed','bounced')) as sends,
  count(*) filter (where cs.status = 'replied') as replies,
  case when count(*) filter (where cs.status in ('sent','replied','failed','bounced')) = 0
       then 0::float
       else round(
         count(*) filter (where cs.status = 'replied')::numeric
         / nullif(count(*) filter (where cs.status in ('sent','replied','failed','bounced')),0) * 100, 2
       )
  end as reply_rate_pct,
  min(cs.created_at) as first_send_at,
  max(cs.created_at) as last_send_at
from public.campaign_sends cs
left join public.template_variants tv on tv.id = cs.template_variant_id
left join public.email_templates et on et.id = tv.template_id
group by tv.id, et.id, et.name, tv.variant_label, cs.org_id;

-- 5) Also add template_variant_id to send_queue if it exists (for backward compatibility)
-- This allows existing workers to optionally use variant tracking
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'send_queue') then
    alter table public.send_queue add column if not exists template_variant_id uuid references public.template_variants(id) on delete set null;
    create index if not exists idx_send_queue_variant on public.send_queue(template_variant_id);
  end if;
end $$;

