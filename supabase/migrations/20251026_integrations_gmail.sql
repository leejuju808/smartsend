-- Gmail integration table for storing OAuth tokens and watch state
create table if not exists integrations_gmail (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  email text not null,
  access_token text not null,
  refresh_token text not null,
  expiry_date timestamptz,
  last_history_id text,
  watch_expiration timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists integrations_gmail_workspace_idx on integrations_gmail(workspace_id);
create index if not exists integrations_gmail_email_idx on integrations_gmail(email);