-- Block 8600 — SmartSend Template Engine v1
-- Adds custom_fields to leads and template_variables to campaigns

-- 1) Add custom_fields column to leads table
alter table public.leads
  add column if not exists custom_fields jsonb default '{}'::jsonb;

-- 2) Add template_variables column to campaigns table
alter table public.campaigns
  add column if not exists template_variables jsonb default '{}'::jsonb;

-- Create index on custom_fields for faster queries (GIN index for JSONB)
create index if not exists idx_leads_custom_fields on public.leads using gin (custom_fields);

-- Create index on template_variables for faster queries
create index if not exists idx_campaigns_template_variables on public.campaigns using gin (template_variables);


