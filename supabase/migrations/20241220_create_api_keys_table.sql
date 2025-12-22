-- Create API keys table
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  label text not null,
  api_key text not null,
  status text default 'active', -- active | revoked
  created_at timestamptz default now(),
  last_used_at timestamptz
);

-- Enable row level security
alter table api_keys enable row level security;

-- Create policy to allow all operations (you may want to restrict this based on your auth requirements)
create policy "allow all read insert update" on api_keys for all using (true) with check (true);

-- Add index for better performance
create index if not exists idx_api_keys_workspace_id on api_keys(workspace_id);
create index if not exists idx_api_keys_api_key on api_keys(api_key);