-- Campaign Email Templates with A/B Testing
-- Creates table for managing email templates per campaign with variant support

create table if not exists public.campaign_email_templates (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,              -- e.g., "V1 - Direct", "V2 - Pain opener"
  variant text not null default 'A',  -- 'A' | 'B' | 'C'...
  weight int not null default 100, -- selection weight (A/B split)
  subject text not null,
  body_text text,                  -- plain alternative (optional)
  body_html text,                  -- html primary (optional)
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Create indexes
create index if not exists idx_campaign_email_templates_campaign_active
  on public.campaign_email_templates (campaign_id) where is_active = true;

create index if not exists idx_campaign_email_templates_campaign
  on public.campaign_email_templates (campaign_id);

-- Enable RLS
alter table public.campaign_email_templates enable row level security;

-- RLS policies for campaign_email_templates (via campaign workspace_id)
create policy "campaign_email_templates_select_workspace" on public.campaign_email_templates
  for select using (
    exists (
      select 1 from public.campaigns c 
      where c.id = campaign_id 
      and c.workspace_id = auth.uid()
    )
  );

create policy "campaign_email_templates_insert_workspace" on public.campaign_email_templates
  for insert with check (
    exists (
      select 1 from public.campaigns c 
      where c.id = campaign_id 
      and c.workspace_id = auth.uid()
    )
  );

create policy "campaign_email_templates_update_workspace" on public.campaign_email_templates
  for update using (
    exists (
      select 1 from public.campaigns c 
      where c.id = campaign_id 
      and c.workspace_id = auth.uid()
    )
  );

create policy "campaign_email_templates_delete_workspace" on public.campaign_email_templates
  for delete using (
    exists (
      select 1 from public.campaigns c 
      where c.id = campaign_id 
      and c.workspace_id = auth.uid()
    )
  );

-- Add updated_at trigger
create trigger trg_campaign_email_templates_updated_at
  before update on public.campaign_email_templates
  for each row
  execute function public.touch_updated_at();
