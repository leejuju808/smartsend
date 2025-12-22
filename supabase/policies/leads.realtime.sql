-- Allow authenticated users in the same workspace to read leads
create policy "leads read in workspace"
on leads for select
using ( auth.uid() = workspace_owner OR auth.uid() = any(workspace_member_ids) );

-- Allow row updates only via server (service role) or workspace owners (optional)
create policy "leads update server only"
on leads for update
using ( auth.role() = 'service_role' or auth.uid() = workspace_owner )
with check ( true ); 