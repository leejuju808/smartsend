-- Block 15400 — AI Personalization Engine v1
-- Local Roofing Openers + Industry Tone
-- "Damn, this feels written just for me" block

-- A. Expand workspace_profile with additional fields for personalization
alter table workspace_profile
  add column if not exists service_areas text[],          -- ['Tacoma', 'Spanaway', 'Puyallup']
  add column if not exists years_in_business int,
  add column if not exists license_number text,
  add column if not exists core_services text[],          -- ['roof replacement', 'storm damage', 'gutters']
  add column if not exists brand_tone text check (
    brand_tone in ('friendly', 'professional', 'direct', 'urgent')
  ) default 'friendly';

-- Update primary_city if it doesn't exist but service_area does (migrate from old format)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'workspace_profile'
    and column_name = 'service_area'
    and column_name != 'primary_city'
  ) then
    -- Try to extract primary city from service_area if primary_city is null
    update workspace_profile
    set primary_city = split_part(service_area, ',', 1)
    where primary_city is null and service_area is not null;
  end if;
end $$;

-- B. Create email_personalizations table for caching openers
create table if not exists email_personalizations (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  step_id uuid not null references campaign_steps(id) on delete cascade,
  opener text not null,            -- personalized intro lines
  created_at timestamptz default now(),
  unique (workspace_id, contact_id, campaign_id, step_id)
);

-- Indexes for performance
create index if not exists idx_email_personalizations_lookup 
  on email_personalizations(workspace_id, contact_id, campaign_id, step_id);
create index if not exists idx_email_personalizations_workspace 
  on email_personalizations(workspace_id);
create index if not exists idx_email_personalizations_contact 
  on email_personalizations(contact_id);

-- RLS Policies
alter table email_personalizations enable row level security;

-- Users can read personalizations for their workspace
create policy email_personalizations_select on email_personalizations
  for select
  to authenticated
  using (
    exists (
      select 1 from workspace_members
      where workspace_members.workspace_id = email_personalizations.workspace_id
      and workspace_members.user_id = auth.uid()
    )
  );

-- Users can insert/update personalizations for their workspace
create policy email_personalizations_insert on email_personalizations
  for insert
  to authenticated
  with check (
    exists (
      select 1 from workspace_members
      where workspace_members.workspace_id = email_personalizations.workspace_id
      and workspace_members.user_id = auth.uid()
    )
  );

create policy email_personalizations_update on email_personalizations
  for update
  to authenticated
  using (
    exists (
      select 1 from workspace_members
      where workspace_members.workspace_id = email_personalizations.workspace_id
      and workspace_members.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from workspace_members
      where workspace_members.workspace_id = email_personalizations.workspace_id
      and workspace_members.user_id = auth.uid()
    )
  );

-- C. Add AI personalization flags to campaign_steps
alter table campaign_steps
  add column if not exists ai_personalization_enabled boolean not null default false,
  add column if not exists ai_personalization_mode text check (
    ai_personalization_mode in ('opener_only')
  ) default 'opener_only';

-- Index for filtering steps with AI enabled
create index if not exists idx_campaign_steps_ai_enabled 
  on campaign_steps(campaign_id, ai_personalization_enabled) 
  where ai_personalization_enabled = true;

-- D. Add AI personalization usage tracking to workspaces (similar to email usage)
alter table workspaces
  add column if not exists ai_personalizations_this_period int not null default 0;

-- Create RPC function to atomically increment AI personalization usage
create or replace function increment_ai_personalization_usage(
  p_workspace_id uuid,
  p_increment int
)
returns void
language plpgsql
security definer
as $$
begin
  update public.workspaces
  set ai_personalizations_this_period = coalesce(ai_personalizations_this_period, 0) + p_increment
  where id = p_workspace_id;
end;
$$;

grant execute on function increment_ai_personalization_usage(uuid, int) to authenticated;

-- E. Ensure contacts table has lead_source and source_meta columns
alter table contacts
  add column if not exists lead_source text,
  add column if not exists source_meta jsonb default '{}'::jsonb;

-- Index for lead_source queries
create index if not exists idx_contacts_lead_source 
  on contacts(workspace_id, lead_source) 
  where lead_source is not null;

-- F. Add template_key to campaigns if it doesn't exist (for template type detection)
alter table campaigns
  add column if not exists template_key text;

-- Index for template_key queries
create index if not exists idx_campaigns_template_key 
  on campaigns(workspace_id, template_key) 
  where template_key is not null;



























































