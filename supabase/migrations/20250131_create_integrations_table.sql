-- Create integrations table for storing webhook configurations
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.workspaces(id) on delete cascade,
  type text not null, -- zapier|slack|hubspot
  config jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create indexes
create index if not exists idx_integrations_org_id on public.integrations(org_id);
create index if not exists idx_integrations_type on public.integrations(type);

-- Add RLS policies
alter table public.integrations enable row level security;

-- Only workspace members can access their integrations
create policy "Users can view their workspace integrations" on public.integrations
  for select using (
    org_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
  );

create policy "Users can insert their workspace integrations" on public.integrations
  for insert with check (
    org_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
  );

create policy "Users can update their workspace integrations" on public.integrations
  for update using (
    org_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
  );

create policy "Users can delete their workspace integrations" on public.integrations
  for delete using (
    org_id in (
      select workspace_id from public.workspace_members where user_id = auth.uid()
    )
  );

-- Add updated_at trigger
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_integrations_updated_at
  before update on public.integrations
  for each row
  execute function update_updated_at_column(); 