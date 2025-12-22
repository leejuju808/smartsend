-- Block 8580 — Sending Settings (From Name, From Email, Test Send)
-- One row per owner (or "workspace") storing sending identity

create table if not exists public.workspace_sending_settings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  from_name text not null,
  from_email text not null,
  reply_to_email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workspace_sending_settings_owner_id_idx
  on public.workspace_sending_settings(owner_id);

-- Enable RLS
alter table public.workspace_sending_settings enable row level security;

-- RLS Policy: Users can only access their own sending settings
create policy workspace_sending_settings_owner_access
  on public.workspace_sending_settings
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Create updated_at trigger function if it doesn't exist
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Create trigger for updated_at
drop trigger if exists trg_workspace_sending_settings_updated_at on public.workspace_sending_settings;
create trigger trg_workspace_sending_settings_updated_at
  before update on public.workspace_sending_settings
  for each row
  execute function public.set_updated_at();

























































