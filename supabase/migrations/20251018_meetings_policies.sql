-- View own meetings (broad read for authenticated users; tighten as needed with owner columns)
drop policy if exists "Allow logged-in users to view own meetings" on public.meetings;

create policy "Allow logged-in users to view meetings"
on public.meetings
for select
to authenticated
using (true);

-- Block inserts/updates from client; only service role via API
revoke insert, update, delete on public.meetings from anon, authenticated;
