-- Create org_settings table
create table if not exists org_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  org_name text default 'My Organization',
  brand_color text default '#FFD700',
  logo_url text,
  default_sender_name text default 'SmartSend AI',
  default_sender_email text default 'noreply@smartsend.ai',
  api_key text,
  updated_at timestamptz default now()
);

-- Enable row level security
alter table org_settings enable row level security;

-- Create policy for all operations
create policy "allow all read insert update" on org_settings for all using (true) with check (true);

-- Create index on workspace_id for better performance
create index if not exists idx_org_settings_workspace_id on org_settings(workspace_id);