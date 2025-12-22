-- RLS policies for email_logs table
-- Ensures only service role can write, users can read their workspace data

-- Enable RLS if not already enabled
alter table public.email_logs enable row level security;

-- Drop existing policies if they exist to avoid conflicts
drop policy if exists "read logs in workspace" on public.email_logs;
drop policy if exists "service writes only" on public.email_logs;
drop policy if exists "service updates only" on public.email_logs;

-- Read policy: users can read their workspace's logs
-- This assumes workspace_id is set on email_logs and users have workspace membership
create policy "read logs in workspace"
on public.email_logs for select
using (
  workspace_id in (
    select workspace_id 
    from public.workspace_members 
    where user_id = auth.uid()
  )
);

-- Write policy: only service role (edge functions) can insert
create policy "service writes only"
on public.email_logs for insert
to service_role
with check (true);

-- Update policy: only service role (edge functions) can update
create policy "service updates only"
on public.email_logs for update
to service_role
using (true)
with check (true);

-- Grant necessary permissions to service_role
grant all on public.email_logs to service_role;
grant usage on schema public to service_role;