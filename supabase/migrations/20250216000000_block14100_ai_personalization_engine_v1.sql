-- Block 14100: AI Personalization Engine v1
-- Workspace Outreach Profile for AI-powered campaign personalization
-- Enables local references, roofing tone, and personalized copy

-- Workspace Profile Table
-- Stores company info that AI uses to personalize campaign copy
create table if not exists workspace_profile (
  id uuid primary key default uuid_generate_v4(),
  workspace_id uuid unique references workspaces(id) on delete cascade,
  
  company_name text,
  niche text default 'roofing',
  primary_city text,
  service_area text,        -- e.g. "Tacoma, Spanaway, Lakewood"
  typical_job_types text,   -- e.g. "storm damage repair, full replacements, leak repair"
  avg_job_value numeric,    -- estimate, helps tone
  tone_style text,          -- 'direct', 'friendly', 'premium', etc.
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index if not exists idx_workspace_profile_workspace on workspace_profile(workspace_id);

-- RLS Policies
alter table workspace_profile enable row level security;

-- Users can read their workspace's profile
create policy workspace_profile_select on workspace_profile
  for select
  to authenticated
  using (
    exists (
      select 1 from workspace_members
      where workspace_members.workspace_id = workspace_profile.workspace_id
      and workspace_members.user_id = auth.uid()
    )
  );

-- Users can insert/update their workspace's profile
create policy workspace_profile_insert on workspace_profile
  for insert
  to authenticated
  with check (
    exists (
      select 1 from workspace_members
      where workspace_members.workspace_id = workspace_profile.workspace_id
      and workspace_members.user_id = auth.uid()
    )
  );

create policy workspace_profile_update on workspace_profile
  for update
  to authenticated
  using (
    exists (
      select 1 from workspace_members
      where workspace_members.workspace_id = workspace_profile.workspace_id
      and workspace_members.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from workspace_members
      where workspace_members.workspace_id = workspace_profile.workspace_id
      and workspace_members.user_id = auth.uid()
    )
  );

-- Trigger to update updated_at timestamp
create or replace function update_workspace_profile_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger workspace_profile_updated_at
  before update on workspace_profile
  for each row
  execute function update_workspace_profile_updated_at();



























































