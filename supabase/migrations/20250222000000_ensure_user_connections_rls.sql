-- Ensure RLS is enabled and owner-only read policy exists for user_connections
-- This ensures server routes can safely read user's Gmail OAuth tokens

alter table user_connections enable row level security;

-- Create owner-only read policy (drop if exists to make idempotent)
drop policy if exists "owner can read their connection" on user_connections;

create policy "owner can read their connection"
on user_connections for select
using ( user_id = auth.uid() );

