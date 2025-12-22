-- Update RLS policy name for gmail_connections to match requirements
-- Drop old policy and create new one

drop policy if exists "read gmail conn self" on public.gmail_connections;

create policy "read own gmail connection"
on public.gmail_connections for select
to authenticated
using (auth.uid() = user_id);

