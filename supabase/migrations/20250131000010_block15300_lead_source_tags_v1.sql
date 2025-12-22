-- Block 15300 — Roofing Lead Source Tags v1
-- (Storm vs Insurance vs Retail → Auto-Tag Every Lead)
-- This block gives SmartSend true roofing intelligence.

-- ============================================
-- 1) Add Lead Source Columns to Contacts
-- ============================================

alter table public.contacts
  add column if not exists lead_source text check (
    lead_source in (
      'storm_outreach',
      'insurance_lead',
      'retail_lead',
      'past_customer',
      'quote_reactivation',
      'website_inquiry',
      'referral',
      'unknown'
    )
  ) default 'unknown';

alter table public.contacts
  add column if not exists source_meta jsonb default '{}'::jsonb;

-- Create index for fast filtering
create index if not exists idx_contacts_lead_source 
  on public.contacts(lead_source) 
  where lead_source is not null;

create index if not exists idx_contacts_source_meta 
  on public.contacts using gin(source_meta) 
  where source_meta is not null;

-- ============================================
-- 2) Add List Type Columns to Contact Lists
-- ============================================

alter table public.contact_lists
  add column if not exists list_type text check (
    list_type in (
      'storm',
      'past_customers',
      'reactivation',
      'general'
    )
  ) default 'general';

alter table public.contact_lists
  add column if not exists source_tag text;

-- Create index for fast filtering
create index if not exists idx_contact_lists_list_type 
  on public.contact_lists(list_type) 
  where list_type is not null;

-- ============================================
-- 3) Add Template Key to Campaigns Table
-- ============================================

alter table public.campaigns
  add column if not exists template_key text;

create index if not exists idx_campaigns_template_key 
  on public.campaigns(template_key) 
  where template_key is not null;

-- ============================================
-- 4) Comments
-- ============================================

comment on column public.contacts.lead_source is 'Auto-tagged lead source: storm_outreach, insurance_lead, retail_lead, past_customer, quote_reactivation, website_inquiry, referral, unknown';
comment on column public.contacts.source_meta is 'JSON metadata: campaign_id, template_key, list_name, zipcode, storm name, etc.';
comment on column public.contact_lists.list_type is 'Type of list: storm, past_customers, reactivation, general';
comment on column public.contact_lists.source_tag is 'Optional explanation/tag for the list (e.g., storm name)';
comment on column public.campaigns.template_key is 'Template key used to create this campaign (e.g., storm_damage, annual_inspection, reactivation)';

