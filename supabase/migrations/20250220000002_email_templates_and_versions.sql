-- Email Templates & Template Versions System
-- This migration creates the template storage system for AI rewrites

-- Base template tied to a campaign
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null default 'Default',
  subject text not null,
  body text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- AI rewrites / manual edits are stored as versions
create table if not exists public.template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.email_templates(id) on delete cascade,
  variant_key text not null, -- e.g., "A","B","C", or "rw-2025-11-02T08:20Z"
  subject text not null,
  body text not null,
  tone text,           -- 'casual' | 'concise' | 'warm' | ...
  length text,         -- 'short' | 'medium' | 'long'
  score jsonb not null default '{}'::jsonb,  -- quality metrics
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique(template_id, variant_key)
);

-- Indexes for performance
create index if not exists idx_email_templates_campaign on public.email_templates(campaign_id);
create index if not exists idx_template_versions_template on public.template_versions(template_id);
create index if not exists idx_template_versions_key on public.template_versions(template_id, variant_key);

alter table public.email_templates enable row level security;
alter table public.template_versions enable row level security;

-- RLS: campaign access governs read; sender+ can write
create policy "templates read" on public.email_templates
for select using (exists (
  select 1 from public.v_campaign_access v
  where v.campaign_id = email_templates.campaign_id and v.user_id = auth.uid()
));

create policy "templates write" on public.email_templates
for all using (exists (
  select 1 from public.v_campaign_access v
  where v.campaign_id = email_templates.campaign_id and v.user_id = auth.uid() and v.role in ('sender','admin')
)) with check (exists (
  select 1 from public.v_campaign_access v
  where v.campaign_id = email_templates.campaign_id and v.user_id = auth.uid() and v.role in ('sender','admin')
));

create policy "template_versions read" on public.template_versions
for select using (exists (
  select 1 from public.email_templates t
  join public.v_campaign_access v on v.campaign_id = t.campaign_id
  where t.id = template_versions.template_id and v.user_id = auth.uid()
));

create policy "template_versions write" on public.template_versions
for all using (exists (
  select 1 from public.email_templates t
  join public.v_campaign_access v on v.campaign_id = t.campaign_id
  where t.id = template_versions.template_id and v.user_id = auth.uid() and v.role in ('sender','admin')
)) with check (exists (
  select 1 from public.email_templates t
  join public.v_campaign_access v on v.campaign_id = t.campaign_id
  where t.id = template_versions.template_id and v.user_id = auth.uid() and v.role in ('sender','admin')
));

